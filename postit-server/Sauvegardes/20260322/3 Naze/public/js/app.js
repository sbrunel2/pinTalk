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
// Fonction de nettoyage des noms
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

// Fonction loadGroupData complète et corrigée
async function loadGroupData(groupId) {
    if(!groupId) return;
    
    const filterDate = document.getElementById('filter-date').value;
    const selDev = document.getElementById('sel-dev');
    const selPos = document.getElementById('sel-pos');

    const resDev = await fetch(`/api/devices?groupId=${groupId}`);
    const devs = await resDev.json();
    selDev.innerHTML = devs.map(d => `<option value="${d._id}">${d.name.toUpperCase()}</option>`).join('');

    if (selDev.value) {
        let url = `/api/postits?deviceId=${selDev.value}`;
        if(filterDate) url += `&filterDate=${filterDate}`;

        const resPos = await fetch(url);
        let postits = await resPos.json();

        if (!postits || postits.length === 0) {
            selPos.innerHTML = '<option value="">-- AUCUNE LISTE --</option>';
            allMsgs = []; 
            refreshView(); 
        } else {
            postits.sort((a, b) => new Date(a.pickupDate) - new Date(b.pickupDate));

            selPos.innerHTML = postits.map(p => {
                const d = new Date(p.pickupDate);
                const time = p.pickupDate ? d.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'}) : '??:??';
                const dateShort = p.pickupDate ? d.toLocaleDateString('fr-FR', {day: '2-digit', month:'2-digit'}) : '';
                return `<option value="${p._id}">[${dateShort} ${time}] ${p.name.toUpperCase()}</option>`;
            }).join('');

            // 1. Sélection automatique du premier
            const firstId = postits[0]._id;
            selPos.value = firstId;

            // 2. DEMANDE DE L'HISTORIQUE avec le bon ID (postitId)
            // On envoie le postitId car c'est ce que le serveur attend à la ligne 137
            socket.emit('get-history', { postitId: firstId });

            // 3. Mise à jour de la date calendrier
            updateFilterDateFromPostit();
        }
    }
}

function resetDateFilter() {
    document.getElementById('filter-date').value = "";
    loadGroupData(document.getElementById('sel-group').value);
}

async function updateFilterDateFromPostit() {
    const pid = document.getElementById('sel-pos').value;
    if (!pid || pid === "") return;
    try {
        const res = await fetch(`/api/postits/details/${pid}`);
        const p = await res.json();
        if (p && p.pickupDate) {
            document.getElementById('filter-date').value = p.pickupDate.split('T')[0];
        }
    } catch (e) { console.error(e); }
}

// 3. Modifie légèrement le début de refreshView pour le simulateur
async function refreshView() {
    const pid = document.getElementById('sel-pos').value;
    const eink = document.getElementById('eink-sim');
    const chat = document.getElementById('chat-history');

    if (!pid || pid.includes("--")) {
        eink.innerHTML = '<span style="opacity:0.2; font-style:italic; font-size:9px;">Sélectionnez un client...</span>';
        chat.innerHTML = "";
        return;
    }

    // Filtrage des messages
    const filtered = allMsgs.filter(m => m.postitId === pid);
    
    // 1. Mise à jour du simulateur E-ink (Ordre chronologique)
    if (filtered.length === 0) {
        eink.innerHTML = '<span style="opacity:0.2; font-style:italic; font-size:9px;">Aucun message...</span>';
    } else {
        eink.innerHTML = [...filtered].reverse().map(m => `> ${m.content}`).join('<br>');
    }

    // 2. Mise à jour du Chat (Style forcé en ligne pour éviter les bugs CSS)
    chat.innerHTML = filtered.map(m => {
        const isMe = currentUser && m.senderName === currentUser.name;
        
        // Configuration de la bulle selon l'expéditeur
        const align = isMe ? 'flex-end' : 'flex-start';
        const bg = isMe ? '#18181b' : '#ffffff'; // Noir pour moi, Blanc pour les autres
        const color = isMe ? '#ffffff' : '#18181b';
        const radius = isMe ? '12px 12px 0px 12px' : '12px 12px 12px 0px'; // Le look Brutaliste

        return `
            <div style="display: flex; flex-direction: column; align-items: ${align}; margin-bottom: 12px; width: 100%;">
                <div style="
                    background: ${bg}; 
                    color: ${color}; 
                    padding: 10px 14px; 
                    border: 2px solid #18181b; 
                    font-size: 12px; 
                    font-weight: bold; 
                    border-radius: ${radius};
                    max-width: 85%;
                    box-shadow: 3px 3px 0px rgba(0,0,0,0.1);
                ">
                    ${m.content}
                </div>
                <div style="font-size: 8px; font-weight: 900; text-transform: uppercase; margin-top: 4px; opacity: 0.5;">
                    ${m.senderName}
                </div>
            </div>
        `;
    }).join('');
    
    // Scroll automatique vers le bas
    chat.scrollTop = chat.scrollHeight;
}

function send() {
    const input = document.getElementById('msg-input'), 
          gid = document.getElementById('sel-group').value, 
          did = document.getElementById('sel-dev').value, 
          pid = document.getElementById('sel-pos').value;

    if (!input.value.trim() || !gid || !pid) return;

    socket.emit('send-message', { 
        groupId: gid, 
        deviceId: did, 
        postitId: pid, 
        content: input.value, 
        senderName: currentUser.name 
    });

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
        loadGroupData(document.getElementById('sel-group').value);
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