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


async function toggleNote(messageId) {
    const msg = allMsgs.find(m => m._id === messageId);
    if (!msg || msg.senderName === '✨ IA') return;
    const willHideFromEink = !msg.isNote;

    // Mise à jour locale immédiate
    msg.isNote = willHideFromEink;
    socket.emit('toggle-message-note', { messageId });
    refreshView(false);

    if (willHideFromEink) {
        // Masquer : supprimer les items IA liés
        await _deleteAiNotesForMessage(messageId, msg.postitId);
        refreshView(false);
    } else {
        // Ré-afficher : le message user est déjà visible dans l'e-ink
        // grâce au filtre userItemsWithoutAi. On relance l'extraction IA
        // seulement si pas déjà en cours — APRÈS avoir supprimé les anciens items
        if (msg.postitId && !_aiExtractInProgress.has(msg._id)) {
            await _deleteAiNotesForMessage(messageId, msg.postitId);
            refreshView(false); // affiche le message user en attendant l'IA
            _aiExtractInProgress.add(msg._id);
            setTimeout(() => aiAutoExtract(msg.content || '', msg.postitId, msg._id), 100);
        }
    }
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
    const pid = currentPostitId || (pSel ? pSel.value : null);
    if (!pid) return;

    // Recalcul du statut automatique
    // Chat = messages normaux uniquement (pas les notes IA)
    const lines = allMsgs.filter(m =>
        m.postitId === pid &&
        m.senderName !== '✨ IA'
    );
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
    if (window._editingMessageId) return;
    // Guard anti-boucle : si un refreshView est déjà en cours, on ignore
    if (window._refreshViewInProgress) return;
    window._refreshViewInProgress = true;
    try { await _refreshViewInner(forceScrollBottom); }
    finally { window._refreshViewInProgress = false; }
}

async function _refreshViewInner(forceScrollBottom = false) {
    const pSel = document.getElementById('sel-pos');
    const pid = currentPostitId || (pSel ? pSel.value : null);
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
    let formattedDate = "";

    if (pid && pid !== "") {
        try {
            const res = await fetchAuth(`/api/postits/details/${pid}`, {}, true);
            if (res && res.ok) {
                const p = await res.json();
                currentStatus = p.status;
                let statusBg = "bg-black"; 
                if (p.status === "En préparation") statusBg = "bg-orange-500";
                if (p.status === "En caisse") statusBg = "bg-blue-500";
                if (p.status === "Terminé") statusBg = "bg-green-600";
                if (p.status === "Annulé") statusBg = "bg-gray-500";
                
                formattedDate = "--/--/---- --:--";
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

                const isPro = currentGroupConfig?.isPro;
                const groupName  = currentGroupConfig?.name  || '';
                const userName   = currentUser?.name || currentUser?.firstname || '';

                if (isPro) {
                    // Groupe PRO : entête complet avec statut, N° commande, client, date
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
                            <button onclick="goToPage(PAGE_CHAT)" class="bg-blue-50 text-blue-600 p-3 border-2 border-blue-200 shadow-[2px_2px_0px_#bfdbfe] flex items-center justify-center active:shadow-none active:translate-x-[1px] active:translate-y-[1px]">
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
                                    ${p.phone ? `📞 <a href="tel:${p.phone}" onclick="return confirm('Lancer l\'appel vers le ${p.phone} ?')" class="underline">${p.phone}</a>` : ''}
                                </div>
                            </div>
                            <div class="text-right text-[12px] font-black">${formattedDate}</div>
                        </div>
                        ${cancelCommentHtml}
                    </div>`;
                } else {
                    // Groupe PERSO : entête simplifié — groupe / pintalk / utilisateur connecté
                    prepHeaderHtml = `
                    <div style="display:flex;justify-content:space-between;align-items:center;
                                padding:8px 10px;border-bottom:2px solid var(--accent);background:var(--bg);">
                        <div>
                            <div style="font-size:8px;font-weight:900;text-transform:uppercase;opacity:0.4;line-height:1;">${groupName}</div>
                            <div style="font-size:16px;font-weight:900;line-height:1.2;">${p.name}</div>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <div style="font-size:9px;font-weight:900;opacity:0.45;text-transform:uppercase;">👤 ${userName}</div>
                            <button onclick="goToPage(PAGE_CHAT)"
                                style="background:var(--accent);color:white;border:none;padding:6px 8px;font-size:12px;cursor:pointer;">←</button>
                        </div>
                    </div>`;
                }
            }
        } catch (e) { console.error(e); }
    }

    // Zone e-ink = uniquement :
    // - les items IA (produits) liés à des messages NON masqués
    // - les morceaux de texte entre guillemets (", «», “” …) extraits des messages NON masqués
    // On n'affiche ni auteur, ni texte complet non-produit.
    const hiddenSourceIds = new Set(
        allMsgs
            .filter(m => m.postitId === pid && m.senderName !== '✨ IA' && m.isNote === true)
            .map(m => m._id)
    );

    // Items IA visibles (produits extraits par l'IA)
    const aiItems = allMsgs.filter(m => {
        if (m.postitId !== pid) return false;
        if (m.senderName !== '✨ IA') return false;
        if (m.type === 'image' || m.type === 'audio') return false;
        if (m.isNote === true) return false;
        if (m.sourceMessageId) return !hiddenSourceIds.has(m.sourceMessageId);
        return true;
    });

    // IDs des messages source qui ont déjà des items IA associés
    const sourcesWithAi = new Set(aiItems.map(m => m.sourceMessageId).filter(Boolean));

    // Messages user visibles SANS item IA lié → affichés directement dans l'e-ink
    const userItemsWithoutAi = allMsgs.filter(m => {
        if (m.postitId !== pid) return false;
        if (m.senderName === '✨ IA') return false;
        if (m.type === 'image' || m.type === 'audio') return false;
        if (m.isNote === true) return false;
        if (sourcesWithAi.has(m._id)) return false; // déjà représenté par ses items IA
        return true;
    });

    const einkHtml = [...aiItems, ...userItemsWithoutAi].map(m => {
        const isLocked = (currentStatus === "Annulé" || currentStatus === "En caisse");

        // Résultat IA: checkbox + style incertain/checked
        const uncertain  = !!m.isUncertain;
        const opacityClass = isLocked ? "opacity-50 cursor-not-allowed" : "cursor-pointer";
        const borderCol = uncertain ? '#d97706' : '#000';
        const boxClass  = m.checked ? "bg-green-500 text-white" : "bg-white text-transparent";
        const textColor = m.checked ? '#a1a1aa' : (uncertain ? '#d97706' : '#000');
        const textDeco  = m.checked ? 'line-through' : 'none';
        const prefix    = uncertain && !m.checked ? '? ' : '';
        return `
        <div class="flex items-center gap-3 mb-2 group ${opacityClass}"
             onclick="event.stopPropagation(); ${isLocked ? '' : `toggleLineCheck('${m._id}')`}">
            <div class="w-5 h-5 flex-shrink-0 flex items-center justify-center transition-colors ${boxClass}"
                 style="border:2px solid ${borderCol};">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <span class="text-[13px] font-bold"
                  style="color:${textColor};text-decoration:${textDeco};word-break:break-word;overflow-wrap:break-word;white-space:normal;min-width:0;">
                ${prefix}${m.content}
            </span>
        </div>`;
    }).join('');

    if (einkSmall) einkSmall.innerHTML = einkHtml;
    if (einkFull) einkFull.innerHTML = einkHtml;
    if (prepHeader) prepHeader.innerHTML = prepHeaderHtml ||
        `<div style="padding:8px 10px;border-bottom:2px solid var(--accent);background:var(--bg);display:flex;justify-content:flex-end;">
            <button onclick="goToPage(PAGE_CHAT)"
                style="background:var(--accent);color:white;border:none;padding:6px 10px;font-size:12px;cursor:pointer;font-weight:900;">← Retour</button>
        </div>`;

    // Mettre à jour et afficher/masquer la zone Contenu du Pintalk
    const accEink  = document.getElementById('acc-eink');
    const einkLabel = document.querySelector('label[for="check-eink"].acc-label-text');
    if (accEink) {
        if (pid) {
            accEink.style.display = '';
            const pintalkName = _cachedPostits.find(p2 => p2._id === pid)?.name || '';
            if (einkLabel) einkLabel.textContent = `📋 Contenu — ${pintalkName}`;
        } else {
            accEink.style.display = 'none';
        }
    }
    // Bandeau commande Pro au-dessus des sélecteurs
    const orderBanner = document.getElementById('order-banner');
    const orderBannerContent = document.getElementById('order-banner-content');
    const dateAlert = document.getElementById('order-date-alert');

    if (orderBanner) {
        const showBanner = !!(currentGroupConfig && currentGroupConfig.isPro && pid);
        orderBanner.style.display = showBanner ? '' : 'none';
        if (showBanner && orderBannerContent && headerHtml) {
            orderBannerContent.innerHTML = headerHtml;
        }
        // Alerte date manquante : currentStatus est vide si pas de date ou statut "En attente" sans date
        if (dateAlert) {
            // On vérifie formattedDate : si elle contient "?" c'est qu'il n'y a pas de date
            // noDate = vrai si pas de date réelle (formattedDate vide ou "--")
            const noDate = !formattedDate || formattedDate === '' || formattedDate.startsWith('--');
            dateAlert.style.display = (showBanner && noDate) ? '' : 'none';
        }
    }

    const orderInfoEl = document.getElementById('order-info-content');
    if (orderInfoEl && prepHeaderHtml) orderInfoEl.innerHTML = prepHeaderHtml;

    if (chat) {
        const showAiDebug = isDebugAiVisible();
        const filtered = allMsgs.filter(m => {
            if (m.postitId !== pid) return false;
            // Masquer les bulles d'analyse IA sauf si le mode debug est actif
            if (m.senderName === '✨ IA' && !showAiDebug) return false;
            return true;
        });
        chat.innerHTML = [...filtered].reverse().map(m => {
            const isMe = (currentUser && m.senderName === currentUser.name);
            // isNote=true => masqué du e-ink => grisé dans le chat
            const noteClass = m.isNote ? "opacity-30 italic" : "";
            // Couleur par auteur : hue dérivé du nom
            let bubbleBgStyle, tagBg, tagColor, bubbleTextColor;
            if (isMe) {
                // Moi : bulle noire (ou custom), étiquette fond BLANC texte NOIR
                bubbleBgStyle   = `var(--bubble-me-bg, #18181b)`;
                bubbleTextColor = `var(--bubble-me-text, #fff)`;
                tagBg    = '#ffffff';
                tagColor = '#18181b';
            } else {
                const hue = _nameToHue(m.senderName || '?');
                // Étiquette : couleur vive (hsl saturé)
                tagBg    = `hsl(${hue},72%,38%)`;
                tagColor = '#fff';
                // Bulle : même teinte mais très claire (pastel)
                bubbleBgStyle   = `hsl(${hue},55%,94%)`;
                bubbleTextColor = `hsl(${hue},60%,20%)`;
            }
            const tagStyle = `background:${tagBg};color:${tagColor};`;
            const bubbleBg = isMe ? '' : '';  // géré via style inline
            const bubbleBgInline = `background:${bubbleBgStyle};color:${bubbleTextColor};`;

            let contentHtml = `<span id="text-${m._id}" style="font-size:13px; font-weight:700; line-height:1.4; word-break:break-word; overflow-wrap:break-word; white-space:pre-wrap; flex:1;">${m.content}</span>`;
            if (m.type === 'image') {
                contentHtml = `
                <div class="flex-1 py-1">
                    <img src="${m.content}" 
                         class="max-w-[80px] aspect-square object-cover border-2 border-black shadow-[2px_2px_0px_#000] cursor-pointer active:scale-95 transition-transform" 
                         onclick="openFullImage('${m.content}')"
                         alt="Document">
                </div>`;
            } else if (m.type === 'audio') {
                contentHtml = `
                <div class="flex-1 py-1" style="min-width:160px;">
                    <audio controls src="${m.content}"
                           style="width:100%;height:32px;outline:none;"
                           preload="none">
                    </audio>
                </div>`;
            }

            return `
            <div class="msg-row ${isMe ? 'me' : 'others'} ${noteClass} mb-2" data-id="${m._id}">

                <div id="swipe-${m._id}"
                     class="msg-bubble ${isMe ? 'me' : 'others'}"
                     style="position:relative; max-width:75%;
                            word-break:break-word; overflow-wrap:break-word;
                            transform:translateX(0); transition:transform 0.2s ease;
                            ${bubbleBgInline}"
                     ${isMe ? `ontouchstart="handleTouchStart(event,'${m._id}')"
                     ontouchmove="handleTouchMove(event,'${m._id}')"
                     ontouchend="handleTouchEnd(event,'${m._id}')"` : ''}>

                    ${isMe ? `<button id="del-${m._id}"
                            ontouchend="event.stopPropagation(); deleteMessage('${m._id}')"
                            style="position:absolute; top:0; bottom:0; right:100%;
                                   width:44px; background:transparent;
                                   border:none; font-size:22px; cursor:pointer;
                                   display:flex; align-items:center; justify-content:center;
                                   opacity:0; pointer-events:none;
                                   transition:opacity 0.2s;">🗑️</button>` : ''}

                    ${isMe ? `<button id="edit-${m._id}"
                            ontouchend="event.stopPropagation(); editMessage('${m._id}')"
                            style="position:absolute; top:0; bottom:0; right:-48px;
                                   width:44px; background:rgba(30,30,30,0.85);
                                   border-radius:0 8px 8px 0;
                                   border:none; font-size:22px; cursor:pointer;
                                   display:flex; align-items:center; justify-content:center;
                                   opacity:0; pointer-events:none;
                                   transition:opacity 0.2s;
                                   touch-action:manipulation;">🖍️</button>` : ''}

                    <div style="display:flex; align-items:flex-start; gap:6px;">
                        <span class="msg-author-tag" style="flex-shrink:0;${tagStyle}">${isMe ? (typeof t==='function'?t('me'):'Moi') : m.senderName}</span>
                        ${contentHtml}
                        ${m.senderName === '✨ IA' ? '' : `<button
                                ontouchstart="event.stopPropagation();"
                                ontouchend="event.stopPropagation(); event.preventDefault(); toggleNote('${m._id}');"
                                onclick="event.stopPropagation(); event.preventDefault();"
                                style="flex-shrink:0; font-size:18px; background:none; border:none; cursor:pointer;
                                       padding:8px 10px; margin:-8px -6px;
                                       min-width:44px; min-height:44px;
                                       display:inline-flex; align-items:center; justify-content:center;
                                       touch-action:manipulation; -webkit-tap-highlight-color:transparent;">
                            ${m.isNote ? '🚫' : '👁️'}</button>`}

                    </div>
                </div>
            </div>`;
        }).join('');

        if (forceScrollBottom || wasAtBottom) {
            if (!window._editingMessageId) {
                chat.scrollTop = chat.scrollHeight;
            } else if (window._scrollToEditBubble) {
                // En mode édition : scroller vers la bulle choisie
                setTimeout(window._scrollToEditBubble, 50);
            }
        } else { chat.scrollTop = prevPos; }
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

async function send() {
    const input = document.getElementById('msg-input'),
          gid = currentGroupId || document.getElementById('sel-group')?.value,
          did = document.getElementById('sel-dev')?.value || '',
          pid = currentPostitId || document.getElementById('sel-pos')?.value;
    if (!input?.value?.trim() || !gid || !pid) return;
    const text = input.value.trim();

    // Arrêter la dictée vocale si active
    if (_isRecording) {
        _stopSpeechRecognition();
        if (input) input.placeholder = 'Écrire un message…';
    }

    socket.emit('send-message', { groupId: gid, deviceId: did, postitId: pid, content: text, senderName: currentUser?.name || '' });
    input.value = '';
    input.style.height = '38px';
    input.style.minHeight = '38px';
    input.placeholder = 'Écrire un message…';
    input.blur();
    setTimeout(() => input.focus(), 50);
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


