// ═══════════════════════════════════════════════════════════════════════
// AI-EXTRACT — Extraction d'items IA côté front (module V5)
// Remplace les fonctions NLP inline de app.js (V3/V4)
// ═══════════════════════════════════════════════════════════════════════

// ── Utilitaires regex ─────────────────────────────────────────────────────────
function _escapeRegexLiteral(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Extraction des items entre guillemets ─────────────────────────────────────
function _extractQuotedItems(text) {
    const items = [];
    if (!text) return { cleanedText: '', quotedItems: items };
    let cleanedText = String(text);
    const patterns = [
        /\"([^\"]+)\"/g, /«\s*([^»]+?)\s*»/g, /\u201c([^\u201d]+)\u201d/g,
        /\u201e([^\u201c]+)\u201c/g, /\u201f([^\u201d]+)\u201d/g,
        /\u2018([^\u2019]+)\u2019/g, /\u201a([^\u2018]+)\u2018/g,
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

// ── Normalisation clé d'item extrait ─────────────────────────────────────────
function _normalizeExtractedItemKey(text) {
    return String(text || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/['']/g, ' ')
        .replace(/[^a-z0-9\s-]/g, ' ')
        .replace(/^(du|de la|de l|des|de|le|la|les|un|une)\s+/i, '')
        .replace(/\s+/g, ' ').trim();
}

// ── Détection question (CORRIGÉE : "il ne faudrait pas" = question) ───────────
function _isQuestionLikeMessage(text) {
    const t = String(text || '').toLowerCase().trim();
    if (!t) return false;
    if (t.includes('?')) return true;
    if (/\best[\s-]*ce\s+qu/.test(t)) return true;
    if (/\bon\s+a\s+besoin\b/.test(t)) return true;
    if (/\bbesoin\s+de\b/.test(t)) return true;
    // Conditionnel rhétorique = question avec doute → uncertain:true sur les produits
    if (/\b(?:ne\s+)?faudrait(?:[\s-]*(?:il|on|pas))?\b/.test(t)) return true;
    if (/\bdevrait(?:[\s-]*(?:on|pas))?\b/.test(t)) return true;
    if (/\bpourrait(?:[\s-]*(?:on|pas))?\b/.test(t)) return true;
    if (/\bserait(?:[\s-]*(?:il|on|pas))?\b/.test(t)) return true;
    if (/\bpeut[\s-]*[eê]tre\b/.test(t)) return true;
    return false;
}

// ── Détection négation FERME (CORRIGÉE : exclut les conditionnels rhétoriques) ──
// "non je ne veux pas de pain" → true (négation ferme)
// "il ne faudrait pas du pain" → false (question rhétorique, pas une négation)
function _isNegativeConfirmationMessage(text) {
    const t = String(text || '').toLowerCase().trim();
    if (!t) return false;
    if (/\boui\b/.test(t)) return false;
    // Si la phrase contient un conditionnel (faudrait/devrait/pourrait/serait),
    // c'est une question, PAS une négation ferme
    if (/\b(?:faudrait|devrait|pourrait|serait|voudrait)\b/.test(t)) return false;
    // Négations fermes
    if (/^(non|no)\b/.test(t)) return true;
    if (/\bpas\s+(?:du|de|d['']\s*|des|le|la|les|un|une)\b/.test(t)) return true;
    if (/\b(?:ne|n[''])\s+.*\s+pas\b/.test(t)) return true;
    if (/\b(?:plus|jamais)\b/.test(t) && /\b(?:prendre|acheter|mettre|ajouter)\b/.test(t)) return true;
    return false;
}

// ── Détection négation item-par-item ─────────────────────────────────────────
function _isNegatedItemInText(text, itemText) {
    const src = String(text || '').toLowerCase();
    const it  = String(itemText || '').trim();
    if (!src || !it) return false;
    let itemPattern = _escapeRegexLiteral(it.toLowerCase());
    itemPattern = itemPattern.replace(/\\'/g, "[''\\-]");
    itemPattern = itemPattern.replace(/\s+/g, '[\\s-]+');
    const re = new RegExp(`\\b(?:non\\s+pas|pas|non)\\s+(?:de\\s+|d['']\\s*)?${itemPattern}\\b`, 'i');
    return re.test(src);
}

// ── Marquer une bulle comme "non comprise" ────────────────────────────────────
function _markBubbleNotUnderstood(sourceMessageId) {
    if (!sourceMessageId) return;
    // Trouver la bulle dans le DOM par son id de message
    const bubble = document.querySelector(`[data-msg-id="${sourceMessageId}"] .msg-bubble`);
    if (!bubble) return;
    bubble.style.outline = '2px dashed #f59e0b';
    bubble.style.outlineOffset = '2px';
    bubble.title = 'Message non interprété — aucun produit détecté';
    // Ajouter une petite icône d'avertissement si elle n'est pas déjà là
    if (!bubble.querySelector('.ai-not-understood')) {
        const icon = document.createElement('span');
        icon.className = 'ai-not-understood';
        icon.style.cssText = 'display:inline-block;margin-left:5px;font-size:10px;opacity:.7;vertical-align:middle;';
        icon.textContent = '⚠️';
        icon.title = 'Message non interprété par l\'IA';
        bubble.appendChild(icon);
    }
}

// ── Effacer le marquage "non comprise" ────────────────────────────────────────
function _unmarkBubbleNotUnderstood(sourceMessageId) {
    if (!sourceMessageId) return;
    const bubble = document.querySelector(`[data-msg-id="${sourceMessageId}"] .msg-bubble`);
    if (!bubble) return;
    bubble.style.outline = '';
    bubble.style.outlineOffset = '';
    bubble.title = '';
    bubble.querySelector('.ai-not-understood')?.remove();
}

// ── Fonction principale d'extraction ─────────────────────────────────────────
async function aiAutoExtract(text, postitId, sourceMessageId, forceReanalyze = false) {
    if (!text || text.trim().length < 2 || !postitId) return;
    _currentSourceMsgId = sourceMessageId || null;

    const { cleanedText, quotedItems } = _extractQuotedItems(text.trim());
    const aiInput = cleanedText || '';

    const isNegativeConfirmation = _isNegativeConfirmationMessage(text);
    const isQuestionLike         = _isQuestionLikeMessage(text);

    console.log('[AI] Analyse:', aiInput.substring(0, 80),
        '| question:', isQuestionLike, '| négation ferme:', isNegativeConfirmation,
        '| quoted:', quotedItems.length);

    try {
        const gid = currentGroupId;
        const did = document.getElementById('sel-dev')?.value || '';
        if (!gid) { console.warn('[AI] Pas de groupe courant'); return; }

        let aiItems = [];
        let serverUnderstood = true; // par défaut, on considère que c'est compris

        const shouldBypassServerAi = quotedItems.length > 0 && aiInput.trim().length < 2;

        if (!shouldBypassServerAi && aiInput.length >= 2) {
            try {
                const token = localStorage.getItem('token');
                const aiRes = await fetch('/api/ai/extract-multi', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({ text: aiInput, sourceMessageId: sourceMessageId || null, forceReanalyze: !!forceReanalyze })
                });

                console.log('[AI] Réponse status:', aiRes.status);
                if (aiRes.ok) {
                    const aiData = await aiRes.json();
                    console.log('[AI] Items reçus:', JSON.stringify(aiData.items),
                        '| understood:', aiData.understood);
                    aiItems = Array.isArray(aiData.items) ? aiData.items : [];
                    serverUnderstood = aiData.understood !== false;
                } else {
                    console.warn('[AI] Erreur HTTP:', aiRes.status);
                }
            } catch (fetchErr) {
                console.warn('[AI] Fetch error:', fetchErr.message);
            }
        }

        // Items entre guillemets (verbatim)
        const rawItems = [
            ...aiItems,
            ...quotedItems.map(q => ({ text: q, uncertain: isQuestionLike, verbatim: true }))
        ];

        // ── Message non compris : marquer la bulle ────────────────────────────
        if (!shouldBypassServerAi && aiInput.length >= 2 && rawItems.length === 0 && !serverUnderstood) {
            console.warn('[AI] Message non compris, marquage bulle:', sourceMessageId);
            _markBubbleNotUnderstood(sourceMessageId);
            // Effacer automatiquement le marquage si le message est re-analysé plus tard
            if (sourceMessageId) _aiExtractInProgress.delete(sourceMessageId);
            return;
        }

        // S'il y a des items, effacer un éventuel marquage précédent
        if (rawItems.length > 0) {
            _unmarkBubbleNotUnderstood(sourceMessageId);
        }

        if (!rawItems.length) {
            console.warn('[AI] Aucun item, message possiblement conversationnel');
            return;
        }

        // ── Traitement des items ──────────────────────────────────────────────
        for (const item of rawItems) {
            const itemText = typeof item === 'object' ? item.text : item;
            const uncertain = (typeof item === 'object' ? !!item.uncertain : false) || isQuestionLike;

            if (!itemText || itemText.trim().length < 1) continue;
            const itemKey = _normalizeExtractedItemKey(itemText);
            if (!itemKey) continue;

            // Négation item-par-item (ex: "oui... et pas de lardons")
            if (_isNegatedItemInText(text, itemText)) {
                await _removeUncertainItemFromList(postitId, itemKey);
                continue;
            }

            // Négation ferme globale → supprimer les items incertains correspondants
            if (isNegativeConfirmation) {
                await _removeUncertainItemFromList(postitId, itemKey);
                continue;
            }

            // Confirmation d'un item incertain → remplacer la version incertaine
            if (!uncertain) {
                await _removeUncertainItemFromList(postitId, itemKey);
            }

            console.log('[AI] Envoi item:', itemText, '| uncertain:', uncertain);
            socket.emit('send-message', {
                groupId: gid,
                deviceId: did,
                postitId: postitId,
                content: itemText.trim(),
                senderName: '✨ IA',
                isNote: false,
                isUncertain: uncertain,
                sourceMessageId: _currentSourceMsgId || null,
                type: 'text'
            });
            await new Promise(r => setTimeout(r, 80));
        }

    } catch (e) {
        console.error('[AI] Exception:', e.message);
    } finally {
        if (sourceMessageId) _aiExtractInProgress.delete(sourceMessageId);
    }
}

// ── Supprimer les notes IA incertaines correspondant à une clé ───────────────
async function _removeUncertainItemFromList(postitId, itemKey) {
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
