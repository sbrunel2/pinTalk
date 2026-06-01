// ═══════════════════════════════════════════════════════════════════════
// ARCHIVES — Consultation, archivage et restauration des conversations
// ═══════════════════════════════════════════════════════════════════════

let lastArchGroup = "";

function fetchWithToken(url, options = {}) {
    const token = localStorage.getItem('token');
    const headers = { ...options.headers, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    return fetch(url, { ...options, headers });
}

// ── Sélecteurs en cascade ────────────────────────────────────────────────────
async function initArchiveSelectors() {
    const res    = await fetchWithToken('/api/groups');
    const groups = await res.json();
    const sel    = document.getElementById('arch-group');
    if (!sel) return;

    sel.innerHTML = '<option value="">-- Groupe --</option>' +
        groups.map(g => `<option value="${g.name}">${g.name}</option>`).join('');

    if (lastArchGroup) { sel.value = lastArchGroup; loadArchDevices(lastArchGroup); }
}

async function loadArchDevices(groupName) {
    const devSel = document.getElementById('arch-dev');
    const posSel = document.getElementById('arch-pos');
    if (!groupName) {
        devSel.innerHTML = '<option value="">-- Display --</option>';
        posSel.innerHTML = '<option value="">-- Pintalk --</option>';
        return;
    }
    lastArchGroup = groupName;
    const res     = await fetchWithToken(`/api/devices?groupName=${encodeURIComponent(groupName)}`);
    const devices = await res.json();
    if (devices.length > 0) {
        devSel.innerHTML = devices.map(d => `<option value="${d._id}">${d.name}</option>`).join('');
        loadArchPostits(devices[0]._id);
    } else {
        devSel.innerHTML = '<option value="">Aucun rayon</option>';
        posSel.innerHTML = '<option value="">-</option>';
    }
}

async function loadArchPostits(deviceId) {
    const posSel = document.getElementById('arch-pos');
    if (!deviceId) return;
    const res     = await fetchWithToken(`/api/postits?deviceId=${deviceId}`);
    const postits = await res.json();
    if (postits.length > 0) {
        // Stocker l'ID du pintalk dans un data-attribute pour la restauration
        posSel.innerHTML = postits.map(p =>
            `<option value="${p.name}" data-id="${p._id}">${p.name}</option>`
        ).join('');
        refreshArchiveView();
    } else {
        posSel.innerHTML = '<option value="">Aucun pintalk</option>';
        document.getElementById('archive-content').innerHTML = '';
    }
}

// ── Vue des archives ─────────────────────────────────────────────────────────
async function refreshArchiveView() {
    const gSel = document.getElementById('arch-group');
    const dSel = document.getElementById('arch-dev');
    const pSel = document.getElementById('arch-pos');

    const g = gSel?.value;
    const d = dSel?.options[dSel.selectedIndex]?.text;
    const p = pSel?.value;
    if (!p || p.includes('Aucun')) return;

    const res      = await fetchWithToken(`/api/archives?group=${encodeURIComponent(g)}&device=${encodeURIComponent(d)}&postit=${encodeURIComponent(p)}`);
    const archives = await res.json();
    const container = document.getElementById('archive-content');

    if (archives.length === 0) {
        container.innerHTML = '<p style="text-align:center;opacity:.3;margin-top:40px;font-size:10px;font-weight:900;text-transform:uppercase;">Aucun historique archivé.</p>';
        return;
    }

    container.innerHTML = archives.map(arch => {
        const date     = new Date(arch.archivedAt).toLocaleString('fr-FR');
        const msgCount = arch.content?.length || 0;
        const preview  = (arch.content || []).slice(0, 3).map(m =>
            `<div style="font-size:11px;margin-bottom:3px;"><b style="text-transform:uppercase;font-size:9px;">${m.author}</b> ${m.text}</div>`
        ).join('');

        return `
        <div style="margin-bottom:12px;background:white;border:2px solid rgba(0,0,0,0.1);border-left:4px solid var(--accent);">
            <!-- En-tête archive -->
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid rgba(0,0,0,0.07);">
                <div>
                    <div style="font-size:9px;font-weight:900;text-transform:uppercase;opacity:.4;">📦 ${date}</div>
                    <div style="font-size:10px;font-weight:700;opacity:.6;">${msgCount} message${msgCount>1?'s':''}</div>
                </div>
                <button onclick="uiRestoreArchive('${arch._id}')"
                    style="padding:6px 12px;background:var(--accent);color:white;border:none;font-size:9px;font-weight:900;text-transform:uppercase;cursor:pointer;">
                    ↩ Restaurer
                </button>
            </div>
            <!-- Aperçu -->
            <div style="padding:10px 12px;opacity:.7;">
                ${preview}
                ${msgCount > 3 ? `<div style="font-size:9px;opacity:.4;margin-top:4px;">… et ${msgCount-3} autre${msgCount-3>1?'s':''} message${msgCount-3>1?'s':''}</div>` : ''}
            </div>
        </div>`;
    }).join('');
}

// ── Archive manuelle depuis le chat (bouton "Sauvegarder") ───────────────────
async function backupCurrentPostit() {
    const g = document.getElementById('sel-group');
    const d = document.getElementById('sel-dev');
    const p = document.getElementById('sel-pos');
    if (!p || !p.value) return alert("Sélectionnez un pintalk dans l'onglet Chat d'abord.");

    const msgBlocks = document.querySelectorAll('#chat-history .msg-row');
    const messages  = Array.from(msgBlocks).map(block => {
        const authorTag   = block.querySelector('.msg-author-tag');
        const contentSpan = block.querySelector('.msg-bubble span');
        return {
            author: authorTag?.innerText || 'Inconnu',
            text  : contentSpan?.innerText || '',
        };
    }).filter(m => m.text !== '');

    if (!messages.length) return alert('Rien à sauvegarder.');

    const grpName = currentGroupConfig?.name || g?.options[g.selectedIndex]?.text || '';
    const devName = d?.options[d.selectedIndex]?.text || '';
    const posName = p?.options[p.selectedIndex]?.text || '';

    const res = await fetchWithToken('/api/archives/backup', {
        method: 'POST',
        body: JSON.stringify({ groupName: grpName, deviceName: devName, postitName: posName, content: messages, adminId: currentUser?._id || '' })
    });
    if (res.ok) alert('✅ Archive réussie !');
}

// ── Restaurer une archive ────────────────────────────────────────────────────
async function uiRestoreArchive(archiveId) {
    // 1. Charger la liste des pintalk disponibles dans le groupe sélectionné
    const gSel  = document.getElementById('arch-group');
    const dSel  = document.getElementById('arch-dev');
    const pSel  = document.getElementById('arch-pos');
    const gName = gSel?.value;

    if (!gName) return alert('Sélectionnez un groupe d\'abord.');

    // Récupérer tous les pintalk du groupe pour proposer une destination
    const resGroups = await fetchWithToken('/api/groups');
    const groups    = await resGroups.json();
    const group     = groups.find(g => g.name === gName);
    if (!group) return alert('Groupe introuvable.');

    const resDev  = await fetchWithToken(`/api/devices?groupName=${encodeURIComponent(gName)}`);
    const devices = await resDev.json();
    if (!devices.length) return alert('Aucun rayon dans ce groupe.');

    // Charger tous les pintalk de tous les rayons
    let allPostits = [];
    for (const dev of devices) {
        const resP   = await fetchWithToken(`/api/postits?deviceId=${dev._id}`);
        const postits = await resP.json();
        allPostits.push(...postits.map(p => ({ ...p, deviceName: dev.name })));
    }

    // Filtrer : seulement les pintalk OUVERTS (pas terminés/annulés)
    const CLOSED = ['terminée', 'annulée', 'Terminé', 'Annulé'];
    const openPostits = allPostits.filter(p => !CLOSED.includes(p.status));

    // Afficher la modal de choix
    _showRestoreModal(archiveId, openPostits);
}

function _showRestoreModal(archiveId, openPostits) {
    document.getElementById('restore-modal')?.remove();

    const canCreateNew = openPostits.length < 4;
    const postitOptions = openPostits.map(p =>
        `<label style="display:flex;align-items:center;gap:8px;padding:8px;border:2px solid rgba(0,0,0,.1);margin-bottom:5px;cursor:pointer;background:white;">
            <input type="radio" name="restore-target" value="${p._id}" style="flex-shrink:0;">
            <div>
                <div style="font-weight:900;font-size:12px;">${p.name}</div>
                <div style="font-size:9px;opacity:.5;">${p.deviceName} · ${p.status || 'actif'}</div>
            </div>
        </label>`
    ).join('');

    const modal = document.createElement('div');
    modal.id = 'restore-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px;';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    modal.innerHTML = `
    <div style="background:var(--bg,#efeee9);border:3px solid var(--accent);width:100%;max-width:380px;max-height:85vh;overflow-y:auto;box-shadow:6px 6px 0 rgba(0,0,0,.3);">
        <div style="padding:14px 16px;border-bottom:2px solid var(--accent);display:flex;align-items:center;justify-content:space-between;">
            <div style="font-weight:900;font-size:13px;text-transform:uppercase;">↩ Restaurer l'archive</div>
            <button onclick="document.getElementById('restore-modal').remove()"
                style="background:none;border:none;font-size:20px;cursor:pointer;padding:0;">✕</button>
        </div>
        <div style="padding:16px;">
            ${canCreateNew ? `
            <!-- Option 1 : nouveau pintalk -->
            <div style="margin-bottom:14px;padding:10px;border:2px solid var(--accent);background:rgba(0,0,0,.03);">
                <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;">
                    <input type="radio" name="restore-target" value="__new__" checked style="flex-shrink:0;margin-top:3px;">
                    <div>
                        <div style="font-weight:900;font-size:12px;">✨ Créer un nouveau pintalk</div>
                        <div style="font-size:9px;opacity:.5;">La conversation sera restaurée dans un pintalk vide.</div>
                        <div style="margin-top:6px;">
                            <input type="text" id="restore-new-name" placeholder="Nom du pintalk…"
                                style="width:100%;padding:7px;border:2px solid var(--accent);font-size:12px;background:white;box-sizing:border-box;">
                        </div>
                    </div>
                </label>
            </div>
            <div style="font-size:9px;font-weight:900;text-transform:uppercase;opacity:.4;margin-bottom:8px;">— ou restaurer dans un pintalk existant —</div>
            ` : `
            <div style="padding:10px;background:#fef3c7;border:2px solid #f59e0b;margin-bottom:12px;font-size:11px;font-weight:700;">
                ⚠️ Vous avez déjà 4 pintalk ouverts. Choisissez dans lequel restaurer.
            </div>
            `}

            <!-- Option 2 : pintalk existant -->
            ${postitOptions || '<div style="opacity:.4;font-size:11px;">Aucun pintalk disponible.</div>'}

            <div style="display:flex;gap:8px;margin-top:16px;">
                <button onclick="document.getElementById('restore-modal').remove()"
                    style="flex:1;padding:11px;border:2px solid rgba(0,0,0,.2);background:white;font-weight:900;font-size:11px;cursor:pointer;">Annuler</button>
                <button onclick="execRestore('${archiveId}')"
                    style="flex:2;padding:11px;background:var(--accent);color:white;border:none;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">Restaurer</button>
            </div>
        </div>
    </div>`;

    document.body.appendChild(modal);
}

async function execRestore(archiveId) {
    const selected = document.querySelector('input[name="restore-target"]:checked');
    if (!selected) return alert('Choisissez une destination.');

    const targetValue = selected.value;

    if (targetValue === '__new__') {
        // Créer un nouveau pintalk d'abord
        const name = document.getElementById('restore-new-name')?.value?.trim();
        if (!name) return alert('Donnez un nom au nouveau pintalk.');

        // Récupérer le deviceId courant (premier rayon du groupe)
        const gName   = document.getElementById('arch-group')?.value;
        const resDev  = await fetchWithToken(`/api/devices?groupName=${encodeURIComponent(gName)}`);
        const devices = await resDev.json();
        if (!devices.length) return alert('Aucun rayon disponible.');

        const deviceId = devices[0]._id;

        // Créer le pintalk
        const resCreate = await fetchWithToken('/api/postits', {
            method: 'POST',
            body: JSON.stringify({ name, deviceId })
        });
        if (!resCreate.ok) return alert('Erreur création pintalk : ' + await resCreate.text());
        const newPostit = await resCreate.json();

        // Restaurer dans le nouveau pintalk
        await _doRestore(archiveId, newPostit._id);

    } else {
        // Restaurer dans le pintalk existant
        if (!confirm('La conversation sera ajoutée à la suite du contenu existant. Continuer ?')) return;
        await _doRestore(archiveId, targetValue);
    }
}

async function _doRestore(archiveId, targetPostitId) {
    const res = await fetchWithToken(`/api/archives/${archiveId}/restore`, {
        method: 'POST',
        body: JSON.stringify({ targetPostitId })
    });

    if (!res.ok) {
        const err = await res.text();
        return alert('Erreur restauration : ' + err);
    }
    const data = await res.json();
    document.getElementById('restore-modal')?.remove();
    alert(`✅ ${data.msgCount} message${data.msgCount>1?'s':''} restauré${data.msgCount>1?'s':''}.\nOuvrez le pintalk dans l'onglet Chat pour le consulter.`);
    refreshArchiveView();
}
