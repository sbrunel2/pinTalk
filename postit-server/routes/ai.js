// routes/ai.js
// Routes IA : extraction multi-items (Gemini) + dictionnaire personnel
const express = require('express');
const router  = express.Router();
const { authenticateToken } = require('../helpers/auth');
const {
    _aiExtractLock, _normalizePhraseKey,
    _isDictionaryAdmin, _resolveUserLang,
    _refreshAiDictionaryCache, _ensureAiDictionaryCacheFresh,
    _normalizeTextWithAiDictionary, _aiDictCache,
    _isQuestion, _isHardNegation, _fallbackExtract,
    _cleanExtractedItemText, _normalizeProductKey, _isLikelyProductText,
    _mergeStandaloneQuantities,
} = require('../helpers/ai');
const { AiDictionaryEntry } = require('../models');

// ── Cache résultats Gemini (TTL 30min, max 500 entrées) ───────────────────────
const _geminiCache  = new Map();
const _CACHE_TTL_MS = 30 * 60 * 1000;

function _cacheKey(text, lang) {
    return lang + '::' + text.toLowerCase().replace(/\s+/g, ' ').trim();
}
function _cacheGet(text, lang) {
    const e = _geminiCache.get(_cacheKey(text, lang));
    if (!e) return null;
    if (Date.now() > e.expiresAt) { _geminiCache.delete(_cacheKey(text, lang)); return null; }
    return e.result;
}
function _cacheSet(text, lang, result) {
    if (_geminiCache.size >= 500) _geminiCache.delete(_geminiCache.keys().next().value);
    _geminiCache.set(_cacheKey(text, lang), { result, expiresAt: Date.now() + _CACHE_TTL_MS });
}

// ── Rate-limiter simple ───────────────────────────────────────────────────────
// IMPORTANT : pas de flag booléen permanent — le blocage expire via timestamp
// _geminiBlockedUntil = 0 → pas bloqué ; > Date.now() → bloqué
const _GEMINI_MIN_INTERVAL_MS = parseInt(process.env.GEMINI_MIN_INTERVAL_MS || '2500'); // flash-lite: 30 RPM
let   _lastGeminiCallAt    = 0;
let   _geminiBlockedUntil  = 0;
let   _geminiConsecutive429 = 0;

function _isGeminiBlocked() {
    if (_geminiBlockedUntil === 0) return false;
    if (Date.now() >= _geminiBlockedUntil) {
        _geminiBlockedUntil = 0; // expiration automatique
        _geminiConsecutive429 = 0;
        console.log('[Gemini] ✅ Blocage expiré — Gemini disponible');
        return false;
    }
    return true;
}

function _blockGemini(seconds) {
    _geminiBlockedUntil = Date.now() + (seconds * 1000);
    const expireAt = new Date(_geminiBlockedUntil).toLocaleTimeString('fr-FR');
    console.warn(`[Gemini] ⏳ Bloqué ${seconds}s — déblocage à ${expireAt}`);
}

async function _respectRateLimit() {
    const waited = Date.now() - _lastGeminiCallAt;
    const delay  = Math.max(0, _GEMINI_MIN_INTERVAL_MS - waited);
    if (delay > 0) {
        console.log(`[Gemini] Rate-limit attente ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
    }
    _lastGeminiCallAt = Date.now();
}


// ── Extraction multi-items via Gemini ─────────────────────────────────────────
router.post('/extract-multi', authenticateToken, async (req, res) => {
    try {
        const { text: rawText, sourceMessageId } = req.body;
        if (!rawText || rawText.trim().length < 2) {
            return res.json({ items: [], source: 'empty', understood: true });
        }

        const userEmail = req.user?.email || '';
        const lang      = await _resolveUserLang(userEmail);

        if (sourceMessageId && _aiExtractLock.has(sourceMessageId)) {
            // Si forceReanalyze=true (message modifié) → libérer le verrou et continuer
            if (req.body.forceReanalyze) {
                console.log('[AI] Ré-analyse forcée (message modifié):', sourceMessageId);
                _aiExtractLock.delete(sourceMessageId);
            } else {
                console.log('[AI] Déjà en cours ou récemment traité:', sourceMessageId);
                return res.json({ items: [], source: 'locked', understood: true });
            }
        }
        if (sourceMessageId) {
            _aiExtractLock.add(sourceMessageId);
            // Libérer le verrou après 10 minutes max (garde-fou)
            setTimeout(() => _aiExtractLock.delete(sourceMessageId), 10 * 60 * 1000);
        }

        try {
            const normalizedText = await _normalizeTextWithAiDictionary(rawText.trim(), userEmail, lang);
            const isQuestion     = _isQuestion(normalizedText);
            const isHardNeg      = _isHardNegation(normalizedText);

            if (isHardNeg && !isQuestion) {
                return res.json({ items: [], source: 'hard-negation', understood: true });
            }

            const geminiKey   = process.env.GEMINI_API_KEY;
            const geminiModel = process.env.GEMINI_MODEL; // absent = fallback NLP uniquement
            let source = 'gemini';
            let geminiUnderstood = true; // ce que Gemini a déclaré

            if (geminiKey && geminiModel) {
                // 1. Cache
                const cached = _cacheGet(normalizedText, lang);
                if (cached) {
                    console.log('[Gemini] Cache hit');
                    geminiItems      = cached.items;
                    geminiUnderstood = cached.understood;
                    source           = 'gemini-cache';
                } else if (_isGeminiBlocked()) {
                    const remaining = Math.ceil((_geminiBlockedUntil - Date.now()) / 1000);
                    console.warn(`[Gemini] ⏳ Bloqué encore ${remaining}s — appel annulé pour : "${normalizedText.substring(0,40)}"`);
                    geminiItems = null;
                } else {
                    // Appel Gemini avec délai minimum entre requêtes
                    await _respectRateLimit();
                    const result = await _callGeminiWithMeta(normalizedText, lang, geminiKey);
                    geminiItems      = result.items;
                    geminiUnderstood = result.understood;
                    source           = result.source;
                    // Mettre en cache si réponse valide
                    if (geminiItems !== null) {
                        _cacheSet(normalizedText, lang, { items: geminiItems, understood: geminiUnderstood });
                    }
                }
            }

            // Gemini indisponible (null = erreur réseau/timeout/quota)
            if (geminiItems === null) {
                // Fallback NLP : extraction par règles (Gemini indisponible/quota)
                const fallbackRaw   = _fallbackExtract(normalizedText) || [];
                const fallbackItems = fallbackRaw
                    .map(t => ({
                        text    : _cleanExtractedItemText(String(t).replace(/^__WORD__/, '')),
                        uncertain: isQuestion,
                    }))
                    .filter(item =>
                        item.text && item.text.length >= 2 &&
                        _isLikelyProductText(item.text) &&
                        _isDefinitelyAProduct(item.text)
                    );

                if (fallbackItems.length === 0) {
                    const isPureConv = _isLikelyPureConversation(normalizedText);
                    console.log(`[AI] Fallback NLP — aucun produit extrait de "${normalizedText.substring(0,50)}" | conversation:${isPureConv}`);
                    return res.json({ items: [], source: 'fallback-empty', understood: isPureConv });
                }
                console.log(`[AI] Fallback NLP — ${fallbackItems.length} produit(s) : [${fallbackItems.map(i=>i.text).join(', ')}]`);
                return res.json({ items: fallbackItems, source: 'fallback-nlp', understood: true });
            }

            // Post-traitement : nettoyage + filtre de sécurité
            // (au cas où Gemini retournerait quand même des mots grammaticaux)
            let items = geminiItems
                .map(item => {
                    const raw  = typeof item === 'string' ? item : (item?.text || '');
                    const text = _cleanExtractedItemText(raw);
                    const uncertain = typeof item === 'object' ? !!item.uncertain : false;
                    return { text, uncertain: uncertain || isQuestion };
                })
                .filter(item => {
                    if (!item.text || item.text.length < 2) return false;
                    // Filtre de sécurité : rejeter les mots clairement non-produits
                    // même si Gemini les a retournés (cas de régression)
                    return _isDefinitelyAProduct(item.text);
                });

            items = _mergeStandaloneQuantities(items);

            const seen = new Set();
            items = items.filter(item => {
                const k = _normalizeProductKey(item.text);
                if (!k || seen.has(k)) return false;
                seen.add(k);
                return true;
            });

            // understood = ce que Gemini a déclaré, affiné par le résultat réel
            const understood = items.length > 0
                ? true
                : (geminiUnderstood ? _isLikelyPureConversation(normalizedText) : false);

            return res.json({ items, source, understood });

        } finally {
            if (sourceMessageId) _aiExtractLock.delete(sourceMessageId);
        }

    } catch (err) {
        console.error('[AI extract-multi]', err.message);
        res.status(500).json({ items: [], source: 'error', understood: false, error: err.message });
    }
});

// ── Appel Gemini 2.0 Flash ────────────────────────────────────────────────────
// Retourne { items, understood, source }
// items = null si erreur réseau/timeout (pas de réponse du tout)
// items = [] si Gemini répond mais ne trouve aucun produit
async function _callGeminiWithMeta(text, lang, apiKey) {
    const UNAVAILABLE = { items: null, understood: true, source: 'gemini-error' };
    const langLabel = { fr:'français', en:'english', es:'español', de:'Deutsch', it:'italiano' }[lang] || 'français';

    const systemInstruction = `Extracteur de produits pour listes de courses/commandes. Langue: ${langLabel}.
RÈGLES : (1) Retourner UNIQUEMENT les noms de produits réels du message — jamais les verbes, pronoms, mots interrogatifs, articles seuls. (2) Comprendre le sens global : "je vais prendre du pain" → produit="pain". (3) Mots composés groupés : "steak haché" → UN item. (4) Doute/question/conditionnel → uncertain=true. (5) Négation ferme → ne pas inclure le produit. (6) Aucun produit identifiable → items=[] understood=false.
FORMAT JSON strict : {"items":[{"text":"produit","uncertain":false}],"understood":true}`;

    const fewShots = [
        { role:'user',  parts:[{text:'il me faut du pain, des oeufs et du beurre'}] },
        { role:'model', parts:[{text:'{"items":[{"text":"pain","uncertain":false},{"text":"oeufs","uncertain":false},{"text":"beurre","uncertain":false}],"understood":true}'}] },
        { role:'user',  parts:[{text:'je vais prendre du lait'}] },
        { role:'model', parts:[{text:'{"items":[{"text":"lait","uncertain":false}],"understood":true}'}] },
        { role:'user',  parts:[{text:"pourquoi pas prendre du pain et est-ce qu il faut des yaourts ?"}] },
        { role:'model', parts:[{text:'{"items":[{"text":"pain","uncertain":true},{"text":"yaourts","uncertain":true}],"understood":true}'}] },
        { role:'user',  parts:[{text:'il ne faudrait pas du jambon ?'}] },
        { role:'model', parts:[{text:'{"items":[{"text":"jambon","uncertain":true}],"understood":true}'}] },
        { role:'user',  parts:[{text:'des steaks haches et des pommes de terre stp'}] },
        { role:'model', parts:[{text:'{"items":[{"text":"steaks haches","uncertain":false},{"text":"pommes de terre","uncertain":false}],"understood":true}'}] },
        { role:'user',  parts:[{text:'non pas de lardons'}] },
        { role:'model', parts:[{text:'{"items":[],"understood":true}'}] },
        { role:'user',  parts:[{text:'2 kg de tomates et 500g de farine'}] },
        { role:'model', parts:[{text:'{"items":[{"text":"2 kg tomates","uncertain":false},{"text":"500g farine","uncertain":false}],"understood":true}'}] },
        { role:'user',  parts:[{text:'bonjour je serai la a 18h ok merci'}] },
        { role:'model', parts:[{text:'{"items":[],"understood":false}'}] },
    ];

    const body = {
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: [...fewShots, { role: 'user', parts: [{ text }] }]
    };

    // Modèle et endpoint 100% pilotés par .env — aucune valeur codée en dur
    // Si GEMINI_MODEL absent → l'appelant (extract-multi) ne fera pas appel à cette fonction
    const model       = process.env.GEMINI_MODEL;
    const apiEndpoint = process.env.GEMINI_API_ENDPOINT
                        || 'https://generativelanguage.googleapis.com/v1beta';
    const url = `${apiEndpoint}/models/${model}:generateContent?key=${apiKey}`;

    const _traceId = Date.now().toString(36).slice(-4).toUpperCase();
    console.log(`[Gemini→] #${_traceId} "${text.substring(0,60)}" | model:${model} | lang:${lang}`);

    try {
        const resp = await fetch(url, {
            method : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body   : JSON.stringify(body),
            signal : AbortSignal.timeout(8000),
        });

        console.log(`[Gemini←] #${_traceId} HTTP ${resp.status} (${resp.headers?.get('content-type')||'?'})`);

        if (!resp.ok) {
            const errBody = await resp.json().catch(() => ({}));

            if (resp.status === 429) {
                _geminiConsecutive429++;
                const details      = errBody?.error?.details || [];
                const errMsg       = errBody?.error?.message || '';
                const quotaMetrics = details.filter(d => d.violations)
                    .flatMap(d => d.violations || [])
                    .map(v => v.quotaId || v.quotaMetric || '?').join(', ');
                console.warn(`[Gemini←] #${_traceId} 429 — métriques: ${quotaMetrics || 'inconnues'}`);
                console.warn(`[Gemini←] #${_traceId} 429 — message: ${errMsg.substring(0, 200)}`);
                const retryInfo = details.find(d => d['@type'] && d['@type'].includes('RetryInfo'));
                const rawDelay  = retryInfo?.retryDelay || '0s';
                const delaySec  = Math.ceil(parseFloat(rawDelay) || 0);
                const hasPerDay = details.some(d => d.violations && d.violations.some(v => v.quotaId && v.quotaId.includes('PerDay')));
                const isExplicitlyDaily = hasPerDay && delaySec > 60;
                const pauseSec = Math.min(120, Math.max(15, delaySec + 2));
                console.warn(`[Gemini←] #${_traceId} 429 — ${isExplicitlyDaily?'quota/JOUR':'quota/minute'} — pause ${pauseSec}s | retryDelay: "${rawDelay}"`);
                _blockGemini(pauseSec);
            } else {
                console.warn(`[Gemini←] #${_traceId} HTTP ${resp.status} — ${JSON.stringify(errBody).substring(0,200)}`);
            }
            return UNAVAILABLE;
        }

        _geminiConsecutive429 = 0;

        const data = await resp.json();
        const raw  = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (!raw) {
            console.warn(`[Gemini←] #${_traceId} Réponse vide`);
            return UNAVAILABLE;
        }

        let parsed;
        try {
            const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
            parsed = JSON.parse(clean);
        } catch (e) {
            console.warn(`[Gemini←] #${_traceId} Parse JSON error: ${e.message} | raw: ${raw.substring(0,100)}`);
            return UNAVAILABLE;
        }

        if (!Array.isArray(parsed?.items)) {
            console.warn(`[Gemini←] #${_traceId} Structure inattendue:`, JSON.stringify(parsed).substring(0,100));
            return UNAVAILABLE;
        }

        const items = parsed.items
            .filter(i => i && typeof i.text === 'string' && i.text.trim().length > 0)
            .map(i => ({ text: i.text.trim(), uncertain: !!i.uncertain }));

        const understood = parsed.understood !== false;
        console.log(`[Gemini←] #${_traceId} Succès → ${items.length} produit(s) : [${items.map(i=>i.text).join(', ')}] | understood:${understood}`);
        return { items, understood, source: 'gemini' };

    } catch (err) {
        if (err.name === 'TimeoutError') console.warn(`[Gemini←] #${_traceId} TIMEOUT (8s)`);
        else console.warn(`[Gemini←] #${_traceId} ERREUR réseau : ${err.message}`);
        return UNAVAILABLE;
    }
}

// ── Heuristique conversation pure ─────────────────────────────────────────────
function _isLikelyPureConversation(text) {
    const t = String(text || '').toLowerCase().trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (!t) return true;
    // Salutations et réponses courtes explicites
    if (/^(bonjour|bonsoir|salut|coucou|hello|hi|hey|ok|oui|non|merci|super|parfait|d.accord|vu|yes|no|yep|nope|ca marche|nickel|top|cool|ok merci|a bientot|a plus|bonne journee|bonne soiree|bisous|bises|a tout|a toute|on se voit|a demain)[\s!.,?]*$/i.test(t)) return true;
    // Tokens purement temporels / numériques → pas des produits
    // ex: "18h", "14h30", "lundi", "demain", "2024"
    const reTime = /^\d{1,2}h\d{0,2}$|^\d{4}$|^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|demain|aujourd|hier|matin|soir|midi|minuit|semaine|mois|janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)$/;
    // Phrases dont tous les tokens non-triviaux sont grammaticaux ou temporels
    const tokens = t.split(/\s+/).filter(w => w.length > 2 &&
        !reTime.test(w) &&
        !/^(je|tu|il|elle|on|nous|vous|ils|que|qui|dont|ou|et|mais|donc|or|ni|car|si|de|du|des|le|la|les|un|une|est|sont|suis|va|vais|sera|serai|pas|par|pour|sur|sous|avec|sans|dans|vers|chez|lors|puis|aussi|tres|plus|bien|mal|tout|tous|cette|cet|ces|mon|ton|son|nos|vos|ses|moi|toi|lui|eux|elles|etre|avoir|faire|aller|venir|voir|savoir|falloir|vouloir|pouvoir|devoir)$/.test(w));
    return tokens.length === 0;
}

// ── Filtre de sécurité post-Gemini ───────────────────────────────────────────
// Dernier rempart contre les mots grammaticaux que Gemini retournerait par erreur.
// Moins strict que _isLikelyProductText (helpers) car Gemini est déjà fiable,
// mais on rejette quand même les cas évidents.
function _isDefinitelyAProduct(text) {
    if (!text || text.trim().length < 2) return false;
    const t = text.trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/['']/g, ' ').replace(/[^a-z0-9\s-]/g, ' ')
        .replace(/\s+/g, ' ').trim();

    // Mots interrogatifs, pronoms, verbes, salutations → jamais un produit
    const neverProduct = new Set([
        'pourquoi','comment','quand','qui','que','quoi','dont','ou','combien',
        'lequel','laquelle','lesquels','lesquelles',
        'est','ce','qu','il','elle','on','nous','vous','ils','elles',
        'je','tu','me','te','se','y','en',
        'faut','faudrait','devrait','pourrait','serait','voudrait',
        'prendre','acheter','ajouter','ramener','mettre','faire','aller',
        'vais','vas','va','veux','veut','dois','doit','peux','peut',
        'pas','non','oui','ok','okay','ouais','yep','yes','nope','no',
        'merci','stp','svp','please',
        'de','du','des','le','la','les','un','une','et','ou','mais',
        // salutations et réponses conversationnelles
        'bonjour','bonsoir','salut','coucou','hello','hi','hey',
        'super','nickel','parfait','top','cool','vu',
    ]);

    // Rejet si c'est exactement un mot-interdit
    if (neverProduct.has(t)) return false;

    // Rejet si le texte est constitué UNIQUEMENT de mots interdits
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length > 0 && words.every(w => neverProduct.has(w))) return false;

    // Rejet si commence par un mot interrogatif ou pronom
    const firstWord = words[0] || '';
    const startsWithJunk = new Set(['pourquoi','comment','quand','est','ce','qu','il','elle','faut']);
    if (startsWithJunk.has(firstWord) && words.length <= 2) return false;

    // Nombre seul sans unité → pas un produit
    if (/^\d+$/.test(t)) return false;

    return true;
}

// ── Dictionnaire ──────────────────────────────────────────────────────────────

router.get('/dictionary', authenticateToken, async (req, res) => {
    try {
        await _ensureAiDictionaryCacheFresh();
        const userEmail = req.user.email.toLowerCase();
        const lang      = String(req.query.lang || 'fr').toLowerCase();
        const isAdmin   = _isDictionaryAdmin(userEmail);

        let entries = isAdmin
            ? await AiDictionaryEntry.find({ active: true }).lean()
            : await AiDictionaryEntry.find({ active: true, $or: [
                { scope: 'global' },
                { scope: 'user', ownerEmail: userEmail },
              ]}).lean();

        if (lang && lang !== 'all') {
            entries = entries.filter(e => !e.lang || e.lang === lang || e.lang === 'all');
        }

        res.json(entries.map(e => ({
            _id: e._id, phrase: e.phrase, normalized: e.normalized,
            lang: e.lang||'fr', category: e.category||'', scope: e.scope||'user',
            ownerEmail: e.ownerEmail||'', active: e.active,
        })));
    } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/dictionary', authenticateToken, async (req, res) => {
    try {
        const userEmail   = req.user.email.toLowerCase();
        const { phrase, lang, category, scope } = req.body;
        if (!phrase?.trim()) return res.status(400).json({ error: 'Phrase requise' });

        const normalized  = _normalizePhraseKey(phrase);
        if (!normalized) return res.status(400).json({ error: 'Phrase invalide' });

        const isAdmin     = _isDictionaryAdmin(userEmail);
        const finalScope  = (isAdmin && scope === 'global') ? 'global' : 'user';
        const finalLang   = String(lang || 'fr').toLowerCase();

        const existing = await AiDictionaryEntry.findOne({ normalized, lang: finalLang,
            $or: [{ scope:'global' }, { scope:'user', ownerEmail: userEmail }] });
        if (existing) return res.status(409).json({ error: 'Entrée déjà existante', entry: existing });

        const entry = new AiDictionaryEntry({
            phrase: phrase.trim(), normalized, lang: finalLang,
            category: (category||'').trim(), scope: finalScope,
            ownerEmail: finalScope === 'user' ? userEmail : '', active: true,
        });
        await entry.save();
        await _refreshAiDictionaryCache();

        console.log(`[AI dict] Ajout "${entry.phrase}" (${finalScope}) par ${userEmail}`);
        res.status(201).json({ _id: entry._id, phrase: entry.phrase, normalized: entry.normalized,
            lang: entry.lang, category: entry.category, scope: entry.scope });
    } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.delete('/dictionary/:id', authenticateToken, async (req, res) => {
    try {
        const userEmail = req.user.email.toLowerCase();
        const entry     = await AiDictionaryEntry.findById(req.params.id);
        if (!entry) return res.status(404).json({ error: 'Entrée introuvable' });
        if (!_isDictionaryAdmin(userEmail) && entry.ownerEmail !== userEmail)
            return res.status(403).json({ error: 'Accès refusé' });
        await AiDictionaryEntry.findByIdAndDelete(req.params.id);
        await _refreshAiDictionaryCache();
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ── Route diagnostic (GET /api/ai/status) ────────────────────────────────────
// Affiche l'état actuel du rate-limiter Gemini sans authentification obligatoire
// (protégé par authenticateToken en production)
router.get('/status', authenticateToken, (req, res) => {
    const now       = Date.now();
    const blocked   = _isGeminiBlocked();
    const remaining = blocked ? Math.ceil((_geminiBlockedUntil - now) / 1000) : 0;
    const lastCall  = _lastGeminiCallAt
        ? `${Math.ceil((now - _lastGeminiCallAt)/1000)}s ago`
        : 'jamais';
    const cacheSize = _geminiCache?.size || 0;

    res.json({
        gemini: {
            blocked,
            blockedUntil    : blocked ? new Date(_geminiBlockedUntil).toISOString() : null,
            remainingSeconds: remaining,
            consecutive429  : _geminiConsecutive429,
            lastCallAgo     : lastCall,
            apiKeyConfigured: !!process.env.GEMINI_API_KEY,
        },
        cache: {
            size   : cacheSize,
            ttlMin : 30,
        },
    });
});

module.exports = router;
