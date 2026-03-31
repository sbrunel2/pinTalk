async function initArchiveSelectors() {
    const res = await fetch('/api/groups');
    const groups = await res.json();
    const sel = document.getElementById('arch-group');
    if(sel) {
        sel.innerHTML = '<option value="">-- Choisir Groupe --</option>' + 
            groups.map(g => `<option value="${g.name}">${g.name}</option>`).join('');
    }
}

async function loadArchDevices(groupName) {
    if (!groupName) return;
    const res = await fetch(`/api/devices?groupName=${encodeURIComponent(groupName)}`);
    const devices = await res.json();
    document.getElementById('arch-dev').innerHTML = '<option value="">-- Display --</option>' + 
        devices.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
}

async function loadArchPostits(deviceName) {
    if (!deviceName) return;
    const res = await fetch(`/api/postits?deviceName=${encodeURIComponent(deviceName)}`);
    const postits = await res.json();
    document.getElementById('arch-pos').innerHTML = '<option value="">-- Post-it --</option>' + 
        postits.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
}

async function backupCurrentPostit() {
    const g = document.getElementById('sel-group'), 
          d = document.getElementById('sel-dev'), 
          p = document.getElementById('sel-pos');

    if(!p.value) return alert("Choisissez un post-it dans l'onglet Direct.");

    const msgBlocks = document.querySelectorAll('#chat-history > div');
    const messages = Array.from(msgBlocks).map(block => ({
        author: block.querySelector('b')?.innerText || "Système",
        text: block.querySelector('.font-bold')?.innerText || block.innerText.split(': ')[1] || ""
    })).filter(m => m.text !== "");

    if(messages.length === 0) return alert("Rien à sauvegarder.");

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

async function refreshArchiveView() {
    const g = document.getElementById('arch-group').value;
    const d = document.getElementById('arch-dev').value;
    const p = document.getElementById('arch-pos').value;
    if(!p) return;

    const res = await fetch(`/api/archives?group=${g}&device=${d}&postit=${p}`);
    const archives = await res.json();
    const container = document.getElementById('archive-content');

    if(archives.length === 0) {
        container.innerHTML = '<p class="text-center opacity-30 mt-10">Aucune archive.</p>';
        return;
    }

    container.innerHTML = archives.map(arch => `
        <div class="mb-4 p-3 border-2 border-black bg-white mx-2 text-[10px]">
            <div class="font-black opacity-40 mb-2 border-b border-black/10">${new Date(arch.archivedAt).toLocaleString()}</div>
            ${arch.content.map(m => `<div><b class="uppercase">${m.author}</b>: ${m.text}</div>`).join('')}
        </div>
    `).join('');
}