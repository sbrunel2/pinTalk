let currentPage = 1;
let touchstartX = 0;
let touchendX = 0;

window.addEventListener('DOMContentLoaded', () => {
    goToPage(1); // Page par défaut : Direct

    const viewport = document.getElementById('viewport');
    
    viewport.addEventListener('touchstart', e => {
        touchstartX = e.changedTouches[0].screenX;
    }, {passive: true});

    viewport.addEventListener('touchend', e => {
        touchendX = e.changedTouches[0].screenX;
        handleGesture();
    }, {passive: true});
});

function handleGesture() {
    const threshold = 60;
    if (touchendX < touchstartX - threshold) {
        if (currentPage < 3) goToPage(currentPage + 1);
    }
    if (touchendX > touchstartX + threshold) {
        if (currentPage > 0) goToPage(currentPage - 1);
    }
}

function goToPage(index) {
    currentPage = index;
    const vp = document.getElementById('viewport');
    const titles = ["Paramètres", "Direct", "Archives", "Membres"];
    
    vp.style.transform = `translateX(-${index * 100}vw)`;
    document.getElementById('page-title').innerText = titles[index];
    
    const items = document.querySelectorAll('.tab-item');
    items.forEach((item, i) => {
        item.classList.toggle('active', i === index);
    });
    
    // Ferme le clavier lors du changement de page
    document.activeElement.blur();
}