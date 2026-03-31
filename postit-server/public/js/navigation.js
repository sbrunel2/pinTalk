let currentPage = 1;
let touchstartX = 0;
let touchendX = 0;

window.addEventListener('DOMContentLoaded', () => {
    goToPage(1);
    const viewport = document.getElementById('viewport');
    if (viewport) {
        viewport.addEventListener('touchstart', e => { touchstartX = e.changedTouches[0].screenX; }, {passive: true});
        viewport.addEventListener('touchend', e => { touchendX = e.changedTouches[0].screenX; handleGesture(); }, {passive: true});
    }
});

function handleGesture() {
    const threshold = 60;
    if (touchendX < touchstartX - threshold && currentPage < 4) goToPage(currentPage + 1);
    if (touchendX > touchstartX + threshold && currentPage > 0) goToPage(currentPage - 1);
}

function goToPage(index) {
    currentPage = index;
    const vp = document.getElementById('viewport');
    const titleEl = document.getElementById('page-title');
    const fixedHeader = document.querySelector('.fixed-header');
    const msgBar = document.getElementById('message-bar'); // Cible la barre de message

    const titles = ["Paramètres", "Direct", "Archives", "Membres", "Préparation"];
    
    if (vp) {
        vp.style.transform = `translateX(-${index * 100}vw)`;
    }
    
    if (fixedHeader) {
        fixedHeader.style.display = (index === 4) ? 'none' : 'flex';
    }

    // GESTION DE LA BARRE DE MESSAGE : Uniquement sur "Direct" (index 1)
    if (msgBar) {
        msgBar.style.display = (index === 1) ? 'flex' : 'none';
    }

    if (titleEl) {
        titleEl.innerText = titles[index] || "Direct";
    }

    document.querySelectorAll('.tab-item').forEach((item, i) => {
        item.classList.toggle('active', i === index);
    });
}