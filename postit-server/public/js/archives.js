let lastArchGroup = ""; // Mémoire pour le groupe sélectionné

// Fetch avec token pour archives
function fetchWithToken(url, options = {}) {
    const token = localStorage.getItem('token');
    const headers = { ...options.headers, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    return fetch(url, { ...options, headers });
}

async function initArchiveSelectors() {
    const res = await fetchWithToken('/api/groups');
    const groups = await res.json();
    const sel = document.getElementById('arch-group');
    if(!sel) return;

    sel.innerHTML = '<option value="">-- Groupe --</option>' + 
        groups.map(g => `<option value="${g.name}">${g.name}</option>`).join('');

    if (lastArchGroup) {
        sel.value = lastArchGroup;
        loadArchDevices(lastArchGroup);
    }
}

async function loadArchDevices(groupName) {
    const devSel = document.getElementById('arch-dev');
    const posSel = document.getElementById('arch-pos');
    
    if (!groupName) {
        devSel.innerHTML = '<option value="">-- Display --</option>';
        posSel.innerHTML = '<option value="">-- Post-it --</option>';
        return;
    }

    lastArchGroup = groupName;

    const res = await fetchWithToken(`/api/devices?groupName=${encodeURIComponent(groupName)}`);
    const devices = await res.json();
    
    if (devices.length > 0) {
        devSel.innerHTML = devices.map(d => `<option value="${d._id}">${d.name}</option>`).join('');
        loadArchPostits(devices[0]._id);
    } else {
        devSel.innerHTML = '<option value="">Aucun Display</option>';
        posSel.innerHTML = '<option value="">-</option>';
    }
}

async function loadArchPostits(deviceId) {
    const posSel = document.getElementById('arch-pos');
    if (!deviceId) return;

    const res = await fetchWithToken(`/api/postits?deviceId=${deviceId}`);
    const postits = await res.json();
    
    if (postits.length > 0) {
        posSel.innerHTML = postits.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
        refreshArchiveView();
    } else {
        posSel.innerHTML = '<option value="">Aucun Post-it</option>';
        document.getElementById('archive-content').innerHTML = "";
    }
}

async function backupCurrentPostit() {
    const g = document.getElementById('sel-group'), 
          d = document.getElementById('sel-dev'), 
          p = document.getElementById('sel-pos');

    if(!p || !p.value) return alert("Sélectionnez un post-it dans l'onglet Chat d'abord.");

    const msgBlocks = document.querySelectorAll('#chat-history .msg-row');
    const messages = Array.from(msgBlocks).map(block => {
        const isMe = block.classList.contains('me');
        const authorTag = block.querySelector('.msg-author-tag');
        const contentSpan = block.querySelector('.msg-bubble span');
        return {
            author: authorTag ? authorTag.innerText : (isMe ? "Moi" : "Inconnu"),
            text: contentSpan ? contentSpan.innerText : ""
        };
    }).filter(m => m.text !== "");

    if(messages.length === 0) return alert("Rien à sauvegarder.");

    const grpName = currentGroupConfig && currentGroupConfig.name ? currentGroupConfig.name : (g && g.selectedIndex !== -1 ? g.options[g.selectedIndex].text : '');
    const devName = d && d.selectedIndex !== -1 ? d.options[d.selectedIndex].text : '';
    const posName = p && p.selectedIndex !== -1 ? p.options[p.selectedIndex].text : '';

    const payload = {
        groupName: grpName,
        deviceName: devName,
        postitName: posName,
        content: messages,
        adminId: currentUser ? currentUser._id : ''
    };

    const res = await fetchWithToken('/api/archives/backup', {
        method: 'POST',
        body: JSON.stringify(payload)
    });

    if(res.ok) alert("✅ Archive réussie !");
}

async function refreshArchiveView() {
    const gSel = document.getElementById('arch-group');
    const dSel = document.getElementById('arch-dev');
    const pSel = document.getElementById('arch-pos');

    const g = gSel.value;
    const d = dSel.options[dSel.selectedIndex]?.text;
    const p = pSel.value;

    if(!p || p.includes("Aucun")) return;

    const res = await fetchWithToken(`/api/archives?group=${encodeURIComponent(g)}&device=${encodeURIComponent(d)}&postit=${encodeURIComponent(p)}`);
    const archives = await res.json();
    const container = document.getElementById('archive-content');

    if(archives.length === 0) {
        container.innerHTML = '<p class="text-center opacity-30 mt-10 italic text-[10px] uppercase">Aucun historique.</p>';
        return;
    }

    container.innerHTML = archives.map(arch => `
        <div class="mb-4 p-3 border-l-4 border-black bg-white shadow-[2px_2px_0px_rgba(0,0,0,0.1)] mx-2">
            <div class="font-black text-[9px] uppercase opacity-40 mb-2">📦 ${new Date(arch.archivedAt).toLocaleString()}</div>
            ${arch.content.map(m => `
                <div class="text-[11px] mb-1"><b class="uppercase">${m.author}</b>: ${m.text}</div>
            `).join('')}
        </div>
    `).join('');
}
