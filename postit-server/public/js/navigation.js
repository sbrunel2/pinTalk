// Pages : 0=Archives, 1=Params, 2=Groupes, 3=Chat, 4=Prep (hors nav)
const PAGE_ARCHIVES = 0;
const PAGE_PARAMS   = 1;
const PAGE_GROUPES  = 2;
const PAGE_CHAT     = 3;
const PAGE_PREP     = 4;

let currentPage = PAGE_GROUPES;
let touchstartX = 0;
let touchendX   = 0;

window.addEventListener('DOMContentLoaded', () => {
    // Toujours démarrer sur Groupes — initApp() gère la navigation vers le dernier pintalk
    goToPage(PAGE_GROUPES);

    const viewport = document.getElementById('viewport');
    if (viewport) {
        viewport.addEventListener('touchstart', e => {
            touchstartX = e.changedTouches[0].screenX;
        }, { passive: true });
        viewport.addEventListener('touchend', e => {
            if (e.target.closest('[id^="swipe-"]') || e.target.closest('[id^="bubble-"]')) return;
            if (window._tileJustDragged) return;
            if (window._swipeBlocked)   return;
            touchendX = e.changedTouches[0].screenX;
            handleGesture();
        }, { passive: true });
    }
});

function handleGesture() {
    const threshold = 60;
    if (currentPage === PAGE_PREP) return;
    if (touchendX < touchstartX - threshold && currentPage < PAGE_CHAT) goToPage(currentPage + 1);
    if (touchendX > touchstartX + threshold && currentPage > PAGE_ARCHIVES) goToPage(currentPage - 1);
}

function goToPage(index) {
    currentPage = index;
    const vp       = document.getElementById('viewport');
    const titleEl  = document.getElementById('page-title');
    const fixedHdr = document.querySelector('.fixed-header');
    const msgBar   = document.getElementById('message-bar');
    const titles   = ["Archives", "Paramètres", "Mes Groupes", "Chat", "Préparation"];

    if (vp)       vp.style.transform = `translateX(-${index * 100}vw)`;
    if (fixedHdr) fixedHdr.style.display = (index === PAGE_PREP) ? 'none' : 'flex';
    if (msgBar)   msgBar.style.display   = (index === PAGE_CHAT) ? 'flex' : 'none';
    if (titleEl)  titleEl.innerText = titles[index] || '';

    document.querySelectorAll('.tab-item').forEach((item, i) => {
        item.classList.toggle('active', i === index);
    });

    if (index !== PAGE_PREP) localStorage.setItem('lastPage', index);
    if (index === PAGE_GROUPES && typeof loadGroupsList === 'function') loadGroupsList();
    if (index === PAGE_GROUPES && typeof _initPinchGestures === 'function') {
        // Réinitialiser les gestures pinch à chaque visite de la page groupes
        setTimeout(_initPinchGestures, 100);
    }
    if (index === PAGE_ARCHIVES && typeof initArchiveSelectors === 'function') initArchiveSelectors();

    // Alterner titre / tuiles postits dans l'entête
    const hpt     = document.getElementById('header-pintalk-tabs');
    const ptWrap  = document.getElementById('header-title-wrap');
    const spacer  = document.getElementById('header-spacer');
    const onChat  = (index === PAGE_CHAT);
    if (hpt)    hpt.style.display    = onChat ? 'flex' : 'none';
    if (ptWrap) ptWrap.style.display = onChat ? 'none' : 'flex';
    if (spacer) spacer.style.display = onChat ? 'none' : 'flex';
}
