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
        // Reset du rayon sélectionné
        document.getElementById('sel-dev').value = ""; 
        await loadGroupData(id); 
        await loadMembers(id); 
        // AJOUT : On aligne la date sur le premier client du nouveau groupe
        await updateFilterDateFromPostit();
    }
    else if (type === 'dev') { 
        await loadGroupData(gid); 
        // AJOUT : On aligne la date sur le premier client du nouveau rayon
        await updateFilterDateFromPostit();
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

async function resetDateFilter() {
    const dateInput = document.getElementById('filter-date');
    if (dateInput) {
        dateInput.value = ""; // Efface le filtre date
        const currentGroup = document.getElementById('sel-group').value;
        if (currentGroup) {
            // 1. Recharge la liste des clients sans filtre
            await loadGroupData(currentGroup);
            // 2. Met à jour l'input date avec la date du premier client de la nouvelle liste
            await updateFilterDateFromPostit();
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
    const dateInput = document.getElementById('filter-date');
    if (!dateInput) return;

    // Si pas de client sélectionné (liste vide), on vide la date et on arrête
    if (!pid || pid === "") {
        dateInput.value = "";
        return;
    }

    try {
        const res = await fetch(`/api/postits/details/${pid}`);
        // Si le serveur répond 404 ou erreur
        if (!res.ok) {
            dateInput.value = "";
            return;
        }
        
        const p = await res.json();
        if (p && p.pickupDate) {
            const dateOnly = p.pickupDate.split('T')[0];
            dateInput.value = dateOnly;
        } else {
            dateInput.value = ""; // Vide si le client n'a pas de date de retrait
        }
    } catch (e) {
        console.error("Erreur synchro date", e);
        dateInput.value = "";
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
// 2. Charger les Clients
	if (selDev.value) {
		let url = `/api/postits?deviceId=${selDev.value}`;
		if(filterDate) url += `&filterDate=${filterDate}`;

		const resPos = await fetch(url);
		let postits = await resPos.json();

		// Tri par date
		postits.sort((a, b) => new Date(a.pickupDate) - new Date(b.pickupDate));

		if (postits.length === 0) {
			selPos.innerHTML = '<option value="">Aucun client</option>';
			selPos.value = ""; // ON FORCE LE VIDE ICI
		} else {
			selPos.innerHTML = postits.map(p => {
				const d = new Date(p.pickupDate);
				const time = p.pickupDate ? d.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'}) : '??:??';
				return `<option value="${p._id}">[${time}] ${truncate(p.name, 20)}</option>`;
			}).join('');
			
			// ON FORCE LE PREMIER CLIENT ICI UNIQUEMENT
			selPos.value = postits[0]._id;
		}
	}
    
    // On lance le rafraîchissement global
    await refreshView();
}

async function refreshView() {
    const pSel = document.getElementById('sel-pos');
    const pid = pSel ? pSel.value : null;
    const chat = document.getElementById('chat-history');
    const einkSmall = document.getElementById('eink-sim');
    const einkFull = document.getElementById('prep-content');
    const prepHeader = document.getElementById('prep-header');

    const filtered = allMsgs.filter(m => m.postitId === pid);
    const displayHtml = filtered.map(m => `> ${m.content}`).join('<br>');

    if (einkSmall) einkSmall.innerHTML = displayHtml;
    if (einkFull) einkFull.innerHTML = displayHtml;

    let headerHtml = "";
    let prepHeaderHtml = "";
    
    if (pid && pid !== "") {
        try {
            const res = await fetch(`/api/postits/details/${pid}`);
            const p = await res.json();
            if (p) {
                // Formater la date en jj/mm/yyyy hh:mm
                let formattedDate = "--/--/---- --:--";
                if (p.pickupDate) {
                    const d = new Date(p.pickupDate);
                    if (!isNaN(d)) {
                        const day = String(d.getDate()).padStart(2, '0');
                        const month = String(d.getMonth() + 1).padStart(2, '0');
                        const year = d.getFullYear();
                        const hours = String(d.getHours()).padStart(2, '0');
                        const mins = String(d.getMinutes()).padStart(2, '0');
                        formattedDate = `${day}/${month}/${year} ${hours}:${mins}`;
                    } else {
                        formattedDate = p.pickupDate; // Repli si c'est déjà une string
                    }
                }

                // --- DESIGN POUR LE CHAT (Standard) ---
                headerHtml = `
                <div class="p-3 border-4 border-black bg-white shadow-[4px_4px_0px_#000] mb-4">
                    <div class="flex justify-between items-start border-b-2 border-black pb-2 mb-2">
                        <div>
                            <div class="text-[10px] font-black uppercase opacity-40">Commande</div>
                            <div class="text-xl font-black italic">#${p.orderNumber || '---'}</div>
                        </div>
                        <span class="bg-black text-white px-2 py-1 font-bold uppercase text-[10px]">${p.status || 'En attente'}</span>
                    </div>
                    <div class="flex justify-between items-end">
                        <div>
                            <div class="text-[10px] font-black uppercase opacity-40">Client</div>
                            <div class="text-base font-bold">${p.name}</div>
                        </div>
                        <div class="text-right text-[11px] font-black">${formattedDate}</div>
                    </div>
                </div>`;

                // --- DESIGN POUR LA PAGE PREPARATION (Mode Rouge & Optimisé) ---
                prepHeaderHtml = `
                <div class="p-3 border-4 border-black bg-white shadow-[4px_4px_0px_#000]">
                    <div class="flex justify-between items-start border-b-2 border-black pb-2 mb-2">
                        <div>
                            <div class="flex items-center gap-2 mb-1">
                                <span class="text-[10px] font-black uppercase opacity-40">Commande</span>
                                <span class="text-[10px] font-bold uppercase px-2 bg-gray-100 border border-black/20">${p.status || 'En attente'}</span>
                            </div>
                            <div class="text-3xl font-black italic leading-none text-red-600">#${p.orderNumber || '---'}</div>
                        </div>
                        
                        <button onclick="goToPage(1)" class="bg-blue-50 text-blue-600 p-2 border-2 border-blue-200 shadow-[2px_2px_0px_#bfdbfe] active:shadow-none active:translate-x-[1px] active:translate-y-[1px]">
                           <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                    <div class="flex justify-between items-end">
                        <div>
                            <span class="text-[10px] font-black uppercase opacity-40 block">Client</span>
                            <span class="text-xl font-black leading-none">${p.name}</span>
                        </div>
                        <div class="text-right">
                            <div class="text-[12px] font-black">${formattedDate}</div>
                            <div class="text-[12px] font-bold text-gray-700 flex items-center justify-end gap-1">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M20 15.5c-1.2 0-2.4-.2-3.6-.6-.3-.1-.7 0-1 .2l-2.2 2.2c-2.8-1.4-5.1-3.8-6.6-6.6l2.2-2.2c.3-.3.4-.7.2-1-.3-1.1-.5-2.3-.5-3.5 0-.6-.4-1-1-1H4c-.6 0-1 .4-1 1 0 9.4 7.6 17 17 17 .6 0 1-.4 1-1v-3.5c0-.6-.4-1-1-1z"/></svg>
                                ${p.phone || '-- -- -- --'}
                            </div>
                        </div>
                    </div>
                </div>`;
            }
        } catch (e) { console.error(e); }
    }

    if (prepHeader) prepHeader.innerHTML = prepHeaderHtml;

    if (chat) {
        chat.innerHTML = (pid ? headerHtml : "") + [...filtered].reverse().map(m => {
            const isMe = (currentUser && m.senderName === currentUser.name);
            return `<div class="msg-row ${isMe ? 'me' : 'others'}"><div class="msg-bubble"><span>${m.content}</span></div></div>`;
        }).join('');
        chat.scrollTop = chat.scrollHeight;
    }

    if (typeof updateBadge === 'function') updateBadge();
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