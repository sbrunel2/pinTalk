// ─── GROUPES : liste + sélection ─────────────────────────────────────────────
// Ordre des groupes persisté
let groupsOrder = JSON.parse(localStorage.getItem('groupsOrder') || '[]');

// ── Préférences utilisateur (tuiles, ordre) ───────────────────────────────────
// Chargées depuis le serveur, cachées en mémoire et localStorage
let _userPrefs = null;  // { tilePrefs:{}, pintalkPrefs:{}, groupsOrder:[] }

async function _loadUserPrefs() {
    // D'abord restaurer depuis localStorage (instantané)
    const local = localStorage.getItem('userPrefs');
    if (local) {
        try { _userPrefs = JSON.parse(local); } catch(e) {}
    }
    if (!_userPrefs) _userPrefs = { tilePrefs:{}, pintalkPrefs:{}, groupsOrder:[] };
    // Restaurer l'ordre des groupes
    if (_userPrefs.groupsOrder && _userPrefs.groupsOrder.length) {
        groupsOrder = _userPrefs.groupsOrder;
    }
    // Puis charger depuis le serveur
    try {
        const res = await fetchAuth('/api/user/prefs', {}, true);
        if (res && res.ok) {
            _userPrefs = await res.json();
            if (!_userPrefs.tilePrefs)    _userPrefs.tilePrefs    = {};
            if (!_userPrefs.pintalkPrefs) _userPrefs.pintalkPrefs = {};
            if (!_userPrefs.groupsOrder)  _userPrefs.groupsOrder  = [];
            if (_userPrefs.groupsOrder.length) groupsOrder = _userPrefs.groupsOrder;
            localStorage.setItem('userPrefs', JSON.stringify(_userPrefs));
        }
    } catch(e) {}
}

async function _saveUserPrefs(partial) {
    if (!_userPrefs) _userPrefs = { tilePrefs:{}, pintalkPrefs:{}, groupsOrder:[] };
    Object.assign(_userPrefs, partial);
    localStorage.setItem('userPrefs', JSON.stringify(_userPrefs));
    // Sauvegarder en arrière-plan (sans bloquer l'UI)
    fetchAuth('/api/user/prefs', { method:'PUT', body: JSON.stringify(partial) })
        .catch(e => console.warn('prefs save:', e));
}

function _getTilePref(id, key, fallback='') {
    if (!_userPrefs) return fallback;
    return (_userPrefs.tilePrefs?.[id]?.[key]) ?? fallback;
}

function _setPilePref(id, prefs) {
    if (!_userPrefs) _userPrefs = { tilePrefs:{}, pintalkPrefs:{}, groupsOrder:[] };
    _userPrefs.tilePrefs[id] = { ...(_userPrefs.tilePrefs[id]||{}), ...prefs };
    _saveUserPrefs({ tilePrefs: _userPrefs.tilePrefs });
}

function _getPintalkPref(id, key, fallback='') {
    if (!_userPrefs) return fallback;
    return (_userPrefs.pintalkPrefs?.[id]?.[key]) ?? fallback;
}

function _setPintalkPref(id, prefs) {
    if (!_userPrefs) _userPrefs = { tilePrefs:{}, pintalkPrefs:{}, groupsOrder:[] };
    _userPrefs.pintalkPrefs[id] = { ...(_userPrefs.pintalkPrefs[id]||{}), ...prefs };
    _saveUserPrefs({ pintalkPrefs: _userPrefs.pintalkPrefs });
}

let _loadGroupsListTimer = null;
let _loadGroupsListInProgress = false;

async function loadGroupsList() {
    // Debounce : ignorer les appels multiples dans la même frame
    if (_loadGroupsListInProgress) return;
    if (_loadGroupsListTimer) { clearTimeout(_loadGroupsListTimer); }
    _loadGroupsListTimer = setTimeout(_doLoadGroupsList, 80);
}

async function _doLoadGroupsList() {
    if (_loadGroupsListInProgress) return;
    _loadGroupsListInProgress = true;
    try { await _loadGroupsListImpl(); }
    finally { _loadGroupsListInProgress = false; _loadGroupsListTimer = null; }
}

async function _loadGroupsListImpl() {
    const container = document.getElementById('groups-list-container');
    if (!container) return;
    container.innerHTML = '<p style="text-align:center;opacity:0.3;font-size:11px;margin-top:30px;">Chargement…</p>';
    try {
        const res = await fetchAuth('/api/groups/mine');
        if (!res.ok) { container.innerHTML = '<p style="text-align:center;opacity:0.4;margin-top:30px;">Erreur.</p>'; return; }
        const groups = await res.json();
        // Pas de groupes → afficher quand même la tuile "+"
        if (!groups.length) {
            const _r0 = window._currentTileRadius || '0px';
            container.style.padding = '4px 12px 8px 12px';
            container.innerHTML = `<div id="groups-grid"
                style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:2px;touch-action:pan-y;">
                <div onclick="uiCreateGroup(event)"
                     style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                            min-height:88px;cursor:pointer;
                            border:2px dashed var(--accent);
                            background:transparent;color:var(--accent);
                            touch-action:manipulation;border-radius:${_r0};">
                    <div style="font-size:26px;font-weight:100;line-height:1;margin-bottom:3px;pointer-events:none;">+</div>
                    <div style="font-size:7px;font-weight:900;text-transform:uppercase;pointer-events:none;">Nouveau</div>
                </div></div>`;
            _ensureTileDragGhost();
            const savedShape0 = window._currentTileShape || localStorage.getItem('defaultTileShape') || 'rect';
            requestAnimationFrame(() => setDefaultTileShape(savedShape0));
            return;
        }
        // Trier selon l'ordre mémorisé
        // Ordre personnel de l'utilisateur
        const _userOrder = (_userPrefs?.groupsOrder?.length ? _userPrefs.groupsOrder : groupsOrder);
        const ordered = [...groups].sort((a, b) => {
            const ia = _userOrder.indexOf(a._id);
            const ib = _userOrder.indexOf(b._id);
            if (ia === -1 && ib === -1) return 0;
            if (ia === -1) return 1; if (ib === -1) return -1;
            return ia - ib;
        });

        const roleFull = {owner:'Proprio', admin:'Admin', employe:'Employé', client:'Membre'};
        const groupTilesHtml = ordered.map(g => {
            const isActive = g._id === currentGroupId;
            const bg    = isActive ? 'var(--accent)' : '#fff';
            const color = isActive ? '#fff' : 'var(--accent)';
            const canEdit = true; // Tout le monde voit la roue (contenu adapté selon rôle)
            const canEditGroup = g.myRole === 'owner' || g.myRole === 'admin';
            const logoHtml = g.logoUrl
                ? `<img src="${g.logoUrl}" style="width:28px;height:28px;object-fit:cover;border:1px solid rgba(0,0,0,0.1);margin-bottom:3px;pointer-events:none;user-select:none;" draggable="false">`
                : `<div style="width:28px;height:28px;background:rgba(0,0,0,0.07);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;margin-bottom:3px;pointer-events:none;">${g.name[0].toUpperCase()}</div>`;
            // Style de la tuile : préf utilisateur > propriétés du groupe > défaut
            const _prefBg   = _userPrefs?.tilePrefs?.[g._id]?.color     || '';
            const _prefText = _userPrefs?.tilePrefs?.[g._id]?.textColor || '';
            const tColor  = isActive ? 'var(--accent)' : (_prefBg   || g.tileColor     || '#fff');
            const tText   = isActive ? '#fff'          : (_prefText || g.tileTextColor || 'var(--accent)');
            const tShape  = g.tileShape     || 'rect';
            const tFont   = g.tileFontFamily|| '';
            const tFSize  = g.tileFontSize  || '8';
            const radius  = tShape === 'circle' ? '50%' : tShape === 'rounded' ? '12px' : '0px';
            const tileStyleExtra = `background:${tColor};color:${tText};border-radius:${radius};` +
                (tFont   ? `font-family:${tFont};` : '') +
                (tFSize  ? `font-size:${tFSize}px;` : '');

            // Forme : préf utilisateur en priorité, puis globale
            const _indivShape = _userPrefs?.tilePrefs?.[g._id]?.shape || null;
            const _ts  = _indivShape || window._currentTileShape || 'rect';
            const _tr  = _ts === 'circle' ? '50%' : _ts === 'rounded' ? '16px' : '0px';
            const tileW = _ts === 'circle' ? 'width:88px;height:88px;' : '';
            return `<div id="tile-${g._id}"
                ontouchstart="tileTouch(event,'${g._id}')"
                ontouchmove="tileTouchMove(event)"
                ontouchend="tileTouchEnd(event,'${g._id}')"
                onclick="selectGroup('${g._id}')"
                style="${tileStyleExtra}${tileW}
                       border-radius:${_tr};overflow:hidden;
                       border:2px solid ${isActive?'var(--accent)':'rgba(0,0,0,0.18)'};
                       box-shadow:${isActive?'3px 3px 0 rgba(0,0,0,0.35)':'3px 3px 0 rgba(0,0,0,0.12)'};
                       padding:8px 5px 16px 5px;cursor:pointer;display:flex;flex-direction:column;
                       align-items:center;text-align:center;position:relative;
                       min-height:88px;justify-content:center;
                       user-select:none;-webkit-user-select:none;touch-action:none;">
                ${g.isPro ? `<span style="position:absolute;top:3px;right:3px;background:#18181b;color:#fff;font-size:6px;font-weight:900;padding:1px 3px;pointer-events:none;">PRO</span>
                             <span style="position:absolute;bottom:14px;right:3px;font-size:10px;opacity:0.4;pointer-events:none;">🛍️</span>` : ''}
                ${canEdit ? `<button onclick="event.stopPropagation();uiEditGroup('${g._id}')"
                    style="position:absolute;bottom:3px;left:50%;transform:translateX(-50%);background:none;border:none;font-size:11px;cursor:pointer;opacity:0.6;padding:2px;touch-action:manipulation;z-index:2;">⚙️</button>` : ''}
                <div style="pointer-events:none;display:flex;flex-direction:column;align-items:center;">
                ${logoHtml}
                <div style="font-weight:900;text-transform:uppercase;line-height:1.2;word-break:break-word;padding:0 2px;">${g.name}</div>
                </div>
            </div>`;
        }).join('');

        const addTileHtml = `<div onclick="uiCreateGroup(event)"
            style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                   min-height:88px;cursor:pointer;border:2px dashed rgba(0,0,0,0.18);
                   background:rgba(0,0,0,0.02);color:rgba(0,0,0,0.28);touch-action:manipulation;">
            <div style="font-size:26px;font-weight:100;line-height:1;margin-bottom:3px;">+</div>
            <div style="font-size:7px;font-weight:900;text-transform:uppercase;">Nouveau</div>
        </div>`;

        // Wrapper avec marges latérales = zones de swipe
        container.style.padding = '4px 12px 8px 12px';
        container.innerHTML = `<div id="groups-grid"
            style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:2px;touch-action:pan-y;">
            ${addTileHtml}${groupTilesHtml}
        </div>`;
        _ensureTileDragGhost();
        // Appliquer forme + activer pinch
        const _sv = window._currentTileShape || localStorage.getItem('defaultTileShape') || localStorage.getItem('tileShape') || 'rect';
        requestAnimationFrame(() => {
            setDefaultTileShape(_sv);  // applique global + restaure individuels
            _initPinchGestures();
        });

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
            _vibrate([30, 20, 50]);
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
        _vibrate(20); // vibration relâcher
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
                _saveUserPrefs({ groupsOrder: allIds });
                loadGroupsList();
            }
        }
    }
    _tileDragId = null; _tileDragEl = null; _tileMoved = false;
}

function initTileDragTouch() { _ensureTileDragGhost(); }

// ── Pinch/Spread pour changer la forme des tuiles ───────────────────────────
// ── Pinch/Spread — gestion des formes de tuiles ─────────────────────────────
//
// LOGIQUE UNIFIÉE (capture phase sur la grille) :
//   Dès que 2 doigts sont détectés → pinch prend la main, tout est bloqué
//   2e doigt sur tuile   → forme de CETTE tuile
//   2e doigt hors tuile  → forme GLOBALE
//   1 seul doigt         → drag/long-press normal délégué à tileTouch

let _pinchTile      = null;
let _pinchGlobal    = false;
let _pinchStartDist = 0;
let _pinchTriggered = false;
let _pinchActive    = false;  // pinch en cours (2 doigts détectés)

function _getDist(t1, t2) {
    return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
}

function _getTileShape(tile) {
    if (!tile) return window._currentTileShape || localStorage.getItem('tileShape') || 'rect';
    return tile.dataset.tileShape || window._currentTileShape || 'rect';
}

function _applyShapeToTile(tile, shape) {
    const r = shape === 'circle' ? '50%' : shape === 'rounded' ? '16px' : '0px';
    tile.style.borderRadius = r;
    tile.style.overflow     = 'hidden';
    tile.dataset.tileShape  = shape;
    if (shape === 'circle') {
        tile.style.width = tile.style.height = tile.style.minHeight = '88px';
        tile.style.padding = '4px';
    } else {
        tile.style.width = tile.style.height = '';
        tile.style.minHeight = '88px';
        tile.style.padding = '';
    }
    const groupId = tile.id.replace('tile-', '');
    if (groupId) {
        _setPilePref(groupId, { shape });
    }
}

function _onGridTouch(e) {
    // Appelé en CAPTURE → avant tileTouch inline et avant le swipe viewport

    if (e.type === 'touchstart') {
        if (e.touches.length >= 2) {
            // ── 2 DOIGTS : pinch prend la main ──────────────────────
            _pinchActive = true;

            // Stopper tout drag en cours
            if (_tileLongPress) { clearTimeout(_tileLongPress); _tileLongPress = null; }
            if (_tileDragEl) {
                _tileDragEl.style.opacity = '1';
                _tileDragEl.style.transform = '';
                _tileDragEl = null; _tileDragId = null; _tileMoved = false;
            }
            const ghost = document.getElementById('tile-ghost');
            if (ghost) ghost.style.opacity = '0';

            // 1er doigt : détermine la tuile cible (si sur une tuile)
            const el1   = document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY);
            const tile1 = el1?.closest('#groups-grid [id^="tile-"]') || null;
            // 2e doigt
            const el2   = document.elementFromPoint(e.touches[1].clientX, e.touches[1].clientY);
            const tile2 = el2?.closest('#groups-grid [id^="tile-"]') || null;
            // Si AU MOINS UN doigt est sur une tuile → mode individuel sur cette tuile
            _pinchTile   = tile1 || tile2 || null;
            _pinchGlobal = (_pinchTile === null); // true si aucun doigt sur une tuile

            _pinchStartDist = _getDist(e.touches[0], e.touches[1]);
            _pinchTriggered = false;

            e.preventDefault();   // bloquer scroll
            e.stopPropagation();  // bloquer tileTouch inline ET swipe viewport

        }
        // 1 doigt → ne rien faire, laisser tileTouch fonctionner normalement

    } else if (e.type === 'touchmove') {
        if (!_pinchActive) return;
        if (e.touches.length < 2) return;

        e.preventDefault();
        e.stopPropagation();
        if (_pinchTriggered) return;

        const dist  = _getDist(e.touches[0], e.touches[1]);
        const delta = dist - _pinchStartDist;
        if (Math.abs(delta) < 25) return;

        _pinchTriggered = true;

        const curShape = _pinchGlobal
            ? (window._currentTileShape || localStorage.getItem('tileShape') || 'rect')
            : _getTileShape(_pinchTile);

        // Boucle : rect→rounded→circle→rect (pinch) / rect→circle→rounded→rect (spread)
        let nextShape;
        if (delta < 0) {
            nextShape = curShape === 'rect' ? 'rounded' : curShape === 'rounded' ? 'circle' : 'rect';
        } else {
            nextShape = curShape === 'circle' ? 'rounded' : curShape === 'rounded' ? 'rect' : 'circle';
        }

        if (nextShape !== curShape) {
            _vibrate(15);
            if (_pinchGlobal) {
                setDefaultTileShape(nextShape);
            } else {
                _applyShapeToTile(_pinchTile, nextShape);
            }
        }

    } else if (e.type === 'touchend' || e.type === 'touchcancel') {
        if (_pinchActive) {
            // Bloquer le swipe qui suit le relâcher des doigts
            e.stopPropagation();
            window._tileJustDragged = true;
            setTimeout(() => { window._tileJustDragged = false; }, 500);
            _pinchActive = false;
        }
        if (e.touches.length < 2) {
            _pinchTile = null; _pinchGlobal = false; _pinchTriggered = false;
        }
    }
}

function _initPinchGestures() {
    // Attacher sur le conteneur de la page Groupes (p2) pour capturer
    // les touches dans les espaces entre les tuiles aussi
    const container = document.getElementById('p2');
    if (!container || container._pinchInited) return;
    container._pinchInited = true;
    const opts = { passive: false, capture: true };
    container.addEventListener('touchstart',  _onGridTouch, opts);
    container.addEventListener('touchmove',   _onGridTouch, opts);
    container.addEventListener('touchend',    _onGridTouch, opts);
    container.addEventListener('touchcancel', _onGridTouch, opts);
}

// Réinitialiser quand on revient sur la page groupes
function _resetPinchInit() {
    const container = document.getElementById('p2');
    if (container) {
        container._pinchInited = false;
        // Retirer anciens listeners
        container.removeEventListener('touchstart',  _onGridTouch, { capture: true });
        container.removeEventListener('touchmove',   _onGridTouch, { capture: true });
        container.removeEventListener('touchend',    _onGridTouch, { capture: true });
        container.removeEventListener('touchcancel', _onGridTouch, { capture: true });
    }
}
async function selectGroup(groupId) {
    if (window._tileJustDragged) return;
    // Vibration courte : confirmation de sélection du groupe
    _vibrate(25);
    currentGroupId = groupId;
    localStorage.setItem('lastGroupId', groupId); // mémoriser le dernier groupe visité
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
    const hpt    = document.getElementById('header-pintalk-tabs');
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

async function uiEditGroup(groupId) {
    document.getElementById('group-modal')?.remove();
    try {
        const res = await fetchAuth('/api/groups/' + groupId + '/config');
        if (!res.ok) return alert('Erreur chargement groupe');
        const g = await res.json();
        const isOwnerOrAdmin = g.myRole === 'owner' || g.myRole === 'admin';
        if (isOwnerOrAdmin) {
            _openGroupEditModal(groupId, g);
        } else {
            _openGroupMemberModal(groupId, g);
        }
    } catch(e) { console.error(e); }
}

// Modal membre : personnalisation visuelle + quitter le groupe
function _openGroupMemberModal(groupId, g) {
    const pref      = _userPrefs?.tilePrefs?.[groupId] || {};
    const curColor  = pref.color     || g.tileColor     || '#ffffff';
    const curText   = pref.textColor || g.tileTextColor || '#18181b';
    const curShape  = pref.shape     || window._currentTileShape || 'rect';

    const shapeHtml = ['rect','rounded','circle'].map(s => {
        const active = curShape === s;
        const lbl = s==='rect'?'■ Rect':s==='rounded'?'▢ Arrondi':'● Cercle';
        const br  = s==='circle'?'50%':s==='rounded'?'6px':'0';
        return `<button onclick="selectGroupTileShape('${s}')" id="gm-member-pshape-${s}"
            style="flex:1;padding:6px 3px;border:2px solid ${active?'var(--accent)':'rgba(0,0,0,0.15)'};
                   background:${active?'var(--accent)':'white'};color:${active?'white':'#333'};
                   font-size:8px;font-weight:900;cursor:pointer;border-radius:${br};text-transform:uppercase;">${lbl}</button>`;
    }).join('');

    const html = `
    <div id="group-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9998;display:flex;align-items:flex-start;justify-content:center;padding:14px;overflow-y:auto;">
      <div style="background:var(--bg);border:3px solid var(--accent);box-shadow:6px 6px 0 rgba(0,0,0,0.4);padding:18px;width:100%;max-width:400px;margin-top:18px;">
        <h3 style="font-size:13px;font-weight:900;text-transform:uppercase;margin-bottom:12px;">🎨 ${g.name}</h3>
        <div style="font-size:8px;opacity:0.5;font-weight:900;text-transform:uppercase;margin-bottom:10px;">Apparence personnelle de cette tuile</div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
          <label style="font-size:7px;font-weight:900;text-transform:uppercase;display:flex;flex-direction:column;gap:3px;">Fond
            <input type="color" id="gm-member-bg" value="${curColor}"
                   style="width:100%;height:28px;border:2px solid rgba(0,0,0,0.15);padding:0;cursor:pointer;">
          </label>
          <label style="font-size:7px;font-weight:900;text-transform:uppercase;display:flex;flex-direction:column;gap:3px;">Texte
            <input type="color" id="gm-member-text" value="${curText}"
                   style="width:100%;height:28px;border:2px solid rgba(0,0,0,0.15);padding:0;cursor:pointer;">
          </label>
        </div>

        <div style="font-size:7px;font-weight:900;text-transform:uppercase;opacity:0.5;margin-bottom:4px;">Forme</div>
        <div style="display:flex;gap:5px;margin-bottom:12px;">${shapeHtml}</div>
        <input type="hidden" id="gm-member-shape" value="${curShape}">

        <button onclick="resetGroupMemberPrefToDefault('${groupId}')"
            style="width:100%;padding:7px;border:2px solid rgba(0,0,0,0.2);background:white;font-size:9px;font-weight:900;text-transform:uppercase;cursor:pointer;margin-bottom:10px;">
            ↺ Appliquer les paramètres par défaut
        </button>

        <div style="border-top:2px solid rgba(220,38,38,0.15);padding-top:8px;margin-bottom:10px;">
          <button onclick="leaveGroup('${groupId}')"
              style="width:100%;padding:8px;background:#fff;color:#dc2626;border:2px solid #dc2626;font-weight:900;font-size:10px;text-transform:uppercase;cursor:pointer;">
              🚪 Quitter ce groupe
          </button>
        </div>

        <div style="display:flex;gap:8px;">
          <button onclick="document.getElementById('group-modal').remove()"
              style="flex:1;padding:11px;border:2px solid var(--accent);background:white;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">Annuler</button>
          <button onclick="saveGroupMemberPrefs('${groupId}')"
              style="flex:1;padding:11px;background:var(--accent);color:white;border:none;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">Enregistrer</button>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
}

function selectGroupTileShape(shape) {
    const hidden = document.getElementById('gm-member-shape');
    if (hidden) hidden.value = shape;
    ['rect','rounded','circle'].forEach(s => {
        const btn = document.getElementById('gm-member-pshape-' + s);
        if (!btn) return;
        const active = s === shape;
        btn.style.borderColor = active ? 'var(--accent)' : 'rgba(0,0,0,0.15)';
        btn.style.background  = active ? 'var(--accent)' : 'white';
        btn.style.color       = active ? 'white' : '#333';
    });
}

function resetGroupMemberPrefToDefault(groupId) {
    const activeSkin = parseInt(localStorage.getItem('activeSkin') || '0');
    const shape = window._currentTileShape || 'rect';
    document.getElementById('gm-member-bg')?.setAttribute('value', activeSkin===2 ?
        (document.documentElement.style.getPropertyValue('--custom-bg')||'#ffffff') : '#ffffff');
    document.getElementById('gm-member-text')?.setAttribute('value', activeSkin===2 ?
        (document.documentElement.style.getPropertyValue('--custom-text')||'#18181b') : '#18181b');
    selectGroupTileShape(shape);
    document.getElementById('gm-member-shape').value = '';
}

async function saveGroupMemberPrefs(groupId) {
    const color     = document.getElementById('gm-member-bg')?.value    || '';
    const textColor = document.getElementById('gm-member-text')?.value  || '';
    const shape     = document.getElementById('gm-member-shape')?.value || '';
    _setPilePref(groupId, { color, textColor, shape });
    document.getElementById('group-modal')?.remove();
    loadGroupsList();
}

async function leaveGroup(groupId) {
    if (!confirm('Quitter ce groupe ?')) return;
    document.getElementById('group-modal')?.remove();
    const res = await fetchAuth('/api/groups/' + groupId + '/leave', { method:'DELETE' });
    if (res.ok) {
        // Supprimer les prefs locales pour ce groupe
        if (_userPrefs?.tilePrefs?.[groupId]) {
            delete _userPrefs.tilePrefs[groupId];
            _saveUserPrefs({ tilePrefs: _userPrefs.tilePrefs });
        }
        currentGroupId = null;
        localStorage.removeItem('lastGroupId');
        await loadGroups();
        loadGroupsList();
    } else alert('Erreur : ' + await res.text());
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
          <input type="hidden" id="gm-tile-shape" value="${g.tileShape||''}">
          <button onclick="resetGroupTileToDefault()"
              style="width:100%;padding:6px;border:2px solid rgba(0,0,0,0.2);background:white;font-size:9px;font-weight:900;text-transform:uppercase;cursor:pointer;margin-bottom:4px;">
              ↺ Appliquer les paramètres par défaut
          </button>
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
    if (res.status === 202) {
        // Utilisateur inconnu → invitation envoyée automatiquement
        document.getElementById('new-member-email').value = '';
        alert(`✉️ ${email} n'a pas encore de compte Pintalk.
Une invitation lui a été envoyée par email automatiquement.`);
    } else if (res.ok) {
        document.getElementById('new-member-email').value = '';
        loadMembersMatrix(groupId, currentGroupConfig?.isPro);
    } else {
        const t = await res.text();
        alert(t.includes('déjà') ? 'Déjà membre.' : 'Erreur : ' + t);
    }
}
async function setMemberRole(groupId, email, role) {
    await fetchAuth('/api/groups/' + groupId + '/members/' + encodeURIComponent(email), { method:'PUT', body: JSON.stringify({ role }) });
}
async function removeMemberFromMatrix(groupId, email) {
    const res = await fetchAuth('/api/groups/' + groupId + '/members/' + encodeURIComponent(email), { method:'DELETE' });
    if (res.ok) loadMembersMatrix(groupId, currentGroupConfig?.isPro);
}
function resetGroupTileToDefault() {
    // Appliquer les paramètres globaux actuels dans le modal groupe
    const activeSkin = parseInt(localStorage.getItem('activeSkin') || '0');
    const globalShape = window._currentTileShape || 'rect';
    const hidden = document.getElementById('gm-tile-shape');
    if (hidden) hidden.value = ''; // vide = utilise défaut
    selectTileShape(globalShape);
    if (activeSkin === 2) {
        const bg   = document.documentElement.style.getPropertyValue('--custom-bg')   || '#ffffff';
        const text = document.documentElement.style.getPropertyValue('--custom-text') || '#18181b';
        const bgEl  = document.getElementById('gm-tile-color');
        const txEl  = document.getElementById('gm-tile-text');
        if (bgEl)  bgEl.value  = bg;
        if (txEl)  txEl.value  = text;
    } else {
        const bgEl = document.getElementById('gm-tile-color');
        const txEl = document.getElementById('gm-tile-text');
        if (bgEl) bgEl.value  = '#ffffff';
        if (txEl) txEl.value  = '#18181b';
    }
    _vibrate(10);
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
        tileShape:      document.getElementById('gm-tile-shape')?.value  || '',
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
    if (res.ok) {
        // Mettre à jour tileShapes localStorage si forme spécifique choisie
        const chosenShape = payload.tileShape;
        const tileShapesMap = JSON.parse(localStorage.getItem('tileShapes') || '{}');
        if (chosenShape) {
            tileShapesMap[groupId] = chosenShape;
        } else {
            delete tileShapesMap[groupId]; // supprimer = utiliser forme globale
        }
        localStorage.setItem('tileShapes', JSON.stringify(tileShapesMap));
        await loadGroups(groupId);
        loadGroupsList();
    } else alert('Erreur : ' + await res.text());
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

