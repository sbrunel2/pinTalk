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
    _isQuestion, _splitByArticles, _fallbackExtract,
    _cleanExtractedItemText, _normalizeProductKey, _isLikelyProductText,
    _mergeStandaloneQuantities,
} = require('../helpers/ai');
const { AiDictionaryEntry } = require('../models');

// ── Extraction multi-items via Gemini ─────────────────────────────────────────
router.post('/extract-multi', authenticateToken, async (req, res) => {
    try {
        const { text: rawText, sourceMessageId } = req.body;
        console.log('[EXTRACT-MULTI] Reçu:', JSON.stringify(rawText).substring(0, 100), '| srcMsgId:', sourceMessageId || 'AUCUN');
        if (!rawText || rawText.length < 2) return res.status(400).send('Texte vide.');
        if (sourceMessageId) {
            if (_aiExtractLock.has(sourceMessageId)) {
                console.warn('[EXTRACT-MULTI] ⛔ Doublon bloqué pour:', sourceMessageId);
                return res.status(429).json({ items: [], source: 'duplicate_blocked' });
            }
            _aiExtractLock.add(sourceMessageId);
            setTimeout(() => _aiExtractLock.delete(sourceMessageId), 15000);
        }

        const userEmail     = req.user?.email || '';
        const userLang      = await _resolveUserLang(userEmail);
        const text          = rawText.replace(/(\d+[.,]?\d*)\s+(g|gr|kg|ml|cl|dl|l)\b/gi, '$1$2');
        const normalizedText = await _normalizeTextWithAiDictionary(text, userEmail, userLang);
        const geminiKey     = process.env.GEMINI_API_KEY;
        const isQuestion    = _isQuestion(normalizedText);
        const preSplit      = isQuestion ? null : _splitByArticles(normalizedText);

        // Sans Gemini → fallback uniquement
        if (!geminiKey) {
            const parts = (preSplit && preSplit.length > 1) ? preSplit : _fallbackExtract(normalizedText);
            const uniq = new Set();
            const items = parts.map(t => {
                const isWord = t.startsWith('__WORD__');
                const txtRaw = isWord ? t.slice(8) : t.trim();
                const txt = _cleanExtractedItemText(txtRaw);
                const key = _normalizeProductKey(txt);
                if (!txt || !key || uniq.has(key) || !_isLikelyProductText(txt)) return null;
                uniq.add(key);
                return { text: txt, uncertain: isWord || isQuestion };
            }).filter(Boolean);
            console.log('[FALLBACK] Items:', JSON.stringify(items));
            return res.json({ items, source: 'fallback' });
        }

        // Bypass Gemini si pré-split concluant et texte simple
        if (preSplit && preSplit.length > 1 && !isQuestion &&
            !normalizedText.match(/faudrait|devrait|acheter|prendre|pense|oublie|peut.être/i)) {
            const uniq = new Set();
            const items = preSplit.map(t => {
                const txt = _cleanExtractedItemText(t.trim());
                const key = _normalizeProductKey(txt);
                if (!txt || !key || uniq.has(key)) return null;
                uniq.add(key);
                return { text: txt, uncertain: false };
            }).filter(Boolean);
            console.log('[PRE-SPLIT] Bypass Gemini, items:', JSON.stringify(items));
            return res.json({ items, source: 'presplit' });
        }

        const safeText = normalizedText.replace(/"/g, "'").substring(0, 300);
        const systemPrompt = `Tu es un extracteur logistique de liste de courses et de taches. Tu identifies les produits mentionnes dans tout message : affirmation, question ou suggestion. IMPORTANT : le texte peut provenir d'une transcription vocale automatique et contenir des erreurs phonetiques ou orthographiques (ex: "biscote" pour "biscottes", "yaour" pour "yaourt", "shampoin" pour "shampoing"). Corrige ces erreurs et extrais le produit correct. Tu reponds UNIQUEMENT avec du JSON valide, jamais avec du texte libre.`;
        const fewShotPrompt = `EXEMPLES DE TRANSFORMATION (few-shot) :

Message: "biscottes"
Reponse: {"items":[{"text":"biscottes","uncertain":false}]}

Message: "du pain du beurre"
Reponse: {"items":[{"text":"pain","uncertain":false},{"text":"beurre","uncertain":false}]}

Message: "prends du pain et 3 croissants"
Reponse: {"items":[{"text":"pain","uncertain":false},{"text":"3 croissants","uncertain":false}]}

Message: "Il nous faudrait des pommes non ?"
Reponse: {"items":[{"text":"pommes","uncertain":true}]}

Message: "Ne faudrait-il pas prendre du pain et du beurre ?"
Reponse: {"items":[{"text":"pain","uncertain":true},{"text":"beurre","uncertain":true}]}

Message: "300g viande hachee, 2 steaks, un roti de veau"
Reponse: {"items":[{"text":"300g viande hachee","uncertain":false},{"text":"2 steaks","uncertain":false},{"text":"roti de veau","uncertain":false}]}

REGLES CRITIQUES :
- Chaque produit = un item separe, meme sans virgule ni ponctuation
- "du/de la/des/le/la/les" avant un produit = nouveau produit distinct
- uncertain:false = affirmation, liste directe, mot seul
- uncertain:true = question, suggestion, doute ("faudrait", "devrait", "peut-etre", "?")
- Supprimer les articles (du, de la, des, le, la) dans le champ text
- Conserver les quantites (3, 300g, un, une, deux...) dans le champ text
- Ne JAMAIS retourner items vide

MESSAGE A ANALYSER: "${safeText}"
Reponse JSON:`;

        const gRes = await fetch(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + geminiKey,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: systemPrompt }] },
                    contents: [{ role: 'user', parts: [{ text: fewShotPrompt }] }],
                    generationConfig: { maxOutputTokens: 300, temperature: 0.1, responseMimeType: 'application/json' }
                })
            }
        );

        if (!gRes.ok) {
            const errText = await gRes.text();
            console.error('[GEMINI] Erreur API:', gRes.status, errText.substring(0, 100));
            const simple = _fallbackExtract(normalizedText).map(t => ({ text: t, uncertain: false }));
            return res.json({ items: simple, source: 'fallback' });
        }

        const gData = await gRes.json();
        const raw = gData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '{}';

        let items = [];
        try {
            const clean = raw.replace(/```json|```/g, '').trim();
            const parsed = JSON.parse(clean);
            const arr = Array.isArray(parsed) ? parsed : (parsed.items || []);
            const uniq = new Set();
            items = arr
                .filter(i => i && typeof i.text === 'string' && i.text.trim().length > 1)
                .map(i => {
                    const txt = _cleanExtractedItemText(i.text.trim());
                    const key = _normalizeProductKey(txt);
                    if (!txt || !key || uniq.has(key) || !_isLikelyProductText(txt)) return null;
                    uniq.add(key);
                    return { text: txt, uncertain: !!i.uncertain };
                }).filter(Boolean);
        } catch(e) {
            console.warn('[GEMINI] JSON parse failed:', e.message);
            const uniq = new Set();
            items = _fallbackExtract(normalizedText).map(t => {
                const txt = _cleanExtractedItemText(t.trim());
                const key = _normalizeProductKey(txt);
                if (!txt || !key || uniq.has(key) || !_isLikelyProductText(txt)) return null;
                uniq.add(key);
                return { text: txt, uncertain: false };
            }).filter(Boolean);
        }

        // Dernier filet : si vide → fallback
        if (items.length === 0 && normalizedText.trim().length > 1) {
            const fb = _fallbackExtract(normalizedText);
            const uniq = new Set();
            items = fb.length > 0
                ? fb.map(t => {
                    const txt = _cleanExtractedItemText(t);
                    const key = _normalizeProductKey(txt);
                    if (!txt || !key || uniq.has(key) || !_isLikelyProductText(txt)) return null;
                    uniq.add(key);
                    return { text: txt, uncertain: true };
                }).filter(Boolean)
                : (() => {
                    const txt = _cleanExtractedItemText(normalizedText.trim().substring(0, 60));
                    return _isLikelyProductText(txt) ? [{ text: txt, uncertain: true }] : [];
                })();
        }

        items = _mergeStandaloneQuantities(items);
        if (!isQuestion) items = items.map(it => it ? { ...it, uncertain: false } : it).filter(Boolean);

        console.log('[GEMINI] ' + items.length + ' items extraits de "' + normalizedText.substring(0, 50) + '"');
        res.json({ items, source: 'gemini' });

    } catch(err) {
        console.error('[AI EXTRACT-MULTI]', err.message);
        const simple = _fallbackExtract(req.body.text || '').map(t => ({ text: t, uncertain: false }));
        res.json({ items: simple, source: 'fallback' });
    }
});

// ── Extraction simple (single item) ──────────────────────────────────────────
router.post('/extract', authenticateToken, async (req, res) => {
    try {
        const { text } = req.body;
        if (!text || text.length < 2) return res.status(400).send('Texte vide.');
        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) {
            const simple = text.replace(/^(pense à|n'oublie pas de|il faut|acheter|prendre|ramener)\s+/i, '').trim();
            return res.json({ extracted: simple, source: 'fallback' });
        }
        const prompt = `Tu es un assistant qui extrait des tâches ou éléments concrets d'un message.
Règles strictes :
- Réponds UNIQUEMENT avec le texte de l'élément extrait, rien d'autre
- Inclure les quantités si présentes (ex: "3 steaks hachés", "500g de farine")
- Si aucun élément concret : réponds exactement AUCUN
- Pas d'explication, pas de ponctuation finale, juste l'item en minuscules
Message : "${text.replace(/"/g, "'")}"`;

        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 60, temperature: 0.1 } }) }
        );
        if (!geminiRes.ok) {
            const simple = text.replace(/^(pense à|acheter|prendre|il faut)\s+/i,'').trim();
            return res.json({ extracted: simple, source: 'fallback' });
        }
        const geminiData = await geminiRes.json();
        const extracted = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (!extracted || extracted === 'AUCUN') return res.json({ extracted: null });
        console.log(`[GEMINI] Extrait : "${extracted}" depuis "${text.substring(0,40)}..."`);
        res.json({ extracted, source: 'gemini' });
    } catch(err) {
        const simple = req.body.text?.replace(/^(pense à|acheter|prendre|il faut)\s+/i,'').trim();
        res.json({ extracted: simple || null, source: 'fallback' });
    }
});

// ── Dictionnaire IA personnel ─────────────────────────────────────────────────
router.get('/dictionary', authenticateToken, async (req, res) => {
    try {
        await _ensureAiDictionaryCacheFresh();
        const userEmail = String(req.user?.email || '').toLowerCase();
        const userLang  = await _resolveUserLang(userEmail);
        const lang      = String(req.query.lang || userLang || 'fr').toLowerCase();
        const includeGlobal = req.query.scope !== 'user';
        const includeUser   = req.query.scope !== 'global';
        const entries = [];
        if (includeGlobal) entries.push(..._aiDictCache.entries.filter(e => e.scope === 'global' && (e.lang === lang || e.lang === 'all')));
        if (includeUser && userEmail) entries.push(...(_aiDictCache.byUser.get(userEmail) || []).filter(e => e.lang === lang || e.lang === 'all'));
        res.json({ items: entries.map(e => ({ _id: e.id, phrase: e.phrase, normalized: e.normalized, lang: e.lang, category: e.category, scope: e.scope, ownerEmail: e.ownerEmail })) });
    } catch (e) { res.status(500).json({ message: 'Erreur lecture dictionnaire IA' }); }
});

router.post('/dictionary', authenticateToken, async (req, res) => {
    try {
        const phrase = String(req.body?.phrase || '').trim();
        if (!phrase) return res.status(400).json({ message: 'phrase requise' });
        const userLang = await _resolveUserLang(req.user?.email || '');
        const lang = String(req.body?.lang || userLang || 'fr').trim().toLowerCase();
        if (!/^(fr|en|es|de|it|all)$/.test(lang)) return res.status(400).json({ message: 'lang invalide (fr,en,es,de,it,all)' });
        const requestedScope = String(req.body?.scope || 'user').toLowerCase();
        const canGlobal  = _isDictionaryAdmin(req.user?.email);
        const scope      = (requestedScope === 'global' && canGlobal) ? 'global' : 'user';
        const ownerEmail = scope === 'user' ? String(req.user?.email || '').toLowerCase() : '';
        const normalized = _normalizePhraseKey(phrase);
        if (!normalized) return res.status(400).json({ message: 'phrase invalide' });
        const doc = await AiDictionaryEntry.create({ phrase, normalized, lang, category: String(req.body?.category || '').trim(), active: req.body?.active !== false, scope, ownerEmail, createdBy: String(req.user?.email || '').toLowerCase() });
        await _refreshAiDictionaryCache();
        res.status(201).json({ item: doc });
    } catch (e) {
        if (e?.code === 11000) return res.status(409).json({ message: 'Entrée déjà existante' });
        res.status(500).json({ message: 'Erreur création dictionnaire IA' });
    }
});

router.patch('/dictionary/:id', authenticateToken, async (req, res) => {
    try {
        const doc = await AiDictionaryEntry.findById(req.params.id);
        if (!doc) return res.status(404).json({ message: 'Entrée introuvable' });
        const userEmail = String(req.user?.email || '').toLowerCase();
        const isAdmin = _isDictionaryAdmin(userEmail);
        const canEdit = (doc.scope === 'user' && String(doc.ownerEmail || '').toLowerCase() === userEmail) || (doc.scope === 'global' && isAdmin);
        if (!canEdit) return res.status(403).json({ message: 'Accès refusé' });
        if (typeof req.body?.phrase === 'string' && req.body.phrase.trim()) { doc.phrase = req.body.phrase.trim(); doc.normalized = _normalizePhraseKey(doc.phrase); }
        if (typeof req.body?.lang === 'string' && req.body.lang.trim()) {
            const newLang = req.body.lang.trim().toLowerCase();
            if (!/^(fr|en|es|de|it|all)$/.test(newLang)) return res.status(400).json({ message: 'lang invalide' });
            doc.lang = newLang;
        }
        if (typeof req.body?.category === 'string') doc.category = req.body.category.trim();
        if (typeof req.body?.active === 'boolean') doc.active = req.body.active;
        await doc.save();
        await _refreshAiDictionaryCache();
        res.json({ item: doc });
    } catch (e) {
        if (e?.code === 11000) return res.status(409).json({ message: 'Entrée déjà existante' });
        res.status(500).json({ message: 'Erreur mise à jour dictionnaire IA' });
    }
});

router.delete('/dictionary/:id', authenticateToken, async (req, res) => {
    try {
        const doc = await AiDictionaryEntry.findById(req.params.id);
        if (!doc) return res.status(404).json({ message: 'Entrée introuvable' });
        const userEmail = String(req.user?.email || '').toLowerCase();
        const isAdmin = _isDictionaryAdmin(userEmail);
        const canDelete = (doc.scope === 'user' && String(doc.ownerEmail || '').toLowerCase() === userEmail) || (doc.scope === 'global' && isAdmin);
        if (!canDelete) return res.status(403).json({ message: 'Accès refusé' });
        await AiDictionaryEntry.deleteOne({ _id: doc._id });
        await _refreshAiDictionaryCache();
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: 'Erreur suppression dictionnaire IA' }); }
});

module.exports = router;
