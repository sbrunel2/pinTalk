// helpers/ai.js
// Helpers NLP/IA côté serveur : extraction d'items, dictionnaire, cache.
// Partagé par routes/ai.js uniquement.

const { AiDictionaryEntry, User } = require('../models');

// ── Cache dictionnaire IA ─────────────────────────────────────────────────────
const _aiDictCache = { loadedAt: 0, entries: [], byUser: new Map(), byLang: new Map() };
const _AI_DICT_CACHE_TTL_MS = 60 * 1000;
const _AI_DICTIONARY_ADMIN_EMAILS = (process.env.AI_DICTIONARY_ADMIN_EMAILS || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

const _baseProtectedCompoundPhrases = [
    'sacs poubelle', 'sacs en plastique', 'pommes de terre',
    'gigot d agneau', 'cote de boeuf', 'cote de porc', 'escalope de veau',
    'papier toilette', 'papier essuie tout', 'huile d olive', 'lait de coco',
    'beurre de cacahuete', 'creme fraiche', 'jus d orange',
    'liquide vaisselle', 'gel douche', 'champignons de paris',
    'coquilles saint jacques', 'balais essuie glace', 'huile moteur',
    'liquide de refroidissement', 'liquide de frein', 'filtre a huile',
    'filtre a air', 'plaquettes de frein', 'papier de verre', 'laine de roche'
];

// ── Verrou anti-doublon extraction ───────────────────────────────────────────
const _aiExtractLock = new Set();

// ── Helpers normalisation/regex ───────────────────────────────────────────────
function _normalizePhraseKey(text) {
    return String(text || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/['']/g, ' ').replace(/[^a-zA-Z0-9\s-]/g, ' ')
        .replace(/\s+/g, ' ').trim().toLowerCase();
}

function _escapeRegexLiteral(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function _accentInsensitiveCharClass(ch) {
    const map = { a:'[aàáâäãå]', c:'[cç]', e:'[eèéêë]', i:'[iìíîï]', o:'[oòóôöõ]', u:'[uùúûü]', y:'[yÿ]' };
    return map[ch] || _escapeRegexLiteral(ch);
}

function _tokenToFlexibleRegex(token) {
    const t = String(token || '').trim().toLowerCase();
    if (!t) return '';
    const stop = /^(de|du|des|la|le|les|a|au|aux|en|d)$/;
    const chars = t.split('').map(_accentInsensitiveCharClass).join('');
    if (stop.test(t)) return chars;
    if (t.endsWith('eau')) { const s = t.slice(0,-3).split('').map(_accentInsensitiveCharClass).join(''); return `${s}eau(?:x)?`; }
    if (t.endsWith('al'))  { const s = t.slice(0,-2).split('').map(_accentInsensitiveCharClass).join(''); return `${s}(?:al|aux)`; }
    if (t.endsWith('ail')) { const s = t.slice(0,-3).split('').map(_accentInsensitiveCharClass).join(''); return `${s}(?:ail|aux|ails)`; }
    if (t.endsWith('s')) return `${chars}?`;
    return `${chars}s?`;
}

function _compileDictionaryPhraseRegex(phrase) {
    const key = _normalizePhraseKey(phrase);
    if (!key) return null;
    const tokens = key.split(/\s+/).filter(Boolean);
    if (!tokens.length) return null;
    const joiner = "(?:[\\s-]+|[''])";
    const pattern = tokens.map(_tokenToFlexibleRegex).join(joiner);
    return new RegExp(`\\b${pattern}\\b`, 'gi');
}

function _isDictionaryAdmin(email) {
    return !!String(email || '').trim().toLowerCase() &&
        _AI_DICTIONARY_ADMIN_EMAILS.includes(String(email || '').trim().toLowerCase());
}

async function _resolveUserLang(email) {
    const safe = String(email || '').toLowerCase();
    if (!safe) return 'fr';
    try {
        const u = await User.findOne({ email: safe }).select('lang').lean();
        return String(u?.lang || 'fr').toLowerCase();
    } catch { return 'fr'; }
}

async function _refreshAiDictionaryCache() {
    const rows = await AiDictionaryEntry.find({ active: true }).lean();
    const byUser = new Map(), byLang = new Map(), entries = [];
    for (const row of rows) {
        const regex = _compileDictionaryPhraseRegex(row.phrase || row.normalized);
        if (!regex) continue;
        const rec = { id: String(row._id), phrase: row.phrase, normalized: row.normalized,
            lang: String(row.lang || 'fr').toLowerCase(), category: row.category || '',
            scope: row.scope || 'user', ownerEmail: (row.ownerEmail || '').toLowerCase(), regex };
        entries.push(rec);
        if (!byLang.has(rec.lang)) byLang.set(rec.lang, []);
        byLang.get(rec.lang).push(rec);
        if (rec.scope === 'user' && rec.ownerEmail) {
            if (!byUser.has(rec.ownerEmail)) byUser.set(rec.ownerEmail, []);
            byUser.get(rec.ownerEmail).push(rec);
        }
    }
    _aiDictCache.loadedAt = Date.now();
    _aiDictCache.entries = entries;
    _aiDictCache.byUser = byUser;
    _aiDictCache.byLang = byLang;
}

async function _ensureAiDictionaryCacheFresh() {
    if (!_aiDictCache.loadedAt || (Date.now() - _aiDictCache.loadedAt) > _AI_DICT_CACHE_TTL_MS) {
        try { await _refreshAiDictionaryCache(); } catch(e) { console.warn('[AI-DICT] Cache refresh:', e.message); }
    }
}

async function _normalizeTextWithAiDictionary(text, userEmail, lang = 'fr') {
    let out = String(text || '');
    if (!out) return out;
    await _ensureAiDictionaryCacheFresh();
    const targetLang = String(lang || 'fr').toLowerCase();
    const allRecords = [];
    if (targetLang.startsWith('fr')) {
        for (const phrase of _baseProtectedCompoundPhrases) {
            const regex = _compileDictionaryPhraseRegex(phrase);
            if (regex) allRecords.push({ regex, normalized: phrase });
        }
    }
    const langEntries = _aiDictCache.byLang?.get(targetLang) || [];
    const allLangEntries = _aiDictCache.byLang?.get('all') || [];
    allRecords.push(...langEntries.filter(e => e.scope === 'global'));
    allRecords.push(...allLangEntries.filter(e => e.scope === 'global'));
    const mail = String(userEmail || '').toLowerCase();
    if (mail && _aiDictCache.byUser.has(mail)) {
        allRecords.push(...(_aiDictCache.byUser.get(mail).filter(e => e.lang === targetLang || e.lang === 'all')));
    }
    allRecords.sort((a, b) => (b.normalized || '').length - (a.normalized || '').length);
    for (const rec of allRecords) out = out.replace(rec.regex, m => m.replace(/[\s-]+/g, '-'));
    return out;
}

// ── Helpers extraction ────────────────────────────────────────────────────────
function _isQuestion(text) {
    const t = String(text || '').trim();
    if (!t) return false;
    if (t.includes('?')) return true;
    if (/\best[\s-]*ce\s+qu/i.test(t)) return true;
    if (/\ba[\s-]*t[\s-]*on\s+besoin\b/i.test(t)) return true;
    if (/\bon\s+a\s+besoin\b/i.test(t)) return true;
    if (/\bbesoin\s+de\b/i.test(t)) return true;
    if (/\b(?:ne\s+)?faudrait(?:[\s-]*(?:il|on|pas))?\b/i.test(t)) return true;
    if (/\bdevrait(?:[\s-]*(?:on|pas))?\b/i.test(t)) return true;
    if (/\bpourrait(?:[\s-]*(?:on|pas))?\b/i.test(t)) return true;
    if (/\bserait(?:[\s-]*(?:il|on|pas))?\b/i.test(t)) return true;
    if (/\bpeut[\s-]*[eê]tre\b/i.test(t)) return true;
    return false;
}

function _isHardNegation(text) {
    const t = String(text || '').toLowerCase().trim();
    if (!t) return false;
    if (/\boui\b/.test(t)) return false;
    if (/^non\b/.test(t)) return true;
    if (/\bpas\s+(?:du|de|d['']|des|le|la|les|un|une)\b/.test(t) && !/\b(?:faudrait|devrait|pourrait|serait)\b/.test(t)) return true;
    if (/\b(?:ne|n[''])\s+.*\s+pas\b/.test(t) && !/\b(?:faudrait|devrait|pourrait|serait)\b/.test(t)) return true;
    if (/\b(?:plus|jamais)\b/.test(t) && /\b(?:prendre|acheter|mettre|ajouter)\b/.test(t)) return true;
    return false;
}

function _splitByArticles(text) {
    text = text.replace(/\bEt\b/g,'et').replace(/\bET\b/g,'et');
    text = text.replace(/(\d+[.,]?\d*)\s+(g|gr|kg|ml|cl|dl|l)\b/gi, '$1$2');
    const nombresEcrits  = /^(deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|quinze|vingt)$/i;
    const unitesSolo     = /^(g|kg|ml|l|cl|dl|gr)$/i;
    const quantiteCollée = /^\d+[\.,]?\d*\s*(g|gr|kg|ml|cl|dl|l)$/i;
    const contenants     = /^(paquet|paquets|brique|briques|bouteille|bouteilles|bo[iî]te|bo[iî]tes|filet|filets|tranche|tranches|part|parts|pot|pots|barquette|barquettes|sachet|sachets|carton|cartons|pack|packs|c[oô]te|cotes|escalope|escalopes|r[oô]ti|rotis|morceau|morceaux|litre|litres|botte|bottes|flacon|flacons|tablette|tablettes|plaquette|plaquettes|tube|tubes|boule|boules|portion|portions|demi|quart|quarts|bocal|bocaux|conserve|conserves|bouquet|bouquets|grappe|grappes|rouleau|rouleaux|bloc|blocs|dosette|dosettes|capsule|capsules|berlingot|berlingots|brick|bricks|paire|paires|dizaine|dizaines|douzaine|douzaines|centaine|centaines|kilo|kilos|livre|livres)$/i;
    const nomsComposes   = /^(veau|boeuf|b[oœ]uf|porc|poulet|poulets|agneau|saumon|thon|cabillaud|lieu|sole|dinde|canard|lapin|ail|blanc|blanche|cuisse|cuisses|filet|filets|escalope|escalopes|gigot|jarret|palette|travers)$/i;
    const articlesSimples= /^(de|du|des|le|la|les|un|une|et)$/i;

    let t = text.replace(/\bde\s+l['\u2019]/gi,'__ARTDEL__ ').replace(/\bde\s+la\b/gi,'__ARTDEL__A').replace(/\bde\s+les?\b/gi,'__ARTDLES__ ');
    const words = t.trim().split(/\s+/);
    const boundaries = new Set();

    for (let i = 1; i < words.length; i++) {
        const w    = words[i];
        const prev = words[i-1].toLowerCase();
        const next = (words[i+1] || '').toLowerCase();
        const prevIsUnit      = unitesSolo.test(prev) || quantiteCollée.test(prev);
        const prevIsContenant = contenants.test(prev);
        const prevIsNombreEcrit = nombresEcrits.test(prev);
        const prevIsRealWord  = prev.length > 1 && !prevIsUnit && !prevIsContenant && !prevIsNombreEcrit
                                && !articlesSimples.test(prev) && !nomsComposes.test(prev) && !/^__ART/i.test(prev);
        const nextIsNum       = /^\d/.test(next) || unitesSolo.test(next);
        const adjectifs       = /^(hach[eé][es]?|r[aâ]p[eé][es]?|fum[eé][es]?|grill[eé][es]?|cuite?s?|crue?s?|frais|fra[iî]ches?|surgel[eé][es]?|entiers?|demi|[eé]minc[eé][es]?|tranch[eé][es]?|assaisonn[eé][es]?|sal[eé][es]?|sucr[eé][es]?|petits?|grands?|fins?|gros|grosses?|bio|nature|light|rouge|blanc|blanche|noir|noire|vert|verte|jaune|dur[es]?|sec|s[eè]ches?|chaud[es]?|froid[es]?|ti[eè]des?|maigres?|gras|grasse|tendre|tendres?|moelleux|extra|double|triple)$/i;
        const isNewItem =
            (/^\d/.test(w) && !['de','du','des','la','le','les','et','un','une'].includes(prev)) ||
            (nombresEcrits.test(w) && !['de','du','des','et'].includes(prev)) ||
            (/^(un|une)$/i.test(w) && prevIsRealWord) || /^(Un|Une)$/.test(w) ||
            (/^(du|des|le|la|les)$/i.test(w) && !prevIsContenant) ||
            (/^__ART/i.test(w) && !prevIsContenant) ||
            (/^de$/i.test(w) && !prevIsUnit && !prevIsContenant && !quantiteCollée.test(prev) && !nomsComposes.test(next) && !nextIsNum) ||
            /^et$/i.test(w) ||
            (prevIsRealWord && !adjectifs.test(w) && !unitesSolo.test(w) && !nomsComposes.test(w) && !/^\d/.test(w) && !/^__ART/i.test(w) && !/^[àa]$/i.test(w));
        if (isNewItem) boundaries.add(i);
    }
    const items = []; let start = 0;
    const bArr = [...boundaries].sort((a,b) => a-b);
    for (const b of bArr) {
        const seg = words.slice(start,b).filter(w => !/^et$/i.test(w)).join(' ').trim();
        if (seg.length > 1) items.push(seg);
        start = b;
    }
    const last = words.slice(start).filter(w => !/^et$/i.test(w)).join(' ').trim();
    if (last.length > 1) items.push(last);
    const restore = s => s.replace(/__ARTDEL__A\s*/g,'de la ').replace(/__ARTDEL__\s*/g,"de l'").replace(/__ARTDLES__\s*/g,'des ').replace(/,\s*$/,'').replace(/\s+/g,' ').trim();
    const result = items.map(restore).filter(s => s.length > 1);
    return result.length > 1 ? result : null;
}

function _fallbackExtract(text) {
    text = text.replace(/(\d+[.,]?\d*)\s+(g|gr|kg|ml|cl|dl|l)\b/gi, '$1$2');
    const bySplit = _splitByArticles(text);
    if (bySplit && bySplit.length > 1) return bySplit;
    const byPunct = text.split(/(?<!\d),(?!\d)|;|\s+et\s+|\s+puis\s+|\s+aussi\s+/i)
        .map(s => s.replace(/^(pense\s+[aà]|il\s+faut|acheter|prendre|ramener|ajouter)\s+/i,'').replace(/[,;.!?]+$/,'').trim())
        .filter(s => s.length > 1);
    if (byPunct.length > 1) return byPunct;
    const hasArticleInside = /\b(de|du|des|de\s+la|de\s+l')\b/i.test(text);
    if (!hasArticleInside) {
        const words = text.trim().split(/\s+/).filter(w => w.length > 1);
        if (words.length > 1) return words.map(w => '__WORD__' + w);
    }
    return byPunct.length ? byPunct : [text.trim()];
}

function _cleanExtractedItemText(text) {
    if (!text) return '';
    let s = String(text);
    s = s
        .replace(/^[\-–—•]\s*/, '')        // tiret de puce en début seulement
        // ── CORRECTION : ne supprimer la numérotation QUE si suivie de . ou )
        // PAS d'espace seul — sinon "2 ballons" → "ballons", "3 escalopes" → "escalopes"
        // Avant : /^\d+[.)\s]\s*/  ← \s matche l'espace → supprime les quantités !
        // Après : /^\d+[.)]\s+/    ← seulement . ou ) suivis d'espace = vraie numérotation
        .replace(/^\d+[.)]\s+/, '')         // numérotation de liste : "1. item" ou "2) item"
        .replace(/^(?:oui|ok|okay|d['']accord|stp|svp|please)\s+/i, '')
        .replace(/^(?:est[\s-]*ce\s+que|est[\s-]*ce\s+qu['']|faut[\s-]*il|il\s+faut(?:rait)?|faudrait(?:[\s-]*il)?|devrait(?:[\s-]*on)?|pourrait(?:[\s-]*on)?|a[\s-]*t[\s-]*on\s+besoin\s+de|avons[\s-]*nous\s+besoin\s+de|dois[\s-]*je(?:\s+prendre)?|doit[\s-]*on(?:\s+prendre)?|je\s+dois(?:\s+prendre)?|n['']oublie\s+pas(?:\s+de)?|pense\s+[aà]|on\s+prend|prends?|prendre|acheter|ach[eè]te|ajouter|ajoute|ramener|ram[eè]ne)\s+/i, '')
        .replace(/\s+(?:stp|svp|please|merci)\s*$/i, '')
        .replace(/[.?!,;:]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return s;
}

// Affichage uniquement : convertit les tirets protecteurs en espaces
function _displayItemText(text) {
    if (!text) return '';
    return String(text).replace(/-+/g, ' ').replace(/\s+/g, ' ').trim();
}

function _normalizeProductKey(text) {
    return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/['']/g, ' ').replace(/[^a-z0-9\s-]/g, ' ')
        .replace(/^(du|de la|de l|des|de|le|la|les|un|une)\s+/i, '').replace(/\s+/g, ' ').trim();
}

function _isLikelyProductText(text) {
    if (!text) return false;
    const key = _normalizeProductKey(text);
    if (!key) return false;
    const words = key.split(/\s+/).filter(Boolean);
    if (!words.length) return false;

    const junk = new Set([
        'je','tu','il','elle','on','nous','vous','ils','elles','me','te','se','y','en',
        'suis','es','est','sommes','etes','sont',
        'ai','as','a','avons','avez','ont',
        'vais','vas','va','allons','allez','vont',
        'dois','doit','doivent','devons','devez',
        'peux','peut','pouvons','pouvez','peuvent',
        'fais','fait','faisons','faites','font',
        'prends','prend','prenons','prenez','prennent','prendre',
        'achete','achetons','achetez','achetent','acheter',
        'ajoute','ajoutons','ajoutez','ajoutent','ajouter',
        'ramene','ramenons','ramenez','ramenent','ramener',
        'mets','met','mettons','mettez','mettent','mettre',
        'veux','veut','voulons','voulez','veulent','vouloir',
        'sais','sait','savons','savez','savent',
        'faudrait','devrait','pourrait','voudrait','serait',
        'faut','doit','peut',
        'que','qui','quoi','dont','ou','et','mais','donc','or','ni','car',
        'si','comme','quand','lorsque','puisque',
        'oui','non','ok','okay','ouais','nope','yep','yes','no',
        'bonjour','bonsoir','salut','coucou','hello','hi','hey',
        'merci','stp','svp','please','super','nickel','parfait','top','cool',
        'vu','ok merci','bonne journee','bonne soiree','a bientot','a plus',
        'le','la','les','un','une','des','du','de',
        'deux','trois','quatre','cinq','six','sept','huit','neuf','dix',
        'onze','douze','quinze','vingt','trente','cent','mille',
    ]);

    if (junk.has(key)) return false;
    if (words.every(w => junk.has(w))) return false;
    if (/^(est ce|est ce que|ce que|que je|je dois|dois je|il faut|faut il|je vais|on va|il va|je veux|on veut)/.test(key)) return false;

    if (words.length === 1) {
        const w = words[0];
        if (/^\d+$/.test(w)) return false;
        if (/^\d+[\.,]?\d*(g|gr|kg|ml|cl|dl|l)$/i.test(w)) return true;
    }

    return true;
}

function _mergeStandaloneQuantities(items) {
    if (!Array.isArray(items) || items.length < 2) return items;
    const isQty = t => {
        const s = String(t || '').trim().toLowerCase();
        if (!s) return false;
        if (/^\d+$/.test(s)) return true;
        return new Set(['un','une','deux','trois','quatre','cinq','six','sept','huit','neuf','dix','onze','douze','quinze','vingt','cent']).has(s);
    };
    const out = [];
    for (let i = 0; i < items.length; i++) {
        const cur = items[i], next = items[i+1];
        if (cur && next && isQty(cur.text) && typeof next.text === 'string' && next.text.trim().length > 1) {
            out.push({ ...next, text: `${String(cur.text).trim()} ${String(next.text).trim()}` });
            i++;
        } else out.push(cur);
    }
    return out;
}

module.exports = {
    _aiDictCache, _aiExtractLock,
    _normalizePhraseKey, _compileDictionaryPhraseRegex,
    _isDictionaryAdmin, _resolveUserLang,
    _refreshAiDictionaryCache, _ensureAiDictionaryCacheFresh,
    _normalizeTextWithAiDictionary,
    _isQuestion, _isHardNegation, _splitByArticles, _fallbackExtract,
    _cleanExtractedItemText, _displayItemText, _normalizeProductKey, _isLikelyProductText,
    _mergeStandaloneQuantities,
};
