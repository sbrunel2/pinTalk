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

// --- UTILITAIRES ---
function truncate(str, limit = 30) {
    if (!str) return "";
    return str.length > limit ? str.substring(0, limit) + "..." : str;
}

// --- NOUVELLES FONCTIONS DE CRÉATION VIA BOUTON 3D ---
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
        lastCreatedId = data._id;
        document.getElementById('check-g').checked = true;
        await loadGroups();
        setTimeout(() => { lastCreatedId = null; }, 2000);
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
        lastCreatedId = data._id;
        document.getElementById('check-d').checked = true;
        await loadGroupData(gid);
        setTimeout(() => { lastCreatedId = null; }, 2000);
    }
}

function closeOrderModal() {
    const modal = document.getElementById('order-modal');
    if(modal) modal.classList.add('hidden');
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
        const isNew = item._id === lastCreatedId;
        const flashClass = isNew ? 'new-item-flash' : '';
        
        return `
        <div class="flex items-center p-3 mb-1 ${isSelected ? 'bg-black/5 font-black' : 'opacity-50'} ${flashClass}">
            <span class="text-[10px] uppercase tracking-wider mr-3 flex-grow">${isSelected ? '→ ' : ''}${truncate(item.name, 30)}</span>
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
        // Reset du rayon sélectionné quand on change de groupe pour éviter les conflits
        document.getElementById('sel-dev').value = ""; 
        await loadGroupData(id); 
        await loadMembers(id); 
    }
    else if (type === 'dev') { 
        // Si on change juste de rayon, on recharge uniquement les clients (post-its)
        await loadGroupData(gid); 
    }

    socket.emit('get-history', { groupId: gid });
    updateBadge();
    refreshParamsLists(); 
}

async function refreshParamsLists() {
    const currentGid = document.getElementById('sel-group').value;
    if(!currentGid) return;

    const gRes = await fetch('/api/groups');
    const groups = await gRes.json();
    renderSettingList('list-groups-del', groups, currentGid, 'deleteGroup');

    const dRes = await fetch(`/api/devices?groupId=${currentGid}`);
    const devs = await dRes.json();
    const currentDid = document.getElementById('sel-dev').value;
    renderSettingList('list-devs-del', devs, currentDid, 'deleteDevice');

    if (currentDid) {
        const pRes = await fetch(`/api/postits?deviceId=${currentDid}`);
        const ps = await pRes.json();
        renderSettingList('list-postits-del', ps, document.getElementById('sel-pos').value, 'deletePostit');
    }
}

function resetDateFilter() {
    const dateInput = document.getElementById('filter-date');
    if (dateInput) {
        dateInput.value = ""; // Efface la date
        // On relance le chargement des données pour afficher tous les clients sans filtre
        const currentGroup = document.getElementById('sel-group').value;
        if (currentGroup) {
            loadGroupData(currentGroup);
        }
    }
}

async function loadGroups() {
    const res = await fetch('/api/groups');
    const groups = await res.json();
    const sel = document.getElementById('sel-group');
    if (groups.length > 0) {
        sel.innerHTML = groups.map(g => `<option value="${g._id}">${truncate(g.name, 30)}</option>`).join('');
        syncSelection('group', sel.value);
    }
}

// Met à jour l'input date quand on sélectionne un post-it déjà créé
async function updateFilterDateFromPostit() {
    const pid = document.getElementById('sel-pos').value;
    if (!pid) return;

    try {
        const res = await fetch(`/api/postits/details/${pid}`);
        const p = await res.json();
        if (p && p.pickupDate) {
            // On extrait juste la partie YYYY-MM-DD pour l'input date
            const dateOnly = p.pickupDate.split('T')[0];
            document.getElementById('filter-date').value = dateOnly;
        }
    } catch (e) {
        console.error("Erreur synchro date", e);
    }
}

async function loadGroupData(groupId) {
    if(!groupId) return;
    
    const selDev = document.getElementById('sel-dev');
    const selPos = document.getElementById('sel-pos');
    const filterDate = document.getElementById('filter-date').value;

    // 1. Charger les Rayons
    const resDev = await fetch(`/api/devices?groupId=${groupId}`);
    const devs = await resDev.json();
    
    const previousDevId = selDev.value;
    if (devs.length === 0) {
        selDev.innerHTML = '<option value="">Aucun rayon</option>';
    } else {
        selDev.innerHTML = devs.map(d => `<option value="${d._id}">${truncate(d.name, 30)}</option>`).join('');
    }
    
    if (previousDevId && devs.find(d => d._id === previousDevId)) {
        selDev.value = previousDevId;
    } else if (devs.length > 0) {
        selDev.value = devs[0]._id;
    }

    // 2. Charger les Clients
    if (selDev.value) {
        let url = `/api/postits?deviceId=${selDev.value}`;
        if(filterDate) url += `&filterDate=${filterDate}`;

        const resPos = await fetch(url);
        let postits = await resPos.json();

        postits.sort((a, b) => new Date(a.pickupDate) - new Date(b.pickupDate));

        if (postits.length === 0) {
            selPos.innerHTML = '<option value="">Aucun client</option>';
        } else {
            selPos.innerHTML = postits.map(p => {
                const d = new Date(p.pickupDate);
                const time = p.pickupDate ? d.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'}) : '??:??';
                return `<option value="${p._id}">[${time}] ${truncate(p.name, 20)}</option>`;
            }).join('');
            
            // CORRECTION ICI : On force explicitement la valeur du sélecteur sur le premier élément
            // pour être certain que refreshView() trouve un ID à charger.
            if (postits.length > 0) {
                selPos.value = postits[0]._id;
            }
        }
    }
    
    // On lance le rafraîchissement global
    await refreshView();
}


async function refreshView() {
    const pid = document.getElementById('sel-pos').value;
    const chat = document.getElementById('chat-history');
    const eink = document.getElementById('eink-sim');
    const pSel = document.getElementById('sel-pos');

    const filtered = allMsgs.filter(m => m.postitId === pid);
    eink.innerHTML = filtered.map(m => `> ${m.content}`).join('<br>');

    let headerHtml = "";
    
    // On accepte pid dès qu'il est rempli (même index 0)
    if (pid && pid !== "") { 
        try {
            const res = await fetch(`/api/postits/details/${pid}`);
            const p = await res.json();
            
            if (p) {
                // Préparation des formats de date
                const d = p.pickupDate ? new Date(p.pickupDate) : null;
                const dateShort = d ? d.toLocaleDateString('fr-FR', {day:'2-digit', month:'2-digit'}) : '--/--';
                const timeShort = d ? d.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'}) : '--:--';

                headerHtml = `
                <div class="mb-2 p-2 border-2 border-black bg-white shadow-[3px_3px_0px_#000] text-[10px]">
                    <div class="flex justify-between items-center border-b border-black/10 pb-1 mb-1">
                        <div class="flex items-center gap-2">
                            <span class="font-black uppercase italic">📦 ${p.orderNumber || 'SANS N°'}</span>
                            <div class="flex items-center gap-1 bg-red-50 px-1 border border-red-200">
                                <span class="font-black text-red-600 uppercase text-[8px]">RDV:</span>
                                <span class="font-bold text-[10px]">${dateShort} ${timeShort}</span>
                            </div>
                        </div>
                        <span class="bg-black text-white px-1 py-0.5 font-bold uppercase text-[7px] tracking-tighter">
                            ${p.status || 'ATTENTE'}
                        </span>
                    </div>
                    
                    <div class="flex justify-between items-center">
                        <div class="truncate mr-2">
                            <span class="font-black uppercase opacity-60 text-[8px]">Client:</span> 
                            <span class="font-bold">${p.name}</span>
                        </div>
                        <div class="flex-none italic">
                            <span class="font-black uppercase opacity-60 text-[8px]">Tel:</span> ${p.phone || '-'}
                        </div>
                    </div>
                </div>`;
            }
        } catch (e) { 
            console.error("Erreur refreshView:", e); 
        }
    }

    chat.innerHTML = headerHtml + [...filtered].reverse().map(m => {
        const isMe = (m.senderName === currentUser.name);
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
    if (!input.value || !gid || !pid) return;
    socket.emit('send-message', { groupId: gid, deviceId: did, postitId: pid, content: input.value, senderName: currentUser.name });
    input.value = '';
}

async function deleteGroup(id) { if(confirm("Supprimer?")) { await fetch(`/api/groups/${id}`, { method: 'DELETE' }); loadGroups(); } }
async function deleteDevice(id) { if(confirm("Supprimer?")) { await fetch(`/api/devices/${id}`, { method: 'DELETE' }); loadGroupData(document.getElementById('sel-group').value); } }
async function deletePostit(id) { if(confirm("Supprimer?")) { await fetch(`/api/postits/${id}`, { method: 'DELETE' }); loadGroupData(document.getElementById('sel-group').value); } }

async function loadMembers(gid) {
    const res = await fetch(`/api/groups/${gid}/members`);
    const ms = await res.json();
    document.getElementById('list-members').innerHTML = ms.map(m => `<div class="flex justify-between py-2 border-b border-black/5 text-[11px]"><span>${m.email}</span><span class="opacity-40 font-bold uppercase">${m.role}</span></div>`).join('');
}

function updateBadge() {
    const g = document.getElementById('sel-group'), d = document.getElementById('sel-dev'), p = document.getElementById('sel-pos');
    document.getElementById('st-grp').innerText = truncate(g.options[g.selectedIndex]?.text, 15) || '-';
    document.getElementById('st-dev').innerText = truncate(d.options[d.selectedIndex]?.text, 15) || '-';
    document.getElementById('st-pos').innerText = truncate(p.options[p.selectedIndex]?.text, 15) || '-';
}

function logout() { localStorage.removeItem('user'); location.reload(); }

let editingPostitId = null;

async function editName(type, id, oldName) {
    if (type === 'postit') {
        editingPostitId = id;
        const res = await fetch(`/api/postits/details/${id}`);
        const p = await res.json();
        document.getElementById('order-client').value = p.name || "";
        document.getElementById('order-num').value = p.orderNumber || "";
        document.getElementById('order-phone').value = p.phone || "";
        document.getElementById('order-date').value = p.pickupDate || "";
        document.querySelector('#order-modal h2').innerText = "Modifier la Commande";
        document.getElementById('order-modal').classList.remove('hidden');
    } else {
        const newName = prompt(`Modifier le nom de "${oldName}" par :`, oldName);
        if (!newName || newName === oldName) return;
        let url = type === 'group' ? `/api/groups/${id}` : `/api/devices/${id}`;
        await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName })
        });
        type === 'group' ? loadGroups() : loadGroupData(document.getElementById('sel-group').value);
    }
}

async function submitOrder() {
    const devId = document.getElementById('sel-dev').value;
    const client = document.getElementById('order-client').value;
    const phone = document.getElementById('order-phone').value;
    const date = document.getElementById('order-date').value;
    let orderNum = document.getElementById('order-num').value;

    if(!client) return alert("Le nom du client est obligatoire");

    const payload = {
        name: client,
        orderNumber: orderNum || ("CMD-" + Math.floor(1000 + Math.random() * 9000)),
        phone: phone,
        pickupDate: date
    };

    let url = editingPostitId ? `/api/postits/${editingPostitId}` : '/api/postits';
    let method = editingPostitId ? 'PUT' : 'POST';
    if (!editingPostitId) payload.deviceId = devId;

    const res = await fetch(url, {
        method: method,
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(payload)
    });

	if(res.ok) {
		closeOrderModal();
		const currentGid = document.getElementById('sel-group').value; // On récupère l'ID du groupe actuel
		await loadGroupData(currentGid); // On force le rechargement complet
		await refreshParamsLists(); // Crucial : cela rafraîchit la liste dans l'accordéon "3. Post-it"
	}
}

function uiCreatePostit(e) {
    if(e) e.stopPropagation();
    editingPostitId = null;
    document.getElementById('order-client').value = "";
    document.getElementById('order-num').value = "";
    document.getElementById('order-phone').value = "";
    document.getElementById('order-date').value = "";
    document.querySelector('#order-modal h2').innerText = "Nouvelle Commande";
    document.getElementById('order-modal').classList.remove('hidden');
}