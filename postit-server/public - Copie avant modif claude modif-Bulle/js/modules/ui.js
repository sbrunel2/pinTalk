function _initSelectionMenu() {
    const menu = document.createElement('div');
    menu.id = 'selection-context-menu';
    menu.style.cssText = `
        position:fixed; z-index:9999; display:none;
        left:0; right:0;
        background:#18181b;
        border-top:2px solid rgba(255,255,255,0.2);
        box-shadow:0 4px 12px rgba(0,0,0,0.5);
        flex-direction:row; align-items:center;
    `;
    menu.innerHTML = `
        <div style="flex:1;display:flex;align-items:center;padding:0 12px;
                    color:rgba(255,255,255,0.4);font-size:11px;font-style:italic;
                    overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
             id="smenu-preview"></div>
        <button id="smenu-dict"
            onmousedown="event.preventDefault()"
            style="padding:14px 16px;background:none;border:none;
                   border-left:1px solid rgba(255,255,255,0.12);
                   color:white;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">
            📚 Dico
        </button>
        <button id="smenu-quote"
            onmousedown="event.preventDefault()"
            style="padding:14px 16px;background:none;border:none;
                   border-left:1px solid rgba(255,255,255,0.12);
                   color:white;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">
            ❝ Citer
        </button>
        <button id="smenu-cancel"
            onmousedown="event.preventDefault()"
            style="padding:14px 14px;background:none;border:none;
                   border-left:1px solid rgba(255,255,255,0.12);
                   color:rgba(255,255,255,0.4);font-size:18px;cursor:pointer;">
            ✕
        </button>
    `;
    document.body.appendChild(menu);

    // Supprimer le FAB s'il existe d'une version précédente
    const oldFab = document.getElementById('selection-fab');
    if (oldFab) oldFab.remove();

    let _lastSelection = '';
    let _lastBubbleId  = null;
    let _menuVisible   = false;

    const hideMenu = () => {
        menu.style.display = 'none';
        _menuVisible = false;
    };

    const showMenu = (text) => {
        const preview = document.getElementById('smenu-preview');
        if (preview) preview.textContent = '"' + text + '"';

        // Calculer la position : juste sous message-bar
        // message-bar est fixed en bas, au-dessus de la tab-bar
        const tabBar = document.querySelector('.tab-bar');
        const msgBar = document.getElementById('message-bar');
        const tabH   = tabBar ? tabBar.getBoundingClientRect().height : 56;
        const msgH   = msgBar ? msgBar.getBoundingClientRect().height : 52;

        // Coller juste au-dessus du bandeau orange (edit-mode-banner)
        // ou au-dessus de la tab-bar si pas de bandeau
        const banner = document.getElementById('edit-mode-banner');
        if (banner) {
            const bRect = banner.getBoundingClientRect();
            menu.style.top    = 'auto';
            menu.style.bottom = (window.innerHeight - bRect.top) + 'px';
        } else {
            menu.style.top    = 'auto';
            menu.style.bottom = tabH + 'px';
        }
        menu.style.top    = 'auto';

        menu.style.height    = '36px';
        menu.style.minHeight = '36px';
        menu.style.maxHeight = '36px';
        menu.style.display   = 'flex';
        _menuVisible = true;
    };

    const tryShow = () => {
        const sel  = window.getSelection();
        const text = sel?.toString().trim();
        if (!text || text.length < 2) { hideMenu(); return; }

        // Vérifier bulle ou msg-input en mode édition
        const anchor = sel.anchorNode?.parentElement;
        const focus  = sel.focusNode?.parentElement;
        const bubble = anchor?.closest('.msg-bubble') || focus?.closest('.msg-bubble');
        const inInput = anchor?.id === 'msg-input' || anchor?.closest('#msg-input');

        if (!bubble && !inInput && !window._editingMessageId) { hideMenu(); return; }

        _lastSelection = text;

        if (bubble) {
            const row = bubble.closest('[data-id]') || bubble.closest('.msg-row');
            _lastBubbleId = row?.dataset?.id || null;
        } else {
            _lastBubbleId = window._editingMessageId || null;
        }

        showMenu(text);
    };

    // Sur iOS : selectionchange fire pendant la sélection
    document.addEventListener('selectionchange', () => {
        const sel  = window.getSelection();
        const text = sel?.toString().trim();
        window._log && window._log('SC menu: "' + (text||'') + '" vis:' + _menuVisible);
        if (!text || text.length < 2) {
            if (_menuVisible) hideMenu();
            return;
        }
        const anchor = sel.anchorNode?.parentElement;
        const focus  = sel.focusNode?.parentElement;
        const bubble = anchor?.closest('.msg-bubble') || focus?.closest('.msg-bubble');
        const inInput = !!(anchor?.id === 'msg-input' || anchor?.closest?.('#msg-input'));
        window._log && window._log('bubble:' + !!bubble + ' inInput:' + inInput + ' edit:' + !!window._editingMessageId);
        if (!bubble && !inInput && !window._editingMessageId) return;
        _lastSelection = text;
        if (bubble) {
            const row = bubble.closest('[data-id]') || bubble.closest('.msg-row');
            _lastBubbleId = row?.dataset?.id || null;
        } else {
            _lastBubbleId = window._editingMessageId || null;
        }
        showMenu(text);
    });

    // Fermer si tap en dehors
    document.addEventListener('touchstart', (e) => {
        if (_menuVisible && !menu.contains(e.target)) {
            hideMenu();
        }
    }, { passive: true });

    // Bouton Annuler
    document.getElementById('smenu-cancel').addEventListener('click', () => {
        hideMenu();
        window.getSelection()?.removeAllRanges();
    });

    // Action 1 : Dico
    document.getElementById('smenu-dict').addEventListener('click', async () => {
        const phrase = _lastSelection;
        hideMenu();
        window.getSelection()?.removeAllRanges();
        if (!phrase) return;
        const lang = document.getElementById('ai-dict-lang')?.value
                  || localStorage.getItem('lang') || 'fr';
        try {
            const res = await fetchAuth('/api/ai-dictionary', {
                method: 'POST',
                body: JSON.stringify({ phrase, category: '', scope: 'user', lang })
            });
            if (res.ok) {
                const toast = document.createElement('div');
                toast.textContent = '📚 "' + phrase + '" ajouté au dico';
                toast.style.cssText = `
                    position:fixed;bottom:90px;left:50%;transform:translateX(-50%);
                    background:#18181b;color:white;padding:10px 18px;border-radius:20px;
                    font-size:12px;font-weight:700;z-index:10000;
                    box-shadow:0 2px 8px rgba(0,0,0,0.3);pointer-events:none;
                    white-space:nowrap;max-width:90vw;overflow:hidden;text-overflow:ellipsis;
                `;
                document.body.appendChild(toast);
                setTimeout(() => toast.remove(), 2500);
                if (typeof loadAiDictionaryUI === 'function') await loadAiDictionaryUI();
            } else {
                const err = await res.text();
                if (res.status === 409 || err.includes('existe')) {
                    alert('Cette expression est déjà dans le dictionnaire.');
                } else { alert('Erreur : ' + err); }
            }
        } catch(e) { alert('Erreur réseau'); }
    });

    // Action 2 : Citer
    document.getElementById('smenu-quote').addEventListener('click', () => {
        const phrase = _lastSelection;
        const msgId  = _lastBubbleId;
        hideMenu();
        window.getSelection()?.removeAllRanges();
        if (!phrase || !msgId) return;

        // Lire le texte courant dans msg-input (pas msg.content qui est le texte en base)
        const msgInput = document.getElementById('msg-input');
        const currentText = msgInput?.value || '';
        if (!currentText) return;

        const newContent = currentText.replace(phrase, '\u201c' + phrase + '\u201d');

        if (typeof editMessage === 'function') {
            editMessage(msgId, newContent);
        } else if (msgInput) {
            // Fallback : juste mettre à jour l'input
            msgInput.value = newContent;
            if (typeof autoResizeInput === 'function') autoResizeInput(msgInput);
        }
    });
}

function handleTouchStart(e, id) {
    // Bloquer le swipe si une sélection est active OU si une sélection vient de se terminer
    const sel = window.getSelection();
    if (sel && sel.toString().trim().length > 0) {
        touchStartX = null;
        swipeConsumed = false;
        return;
    }
    // Bloquer aussi pendant 800ms après la fin d'une sélection
    // (iOS efface la sélection au touchend, donc getSelection() est déjà vide ici)
    if (window._selectionJustEnded) {
        touchStartX = null;
        swipeConsumed = false;
        return;
    }
    touchStartX = e.touches[0].clientX;
    swipeConsumed = false;
    document.querySelectorAll('[id^="swipe-"]').forEach(el => {
        if (el.id !== 'swipe-' + id) {
            el.style.transition = 'transform 0.2s ease';
            el.style.transform = 'translateX(0)';
            const otherId = el.id.replace('swipe-', '');
            showBtn(otherId, 'none');
        }
    });
}

function handleTouchMove(e, id) {
    if (touchStartX === null) return; // swipe désactivé (touch sur bulle)
    const diffX = e.touches[0].clientX - touchStartX;
    if (Math.abs(diffX) > 8) {
        swipeConsumed = true;
        e.stopPropagation();
    }
    if (!swipeConsumed) return;
    const el = document.getElementById('swipe-' + id);
    if (!el) return;
    const clamped = Math.max(-44, Math.min(44, diffX));
    el.style.transition = 'none';
    el.style.transform = 'translateX(' + clamped + 'px)';
    // Afficher progressivement le bouton pendant le glissement
    const progress = Math.min(Math.abs(clamped) / 44, 1);
    if (diffX > 8) {
        const del = document.getElementById('del-' + id);
        if (del) { del.style.opacity = String(progress); del.style.pointerEvents = progress > 0.5 ? 'auto' : 'none'; }
        const edit = document.getElementById('edit-' + id);
        if (edit) { edit.style.opacity = '0'; edit.style.pointerEvents = 'none'; }
    } else if (diffX < -8) {
        const edit = document.getElementById('edit-' + id);
        if (edit) { edit.style.opacity = String(progress); edit.style.pointerEvents = progress > 0.5 ? 'auto' : 'none'; }
        const del = document.getElementById('del-' + id);
        if (del) { del.style.opacity = '0'; del.style.pointerEvents = 'none'; }
    }
}

function showBtn(id, side) {
    // side: 'del' ou 'edit'
    const del  = document.getElementById('del-'  + id);
    const edit = document.getElementById('edit-' + id);
    if (side === 'del') {
        if (del)  { del.style.opacity  = '1'; del.style.pointerEvents  = 'auto'; }
        if (edit) { edit.style.opacity = '0'; edit.style.pointerEvents = 'none'; }
    } else if (side === 'edit') {
        if (edit) { edit.style.opacity = '1'; edit.style.pointerEvents = 'auto'; }
        if (del)  { del.style.opacity  = '0'; del.style.pointerEvents  = 'none'; }
    } else {
        if (del)  { del.style.opacity  = '0'; del.style.pointerEvents  = 'none'; }
        if (edit) { edit.style.opacity = '0'; edit.style.pointerEvents = 'none'; }
    }
}

function handleTouchEnd(e, id) {
    if (swipeConsumed) e.stopPropagation();
    const diffX = e.changedTouches[0].clientX - touchStartX;
    const el = document.getElementById('swipe-' + id);
    if (!el) return;
    el.style.transition = 'transform 0.2s ease';
    if (diffX > 30) {
        el.style.transform = 'translateX(44px)';
        showBtn(id, 'del');
    } else if (diffX < -30) {
        // Swipe gauche : bulle reste décalée, bouton stylo reste visible
        el.style.transform = 'translateX(-48px)';
        showBtn(id, 'edit');
    } else {
        el.style.transform = 'translateX(0)';
        showBtn(id, 'none');
    }
    swipeConsumed = false;
}

function resetSwipe(id) {
    const el = document.getElementById('swipe-' + id);
    if (el) { el.style.transition = 'transform 0.2s ease'; el.style.transform = 'translateX(0)'; }
    showBtn(id, 'none');
}

async function deleteMessage(id) {
    resetSwipe(id);
    try {
        const msg = allMsgs.find(m => m._id === id);
        const res = await fetchAuth('/api/messages/' + id, { method: 'DELETE' });
        if (res.ok) {
            // Supprimer les notes IA liées AVANT de retirer le message de allMsgs
            // car _deleteAiNotesForMessage cherche le sourceMsg dans allMsgs
            if (msg && msg.senderName !== '✨ IA') {
                await _deleteAiNotesForMessage(id, msg.postitId);
            }
            // Retirer le message user APRÈS la suppression des notes IA
            allMsgs = allMsgs.filter(m => m._id !== id);
            refreshView();
        }
    } catch (err) { console.error(err); }
}

function editMessage(id, initialText = null) {
    resetSwipe(id);
    const msg = allMsgs.find(m => m._id === id);
    if (!msg || msg.type === 'image') return;

    const swipeEl  = document.getElementById('swipe-' + id);
    const msgInput = document.getElementById('msg-input');
    if (!msgInput) return;

    // Annuler une édition en cours sur une autre bulle
    _cancelEditMode();

    // ── Activer le mode édition ───────────────────────────────────────────────
    window._editingMessageId  = id;
    window._editingOriginalText = msg.content;

    // Colorier la bulle en cours (contour jaune)
    if (swipeEl) {
        swipeEl.dataset.prevOutline = swipeEl.style.outline || '';
        swipeEl.style.outline = '2px solid #f59e0b';
        swipeEl.style.outlineOffset = '2px';
    }

    // Mettre le texte dans msg-input
    msgInput.value = initialText !== null ? initialText : msg.content;
    msgInput.style.outline = '2px solid #f59e0b';
    msgInput.focus();
    if (typeof autoResizeInput === 'function') autoResizeInput(msgInput);

    // Mémoriser la position de la bulle et la restaurer après refreshView
    if (swipeEl) {
        const scrollToEditBubble = () => {
            swipeEl.scrollIntoView({ behavior: 'smooth', block: 'end' });
        };
        // Stocker la fonction pour que refreshView puisse l'appeler
        window._scrollToEditBubble = scrollToEditBubble;
        setTimeout(scrollToEditBubble, 300);
    }

    // Afficher le bandeau "Mode édition" dans la tab-bar
    _showEditModeBanner(msg.senderName);
}

// Annule le mode édition sans sauvegarder
function _cancelEditMode() {
    const id = window._editingMessageId;
    if (!id) return;

    const swipeEl  = document.getElementById('swipe-' + id);
    const msgInput = document.getElementById('msg-input');

    if (swipeEl) {
        swipeEl.style.outline      = swipeEl.dataset.prevOutline || '';
        swipeEl.style.outlineOffset = '';
    }
    if (msgInput) {
        msgInput.value   = '';
        msgInput.style.outline = '';
        if (typeof autoResizeInput === 'function') autoResizeInput(msgInput);
    }

    window._editingMessageId    = null;
    window._editingOriginalText = null;
    window._scrollToEditBubble  = null;
    _hideEditModeBanner();
}

// Bandeau dans la tab-bar
function _showEditModeBanner(senderName) {
    _hideEditModeBanner();
    const tabBar = document.querySelector('.tab-bar');
    if (!tabBar) return;

    const banner = document.createElement('div');
    banner.id = 'edit-mode-banner';
    banner.style.cssText = `
        position:absolute; top:-36px; left:0; right:0;
        background:#f59e0b; color:#18181b;
        font-size:11px; font-weight:900; text-transform:uppercase;
        display:flex; align-items:center; justify-content:space-between;
        padding:0 12px; height:36px; letter-spacing:0.03em;
    `;
    banner.innerHTML = `
        <span>✏️ Modification : ${senderName || 'message'}</span>
        <button onmousedown="event.preventDefault()" onclick="_cancelEditMode()"
            style="background:none;border:none;font-size:18px;cursor:pointer;
                   color:#18181b;font-weight:900;padding:0 4px;">✕</button>
    `;
    tabBar.style.position = 'relative';
    tabBar.appendChild(banner);
}

function _hideEditModeBanner() {
    const b = document.getElementById('edit-mode-banner');
    if (b) b.remove();
}

// Vibration centralisée (Android uniquement - iOS ne supporte pas navigator.vibrate)
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
                    onclick="event.stopPropagation(); if(this.dataset.confirm!=='1'){ this.dataset.confirm='1'; this.style.opacity='1'; setTimeout(()=>{ this.dataset.confirm=''; this.style.opacity='0.5'; }, 2000); } else { this.dataset.confirm=''; ${deleteFnName}('${item._id}'); }" 
                    style="font-size:16px;background:none;border:none;cursor:pointer;opacity:0.5;padding:4px;" title="Supprimer">🗑️</button>
            </div>
        </div>`;
    }).join('');
}

async function syncSelection(type, id) {
    const gid = id || currentGroupId || document.getElementById('sel-group')?.value;

    if (type === 'group' && gid && gid !== currentGroupId) {
        // Groupe changé : recharger la config
        currentGroupId = gid;
        localStorage.setItem('currentGroupId', gid);
        try {
            const res = await fetchAuth('/api/groups/' + gid + '/config');
            if (res.ok) { currentGroupConfig = await res.json(); applyGroupConfig(); }
        } catch(e) {}
        await loadGroupData(gid);
        if (typeof loadMembers === 'function') await loadMembers(gid);
    } else if (type === 'group') {
        await loadGroupData(gid);
    } else if (type === 'dev') {
        await loadGroupData(gid);
    }

    updateVisualHeader();
    const pid = document.getElementById('sel-pos')?.value;
    if (socket && gid) socket.emit('get-history', { groupId: gid, postitId: pid || undefined });
    if (typeof updateBadge === 'function') updateBadge();
    if (typeof refreshParamsLists === 'function') refreshParamsLists();
}

async function refreshParamsLists() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || !user.email) return;

    // TOUJOURS utiliser currentGroupId comme source de vérité
    let currentGid = currentGroupId || localStorage.getItem('currentGroupId');

    // 1. Charger les GROUPES (proprio + membre)
    const gRes = await fetchAuth('/api/groups/mine');
    const groups = await gRes.json();

    // Synchroniser sel-group (caché) avec currentGroupId
    const selGroup = document.getElementById('sel-group');
    if (selGroup) {
        selGroup.innerHTML = groups.map(g => `<option value="${g._id}">${g.name}</option>`).join('');
        if (currentGid) selGroup.value = currentGid;
    }

    // Si toujours pas de groupe, prendre le premier
    if (!currentGid && groups.length > 0) {
        currentGid = groups[0]._id;
        currentGroupId = currentGid;
        localStorage.setItem('currentGroupId', currentGid);
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
            // Si pas de rayon sélectionné, on vide la liste des pintalks
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
        const currentGroup = currentGroupId || document.getElementById('sel-group')?.value;
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
            // Dernier groupe visité ou premier du groupe
            const lastGroupId = localStorage.getItem('lastGroupId');
            const targetId = idToSelect || currentGroupId || (lastGroupId && groups.find(g=>g._id===lastGroupId) ? lastGroupId : null) || sel.value || groups[0]._id;
            sel.value = targetId;
            if (!currentGroupId) { currentGroupId = targetId; localStorage.setItem('currentGroupId', targetId); }

            // Charger les données du groupe
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


function updateBadge() {
    const g = document.getElementById('sel-group'), d = document.getElementById('sel-dev'), p = document.getElementById('sel-pos');
    document.getElementById('st-grp').innerText = truncate(g.options[g.selectedIndex]?.text, 15) || '-';
    document.getElementById('st-dev').innerText = truncate(d.options[d.selectedIndex]?.text, 15) || '-';
    document.getElementById('st-pos').innerText = truncate(p.options[p.selectedIndex]?.text, 15) || '-';
}

