// ═══════════════════════════════════════════════════════════════════════
// DELETE-CONFIRM — Confirmation par code email avant toute suppression
// Utilisé pour : supprimer un groupe, supprimer un pintalk
// ═══════════════════════════════════════════════════════════════════════

// ── Point d'entrée unique ─────────────────────────────────────────────────────
// type   : 'group' | 'postit'
// targetId   : _id MongoDB de l'objet
// targetName : nom affiché à l'utilisateur
// onSuccess  : callback() exécuté après suppression confirmée
async function requestDeleteConfirm(type, targetId, targetName, onSuccess) {
    // 1. Demander le code au serveur (qui envoie le mail)
    let devCode = null;
    try {
        const res  = await fetchAuth('/api/delete-confirm/request', {
            method: 'POST',
            body: JSON.stringify({ type, targetId, targetName })
        });
        if (!res.ok) return alert('Erreur : ' + await res.text());
        const data = await res.json();
        // En dev : le serveur renvoie le code directement
        if (data.devCode) devCode = data.devCode;
    } catch(e) {
        return alert('Erreur réseau lors de l\'envoi du code.');
    }

    // 2. Afficher la modal de saisie du code
    _showDeleteCodeModal(type, targetId, targetName, devCode, onSuccess);
}

function _showDeleteCodeModal(type, targetId, targetName, devCode, onSuccess) {
    document.getElementById('delete-confirm-modal')?.remove();

    const typeLabel = type === 'group' ? 'groupe' : 'pintalk';
    const userEmail = currentUser?.email || 'votre adresse email';

    const modal = document.createElement('div');
    modal.id = 'delete-confirm-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';

    modal.innerHTML = `
    <div style="background:white;border:3px solid #dc2626;width:100%;max-width:360px;box-shadow:6px 6px 0 rgba(0,0,0,.4);">
        <!-- Titre -->
        <div style="background:#dc2626;color:white;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;">
            <div>
                <div style="font-size:9px;font-weight:900;text-transform:uppercase;opacity:.75;">⚠️ Action irréversible</div>
                <div style="font-weight:900;font-size:14px;">Supprimer ce ${typeLabel}</div>
            </div>
            <button onclick="document.getElementById('delete-confirm-modal').remove()"
                style="background:none;border:none;color:white;font-size:22px;cursor:pointer;padding:0;opacity:.8;">✕</button>
        </div>

        <div style="padding:18px;">
            <!-- Info -->
            <div style="padding:10px;background:#fef2f2;border:2px solid #fca5a5;margin-bottom:16px;">
                <div style="font-weight:900;font-size:12px;color:#dc2626;">Suppression de "${targetName}"</div>
                <div style="font-size:10px;color:#7f1d1d;margin-top:2px;">Cette action supprimera définitivement le ${typeLabel} et tout son contenu.</div>
            </div>

            <!-- Instructions -->
            <div style="font-size:11px;margin-bottom:14px;line-height:1.5;">
                Un code de confirmation à 6 chiffres a été envoyé à<br>
                <strong>${userEmail}</strong><br>
                Saisissez-le ci-dessous pour confirmer la suppression.
                ${devCode ? `<br><span style="color:#059669;font-weight:900;">DEV — Code : ${devCode}</span>` : ''}
            </div>

            <!-- Saisie code -->
            <div style="margin-bottom:6px;font-size:8px;font-weight:900;text-transform:uppercase;opacity:.5;">Code de confirmation</div>
            <input type="text" id="delete-code-input"
                inputmode="numeric" pattern="[0-9]*" maxlength="6"
                placeholder="000000"
                style="width:100%;padding:14px;border:2px solid #dc2626;font-size:24px;font-weight:900;text-align:center;letter-spacing:8px;font-family:monospace;background:white;box-sizing:border-box;margin-bottom:4px;">
            <div id="delete-code-error" style="font-size:10px;color:#dc2626;font-weight:700;min-height:16px;margin-bottom:12px;"></div>

            <!-- Boutons -->
            <div style="display:flex;gap:8px;">
                <button onclick="document.getElementById('delete-confirm-modal').remove()"
                    style="flex:1;padding:12px;border:2px solid rgba(0,0,0,.2);background:white;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">
                    Annuler
                </button>
                <button onclick="_execDeleteWithCode('${type}','${targetId}')"
                    style="flex:2;padding:12px;background:#dc2626;color:white;border:none;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">
                    🗑️ Supprimer définitivement
                </button>
            </div>
            <div style="font-size:9px;opacity:.4;text-align:center;margin-top:10px;">Le code expire dans 10 minutes.</div>
        </div>
    </div>`;

    document.body.appendChild(modal);
    // Focus automatique sur le champ
    setTimeout(() => {
        const input = document.getElementById('delete-code-input');
        if (input) {
            input.focus();
            // Valider au Enter
            input.addEventListener('keydown', e => {
                if (e.key === 'Enter') _execDeleteWithCode(type, targetId);
            });
        }
    }, 80);

    // Stocker le callback
    window._deleteConfirmCallback = onSuccess;
}

async function _execDeleteWithCode(type, targetId) {
    const input    = document.getElementById('delete-code-input');
    const errEl    = document.getElementById('delete-code-error');
    const code     = input?.value?.trim();

    if (!code || code.length !== 6) {
        if (errEl) errEl.textContent = 'Le code doit contenir 6 chiffres.';
        input?.focus();
        return;
    }

    // Désactiver le bouton pendant la requête
    const btn = document.querySelector('#delete-confirm-modal button:last-child');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Vérification…'; }

    try {
        const res  = await fetchAuth('/api/delete-confirm/execute', {
            method: 'POST',
            body: JSON.stringify({ code, targetId, type })
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            if (errEl) errEl.textContent = data.error || 'Code incorrect.';
            if (btn) { btn.disabled = false; btn.textContent = '🗑️ Supprimer définitivement'; }
            input?.select();
            return;
        }

        // Succès
        document.getElementById('delete-confirm-modal')?.remove();

        // Exécuter le callback (rafraîchir la liste, etc.)
        if (typeof window._deleteConfirmCallback === 'function') {
            window._deleteConfirmCallback(data);
            window._deleteConfirmCallback = null;
        }

    } catch(e) {
        if (errEl) errEl.textContent = 'Erreur réseau.';
        if (btn) { btn.disabled = false; btn.textContent = '🗑️ Supprimer définitivement'; }
    }
}

// ── Archiver & vider une conversation pintalk ────────────────────────────────
// Appelé depuis la modal pintalk (onglet Danger)
async function archiveAndClearPostit(postitId, postitName) {
    if (!confirm(`Archiver la conversation "${postitName}" ?\n\nTous les messages seront sauvegardés dans les Archives puis supprimés du pintalk. Le pintalk restera intact avec ses participants.`))
        return;

    try {
        const res  = await fetchAuth(`/api/postits/${postitId}/archive-clear`, { method: 'POST' });
        if (!res.ok) return alert('Erreur : ' + await res.text());
        const data = await res.json();

        alert(`✅ ${data.msgCount} message${data.msgCount>1?'s':''} archivé${data.msgCount>1?'s':''}.\nLa conversation est maintenant vide. Retrouvez l'historique dans la page Archives.`);

        // Fermer la modal et rafraîchir la vue chat
        document.getElementById('pintalk-edit-modal')?.remove();
        document.getElementById('group-modal')?.remove();
        if (typeof refreshView === 'function') refreshView(true);

    } catch(e) {
        alert('Erreur réseau : ' + e.message);
    }
}

// ── Surcharge confirmDeletePostit ─────────────────────────────────────────────
// Remplace la version simple par la version avec code email
function confirmDeletePostit(postitId) {
    // Trouver le nom du pintalk
    const p = _cachedPostits?.find(x => x._id === postitId);
    const name = p?.name || 'ce pintalk';

    requestDeleteConfirm('postit', postitId, name, (data) => {
        // Après suppression : fermer les modals, recharger
        document.getElementById('pintalk-edit-modal')?.remove();
        document.getElementById('group-modal')?.remove();
        // Recharger le groupe
        if (typeof loadGroupData === 'function' && currentGroupId)
            loadGroupData(currentGroupId);
        if (typeof loadGroupsList === 'function')
            loadGroupsList();
    });
}

// ── Surcharge confirmDeleteGroup ──────────────────────────────────────────────
function confirmDeleteGroup(groupId) {
    // Trouver le nom du groupe dans le DOM ou le cache
    const nameEl = document.querySelector('#group-modal .font-weight-900, #group-modal [style*="font-size:14px"]');
    const name   = nameEl?.textContent?.trim() || currentGroupConfig?.name || 'ce groupe';

    requestDeleteConfirm('group', groupId, name, (data) => {
        // Après suppression : fermer la modal, retourner à la liste des groupes
        document.getElementById('group-modal')?.remove();
        if (typeof loadGroupsList === 'function') loadGroupsList();
        if (typeof goToPage === 'function' && typeof PAGE_GROUPES !== 'undefined')
            goToPage(PAGE_GROUPES);
    });
}
