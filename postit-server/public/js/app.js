let socket;
let allMsgs = [];
let currentUser = JSON.parse(localStorage.getItem('user'));

if (currentUser) {
    document.getElementById('auth-screen').classList.add('hidden');
    document.addEventListener('DOMContentLoaded', () => setTimeout(initApp, 200));
}

async function fetchAuth(url, options = {}) {
    const token = localStorage.getItem('token');
    const headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
    return fetch(url, { ...options, headers });
}

async function initApp() {
    socket = io();
    
    socket.on('new-message', m => { 
        allMsgs.unshift(m); 
        refreshView(true); 
    });
    
    socket.on('history-data', h => { 
        allMsgs = h; 
        refreshView(true); 
    });
    socket.on('message-updated', (data) => {
        const msg = allMsgs.find(m => m._id === data.messageId);
        if (msg) {
            msg.isNote = data.isNote;
            // On rafraîchit la vue sans forcer le scroll en bas (false)
            // pour ne pas perdre le fil de la lecture
            refreshView(false); 
        }
    });
	socket.on('line-checked-updated', (data) => {
		const msg = allMsgs.find(m => m._id === data.messageId);
		if (msg) {
			msg.checked = data.checked;
			// On ne force pas le refreshView ici si c'est nous qui venons de le faire, 
			// mais c'est utile pour les AUTRES utilisateurs connectés.
			refreshView(false);
		}
	});
	socket.on('postit-status-updated', (data) => {
		// Si on est sur le post-it concerné, on rafraîchit la vue
		const pSel = document.getElementById('sel-pos');
		if (pSel && pSel.value === data.postitId) {
			refreshView(false);
		}
	});
    await loadGroups();
    await refreshParamsLists();
}

// --- UTILITAIRES ---
function truncate(str, limit = 30) {
    if (!str) return "";
    return str.length > limit ? str.substring(0, limit) + "..." : str;
}

// --- NOUVELLES FONCTIONS DE CRÉATION VIA BOUTON 3D ---
let lastCreatedId = null;

async function uiCreateGroup(e) {
    if(e) e.stopPropagation();
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;

    openCustomPrompt("Nom du nouveau groupe", "", async (name) => {
        if (!name || name.trim() === "") return;

        try {
            // ÉTAPE 1 : Créer le Groupe
            const resG = await fetchAuth('/api/groups', {
                method: 'POST',
                body: JSON.stringify({ name: name.trim()})
            });
            const newGroup = await resG.json();

            if (newGroup && newGroup._id) {
                // ÉTAPE 2 : Créer le Rayon DEFAUT
                const resD = await fetchAuth('/api/devices', {
                    method: 'POST',
                    body: JSON.stringify({ 
                        name: "DEFAUT", 
                        groupId: newGroup._id
                    })
                });
                const newDev = await resD.json();

                // ÉTAPE 3 : Créer le Post-it DEFAUT
                await fetchAuth('/api/postits', {
                    method: 'POST',
                    body: JSON.stringify({ 
                        name: "DEFAUT", 
                        deviceId: newDev._id, 
                        pickupDate: new Date().toISOString()
                    })
                });

                // ÉTAPE 4 : Recharger l'interface sur le nouveau groupe
                await loadGroups(newGroup._id); 
                
                // Forcer la mise à jour visuelle après un court délai (laisse le DOM se remplir)
                setTimeout(() => {
                    updateVisualHeader();
                    if (typeof refreshParamsLists === 'function') refreshParamsLists();
                    // Ouvre l'accordéon des groupes pour montrer le succès
                    const checkG = document.getElementById('check-g');
                    if (checkG) checkG.checked = true;
                }, 500);
            }
        } catch (err) {
            console.error("Erreur Cascade Creation:", err);
            alert("Erreur lors de la création complète.");
        }
    });
}

async function uiCreateDevice(e) {
    if(e) e.stopPropagation();
    
    // On récupère les éléments DOM
    const selGroup = document.getElementById('sel-group');
    const user = JSON.parse(localStorage.getItem('user'));

    // Vérifications de base avant d'ouvrir le prompt
    if (!selGroup || !selGroup.value) return alert("Sélectionnez un groupe d'abord.");
    if (!user || !user.email) return alert("Session expirée.");

    const gid = selGroup.value;

    openCustomPrompt("Nom du nouveau rayon", "", async (name) => {
        if(!name || name.trim() === "") return;

        try {
            const res = await fetchAuth('/api/devices', { 
                method: 'POST', 
                body: JSON.stringify({ 
                    groupId: gid, 
                    name: name.trim(), 
                    mac: "00"
                })
            });

            if(!res.ok) {
                const errorText = await res.text();
                throw new Error(errorText || "Erreur serveur");
            }

            const data = await res.json();
            lastCreatedId = data._id; 

            // On rafraîchit les données sans tout bloquer
            loadGroupData(gid); 
            refreshParamsLists();

            // Message de succès discret ou ouverture de l'accordéon
            const checkD = document.getElementById('check-d');
            if (checkD) checkD.checked = true;

            setTimeout(() => { lastCreatedId = null; }, 2000);

        } catch (err) {
            console.error("DEBUG CRÉATION RAYON:", err);
            alert("Erreur : " + err.message);
        }
    });
}

function openCustomPrompt(title, defaultValue, onConfirm) {
    document.getElementById('prompt-title').innerText = title;
    const input = document.getElementById('prompt-input');
    input.value = defaultValue;
    document.getElementById('custom-prompt-modal').classList.remove('hidden');
    input.focus();
    
    // On lie le bouton valider à l'action
    document.getElementById('prompt-confirm-btn').onclick = () => {
        onConfirm(input.value);
        closeCustomPrompt();
    };
}

function closeCustomPrompt() {
    document.getElementById('custom-prompt-modal').classList.add('hidden');
}

function closeOrderModal() {
    const modal = document.getElementById('order-modal');
    if(modal) modal.classList.add('hidden');
}

function renderSettingList(elementId, items, currentId, deleteFnName) {
    const container = document.getElementById(elementId);
    if (!container) return;
    
    // --- CORRECTIF : GESTION DU VIDE ---
    // Si la liste est vide ou nulle, on affiche un message et on s'arrête
    if (!items || items.length === 0) {
        container.innerHTML = `
            <div class="p-4 text-center opacity-30 italic text-[10px] uppercase tracking-widest">
                Aucun élément
            </div>`;
        return;
    }

    // On récupère l'utilisateur pour savoir si on affiche le code
    const user = JSON.parse(localStorage.getItem('user'));
    
    let type = '';
    if (deleteFnName.includes('Group')) type = 'group';
    else if (deleteFnName.includes('Device')) type = 'device';
    else if (deleteFnName.includes('Postit')) type = 'postit';

    container.innerHTML = items.map(item => {
        const isSelected = item._id === currentId;
        const isNew = (typeof lastCreatedId !== 'undefined' && item._id === lastCreatedId);
        const flashClass = isNew ? 'new-item-flash' : '';
        
        // --- LOGIQUE D'AFFICHAGE INTELLIGENTE ---
        let displayName = item.name || item.orderNumber || "Sans nom";
        let prefix = isSelected ? '→ ' : '';
        
        // Si c'est un groupe et que je suis le proprio : on affiche le badge CODE
        if (type === 'group' && item.joinCode && user && item.ownerEmail === user.email) {
            displayName = `<span class="text-black font-black">${displayName}</span> <span class="ml-1 bg-black text-white px-1 text-[8px] rounded">CODE: ${item.joinCode}</span>`;
        }

        return `
        <div class="flex items-center p-3 mb-1 ${isSelected ? 'bg-black/5 font-black' : 'opacity-50'} ${flashClass}">
            <span class="text-[10px] uppercase tracking-wider mr-3 flex-grow">${prefix}${displayName}</span>
            <div class="flex items-center gap-1">
                <button onclick="event.stopPropagation(); editName('${type}', '${item._id}', '${(item.name || item.orderNumber || "").replace(/'/g, "\\'")}')" class="btn-edit">🖍️</button>
                <button 
                    onclick="event.stopPropagation(); if(this.innerText==='✕'){ this.innerText='OK?'; this.classList.add('text-orange-500'); setTimeout(()=>{ this.innerText='✕'; this.classList.remove('text-orange-500'); }, 2000); } else { ${deleteFnName}('${item._id}'); }" 
                    class="text-red-500 font-bold px-2 transition-all">✕</button>
            </div>
        </div>`;
    }).join('');
}

async function syncSelection(type, id) {
    const gid = document.getElementById('sel-group').value;

    if (type === 'group') {
        await loadGroupData(id || gid);
        if (typeof loadMembers === 'function') await loadMembers(id || gid);
    } else if (type === 'dev') {
        await loadGroupData(gid);
    }

    updateVisualHeader();
    if (socket && gid) socket.emit('get-history', { groupId: gid });
    if (typeof updateBadge === 'function') updateBadge();
    if (typeof refreshParamsLists === 'function') refreshParamsLists();
}

async function refreshParamsLists() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || !user.email) return;
    const emailParam = `email=${encodeURIComponent(user.email)}`;

    let selGroup = document.getElementById('sel-group');
    // On prend la valeur ACTUELLE du sélecteur
    let currentGid = (selGroup && selGroup.value) ? selGroup.value : null;

    // 1. On charge les GROUPES (nécessaire pour la liste des réglages)
	const gRes = await fetchAuth('/api/groups');
	const groups = await gRes.json();

    // Si on n'a aucune sélection mais qu'on a des groupes, on prend le premier
    if (!currentGid && groups.length > 0) {
        currentGid = groups[0]._id;
        if (selGroup) selGroup.value = currentGid;
    }

    // Affichage de la liste des groupes dans les paramètres
    renderSettingList('list-groups-del', groups, currentGid, 'deleteGroup');

    // --- SÉCURITÉ : SI PAS DE GROUPE, ON VIDE TOUT ET ON S'ARRÊTE ---
    if (!currentGid || currentGid === "") {
        const listDevs = document.getElementById('list-devs-del');
        const listPos = document.getElementById('list-postits-del');
        if (listDevs) listDevs.innerHTML = '<div class="p-3 text-gray-400 italic text-[10px]">Aucun rayon</div>';
        if (listPos) listPos.innerHTML = '<div class="p-3 text-gray-400 italic text-[10px]">Aucun client</div>';
        return; // On stoppe ici, pas besoin de fetch les rayons d'un groupe inexistant
    }

    // 3. Chargement des RAYONS (On arrive ici seulement si currentGid existe)
    try {
        const dRes = await fetchAuth(`/api/devices?groupId=${currentGid}`);
        const devs = await dRes.json();
        const selDev = document.getElementById('sel-dev');
        const currentDid = selDev ? selDev.value : null;
        renderSettingList('list-devs-del', devs, currentDid, 'deleteDevice');

        // 4. Chargement des POST-ITS
        const listPos = document.getElementById('list-postits-del');
        if (currentDid && currentDid !== "") {
            const pRes = await fetchAuth(`/api/postits?deviceId=${currentDid}`);
            const ps = await pRes.json();
            const selPos = document.getElementById('sel-pos');
            const currentPid = selPos ? selPos.value : null;
            renderSettingList('list-postits-del', ps, currentPid, 'deletePostit');
        } else {
            // Si pas de rayon sélectionné, on vide la liste des post-its
            if (listPos) listPos.innerHTML = '<div class="p-3 text-gray-400 italic text-[10px]">Aucun client</div>';
        }
    } catch (err) {
        console.error("Erreur refreshParamsLists:", err);
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

async function loadGroups(idToSelect = null) {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || !user.email) return;

    try {
		const res = await fetchAuth(`/api/groups`);
        const groups = await res.json();
        const sel = document.getElementById('sel-group');

        if (sel && groups.length > 0) {
            sel.innerHTML = groups.map(g => `<option value="${g._id}">${g.name}</option>`).join('');
            const targetId = idToSelect || sel.value || groups[0]._id;
            sel.value = targetId;

            // --- VÉRIFICATION / CRÉATION RAYON PAR DÉFAUT ---
            const resDev = await fetchAuth(`/api/devices?groupId=${targetId}`);
            let devs = await resDev.json();

            if (devs.length === 0) {
                console.log("🛠️ Création du rayon DEFAUT automatique...");
                const resNewDev = await fetchAuth('/api/devices', {
                    method: 'POST',
                    body: JSON.stringify({ name: "DEFAUT", groupId: targetId})
                });
                const newDev = await resNewDev.json();
                devs = [newDev];
            }

            // --- VÉRIFICATION / CRÉATION POST-IT PAR DÉFAUT ---
            const firstDevId = devs[0]._id;
            const resPos = await fetchAuth(`/api/postits?deviceId=${firstDevId}`);
            let postits = await resPos.json();

            if (postits.length === 0) {
                console.log("🛠️ Création du post-it DEFAUT automatique...");
                await fetchAuth('/api/postits', {
                    method: 'POST',
                    body: JSON.stringify({ 
                        name: "DEFAUT", 
                        deviceId: firstDevId, 
                        pickupDate: new Date().toISOString()
                    })
                });
            }

            // Chargement complet (rayons + post-its + header)
            await loadGroupData(targetId);
            
        } else if (sel) {
            sel.innerHTML = '<option value="">Aucun groupe</option>';
            sel.value = "";
            updateVisualHeader();
        }

        // Bloc LISTDIV (Paramètres) inchangé
        const listDiv = document.getElementById('list-groups-del');
        if (listDiv) {
            listDiv.innerHTML = groups.length > 0 ? groups.map(g => {
                const isSelected = (sel && sel.value === g._id);
                const prefix = isSelected ? '→ ' : '';
                return `<div class="flex justify-between items-center p-2 border-b border-black/10 text-[10px] font-black uppercase ${isSelected ? 'bg-black/5' : ''}">
                    <span>${prefix}${g.name}</span>
                    <button onclick="deleteGroup('${g._id}')" class="text-red-600 font-bold px-2">✕</button>
                </div>`;
            }).join('') : '<div class="p-3 text-gray-400 italic text-[10px]">Aucun groupe créé</div>';
        }
    } catch (err) { console.error("Erreur loadGroups:", err); }
}

async function loadGroupData(groupId) {
    const selDev = document.getElementById('sel-dev');
    const selPos = document.getElementById('sel-pos');

    if (!groupId || groupId === "null") {
        updateVisualHeader();
        return;
    }

    try {
        // 1. Charger les rayons
		const resDev = await fetchAuth(`/api/devices?groupId=${groupId}`);
        const devs = await resDev.json();

        if (devs && devs.length > 0) {
            const previousDevId = selDev.value;
            selDev.innerHTML = devs.map(d => `<option value="${d._id}">${truncate(d.name, 30)}</option>`).join('');
            if (previousDevId && devs.find(d => d._id === previousDevId)) {
                selDev.value = previousDevId;
            } else {
                selDev.value = devs[0]._id;
            }
        } else {
            selDev.innerHTML = '<option value="">AUCUN RAYON</option>';
            selPos.innerHTML = '<option value="">AUCUN CLIENT</option>';
            updateVisualHeader();
            return;
        }

        // 2. Charger les post-its du rayon sélectionné
        if (selDev.value) {
            let url = `/api/postits?deviceId=${selDev.value}`;
            const filterDateEl = document.getElementById('filter-date');
            if (filterDateEl && filterDateEl.value) url += `&filterDate=${filterDateEl.value}`;

            const resPos = await fetchAuth(url);
            let postits = await resPos.json();

            if (typeof showFinished !== 'undefined') {
                if (showFinished) {
                    postits = postits.filter(p => p.status === "En caisse" || p.status === "Terminé" || p.status === "Annulé");
                } else {
                    postits = postits.filter(p => p.status === "En attente" || p.status === "En préparation" || !p.status || p.status === "");
                }
            }

            postits.sort((a, b) => new Date(a.pickupDate) - new Date(b.pickupDate));

            // --- CRÉATION POST-IT PAR DÉFAUT si aucun ---
            if (!postits || postits.length === 0) {
                console.log("🛠️ Création post-it DEFAUT automatique pour rayon", selDev.value);
                await fetchAuth('/api/postits', {
                    method: 'POST',
                    body: JSON.stringify({ 
                        name: "DEFAUT", 
                        deviceId: selDev.value, 
                        pickupDate: new Date().toISOString()
                    })
                });
                // Recharge après création
				const resPost2 = await fetchAuth(`/api/postits?deviceId=${selDev.value}`);
                postits = await resPos2.json();
            }

            if (postits && postits.length > 0) {
                selPos.innerHTML = postits.map(p => {
                    const d = new Date(p.pickupDate);
                    const time = p.pickupDate ? d.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'}) : '??:??';
                    return `<option value="${p._id}">[${time}] ${truncate(p.name, 20)}</option>`;
                }).join('');
                selPos.value = postits[0]._id;
            } else {
                selPos.innerHTML = '<option value="">AUCUN CLIENT</option>';
                selPos.value = "";
            }
        }

        // 3. Mise à jour header et vue après remplissage des selects
        updateVisualHeader();
        if (typeof refreshView === 'function') refreshView();
        if (typeof socket !== 'undefined' && socket) socket.emit('get-history', { groupId });
        if (typeof updateBadge === 'function') updateBadge();

    } catch (err) {
        console.error("Erreur loadGroupData:", err);
    }
}

function updateVisualHeader() {
    const selG = document.getElementById('sel-group');
    const selD = document.getElementById('sel-dev');
    const selP = document.getElementById('sel-pos');
    
    // On cible les spans à l'intérieur du badge de statut par leur ordre
    const spans = document.querySelectorAll('#status-badge span');

    if (spans.length >= 3) {
        if (selG && selG.selectedIndex !== -1) {
            spans[0].innerText = selG.options[selG.selectedIndex].text.toUpperCase();
        }
        if (selD && selD.selectedIndex !== -1) {
            spans[1].innerText = selD.options[selD.selectedIndex].text.toUpperCase();
        }
        if (selP && selP.selectedIndex !== -1) {
            spans[2].innerText = selP.options[selP.selectedIndex].text.toUpperCase();
        }
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
        const res = await fetchAuth(`/api/postits/details/${pid}`);
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


async function changeStatusManually(pid) {
    // 1. On définit les options
    const states = ["En attente", "En préparation", "Terminé", "Annulé"];
    
    // 2. On crée dynamiquement un petit menu ou on utilise une astuce plus simple :
    // Pour rester efficace sans refaire tout un design UI, on utilise une liste de choix numérotée 
    // MAIS on ajoute la logique de commentaire pour l'annulation.
    
    const choice = prompt(
        "SÉLECTIONNER LE STATUT :\n1. En attente\n2. En préparation\n3. Terminé\n4. ANNULÉ (avec motif)"
    );

    if (choice >= 1 && choice <= 4) {
        let newStatus = states[choice - 1];
        let cancelReason = "";

        // Si choix "Annulé", on demande pourquoi
        if (newStatus === "Annulé") {
            cancelReason = prompt("Motif de l'annulation (optionnel) :");
            if (cancelReason === null) return; // L'utilisateur a cliqué sur annuler la saisie
        }

        // Envoi au serveur
        socket.emit('update-postit-status', { 
            postitId: pid, 
            status: newStatus,
            comment: cancelReason // On envoie le commentaire au serveur
        });
    }
}

// --- AJOUT : Fonction pour basculer l'icône (Style uniquement) ---
function toggleNote(btn, messageId) {
    // On change l'icône entre l'oeil et le sens interdit
    if (btn.innerText === '👁️') {
        btn.innerText = '🚫';
        // On peut aussi ajouter une opacité sur la bulle parente pour le style
        btn.closest('.msg-row').style.opacity = "0.3";
    } else {
        btn.innerText = '👁️';
        btn.closest('.msg-row').style.opacity = "1";
    }
    // Note : On ne fait pas d'émission socket ici comme demandé, juste du style.
}

function toggleNote(messageId) {
    socket.emit('toggle-message-note', { messageId });
}

function toggleLineCheck(messageId) {
    const btn = document.getElementById('btn-status-main');
    const currentStatus = btn ? btn.getAttribute('data-status') : "";

    // IMPORTANT : On autorise la modification si c'est "Terminé" 
    // pour pouvoir revenir en arrière. On ne bloque que le définitif.
    if (currentStatus === "En caisse" || currentStatus === "Annulé") {
        console.warn("Action bloquée : Commande " + currentStatus);
        return;
    }

    const msg = allMsgs.find(m => m._id === messageId);
    if (!msg) return;

    msg.checked = !msg.checked;
    socket.emit('toggle-check-line', { messageId });

    const pSel = document.getElementById('sel-pos');
    const pid = pSel ? pSel.value : null;
    if (!pid) return;

    // Recalcul du statut automatique
    const lines = allMsgs.filter(m => m.postitId === pid && !m.isNote);
    const checkedCount = lines.filter(m => m.checked).length;
    const totalLines = lines.length;

    let newStatus = "En attente";
    if (totalLines > 0) {
        if (checkedCount === totalLines) {
            newStatus = "Terminé";
        } else if (checkedCount > 0) {
            newStatus = "En préparation"; 
        }
    }

    socket.emit('update-postit-status', { postitId: pid, status: newStatus });
    refreshView(false);
}

function changeStatusManually(pid) {
    const states = ["En attente", "En préparation", "Terminé", "Annulé"];
    const choice = prompt(
        "MODIFIER LE STATUT :\n1. En attente\n2. En préparation\n3. Terminé\n4. Annulé"
    );

    if (choice >= 1 && choice <= 4) {
        const newStatus = states[choice - 1];
        // On envoie au serveur
        socket.emit('update-postit-status', { 
            postitId: pid, 
            status: newStatus 
        });
        // On force un rafraîchissement local immédiat pour le confort visuel
        refreshView(false);
    }
}

async function refreshView(forceScrollBottom = false) {
    const pSel = document.getElementById('sel-pos');
    const pid = pSel ? pSel.value : null;
    const chat = document.getElementById('chat-history');
    const einkSmall = document.getElementById('eink-sim');
    const einkFull = document.getElementById('prep-content');
    const prepHeader = document.getElementById('prep-header');

    if (!chat) return;

    const prevPos = chat.scrollTop;
    const wasAtBottom = (chat.scrollHeight - chat.scrollTop <= chat.clientHeight + 50);

    let headerHtml = "";
    let prepHeaderHtml = "";
    let currentStatus = ""; 

    if (pid && pid !== "") {
        try {
            const res = await fetchAuth(`/api/postits/details/${pid}`);
            const p = await res.json();
            if (p) {
                currentStatus = p.status;
				let statusBg = "bg-black"; 
				if (p.status === "En préparation") statusBg = "bg-orange-500";
				if (p.status === "En caisse") statusBg = "bg-blue-500"; // <--- AJOUTE CETTE LIGNE
				if (p.status === "Terminé") statusBg = "bg-green-600";
				if (p.status === "Annulé") statusBg = "bg-gray-500";
				
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
                    }
                }

                const cancelMsg = allMsgs.find(m => m.postitId === pid && m.isNote && m.content.includes("ANNULATION"));
                const cancelCommentHtml = (p.status === "Annulé" && cancelMsg) 
                    ? `<div class="mt-2 p-2 bg-red-50 border-l-4 border-red-500 text-[10px] font-bold text-red-700 italic">${cancelMsg.content}</div>` 
                    : "";

                const getStatusSelect = (fontSizeClass) => `
                    <button id="btn-status-main" data-status="${p.status}" onclick="event.stopPropagation(); showStatusMenu(this, '${p._id}')" 
                            class="${statusBg} text-white font-black uppercase ${fontSizeClass} border border-black cursor-pointer w-[95px] h-[20px] flex items-center justify-center leading-none relative z-30 active:scale-95">
                        ${p.status === 'En préparation' ? 'Prépa.' : (p.status === 'En attente' ? 'Attente' : p.status)}
                    </button>`;

                headerHtml = `
				<div class="p-3 border-4 border-black bg-white shadow-[4px_4px_0px_#000] mb-4">
					<div class="flex justify-between items-start border-b-2 border-black pb-1 mb-2">
						<div>
							<div class="text-[9px] font-black uppercase opacity-40 leading-none">Commande</div>
							<div class="text-xl font-black italic leading-tight">#${p.orderNumber || '---'}</div>
						</div>
						<div class="flex flex-col items-end">
							 ${getStatusSelect('text-[9px]')}
						</div>
					</div>
					<div class="flex justify-between items-end">
						<div>
							<div class="text-[9px] font-black uppercase opacity-40 leading-none">Client</div>
							<div class="text-sm font-bold leading-tight">${p.name}</div>
							<div class="text-[10px] font-black mt-1">
								${p.phone ? `📞 <a href="tel:${p.phone}" onclick="return confirm('Appeler le ${p.phone} ?')" class="underline text-blue-600">${p.phone}</a>` : ''}
							</div>
						</div>
						<div class="text-right text-[10px] font-black opacity-60">${formattedDate}</div>
					</div>
					${cancelCommentHtml}
				</div>`;

				prepHeaderHtml = `
				<div class="p-3 border-4 border-black bg-white shadow-[4px_4px_0px_#000]">
					<div class="flex justify-between items-start border-b-2 border-black pb-2 mb-2">
						<div>
							<div class="flex items-center gap-2 mb-1">
								<span class="text-[10px] font-black uppercase opacity-40">Statut</span>
								${getStatusSelect('text-[8px]')}
							</div>
							<div class="text-3xl font-black italic leading-none text-red-600">#${p.orderNumber || '---'}</div>
						</div>
						
						<button onclick="goToPage(1)" class="bg-blue-50 text-blue-600 p-3 border-2 border-blue-200 shadow-[2px_2px_0px_#bfdbfe] flex items-center justify-center active:shadow-none active:translate-x-[1px] active:translate-y-[1px]">
							<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
								<path d="M9 14l-4-4 4-4"/><path d="M5 10h11a4 4 0 1 1 0 8h-1"/>
							</svg>
						</button>
					</div>
					<div class="flex justify-between items-end">
						<div>
							<span class="text-[10px] font-black uppercase opacity-40 block">Client</span>
							<span class="text-xl font-black leading-none">${p.name}</span>
							<div class="text-sm font-black mt-1 text-blue-600">
								${p.phone ? `📞 <a href="tel:${p.phone}" onclick="return confirm('Lancer l'appel vers le ${p.phone} ?')" class="underline">${p.phone}</a>` : ''}
							</div>
						</div>
						<div class="text-right text-[12px] font-black">${formattedDate}</div>
					</div>
					${cancelCommentHtml}
				</div>`;
            }
        } catch (e) { console.error(e); }
    }

    // --- E-INK SIMULATION (Articles uniquement, on ignore les images ici) ---
    const forEink = allMsgs.filter(m => m.postitId === pid && !m.isNote && m.type !== 'image');
	const einkHtml = forEink.map(m => {
		// On ne verrouille PAS si c'est "Terminé", seulement si c'est payé ou annulé
		const isLocked = (currentStatus === "Annulé" || currentStatus === "En caisse");		
		const boxClass = m.checked ? "bg-green-500 border-black text-white" : "bg-white border-black text-transparent";
		const textStyle = m.checked ? "color: #a1a1aa; text-decoration: line-through;" : "color: #000;";
		
		// Si verrouillé, on met une opacité basse et on désactive le curseur
		const opacityClass = isLocked ? "opacity-50 cursor-not-allowed" : "cursor-pointer";
		
		return `
		<div class="flex items-center gap-3 mb-2 group ${opacityClass}" 
			 onclick="event.stopPropagation(); ${isLocked ? "console.log('Liste verrouillée')" : `toggleLineCheck('${m._id}')`}">
			<div class="w-5 h-5 border-2 flex-shrink-0 flex items-center justify-center transition-colors ${boxClass}">
				<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
			</div>
			<span class="text-[13px] font-bold leading-none" style="${textStyle}">${m.content}</span>
		</div>`;
	}).join('');

    if (einkSmall) einkSmall.innerHTML = einkHtml;
    if (einkFull) einkFull.innerHTML = einkHtml;
    if (prepHeader) prepHeader.innerHTML = prepHeaderHtml;

    if (chat) {
        const filtered = allMsgs.filter(m => m.postitId === pid);
        chat.innerHTML = (pid ? headerHtml : "") + [...filtered].reverse().map(m => {
            const isMe = (currentUser && m.senderName === currentUser.name);
            const noteClass = m.isNote ? "opacity-30 italic" : "";
            const bubbleBg = isMe ? "bg-[#18181b] text-white" : "bg-white text-black";
            const tagStyle = isMe ? "bg-white text-black" : "bg-black text-white";

            // --- GESTION DU CONTENU (IMAGE VS TEXTE) ---
            let contentHtml = `<span class="text-[13px] font-bold leading-tight flex-1">${m.content}</span>`;
			if (m.type === 'image') {
				contentHtml = `
				<div class="flex-1 py-1">
					<img src="${m.content}" 
						 class="max-w-[80px] aspect-square object-cover border-2 border-black shadow-[2px_2px_0px_#000] cursor-pointer active:scale-95 transition-transform" 
						 onclick="openFullImage('${m.content}')"
						 alt="Document">
				</div>`;
			}

            return `
            <div class="msg-row ${isMe ? 'me' : 'others'} ${noteClass} mb-2">
                <div class="msg-bubble relative p-1.5 border-2 border-black ${bubbleBg} shadow-[2px_2px_0px_#000]">
                    <div class="flex items-center gap-2">
                        <span class="text-[8px] font-black px-1.5 py-0.5 uppercase flex-shrink-0 ${tagStyle}">${isMe ? 'Moi' : m.senderName}</span>
                        ${contentHtml}
                        <button onclick="toggleNote('${m._id}')" class="ml-1 flex-shrink-0 text-[14px] cursor-pointer grayscale">${m.isNote ? '🚫' : '👁️'}</button>
                    </div>
                </div>
            </div>`;
        }).join('');

        if (forceScrollBottom || wasAtBottom) { chat.scrollTop = chat.scrollHeight; } 
        else { chat.scrollTop = prevPos; }
    }
}

function openFullImage(url) {
    const win = window.open("");
    win.document.write(`
        <html>
            <head>
                <title>Visualisation Document</title>
                <style>
                    body { margin: 0; background: #efeee9; display: flex; align-items: center; justify-content: center; height: 100vh; }
                    img { max-width: 100%; max-height: 100%; border: 4px solid black; box-shadow: 10px 10px 0px #000; }
                </style>
            </head>
            <body onclick="window.close()">
                <img src="${url}">
            </body>
        </html>
    `);
}

function toggleUploadMenu() {
    document.getElementById('upload-menu').classList.toggle('hidden');
}

function triggerUpload(type) {
    document.getElementById('up-' + type).click();
    toggleUploadMenu();
}

// Fonction utilitaire pour filtrer selon l'état du bouton 💾€
function filterPostitsByStatus(postits) {
    if (showFinished) {
        // Mode ARCHIVES : Uniquement les états terminaux
        return postits.filter(p => 
            p.status === "En caisse" || 
            p.status === "Terminé" || 
            p.status === "Annulé"
        );
    } else {
        // Mode ACTIF (par défaut) : Uniquement ce qui est à faire
        return postits.filter(p => 
            p.status === "En attente" || 
            p.status === "En préparation" || 
            !p.status // Gère aussi les nouveaux post-its sans statut
        );
    }
}

let showFinished = false; 

function toggleFilterFinished() {
    showFinished = !showFinished;
    
    // 1. Mise à jour visuelle du bouton
    const icon = document.getElementById('filter-icon');
    const btn = document.getElementById('btn-filter-finished');
    
    if (showFinished) {
        icon.style.opacity = "1";
        btn.style.background = "#fbbf24"; // Jaune : Mode Archives/Payé
    } else {
        icon.style.opacity = "0.3";
        btn.style.background = "white"; // Blanc : Mode Direct/En cours
    }
    
    // 2. CORRECTION : On vide le champ date pour éviter le filtrage trompeur
    const dateInput = document.getElementById('filter-date');
    if (dateInput) {
        dateInput.value = ""; 
    }
    
    // 3. Rechargement global pour appliquer le nouveau filtre de statut sans contrainte de date
    const gid = document.getElementById('sel-group').value;
    if (gid) {
        loadGroupData(gid);
    }
}

async function loadPostits(deviceId) {
    if (!deviceId) return;

    try {
        const res = await fetchAuth(`/api/postits/${deviceId}`);
        const data = await res.json(); 
        
        // On récupère la liste (on adapte selon si ton API renvoie {postits:[]} ou [])
        let postits = Array.isArray(data) ? data : (data.postits || []);

        // 1. MISE À JOUR DU BADGE DEV (Header)
        const stDev = document.getElementById('st-dev');
        if (stDev) stDev.innerText = deviceId.substring(0, 6); // Affiche un court ID ou le nom

        // 2. LOGIQUE DE FILTRAGE (Flux Actif vs Archives)
        if (showFinished) {
            // Mode ARCHIVES : Uniquement les états terminaux
            postits = postits.filter(p => 
                p.status === "En caisse" || 
                p.status === "Terminé" || 
                p.status === "Annulé"
            );
        } else {
            // Mode ACTIF (Par défaut) : Uniquement ce qui est en cours
            postits = postits.filter(p => 
                p.status === "En attente" || 
                p.status === "En préparation" || 
                !p.status || p.status === ""
            );
        }

        // 3. REMPLISSAGE DU SÉLECTEUR
        const sel = document.getElementById('sel-pos');
        if (sel) {
            if (postits.length > 0) {
                sel.innerHTML = postits.map(p => 
                    `<option value="${p._id}">#${p.orderNumber || '?'} - ${p.name}</option>`
                ).join('');
                
                // Sélection automatique du premier de la liste
                sel.value = postits[0]._id;
                
                // Met à jour la date du filtre selon la commande sélectionnée
                if (typeof updateFilterDateFromPostit === "function") {
                    updateFilterDateFromPostit();
                }
            } else {
                // Si la liste est vide après filtrage
                sel.innerHTML = '<option value="">(Aucun post-it)</option>';
                const stPos = document.getElementById('st-pos');
                if (stPos) stPos.innerText = "-";
            }
        }

        // 4. RAFRAÎCHISSEMENT DE LA VUE
        refreshView();

    } catch (err) {
        console.error("Erreur dans loadPostits:", err);
    }
}

async function uploadFile(input) {
    if (!input.files[0] || !currentUser) return;
    const formData = new FormData();
    formData.append('file', input.files[0]);

    const pid = document.getElementById('sel-pos').value; // On récupère l'ID du post-it actuel

    try {
        const res = await fetchAuth('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();

        // 1. Envoi du message avec l'image
        socket.emit('send-message', {
            groupId: document.getElementById('sel-group').value,
            deviceId: document.getElementById('sel-dev').value,
            postitId: pid,
            content: data.url,
            senderName: currentUser.name,
            type: 'image'
        });

        // 2. MISE À JOUR AUTOMATIQUE DU STATUT
        // On informe le serveur que ce post-it passe en "En caisse"
        socket.emit('update-postit-status', { 
            postitId: pid, 
            status: "En caisse", 
            comment: "" // Pas de commentaire nécessaire pour cette action auto
        });

    } catch (err) { 
        console.error("Erreur upload ou statut:", err); 
    }
}



// Fonction de gestion du changement via Select
function handleSelectStatus(selectElement, pid) {
    const newStatus = selectElement.value;
    let cancelReason = "";

    if (newStatus === "Annulé") {
        cancelReason = prompt("Motif de l'annulation (obligatoire pour annuler) :");
        if (!cancelReason || cancelReason.trim() === "") {
            // Si l'utilisateur annule le prompt ou laisse vide, on recharge pour annuler le changement du select
            refreshView(); 
            return;
        }
    }

    socket.emit('update-postit-status', { 
        postitId: pid, 
        status: newStatus,
        comment: cancelReason 
    });
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


async function deleteGroup(id) {
    try {
        const res = await fetchAuth(`/api/groups/${id}`, { method: 'DELETE' });
        if (res.ok) {
            // 1. Vider les sélecteurs
            const selGrp = document.getElementById('sel-group');
            const selDev = document.getElementById('sel-dev');
            const selPos = document.getElementById('sel-pos');
            if (selGrp) selGrp.value = "";
            if (selDev) selDev.innerHTML = '<option value="">Aucun rayon</option>';
            if (selPos) selPos.innerHTML = '<option value="">Aucun client</option>';

            // 2. Mettre à jour le header (spans du badge status)
            updateVisualHeader();

            // 3. Recharger la liste des groupes (cascade auto vers rayons/postits)
            await loadGroups();
            await refreshParamsLists();

            // 4. Vider le chat
            allMsgs = [];
            if (typeof refreshView === 'function') refreshView();

            // 5. Ouvrir l'accordéon groupes
            const checkG = document.getElementById('check-g');
            if (checkG) checkG.checked = true;
        } else {
            alert("Erreur serveur lors de la suppression du groupe.");
        }
    } catch (err) {
        console.error("Erreur deleteGroup:", err);
        alert("Erreur lors de la suppression.");
    }
}

async function deleteDevice(id) {
    try {
        const res = await fetchAuth(`/api/devices/${id}`, { method: 'DELETE' });

        if (res.ok) {
            const selGroup = document.getElementById('sel-group');
            const currentGid = selGroup ? selGroup.value : null;

            // Si on a supprimé le rayon actif, on vide le header
            document.getElementById('current-device-name').innerText = "AUCUN RAYON";
            
            // Rafraîchissement des données
            if (currentGid) {
                await loadGroupData(currentGid);
                await refreshParamsLists();
                
                // On force l'ouverture de l'accordéon des rayons
                const checkD = document.getElementById('check-d');
                if (checkD) checkD.checked = true;
            }
        } else {
            console.error("Erreur lors de la suppression du rayon.");
        }
    } catch (err) {
        console.error("Erreur réseau deleteDevice:", err);
    }
}

async function deletePostit(id) {
    // On garde ton confirm pour le post-it car c'est une action sensible
    if(confirm("Supprimer ce client/commande ?")) {
        try {
            const res = await fetchAuth(`/api/postits/${id}`, { method: 'DELETE' });
            if (res.ok) {
                const gid = document.getElementById('sel-group').value;
                if (gid) {
                    await loadGroupData(gid);
                    await refreshParamsLists();
                    
                    // On force l'ouverture de l'accordéon des post-its
                    const checkP = document.getElementById('check-p');
                    if (checkP) checkP.checked = true;
                }
            }
        } catch (err) {
            console.error("Erreur deletePostit:", err);
        }
    }
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
        // ON NE TOUCHE PAS À CETTE PARTIE (Elle gère tes fenêtres de modif clients)
        editingPostitId = id;
        const res = await fetchAuth(`/api/postits/details/${id}`);
        const p = await res.json();
        document.getElementById('order-client').value = p.name || "";
        document.getElementById('order-num').value = p.orderNumber || "";
        document.getElementById('order-phone').value = p.phone || "";
        document.getElementById('order-date').value = p.pickupDate || "";
        document.querySelector('#order-modal h2').innerText = "Modifier la Commande";
        document.getElementById('order-modal').classList.remove('hidden');
	} else {
        openCustomPrompt(`Modifier "${oldName}"`, oldName, async (newName) => {
            if (!newName || newName === oldName) return;
            
            let url = type === 'group' ? `/api/groups/${id}` : `/api/devices/${id}`;
            
            try {
                const res = await fetchAuth(url, {
                    method: 'PUT',
                    body: JSON.stringify({ name: newName.trim() })
                });

				if (res.ok) {
					const currentGid = document.getElementById('sel-group').value;
					
					if (type === 'group') {
						// 1. On recharge les groupes pour le menu déroulant
						await loadGroups(); 
						
						// 2. LE CORRECTIF : On force le rafraîchissement de la liste des réglages
						// C'est ici que le "stylo" est régénéré pour chaque ligne
						setTimeout(async () => {
							await refreshParamsLists();
							
							// On s'assure que l'accordéon reste ouvert
							const checkG = document.getElementById('check-g');
							if (checkG) checkG.checked = true;
						}, 300);

					} else {
						await loadGroupData(currentGid);
						await refreshParamsLists();
					}
				}
            } catch (err) {
                // Ici, on attrape l'erreur réseau (ex: coupure Wi-Fi)
                console.error("Erreur critique modification:", err);
                alert("Impossible de joindre le serveur. Vérifiez votre connexion.");
            }
        });
    }
}

async function submitOrder() {
    const devId = document.getElementById('sel-dev').value;
    const client = document.getElementById('order-client').value;
    const phone = document.getElementById('order-phone').value;
    const date = document.getElementById('order-date').value;
    let orderNum = document.getElementById('order-num').value;

    if(!client) return alert("Le nom du client est obligatoire");

    // --- SÉCURITÉ V3 : RÉCUPÉRATION DE L'EMAIL ---
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || !user.email) return alert("Session expirée, merci de vous reconnecter.");

    const payload = {
        name: client,
        orderNumber: orderNum || ("CMD-" + Math.floor(1000 + Math.random() * 9000)),
        phone: phone,
        pickupDate: date
        /// INUTILE désormais avec le fetchAuth ownerEmail: user.email // <--- ON AJOUTE L'EMAIL ICI
    };

    let url = editingPostitId ? `/api/postits/details/${editingPostitId}` : '/api/postits';
    // Attention : J'ai corrigé l'URL du PUT pour correspondre à ta route '/api/postits/:id'
    if (editingPostitId) url = `/api/postits/${editingPostitId}`; 

    let method = editingPostitId ? 'PUT' : 'POST';
    if (!editingPostitId) payload.deviceId = devId;

    const res = await fetchAuth(url, {
        method: method,
        body: JSON.stringify(payload)
    });

    if(res.ok) {
        closeOrderModal();
        const currentGid = document.getElementById('sel-group').value; 
        await loadGroupData(currentGid); 
        await refreshParamsLists(); 
    }
}

function showStatusMenu(btn, pid) {
    // 1. Sécurité : si le bouton n'existe pas, on sort pour ne pas faire planter le script
    if (!btn) return;

    // 2. On récupère le statut
    const currentStatus = btn.getAttribute('data-status');

    // 3. BLOCAGE : On vérifie si currentStatus existe ET s'il est verrouillé
    if (currentStatus && (currentStatus === "En caisse" || currentStatus === "Terminé")) {
        alert("Cette commande est validée en caisse. Le statut ne peut plus être modifié.");
        return; 
    }

    // 4. Si on arrive ici, c'est que ce n'est pas verrouillé, on affiche le menu
    const existing = document.getElementById('status-popup');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.id = 'status-popup';
    menu.className = 'fixed inset-0 bg-black/50 z-[3000] flex items-center justify-center p-6';
    menu.onclick = () => menu.remove();

    const content = document.createElement('div');
    content.className = 'bg-white border-4 border-black p-4 w-full shadow-[8px_8px_0px_#000]';
    content.onclick = (e) => e.stopPropagation();

    const options = ["En attente", "En préparation", "Terminé", "Annulé"];
    // Note : On n'ajoute pas "En caisse" ici car il est automatique via l'upload
    
    content.innerHTML = `
        <div class="text-[10px] font-black uppercase mb-4 opacity-40">Changer le statut</div>
        <div class="flex flex-col gap-2">
            ${options.map(opt => `
                <button onclick="execChangeStatus('${pid}', '${opt}')" 
                        class="p-4 border-2 border-black font-black uppercase text-left active:bg-black active:text-white">
                    ${opt}
                </button>
            `).join('')}
            <button onclick="this.parentElement.parentElement.parentElement.remove()" class="mt-2 p-2 text-[10px] font-black uppercase opacity-50">Fermer</button>
        </div>
    `;

    menu.appendChild(content);
    document.body.appendChild(menu);
}
// La fonction qui exécute le changement
function execChangeStatus(pid, newStatus) {
    let comment = "";
    const btn = document.getElementById('btn-status-main');
    const oldStatus = btn ? btn.getAttribute('data-status') : "";

    // Cas 1 : On annule la commande
    if (newStatus === "Annulé") {
        comment = prompt("Motif de l'annulation (obligatoire) :");
        if (!comment || comment.trim() === "") return;
    } 
    // Cas 2 : On réactive une commande qui était annulée
    else if (oldStatus === "Annulé") {
        comment = prompt("Motif de réactivation (obligatoire car la commande était annulée) :");
        if (!comment || comment.trim() === "") return;
        comment = "🔄 RÉACTIVATION : " + comment;
    }

    socket.emit('update-postit-status', { 
        postitId: pid, 
        status: newStatus, 
        comment: comment 
    });
    
    const menu = document.getElementById('status-popup');
    if (menu) menu.remove();
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

async function uiJoinGroup() {
    const codeInput = document.getElementById('input-join-code');
    const code = codeInput ? codeInput.value.trim() : prompt("Entrez le code du commerce :");
    
    if(!code) return;

    const user = JSON.parse(localStorage.getItem('user'));
    
    try {
        const res = await fetchAuth('/api/groups/join', {
            method: 'POST',
            body: JSON.stringify({ 
                joinCode: code 
            })
        });

        if(res.ok) {
            const group = await res.json();
            alert(`Succès ! Vous avez rejoint : ${group.name}`);
            if(codeInput) codeInput.value = "";
            // On rafraîchit les listes pour voir le nouveau groupe apparaître
            if (typeof initApp === 'function') initApp(); 
            else location.reload();
        } else {
            const txt = await res.text();
            alert("Erreur : " + txt);
        }
    } catch (err) {
        alert("Impossible de rejoindre le groupe actuellement.");
    }
}

async function login() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    // ⚠️ Utilise bien "fetch" ici, pas "fetchAuth"
    const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (res.ok) {
        currentUser = data.user;
        // On sauvegarde le token qu'on vient de recevoir
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem('token', data.token); 
        
        document.getElementById('auth-screen').classList.add('hidden');
        initApp();
    } else {
        alert("Erreur : " + (data.message || "Connexion échouée"));
    }
}