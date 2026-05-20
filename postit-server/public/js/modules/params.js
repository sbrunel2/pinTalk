// ── Profil utilisateur ────────────────────────────────────────
// ── Debug : affichage bulles IA ──────────────────────────────
function isDebugAiVisible() {
    return localStorage.getItem('debugShowAiBubbles') === '1';
}

function toggleDebugAiBubbles(checked) {
    localStorage.setItem('debugShowAiBubbles', checked ? '1' : '0');
    if (typeof refreshView === 'function') refreshView(false);
}

async function loadProfile() {
    // D'abord remplir avec localStorage (instantané)
    const local = JSON.parse(localStorage.getItem('user') || '{}');
    const setVal = (id, val) => { const el = document.getElementById(id); if(el && val) el.value = val; };
    setVal('prof-firstname', local.firstname);
    setVal('prof-lastname',  local.lastname);
    setVal('prof-email',     local.email);
    setVal('prof-phone',     local.phone);
    setVal('prof-lang',      local.lang || 'fr');

    // Synchroniser la case debug
    const debugCb = document.getElementById('debug-show-ai-bubbles');
    if (debugCb) debugCb.checked = isDebugAiVisible();

    // Puis rafraîchir depuis le serveur
    try {
        const res = await fetchAuth('/api/user/me');
        if (res && res.ok) {
            const user = await res.json();
            setVal('prof-firstname', user.firstname);
            setVal('prof-lastname',  user.lastname);
            setVal('prof-email',     user.email);
            setVal('prof-phone',     user.phone);
            setVal('prof-lang',      user.lang || 'fr');
            // Mettre à jour le localStorage
            const stored = JSON.parse(localStorage.getItem('user') || '{}');
            Object.assign(stored, user);
            localStorage.setItem('user', JSON.stringify(stored));
            // Appliquer la langue
            if (user.lang && typeof applyLang === 'function') applyLang(user.lang);
        }
    } catch(e) { /* silencieux */ }
}

async function saveProfile() {
    const payload = {
        firstname: document.getElementById('prof-firstname')?.value?.trim() || '',
        lastname:  document.getElementById('prof-lastname')?.value?.trim()  || '',
        phone:     document.getElementById('prof-phone')?.value?.trim()     || '',
        lang:      document.getElementById('prof-lang')?.value              || 'fr',
    };
    try {
        const res = await fetchAuth('/api/user/profile', { method:'PUT', body: JSON.stringify(payload) });
        if (res.ok) {
            const data = await res.json().catch(() => ({}));
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            Object.assign(user, payload, data);
            localStorage.setItem('user', JSON.stringify(user));
            setUserDisplay();
            if (payload.lang && typeof applyLang === 'function') applyLang(payload.lang);
            const langSel = document.getElementById('ai-dict-lang');
            if (langSel) langSel.value = payload.lang || 'fr';
            loadAiDictionaryUI();
            alert(typeof t==='function' ? t('profileSaved') : '✅ Profil enregistré.');
        } else {
            const txt = await res.text();
            alert('Erreur : ' + txt);
        }
    } catch(e) { alert(typeof t==='function' ? t('errorNetwork') : 'Erreur réseau'); }
}

function _getPreferredDictLang() {
    const uiLang = document.getElementById('ai-dict-lang')?.value;
    if (uiLang) return uiLang;
    const local = JSON.parse(localStorage.getItem('user') || '{}');
    return local.lang || 'fr';
}

async function loadAiDictionaryUI() {
    const box = document.getElementById('ai-dict-list');
    if (!box) return;
    const lang = _getPreferredDictLang();
    box.innerHTML = '<div style="opacity:0.6;">Chargement...</div>';
    try {
        const res = await fetchAuth('/api/ai-dictionary?lang=' + encodeURIComponent(lang));
        if (!res.ok) {
            box.innerHTML = '<div style="color:#b91c1c;">Erreur de chargement</div>';
            return;
        }
        const data = await res.json().catch(() => ({ items: [] }));
        const items = Array.isArray(data.items) ? data.items : [];
        if (!items.length) {
            box.innerHTML = '<div style="opacity:0.6;">Aucune entrée pour cette langue.</div>';
            return;
        }
        box.innerHTML = items.map((it) => {
            const cat = it.category ? ` • ${it.category}` : '';
            const scope = it.scope === 'global' ? 'global' : 'user';
            return `<div style="display:flex;align-items:center;gap:6px;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(0,0,0,0.06);">
                <div style="min-width:0;">
                    <div style="font-weight:900;word-break:break-word;">${it.phrase}</div>
                    <div style="opacity:0.5;font-size:9px;text-transform:uppercase;">${it.lang || lang} • ${scope}${cat}</div>
                </div>
                <button onclick="deleteAiDictionaryEntry('${it._id}')" style="border:1px solid rgba(220,38,38,0.35);background:#fff5f5;color:#b91c1c;font-size:9px;font-weight:900;padding:4px 6px;cursor:pointer;">Suppr.</button>
            </div>`;
        }).join('');
    } catch (e) {
        box.innerHTML = '<div style="color:#b91c1c;">Erreur réseau</div>';
    }
}

async function addAiDictionaryEntry() {
    const phraseEl = document.getElementById('ai-dict-phrase');
    const categoryEl = document.getElementById('ai-dict-category');
    const scopeEl = document.getElementById('ai-dict-scope');
    const langEl = document.getElementById('ai-dict-lang');
    const phrase = phraseEl?.value?.trim() || '';
    if (!phrase) return alert('Entrez une expression composée.');

    const payload = {
        phrase,
        category: categoryEl?.value?.trim() || '',
        scope: scopeEl?.value || 'user',
        lang: langEl?.value || _getPreferredDictLang()
    };
    try {
        const res = await fetchAuth('/api/ai-dictionary', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const msg = await res.text();
            return alert('Erreur dictionnaire: ' + msg);
        }
        if (phraseEl) phraseEl.value = '';
        if (categoryEl) categoryEl.value = '';
        await loadAiDictionaryUI();
    } catch (e) {
        alert('Erreur réseau');
    }
}

async function deleteAiDictionaryEntry(id) {
    if (!id) return;
    if (!confirm('Supprimer cette entrée du dictionnaire ?')) return;
    try {
        const res = await fetchAuth('/api/ai-dictionary/' + encodeURIComponent(id), { method: 'DELETE' });
        if (!res.ok) return alert('Suppression refusée.');
        await loadAiDictionaryUI();
    } catch (e) {
        alert('Erreur réseau');
    }
}

async function changePassword() {
    const cur = document.getElementById('prof-pwd-cur')?.value;
    const nw  = document.getElementById('prof-pwd-new')?.value;
    if (!cur || !nw) return alert('Remplissez les deux champs.');
    if (nw.length < 6) return alert(typeof t==='function' ? t('pwdShort') : 'Minimum 6 caractères.');
    try {
        const res = await fetchAuth('/api/user/password', { method:'PUT', body: JSON.stringify({ currentPassword: cur, newPassword: nw }) });
        if (res.ok) { alert(typeof t==='function' ? t('pwdChanged') : '✅ Mot de passe modifié.'); document.getElementById('prof-pwd-cur').value=''; document.getElementById('prof-pwd-new').value=''; }
        else alert('Erreur : ' + await res.text());
    } catch(e) { alert('Erreur réseau'); }
}

// applyLang et t() définies dans i18n.js

function setDefaultTileShape(shape) {
    localStorage.setItem('defaultTileShape', shape);
    localStorage.setItem('tileShape', shape);
    window._currentTileShape  = shape;

    // Calcul du border-radius
    const r = shape === 'circle' ? '50%' : shape === 'rounded' ? '16px' : '0px';
    window._currentTileRadius = r;

    // Boutons visuels dans les paramètres
    ['rect','rounded','circle'].forEach(s => {
        const btn = document.getElementById('dshape-' + s);
        if (!btn) return;
        const active = s === shape;
        btn.style.borderColor = active ? 'var(--accent)' : 'rgba(0,0,0,0.2)';
        btn.style.background  = active ? 'var(--accent)' : 'white';
        btn.style.color       = active ? 'white' : '#333';
        // Garder la forme propre à chaque bouton
    });

    // Appliquer la forme globale uniquement aux tuiles SANS forme individuelle
    document.querySelectorAll('#groups-grid [id^="tile-"]').forEach(tile => {
        const gid = tile.id.replace('tile-', '');
        const indivShape = _userPrefs?.tilePrefs?.[gid]?.shape || null;
        if (indivShape) {
            // Tuile avec forme individuelle → appliquer SA forme
            const ri = indivShape === 'circle' ? '50%' : indivShape === 'rounded' ? '16px' : '0px';
            tile.style.borderRadius = ri;
            tile.style.overflow     = 'hidden';
            if (indivShape === 'circle') {
                tile.style.width = tile.style.height = tile.style.minHeight = '88px';
                tile.style.padding = '4px';
            } else {
                tile.style.width = tile.style.height = '';
                tile.style.minHeight = '88px';
                tile.style.padding = '';
            }
        } else {
            // Tuile sans forme individuelle → appliquer la forme globale
            tile.style.borderRadius = r;
            tile.style.overflow     = 'hidden';
            if (shape === 'circle') {
                tile.style.width = tile.style.height = tile.style.minHeight = '88px';
                tile.style.padding = '4px';
            } else {
                tile.style.width = tile.style.height = '';
                tile.style.minHeight = '88px';
                tile.style.padding = '';
            }
        }
    });

    // Mettre à jour la grille CSS
    const grid = document.getElementById('groups-grid');
    if (grid) {
        grid.classList.remove('tiles-circle','tiles-rounded','tiles-rect');
        grid.classList.add('tiles-' + shape);
    }

    // Mettre à jour la tuile + si elle existe
    const addTile = document.querySelector('#groups-grid div:not([id^="tile-"])');
    if (addTile) {
        addTile.style.borderRadius = r;
        if (shape === 'circle') {
            addTile.style.width = addTile.style.height = '88px';
        } else {
            addTile.style.width = addTile.style.height = '';
        }
    }

}

function setDefaultBtnShape(shape) {
    localStorage.setItem('btnShape', shape);
    ['btn-rect','btn-rounded','btn-pill'].forEach(s => {
        const btn = document.getElementById('bshape-' + s.replace('btn-',''));
        if (!btn) return;
        const active = s === 'btn-' + shape;
        btn.style.borderColor = active ? 'var(--accent)' : 'rgba(0,0,0,0.2)';
        btn.style.background  = active ? 'var(--accent)' : 'white';
        btn.style.color       = active ? 'white' : '#333';
    });
    const r = shape === 'pill' ? '999px' : shape === 'rounded' ? '8px' : '0px';
    document.documentElement.style.setProperty('--btn-radius', r);
}

function applyBgColor(color) {
    localStorage.setItem('customBgColor', color);
    // Appliquer sur toutes les pages et le header
    document.documentElement.style.setProperty('--bg', color);
    document.documentElement.style.setProperty('--custom-bg', color);
    // Si mode perso actif, aussi sync le color picker
    const el = document.getElementById('c-bg');
    if (el) el.value = color;
}

function applyBgImage(input) {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const url = e.target.result;
        document.body.style.backgroundImage = `url(${url})`;
        document.body.classList.add('has-bg-image');
        localStorage.setItem('customBgImage', url);
    };
    reader.readAsDataURL(file);
}

function removeBgImage() {
    document.body.style.backgroundImage = '';
    document.body.classList.remove('has-bg-image');
    localStorage.removeItem('customBgImage');
}

function initSkin() {
    const n = parseInt(localStorage.getItem('activeSkin') || '0');
    const defaults = {
        '--custom-bg':'#efeee9','--custom-accent':'#18181b','--custom-text':'#18181b',
        '--custom-field':'#ffffff','--custom-btn-bg':'#18181b','--custom-btn-text':'#ffffff'
    };
    const pickerMap = {
        '--custom-bg':'c-bg','--custom-accent':'c-accent','--custom-text':'c-text',
        '--custom-field':'c-field','--custom-btn-bg':'c-btn-bg','--custom-btn-text':'c-btn-text'
    };
    Object.entries(defaults).forEach(([k,def]) => {
        const val = localStorage.getItem(k) || def;
        document.documentElement.style.setProperty(k, val);
        const picker = document.getElementById(pickerMap[k]);
        if (picker) picker.value = val;
    });

    // Restaurer police, taille, bordure, arrondi
    const font     = localStorage.getItem('customFont')     || 'sans-serif';
    const fontSize = localStorage.getItem('customFontSize') || '14';
    const border   = localStorage.getItem('customBorder')   || '2';
    const radius   = localStorage.getItem('customRadius')   || '0';
    document.documentElement.style.setProperty('--font-family', font);
    document.documentElement.style.setProperty('--font-size',   fontSize + 'px');
    document.documentElement.style.setProperty('--border-w',    border + 'px');
    document.documentElement.style.setProperty('--tile-radius', radius + 'px');
    const fontEl   = document.getElementById('c-font');     if(fontEl)   fontEl.value = font;
    const fsEl     = document.getElementById('c-fontsize'); if(fsEl)     { fsEl.value = fontSize; const sp = document.getElementById('font-size-val'); if(sp) sp.textContent = fontSize; }
    const bdEl     = document.getElementById('c-border');   if(bdEl)     { bdEl.value = border;   const sp = document.getElementById('border-val');    if(sp) sp.textContent = border; }
    const rdEl     = document.getElementById('c-radius');   if(rdEl)     { rdEl.value = radius;   const sp = document.getElementById('radius-val');    if(sp) sp.textContent = radius; }

    // Restaurer couleurs bulles
    const bKeys = ['bubbleMeBg','bubbleMeText','bubbleOtherBg','bubbleOtherText'];
    const bVars = ['--bubble-me-bg','--bubble-me-text','--bubble-other-bg','--bubble-other-text'];
    const bDefs = ['#18181b','#ffffff','#ffffff','#18181b'];
    const bIds  = ['c-bubble-me-bg','c-bubble-me-text','c-bubble-other-bg','c-bubble-other-text'];
    bKeys.forEach((k, i) => {
        const val = localStorage.getItem(k) || bDefs[i];
        document.documentElement.style.setProperty(bVars[i], val);
        const el = document.getElementById(bIds[i]); if (el) el.value = val;
    });

    // Restaurer forme des tuiles
    const defShape = localStorage.getItem('defaultTileShape') || localStorage.getItem('tileShape') || 'rect';
    setDefaultTileShape(defShape);
    // Restaurer forme des boutons
    const defBtnShape = localStorage.getItem('btnShape') || 'rect';
    setDefaultBtnShape(defBtnShape);

    // Restaurer image de fond
    const bgImg = localStorage.getItem('customBgImage');
    if (bgImg) { document.body.style.backgroundImage = `url(${bgImg})`; document.body.classList.add('has-bg-image'); }

    applySkin(n);
}

// Toujours forcer le login au démarrage (ne pas restaurer la session)
// currentUser et token sont ignorés au chargement initial

