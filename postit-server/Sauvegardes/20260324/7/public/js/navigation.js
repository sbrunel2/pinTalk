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
    // On autorise le swipe jusqu'à l'index 4 (Préparation)
    if (touchendX < touchstartX - threshold && currentPage < 4) goToPage(currentPage + 1);
    if (touchendX > touchstartX + threshold && currentPage > 0) goToPage(currentPage - 1);
}

function goToPage(index) {
    currentPage = index;
    const vp = document.getElementById('viewport');
    const titleEl = document.getElementById('page-title');
    const fixedHeader = document.querySelector('.fixed-header'); // On cible le bandeau gris
    
    const titles = ["Paramètres", "Direct", "Archives", "Membres", "Préparation"];
    
    if (vp) {
        vp.style.transform = `translateX(-${index * 100}vw)`;
    }
    
    if (fixedHeader) {
        // SI PAGE PREPARATION (4) -> ON CACHE LE BANDEAU GRIS COMPLET
        fixedHeader.style.display = (index === 4) ? 'none' : 'flex';
    }

    if (titleEl) {
        titleEl.innerText = titles[index] || "Direct";
    }

    document.querySelectorAll('.tab-item').forEach((item, i) => {
        item.classList.toggle('active', i === index);
    });

    const tabBar = document.querySelector('.tab-bar');
    if (tabBar) {
        tabBar.style.display = (index === 4) ? 'none' : 'flex';
    }

    if (index === 2 && typeof initArchiveSelectors === 'function') {
        initArchiveSelectors();
    }
    
    if (typeof refreshView === 'function') {
        refreshView();
    }

    document.activeElement.blur();
}