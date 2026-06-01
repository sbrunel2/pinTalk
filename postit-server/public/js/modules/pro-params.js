// ═══════════════════════════════════════════════════════════════════════
// ONGLETS PAGE PARAMÈTRES
// ═══════════════════════════════════════════════════════════════════════

let _currentParamsTab = 'profil';

function switchParamsTab(tabId, btn) {
    // Masquer tous les panneaux de p1
    document.querySelectorAll('#p1 .tab-panel').forEach(p => {
        p.classList.remove('active');
        // Forcer display:none pour les panneaux inactifs
        // (le CSS flex sur .active est géré par #p1 .tab-panel.active)
    });
    // Désactiver tous les boutons de p1
    document.querySelectorAll('#params-tabs-bar .tab-btn').forEach(b => b.classList.remove('active'));

    // Afficher le panneau cible
    const panel = document.getElementById('params-panel-' + tabId);
    if (panel) {
        panel.classList.add('active');
        panel.scrollTop = 0;  // remonter en haut à chaque changement d'onglet
    }

    // Activer le bouton
    if (btn) btn.classList.add('active');

    _currentParamsTab = tabId;

    // Centrer le bouton dans la barre d'onglets UNIQUEMENT
    // NE PAS utiliser scrollIntoView : il remonte jusqu'à #viewport et décale toutes les pages
    if (btn) {
        const bar = document.getElementById('params-tabs-bar');
        if (bar) {
            const btnLeft   = btn.offsetLeft;
            const btnWidth  = btn.offsetWidth;
            const barWidth  = bar.offsetWidth;
            const scrollTarget = btnLeft - (barWidth / 2) + (btnWidth / 2);
            bar.scrollTo({ left: scrollTarget, behavior: 'smooth' });
        }
    }

    // Déclencher les initialisations si besoin
    if (tabId === 'dict'       && typeof loadAiDictionaryUI === 'function') loadAiDictionaryUI();
    if (tabId === 'appearance' && typeof initSkin           === 'function') initSkin();
    if (tabId === 'pro'        && typeof _gmLoadRoles       !== 'undefined') {
        // Pré-charger si groupe pro déjà sélectionné
        if (_proParamsGroupId) {
            _proLoadMembers();
            _proLoadRoles();
        }
    }
}

// Afficher/masquer l'onglet Groupe Pro selon le groupe actif
function _updateProTab(show) {
    const btn   = document.getElementById('params-tab-pro-btn');
    const panel = document.getElementById('params-panel-pro');
    if (btn) btn.style.display = show ? '' : 'none';
    // Si on masque et qu'on est dessus → revenir à Profil
    if (!show && _currentParamsTab === 'pro') {
        const profilBtn = document.querySelector('.params-tab-btn');
        switchParamsTab('profil', profilBtn);
    }
}

// ── Switcher d'onglets générique pour les modals ─────────────────────────────
// Utilisé dans : modal pintalk, modal pro-queue, etc.
function switchModalTab(modalId, tabId, btn) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    // Masquer tous les tab-panel de cette modal
    modal.querySelectorAll('.tab-panel.modal-tabs').forEach(p => p.classList.remove('active'));
    // Désactiver tous les boutons de cette modal
    modal.querySelectorAll('.tabs-bar.modal-tabs .tab-btn, .tabs-bar[id$="-tabs"] .tab-btn')
         .forEach(b => b.classList.remove('active'));
    // Activer le panneau cible
    const panel = modal.querySelector('#' + modalId + '-tab-' + tabId);
    if (panel) panel.classList.add('active');
    // Activer le bouton
    if (btn) btn.classList.add('active');
}

// ═══════════════════════════════════════════════════════════════════════
// PRO-PARAMS — Paramètres du groupe professionnel
// Visible uniquement pour owner (et admin) sur la page Paramètres
// ═══════════════════════════════════════════════════════════════════════

// ── Constantes droits (miroir de helpers/permissions.js) ──────────────────────
const PRO_DROITS = [
    { id: 'creer_commande',       label: 'Créer des commandes',            desc: 'Peut créer des pintalk (commandes) pour des clients' },
    { id: 'modifier_produit_coche', label: 'Modifier produits cochés',     desc: 'Peut modifier/supprimer un produit déjà coché en préparation' },
    { id: 'ticket_caisse',        label: 'Ticket de caisse',               desc: 'Peut déclarer une commande "Ticket de caisse prêt"' },
    { id: 'gerer_membres',        label: 'Gérer les membres',              desc: 'Peut ajouter des clients et gérer les membres' },
    { id: 'voir_brouillons',      label: 'Voir les brouillons',            desc: 'Peut voir les commandes en statut brouillon' },
    { id: 'ajouter_client',       label: 'Inviter des clients',            desc: 'Peut inviter un client dans le groupe' },
];

// ── État local ────────────────────────────────────────────────────────────────
let _proParamsGroupId = null;
let _proParamsMembers = [];   // liste des membres chargés
let _proParamsRoles   = [];   // liste des rôles chargés

// ── Point d'entrée : appelé depuis loadProfile() quand groupe pro sélectionné ─
async function loadProGroupParams() {
    const cfg    = currentGroupConfig;
    const myRole = cfg?.myRole || '';
    if (!cfg?.isPro || (myRole !== 'owner' && !cfg?.myDroits?.includes('gerer_membres'))) {
        _hideProParams();
        return;
    }

    _proParamsGroupId = cfg._id;
    _updateProTab(true);
    // Afficher le nom du groupe dans l'en-tête
    const nameEl = document.getElementById('pro-group-name');
    if (nameEl) nameEl.textContent = cfg.name || 'Groupe Pro';
    // Si on vient d'ouvrir les params depuis un groupe pro → basculer sur l'onglet pro
    if (_currentParamsTab !== 'pro') {
        const proBtn = document.getElementById('params-tab-pro-btn');
        switchParamsTab('pro', proBtn);
    }
    await Promise.all([_proLoadMembers(), _proLoadRoles()]);
    _proRenderAll();
}

// _showProParams/_hideProParams remplacées par _updateProTab()

// ── Chargement des membres ────────────────────────────────────────────────────
async function _proLoadMembers() {
    try {
        const res = await fetchAuth(`/api/groups/${_proParamsGroupId}/members`);
        if (!res.ok) return;
        _proParamsMembers = await res.json();
    } catch(e) { console.error('[pro-params] membres:', e); }
}

// ── Chargement des rôles ──────────────────────────────────────────────────────
async function _proLoadRoles() {
    try {
        const res = await fetchAuth(`/api/groups/${_proParamsGroupId}/members/roles`);
        if (!res.ok) return;
        _proParamsRoles = await res.json();
    } catch(e) { console.error('[pro-params] rôles:', e); }
}

// ── Rendu complet ─────────────────────────────────────────────────────────────
function _proRenderAll() {
    _proRenderEmployes();
    _proRenderClients();
    _proRenderRoles();
}

// ── Rendu liste employés ──────────────────────────────────────────────────────
function _proRenderEmployes() {
    const box = document.getElementById('pro-employes-list');
    if (!box) return;

    const employes = _proParamsMembers.filter(m => m.type === 'employe');

    if (!employes.length) {
        box.innerHTML = `<div style="font-size:11px;opacity:.4;font-weight:700;padding:8px 0;">Aucun employé pour l'instant.</div>`;
        return;
    }

    box.innerHTML = employes.map(m => {
        const roleNames = (m.roles || [])
            .map(r => _proParamsRoles.find(x => x._id === (r._id || r))?.name || '')
            .filter(Boolean).join(', ') || '<span style="opacity:.4">Aucun rôle</span>';

        // Calcul droits effectifs cumulés
        const effectiveDroits = new Set();
        (m.roles || []).forEach(r => {
            const roleDoc = _proParamsRoles.find(x => x._id === (r._id || r));
            (roleDoc?.droits || []).forEach(d => effectiveDroits.add(d));
        });
        const droitsLabels = [...effectiveDroits]
            .map(d => PRO_DROITS.find(x => x.id === d)?.label || d)
            .join(' · ') || 'Aucun droit';

        return `
        <div style="border:2px solid rgba(0,0,0,0.1);margin-bottom:8px;background:white;">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;gap:8px;">
                <div style="min-width:0;flex:1;">
                    <div style="font-weight:900;font-size:12px;word-break:break-all;">${m.email}</div>
                    <div style="font-size:9px;opacity:.5;font-weight:700;margin-top:2px;">Rôles : ${roleNames}</div>
                    <div style="font-size:9px;color:#0d9488;font-weight:700;margin-top:2px;">${droitsLabels}</div>
                </div>
                <div style="display:flex;gap:6px;flex-shrink:0;">
                    <button onclick="_proEditEmploye('${m.email}')"
                        style="padding:6px 10px;border:2px solid var(--accent);background:white;font-size:10px;font-weight:900;text-transform:uppercase;cursor:pointer;">
                        Droits
                    </button>
                    <button onclick="_proRemoveMember('${m.email}', 'employé')"
                        style="padding:6px 10px;border:2px solid #dc2626;color:#dc2626;background:white;font-size:10px;font-weight:900;cursor:pointer;">
                        ✕
                    </button>
                </div>
            </div>
        </div>`;
    }).join('');
}

// ── Rendu liste clients ───────────────────────────────────────────────────────
function _proRenderClients() {
    const box = document.getElementById('pro-clients-list');
    if (!box) return;

    const clients = _proParamsMembers.filter(m => m.type === 'client');

    if (!clients.length) {
        box.innerHTML = `<div style="font-size:11px;opacity:.4;font-weight:700;padding:8px 0;">Aucun client pour l'instant.</div>`;
        return;
    }

    box.innerHTML = clients.map(m => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(0,0,0,0.06);">
            <div style="font-size:12px;font-weight:700;word-break:break-all;flex:1;">${m.email}</div>
            <button onclick="_proRemoveMember('${m.email}', 'client')"
                style="padding:4px 8px;border:1px solid #dc2626;color:#dc2626;background:white;font-size:10px;font-weight:900;cursor:pointer;flex-shrink:0;margin-left:8px;">
                ✕
            </button>
        </div>`).join('');
}

// ── Rendu liste rôles ─────────────────────────────────────────────────────────
function _proRenderRoles() {
    const box = document.getElementById('pro-roles-list');
    if (!box) return;

    if (!_proParamsRoles.length) {
        box.innerHTML = `<div style="font-size:11px;opacity:.4;font-weight:700;padding:8px 0;">Aucun rôle défini.</div>`;
        return;
    }

    box.innerHTML = _proParamsRoles.map(role => {
        const droitsLabels = (role.droits || [])
            .map(d => PRO_DROITS.find(x => x.id === d)?.label || d).join(', ') || 'Aucun droit';
        return `
        <div style="border:2px solid rgba(0,0,0,0.1);margin-bottom:6px;background:white;padding:10px 12px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:900;font-size:12px;">${role.name}${role.isDefault ? ' <span style="font-size:9px;background:#f59e0b;color:white;padding:1px 5px;font-weight:900;">DÉFAUT</span>' : ''}</div>
                    <div style="font-size:9px;opacity:.5;margin-top:2px;">${droitsLabels}</div>
                </div>
                <div style="display:flex;gap:6px;flex-shrink:0;">
                    <button onclick="_proEditRole('${role._id}')"
                        style="padding:5px 8px;border:2px solid var(--accent);background:white;font-size:10px;font-weight:900;cursor:pointer;">
                        ✏️
                    </button>
                    <button onclick="_proDeleteRole('${role._id}', '${role.name}')"
                        style="padding:5px 8px;border:2px solid #dc2626;color:#dc2626;background:white;font-size:10px;font-weight:900;cursor:pointer;">
                        ✕
                    </button>
                </div>
            </div>
        </div>`;
    }).join('');
}

// ── Modal : éditer les rôles d'un employé ────────────────────────────────────
function _proEditEmploye(email) {
    const member  = _proParamsMembers.find(m => m.email === email);
    if (!member) return;

    const currentRoleIds = (member.roles || []).map(r => r._id || r);

    const existing = document.getElementById('pro-employe-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'pro-employe-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px;';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    const rolesCheckboxes = _proParamsRoles.map(role => {
        const checked = currentRoleIds.includes(String(role._id));
        return `
        <label style="display:flex;align-items:flex-start;gap:8px;padding:8px;border:2px solid ${checked ? 'var(--accent)' : 'rgba(0,0,0,.12)'};margin-bottom:6px;cursor:pointer;background:${checked ? 'rgba(0,0,0,.04)' : 'white'};">
            <input type="checkbox" value="${role._id}" ${checked ? 'checked' : ''}
                style="width:16px;height:16px;flex-shrink:0;margin-top:1px;"
                onchange="this.closest('label').style.borderColor=this.checked?'var(--accent)':'rgba(0,0,0,.12)';this.closest('label').style.background=this.checked?'rgba(0,0,0,.04)':'white'">
            <div>
                <div style="font-weight:900;font-size:12px;">${role.name}</div>
                <div style="font-size:9px;opacity:.5;">${(role.droits||[]).map(d=>PRO_DROITS.find(x=>x.id===d)?.label||d).join(' · ')||'Aucun droit'}</div>
            </div>
        </label>`;
    }).join('');

    modal.innerHTML = `
    <div style="background:var(--bg,#efeee9);border:3px solid var(--accent);width:100%;max-width:400px;max-height:90vh;overflow-y:auto;box-shadow:6px 6px 0 rgba(0,0,0,.3);">
        <div style="padding:14px 16px;border-bottom:2px solid var(--accent);display:flex;align-items:center;justify-content:space-between;">
            <div>
                <div style="font-size:10px;font-weight:900;text-transform:uppercase;opacity:.5;">Droits de l'employé</div>
                <div style="font-weight:900;font-size:13px;word-break:break-all;">${email}</div>
            </div>
            <button onclick="document.getElementById('pro-employe-modal').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;padding:0;">✕</button>
        </div>
        <div style="padding:16px;">
            <div style="font-size:9px;font-weight:900;text-transform:uppercase;opacity:.5;margin-bottom:8px;">Rôles attribués</div>
            ${rolesCheckboxes || '<div style="opacity:.4;font-size:11px;">Aucun rôle disponible — créez d\'abord des rôles ci-dessous.</div>'}
            <div style="display:flex;gap:8px;margin-top:16px;">
                <button onclick="_proSaveEmployeRoles('${email}')"
                    style="flex:1;padding:12px;background:var(--accent);color:white;border:none;font-weight:900;font-size:12px;text-transform:uppercase;cursor:pointer;">
                    Enregistrer
                </button>
                <button onclick="document.getElementById('pro-employe-modal').remove()"
                    style="padding:12px 16px;border:2px solid rgba(0,0,0,.2);background:white;font-weight:900;font-size:12px;cursor:pointer;">
                    Annuler
                </button>
            </div>
        </div>
    </div>`;

    document.body.appendChild(modal);
}

async function _proSaveEmployeRoles(email) {
    const modal = document.getElementById('pro-employe-modal');
    if (!modal) return;

    const checked = [...modal.querySelectorAll('input[type=checkbox]:checked')].map(cb => cb.value);

    try {
        const res = await fetchAuth(`/api/groups/${_proParamsGroupId}/members/${encodeURIComponent(email)}`, {
            method: 'PUT',
            body: JSON.stringify({ roles: checked })
        });
        if (!res.ok) return alert('Erreur : ' + await res.text());
        modal.remove();
        await _proLoadMembers();
        _proRenderEmployes();
    } catch(e) { alert('Erreur réseau'); }
}

// ── Modal : créer / éditer un rôle ───────────────────────────────────────────
function _proCreateRole() {
    _proOpenRoleModal(null);
}

function _proEditRole(roleId) {
    const role = _proParamsRoles.find(r => r._id === roleId);
    _proOpenRoleModal(role || null);
}

function _proOpenRoleModal(role) {
    const existing = document.getElementById('pro-role-modal');
    if (existing) existing.remove();

    const isEdit = !!role;
    const currentDroits = role?.droits || [];

    const droitsCheckboxes = PRO_DROITS.map(d => {
        const checked = currentDroits.includes(d.id);
        return `
        <label style="display:flex;align-items:flex-start;gap:8px;padding:8px;border:2px solid ${checked ? 'var(--accent)' : 'rgba(0,0,0,.12)'};margin-bottom:6px;cursor:pointer;background:${checked ? 'rgba(0,0,0,.04)' : 'white'};">
            <input type="checkbox" value="${d.id}" ${checked ? 'checked' : ''}
                style="width:16px;height:16px;flex-shrink:0;margin-top:1px;"
                onchange="this.closest('label').style.borderColor=this.checked?'var(--accent)':'rgba(0,0,0,.12)';this.closest('label').style.background=this.checked?'rgba(0,0,0,.04)':'white'">
            <div>
                <div style="font-weight:900;font-size:12px;">${d.label}</div>
                <div style="font-size:9px;opacity:.5;">${d.desc}</div>
            </div>
        </label>`;
    }).join('');

    const modal = document.createElement('div');
    modal.id = 'pro-role-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px;';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    modal.innerHTML = `
    <div style="background:var(--bg,#efeee9);border:3px solid var(--accent);width:100%;max-width:420px;max-height:90vh;overflow-y:auto;box-shadow:6px 6px 0 rgba(0,0,0,.3);">
        <div style="padding:14px 16px;border-bottom:2px solid var(--accent);display:flex;align-items:center;justify-content:space-between;">
            <div style="font-weight:900;font-size:13px;text-transform:uppercase;">${isEdit ? 'Modifier le rôle' : 'Nouveau rôle'}</div>
            <button onclick="document.getElementById('pro-role-modal').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;padding:0;">✕</button>
        </div>
        <div style="padding:16px;">
            <div style="margin-bottom:12px;">
                <div style="font-size:8px;font-weight:900;text-transform:uppercase;opacity:.5;margin-bottom:4px;">Nom du rôle</div>
                <input type="text" id="pro-role-name" value="${role?.name || ''}" placeholder="Ex : Préparateur, Caisse..."
                    style="width:100%;padding:10px;border:2px solid var(--accent);font-size:13px;font-weight:700;background:white;box-sizing:border-box;">
            </div>
            <div style="font-size:8px;font-weight:900;text-transform:uppercase;opacity:.5;margin-bottom:8px;">Droits accordés</div>
            ${droitsCheckboxes}
            <div style="display:flex;gap:8px;margin-top:16px;">
                <button onclick="_proSaveRole('${role?._id || ''}')"
                    style="flex:1;padding:12px;background:var(--accent);color:white;border:none;font-weight:900;font-size:12px;text-transform:uppercase;cursor:pointer;">
                    ${isEdit ? 'Enregistrer' : 'Créer le rôle'}
                </button>
                <button onclick="document.getElementById('pro-role-modal').remove()"
                    style="padding:12px 16px;border:2px solid rgba(0,0,0,.2);background:white;font-weight:900;font-size:12px;cursor:pointer;">
                    Annuler
                </button>
            </div>
        </div>
    </div>`;

    document.body.appendChild(modal);
    setTimeout(() => document.getElementById('pro-role-name')?.focus(), 100);
}

async function _proSaveRole(roleId) {
    const name = document.getElementById('pro-role-name')?.value?.trim();
    if (!name) return alert('Le nom du rôle est obligatoire.');

    const modal   = document.getElementById('pro-role-modal');
    const droits  = modal ? [...modal.querySelectorAll('input[type=checkbox]:checked')].map(cb => cb.value) : [];
    const isEdit  = !!roleId;
    const url     = isEdit
        ? `/api/groups/${_proParamsGroupId}/members/roles/${roleId}`
        : `/api/groups/${_proParamsGroupId}/members/roles`;

    try {
        const res = await fetchAuth(url, {
            method: isEdit ? 'PUT' : 'POST',
            body: JSON.stringify({ name, droits })
        });
        if (!res.ok) return alert('Erreur : ' + await res.text());
        modal?.remove();
        await _proLoadRoles();
        _proRenderRoles();
        _proRenderEmployes(); // mettre à jour les droits affichés
    } catch(e) { alert('Erreur réseau'); }
}

async function _proDeleteRole(roleId, name) {
    if (!confirm(`Supprimer le rôle "${name}" ?\nLes employés ayant ce rôle le perdront.`)) return;
    try {
        const res = await fetchAuth(`/api/groups/${_proParamsGroupId}/members/roles/${roleId}`, { method: 'DELETE' });
        if (!res.ok) return alert('Erreur : ' + await res.text());
        await Promise.all([_proLoadRoles(), _proLoadMembers()]);
        _proRenderAll();
    } catch(e) { alert('Erreur réseau'); }
}

// ── Retirer un membre ─────────────────────────────────────────────────────────
async function _proRemoveMember(email, typeLabel) {
    if (!confirm(`Retirer ${typeLabel} "${email}" du groupe ?`)) return;
    try {
        const res = await fetchAuth(`/api/groups/${_proParamsGroupId}/members/${encodeURIComponent(email)}`, { method: 'DELETE' });
        if (!res.ok) return alert('Erreur : ' + await res.text());
        await _proLoadMembers();
        _proRenderEmployes();
        _proRenderClients();
    } catch(e) { alert('Erreur réseau'); }
}

// ── Inviter un employé ────────────────────────────────────────────────────────
async function proInviteEmploye() {
    const emailEl = document.getElementById('pro-invite-employe-email');
    const email   = emailEl?.value?.trim();
    if (!email || !email.includes('@')) return alert('Email invalide.');

    try {
        const res = await fetchAuth(`/api/groups/${_proParamsGroupId}/members`, {
            method: 'POST',
            body: JSON.stringify({ email, type: 'employe' })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return alert(data.message || 'Erreur : ' + res.status);

        if (data.invited) {
            alert(`✅ Invitation envoyée à ${email}\nIl recevra un email pour rejoindre le groupe.`);
        } else {
            alert(`✅ ${email} a été ajouté comme employé.`);
        }
        if (emailEl) emailEl.value = '';
        await _proLoadMembers();
        _proRenderEmployes();
    } catch(e) { alert('Erreur réseau'); }
}

// ── Inviter un client ─────────────────────────────────────────────────────────
async function proInviteClient() {
    const emailEl = document.getElementById('pro-invite-client-email');
    const email   = emailEl?.value?.trim();
    if (!email || !email.includes('@')) return alert('Email invalide.');

    try {
        const res = await fetchAuth(`/api/groups/${_proParamsGroupId}/members`, {
            method: 'POST',
            body: JSON.stringify({ email, type: 'client' })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return alert(data.message || 'Erreur : ' + res.status);

        if (data.invited) {
            alert(`✅ Invitation envoyée à ${email}\nIl recevra un email pour rejoindre le groupe.`);
        } else {
            alert(`✅ ${email} a été ajouté comme client.`);
        }
        if (emailEl) emailEl.value = '';
        await _proLoadMembers();
        _proRenderClients();
    } catch(e) { alert('Erreur réseau'); }
}

// ── QR Code client ────────────────────────────────────────────────────────────
function proShowQrCode() {
    const cfg     = currentGroupConfig;
    const joinCode = cfg?.joinCode;
    if (!joinCode) return alert('Code de ralliement non disponible.');

    const appUrl  = window.location.origin;
    const joinUrl = `${appUrl}/?joinCode=${joinCode}`;

    const existing = document.getElementById('pro-qr-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'pro-qr-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9000;display:flex;align-items:center;justify-content:center;padding:24px;';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    modal.innerHTML = `
    <div style="background:white;border:3px solid var(--accent);padding:24px;width:100%;max-width:340px;text-align:center;box-shadow:6px 6px 0 rgba(0,0,0,.3);">
        <div style="font-weight:900;font-size:11px;text-transform:uppercase;opacity:.5;margin-bottom:4px;">QR Code client</div>
        <div style="font-weight:900;font-size:14px;margin-bottom:16px;">${cfg?.name || 'Groupe'}</div>
        <div id="pro-qr-canvas" style="display:flex;justify-content:center;margin-bottom:16px;"></div>
        <div style="font-size:10px;font-weight:900;opacity:.5;word-break:break-all;margin-bottom:16px;">${joinUrl}</div>
        <div style="font-size:9px;opacity:.4;margin-bottom:16px;">Code : <strong>${joinCode}</strong></div>
        <div style="display:flex;gap:8px;">
            <button onclick="_proCopyJoinUrl('${joinUrl}')"
                style="flex:1;padding:10px;border:2px solid var(--accent);background:white;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">
                📋 Copier lien
            </button>
            <button onclick="document.getElementById('pro-qr-modal').remove()"
                style="padding:10px 14px;border:2px solid rgba(0,0,0,.2);background:white;font-weight:900;font-size:11px;cursor:pointer;">
                Fermer
            </button>
        </div>
    </div>`;

    document.body.appendChild(modal);

    // Générer le QR code via API publique (pas de dépendance externe)
    const canvas = document.getElementById('pro-qr-canvas');
    const img    = document.createElement('img');
    img.src      = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(joinUrl)}&bgcolor=ffffff&color=18181b&margin=10`;
    img.width    = 200;
    img.height   = 200;
    img.alt      = 'QR Code';
    img.style.cssText = 'image-rendering:pixelated;border:2px solid #18181b;';
    canvas.appendChild(img);
}

function _proCopyJoinUrl(url) {
    navigator.clipboard?.writeText(url).then(() => {
        alert('✅ Lien copié dans le presse-papiers !');
    }).catch(() => {
        // Fallback pour les navigateurs sans clipboard API
        const ta = document.createElement('textarea');
        ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        alert('✅ Lien copié !');
    });
}

// ── Hook dans loadProfile ─────────────────────────────────────────────────────
// Surcharger loadProfile pour appeler loadProGroupParams si groupe pro sélectionné
const _originalLoadProfile = typeof loadProfile === 'function' ? loadProfile : null;
async function loadProfile() {
    if (_originalLoadProfile) await _originalLoadProfile();
    // Charger les params pro si un groupe pro est sélectionné
    if (currentGroupConfig?.isPro) {
        await loadProGroupParams();
    } else {
        _hideProParams();
    }
}
