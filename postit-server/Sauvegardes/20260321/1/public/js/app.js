let socket;
let allMsgs = [];
let currentUser = JSON.parse(localStorage.getItem('user'));

window.addEventListener('scroll', () => { if (window.scrollY !== 0) window.scrollTo(0, 0); });

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

function renderSettingList(elementId, items, currentId, deleteFnName) {
    const container = document.getElementById(elementId);
    if (!container) return;
    container.innerHTML = (items || []).map(item => {
        const isActive = item._id === currentId;
        return `
            <div class="flex items-center p-3 mb-1 ${isActive ? 'bg-black/5 font-black' : 'opacity-50'}">
                <span class="text-[10px] uppercase tracking-wider mr-3">${isActive ? '→ ' : ''}${item.name}</span>
                <button onclick="${deleteFnName}('${item._id}')" class="text-red-500 font-bold px-2">✕</button>
            </div>`;
    }).join('');
}

async function syncSelection(type, id) {
    const gid = document.getElementById('sel-group').value;
    if (!gid) return;
    if (type === 'group') { await loadGroupData(id); await loadMembers(id); }
    else if (type === 'dev') { await loadPostits(id); }
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

    if (currentDid && currentDid !== "-") {
        const pRes = await fetch(`/api/postits/${currentDid}`);
        const ps = await pRes.json();
        renderSettingList('list-postits-del', ps, document.getElementById('sel-pos').value, 'deletePostit');
    } else {
        document.getElementById('list-postits-del').innerHTML = "";
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
    if(!gid) return;
    const res = await fetch(`/api/devices/${gid}`);
    const devs = await res.json();
    const sel = document.getElementById('sel-dev');
    if (devs && devs.length > 0) {
        sel.innerHTML = devs.map(d => `<option value="${d._id}">${d.name}</option>`).join('');
        loadPostits(devs[0]._id);
    } else {
        sel.innerHTML = '<option value="">-</option>';
        document.getElementById('sel-pos').innerHTML = '<option value="">-</option>';
        refreshParamsLists();
    }
}

async function loadPostits(did) {
    const sel = document.getElementById('sel-pos');
    if(!did || did === "") { sel.innerHTML = '<option value="">-</option>'; return refreshView(); }
    const res = await fetch(`/api/postits/${did}`);
    const ps = await res.json();
    if (ps && ps.length > 0) {
        sel.innerHTML = ps.map(p => `<option value="${p._id}">${p.name}</option>`).join('');
    } else {
        sel.innerHTML = '<option value="">-</option>';
    }
    refreshView();
    refreshParamsLists();
}

// --- CREATIONS ---
async function createGroup() {
    const name = document.getElementById('new-group-name').value;
    if (!name) return;
    await fetch('/api/groups', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name })});
    document.getElementById('new-group-name').value = '';
    loadGroups();
}

async function addDevice() {
    const name = document.getElementById('new-dev-name').value;
    const gid = document.getElementById('sel-group').value;
    if (!name || !gid) return;
    await fetch('/api/devices', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ groupId: gid, name, mac: "00" })});
    document.getElementById('new-dev-name').value = '';
    loadGroupData(gid);
}

async function addPostit() {
    const name = document.getElementById('new-postit-name').value;
    const did = document.getElementById('sel-dev').value;
    if (!name || !did) return;
    await fetch('/api/postits', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ deviceId: did, name })});
    document.getElementById('new-postit-name').value = '';
    loadPostits(did);
}

// --- SUPPRESSIONS (Correction refresh) ---
async function deleteGroup(id) { 
    if(confirm("Supprimer ce groupe ?")) { 
        await fetch(`/api/groups/${id}`, { method: 'DELETE' }); 
        loadGroups(); 
    } 
}
async function deleteDevice(id) { 
    if(confirm("Supprimer ce display ?")) { 
        await fetch(`/api/devices/${id}`, { method: 'DELETE' }); 
        loadGroupData(document.getElementById('sel-group').value); 
    } 
}
async function deletePostit(id) { 
    if(confirm("Supprimer ce post-it ?")) { 
        await fetch(`/api/postits/${id}`, { method: 'DELETE' }); 
        loadPostits(document.getElementById('sel-dev').value); 
    } 
}

// --- CHAT & UI ---
function send() {
    const input = document.getElementById('msg-input');
    const gid = document.getElementById('sel-group').value;
    const did = document.getElementById('sel-dev').value;
    const pid = document.getElementById('sel-pos').value;
    if (!input.value || !gid) return;
    socket.emit('send-message', { groupId: gid, deviceId: did, postitId: pid, content: input.value, senderName: currentUser.name });
    input.value = '';
}

function refreshView() {
    const pid = document.getElementById('sel-pos').value;
    const filtered = allMsgs.filter(m => m.postitId === pid);
    document.getElementById('eink-sim').innerHTML = filtered.map(m => `> ${m.content}`).join('<br>');
    document.getElementById('chat-history').innerHTML = allMsgs.map(m => `
        <div class="msg-bubble">
            <div class="text-[8px] font-black opacity-30 uppercase mb-1">${m.senderName}</div>
            <div>${m.content}</div>
        </div>`).join('');
}

async function loadMembers(gid) {
    const res = await fetch(`/api/groups/${gid}/members`);
    const ms = await res.json();
    document.getElementById('list-members').innerHTML = ms.map(m => `
        <div class="flex justify-between py-2 border-b border-black/5 text-[11px]">
            <span>${m.email}</span>
            <span class="opacity-40 font-bold uppercase">${m.role}</span>
        </div>`).join('');
}

function updateBadge() {
    const g = document.getElementById('sel-group'), d = document.getElementById('sel-dev'), p = document.getElementById('sel-pos');
    document.getElementById('st-grp').innerText = g.options[g.selectedIndex]?.text || '-';
    document.getElementById('st-dev').innerText = d.options[d.selectedIndex]?.text || '-';
    document.getElementById('st-pos').innerText = p.options[p.selectedIndex]?.text || '-';
}

function logout() { localStorage.removeItem('user'); location.reload(); }