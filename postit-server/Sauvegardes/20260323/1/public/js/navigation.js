let currentPage = 1;
let touchstartX = 0;
let touchendX = 0;

window.addEventListener('DOMContentLoaded', () => {
    goToPage(1);
    const viewport = document.getElementById('viewport');
    viewport.addEventListener('touchstart', e => { touchstartX = e.changedTouches[0].screenX; }, {passive: true});
    viewport.addEventListener('touchend', e => { touchendX = e.changedTouches[0].screenX; handleGesture(); }, {passive: true});
});

function handleGesture() {
    const threshold = 60;
    if (touchendX < touchstartX - threshold && currentPage < 3) goToPage(currentPage + 1);
    if (touchendX > touchstartX + threshold && currentPage > 0) goToPage(currentPage - 1);
}

function goToPage(index) {
    currentPage = index;
    const vp = document.getElementById('viewport');
    const titles = ["Paramètres", "Direct", "Archives", "Membres"];
    vp.style.transform = `translateX(-${index * 100}vw)`;
    document.getElementById('page-title').innerText = titles[index];
    document.querySelectorAll('.tab-item').forEach((item, i) => item.classList.toggle('active', i === index));
    document.activeElement.blur();

    // AJOUT : Si on arrive sur l'onglet Archives (index 2)
    if (index === 2) {
        initArchiveSelectors();
    }
}