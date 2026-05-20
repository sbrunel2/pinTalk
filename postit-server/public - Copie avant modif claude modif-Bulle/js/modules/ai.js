// ── IA : extraire un item d'une bulle et l'ajouter au pintalk ───────────────
// Analyse IA automatique après envoi de message
// Extrait PLUSIEURS items et les ajoute ligne par ligne dans le pintalk
// Supprimer les notes IA liées à un message source (avant ré-analyse)
async function _deleteAiNotesForMessage(sourceMessageId, postitId) {
    // Priorité 1 : supprimer les notes liées par sourceMessageId exact
    // Ne dépend plus de sourceMsg dans allMsgs — fonctionne même si le parent
    // a déjà été retiré de allMsgs par le handler socket message-deleted
    let aiNotes = allMsgs.filter(m =>
        m.senderName === '✨ IA' &&
        m.sourceMessageId === sourceMessageId &&
        (!postitId || m.postitId === postitId)
    );

    // Priorité 2 : si aucune note liée par ID, chercher par postitId seul
    // (cas des vieux messages sans sourceMessageId renseigné)
    if (!aiNotes.length && postitId) {
        const sourceMsg = allMsgs.find(m => m._id === sourceMessageId);
        if (sourceMsg) {
            const sourceTime = new Date(sourceMsg.date).getTime();
            aiNotes = allMsgs.filter(m =>
                m.postitId === postitId &&
                m.senderName === '✨ IA' &&
                Math.abs(new Date(m.date).getTime() - sourceTime) < 10000
            );
        }
    }

    for (const note of aiNotes) {
        try {
            await fetchAuth('/api/messages/' + note._id, { method: 'DELETE' });
            allMsgs = allMsgs.filter(m => m._id !== note._id);
        } catch(e) {}
    }
}

let _currentSourceMsgId = null; // ID du message source en cours d'analyse

// Expressions composées connues qui sont parfois mal découpées en énumération.
const _aiProtectedCompounds = [
    { regex: /\bsacs?\s+poubelle(s)?\b/gi, toHyphen: true },
    { regex: /\bsacs?\s+en\s+plastique\b/gi, toHyphen: true },
    { regex: /\bpommes?\s+de\s+terre\b/gi, toHyphen: true },
    // Boucherie / pièces de viande (variantes fréquentes)
    { regex: /\bgigot\s+d['’]\s*agneau\b/gi, toHyphen: true },
    { regex: /\b(?:c[oô]te|c[oô]tes)\s+de\s+b[oœ]uf\b/gi, toHyphen: true },
    { regex: /\b(?:c[oô]te|c[oô]tes)\s+de\s+porc\b/gi, toHyphen: true },
    { regex: /\b(?:escalope|escaloppes?|escalopes?)\s+de\s+veau\b/gi, toHyphen: true },
    { regex: /\bfilet\s+de\s+b[oœ]uf\b/gi, toHyphen: true },
    { regex: /\bfilet\s+mignon\b/gi, toHyphen: true },
    { regex: /\bblanquette\s+de\s+veau\b/gi, toHyphen: true },
    { regex: /\bbourguignon\s+de\s+b[oœ]uf\b/gi, toHyphen: true },
    { regex: /\bjarret\s+de\s+veau\b/gi, toHyphen: true },
    { regex: /\bjarret\s+d['’]\s*agneau\b/gi, toHyphen: true },
    { regex: /\bpoitrine\s+de\s+veau\b/gi, toHyphen: true },
    { regex: /\bpoitrine\s+de\s+porc\b/gi, toHyphen: true },
    { regex: /\bepaule\s+d['’]\s*agneau\b/gi, toHyphen: true },
    { regex: /\b[eé]paule\s+d['’]\s*agneau\b/gi, toHyphen: true },
    { regex: /\bepaule\s+de\s+porc\b/gi, toHyphen: true },
    { regex: /\b[eé]paule\s+de\s+porc\b/gi, toHyphen: true },
    { regex: /\broti\s+de\s+porc\b/gi, toHyphen: true },
    { regex: /\br[oô]ti\s+de\s+porc\b/gi, toHyphen: true },
    { regex: /\br[oô]ti\s+de\s+veau\b/gi, toHyphen: true },
    { regex: /\br[oô]ti\s+de\s+b[oœ]uf\b/gi, toHyphen: true },
    { regex: /\bsteak\s+hach[eé]\b/gi, toHyphen: true },
    { regex: /\bviande\s+hach[eé]e?\b/gi, toHyphen: true },
    { regex: /\bsaucisse\s+de\s+toulouse\b/gi, toHyphen: true },
    { regex: /\bboudin\s+noir\b/gi, toHyphen: true },
    { regex: /\bboudin\s+blanc\b/gi, toHyphen: true },
    { regex: /\bcotelette(s)?\s+d['’]\s*agneau\b/gi, toHyphen: true },
    { regex: /\bc[oô]telette(s)?\s+d['’]\s*agneau\b/gi, toHyphen: true },
    { regex: /\bcotelette(s)?\s+de\s+porc\b/gi, toHyphen: true },
    { regex: /\bc[oô]telette(s)?\s+de\s+porc\b/gi, toHyphen: true },
    { regex: /\bfoie\s+de\s+veau\b/gi, toHyphen: true },
    { regex: /\brognons?\s+de\s+veau\b/gi, toHyphen: true },
    { regex: /\bris\s+de\s+veau\b/gi, toHyphen: true },
    { regex: /\bqueue\s+de\s+b[oœ]uf\b/gi, toHyphen: true },
    { regex: /\bpied(?:s)?\s+de\s+veau\b/gi, toHyphen: true },
    { regex: /\bt[êe]te\s+de\s+veau\b/gi, toHyphen: true },
    { regex: /\bpapier\s+toilette\b/gi, toHyphen: true },
    { regex: /\bpapier\s+essuie[-\s]?tout\b/gi, toHyphen: true },
    { regex: /\bhuile\s+d['’]\s*olive\b/gi, toHyphen: true },
    { regex: /\blait\s+de\s+coco\b/gi, toHyphen: true },
    { regex: /\bbeurre\s+de\s+cacahu[eè]te(s)?\b/gi, toHyphen: true },
    { regex: /\bcr[eè]me\s+fra[iî]che\b/gi, toHyphen: true },
    { regex: /\bjus\s+d['’]\s*orange\b/gi, toHyphen: true },
    { regex: /\bcoulis\s+de\s+tomate\b/gi, toHyphen: true },
    { regex: /\bvin\s+blanc\b/gi, toHyphen: true },
    { regex: /\bvin\s+rouge\b/gi, toHyphen: true },
    { regex: /\bth[eé]\s+vert\b/gi, toHyphen: true },
    { regex: /\bchocolat\s+en\s+poudre\b/gi, toHyphen: true },
    { regex: /\bfarine\s+de\s+bl[eé]\b/gi, toHyphen: true },
    { regex: /\bpomme(s)?\s+de\s+pin\b/gi, toHyphen: true }
];

// Dictionnaire extensible de produits composés usuels (multi-domaines).
// On convertit automatiquement les espaces en séparateurs souples espace/tiret.
const _aiProtectedCompoundPhrases = [
    // Epicerie / supermarche
    'riz basmati', 'riz complet', 'pates fraiches', 'pates completes', 'sauce tomate',
    'concentre de tomate', 'puree de tomate', 'huile de tournesol', 'huile de colza',
    'huile de sesame', 'vinaigre balsamique', 'vinaigre de cidre', 'moutarde de dijon',
    'sel fin', 'gros sel', 'sucre glace', 'sucre roux', 'sucre vanille',
    'levure chimique', 'levure de boulanger', 'lait concentre', 'lait ecreme',
    'lait demi ecreme', 'lait entier', 'creme liquide', 'creme epaisse',
    'fromage blanc', 'yaourt nature', 'yaourt grec', 'oeufs frais',
    'haricots verts', 'petits pois', 'pois chiches', 'lentilles vertes',
    'lentilles corail', 'mais doux', 'ble tendre', 'semoule fine',
    'chapelure fine', 'cafe moulu', 'cafe en grain', 'the noir',
    'the earl grey', 'chocolat noir', 'chocolat au lait', 'chocolat blanc',
    'papier cuisson', 'film alimentaire', 'aluminium menager', 'sac congelation',
    'eau minerale', 'eau gazeuse', 'jus de pomme', 'jus multi fruits',
    'sirop de grenadine', 'beurre sale', 'beurre doux',

    // Fruits / legumes
    'pommes golden', 'pommes granny', 'pommes gala', 'poires conference',
    'bananes plantain', 'tomates cerise', 'oignons rouges', 'oignons blancs',
    'salade verte', 'chou fleur', 'chou rouge', 'chou blanc',
    'haricots plats', 'patates douces', 'courgettes rondes', 'poivrons rouges',
    'poivrons verts', 'poivrons jaunes', 'champignons de paris',

    // Boucherie / charcuterie
    'souris d agneau', 'carre d agneau', 'noix de veau', 'osso buco',
    'basse cote', 'faux filet', 'entrecote de boeuf', 'paleron de boeuf',
    'macreuse de boeuf', 'hampe de boeuf', 'onglet de boeuf',
    'araignee de boeuf', 'travers de porc', 'filet de porc', 'echine de porc',
    'jambon blanc', 'jambon cru', 'jambon de pays', 'lardons fumes',
    'lardons nature', 'poitrine fumee', 'saucisson sec', 'chorizo doux',
    'chorizo fort', 'andouille de guemene', 'pate de campagne',

    // Poissonnerie
    'saumon fume', 'saumon frais', 'truite fumee', 'cabillaud frais',
    'dos de cabillaud', 'filet de saumon', 'filet de merlu',
    'thon rouge', 'thon blanc', 'bar de ligne', 'dorade royale',
    'lieu noir', 'lieu jaune', 'colin d alaska', 'crevettes roses',
    'crevettes grises', 'moules mariniere', 'huitres fines',
    'coquilles saint jacques', 'surimi batonnet',

    // Fromagerie / cremerie
    'fromage de chevre', 'buche de chevre', 'camembert de normandie',
    'brie de meaux', 'comte vieux', 'emmental rape', 'mozzarella di bufala',
    'parmesan rape', 'gruyere rape', 'raclette nature', 'raclette fumee',
    'bleu d auvergne',

    // Boulangerie
    'pain de mie', 'pain complet', 'pain aux cereales', 'baguette tradition',
    'farine de seigle', 'farine complete', 'sucre en poudre',

    // Hygiene / entretien
    'gel douche', 'savon de marseille', 'dentifrice blancheur',
    'brosse a dents', 'papier toilette double epaisseur',
    'essuie tout', 'liquide vaisselle', 'lessive liquide', 'adoucissant linge',
    'eponge grattante', 'nettoyant multi usages', 'desinfectant menager',
    'sacs aspirateur',

    // Bricolage
    'papier de verre', 'laine de roche', 'laine de verre',
    'enduit de rebouchage', 'enduit de lissage', 'peinture acrylique',
    'peinture glycero', 'ruban adhesif', 'ruban de masquage',
    'colle a bois', 'colle neoprene', 'colle forte', 'vis a bois',
    'vis a placo', 'chevilles molly', 'chevilles a frapper',
    'boulons acier', 'ecrous frein', 'rondelles plates',
    'joint silicone', 'mastic acrylique', 'plaque de platre',
    'tube pvc', 'gaine electrique', 'prise murale', 'interrupteur va et vient',
    'ampoule led', 'batterie perceuse',

    // Automobile
    'huile moteur', 'liquide de frein', 'liquide de refroidissement',
    'lave glace', 'balais essuie glace', 'filtre a air',
    'filtre a huile', 'filtre habitacle', 'bougies d allumage',
    'plaquettes de frein', 'disques de frein', 'ampoule h7',
    'ampoule h4', 'batterie voiture', 'chargeur batterie',
    'cables de demarrage', 'pneu hiver', 'pneu ete', 'pneu 4 saisons',
    'chaine a neige', 'triangle de signalisation', 'gilet jaune',
    'nettoyant jantes', 'shampoing voiture', 'microfibre auto'
];

function _escapeRegexLiteral(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function _compileProtectedPhraseRegex(phrase) {
    let pattern = _escapeRegexLiteral((phrase || '').trim().toLowerCase());
    pattern = pattern.replace(/\\'/g, "['’]");
    pattern = pattern.replace(/\s+/g, '[\\s-]+');
    return new RegExp(`\\b${pattern}\\b`, 'gi');
}

for (const phrase of _aiProtectedCompoundPhrases) {
    _aiProtectedCompounds.push({
        regex: _compileProtectedPhraseRegex(phrase),
        toHyphen: true
    });
}

function _normalizeAiInputText(text) {
    // La normalisation principale est désormais gérée côté serveur
    // via le dictionnaire Mongo (+ cache mémoire).
    // On conserve ce point d'entrée côté client pour compatibilité.
    return text || '';
}

function _extractQuotedItems(text) {
    const items = [];
    if (!text) return { cleanedText: '', quotedItems: items };

    let cleanedText = String(text);
    const patterns = [
        /"([^"]+)"/g,       // guillemets droits
        /«\s*([^»]+?)\s*»/g, // guillemets francais
        /“([^”]+)”/g,       // guillemets typographiques
        /„([^“]+)“/g,       // variantes (de -> “)
        /”([^“]+)“/g,       // inversés
        /‘([^’]+)’/g,       // quotes simples typographiques
        /‚([^‘]+)‘/g        // variantes
    ];

    for (const pattern of patterns) {
        cleanedText = cleanedText.replace(pattern, (_, raw) => {
            const value = (raw || '').trim();
            if (value) items.push(value);
            return ' ';
        });
    }

    cleanedText = cleanedText.replace(/\s{2,}/g, ' ').trim();

    return { cleanedText, quotedItems: items };
}

function _normalizeExtractedItemKey(text) {
    return String(text || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[’']/g, ' ')
        .replace(/[^a-z0-9\s-]/g, ' ')
        .replace(/^(du|de la|de l|des|de|le|la|les|un|une)\s+/i, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function _isNegativeConfirmationMessage(text) {
    const t = String(text || '').toLowerCase().trim();
    if (!t) return false;
    // Si le message contient aussi une confirmation positive ("oui"), on ne traite
    // pas ça comme un "tout négatif" : on gère alors la négation item-par-item.
    if (/\boui\b/.test(t)) return false;
    if (/^(non|no)\b/.test(t)) return true;
    if (/\bpas\s+(du|de|d'|des|le|la|les|un|une)\b/.test(t)) return true;
    if (/\b(ne|n')\s+.*\s+pas\b/.test(t)) return true;
    if (/\b(plus|jamais)\b/.test(t) && /\b(prendre|acheter|mettre|ajouter)\b/.test(t)) return true;
    return false;
}

function _isQuestionLikeMessage(text) {
    const t = String(text || '').toLowerCase();
    if (!t.trim()) return false;
    if (t.includes('?')) return true;
    if (/\best[\s-]*ce\s+que\b/.test(t)) return true;
    if (/\bon\s+a\s+besoin\b/.test(t)) return true;
    if (/\bbesoin\s+de\b/.test(t)) return true;
    if (/\bil\s+nous\s+faut\b/.test(t)) return false;
    if (/\bil\s+faudrait\b/.test(t)) return false;
    return false;
}

function _isNegatedItemInText(text, itemText) {
    const src = String(text || '').toLowerCase();
    const it = String(itemText || '').trim();
    if (!src || !it) return false;
    // match "non (pas) de <item>" / "pas de <item>" / "non <item>"
    let itemPattern = _escapeRegexLiteral(it.toLowerCase());
    itemPattern = itemPattern.replace(/\\'/g, "['’]");
    itemPattern = itemPattern.replace(/\s+/g, '[\\s-]+');
    const re = new RegExp(`\\b(?:non\\s+pas|pas|non)\\s+(?:de\\s+|d['’]\\s*)?${itemPattern}\\b`, 'i');
    return re.test(src);
}

async function aiAutoExtract(text, postitId, sourceMessageId) {
    // Seuil minimal : 2 caractères et un pintalk cible
    if (!text || text.trim().length < 2 || !postitId) return;
    _currentSourceMsgId = sourceMessageId || null;
    // SUPPRIMÉ : le filtre "moins de 3 mots" bloquait "biscottes", "pain", etc.

    const { cleanedText, quotedItems } = _extractQuotedItems(text.trim());
    const aiInput = _normalizeAiInputText(cleanedText);
    const isNegativeConfirmation = _isNegativeConfirmationMessage(text);
    const isQuestionLike = _isQuestionLikeMessage(text);
    console.log('[AI] Analyse du texte:', aiInput.substring(0, 80), '| quoted:', quotedItems.length);

    try {
        const gid = currentGroupId;
        const did = document.getElementById('sel-dev')?.value || '';
        if (!gid) { console.warn('[AI] Pas de groupe courant'); return; }

        let aiItems = [];
        // Si tout (ou quasi tout) est entre guillemets, on respecte le verbatim :
        // pas d'appel IA serveur, pas de normalisation, pas de correction.
        const shouldBypassServerAi = (quotedItems.length > 0 && aiInput.trim().length < 2);
        if (!shouldBypassServerAi && aiInput.length >= 2) {
            const token = localStorage.getItem('token');
            // Utiliser fetch directement avec les bons headers
            const aiRes = await fetch('/api/ai/extract-multi', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({ text: aiInput, sourceMessageId: sourceMessageId || null })
            });

            console.log('[AI] Réponse status:', aiRes.status);
            if (aiRes.ok) {
                const aiData = await aiRes.json();
                console.log('[AI] Items reçus:', JSON.stringify(aiData.items));
                aiItems = Array.isArray(aiData.items) ? aiData.items : [];
            } else {
                console.warn('[AI] Erreur HTTP:', aiRes.status);
            }
        }

        // Les items entre guillemets sont traités comme des items "verbatim".
        // Si le message est une question, ils deviennent incertains (préfixe ?).
        const rawItems = [
            ...aiItems,
            ...quotedItems.map(q => ({ text: q, uncertain: isQuestionLike, verbatim: true }))
        ];
        if (!rawItems.length) {
            console.warn('[AI] Aucun item retourné');
            return;
        }

        for (const item of rawItems) {
            const itemText = typeof item === 'object' ? item.text : item;
            // Si c'est une question, on marque les items comme incertains par défaut.
            const uncertain = (typeof item === 'object' ? !!item.uncertain : false) || isQuestionLike;
            if (!itemText || itemText.trim().length < 1) continue;
            const itemKey = _normalizeExtractedItemKey(itemText);
            if (!itemKey) continue;

            // Négation partielle (ex: "oui ... et non pas de lardons") : suppression item-par-item
            // sans empêcher l'ajout des autres items certains.
            if (_isNegatedItemInText(text, itemText)) {
                const unsureMatches = allMsgs.filter(m =>
                    m.postitId === postitId &&
                    m.isNote &&
                    m.senderName === '✨ IA' &&
                    !!m.isUncertain &&
                    _normalizeExtractedItemKey(m.content) === itemKey
                );
                for (const old of unsureMatches) {
                    try {
                        await fetchAuth('/api/messages/' + old._id, { method: 'DELETE' });
                        allMsgs = allMsgs.filter(m => m._id !== old._id);
                    } catch (e) {}
                }
                continue;
            }

            if (isNegativeConfirmation) {
                const unsureMatches = allMsgs.filter(m =>
                    m.postitId === postitId &&
                    m.isNote &&
                    m.senderName === '✨ IA' &&
                    !!m.isUncertain &&
                    _normalizeExtractedItemKey(m.content) === itemKey
                );
                for (const old of unsureMatches) {
                    try {
                        await fetchAuth('/api/messages/' + old._id, { method: 'DELETE' });
                        allMsgs = allMsgs.filter(m => m._id !== old._id);
                    } catch (e) {}
                }
                // En cas de "non/pas ...", on ne rajoute pas de ligne.
                continue;
            }

            // Si un item incertain équivalent existe déjà et qu'on reçoit une confirmation,
            // on supprime l'ancienne note incertaine pour ne garder que la version certaine.
            if (!uncertain) {
                const unsureMatches = allMsgs.filter(m =>
                    m.postitId === postitId &&
                    m.isNote &&
                    m.senderName === '✨ IA' &&
                    !!m.isUncertain &&
                    _normalizeExtractedItemKey(m.content) === itemKey
                );
                for (const old of unsureMatches) {
                    try {
                        await fetchAuth('/api/messages/' + old._id, { method: 'DELETE' });
                        allMsgs = allMsgs.filter(m => m._id !== old._id);
                    } catch (e) {}
                }
            }
            console.log('[AI] Envoi item:', itemText, 'uncertain:', uncertain);
            socket.emit('send-message', {
                groupId: gid,
                deviceId: did,
                postitId: postitId,
                content: itemText.trim(),
                senderName: '✨ IA',
                // Visible sur e-ink par défaut
                isNote: false,
                isUncertain: uncertain,
                sourceMessageId: _currentSourceMsgId || null,  // lien vers le message source
                type: 'text'
            });
            await new Promise(r => setTimeout(r, 80));
        }
    } catch(e) {
        console.error('[AI] Exception:', e.message);
    } finally {
        if (sourceMessageId) _aiExtractInProgress.delete(sourceMessageId);
    }
}

