// 1. Initialiser les groupes au chargement de la page Archives
async function initArchiveSelectors() {
    const res = await fetch('/api/groups');
    const groups = await res.json();
    const sel = document.getElementById('arch-group');
    if(sel) {
        sel.innerHTML = '<option value="">-- Choisir Groupe --</option>' + 
            groups.map(g => `<option value="${g.name}">${g.name}</option>`).join('');
    }
}

// 1. Charger les Displays filtrés par Groupe
async function loadArchDevices(groupName) {
    const devSel = document.getElementById('arch-dev');
    const posSel = document.getElementById('arch-pos');
    
    // Reset des menus dépendants
    devSel.innerHTML = '<option value="">-- Display --</option>';
    posSel.innerHTML = '<option value="">-- Post-it --</option>';
    
    if (!groupName) return;

    try {
        // On récupère les devices qui appartiennent à ce groupe
        const res = await fetch(`/api/devices?groupName=${encodeURIComponent(groupName)}`);
        const devices = await res.json();
        
        devSel.innerHTML = '<option value="">-- Display --</option>' + 
            devices.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
    } catch (err) {
        console.error("Erreur chargement devices archives:", err);
    }
}

// 2. Charger les Post-its filtrés par Display
async function loadArchPostits(deviceName) {
    const posSel = document.getElementById('arch-pos');
    
    // Reset du menu dépendant
    posSel.innerHTML = '<option value="">-- Post-it --</option>';
    
    if (!deviceName) return;

    try {
        // On récupère les post-its qui appartiennent à ce device
        const res = await fetch(`/api/postits?deviceName=${encodeURIComponent(deviceName)}`);
        const postits = await res.json();
        
        posSel.innerHTML = '<option value="">-- Post-it --</option>' + 
            postits.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
    } catch (err) {
        console.error("Erreur chargement postits archives:", err);
    }
}

// 4. Fonction de Sauvegarde (Backup)
async function backupCurrentPostit() {
    const g = document.getElementById('sel-group'), 
          d = document.getElementById('sel-dev'), 
          p = document.getElementById('sel-pos');

    // On vérifie qu'un post-it est bien sélectionné dans l'onglet DIRECT
    if(!p.value) return alert("Allez dans l'onglet Direct et choisissez un post-it d'abord !");

    // On récupère les messages actuellement visibles dans le DOM du chat
    const msgElements = document.querySelectorAll('#chat-history > div');
    const messages = Array.from(msgElements).map(el => {
        const author = el.querySelector('p:first-child')?.innerText || "Inconnu";
        const text = el.querySelector('.text-xs')?.innerText || "";
        return { author, text };
    });

    if(messages.length === 0) return alert("Le chat est vide, rien à sauvegarder.");

    const payload = {
        groupName: g.options[g.selectedIndex].text,
        deviceName: d.options[d.selectedIndex].text,
        postitName: p.options[p.selectedIndex].text,
        content: messages,
        adminId: currentUser._id
    };

    const res = await fetch('/api/archives/backup', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });

    if(res.ok) alert("✅ Archive réussie !");
}

// 5. Affichage des archives existantes
async function refreshArchiveView() {
    const g = document.getElementById('arch-group').value;
    const d = document.getElementById('arch-dev').value;
    const p = document.getElementById('arch-pos').value;
    if(!p) return;

    const res = await fetch(`/api/archives?group=${g}&device=${d}&postit=${p}`);
    const archives = await res.json();
    const container = document.getElementById('archive-content');

    if(archives.length === 0) {
        container.innerHTML = '<p class="text-center opacity-30 mt-10 italic">Aucune archive pour ce post-it.</p>';
        return;
    }

    container.innerHTML = archives.map(arch => `
        <div class="mb-6 p-3 border-l-4 border-black bg-white shadow-[2px_2px_0px_rgba(0,0,0,0.1)]">
            <p class="font-black text-[10px] uppercase opacity-40 mb-2">📦 Archive du ${new Date(arch.archivedAt).toLocaleString()}</p>
            ${arch.content.map(m => `
                <div class="mb-1">
                    <span class="font-bold text-[10px] uppercase">${m.author}:</span>
                    <span class="text-[11px]">${m.text}</span>
                </div>
            `).join('')}
        </div>
    `).join('');
}