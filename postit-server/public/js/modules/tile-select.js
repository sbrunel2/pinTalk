// ═══════════════════════════════════════════════════════════════════════
// TILE-SELECT — Sélection visuelle des tuiles groupe
//
// Technique : box-shadow multicouche — suit le border-radius.
// Contour adaptatif : blanc sur fond sombre, noir sur fond clair.
// Lit la couleur depuis data-bg (posé par loadGroupsList au rendu HTML).
//
// RÈGLE ABSOLUE : ne touche qu'à boxShadow, transform, zIndex.
// ═══════════════════════════════════════════════════════════════════════

let _tileSelectTimer = null;

// Calcule la luminance d'une couleur CSS (retourne true si sombre)
function _isColorDark(cssColor) {
    if (!cssColor || cssColor === 'transparent' || cssColor === 'inherit'
        || cssColor === '' || cssColor === 'initial') return false;
    try {
        const tmp = document.createElement('div');
        tmp.style.cssText = `display:none;background:${cssColor}`;
        document.body.appendChild(tmp);
        const bg = window.getComputedStyle(tmp).backgroundColor;
        document.body.removeChild(tmp);
        const m = bg.match(/\d+/g);
        if (!m || m.length < 3) return false;
        const lum = (0.299 * +m[0] + 0.587 * +m[1] + 0.114 * +m[2]) / 255;
        return lum < 0.45;
    } catch(e) { return false; }
}

function _updateGroupTileSelection(groupId) {
    document.querySelectorAll('#groups-grid [id^="tile-"]').forEach(t => {
        t.classList.remove('tile-selected');
        t.style.boxShadow = '3px 3px 0 rgba(0,0,0,0.12)';
        t.style.transform = '';
        t.style.zIndex    = '';
    });

    if (!groupId) return;
    const tile = document.getElementById('tile-' + groupId);
    if (!tile) return;

    // Lire la couleur depuis data-bg (attribut posé au rendu HTML par loadGroupsList)
    // Fallback : getComputedStyle (plus lent mais fiable)
    const dataBg   = tile.getAttribute('data-bg') || '';
    const computed = window.getComputedStyle(tile).backgroundColor;
    const bgToTest = dataBg || computed || '#fff';
    const isDark   = _isColorDark(bgToTest);

    const ring = isDark ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.85)';
    const halo = isDark ? 'rgba(0,0,0,0.5)'        : 'rgba(255,255,255,0.8)';

    tile.style.boxShadow = `0 0 0 3px ${ring}, 0 0 0 5px ${halo}, 2px 4px 8px rgba(0,0,0,0.25)`;
    tile.style.transform = 'scale(1.05)';
    tile.style.zIndex    = '10';
    tile.classList.add('tile-selected');
}

function _scheduleGroupTileUpdate() {
    if (_tileSelectTimer) clearTimeout(_tileSelectTimer);
    _tileSelectTimer = setTimeout(() => {
        const gid = (typeof currentGroupId !== 'undefined') ? currentGroupId : null;
        if (gid) _updateGroupTileSelection(gid);
    }, 200);
}

function _initGroupTileObserver() {
    const container = document.getElementById('p2');
    if (!container) return;
    new MutationObserver(() => _scheduleGroupTileUpdate())
        .observe(container, { childList: true, subtree: true });
}

function _initGroupTileClick() {
    const p2 = document.getElementById('p2');
    if (!p2) return;
    p2.addEventListener('click', (e) => {
        const tile = e.target.closest('[id^="tile-"]');
        if (!tile || tile.id === 'tile-ghost') return;
        const gid = tile.id.replace('tile-', '');
        _updateGroupTileSelection(gid);
        setTimeout(() => _updateGroupTileSelection(gid), 400);
        setTimeout(() => _updateGroupTileSelection(gid), 900);
    }, { capture: true });
}

function _tileSelectInit() {
    _initGroupTileObserver();
    _initGroupTileClick();
    const gid = (typeof currentGroupId !== 'undefined') ? currentGroupId : null;
    if (gid) setTimeout(() => _updateGroupTileSelection(gid), 600);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _tileSelectInit);
} else {
    _tileSelectInit();
}
