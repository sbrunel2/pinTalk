let socket;
let allMsgs = [];
let currentUser = JSON.parse(localStorage.getItem('user'));

if (currentUser) {
    document.getElementById('auth-screen').classList.add('hidden');
    document.addEventListener('DOMContentLoaded', () => setTimeout(initApp, 200));
}

function initApp() {
    socket = io();
    socket.on('new-message', m => { allMsgs.unshift(m); refreshView(); });
    socket.on('history-data', h => { allMsgs = h; refreshView(); });
    loadGroups();
}

// --- NOUVELLES FONCTIONS DE CRÉATION VIA BOUTON 3D ---
// Variable globale pour suivre le dernier ID créé pour l'animation
let lastCreatedId = null;

async function uiCreateGroup(e) {
    e.stopPropagation();
    const name = prompt("Nom du nouveau groupe :");
    if(!name) return;
    const res = await fetch('/api/groups', { 
        method: 'POST', 
        headers: {'Content-Type':'application/json'}, 
        body: JSON.stringify({ name })
    });
    if(res.ok) {
        const data = await res.json();
        lastCreatedId = data._id; // On stocke l'ID du nouveau groupe
        document.getElementById('check-g').checked = true;
        await loadGroups();
        setTimeout(() => { lastCreatedId = null; }, 2000); // Reset après l'anim
    }
}

async function uiCreateDevice(e) {
    e.stopPropagation();
    const gid = document.getElementById('sel-group').value;
    if(!gid) return alert("Sélectionnez d'abord un groupe");
    const name = prompt("Nom du nouveau display :");
    if(!name) return;
    const res = await fetch('/api/devices', { 
        method: 'POST', 
        headers: {'Content-Type':'application/json'}, 
        body: JSON.stringify({ groupId: gid, name, mac: "00" })
    });
    if(res.ok) {
        const data = await res.json();
        lastCreatedId = data._id; // On stocke l'ID du nouveau device
        document.getElementById('check-d').checked = true;
        await loadGroupData(gid);
        setTimeout(() => { lastCreatedId = null; }, 2000);
    }
}

async function uiCreatePostit(e) {
    e.stopPropagation();
    const did = document.getElementById('sel-dev').value;
    if(!did || did === "") return alert("Sélectionnez d'abord un display");
    const name = prompt("Nom du nouveau post-it :");
    if(!name) return;
    const res = await fetch('/api/postits', { 
        method: 'POST', 
        headers: {'Content-Type':'application/json'}, 
        body: JSON.stringify({ deviceId: did, name })
    });
    if(res.ok) {
        const data = await res.json();
        lastCreatedId = data._id; // On stocke l'ID du nouveau post-it
        document.getElementById('check-p').checked = true;
        await loadPostits(did);
        setTimeout(() => { lastCreatedId = null; }, 2000);
    }
}

function renderSettingList(elementId, items, currentId, deleteFnName) {
    const container = document.getElementById(elementId);
    if (!container) return;
    
    let type = '';
    if (deleteFnName.includes('Group')) type = 'group';
    else if (deleteFnName.includes('Device')) type = 'device';
    else if (deleteFnName.includes('Postit')) type = 'postit';

    container.innerHTML = (items || []).map(item => {
        const isSelected = item._id === currentId;
        // L'effet de flash ne s'applique QUE si l'ID correspond au dernier créé
        const isNew = item._id === lastCreatedId;
        const flashClass = isNew ? 'new-item-flash' : '';
        
        return `
        <div class="flex items-center p-3 mb-1 ${isSelected ? 'bg-black/5 font-black' : 'opacity-50'} ${flashClass}">
            <span class="text-[10px] uppercase tracking-wider mr-3 flex-grow">${isSelected ? '→ ' : ''}${item.name}</span>
            <div class="flex items-center gap-1">
                <button onclick="editName('${type}', '${item._id}', '${item.name}')" class="btn-edit">🖍️</button>
                <button onclick="${deleteFnName}('${item._id}')" class="text-red-500 font-bold px-2">✕</button>
            </div>
        </div>`;
    }).join('');
}

async function syncSelection(type, id) {
    const gid = document.getElementById('sel-group').value;
    if (!gid) return;
    if (type === 'group') { 
        await loadGroupData(id); 
        await loadMembers(id); 
    }
    else if (type === 'dev') { 
        await loadPostits(id); 
    }
    socket.emit('get-history', { groupId: gid });
    updateBadge();
    refreshParamsLists(); 
}

async function refreshParamsLists() {
    const gRes = await fetch('/api/groups');
    const groups = await gRes.json();
    const currentGid = document.getElementById('sel-group').value;
    renderSettingList('list-groups-del', groups, currentGid, 'deleteGroup');

    const dRes = await fetch(`/api/devices/${currentGid}`);
    const devs = await dRes.json();
    const currentDid = document.getElementById('sel-dev').value;
    renderSettingList('list-devs-del', devs, currentDid, 'deleteDevice');

    if (currentDid && currentDid !== "") {
        const pRes = await fetch(`/api/postits/${currentDid}`);
        const ps = await pRes.json();
        renderSettingList('list-postits-del', ps, document.getElementById('sel-pos').value, 'deletePostit');
    }
}

async function loadGroups() {
    const res = await fetch('/api/groups');
    const groups = await res.json();
    const sel = document.getElementById('sel-group');
    if (groups.length > 0) {
        sel.innerHTML = groups.map(g => `<option value="${g._id}">${g.name}</option>`).join('');
        syncSelection('group', sel.value);
    }
}

async function loadGroupData(gid) {
    const res = await fetch(`/api/devices/${gid}`);
    const devs = await res.json();
    const sel = document.getElementById('sel-dev');

    if (devs.length > 0) {
        sel.innerHTML = devs.map(d => `<option value="${d._id}">${d.name}</option>`).join('');
        loadPostits(devs[0]._id);
    } else {
        // AUTO-CRÉATION DEVICE AVEC NOM "defaut"
        const newDev = await fetch('/api/devices', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ groupId: gid, name: "defaut", mac: "00" })
        });
        if(newDev.ok) loadGroupData(gid); 
    }
}

async function loadPostits(did) {
    if (!did || did === "") return;
    const sel = document.getElementById('sel-pos');
    const res = await fetch(`/api/postits/${did}`);
    const ps = await res.json();

    if (ps.length > 0) {
        sel.innerHTML = ps.map(p => `<option value="${p._id}">${p.name}</option>`).join('');
        refreshView();
        refreshParamsLists();
    } else {
        // AUTO-CRÉATION POSTIT AVEC NOM "defaut"
        const newPos = await fetch('/api/postits', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ deviceId: did, name: "defaut" })
        });
        if(newPos.ok) loadPostits(did);
    }
}

function refreshView() {
    const pid = document.getElementById('sel-pos').value;
    const chat = document.getElementById('chat-history');
    const eink = document.getElementById('eink-sim');
    const filtered = allMsgs.filter(m => m.postitId === pid);
    
    eink.innerHTML = filtered.map(m => `> ${m.content}`).join('<br>');
    chat.innerHTML = [...filtered].reverse().map(m => {
        const isMe = m.senderName === currentUser.name;
        return `
        <div class="msg-row ${isMe ? 'me' : 'others'}">
            <div class="msg-bubble">
                <span class="msg-author-tag">${isMe ? 'Moi' : m.senderName}</span>
                <span>${m.content}</span>
            </div>
        </div>`;
    }).join('');
    chat.scrollTop = chat.scrollHeight;
    updateBadge();
}

function send() {
    const input = document.getElementById('msg-input'), 
          gid = document.getElementById('sel-group').value, 
          did = document.getElementById('sel-dev').value, 
          pid = document.getElementById('sel-pos').value;
    if (!input.value || !gid) return;
    socket.emit('send-message', { groupId: gid, deviceId: did, postitId: pid, content: input.value, senderName: currentUser.name });
    input.value = '';
}

async function deleteGroup(id) { if(confirm("Supprimer?")) { await fetch(`/api/groups/${id}`, { method: 'DELETE' }); loadGroups(); } }
async function deleteDevice(id) { if(confirm("Supprimer?")) { await fetch(`/api/devices/${id}`, { method: 'DELETE' }); loadGroupData(document.getElementById('sel-group').value); } }
async function deletePostit(id) { if(confirm("Supprimer?")) { await fetch(`/api/postits/${id}`, { method: 'DELETE' }); loadPostits(document.getElementById('sel-dev').value); } }

async function loadMembers(gid) {
    const res = await fetch(`/api/groups/${gid}/members`);
    const ms = await res.json();
    document.getElementById('list-members').innerHTML = ms.map(m => `<div class="flex justify-between py-2 border-b border-black/5 text-[11px]"><span>${m.email}</span><span class="opacity-40 font-bold uppercase">${m.role}</span></div>`).join('');
}

function updateBadge() {
    const g = document.getElementById('sel-group'), d = document.getElementById('sel-dev'), p = document.getElementById('sel-pos');
    document.getElementById('st-grp').innerText = g.options[g.selectedIndex]?.text || '-';
    document.getElementById('st-dev').innerText = d.options[d.selectedIndex]?.text || '-';
    document.getElementById('st-pos').innerText = p.options[p.selectedIndex]?.text || '-';
}

function logout() { localStorage.removeItem('user'); location.reload(); }

// NOUVELLE FONCTION : ÉDITION DU NOM
async function editName(type, id, oldName) {
    const newName = prompt(`Modifier le nom de "${oldName}" par :`, oldName);
    if (!newName || newName === oldName) return;

    let url = '';
    if (type === 'group') url = `/api/groups/${id}`;
    else if (type === 'device') url = `/api/devices/${id}`;
    else if (type === 'postit') url = `/api/postits/${id}`;

    try {
        const res = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName })
        });

        if (res.ok) {
            // Rechargement selon le type
            if (type === 'group') loadGroups();
            else if (type === 'device') loadGroupData(document.getElementById('sel-group').value);
            else if (type === 'postit') loadPostits(document.getElementById('sel-dev').value);
        } else {
            alert("Erreur lors de la modification");
        }
    } catch (err) {
        console.error("Erreur API:", err);
    }
}