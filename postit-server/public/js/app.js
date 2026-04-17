let socket;
let allMsgs = [];
let currentUser = JSON.parse(localStorage.getItem('user'));
let currentGroupId = localStorage.getItem('currentGroupId') || null;
let currentGroupConfig = null; // { type, isPro, hasRayons, myRole, name }

// ─── HEADER RÉDUCTIBLE ───────────────────────────────────────────────────────
let headerCollapsed = localStorage.getItem('headerCollapsed') === '1';

function toggleHeader() {
    headerCollapsed = !headerCollapsed;
    localStorage.setItem('headerCollapsed', headerCollapsed ? '1' : '0');
    applyHeaderState();
}

function applyHeaderState() {
    const hdr = document.getElementById('fixed-header');
    const icon = document.getElementById('header-toggle-icon');
    if (!hdr) return;
    if (headerCollapsed) {
        hdr.classList.add('collapsed');
        if (icon) icon.innerText = '▼';
    } else {
        hdr.classList.remove('collapsed');
        if (icon) icon.innerText = '▲';
    }
}

function setUserDisplay() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const el = document.getElementById('user-name-display');
    if (el && user.name) el.innerText = user.name + (user.email ? ' (' + user.email + ')' : '');
}

// ─── SKINS ───────────────────────────────────────────────────────────────────
function applySkin(n) {
    document.body.classList.remove('skin-1','skin-2');
    if (n === 1) document.body.classList.add('skin-1');
    if (n === 2) document.body.classList.add('skin-2');
    localStorage.setItem('activeSkin', n);
    // Mettre à jour les boutons dans le sélecteur
    document.querySelectorAll('.skin-btn').forEach((b,i) => {
        b.classList.toggle('active', i === n);
    });
    const pickers = document.getElementById('skin-color-pickers');
    if (pickers) pickers.classList.toggle('visible', n === 2);
}

function applyCustomColors() {
    const vars = {
        '--custom-bg':       document.getElementById('c-bg')?.value       || '#efeee9',
        '--custom-accent':   document.getElementById('c-accent')?.value   || '#18181b',
        '--custom-text':     document.getElementById('c-text')?.value     || '#18181b',
        '--custom-field':    document.getElementById('c-field')?.value    || '#ffffff',
        '--custom-btn-bg':   document.getElementById('c-btn-bg')?.value   || '#18181b',
        '--custom-btn-text': document.getElementById('c-btn-text')?.value || '#ffffff',
    };
    Object.entries(vars).forEach(([k,v]) => {
        document.documentElement.style.setProperty(k, v);
        localStorage.setItem(k, v);
    });

    // Police
    const font     = document.getElementById('c-font')?.value     || 'sans-serif';
    const fontSize = document.getElementById('c-fontsize')?.value || '14';
    const border   = document.getElementById('c-border')?.value   || '2';
    const radius   = document.getElementById('c-radius')?.value   || '0';

    document.documentElement.style.setProperty('--font-family', font);
    document.documentElement.style.setProperty('--font-size',   fontSize + 'px');
    document.documentElement.style.setProperty('--border-w',    border + 'px');
    document.documentElement.style.setProperty('--tile-radius', radius + 'px');

    localStorage.setItem('customFont', font);
    localStorage.setItem('customFontSize', fontSize);
    localStorage.setItem('customBorder', border);
    localStorage.setItem('customRadius', radius);

    // Couleurs bulles de conversation
    const bubbleMeBg    = document.getElementById('c-bubble-me-bg')?.value    || '#18181b';
    const bubbleMeText  = document.getElementById('c-bubble-me-text')?.value  || '#ffffff';
    const bubbleOtherBg = document.getElementById('c-bubble-other-bg')?.value || '#ffffff';
    const bubbleOtherText=document.getElementById('c-bubble-other-text')?.value|| '#18181b';
    document.documentElement.style.setProperty('--bubble-me-bg',     bubbleMeBg);
    document.documentElement.style.setProperty('--bubble-me-text',   bubbleMeText);
    document.documentElement.style.setProperty('--bubble-other-bg',  bubbleOtherBg);
    document.documentElement.style.setProperty('--bubble-other-text',bubbleOtherText);
    localStorage.setItem('bubbleMeBg',     bubbleMeBg);
    localStorage.setItem('bubbleMeText',   bubbleMeText);
    localStorage.setItem('bubbleOtherBg',  bubbleOtherBg);
    localStorage.setItem('bubbleOtherText',bubbleOtherText);

    // Appliquer bordure dynamique
    document.querySelectorAll('input:not([type=range]):not([type=color]):not([type=file]):not([type=checkbox]):not([type=radio]), select, textarea').forEach(el => {
        el.style.borderWidth = border + 'px';
    });
}

// ── Mesure hauteur header → CSS var ──────────────────────────
function measureHeaderHeight() {
    const hdr = document.getElementById('fixed-header');
    if (!hdr) return;
    const h = hdr.offsetHeight + 4;
    document.documentElement.style.setProperty('--header-h', h + 'px');
}

// Observer les changements de taille du header (replié/déployé)
const _hdrObserver = new ResizeObserver(() => measureHeaderHeight());
document.addEventListener('DOMContentLoaded', () => {
    const hdr = document.getElementById('fixed-header');
    if (hdr) _hdrObserver.observe(hdr);
});

// ── Profil utilisateur ────────────────────────────────────────
async function loadProfile() {
    // D'abord remplir avec localStorage (instantané)
    const local = JSON.parse(localStorage.getItem('user') || '{}');
    const setVal = (id, val) => { const el = document.getElementById(id); if(el && val) el.value = val; };
    setVal('prof-firstname', local.firstname);
    setVal('prof-lastname',  local.lastname);
    setVal('prof-email',     local.email);
    setVal('prof-phone',     local.phone);
    setVal('prof-lang',      local.lang || 'fr');

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
            alert(typeof t==='function' ? t('profileSaved') : '✅ Profil enregistré.');
        } else {
            const txt = await res.text();
            alert('Erreur : ' + txt);
        }
    } catch(e) { alert(typeof t==='function' ? t('errorNetwork') : 'Erreur réseau'); }
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
    // Mettre à jour les boutons
    ['rect','rounded','circle'].forEach(s => {
        const btn = document.getElementById('dshape-' + s);
        if (!btn) return;
        const active = s === shape;
        btn.style.borderColor = active ? 'var(--accent)' : 'rgba(0,0,0,0.2)';
        btn.style.background  = active ? 'var(--accent)' : 'white';
        btn.style.color       = active ? 'white' : '#333';
    });
    // Appliquer --tile-radius en fonction de la forme
    const r = shape === 'circle' ? '50%' : shape === 'rounded' ? '12px' : '0px';
    document.documentElement.style.setProperty('--tile-radius', r);
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

    // Restaurer forme par défaut des tuiles
    const defShape = localStorage.getItem('defaultTileShape') || 'rect';
    setDefaultTileShape(defShape);

    // Restaurer image de fond
    const bgImg = localStorage.getItem('customBgImage');
    if (bgImg) { document.body.style.backgroundImage = `url(${bgImg})`; document.body.classList.add('has-bg-image'); }

    applySkin(n);
}

if (currentUser) {
    document.getElementById('auth-screen').classList.add('hidden');
    document.addEventListener('DOMContentLoaded', () => setTimeout(initApp, 200));
}

// ─── GROUPES : liste + sélection ─────────────────────────────────────────────
// Ordre des groupes persisté
let groupsOrder = JSON.parse(localStorage.getItem('groupsOrder') || '[]');

async function loadGroupsList() {
    const container = document.getElementById('groups-list-container');
    if (!container) return;
    container.innerHTML = '<p style="text-align:center;opacity:0.3;font-size:11px;margin-top:30px;">Chargement…</p>';
    try {
        const res = await fetchAuth('/api/groups/mine');
        if (!res.ok) { container.innerHTML = '<p style="text-align:center;opacity:0.4;margin-top:30px;">Erreur.</p>'; return; }
        const groups = await res.json();
        // Pas de groupes → afficher quand même la tuile "+"
        if (!groups.length) {
            container.innerHTML = `<div id="groups-grid"
                style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:2px;">
                <div onclick="uiCreateGroup(event)"
                     style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                            min-height:88px;cursor:pointer;border:2px dashed rgba(0,0,0,0.18);
                            background:rgba(0,0,0,0.02);color:rgba(0,0,0,0.28);touch-action:manipulation;">
                    <div style="font-size:26px;font-weight:100;line-height:1;margin-bottom:3px;">+</div>
                    <div style="font-size:7px;font-weight:900;text-transform:uppercase;">Nouveau</div>
                </div></div>`;
            _ensureTileDragGhost();
            return;
        }
        // Trier selon l'ordre mémorisé
        const ordered = [...groups].sort((a, b) => {
            const ia = groupsOrder.indexOf(a._id);
            const ib = groupsOrder.indexOf(b._id);
            if (ia === -1 && ib === -1) return 0;
            if (ia === -1) return 1; if (ib === -1) return -1;
            return ia - ib;
        });

        const roleFull = {owner:'Proprio', admin:'Admin', employe:'Employé', client:'Membre'};
        const groupTilesHtml = ordered.map(g => {
            const isActive = g._id === currentGroupId;
            const bg    = isActive ? 'var(--accent)' : '#fff';
            const color = isActive ? '#fff' : 'var(--accent)';
            const canEdit = g.myRole === 'owner' || g.myRole === 'admin';
            const logoHtml = g.logoUrl
                ? `<img src="${g.logoUrl}" style="width:28px;height:28px;object-fit:cover;border:1px solid rgba(0,0,0,0.1);margin-bottom:3px;">`
                : `<div style="width:28px;height:28px;background:rgba(0,0,0,0.07);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;margin-bottom:3px;">${g.name[0].toUpperCase()}</div>`;
            // Style de la tuile selon personnalisation
            const tColor  = g.tileColor     || (isActive ? 'var(--accent)' : '#fff');
            const tText   = g.tileTextColor || (isActive ? '#fff' : 'var(--accent)');
            const tShape  = g.tileShape     || 'rect';
            const tFont   = g.tileFontFamily|| '';
            const tFSize  = g.tileFontSize  || '8';
            const radius  = tShape === 'circle' ? '50%' : tShape === 'rounded' ? '12px' : '0px';
            const tileStyleExtra = `background:${tColor};color:${tText};border-radius:${radius};` +
                (tFont   ? `font-family:${tFont};` : '') +
                (tFSize  ? `font-size:${tFSize}px;` : '');

            return `<div id="tile-${g._id}"
                ontouchstart="tileTouch(event,'${g._id}')"
                ontouchmove="tileTouchMove(event)"
                ontouchend="tileTouchEnd(event,'${g._id}')"
                onclick="selectGroup('${g._id}')"
                style="${tileStyleExtra}
                       border:2px solid ${isActive?'var(--accent)':'rgba(0,0,0,0.18)'};
                       box-shadow:${isActive?'3px 3px 0 rgba(0,0,0,0.35)':'3px 3px 0 rgba(0,0,0,0.12)'};
                       padding:8px 5px 16px 5px;cursor:pointer;display:flex;flex-direction:column;
                       align-items:center;text-align:center;position:relative;
                       min-height:88px;justify-content:center;
                       user-select:none;-webkit-user-select:none;touch-action:none;overflow:hidden;">
                ${g.isPro ? `<span style="position:absolute;top:3px;right:3px;background:#18181b;color:#fff;font-size:6px;font-weight:900;padding:1px 3px;">PRO</span>
                             <span style="position:absolute;bottom:14px;right:3px;font-size:10px;opacity:0.4;">🛍️</span>` : ''}
                ${canEdit ? `<button onclick="event.stopPropagation();uiEditGroup('${g._id}')"
                    style="position:absolute;bottom:2px;left:3px;background:none;border:none;font-size:11px;cursor:pointer;opacity:0.5;padding:1px;touch-action:manipulation;">⚙️</button>` : ''}
                ${logoHtml}
                <div style="font-weight:900;text-transform:uppercase;line-height:1.2;word-break:break-word;padding:0 2px;pointer-events:none;">${g.name}</div>
            </div>`;
        }).join('');

        const addTileHtml = `<div onclick="uiCreateGroup(event)"
            style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                   min-height:88px;cursor:pointer;border:2px dashed rgba(0,0,0,0.18);
                   background:rgba(0,0,0,0.02);color:rgba(0,0,0,0.28);touch-action:manipulation;">
            <div style="font-size:26px;font-weight:100;line-height:1;margin-bottom:3px;">+</div>
            <div style="font-size:7px;font-weight:900;text-transform:uppercase;">Nouveau</div>
        </div>`;

        container.innerHTML = `<div id="groups-grid"
            style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:2px;touch-action:none;">
            ${addTileHtml}${groupTilesHtml}
        </div>`;
        _ensureTileDragGhost();

    } catch(err) { console.error('loadGroupsList:', err); }
}

// ── Drag & drop tactile avec fantôme visuel (style iOS) ─────────────────────
let _tileDragId = null, _tileDragEl = null;
let _tileTouchStartX = 0, _tileTouchStartY = 0, _tileMoved = false;
let _tileLongPress = null;

function _ensureTileDragGhost() {
    if (document.getElementById('tile-ghost')) return;
    const g = document.createElement('div');
    g.id = 'tile-ghost';
    g.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;opacity:0;' +
        'border:2px solid var(--accent);background:rgba(255,255,255,0.92);' +
        'box-shadow:4px 4px 0 rgba(0,0,0,0.25);overflow:hidden;' +
        'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
        'transition:opacity 0.1s;';
    document.body.appendChild(g);
}

function tileTouch(e, id) {
    _tileDragId = id;
    _tileTouchStartX = e.touches[0].clientX;
    _tileTouchStartY = e.touches[0].clientY;
    _tileMoved = false;
    _tileDragEl = document.getElementById('tile-' + id);
    if (_tileLongPress) clearTimeout(_tileLongPress);
    _tileLongPress = setTimeout(() => {
        if (!_tileMoved && _tileDragEl) {
            if (navigator.vibrate) navigator.vibrate(25);
            _tileDragEl.style.opacity = '0.4';
            const ghost = document.getElementById('tile-ghost');
            if (ghost) {
                // Ghost = même taille que la tuile réelle
                const rect = _tileDragEl.getBoundingClientRect();
                ghost.style.width  = rect.width + 'px';
                ghost.style.height = rect.height + 'px';
                ghost.innerHTML = _tileDragEl.innerHTML;
                ghost.style.left = rect.left + 'px';
                ghost.style.top  = rect.top  + 'px';
                ghost.style.opacity = '0.85';
            }
        }
    }, 320);
}

function tileTouchMove(e) {
    if (!_tileDragEl || !_tileDragId) return;
    const dx = Math.abs(e.touches[0].clientX - _tileTouchStartX);
    const dy = Math.abs(e.touches[0].clientY - _tileTouchStartY);
    if (dx > 8 || dy > 8) {
        if (_tileLongPress) { clearTimeout(_tileLongPress); _tileLongPress = null; }
        if (!_tileMoved) { _tileMoved = true; _tileDragEl.style.opacity = '0.3'; _tileDragEl.style.transform = 'scale(0.92)'; }
        e.preventDefault();
        const cx = e.touches[0].clientX, cy = e.touches[0].clientY;
        const ghost = document.getElementById('tile-ghost');
        if (ghost && parseFloat(ghost.style.opacity) > 0) {
            ghost.style.left = (cx - parseInt(ghost.style.width)/2) + 'px';
            ghost.style.top  = (cy - parseInt(ghost.style.height)/2) + 'px';
            ghost.style.opacity = '0.85';
        }
        const el = document.elementFromPoint(cx, cy);
        const target = el && el.closest('#groups-grid [id^="tile-"]');
        document.querySelectorAll('#groups-grid [id^="tile-"]').forEach(t => {
            t.style.outline = ''; if (t.id !== 'tile-' + _tileDragId) t.style.transform = '';
        });
        _tileDragEl.style.transform = 'scale(0.92)';
        if (target && target.id !== 'tile-' + _tileDragId) target.style.outline = '2px dashed var(--accent)';
    }
}

function tileTouchEnd(e, id) {
    if (_tileLongPress) { clearTimeout(_tileLongPress); _tileLongPress = null; }
    const ghost = document.getElementById('tile-ghost');
    if (ghost) ghost.style.opacity = '0';
    if (!_tileDragEl) { _tileDragId = null; _tileMoved = false; return; }
    _tileDragEl.style.opacity = '1'; _tileDragEl.style.transform = '';
    document.querySelectorAll('#groups-grid [id^="tile-"]').forEach(t => { t.style.outline = ''; t.style.transform = ''; });
    if (_tileMoved) {
        e.preventDefault();
        e.stopPropagation();
        // Bloquer le click suivant (évite d'entrer dans le groupe après un drag)
        window._tileJustDragged = true;
        setTimeout(() => { window._tileJustDragged = false; }, 300);

        const endEl = document.elementFromPoint(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
        const target = endEl && endEl.closest('#groups-grid [id^="tile-"]');
        if (target && target.id !== 'tile-' + _tileDragId) {
            const targetId = target.id.replace('tile-', '');
            const allIds = [...document.querySelectorAll('#groups-grid [id^="tile-"]')]
                .map(el => el.id.replace('tile-',''))
                .filter(tid => tid && tid.length > 5);
            const fi = allIds.indexOf(_tileDragId), ti = allIds.indexOf(targetId);
            if (fi !== -1 && ti !== -1) {
                allIds.splice(fi, 1); allIds.splice(ti, 0, _tileDragId);
                groupsOrder = allIds;
                localStorage.setItem('groupsOrder', JSON.stringify(groupsOrder));
                loadGroupsList();
            }
        }
    }
    _tileDragId = null; _tileDragEl = null; _tileMoved = false;
}

function initTileDragTouch() { _ensureTileDragGhost(); }
async function selectGroup(groupId) {
    // Ignorer si on vient de finir un drag (évite navigation accidentelle)
    if (window._tileJustDragged) return;
    // 1. Mettre à jour la source de vérité IMMÉDIATEMENT
    currentGroupId = groupId;
    localStorage.setItem('currentGroupId', groupId);

    // 2. Synchroniser le sel-group caché
    const selG = document.getElementById('sel-group');
    if (selG) selG.value = groupId;

    // 3. Charger la config du groupe
    try {
        const res = await fetchAuth('/api/groups/' + groupId + '/config');
        if (res.ok) {
            currentGroupConfig = await res.json();
        } else {
            currentGroupConfig = { type:'perso', isPro:false, hasRayons:false, myRole:'owner', name:'' };
        }
    } catch(e) {
        currentGroupConfig = { type:'perso', isPro:false, hasRayons:false, myRole:'owner', name:'' };
    }

    // 4. Mettre à jour le header avec le nom du groupe
    applyGroupConfig();
    updateVisualHeader();
    setUserDisplay();

    // 5. Charger les données (devices, postits, historique)
    await loadGroupData(groupId);

    // 6. Charger les membres (async, pas bloquant)
    loadMembers(groupId).catch(() => {});

    // 7. Rafraîchir la liste des groupes pour mettre en évidence le groupe actif
    loadGroupsList();

    // 8. Aller sur le chat
    goToPage(PAGE_CHAT);
    // Afficher les tuiles postits dans l'entête — géré aussi par navigation.js/goToPage
    const hpt    = document.getElementById('header-postit-tabs');
    const ptWrap = document.getElementById('header-title-wrap');
    const spacer = document.getElementById('header-spacer');
    if (hpt)    hpt.style.display    = 'flex';
    if (ptWrap) ptWrap.style.display = 'none';
    if (spacer) spacer.style.display = 'none';
}

function applyGroupConfig() {
    const cfg = currentGroupConfig || {};
    const canManageMembers = cfg.myRole === 'owner' || cfg.myRole === 'admin';

    const els = {
        'sel-dev-wrap':     false,           // masqué — rayon DEFAUT non visible
        'order-banner':     cfg.isPro,       // bandeau commande seulement si Pro
        'acc-rayons':       cfg.hasRayons,   // rayons dans params seulement si Pro multi-rayons
        'order-pro-fields': cfg.isPro,
        'acc-membres':      canManageMembers
    };
    Object.entries(els).forEach(([id, show]) => {
        const el = document.getElementById(id);
        if (el) el.style.display = show ? '' : 'none';
    });
}

async function uiInviteMember(e) {
    if (e) e.stopPropagation();
    const gid = currentGroupId;
    if (!gid) return alert("Sélectionnez un groupe d'abord (page Groupes).");
    const email = prompt("Email du membre à inviter :");
    if (!email || !email.includes('@')) return;
    const role = prompt("Rôle : client / employe / admin", "client") || "client";
    try {
        const res = await fetchAuth('/api/groups/' + gid + '/members', {
            method: 'POST',
            body: JSON.stringify({ email: email.trim(), role: role.trim() })
        });
        if (res.ok) { alert('✅ Membre ajouté.'); await loadMembers(gid); }
        else alert('Erreur : ' + await res.text());
    } catch(err) { console.error(err); }
}

async function loadMembers(groupId) {
    const container = document.getElementById('list-members');
    if (!container || !groupId) return;
    try {
        const res = await fetchAuth('/api/groups/' + groupId + '/members');
        if (!res.ok) {
            container.innerHTML = '<p style="font-size:10px;opacity:0.4;padding:8px;">Accès réservé au propriétaire.</p>';
            return;
        }
        const members = await res.json();
        if (!members.length) {
            container.innerHTML = '<p style="font-size:10px;opacity:0.4;padding:8px;">Aucun membre pour l\'instant.</p>';
            return;
        }
        const roleMap = {owner:'Propriétaire', admin:'Admin', employe:'Employé', client:'Client'};
        container.innerHTML = members.map(m => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 4px;border-bottom:1px solid rgba(0,0,0,0.08);">
                <div>
                    <div style="font-size:11px;font-weight:900;">${m.email}</div>
                    <div style="font-size:9px;opacity:0.5;text-transform:uppercase;">${roleMap[m.role]||m.role}</div>
                </div>
                <button onclick="removeMember('${groupId}','${m.email}')"
                        style="font-size:16px;background:none;border:none;cursor:pointer;opacity:0.4;padding:4px;">✕</button>
            </div>`).join('');
    } catch(err) { console.error('loadMembers:', err); }
}

async function removeMember(groupId, email) {
    if (!confirm('Retirer ' + email + ' du groupe ?')) return;
    try {
        const res = await fetchAuth('/api/groups/' + groupId + '/members/' + encodeURIComponent(email), { method: 'DELETE' });
        if (res.ok) await loadMembers(groupId);
        else alert('Erreur : ' + await res.text());
    } catch(err) { console.error(err); }
}

let touchStartX = 0;
let swipeConsumed = false;

function handleTouchStart(e, id) {
    touchStartX = e.touches[0].clientX;
    swipeConsumed = false;
    // Fermer toutes les autres lignes ouvertes et remettre leurs z-index
    document.querySelectorAll('[id^="swipe-"]').forEach(el => {
        if (el.id !== 'swipe-' + id) {
            el.style.transition = 'transform 0.2s ease';
            el.style.transform = 'translateX(0)';
            const otherId = el.id.replace('swipe-', '');
            showBtn(otherId, 'none');
        }
    });
}

function handleTouchMove(e, id) {
    const diffX = e.touches[0].clientX - touchStartX;
    if (Math.abs(diffX) > 8) {
        swipeConsumed = true;
        e.stopPropagation();
    }
    if (!swipeConsumed) return;
    const el = document.getElementById('swipe-' + id);
    if (!el) return;
    const clamped = Math.max(-44, Math.min(44, diffX));
    el.style.transition = 'none';
    el.style.transform = 'translateX(' + clamped + 'px)';
    // Afficher progressivement le bouton pendant le glissement
    const progress = Math.min(Math.abs(clamped) / 44, 1);
    if (diffX > 8) {
        const del = document.getElementById('del-' + id);
        if (del) { del.style.opacity = String(progress); del.style.pointerEvents = progress > 0.5 ? 'auto' : 'none'; }
        const edit = document.getElementById('edit-' + id);
        if (edit) { edit.style.opacity = '0'; edit.style.pointerEvents = 'none'; }
    } else if (diffX < -8) {
        const edit = document.getElementById('edit-' + id);
        if (edit) { edit.style.opacity = String(progress); edit.style.pointerEvents = progress > 0.5 ? 'auto' : 'none'; }
        const del = document.getElementById('del-' + id);
        if (del) { del.style.opacity = '0'; del.style.pointerEvents = 'none'; }
    }
}

function showBtn(id, side) {
    // side: 'del' ou 'edit'
    const del  = document.getElementById('del-'  + id);
    const edit = document.getElementById('edit-' + id);
    if (side === 'del') {
        if (del)  { del.style.opacity  = '1'; del.style.pointerEvents  = 'auto'; }
        if (edit) { edit.style.opacity = '0'; edit.style.pointerEvents = 'none'; }
    } else if (side === 'edit') {
        if (edit) { edit.style.opacity = '1'; edit.style.pointerEvents = 'auto'; }
        if (del)  { del.style.opacity  = '0'; del.style.pointerEvents  = 'none'; }
    } else {
        if (del)  { del.style.opacity  = '0'; del.style.pointerEvents  = 'none'; }
        if (edit) { edit.style.opacity = '0'; edit.style.pointerEvents = 'none'; }
    }
}

function handleTouchEnd(e, id) {
    if (swipeConsumed) e.stopPropagation();
    const diffX = e.changedTouches[0].clientX - touchStartX;
    const el = document.getElementById('swipe-' + id);
    if (!el) return;
    el.style.transition = 'transform 0.2s ease';
    if (diffX > 20) {
        el.style.transform = 'translateX(44px)';
        showBtn(id, 'del');
    } else if (diffX < -20) {
        el.style.transform = 'translateX(-44px)';
        showBtn(id, 'edit');
    } else {
        el.style.transform = 'translateX(0)';
        showBtn(id, 'none');
    }
    swipeConsumed = false;
}

function resetSwipe(id) {
    const el = document.getElementById('swipe-' + id);
    if (el) { el.style.transition = 'transform 0.2s ease'; el.style.transform = 'translateX(0)'; }
    showBtn(id, 'none');
}

async function deleteMessage(id) {
    resetSwipe(id);
    try {
        const res = await fetchAuth('/api/messages/' + id, { method: 'DELETE' });
        if (res.ok) { allMsgs = allMsgs.filter(m => m._id !== id); refreshView(); }
    } catch (err) { console.error(err); }
}

function editMessage(id) {
    resetSwipe(id);
    const msg = allMsgs.find(m => m._id === id);
    if (!msg || msg.type === 'image') return;

    const textSpan = document.getElementById('text-' + id);
    if (!textSpan) return;

    window._editingMessageId = id;
    const originalText = msg.content;
    textSpan.contentEditable = 'true';
    textSpan.style.background = '#ffffff';
    textSpan.style.color = '#000000';
    textSpan.style.outline = '2px solid #18181b';
    textSpan.style.padding = '1px 3px';
    textSpan.focus();
    const range = document.createRange();
    range.selectNodeContents(textSpan);
    range.collapse(false);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);

    const save = async () => {
        if (window._editingMessageId !== id) return;
        window._editingMessageId = null;
        const newText = textSpan.innerText.trim();
        textSpan.contentEditable = 'false';
        textSpan.style.background = '';
        textSpan.style.color = '';
        textSpan.style.outline = '';
        textSpan.style.padding = '';
        if (!newText || newText === originalText) { textSpan.innerText = originalText; return; }
        try {
            const res = await fetchAuth('/api/messages/' + id, {
                method: 'PATCH',
                body: JSON.stringify({ content: newText })
            });
            if (res.ok) { msg.content = newText; }
            else { textSpan.innerText = originalText; }
        } catch (err) { console.error(err); textSpan.innerText = originalText; }
    };
    textSpan.onkeydown = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); save(); }
        if (e.key === 'Escape') { window._editingMessageId = null; textSpan.contentEditable = 'false'; textSpan.style.background = ''; textSpan.style.color = ''; textSpan.style.outline = ''; textSpan.innerText = originalText; }
    };
    textSpan.onblur = save;
}

async function fetchAuth(url, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) {
        // Pas de token : rediriger vers login si pas déjà sur auth-screen
        console.warn('fetchAuth: token manquant pour', url);
        return new Response(JSON.stringify({message: 'Non authentifié'}), {status: 401});
    }
    const headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
    return fetch(url, { ...options, headers });
}

async function initApp() {
    socket = io({
        auth: {
            token: localStorage.getItem('token') 
        }
    });
    
    socket.on('new-message', m => { 
        allMsgs.unshift(m); 
        refreshView(true); 
    });
    
    socket.on('history-data', h => { 
        allMsgs = h; 
        refreshView(true); 
    });
    socket.on('message-updated', (data) => {
        const msg = allMsgs.find(m => m._id === data.messageId);
        if (msg) { msg.isNote = data.isNote; refreshView(false); }
    });
    socket.on('message-content-updated', (data) => {
        const msg = allMsgs.find(m => m._id === data.messageId);
        if (msg) { msg.content = data.newContent; refreshView(false); }
    });
    socket.on('message-deleted', (id) => {
        allMsgs = allMsgs.filter(m => m._id !== id);
        refreshView(false);
    });
	socket.on('line-checked-updated', (data) => {
		const msg = allMsgs.find(m => m._id === data.messageId);
		if (msg) {
			msg.checked = data.checked;
			// On ne force pas le refreshView ici si c'est nous qui venons de le faire, 
			// mais c'est utile pour les AUTRES utilisateurs connectés.
			refreshView(false);
		}
	});
	socket.on('postit-status-updated', (data) => {
		// Si on est sur le post-it concerné, on rafraîchit la vue
		const pSel = document.getElementById('sel-pos');
		if (pSel && pSel.value === data.postitId) {
			refreshView(false);
		}
	});
    applyHeaderState();
    setUserDisplay();
    initSkin();
    measureHeaderHeight();
    loadProfile();
    if (typeof initLang === 'function') initLang();
    await loadGroups();
    await refreshParamsLists();
    // Restaurer la config UI du dernier groupe visité
    if (currentGroupId) {
        try {
            const res = await fetchAuth('/api/groups/' + currentGroupId + '/config');
            if (res.ok) {
                currentGroupConfig = await res.json();
                applyGroupConfig();
                // Mettre à jour le badge GRP dans le header
                const stGrp = document.getElementById('st-grp');
                if (stGrp && currentGroupConfig.name) stGrp.innerText = currentGroupConfig.name.toUpperCase();
            }
        } catch(e) { console.warn('config restore:', e); }
    }
}

// --- UTILITAIRES ---
function truncate(str, limit = 30) {
    if (!str) return "";
    return str.length > limit ? str.substring(0, limit) + "..." : str;
}

// --- NOUVELLES FONCTIONS DE CRÉATION VIA BOUTON 3D ---
let lastCreatedId = null;

async function uiCreateGroup(e) {
    if(e) e.stopPropagation();
    document.getElementById('create-group-modal')?.remove();

    const modalHtml = `
    <div id="create-group-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9998;display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow-y:auto;">
        <div style="background:var(--bg);border:3px solid #18181b;box-shadow:6px 6px 0 #000;padding:20px;width:100%;max-width:380px;margin-top:20px;">
            <h3 style="font-size:14px;font-weight:900;text-transform:uppercase;margin-bottom:16px;">Nouveau Groupe</h3>

            <input type="text" id="cg-name" placeholder="Nom du groupe *"
                   style="width:100%;border:2px solid #18181b;padding:10px;font-size:13px;margin-bottom:12px;display:block;background:white;box-sizing:border-box;">

            <div onclick="toggleProFields()" id="cg-pro-label"
                 style="display:flex;align-items:center;gap:10px;cursor:pointer;margin-bottom:14px;
                        font-weight:900;font-size:12px;text-transform:uppercase;padding:10px;
                        background:white;border:2px solid #18181b;user-select:none;">
                <div id="cg-pro-box"
                     style="width:22px;height:22px;border:2px solid #18181b;flex-shrink:0;
                            display:flex;align-items:center;justify-content:center;
                            font-size:16px;font-weight:900;background:white;"></div>
                <input type="checkbox" id="cg-pro" style="display:none;">
                Groupe Professionnel (payant)
            </div>

            <div id="cg-pro-fields" style="display:none;border-top:2px solid rgba(0,0,0,0.15);padding-top:12px;margin-bottom:4px;">
                <div style="font-size:9px;font-weight:900;text-transform:uppercase;opacity:0.5;margin-bottom:8px;">Informations entreprise</div>
                <input type="text"  id="cg-company"  placeholder="Nom entreprise"      style="width:100%;border:2px solid #18181b;padding:8px;font-size:12px;margin-bottom:6px;display:block;background:white;box-sizing:border-box;">
                <input type="text"  id="cg-siret"    placeholder="SIRET (optionnel)"   style="width:100%;border:2px solid #18181b;padding:8px;font-size:12px;margin-bottom:6px;display:block;background:white;box-sizing:border-box;">
                <input type="tel"   id="cg-phone"    placeholder="Téléphone"           style="width:100%;border:2px solid #18181b;padding:8px;font-size:12px;margin-bottom:6px;display:block;background:white;box-sizing:border-box;">
                <input type="email" id="cg-email"    placeholder="Email professionnel" style="width:100%;border:2px solid #18181b;padding:8px;font-size:12px;margin-bottom:6px;display:block;background:white;box-sizing:border-box;">
            </div>

            <div style="border-top:2px solid rgba(0,0,0,0.1);padding-top:10px;margin-bottom:4px;">
                <div style="font-size:9px;font-weight:900;text-transform:uppercase;opacity:0.5;margin-bottom:4px;">Logo du groupe (optionnel)</div>
                <input type="file" id="cg-logo" accept="image/*" style="width:100%;border:2px solid #18181b;padding:6px;font-size:12px;margin-bottom:4px;display:block;background:white;box-sizing:border-box;">
            </div>

            <div style="display:flex;gap:8px;margin-top:16px;">
                <button onclick="document.getElementById('create-group-modal').remove()"
                        style="flex:1;padding:12px;border:2px solid #18181b;background:white;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">Annuler</button>
                <button onclick="submitCreateGroup()"
                        style="flex:1;padding:12px;background:#18181b;color:white;border:none;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">Créer</button>
            </div>
        </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    setTimeout(() => document.getElementById('cg-name')?.focus(), 100);
}

function toggleProFields() {
    const cb  = document.getElementById('cg-pro');
    const box = document.getElementById('cg-pro-box');
    const lbl = document.getElementById('cg-pro-label');
    const fields = document.getElementById('cg-pro-fields');
    if (!cb) return;
    cb.checked = !cb.checked;
    const isPro = cb.checked;
    if (box) { box.innerHTML = isPro ? '✕' : ''; box.style.background = isPro ? '#18181b' : 'white'; box.style.color = '#fff'; }
    if (lbl) { lbl.style.background = isPro ? '#f5f5f5' : 'white'; }
    if (fields) fields.style.display = isPro ? '' : 'none';
}

async function submitCreateGroup() {
    const name = document.getElementById('cg-name')?.value?.trim();
    if (!name) return alert("Le nom du groupe est obligatoire.");

    const isPro = document.getElementById('cg-pro')?.checked || false;
    const payload = {
        name,
        type: isPro ? 'pro' : 'perso',
        siret:    document.getElementById('cg-siret')?.value?.trim() || '',
        phonePro: document.getElementById('cg-phone')?.value?.trim() || '',
        emailPro: document.getElementById('cg-email')?.value?.trim() || ''
    };

    // Upload logo si présent
    const logoFile = document.getElementById('cg-logo')?.files?.[0];
    if (logoFile) {
        try {
            const formData = new FormData();
            formData.append('file', logoFile);
            const token = localStorage.getItem('token');
            const upRes = await fetch('/api/upload', { method:'POST', headers:{'Authorization':`Bearer ${token}`}, body: formData });
            if (upRes.ok) { const d = await upRes.json(); payload.logoUrl = d.url; }
        } catch(e) { console.warn('upload logo:', e); }
    }

    const res = await fetchAuth('/api/groups', { method: 'POST', body: JSON.stringify(payload) });
    document.getElementById('create-group-modal')?.remove();

    if (res.ok) {
        const newGroup = await res.json();
        // Créer uniquement le rayon DEFAUT (conteneur technique invisible en UI)
        try {
            await fetchAuth('/api/devices', { method:'POST', body: JSON.stringify({ name:"DEFAUT", groupId: newGroup._id }) });
        } catch(e) { console.warn('rayon DEFAUT:', e); }
        await loadGroups(newGroup._id);
        loadGroupsList();
        setTimeout(() => { if (typeof refreshParamsLists==='function') refreshParamsLists(); }, 300);
    } else {
        alert('Erreur : ' + await res.text());
    }
}

// ═══════════════════════════════════════════════════════
// ÉDITION GROUPE ⚙️
// ═══════════════════════════════════════════════════════
async function uiEditGroup(groupId) {
    document.getElementById('group-modal')?.remove();
    try {
        const res = await fetchAuth('/api/groups/' + groupId + '/config');
        if (!res.ok) return alert('Erreur chargement groupe');
        const g = await res.json();
        _openGroupEditModal(groupId, g);
    } catch(e) { console.error(e); }
}

function _openGroupEditModal(groupId, g) {
    const isPro   = g.isPro || false;
    const isOwner = g.myRole === 'owner';
    const v = (f, def='') => g[f] || def;
    const modalHtml = `
    <div id="group-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9998;display:flex;align-items:flex-start;justify-content:center;padding:14px;overflow-y:auto;">
      <div style="background:var(--bg);border:3px solid var(--accent);box-shadow:6px 6px 0 rgba(0,0,0,0.4);padding:18px;width:100%;max-width:400px;margin-top:18px;">
        <h3 style="font-size:13px;font-weight:900;text-transform:uppercase;margin-bottom:12px;">⚙️ ${v('name','Groupe')}</h3>
        <div style="font-size:8px;font-weight:900;opacity:0.5;text-transform:uppercase;margin-bottom:3px;">Nom</div>
        <input type="text" id="gm-name" value="${v('name')}" style="width:100%;border:2px solid var(--accent);padding:9px;font-size:13px;margin-bottom:9px;background:white;box-sizing:border-box;">
        <div style="font-size:8px;font-weight:900;opacity:0.5;text-transform:uppercase;margin-bottom:3px;">Logo</div>
        ${g.logoUrl ? `<img src="${g.logoUrl}" style="width:38px;height:38px;object-fit:cover;border:2px solid var(--accent);margin-bottom:5px;display:block;">` : ''}
        <input type="file" id="gm-logo" accept="image/*" style="width:100%;border:2px solid rgba(0,0,0,0.15);padding:5px;font-size:11px;margin-bottom:9px;background:white;box-sizing:border-box;">
        ${isPro ? `
        <div style="border-top:2px solid rgba(0,0,0,0.1);padding-top:9px;margin-bottom:9px;">
          <div style="font-size:8px;font-weight:900;opacity:0.5;text-transform:uppercase;margin-bottom:6px;">Infos entreprise</div>
          <input type="text" id="gm-company" value="${v('company')}" placeholder="Société" style="width:100%;border:2px solid rgba(0,0,0,0.15);padding:7px;font-size:12px;margin-bottom:5px;background:white;box-sizing:border-box;">
          <div style="display:flex;gap:5px;margin-bottom:5px;">
            <input type="text" id="gm-cp"    value="${v('cp')}"    placeholder="CP"    style="flex:1;border:2px solid rgba(0,0,0,0.15);padding:7px;font-size:12px;background:white;box-sizing:border-box;">
            <input type="text" id="gm-ville" value="${v('ville')}" placeholder="Ville" style="flex:2;border:2px solid rgba(0,0,0,0.15);padding:7px;font-size:12px;background:white;box-sizing:border-box;">
          </div>
          <input type="tel"   id="gm-phone" value="${v('phonePro')}" placeholder="Téléphone" style="width:100%;border:2px solid rgba(0,0,0,0.15);padding:7px;font-size:12px;margin-bottom:5px;background:white;box-sizing:border-box;">
          <input type="email" id="gm-email" value="${v('emailPro')}" placeholder="Email"      style="width:100%;border:2px solid rgba(0,0,0,0.15);padding:7px;font-size:12px;margin-bottom:5px;background:white;box-sizing:border-box;">
          <input type="text"  id="gm-siret" value="${v('siret')}"   placeholder="SIRET"      style="width:100%;border:2px solid rgba(0,0,0,0.15);padding:7px;font-size:12px;background:white;box-sizing:border-box;">
        </div>` : ''}
        <div style="border-top:2px solid rgba(0,0,0,0.1);padding-top:9px;margin-bottom:9px;">
          <div style="font-size:8px;font-weight:900;opacity:0.5;text-transform:uppercase;margin-bottom:6px;">${isPro ? 'Membres & Droits' : 'Participants'}</div>
          <div id="members-matrix-wrap" style="font-size:10px;color:#888;min-height:24px;">Chargement…</div>
          <div style="display:flex;gap:5px;margin-top:7px;">
            <input type="email" id="new-member-email" placeholder="${isPro?'Inviter par email…':'Ajouter participant…'}"
                   style="flex:1;border:2px solid rgba(0,0,0,0.15);padding:7px;font-size:11px;background:white;box-sizing:border-box;">
            <button onclick="addMemberToMatrix('${groupId}')" style="padding:7px 11px;background:var(--accent);color:white;border:none;font-weight:900;font-size:11px;cursor:pointer;">+</button>
          </div>
        </div>
        <!-- ── Personnalisation de la tuile ──────────────────── -->
        <div style="border-top:2px solid rgba(0,0,0,0.1);padding-top:9px;margin-bottom:9px;">
          <div style="font-size:8px;font-weight:900;opacity:0.5;text-transform:uppercase;margin-bottom:8px;">🎨 Apparence de la tuile</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
            <label style="font-size:7px;font-weight:900;text-transform:uppercase;display:flex;flex-direction:column;gap:3px;">
              Fond tuile
              <input type="color" id="gm-tile-color" value="${g.tileColor||'#ffffff'}"
                     style="width:100%;height:28px;border:2px solid rgba(0,0,0,0.15);padding:0;cursor:pointer;">
            </label>
            <label style="font-size:7px;font-weight:900;text-transform:uppercase;display:flex;flex-direction:column;gap:3px;">
              Texte tuile
              <input type="color" id="gm-tile-text" value="${g.tileTextColor||'#18181b'}"
                     style="width:100%;height:28px;border:2px solid rgba(0,0,0,0.15);padding:0;cursor:pointer;">
            </label>
          </div>
          <div style="font-size:7px;font-weight:900;text-transform:uppercase;opacity:0.5;margin-bottom:4px;">Forme</div>
          <div style="display:flex;gap:6px;margin-bottom:8px;">
            ${['rect','rounded','circle'].map(s => `
            <button onclick="selectTileShape('${s}')" id="gm-shape-${s}"
              style="flex:1;padding:6px 4px;border:2px solid ${(g.tileShape||'rect')===s?'var(--accent)':'rgba(0,0,0,0.15)'};
                     background:${(g.tileShape||'rect')===s?'var(--accent)':'white'};
                     color:${(g.tileShape||'rect')===s?'white':'#333'};
                     font-size:9px;font-weight:900;cursor:pointer;
                     border-radius:${s==='circle'?'50%':s==='rounded'?'6px':'0'};
                     text-transform:uppercase;">${s==='rect'?'■ Rect':s==='rounded'?'▢ Arrondi':'● Cercle'}</button>`).join('')}
          </div>
          <input type="hidden" id="gm-tile-shape" value="${g.tileShape||'rect'}">
          <div style="font-size:7px;font-weight:900;text-transform:uppercase;opacity:0.5;margin-bottom:4px;">Police</div>
          <select id="gm-tile-font" style="width:100%;padding:7px;border:2px solid rgba(0,0,0,0.15);font-size:11px;background:white;margin-bottom:8px;">
            <option value="" ${!g.tileFontFamily?'selected':''}>Défaut</option>
            <option value="sans-serif" ${g.tileFontFamily==='sans-serif'?'selected':''}>Sans-serif</option>
            <option value="Georgia,serif" ${g.tileFontFamily==='Georgia,serif'?'selected':''}>Georgia</option>
            <option value="Courier New,monospace" ${g.tileFontFamily==='Courier New,monospace'?'selected':''}>Courier</option>
          </select>
          <div style="font-size:7px;font-weight:900;text-transform:uppercase;opacity:0.5;margin-bottom:4px;">Taille texte : <span id="gm-tile-fsize-val">${g.tileFontSize||'8'}</span>px</div>
          <input type="range" id="gm-tile-fsize" min="7" max="14" value="${g.tileFontSize||'8'}"
                 oninput="document.getElementById('gm-tile-fsize-val').textContent=this.value"
                 style="width:100%;margin-bottom:4px;accent-color:var(--accent);">
        </div>

        ${isOwner ? `<div style="border-top:2px solid rgba(220,38,38,0.15);padding-top:7px;margin-bottom:7px;">
          <button onclick="confirmDeleteGroup('${groupId}')" style="width:100%;padding:8px;background:#fff;color:#dc2626;border:2px solid #dc2626;font-weight:900;font-size:10px;text-transform:uppercase;cursor:pointer;">🗑️ Supprimer ce groupe</button>
        </div>` : ''}
        <div style="display:flex;gap:8px;">
          <button onclick="document.getElementById('group-modal').remove()" style="flex:1;padding:11px;border:2px solid var(--accent);background:white;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">Annuler</button>
          <button onclick="submitEditGroup('${groupId}')" style="flex:1;padding:11px;background:var(--accent);color:white;border:none;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">Modifier</button>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    setTimeout(() => { document.getElementById('gm-name')?.focus(); loadMembersMatrix(groupId, isPro); }, 80);
}

async function loadMembersMatrix(groupId, isPro) {
    const wrap = document.getElementById('members-matrix-wrap');
    if (!wrap) return;
    try {
        const res = await fetchAuth('/api/groups/' + groupId + '/members');
        if (!res.ok) { wrap.innerHTML = '<em style="opacity:0.4;">Erreur</em>'; return; }
        const members = await res.json();
        if (!members.length) { wrap.innerHTML = '<em style="opacity:0.4;font-size:10px;">Aucun membre</em>'; return; }
        if (isPro) {
            wrap.innerHTML = `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:10px;min-width:260px;">
              <thead><tr style="border-bottom:2px solid var(--accent);">
                <th style="text-align:left;padding:4px 2px;font-size:7px;text-transform:uppercase;opacity:0.5;">Email</th>
                <th style="padding:4px 3px;font-size:7px;text-transform:uppercase;opacity:0.5;text-align:center;">Admin</th>
                <th style="padding:4px 3px;font-size:7px;text-transform:uppercase;opacity:0.5;text-align:center;">Employé</th>
                <th style="padding:4px 3px;font-size:7px;text-transform:uppercase;opacity:0.5;text-align:center;">Client</th>
                <th style="width:22px;"></th>
              </tr></thead>
              <tbody>${members.map(m => {
                const key = m.email.replace(/[@.]/g,'-');
                return `<tr style="border-bottom:1px solid rgba(0,0,0,0.06);">
                  <td style="padding:5px 2px;font-size:9px;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${m.email}">${m.email.split('@')[0]}</td>
                  <td style="text-align:center;padding:4px 3px;"><input type="radio" name="role-${key}" value="admin" ${m.role==='admin'?'checked':''} onchange="setMemberRole('${groupId}','${m.email}','admin')" style="width:16px;height:16px;cursor:pointer;margin:0;accent-color:var(--accent);"></td>
                  <td style="text-align:center;padding:4px 3px;"><input type="radio" name="role-${key}" value="employe" ${m.role==='employe'?'checked':''} onchange="setMemberRole('${groupId}','${m.email}','employe')" style="width:16px;height:16px;cursor:pointer;margin:0;accent-color:var(--accent);"></td>
                  <td style="text-align:center;padding:4px 3px;"><input type="radio" name="role-${key}" value="client" ${m.role==='client'?'checked':''} onchange="setMemberRole('${groupId}','${m.email}','client')" style="width:16px;height:16px;cursor:pointer;margin:0;accent-color:var(--accent);"></td>
                  <td style="text-align:center;"><button onclick="removeMemberFromMatrix('${groupId}','${m.email}')" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:15px;line-height:1;padding:2px;">×</button></td>
                </tr>`;
              }).join('')}</tbody></table></div>`;
        } else {
            wrap.innerHTML = members.map(m => `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid rgba(0,0,0,0.05);">
                <span style="flex:1;font-size:10px;">${m.email}</span>
                <button onclick="removeMemberFromMatrix('${groupId}','${m.email}')" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:16px;padding:2px;">×</button>
            </div>`).join('');
        }
    } catch(e) { wrap.innerHTML = '<em style="opacity:0.4;font-size:10px;">Erreur</em>'; }
}

async function addMemberToMatrix(groupId) {
    const email = document.getElementById('new-member-email')?.value?.trim();
    if (!email || !email.includes('@')) return alert('Email invalide.');
    const res = await fetchAuth('/api/groups/' + groupId + '/members', { method:'POST', body: JSON.stringify({ email, role: 'client' }) });
    if (res.ok) { document.getElementById('new-member-email').value = ''; loadMembersMatrix(groupId, currentGroupConfig?.isPro); }
    else { const t = await res.text(); alert(t.includes('déjà') ? 'Déjà membre.' : 'Erreur : ' + t); }
}
async function setMemberRole(groupId, email, role) {
    await fetchAuth('/api/groups/' + groupId + '/members/' + encodeURIComponent(email), { method:'PUT', body: JSON.stringify({ role }) });
}
async function removeMemberFromMatrix(groupId, email) {
    const res = await fetchAuth('/api/groups/' + groupId + '/members/' + encodeURIComponent(email), { method:'DELETE' });
    if (res.ok) loadMembersMatrix(groupId, currentGroupConfig?.isPro);
}
function selectTileShape(shape) {
    document.getElementById('gm-tile-shape').value = shape;
    ['rect','rounded','circle'].forEach(s => {
        const btn = document.getElementById('gm-shape-' + s);
        if (!btn) return;
        const active = s === shape;
        btn.style.borderColor  = active ? 'var(--accent)' : 'rgba(0,0,0,0.15)';
        btn.style.background   = active ? 'var(--accent)' : 'white';
        btn.style.color        = active ? 'white' : '#333';
    });
}

async function submitEditGroup(groupId) {
    const name = document.getElementById('gm-name')?.value?.trim();
    if (!name) return alert(typeof t==='function' ? t('nameRequired') : 'Le nom est obligatoire.');
    const payload = { name,
        company: document.getElementById('gm-company')?.value?.trim()||'',
        cp:      document.getElementById('gm-cp')?.value?.trim()||'',
        ville:   document.getElementById('gm-ville')?.value?.trim()||'',
        phonePro:document.getElementById('gm-phone')?.value?.trim()||'',
        emailPro:document.getElementById('gm-email')?.value?.trim()||'',
        siret:   document.getElementById('gm-siret')?.value?.trim()||'',
        tileColor:      document.getElementById('gm-tile-color')?.value  || '',
        tileTextColor:  document.getElementById('gm-tile-text')?.value   || '',
        tileShape:      document.getElementById('gm-tile-shape')?.value  || 'rect',
        tileFontFamily: document.getElementById('gm-tile-font')?.value   || '',
        tileFontSize:   document.getElementById('gm-tile-fsize')?.value  || '8',
    };
    const logoFile = document.getElementById('gm-logo')?.files?.[0];
    if (logoFile) {
        try {
            const fd = new FormData(); fd.append('file', logoFile);
            const token = localStorage.getItem('token');
            const r = await fetch('/api/upload', { method:'POST', headers:{'Authorization':`Bearer ${token}`}, body:fd });
            if (r.ok) { const d = await r.json(); payload.logoUrl = d.url; }
        } catch(e) {}
    }
    const res = await fetchAuth('/api/groups/' + groupId, { method:'PUT', body: JSON.stringify(payload) });
    document.getElementById('group-modal')?.remove();
    if (res.ok) { await loadGroups(groupId); loadGroupsList(); }
    else alert('Erreur : ' + await res.text());
}
function confirmDeleteGroup(groupId) {
    const modal = document.getElementById('group-modal');
    if (!modal) return;
    const inner = modal.querySelector('div');
    if (inner) inner.innerHTML = `<div style="padding:22px;text-align:center;">
        <div style="font-size:32px;margin-bottom:12px;">⚠️</div>
        <div style="font-size:13px;font-weight:900;text-transform:uppercase;margin-bottom:8px;">${t('deleteGroupConfirm')}</div>
        <div style="font-size:10px;opacity:0.5;margin-bottom:20px;">${t('deleteGroupMsg')}</div>
        <div style="display:flex;gap:8px;">
          <button onclick="document.getElementById('group-modal').remove()" style="flex:1;padding:12px;border:2px solid var(--accent);background:white;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">${t('cancel')}</button>
          <button onclick="executeDeleteGroup('${groupId}')" style="flex:1;padding:12px;background:#dc2626;color:white;border:none;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">${t('deleteBtn')}</button>
        </div></div>`;
}
async function executeDeleteGroup(groupId) {
    document.getElementById('group-modal')?.remove();
    const res = await fetchAuth('/api/groups/' + groupId, { method:'DELETE' });
    if (res.ok) {
        currentGroupId = null; currentGroupConfig = null;
        localStorage.removeItem('currentGroupId');
        await loadGroups(); loadGroupsList();
    } else alert('Erreur : ' + await res.text());
}


async function uiCreateDevice(e) {
    if(e) e.stopPropagation();
    
    // On récupère les éléments DOM
    const selGroup = document.getElementById('sel-group');
    const user = JSON.parse(localStorage.getItem('user'));

    // Vérifications de base avant d'ouvrir le prompt
    if (!selGroup || !selGroup.value) return alert("Sélectionnez un groupe d'abord.");
    if (!user || !user.email) return alert("Session expirée.");

    const gid = selGroup.value;

    openCustomPrompt("Nom du nouveau rayon", "", async (name) => {
        if(!name || name.trim() === "") return;

        try {
            const res = await fetchAuth('/api/devices', { 
                method: 'POST', 
                body: JSON.stringify({ 
                    groupId: gid, 
                    name: name.trim(), 
                    mac: "00"
                })
            });

            if(!res.ok) {
                const errorText = await res.text();
                throw new Error(errorText || "Erreur serveur");
            }

            const data = await res.json();
            lastCreatedId = data._id; 

            // On rafraîchit les données sans tout bloquer
            loadGroupData(gid); 
            refreshParamsLists();

            // Message de succès discret ou ouverture de l'accordéon
            const checkD = document.getElementById('check-d');
            if (checkD) checkD.checked = true;

            setTimeout(() => { lastCreatedId = null; }, 2000);

        } catch (err) {
            console.error("DEBUG CRÉATION RAYON:", err);
            alert("Erreur : " + err.message);
        }
    });
}

function openCustomPrompt(title, defaultValue, onConfirm) {
    document.getElementById('prompt-title').innerText = title;
    const input = document.getElementById('prompt-input');
    input.value = defaultValue;
    document.getElementById('custom-prompt-modal').classList.remove('hidden');
    input.focus();
    
    // On lie le bouton valider à l'action
    document.getElementById('prompt-confirm-btn').onclick = () => {
        onConfirm(input.value);
        closeCustomPrompt();
    };
}

function closeCustomPrompt() {
    document.getElementById('custom-prompt-modal').classList.add('hidden');
}

function closeOrderModal() {
    const modal = document.getElementById('order-modal');
    if(modal) modal.classList.add('hidden');
}

function renderSettingList(elementId, items, currentId, deleteFnName) {
    const container = document.getElementById(elementId);
    if (!container) return;
    
    // --- CORRECTIF : GESTION DU VIDE ---
    // Si la liste est vide ou nulle, on affiche un message et on s'arrête
    if (!items || items.length === 0) {
        container.innerHTML = `
            <div class="p-4 text-center opacity-30 italic text-[10px] uppercase tracking-widest">
                Aucun élément
            </div>`;
        return;
    }

    // On récupère l'utilisateur pour savoir si on affiche le code
    const user = JSON.parse(localStorage.getItem('user'));
    
    let type = '';
    if (deleteFnName.includes('Group')) type = 'group';
    else if (deleteFnName.includes('Device')) type = 'device';
    else if (deleteFnName.includes('Postit')) type = 'postit';

    container.innerHTML = items.map(item => {
        const isSelected = item._id === currentId;
        const isNew = (typeof lastCreatedId !== 'undefined' && item._id === lastCreatedId);
        const flashClass = isNew ? 'new-item-flash' : '';
        
        // --- LOGIQUE D'AFFICHAGE INTELLIGENTE ---
        let displayName = item.name || item.orderNumber || "Sans nom";
        let prefix = isSelected ? '→ ' : '';
        
        // Si c'est un groupe et que je suis le proprio : on affiche le badge CODE
        if (type === 'group' && item.joinCode && user && item.ownerEmail === user.email) {
            displayName = `<span class="text-black font-black">${displayName}</span> <span class="ml-1 bg-black text-white px-1 text-[8px] rounded">CODE: ${item.joinCode}</span>`;
        }

        return `
        <div class="flex items-center p-3 mb-1 ${isSelected ? 'bg-black/5 font-black' : 'opacity-50'} ${flashClass}">
            <span class="text-[10px] uppercase tracking-wider mr-3 flex-grow">${prefix}${displayName}</span>
            <div class="flex items-center gap-1">
                <button onclick="event.stopPropagation(); editName('${type}', '${item._id}', '${(item.name || item.orderNumber || "").replace(/'/g, "\\'")}')" class="btn-edit">🖍️</button>
                <button 
                    onclick="event.stopPropagation(); if(this.dataset.confirm!=='1'){ this.dataset.confirm='1'; this.style.opacity='1'; setTimeout(()=>{ this.dataset.confirm=''; this.style.opacity='0.5'; }, 2000); } else { this.dataset.confirm=''; ${deleteFnName}('${item._id}'); }" 
                    style="font-size:16px;background:none;border:none;cursor:pointer;opacity:0.5;padding:4px;" title="Supprimer">🗑️</button>
            </div>
        </div>`;
    }).join('');
}

async function syncSelection(type, id) {
    const gid = id || currentGroupId || document.getElementById('sel-group')?.value;

    if (type === 'group' && gid && gid !== currentGroupId) {
        // Groupe changé : recharger la config
        currentGroupId = gid;
        localStorage.setItem('currentGroupId', gid);
        try {
            const res = await fetchAuth('/api/groups/' + gid + '/config');
            if (res.ok) { currentGroupConfig = await res.json(); applyGroupConfig(); }
        } catch(e) {}
        await loadGroupData(gid);
        if (typeof loadMembers === 'function') await loadMembers(gid);
    } else if (type === 'group') {
        await loadGroupData(gid);
    } else if (type === 'dev') {
        await loadGroupData(gid);
    }

    updateVisualHeader();
    const pid = document.getElementById('sel-pos')?.value;
    if (socket && gid) socket.emit('get-history', { groupId: gid, postitId: pid || undefined });
    if (typeof updateBadge === 'function') updateBadge();
    if (typeof refreshParamsLists === 'function') refreshParamsLists();
}

async function refreshParamsLists() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || !user.email) return;

    // TOUJOURS utiliser currentGroupId comme source de vérité
    let currentGid = currentGroupId || localStorage.getItem('currentGroupId');

    // 1. Charger les GROUPES (proprio + membre)
    const gRes = await fetchAuth('/api/groups/mine');
    const groups = await gRes.json();

    // Synchroniser sel-group (caché) avec currentGroupId
    const selGroup = document.getElementById('sel-group');
    if (selGroup) {
        selGroup.innerHTML = groups.map(g => `<option value="${g._id}">${g.name}</option>`).join('');
        if (currentGid) selGroup.value = currentGid;
    }

    // Si toujours pas de groupe, prendre le premier
    if (!currentGid && groups.length > 0) {
        currentGid = groups[0]._id;
        currentGroupId = currentGid;
        localStorage.setItem('currentGroupId', currentGid);
    }

    // Affichage de la liste des groupes dans les paramètres
    renderSettingList('list-groups-del', groups, currentGid, 'deleteGroup');

    // --- SÉCURITÉ : SI PAS DE GROUPE, ON VIDE TOUT ET ON S'ARRÊTE ---
    if (!currentGid || currentGid === "") {
        const listDevs = document.getElementById('list-devs-del');
        const listPos = document.getElementById('list-postits-del');
        if (listDevs) listDevs.innerHTML = '<div class="p-3 text-gray-400 italic text-[10px]">Aucun rayon</div>';
        if (listPos) listPos.innerHTML = '<div class="p-3 text-gray-400 italic text-[10px]">Aucun client</div>';
        return; // On stoppe ici, pas besoin de fetch les rayons d'un groupe inexistant
    }

    // 3. Chargement des RAYONS (On arrive ici seulement si currentGid existe)
    try {
        const dRes = await fetchAuth(`/api/devices?groupId=${currentGid}`);
        const devs = await dRes.json();
        const selDev = document.getElementById('sel-dev');
        const currentDid = selDev ? selDev.value : null;
        renderSettingList('list-devs-del', devs, currentDid, 'deleteDevice');

        // 4. Chargement des POST-ITS
        const listPos = document.getElementById('list-postits-del');
        if (currentDid && currentDid !== "") {
            const pRes = await fetchAuth(`/api/postits?deviceId=${currentDid}`);
            const ps = await pRes.json();
            const selPos = document.getElementById('sel-pos');
            const currentPid = selPos ? selPos.value : null;
            renderSettingList('list-postits-del', ps, currentPid, 'deletePostit');
        } else {
            // Si pas de rayon sélectionné, on vide la liste des post-its
            if (listPos) listPos.innerHTML = '<div class="p-3 text-gray-400 italic text-[10px]">Aucun client</div>';
        }
    } catch (err) {
        console.error("Erreur refreshParamsLists:", err);
    }
}

async function resetDateFilter() {
    const dateInput = document.getElementById('filter-date');
    if (dateInput) {
        dateInput.value = ""; // Efface le filtre date
        const currentGroup = currentGroupId || document.getElementById('sel-group')?.value;
        if (currentGroup) {
            // 1. Recharge la liste des clients sans filtre
            await loadGroupData(currentGroup);
            // 2. Met à jour l'input date avec la date du premier client de la nouvelle liste
            await updateFilterDateFromPostit();
        }
    }
}

async function loadGroups(idToSelect = null) {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || !user.email) return;

    try {
		const res = await fetchAuth(`/api/groups`);
        const groups = await res.json();
        const sel = document.getElementById('sel-group');

        if (sel && groups.length > 0) {
            sel.innerHTML = groups.map(g => `<option value="${g._id}">${g.name}</option>`).join('');
            const targetId = idToSelect || currentGroupId || sel.value || groups[0]._id;
            sel.value = targetId;
            if (!currentGroupId) { currentGroupId = targetId; localStorage.setItem('currentGroupId', targetId); }

            // Charger les données du groupe
            await loadGroupData(targetId);
            
        } else if (sel) {
            sel.innerHTML = '<option value="">Aucun groupe</option>';
            sel.value = "";
            updateVisualHeader();
        }

        // Bloc LISTDIV (Paramètres) inchangé
        const listDiv = document.getElementById('list-groups-del');
        if (listDiv) {
            listDiv.innerHTML = groups.length > 0 ? groups.map(g => {
                const isSelected = (sel && sel.value === g._id);
                const prefix = isSelected ? '→ ' : '';
                return `<div class="flex justify-between items-center p-2 border-b border-black/10 text-[10px] font-black uppercase ${isSelected ? 'bg-black/5' : ''}">
                    <span>${prefix}${g.name}</span>
                    <button onclick="deleteGroup('${g._id}')" class="text-red-600 font-bold px-2">✕</button>
                </div>`;
            }).join('') : '<div class="p-3 text-gray-400 italic text-[10px]">Aucun groupe créé</div>';
        }
    } catch (err) { console.error("Erreur loadGroups:", err); }
}


// ═══════════════════════════════════════════════════════════════════════
// TUILES POSTITS — rangée horizontale dans le chat
// ═══════════════════════════════════════════════════════════════════════

// Postit actuellement sélectionné (id)
let currentPostitId = null;
// Cache des postits du groupe courant
let _cachedPostits = [];

// ── Rendu de la rangée de tuiles ─────────────────────────────────────────────
function renderPostitTabs(postits, selectedId) {
    const wrap = document.getElementById('header-postit-tabs');
    const hiddenWrap = document.getElementById('postit-tabs');
    _cachedPostits = postits || [];

    const cfg = currentGroupConfig || {};
    const isPro = cfg.isPro;
    const myRole = cfg.myRole || 'owner';
    const isOwnerOrAdmin = myRole === 'owner' || myRole === 'admin';
    const isEmployee = myRole === 'employe';
    const canCreate = !isEmployee && _cachedPostits.length < (isPro ? 4 : 4);

    const tabs = _cachedPostits.map(p => {
        const isActive = p._id === selectedId;
        const bg     = isActive ? 'var(--accent)' : '#fff';
        const color  = isActive ? '#fff' : 'var(--accent)';
        const border = isActive ? '2px solid var(--accent)' : '2px solid rgba(0,0,0,0.15)';
        const shadow = isActive ? '2px 2px 0 rgba(0,0,0,0.3)' : '2px 2px 0 rgba(0,0,0,0.1)';

        // Label de la tuile
        let label = '';
        if (isPro) {
            // Groupes PRO : heure de retrait + nom
            const d = p.pickupDate ? new Date(p.pickupDate) : null;
            const time = d ? d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}) : '??:??';
            label = `<div style="font-size:7px;opacity:0.7;">${time}</div>
                     <div style="font-size:8px;font-weight:900;text-transform:uppercase;line-height:1.1;word-break:break-word;">${truncate(p.name,10)}</div>`;
        } else {
            // Groupes PERSO : nom seulement
            label = `<div style="font-size:9px;font-weight:900;text-transform:uppercase;line-height:1.1;word-break:break-word;">${truncate(p.name,12)}</div>`;
        }

        // Roue ⚙️ visible uniquement pour le proprio du postit ou owner/admin
        // Roue visible si proprio du postit OU owner/admin du groupe
        // Pour les autres : pas de roue (ils ne peuvent qu'ouvrir en lecture via tap sur la tuile si besoin)
        const isOwnerOfPostit = (currentUser && p.ownerEmail === currentUser.email) || isOwnerOrAdmin;
        const gear = isOwnerOfPostit
            ? `<button onclick="event.stopPropagation(); uiEditPostit('${p._id}')"
                       style="position:absolute;bottom:2px;right:2px;background:none;border:none;
                              font-size:10px;cursor:pointer;opacity:${isActive?'0.7':'0.4'};padding:1px;">⚙️</button>`
            : '';

        return `<div onclick="selectPostit('${p._id}')"
                     style="flex-shrink:0;width:70px;min-height:56px;position:relative;
                            background:${bg};color:${color};border:${border};box-shadow:${shadow};
                            padding:5px 4px 16px 4px;cursor:pointer;display:flex;
                            flex-direction:column;align-items:center;justify-content:center;text-align:center;">
                    ${label}
                    ${gear}
                </div>`;
    }).join('');

    // Tuile "+"
    const addTab = canCreate
        ? `<div onclick="uiCreatePostit()"
                style="flex-shrink:0;width:44px;min-height:56px;display:flex;flex-direction:column;
                       align-items:center;justify-content:center;cursor:pointer;
                       border:2px dashed rgba(0,0,0,0.2);color:rgba(0,0,0,0.3);">
                <div style="font-size:22px;font-weight:100;line-height:1;">+</div>
           </div>`
        : '';

    if (wrap) wrap.innerHTML = tabs + addTab;
    if (hiddenWrap) hiddenWrap.innerHTML = '';

    // Mettre à jour sel-pos caché (compatibilité)
    const selPos = document.getElementById('sel-pos');
    if (selPos) {
        selPos.innerHTML = _cachedPostits.map(p => `<option value="${p._id}">${p.name}</option>`).join('');
        if (selectedId) selPos.value = selectedId;
    }
}

// ── Sélectionner un postit ────────────────────────────────────────────────────
function selectPostit(postitId) {
    currentPostitId = postitId;
    const selPos = document.getElementById('sel-pos');
    if (selPos) selPos.value = postitId;

    // Re-rendre les tuiles pour mettre en évidence la sélection
    renderPostitTabs(_cachedPostits, postitId);

    // Charger l'historique et rafraîchir la vue
    if (socket && currentGroupId) {
        socket.emit('get-history', { groupId: currentGroupId, postitId });
    }
    refreshView();
}

// ── Créer un nouveau postit ───────────────────────────────────────────────────
function uiCreatePostit() {
    const cfg = currentGroupConfig || {};
    const isPro = cfg.isPro;

    document.getElementById('postit-modal')?.remove();

    const modalHtml = `
    <div id="postit-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9998;display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow-y:auto;">
        <div style="background:var(--bg);border:3px solid var(--accent);box-shadow:6px 6px 0 rgba(0,0,0,0.3);padding:20px;width:100%;max-width:380px;margin-top:60px;">
            <h3 style="font-size:13px;font-weight:900;text-transform:uppercase;margin-bottom:14px;">
                ${isPro ? '📦 Nouvelle commande' : '💬 Nouveau postit'}
            </h3>

            <div style="font-size:8px;font-weight:900;opacity:0.5;text-transform:uppercase;margin-bottom:3px;">
                ${isPro ? 'Nom du client *' : 'Nom de la conversation *'}
            </div>
            <input type="text" id="pm-name" placeholder="${isPro ? 'Nom du client' : 'Nom'}"
                   style="width:100%;border:2px solid var(--accent);padding:9px;font-size:13px;margin-bottom:10px;background:white;box-sizing:border-box;">

            ${isPro ? `
            <div style="font-size:8px;font-weight:900;opacity:0.5;text-transform:uppercase;margin-bottom:3px;">Date de retrait *</div>
            <input type="datetime-local" id="pm-date"
                   style="width:100%;border:2px solid var(--accent);padding:8px;font-size:12px;margin-bottom:10px;background:white;box-sizing:border-box;">

            <div style="display:flex;gap:8px;margin-bottom:10px;">
                <div style="flex:1;">
                    <div style="font-size:8px;font-weight:900;opacity:0.5;text-transform:uppercase;margin-bottom:3px;">Téléphone</div>
                    <input type="tel" id="pm-phone" placeholder="06..."
                           style="width:100%;border:2px solid rgba(0,0,0,0.15);padding:8px;font-size:12px;background:white;box-sizing:border-box;">
                </div>
                <div style="flex:1;">
                    <div style="font-size:8px;font-weight:900;opacity:0.5;text-transform:uppercase;margin-bottom:3px;">Email</div>
                    <input type="email" id="pm-email" placeholder="email@..."
                           style="width:100%;border:2px solid rgba(0,0,0,0.15);padding:8px;font-size:12px;background:white;box-sizing:border-box;">
                </div>
            </div>` : ''}

            <div style="display:flex;gap:8px;margin-top:14px;">
                <button onclick="document.getElementById('postit-modal').remove()"
                        style="flex:1;padding:12px;border:2px solid var(--accent);background:white;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">Annuler</button>
                <button onclick="submitCreatePostit()"
                        style="flex:1;padding:12px;background:var(--accent);color:white;border:none;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">Créer</button>
            </div>
        </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    setTimeout(() => document.getElementById('pm-name')?.focus(), 100);
}

async function submitCreatePostit() {
    const name = document.getElementById('pm-name')?.value?.trim();
    if (!name) return alert(typeof t==='function' ? t('nameRequired') : 'Le nom est obligatoire.');

    const selDev = document.getElementById('sel-dev');
    const deviceId = selDev?.value;
    if (!deviceId) return alert('Rayon introuvable, rechargez la page.');

    const isPro = currentGroupConfig?.isPro;
    const pickupDate = isPro
        ? (document.getElementById('pm-date')?.value || new Date().toISOString())
        : new Date().toISOString();

    const payload = {
        name,
        deviceId,
        pickupDate,
        phone: document.getElementById('pm-phone')?.value?.trim() || '',
        email: document.getElementById('pm-email')?.value?.trim() || '',
    };
    if (isPro) {
        // Générer un numéro de commande automatique
        payload.orderNumber = 'CMD-' + Math.floor(1000 + Math.random() * 9000);
    }

    const res = await fetchAuth('/api/postits', { method:'POST', body: JSON.stringify(payload) });
    document.getElementById('postit-modal')?.remove();

    if (res.ok) {
        const newP = await res.json();
        await loadGroupData(currentGroupId);
        selectPostit(newP._id);
    } else {
        alert('Erreur : ' + await res.text());
    }
}

// ── Éditer un postit (roue ⚙️) ───────────────────────────────────────────────
async function uiEditPostit(postitId) {
    document.getElementById('postit-edit-modal')?.remove();
    const p = _cachedPostits.find(x => x._id === postitId);
    if (!p) return;

    const isPro        = currentGroupConfig?.isPro;
    const myRole       = currentGroupConfig?.myRole || 'client';
    const fmtDate      = p.pickupDate ? new Date(p.pickupDate).toISOString().slice(0,16) : '';
    const isOwnerOrAdmin = ['owner','admin'].includes(myRole);
    const isPostitOwner  = currentUser && p.ownerEmail === currentUser.email;
    // Peut éditer : créateur du postit OU owner/admin du groupe
    const canEdit = isPostitOwner || isOwnerOrAdmin;

    // Champs : readonly si lecture seule
    const ro  = canEdit ? '' : 'readonly';
    const roStyle = canEdit
        ? 'background:white;'
        : 'background:#f4f4f4;color:#888;cursor:default;';

    const modalHtml = `
    <div id="postit-edit-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9998;display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow-y:auto;">
        <div style="background:var(--bg);border:3px solid var(--accent);box-shadow:6px 6px 0 rgba(0,0,0,0.3);padding:20px;width:100%;max-width:380px;margin-top:60px;">
            <h3 style="font-size:13px;font-weight:900;text-transform:uppercase;margin-bottom:4px;">
                ${canEdit ? '⚙️' : '👁️'} ${isPro ? t('orderInfo').replace('📦 ','') : 'Postit'}
            </h3>
            ${!canEdit ? `<div style="font-size:9px;opacity:0.5;margin-bottom:12px;font-style:italic;">Lecture seule — vous n'êtes pas le créateur</div>` : '<div style="margin-bottom:14px;"></div>'}

            <div style="font-size:8px;font-weight:900;opacity:0.5;text-transform:uppercase;margin-bottom:3px;">${t('clientName').replace(' *','')}</div>
            <input type="text" id="pe-name" value="${p.name||''}" ${ro}
                   style="width:100%;border:2px solid var(--accent);padding:9px;font-size:13px;margin-bottom:10px;${roStyle}box-sizing:border-box;">

            ${isPro ? `
            <div style="font-size:8px;font-weight:900;opacity:0.5;text-transform:uppercase;margin-bottom:3px;">${t('pickupDate').replace(' *','')}</div>
            <input type="datetime-local" id="pe-date" value="${fmtDate}" ${ro}
                   style="width:100%;border:2px solid var(--accent);padding:8px;font-size:12px;margin-bottom:10px;${roStyle}box-sizing:border-box;">
            <div style="display:flex;gap:8px;margin-bottom:10px;">
                <div style="flex:1;">
                    <div style="font-size:8px;font-weight:900;opacity:0.5;text-transform:uppercase;margin-bottom:3px;">${t('phone')}</div>
                    <input type="tel" id="pe-phone" value="${p.phone||''}" ${ro}
                           style="width:100%;border:2px solid rgba(0,0,0,0.15);padding:8px;font-size:12px;${roStyle}box-sizing:border-box;">
                </div>
                <div style="flex:1;">
                    <div style="font-size:8px;font-weight:900;opacity:0.5;text-transform:uppercase;margin-bottom:3px;">${t('orderNum')}</div>
                    <input type="text" id="pe-ordernum" value="${p.orderNumber||''}" ${ro}
                           style="width:100%;border:2px solid rgba(0,0,0,0.15);padding:8px;font-size:12px;${roStyle}box-sizing:border-box;">
                </div>
            </div>` : ''}

            ${canEdit ? `
            <!-- Participants (visible seulement si canEdit) -->
            <div style="border-top:2px solid rgba(0,0,0,0.1);padding-top:10px;margin-bottom:10px;">
                <div style="font-size:8px;font-weight:900;opacity:0.5;text-transform:uppercase;margin-bottom:6px;">${t('postitParticipants')}</div>
                <div id="pe-invites-list" style="min-height:20px;margin-bottom:6px;">
                    <em style="opacity:0.4;font-size:10px;">Chargement…</em>
                </div>
                <div style="font-size:7px;opacity:0.4;margin-bottom:5px;">${t('inviteWarning')}</div>
                <div style="display:flex;gap:6px;">
                    <input type="email" id="pe-invite-email" placeholder="${t('inviteByEmail')}"
                           style="flex:1;border:2px solid rgba(0,0,0,0.15);padding:7px;font-size:12px;background:white;box-sizing:border-box;">
                    <button onclick="submitInviteToPostit('${postitId}')"
                            style="padding:7px 10px;background:var(--accent);color:white;border:none;font-weight:900;font-size:10px;text-transform:uppercase;cursor:pointer;">+</button>
                </div>
            </div>` : ''}

            <div style="display:flex;gap:6px;margin-top:14px;flex-wrap:wrap;">
                ${canEdit ? `
                <button onclick="document.getElementById('postit-edit-modal').remove()"
                        style="flex:1;padding:10px;border:2px solid var(--accent);background:white;font-weight:900;font-size:10px;text-transform:uppercase;cursor:pointer;">${t('cancel')}</button>
                <button onclick="submitEditPostit('${postitId}')"
                        style="flex:2;padding:10px;background:var(--accent);color:white;border:none;font-weight:900;font-size:10px;text-transform:uppercase;cursor:pointer;">${t('modify')}</button>
                ${isOwnerOrAdmin ? `<button onclick="confirmDeletePostit('${postitId}')"
                        style="flex:1;padding:10px;background:#dc2626;color:white;border:none;font-weight:900;font-size:10px;text-transform:uppercase;cursor:pointer;">🗑️</button>` : ''}
                ` : `
                <button onclick="document.getElementById('postit-edit-modal').remove()"
                        style="width:100%;padding:12px;background:var(--accent);color:white;border:none;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">OK</button>
                `}
            </div>
        </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    if (canEdit) setTimeout(() => loadPostitInvites(postitId), 80);
}

async function submitEditPostit(postitId) {
    const name = document.getElementById('pe-name')?.value?.trim();
    if (!name) return alert(typeof t==='function' ? t('nameRequired') : 'Le nom est obligatoire.');

    const isPro = currentGroupConfig?.isPro;
    const payload = { name };
    if (isPro) {
        const dateVal = document.getElementById('pe-date')?.value;
        if (dateVal) payload.pickupDate = new Date(dateVal).toISOString();
        payload.phone = document.getElementById('pe-phone')?.value?.trim() || '';
        payload.orderNumber = document.getElementById('pe-ordernum')?.value?.trim() || '';
    }

    const res = await fetchAuth('/api/postits/' + postitId, { method:'PUT', body: JSON.stringify(payload) });
    document.getElementById('postit-edit-modal')?.remove();
    if (res.ok) {
        await loadGroupData(currentGroupId);
        selectPostit(postitId);
    } else {
        alert('Erreur : ' + await res.text());
    }
}

async function submitInviteToPostit(postitId) {
    const email = document.getElementById('pe-invite-email')?.value?.trim();
    if (!email || !email.includes('@')) return alert('Email invalide.');

    // Inviter sur ce postit spécifiquement (accès postit-level)
    // Le serveur ajoute aussi la personne comme membre du groupe si pas encore dedans
    const res = await fetchAuth('/api/postits/' + postitId + '/invite', {
        method: 'POST',
        body: JSON.stringify({ email })
    });
    if (res.ok) {
        document.getElementById('pe-invite-email').value = '';
        // Recharger la liste des invités
        loadPostitInvites(postitId);
    } else {
        const txt = await res.text();
        alert('Erreur : ' + txt);
    }
}

async function loadPostitInvites(postitId) {
    const wrap = document.getElementById('pe-invites-list');
    if (!wrap) return;
    try {
        const res = await fetchAuth('/api/postits/' + postitId + '/invites');
        if (!res.ok) return;
        const emails = await res.json();
        if (!emails.length) {
            wrap.innerHTML = '<em style="opacity:0.4;font-size:10px;">Aucun invité</em>';
            return;
        }
        wrap.innerHTML = emails.map(email => `
            <div style="display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid rgba(0,0,0,0.05);">
                <span style="flex:1;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${email}</span>
                <button onclick="removePostitInvite('${postitId}','${email}')"
                        style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:15px;padding:2px;flex-shrink:0;">×</button>
            </div>`).join('');
    } catch(e) {}
}

async function removePostitInvite(postitId, email) {
    const res = await fetchAuth('/api/postits/' + postitId + '/invite/' + encodeURIComponent(email), { method:'DELETE' });
    if (res.ok) loadPostitInvites(postitId);
}

function confirmDeletePostit(postitId) {
    const el = document.getElementById('postit-edit-modal');
    if (!el) return;
    // Remplacer le contenu par une confirmation
    const conf = el.querySelector('div');
    if (conf) conf.innerHTML = `
        <div style="padding:20px;text-align:center;">
            <div style="font-size:32px;margin-bottom:12px;">🗑️</div>
            <div style="font-size:13px;font-weight:900;text-transform:uppercase;margin-bottom:8px;">${t('deletePostitConfirm')}</div>
            <div style="font-size:10px;opacity:0.5;margin-bottom:20px;">${t('deletePostitMsg')}</div>
            <div style="display:flex;gap:8px;">
                <button onclick="document.getElementById('postit-edit-modal').remove()"
                        style="flex:1;padding:12px;border:2px solid var(--accent);background:white;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">${t('cancel')}</button>
                <button onclick="executeDeletePostit('${postitId}')"
                        style="flex:1;padding:12px;background:#dc2626;color:white;border:none;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">${t('deleteBtn')}</button>
            </div>
        </div>`;
}

async function executeDeletePostit(postitId) {
    document.getElementById('postit-edit-modal')?.remove();
    const res = await fetchAuth('/api/postits/' + postitId, { method:'DELETE' });
    if (res.ok) {
        currentPostitId = null;
        await loadGroupData(currentGroupId);
    } else {
        alert('Erreur : ' + await res.text());
    }
}


async function loadGroupData(groupId) {
    const selDev = document.getElementById('sel-dev');
    const selPos = document.getElementById('sel-pos');

    if (!groupId || groupId === "null") {
        updateVisualHeader();
        return;
    }
    if (groupId !== currentGroupId) { currentGroupId = groupId; localStorage.setItem('currentGroupId', groupId); }

    try {
        // 1. Charger les rayons
		const resDev = await fetchAuth(`/api/devices?groupId=${groupId}`);
        const devs = await resDev.json();

        if (devs && devs.length > 0) {
            const previousDevId = selDev.value;
            selDev.innerHTML = devs.map(d => `<option value="${d._id}">${truncate(d.name, 30)}</option>`).join('');
            if (previousDevId && devs.find(d => d._id === previousDevId)) {
                selDev.value = previousDevId;
            } else {
                selDev.value = devs[0]._id;
            }
        } else {
            selDev.innerHTML = '<option value="">AUCUN RAYON</option>';
            selPos.innerHTML = '<option value="">AUCUN CLIENT</option>';
            updateVisualHeader();
            return;
        }

        // 2. Charger les post-its du rayon sélectionné
        if (selDev.value) {
            let url = `/api/postits?deviceId=${selDev.value}`;
            const filterDateEl = document.getElementById('filter-date');
            if (filterDateEl && filterDateEl.value) url += `&filterDate=${filterDateEl.value}`;

            const resPos = await fetchAuth(url);
            let allPostits = await resPos.json();

            // Appliquer le filtre de statut
            let postits = [...allPostits];
            if (typeof showFinished !== 'undefined') {
                if (showFinished) {
                    postits = postits.filter(p => p.status === "En caisse" || p.status === "Terminé" || p.status === "Annulé");
                } else {
                    postits = postits.filter(p => p.status === "En attente" || p.status === "En préparation" || !p.status || p.status === "");
                }
            }

            postits.sort((a, b) => new Date(a.pickupDate) - new Date(b.pickupDate));

            if (postits && postits.length > 0) {
                // Déterminer le postit à sélectionner (mémorisé ou premier)
                const targetId = (currentPostitId && postits.find(p => p._id === currentPostitId))
                    ? currentPostitId : postits[0]._id;
                currentPostitId = targetId;
                // Rendre les tuiles postits
                renderPostitTabs(postits, targetId);
                // Mettre à jour sel-pos caché
                if (selPos) selPos.value = targetId;
            } else {
                currentPostitId = null;
                renderPostitTabs([], null);
                if (selPos) { selPos.innerHTML = ''; selPos.value = ''; }
            }
        }

        // 3. Mise à jour header et vue
        updateVisualHeader();
        if (typeof refreshView === 'function') refreshView();
        // Charger l'historique du postit sélectionné
        if (socket && currentGroupId) {
            socket.emit('get-history', { groupId, postitId: currentPostitId || undefined });
        }
        if (typeof updateBadge === 'function') updateBadge();

    } catch (err) {
        console.error("Erreur loadGroupData:", err);
    }
}

function updateVisualHeader() {
    const selG = document.getElementById('sel-group');
    const selD = document.getElementById('sel-dev');
    const selP = document.getElementById('sel-pos');
    const stGrp = document.getElementById('st-grp');
    const stDev = document.getElementById('st-dev');
    const stPos = document.getElementById('st-pos');
    const stGrpMini = document.getElementById('st-grp-mini');

    const grpName = (currentGroupConfig && currentGroupConfig.name)
        ? currentGroupConfig.name
        : (selG && selG.selectedIndex !== -1 && selG.options[selG.selectedIndex]?.text
            ? selG.options[selG.selectedIndex].text : '…');

    if (stGrp) stGrp.innerText = grpName;
    if (stGrpMini) stGrpMini.innerText = grpName;
    if (stDev && selD && selD.selectedIndex !== -1)
        stDev.innerText = selD.options[selD.selectedIndex]?.text || '…';
    if (stPos && selP && selP.selectedIndex !== -1)
        stPos.innerText = (selP.options[selP.selectedIndex]?.text || '…').substring(0, 20);
}

// Met à jour l'input date quand on sélectionne un post-it déjà créé
async function updateFilterDateFromPostit() {
    const pid = document.getElementById('sel-pos').value;
    const dateInput = document.getElementById('filter-date');
    if (!dateInput) return;

    // Si pas de client sélectionné (liste vide), on vide la date et on arrête
    if (!pid || pid === "") {
        dateInput.value = "";
        return;
    }

    try {
        const res = await fetchAuth(`/api/postits/details/${pid}`);
        // Si le serveur répond 404 ou erreur
        if (!res.ok) {
            dateInput.value = "";
            return;
        }
        
        const p = await res.json();
        if (p && p.pickupDate) {
            const dateOnly = p.pickupDate.split('T')[0];
            dateInput.value = dateOnly;
        } else {
            dateInput.value = ""; // Vide si le client n'a pas de date de retrait
        }
    } catch (e) {
        console.error("Erreur synchro date", e);
        dateInput.value = "";
    }
}


function toggleNote(messageId) {
    socket.emit('toggle-message-note', { messageId });
}

function toggleLineCheck(messageId) {
    const btn = document.getElementById('btn-status-main');
    const currentStatus = btn ? btn.getAttribute('data-status') : "";

    // IMPORTANT : On autorise la modification si c'est "Terminé" 
    // pour pouvoir revenir en arrière. On ne bloque que le définitif.
    if (currentStatus === "En caisse" || currentStatus === "Annulé") {
        console.warn("Action bloquée : Commande " + currentStatus);
        return;
    }

    const msg = allMsgs.find(m => m._id === messageId);
    if (!msg) return;

    msg.checked = !msg.checked;
    socket.emit('toggle-check-line', { messageId });

    const pSel = document.getElementById('sel-pos');
    const pid = currentPostitId || (pSel ? pSel.value : null);
    if (!pid) return;

    // Recalcul du statut automatique
    const lines = allMsgs.filter(m => m.postitId === pid && !m.isNote);
    const checkedCount = lines.filter(m => m.checked).length;
    const totalLines = lines.length;

    let newStatus = "En attente";
    if (totalLines > 0) {
        if (checkedCount === totalLines) {
            newStatus = "Terminé";
        } else if (checkedCount > 0) {
            newStatus = "En préparation"; 
        }
    }

    socket.emit('update-postit-status', { postitId: pid, status: newStatus });
    refreshView(false);
}

function changeStatusManually(pid) {
    const states = ["En attente", "En préparation", "Terminé", "Annulé"];
    const choice = prompt(
        "MODIFIER LE STATUT :\n1. En attente\n2. En préparation\n3. Terminé\n4. Annulé"
    );

    if (choice >= 1 && choice <= 4) {
        const newStatus = states[choice - 1];
        // On envoie au serveur
        socket.emit('update-postit-status', { 
            postitId: pid, 
            status: newStatus 
        });
        // On force un rafraîchissement local immédiat pour le confort visuel
        refreshView(false);
    }
}

async function refreshView(forceScrollBottom = false) {
    if (window._editingMessageId) return;
    const pSel = document.getElementById('sel-pos');
    const pid = currentPostitId || (pSel ? pSel.value : null);
    const chat = document.getElementById('chat-history');
    // (pas de guard ici - refreshView affiche ce qui est dans allMsgs)
    const einkSmall = document.getElementById('eink-sim');
    const einkFull = document.getElementById('prep-content');
    const prepHeader = document.getElementById('prep-header');

    if (!chat) return;

    const prevPos = chat.scrollTop;
    const wasAtBottom = (chat.scrollHeight - chat.scrollTop <= chat.clientHeight + 50);

    let headerHtml = "";
    let prepHeaderHtml = "";
    let currentStatus = "";
    let formattedDate = "";

    if (pid && pid !== "") {
        try {
            const res = await fetchAuth(`/api/postits/details/${pid}`);
            if (!res || !res.ok) throw new Error("postit non chargé");
            const p = await res.json();
            if (!p) throw new Error("postit null");
            if (p) {
                currentStatus = p.status;
                let statusBg = "bg-black"; 
                if (p.status === "En préparation") statusBg = "bg-orange-500";
                if (p.status === "En caisse") statusBg = "bg-blue-500";
                if (p.status === "Terminé") statusBg = "bg-green-600";
                if (p.status === "Annulé") statusBg = "bg-gray-500";
                
                formattedDate = "--/--/---- --:--";
                if (p.pickupDate) {
                    const d = new Date(p.pickupDate);
                    if (!isNaN(d)) {
                        const day = String(d.getDate()).padStart(2, '0');
                        const month = String(d.getMonth() + 1).padStart(2, '0');
                        const year = d.getFullYear();
                        const hours = String(d.getHours()).padStart(2, '0');
                        const mins = String(d.getMinutes()).padStart(2, '0');
                        formattedDate = `${day}/${month}/${year} ${hours}:${mins}`;
                    }
                }

                const cancelMsg = allMsgs.find(m => m.postitId === pid && m.isNote && m.content.includes("ANNULATION"));
                const cancelCommentHtml = (p.status === "Annulé" && cancelMsg) 
                    ? `<div class="mt-2 p-2 bg-red-50 border-l-4 border-red-500 text-[10px] font-bold text-red-700 italic">${cancelMsg.content}</div>` 
                    : "";

                const getStatusSelect = (fontSizeClass) => `
                    <button id="btn-status-main" data-status="${p.status}" onclick="event.stopPropagation(); showStatusMenu(this, '${p._id}')" 
                            class="${statusBg} text-white font-black uppercase ${fontSizeClass} border border-black cursor-pointer w-[95px] h-[20px] flex items-center justify-center leading-none relative z-30 active:scale-95">
                        ${p.status === 'En préparation' ? 'Prépa.' : (p.status === 'En attente' ? 'Attente' : p.status)}
                    </button>`;

                headerHtml = `
                <div class="p-3 border-4 border-black bg-white shadow-[4px_4px_0px_#000] mb-4">
                    <div class="flex justify-between items-start border-b-2 border-black pb-1 mb-2">
                        <div>
                            <div class="text-[9px] font-black uppercase opacity-40 leading-none">Commande</div>
                            <div class="text-xl font-black italic leading-tight">#${p.orderNumber || '---'}</div>
                        </div>
                        <div class="flex flex-col items-end">
                             ${getStatusSelect('text-[9px]')}
                        </div>
                    </div>
                    <div class="flex justify-between items-end">
                        <div>
                            <div class="text-[9px] font-black uppercase opacity-40 leading-none">Client</div>
                            <div class="text-sm font-bold leading-tight">${p.name}</div>
                            <div class="text-[10px] font-black mt-1">
                                ${p.phone ? `📞 <a href="tel:${p.phone}" onclick="return confirm('Appeler le ${p.phone} ?')" class="underline text-blue-600">${p.phone}</a>` : ''}
                            </div>
                        </div>
                        <div class="text-right text-[10px] font-black opacity-60">${formattedDate}</div>
                    </div>
                    ${cancelCommentHtml}
                </div>`;

                prepHeaderHtml = `
                <div class="p-3 border-4 border-black bg-white shadow-[4px_4px_0px_#000]">
                    <div class="flex justify-between items-start border-b-2 border-black pb-2 mb-2">
                        <div>
                            <div class="flex items-center gap-2 mb-1">
                                <span class="text-[10px] font-black uppercase opacity-40">Statut</span>
                                ${getStatusSelect('text-[8px]')}
                            </div>
                            <div class="text-3xl font-black italic leading-none text-red-600">#${p.orderNumber || '---'}</div>
                        </div>
                        
                        <button onclick="goToPage(PAGE_CHAT)" class="bg-blue-50 text-blue-600 p-3 border-2 border-blue-200 shadow-[2px_2px_0px_#bfdbfe] flex items-center justify-center active:shadow-none active:translate-x-[1px] active:translate-y-[1px]">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M9 14l-4-4 4-4"/><path d="M5 10h11a4 4 0 1 1 0 8h-1"/>
                            </svg>
                        </button>
                    </div>
                    <div class="flex justify-between items-end">
                        <div>
                            <span class="text-[10px] font-black uppercase opacity-40 block">Client</span>
                            <span class="text-xl font-black leading-none">${p.name}</span>
                            <div class="text-sm font-black mt-1 text-blue-600">
                                ${p.phone ? `📞 <a href="tel:${p.phone}" onclick="return confirm('Lancer l'appel vers le ${p.phone} ?')" class="underline">${p.phone}</a>` : ''}
                            </div>
                        </div>
                        <div class="text-right text-[12px] font-black">${formattedDate}</div>
                    </div>
                    ${cancelCommentHtml}
                </div>`;
            }
        } catch (e) { console.error(e); }
    }

    const forEink = allMsgs.filter(m => m.postitId === pid && !m.isNote && m.type !== 'image');
    const einkHtml = forEink.map(m => {
        const isLocked = (currentStatus === "Annulé" || currentStatus === "En caisse");        
        const boxClass = m.checked ? "bg-green-500 border-black text-white" : "bg-white border-black text-transparent";
        const textStyle = m.checked ? "color: #a1a1aa; text-decoration: line-through;" : "color: #000;";
        const opacityClass = isLocked ? "opacity-50 cursor-not-allowed" : "cursor-pointer";
        
        return `
        <div class="flex items-center gap-3 mb-2 group ${opacityClass}" 
             onclick="event.stopPropagation(); ${isLocked ? "console.log('Liste verrouillée')" : `toggleLineCheck('${m._id}')`}">
            <div class="w-5 h-5 border-2 flex-shrink-0 flex items-center justify-center transition-colors ${boxClass}">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <span class="text-[13px] font-bold" style="${textStyle}; word-break:break-word; overflow-wrap:break-word; white-space:normal; min-width:0;">${m.content}</span>
        </div>`;
    }).join('');

    if (einkSmall) einkSmall.innerHTML = einkHtml;
    if (einkFull) einkFull.innerHTML = einkHtml;
    if (prepHeader) prepHeader.innerHTML = prepHeaderHtml;
    // Bandeau commande Pro au-dessus des sélecteurs
    const orderBanner = document.getElementById('order-banner');
    const orderBannerContent = document.getElementById('order-banner-content');
    const dateAlert = document.getElementById('order-date-alert');

    if (orderBanner) {
        const showBanner = !!(currentGroupConfig && currentGroupConfig.isPro && pid);
        orderBanner.style.display = showBanner ? '' : 'none';
        if (showBanner && orderBannerContent && headerHtml) {
            orderBannerContent.innerHTML = headerHtml;
        }
        // Alerte date manquante : currentStatus est vide si pas de date ou statut "En attente" sans date
        if (dateAlert) {
            // On vérifie formattedDate : si elle contient "?" c'est qu'il n'y a pas de date
            // noDate = vrai si pas de date réelle (formattedDate vide ou "--")
            const noDate = !formattedDate || formattedDate === '' || formattedDate.startsWith('--');
            dateAlert.style.display = (showBanner && noDate) ? '' : 'none';
        }
    }

    const orderInfoEl = document.getElementById('order-info-content');
    if (orderInfoEl && prepHeaderHtml) orderInfoEl.innerHTML = prepHeaderHtml;

    if (chat) {
        const filtered = allMsgs.filter(m => m.postitId === pid);
        chat.innerHTML = [...filtered].reverse().map(m => {
            const isMe = (currentUser && m.senderName === currentUser.name);
            const noteClass = m.isNote ? "opacity-30 italic" : "";
            const bubbleBg = isMe ? "bg-[#18181b] text-white" : "bg-white text-black";
            const tagStyle = isMe ? "bg-white text-black" : "bg-black text-white";

            let contentHtml = `<span id="text-${m._id}" style="font-size:13px; font-weight:700; line-height:1.4; word-break:break-word; overflow-wrap:break-word; white-space:pre-wrap; flex:1;">${m.content}</span>`;
            if (m.type === 'image') {
                contentHtml = `
                <div class="flex-1 py-1">
                    <img src="${m.content}" 
                         class="max-w-[80px] aspect-square object-cover border-2 border-black shadow-[2px_2px_0px_#000] cursor-pointer active:scale-95 transition-transform" 
                         onclick="openFullImage('${m.content}')"
                         alt="Document">
                </div>`;
            }

            return `
            <div class="msg-row ${isMe ? 'me' : 'others'} ${noteClass} mb-2">

                <div id="swipe-${m._id}"
                     class="msg-bubble"
                     style="position:relative; max-width:75%;
                            word-break:break-word; overflow-wrap:break-word;
                            transform:translateX(0); transition:transform 0.2s ease;"
                     ${isMe ? `ontouchstart="handleTouchStart(event,'${m._id}')"
                     ontouchmove="handleTouchMove(event,'${m._id}')"
                     ontouchend="handleTouchEnd(event,'${m._id}')"` : ''}>

                    ${isMe ? `<button id="del-${m._id}"
                            ontouchend="event.stopPropagation(); deleteMessage('${m._id}')"
                            style="position:absolute; top:0; bottom:0; right:100%;
                                   width:44px; background:transparent;
                                   border:none; font-size:22px; cursor:pointer;
                                   display:flex; align-items:center; justify-content:center;
                                   opacity:0; pointer-events:none;
                                   transition:opacity 0.2s;">🗑️</button>` : ''}

                    ${isMe ? `<button id="edit-${m._id}"
                            ontouchend="event.stopPropagation(); editMessage('${m._id}')"
                            style="position:absolute; top:0; bottom:0; left:100%;
                                   width:44px; background:transparent;
                                   border:none; font-size:22px; cursor:pointer;
                                   display:flex; align-items:center; justify-content:center;
                                   opacity:0; pointer-events:none;
                                   transition:opacity 0.2s;">🖍️</button>` : ''}

                    <div style="display:flex; align-items:flex-start; gap:6px;">
                        <span class="msg-author-tag" style="flex-shrink:0;">${isMe ? 'Moi' : m.senderName}</span>
                        ${contentHtml}
                        <button ontouchend="event.stopPropagation(); toggleNote('${m._id}')"
                                onclick="event.stopPropagation(); toggleNote('${m._id}')"
                                style="flex-shrink:0; font-size:16px; background:none; border:none; cursor:pointer;
                                       padding:4px 6px; margin:-4px -2px; touch-action:manipulation;">
                            ${m.isNote ? '🚫' : '👁️'}</button>
                    </div>
                </div>
            </div>`;
        }).join('');

        if (forceScrollBottom || wasAtBottom) { chat.scrollTop = chat.scrollHeight; } 
        else { chat.scrollTop = prevPos; }
    }
}

/*
async function refreshView(forceScrollBottom = false) {
    const pSel = document.getElementById('sel-pos');
    const pid = pSel ? pSel.value : null;
    const chat = document.getElementById('chat-history');
    const einkSmall = document.getElementById('eink-sim');
    const einkFull = document.getElementById('prep-content');
    const prepHeader = document.getElementById('prep-header');

    if (!chat) return;

    const prevPos = chat.scrollTop;
    const wasAtBottom = (chat.scrollHeight - chat.scrollTop <= chat.clientHeight + 50);

    let headerHtml = "";
    let prepHeaderHtml = "";
    let currentStatus = ""; 

    if (pid && pid !== "") {
        try {
            const res = await fetchAuth(`/api/postits/details/${pid}`);
            const p = await res.json();
            if (p) {
                currentStatus = p.status;
				let statusBg = "bg-black"; 
				if (p.status === "En préparation") statusBg = "bg-orange-500";
				if (p.status === "En caisse") statusBg = "bg-blue-500"; // <--- AJOUTE CETTE LIGNE
				if (p.status === "Terminé") statusBg = "bg-green-600";
				if (p.status === "Annulé") statusBg = "bg-gray-500";
				
                let formattedDate = "--/--/---- --:--";
                if (p.pickupDate) {
                    const d = new Date(p.pickupDate);
                    if (!isNaN(d)) {
                        const day = String(d.getDate()).padStart(2, '0');
                        const month = String(d.getMonth() + 1).padStart(2, '0');
                        const year = d.getFullYear();
                        const hours = String(d.getHours()).padStart(2, '0');
                        const mins = String(d.getMinutes()).padStart(2, '0');
                        formattedDate = `${day}/${month}/${year} ${hours}:${mins}`;
                    }
                }

                const cancelMsg = allMsgs.find(m => m.postitId === pid && m.isNote && m.content.includes("ANNULATION"));
                const cancelCommentHtml = (p.status === "Annulé" && cancelMsg) 
                    ? `<div class="mt-2 p-2 bg-red-50 border-l-4 border-red-500 text-[10px] font-bold text-red-700 italic">${cancelMsg.content}</div>` 
                    : "";

                const getStatusSelect = (fontSizeClass) => `
                    <button id="btn-status-main" data-status="${p.status}" onclick="event.stopPropagation(); showStatusMenu(this, '${p._id}')" 
                            class="${statusBg} text-white font-black uppercase ${fontSizeClass} border border-black cursor-pointer w-[95px] h-[20px] flex items-center justify-center leading-none relative z-30 active:scale-95">
                        ${p.status === 'En préparation' ? 'Prépa.' : (p.status === 'En attente' ? 'Attente' : p.status)}
                    </button>`;

                headerHtml = `
				<div class="p-3 border-4 border-black bg-white shadow-[4px_4px_0px_#000] mb-4">
					<div class="flex justify-between items-start border-b-2 border-black pb-1 mb-2">
						<div>
							<div class="text-[9px] font-black uppercase opacity-40 leading-none">Commande</div>
							<div class="text-xl font-black italic leading-tight">#${p.orderNumber || '---'}</div>
						</div>
						<div class="flex flex-col items-end">
							 ${getStatusSelect('text-[9px]')}
						</div>
					</div>
					<div class="flex justify-between items-end">
						<div>
							<div class="text-[9px] font-black uppercase opacity-40 leading-none">Client</div>
							<div class="text-sm font-bold leading-tight">${p.name}</div>
							<div class="text-[10px] font-black mt-1">
								${p.phone ? `📞 <a href="tel:${p.phone}" onclick="return confirm('Appeler le ${p.phone} ?')" class="underline text-blue-600">${p.phone}</a>` : ''}
							</div>
						</div>
						<div class="text-right text-[10px] font-black opacity-60">${formattedDate}</div>
					</div>
					${cancelCommentHtml}
				</div>`;

				prepHeaderHtml = `
				<div class="p-3 border-4 border-black bg-white shadow-[4px_4px_0px_#000]">
					<div class="flex justify-between items-start border-b-2 border-black pb-2 mb-2">
						<div>
							<div class="flex items-center gap-2 mb-1">
								<span class="text-[10px] font-black uppercase opacity-40">Statut</span>
								${getStatusSelect('text-[8px]')}
							</div>
							<div class="text-3xl font-black italic leading-none text-red-600">#${p.orderNumber || '---'}</div>
						</div>
						
						<button onclick="goToPage(1)" class="bg-blue-50 text-blue-600 p-3 border-2 border-blue-200 shadow-[2px_2px_0px_#bfdbfe] flex items-center justify-center active:shadow-none active:translate-x-[1px] active:translate-y-[1px]">
							<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
								<path d="M9 14l-4-4 4-4"/><path d="M5 10h11a4 4 0 1 1 0 8h-1"/>
							</svg>
						</button>
					</div>
					<div class="flex justify-between items-end">
						<div>
							<span class="text-[10px] font-black uppercase opacity-40 block">Client</span>
							<span class="text-xl font-black leading-none">${p.name}</span>
							<div class="text-sm font-black mt-1 text-blue-600">
								${p.phone ? `📞 <a href="tel:${p.phone}" onclick="return confirm('Lancer l'appel vers le ${p.phone} ?')" class="underline">${p.phone}</a>` : ''}
							</div>
						</div>
						<div class="text-right text-[12px] font-black">${formattedDate}</div>
					</div>
					${cancelCommentHtml}
				</div>`;
            }
        } catch (e) { console.error(e); }
    }

    // --- E-INK SIMULATION (Articles uniquement, on ignore les images ici) ---
    const forEink = allMsgs.filter(m => m.postitId === pid && !m.isNote && m.type !== 'image');
	const einkHtml = forEink.map(m => {
		// On ne verrouille PAS si c'est "Terminé", seulement si c'est payé ou annulé
		const isLocked = (currentStatus === "Annulé" || currentStatus === "En caisse");		
		const boxClass = m.checked ? "bg-green-500 border-black text-white" : "bg-white border-black text-transparent";
		const textStyle = m.checked ? "color: #a1a1aa; text-decoration: line-through;" : "color: #000;";
		
		// Si verrouillé, on met une opacité basse et on désactive le curseur
		const opacityClass = isLocked ? "opacity-50 cursor-not-allowed" : "cursor-pointer";
		
		return `
		<div class="flex items-center gap-3 mb-2 group ${opacityClass}" 
			 onclick="event.stopPropagation(); ${isLocked ? "console.log('Liste verrouillée')" : `toggleLineCheck('${m._id}')`}">
			<div class="w-5 h-5 border-2 flex-shrink-0 flex items-center justify-center transition-colors ${boxClass}">
				<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
			</div>
			<span class="text-[13px] font-bold leading-none" style="${textStyle}">${m.content}</span>
		</div>`;
	}).join('');

    if (einkSmall) einkSmall.innerHTML = einkHtml;
    if (einkFull) einkFull.innerHTML = einkHtml;
    if (prepHeader) prepHeader.innerHTML = prepHeaderHtml;

    if (chat) {
        const filtered = allMsgs.filter(m => m.postitId === pid);
        chat.innerHTML = [...filtered].reverse().map(m => {
            const isMe = (currentUser && m.senderName === currentUser.name);
            const noteClass = m.isNote ? "opacity-30 italic" : "";
            const bubbleBg = isMe ? "bg-[#18181b] text-white" : "bg-white text-black";
            const tagStyle = isMe ? "bg-white text-black" : "bg-black text-white";

            // --- GESTION DU CONTENU (IMAGE VS TEXTE) ---
            let contentHtml = `<span class="text-[13px] font-bold leading-tight flex-1">${m.content}</span>`;
			if (m.type === 'image') {
				contentHtml = `
				<div class="flex-1 py-1">
					<img src="${m.content}" 
						 class="max-w-[80px] aspect-square object-cover border-2 border-black shadow-[2px_2px_0px_#000] cursor-pointer active:scale-95 transition-transform" 
						 onclick="openFullImage('${m.content}')"
						 alt="Document">
				</div>`;
			}

            return `
            <div class="msg-row ${isMe ? 'me' : 'others'} ${noteClass} mb-2">
                <div class="msg-bubble relative p-1.5 border-2 border-black ${bubbleBg} shadow-[2px_2px_0px_#000]">
                    <div class="flex items-center gap-2">
                        <span class="text-[8px] font-black px-1.5 py-0.5 uppercase flex-shrink-0 ${tagStyle}">${isMe ? 'Moi' : m.senderName}</span>
                        ${contentHtml}
                        <button onclick="toggleNote('${m._id}')" class="ml-1 flex-shrink-0 text-[14px] cursor-pointer grayscale">${m.isNote ? '🚫' : '👁️'}</button>
                    </div>
                </div>
            </div>`;
        }).join('');

        if (forceScrollBottom || wasAtBottom) { chat.scrollTop = chat.scrollHeight; } 
        else { chat.scrollTop = prevPos; }
    }
}
*/

function openFullImage(url) {
    const win = window.open("");
    win.document.write(`
        <html>
            <head>
                <title>Visualisation Document</title>
                <style>
                    body { margin: 0; background: #efeee9; display: flex; align-items: center; justify-content: center; height: 100vh; }
                    img { max-width: 100%; max-height: 100%; border: 4px solid black; box-shadow: 10px 10px 0px #000; }
                </style>
            </head>
            <body onclick="window.close()">
                <img src="${url}">
            </body>
        </html>
    `);
}

function toggleUploadMenu() {
    document.getElementById('upload-menu').classList.toggle('hidden');
}

function triggerUpload(type) {
    document.getElementById('up-' + type).click();
    toggleUploadMenu();
}

// Fonction utilitaire pour filtrer selon l'état du bouton 💾€
function filterPostitsByStatus(postits) {
    if (showFinished) {
        // Mode ARCHIVES : Uniquement les états terminaux
        return postits.filter(p => 
            p.status === "En caisse" || 
            p.status === "Terminé" || 
            p.status === "Annulé"
        );
    } else {
        // Mode ACTIF (par défaut) : Uniquement ce qui est à faire
        return postits.filter(p => 
            p.status === "En attente" || 
            p.status === "En préparation" || 
            !p.status // Gère aussi les nouveaux post-its sans statut
        );
    }
}

let showFinished = false; 

function toggleFilterFinished() {
    showFinished = !showFinished;
    
    // 1. Mise à jour visuelle du bouton
    const icon = document.getElementById('filter-icon');
    const btn = document.getElementById('btn-filter-finished');
    
    if (showFinished) {
        icon.style.opacity = "1";
        btn.style.background = "#fbbf24"; // Jaune : Mode Archives/Payé
    } else {
        icon.style.opacity = "0.3";
        btn.style.background = "white"; // Blanc : Mode Direct/En cours
    }
    
    // 2. CORRECTION : On vide le champ date pour éviter le filtrage trompeur
    const dateInput = document.getElementById('filter-date');
    if (dateInput) {
        dateInput.value = ""; 
    }
    
    // 3. Rechargement global pour appliquer le nouveau filtre de statut sans contrainte de date
    const gid = currentGroupId || document.getElementById('sel-group')?.value;
    if (gid) { loadGroupData(gid); }
}

async function loadPostits(deviceId) {
    if (!deviceId) return;

    try {
        const res = await fetchAuth(`/api/postits/${deviceId}`);
        const data = await res.json(); 
        
        // On récupère la liste (on adapte selon si ton API renvoie {postits:[]} ou [])
        let postits = Array.isArray(data) ? data : (data.postits || []);

        // 1. MISE À JOUR DU BADGE DEV (Header)
        const stDev = document.getElementById('st-dev');
        if (stDev) stDev.innerText = deviceId.substring(0, 6); // Affiche un court ID ou le nom

        // 2. LOGIQUE DE FILTRAGE (Flux Actif vs Archives)
        if (showFinished) {
            // Mode ARCHIVES : Uniquement les états terminaux
            postits = postits.filter(p => 
                p.status === "En caisse" || 
                p.status === "Terminé" || 
                p.status === "Annulé"
            );
        } else {
            // Mode ACTIF (Par défaut) : Uniquement ce qui est en cours
            postits = postits.filter(p => 
                p.status === "En attente" || 
                p.status === "En préparation" || 
                !p.status || p.status === ""
            );
        }

        // 3. REMPLISSAGE DU SÉLECTEUR
        const sel = document.getElementById('sel-pos');
        if (sel) {
            if (postits.length > 0) {
                sel.innerHTML = postits.map(p => 
                    `<option value="${p._id}">#${p.orderNumber || '?'} - ${p.name}</option>`
                ).join('');
                
                // Sélection automatique du premier de la liste
                sel.value = postits[0]._id;
                
                // Met à jour la date du filtre selon la commande sélectionnée
                if (typeof updateFilterDateFromPostit === "function") {
                    updateFilterDateFromPostit();
                }
            } else {
                // Si la liste est vide après filtrage
                sel.innerHTML = '<option value="">(Aucun post-it)</option>';
                const stPos = document.getElementById('st-pos');
                if (stPos) stPos.innerText = "-";
            }
        }

        // 4. RAFRAÎCHISSEMENT DE LA VUE
        refreshView();

    } catch (err) {
        console.error("Erreur dans loadPostits:", err);
    }
}

async function uploadFile(input) {
    if (!input.files[0] || !currentUser) return;
    const formData = new FormData();
    formData.append('file', input.files[0]);

    const pid = document.getElementById('sel-pos').value; // On récupère l'ID du post-it actuel

    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/upload', { 
            method: 'POST', 
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData 
        });
        const data = await res.json();

        // 1. Envoi du message avec l'image
        socket.emit('send-message', {
            groupId: document.getElementById('sel-group').value,
            deviceId: document.getElementById('sel-dev').value,
            postitId: pid,
            content: data.url,
            senderName: currentUser.name,
            type: 'image'
        });

        // 2. MISE À JOUR AUTOMATIQUE DU STATUT
        // On informe le serveur que ce post-it passe en "En caisse"
        socket.emit('update-postit-status', { 
            postitId: pid, 
            status: "En caisse", 
            comment: "" // Pas de commentaire nécessaire pour cette action auto
        });

    } catch (err) { 
        console.error("Erreur upload ou statut:", err); 
    }
}



// Fonction de gestion du changement via Select
function handleSelectStatus(selectElement, pid) {
    const newStatus = selectElement.value;
    let cancelReason = "";

    if (newStatus === "Annulé") {
        cancelReason = prompt("Motif de l'annulation (obligatoire pour annuler) :");
        if (!cancelReason || cancelReason.trim() === "") {
            // Si l'utilisateur annule le prompt ou laisse vide, on recharge pour annuler le changement du select
            refreshView(); 
            return;
        }
    }

    socket.emit('update-postit-status', { 
        postitId: pid, 
        status: newStatus,
        comment: cancelReason 
    });
}

function send() {
    const input = document.getElementById('msg-input'),
          gid = currentGroupId || document.getElementById('sel-group')?.value,
          did = document.getElementById('sel-dev')?.value || '',
          pid = document.getElementById('sel-pos').value;
    if (!input.value || !gid || !pid) return;
    socket.emit('send-message', { groupId: gid, deviceId: did, postitId: pid, content: input.value, senderName: currentUser.name });
    input.value = '';
}


async function deleteGroup(id) {
    try {
        const res = await fetchAuth(`/api/groups/${id}`, { method: 'DELETE' });
        if (res.ok) {
            // 1. Vider les sélecteurs
            const selGrp = document.getElementById('sel-group');
            const selDev = document.getElementById('sel-dev');
            const selPos = document.getElementById('sel-pos');
            if (selGrp) selGrp.value = "";
            if (selDev) selDev.innerHTML = '<option value="">Aucun rayon</option>';
            if (selPos) selPos.innerHTML = '<option value="">Aucun client</option>';

            // 2. Mettre à jour le header (spans du badge status)
            updateVisualHeader();

            // 3. Recharger la liste des groupes (cascade auto vers rayons/postits)
            await loadGroups();
            await refreshParamsLists();

            // 4. Vider le chat
            allMsgs = [];
            if (typeof refreshView === 'function') refreshView();

            // 5. Ouvrir l'accordéon groupes
            const checkG = document.getElementById('check-g');
            if (checkG) checkG.checked = true;
        } else {
            alert("Erreur serveur lors de la suppression du groupe.");
        }
    } catch (err) {
        console.error("Erreur deleteGroup:", err);
        alert("Erreur lors de la suppression.");
    }
}

async function deleteDevice(id) {
    try {
        const res = await fetchAuth(`/api/devices/${id}`, { method: 'DELETE' });

        if (res.ok) {
            const selGroup = document.getElementById('sel-group');
            const currentGid = selGroup ? selGroup.value : null;

            // Si on a supprimé le rayon actif, on vide le header
            updateVisualHeader();
            
            // Rafraîchissement des données
            if (currentGid) {
                await loadGroupData(currentGid);
                await refreshParamsLists();
                
                // On force l'ouverture de l'accordéon des rayons
                const checkD = document.getElementById('check-d');
                if (checkD) checkD.checked = true;
            }
        } else {
            console.error("Erreur lors de la suppression du rayon.");
        }
    } catch (err) {
        console.error("Erreur réseau deleteDevice:", err);
    }
}

async function deletePostit(id) {
    try {
            const res = await fetchAuth(`/api/postits/${id}`, { method: 'DELETE' });
            if (res.ok) {
                const gid = currentGroupId || document.getElementById('sel-group')?.value;
                if (gid) {
                    await loadGroupData(gid);
                    await refreshParamsLists();
                    const checkP = document.getElementById('check-p');
                    if (checkP) checkP.checked = true;
                }
            }
        } catch (err) {
            console.error("Erreur deletePostit:", err);
        }
}

function updateBadge() {
    const g = document.getElementById('sel-group'), d = document.getElementById('sel-dev'), p = document.getElementById('sel-pos');
    document.getElementById('st-grp').innerText = truncate(g.options[g.selectedIndex]?.text, 15) || '-';
    document.getElementById('st-dev').innerText = truncate(d.options[d.selectedIndex]?.text, 15) || '-';
    document.getElementById('st-pos').innerText = truncate(p.options[p.selectedIndex]?.text, 15) || '-';
}

function logout() { localStorage.removeItem('user'); location.reload(); }

let editingPostitId = null;

async function editName(type, id, oldName) {
    if (type === 'postit') {
        // ON NE TOUCHE PAS À CETTE PARTIE (Elle gère tes fenêtres de modif clients)
        editingPostitId = id;
        const res = await fetchAuth(`/api/postits/details/${id}`);
        const p = await res.json();
        document.getElementById('order-client').value = p.name || "";
        document.getElementById('order-num').value = p.orderNumber || "";
        document.getElementById('order-phone').value = p.phone || "";
        document.getElementById('order-date').value = p.pickupDate || "";
        document.querySelector('#order-modal h2').innerText = "Modifier la Commande";
        document.getElementById('order-modal').classList.remove('hidden');
	} else {
        openCustomPrompt(`Modifier "${oldName}"`, oldName, async (newName) => {
            if (!newName || newName === oldName) return;
            
            let url = type === 'group' ? `/api/groups/${id}` : `/api/devices/${id}`;
            
            try {
                const res = await fetchAuth(url, {
                    method: 'PUT',
                    body: JSON.stringify({ name: newName.trim() })
                });

				if (res.ok) {
					const currentGid = document.getElementById('sel-group').value;
					
					if (type === 'group') {
						// 1. On recharge les groupes pour le menu déroulant
						await loadGroups(); 
						
						// 2. LE CORRECTIF : On force le rafraîchissement de la liste des réglages
						// C'est ici que le "stylo" est régénéré pour chaque ligne
						setTimeout(async () => {
							await refreshParamsLists();
							
							// On s'assure que l'accordéon reste ouvert
							const checkG = document.getElementById('check-g');
							if (checkG) checkG.checked = true;
						}, 300);

					} else {
						await loadGroupData(currentGid);
						await refreshParamsLists();
					}
				}
            } catch (err) {
                // Ici, on attrape l'erreur réseau (ex: coupure Wi-Fi)
                console.error("Erreur critique modification:", err);
                alert("Impossible de joindre le serveur. Vérifiez votre connexion.");
            }
        });
    }
}

async function submitOrder() {
    const devId = document.getElementById('sel-dev').value;
    const client = document.getElementById('order-client').value;
    const phone = document.getElementById('order-phone').value;
    const date = document.getElementById('order-date').value;
    let orderNum = document.getElementById('order-num').value;

    if(!client) return alert("Le nom du client est obligatoire");

    // --- SÉCURITÉ V3 : RÉCUPÉRATION DE L'EMAIL ---
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || !user.email) return alert("Session expirée, merci de vous reconnecter.");

    const payload = {
        name: client,
        orderNumber: orderNum || ("CMD-" + Math.floor(1000 + Math.random() * 9000)),
        phone: phone,
        pickupDate: date
        /// INUTILE désormais avec le fetchAuth ownerEmail: user.email // <--- ON AJOUTE L'EMAIL ICI
    };

    let url = editingPostitId ? `/api/postits/details/${editingPostitId}` : '/api/postits';
    // Attention : J'ai corrigé l'URL du PUT pour correspondre à ta route '/api/postits/:id'
    if (editingPostitId) url = `/api/postits/${editingPostitId}`; 

    let method = editingPostitId ? 'PUT' : 'POST';
    if (!editingPostitId) payload.deviceId = devId;

    const res = await fetchAuth(url, {
        method: method,
        body: JSON.stringify(payload)
    });

    if(res.ok) {
        closeOrderModal();
        const currentGid = document.getElementById('sel-group').value; 
        await loadGroupData(currentGid); 
        await refreshParamsLists(); 
    }
}

function showStatusMenu(btn, pid) {
    // 1. Sécurité : si le bouton n'existe pas, on sort pour ne pas faire planter le script
    if (!btn) return;

    // 2. On récupère le statut
    const currentStatus = btn.getAttribute('data-status');

    // 3. BLOCAGE : On vérifie si currentStatus existe ET s'il est verrouillé
    if (currentStatus && (currentStatus === "En caisse" || currentStatus === "Terminé")) {
        alert("Cette commande est validée en caisse. Le statut ne peut plus être modifié.");
        return; 
    }

    // 4. Si on arrive ici, c'est que ce n'est pas verrouillé, on affiche le menu
    const existing = document.getElementById('status-popup');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.id = 'status-popup';
    menu.className = 'fixed inset-0 bg-black/50 z-[3000] flex items-center justify-center p-6';
    menu.onclick = () => menu.remove();

    const content = document.createElement('div');
    content.className = 'bg-white border-4 border-black p-4 w-full shadow-[8px_8px_0px_#000]';
    content.onclick = (e) => e.stopPropagation();

    const options = ["En attente", "En préparation", "Terminé", "Annulé"];
    // Note : On n'ajoute pas "En caisse" ici car il est automatique via l'upload
    
    content.innerHTML = `
        <div class="text-[10px] font-black uppercase mb-4 opacity-40">Changer le statut</div>
        <div class="flex flex-col gap-2">
            ${options.map(opt => `
                <button onclick="execChangeStatus('${pid}', '${opt}')" 
                        class="p-4 border-2 border-black font-black uppercase text-left active:bg-black active:text-white">
                    ${opt}
                </button>
            `).join('')}
            <button onclick="this.parentElement.parentElement.parentElement.remove()" class="mt-2 p-2 text-[10px] font-black uppercase opacity-50">Fermer</button>
        </div>
    `;

    menu.appendChild(content);
    document.body.appendChild(menu);
}
// La fonction qui exécute le changement
function execChangeStatus(pid, newStatus) {
    let comment = "";
    const btn = document.getElementById('btn-status-main');
    const oldStatus = btn ? btn.getAttribute('data-status') : "";

    // Cas 1 : On annule la commande
    if (newStatus === "Annulé") {
        comment = prompt("Motif de l'annulation (obligatoire) :");
        if (!comment || comment.trim() === "") return;
    } 
    // Cas 2 : On réactive une commande qui était annulée
    else if (oldStatus === "Annulé") {
        comment = prompt("Motif de réactivation (obligatoire car la commande était annulée) :");
        if (!comment || comment.trim() === "") return;
        comment = "🔄 RÉACTIVATION : " + comment;
    }

    socket.emit('update-postit-status', { 
        postitId: pid, 
        status: newStatus, 
        comment: comment 
    });
    
    const menu = document.getElementById('status-popup');
    if (menu) menu.remove();
}


function uiCreatePostit(e) {
    if(e) e.stopPropagation();
    editingPostitId = null;
    document.getElementById('order-client').value = "";
    document.getElementById('order-num').value = "";
    document.getElementById('order-phone').value = "";
    document.getElementById('order-date').value = "";
    const isPro = currentGroupConfig && currentGroupConfig.isPro;
    const proFlds = document.getElementById('order-pro-fields');
    if (proFlds) proFlds.style.display = isPro ? '' : 'none';
    const titleEl = document.getElementById('order-modal-title') || document.querySelector('#order-modal h2');
    if (titleEl) titleEl.innerText = isPro ? "Nouvelle Commande" : "Nouveau Post-it";
    document.getElementById('order-modal').classList.remove('hidden');
}

async function uiJoinGroup() {
    const codeInput = document.getElementById('input-join-code');
    const code = codeInput ? codeInput.value.trim() : prompt("Entrez le code du commerce :");
    
    if(!code) return;

    const user = JSON.parse(localStorage.getItem('user'));
    
    try {
        const res = await fetchAuth('/api/groups/join', {
            method: 'POST',
            body: JSON.stringify({ 
                joinCode: code 
            })
        });

        if(res.ok) {
            const group = await res.json();
            alert(`Succès ! Vous avez rejoint : ${group.name}`);
            if(codeInput) codeInput.value = "";
            // On rafraîchit les listes pour voir le nouveau groupe apparaître
            if (typeof initApp === 'function') initApp(); 
            else location.reload();
        } else {
            const txt = await res.text();
            alert("Erreur : " + txt);
        }
    } catch (err) {
        alert("Impossible de rejoindre le groupe actuellement.");
    }
}

async function login() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    // ⚠️ Utilise bien "fetch" ici, pas "fetchAuth"
    const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (res.ok) {
        currentUser = data.user;
        // On sauvegarde le token qu'on vient de recevoir
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem('token', data.token); 
        
        document.getElementById('auth-screen').classList.add('hidden');
        initApp();
    } else {
        alert("Erreur : " + (data.message || "Connexion échouée"));
    }
}