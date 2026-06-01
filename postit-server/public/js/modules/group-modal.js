// ═══════════════════════════════════════════════════════════════════════
// GROUP-MODAL — Modal paramètres groupe avec onglets
// Remplace _openGroupEditModal et _openGroupMemberModal de app.js
// ═══════════════════════════════════════════════════════════════════════

// ── Modal propriétaire / admin ────────────────────────────────────────────────
function _openGroupEditModal(groupId, g) {
    document.getElementById('group-modal')?.remove();

    const isPro   = g.isPro || false;
    const isOwner = g.myRole === 'owner';
    const v       = (f, def='') => g[f] || def;

    const modal = document.createElement('div');
    modal.id = 'group-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9998;display:flex;align-items:flex-start;justify-content:center;padding:14px;overflow-y:auto;';

    modal.innerHTML = `
    <div style="background:var(--bg);border:3px solid var(--accent);box-shadow:6px 6px 0 rgba(0,0,0,0.4);width:100%;max-width:420px;margin-top:18px;overflow:hidden;">

        <!-- Titre -->
        <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:2px solid var(--accent);">
            <div>
                <div style="font-size:9px;font-weight:900;text-transform:uppercase;opacity:.5;">${isPro ? '🏪 Groupe Pro' : '👥 Groupe'}</div>
                <div style="font-size:14px;font-weight:900;">${v('name','Groupe')}</div>
            </div>
            <button onclick="document.getElementById('group-modal').remove()"
                style="background:none;border:none;font-size:22px;cursor:pointer;padding:0;opacity:.6;">✕</button>
        </div>

        <!-- Barre d'onglets -->
        <div class="tabs-bar" id="group-modal-tabs">
            <button class="tab-btn active" onclick="switchModalTab('group-modal','infos',this)">
                ${isPro ? '🏪 Infos' : '⚙️ Infos'}
            </button>
            <button class="tab-btn" onclick="switchModalTab('group-modal','look',this)">🎨 Tuile</button>
            ${isPro ? `<button class="tab-btn" onclick="switchModalTab('group-modal','employes',this);_gmLoadEmployes('${groupId}')">👷 Employés</button>` : ''}
            <button class="tab-btn" onclick="switchModalTab('group-modal','members',this);loadMembersMatrix('${groupId}',${isPro})">👥 ${isPro ? 'Clients' : 'Membres'}</button>
            ${isPro ? `<button class="tab-btn" onclick="switchModalTab('group-modal','roles',this);_gmLoadRoles('${groupId}')">🎭 Rôles</button>` : ''}
            ${isOwner ? `<button class="tab-btn" onclick="switchModalTab('group-modal','danger',this)" style="color:rgba(220,38,38,.7);">⚠️</button>` : ''}
        </div>

        <!-- ── Onglet Infos ───────────────────────────────────────────── -->
        <div class="tab-panel modal-tabs active" id="group-modal-tab-infos" style="padding:16px;">
            <div style="font-size:8px;font-weight:900;opacity:.5;text-transform:uppercase;margin-bottom:3px;">Nom du groupe</div>
            <input type="text" id="gm-name" value="${v('name')}"
                style="width:100%;border:2px solid var(--accent);padding:9px;font-size:13px;margin-bottom:10px;background:white;box-sizing:border-box;">

            <div style="font-size:8px;font-weight:900;opacity:.5;text-transform:uppercase;margin-bottom:3px;">Logo</div>
            ${g.logoUrl ? `<img src="${g.logoUrl}" style="width:38px;height:38px;object-fit:cover;border:2px solid var(--accent);margin-bottom:5px;display:block;">` : ''}
            <input type="file" id="gm-logo" accept="image/*"
                style="width:100%;border:2px solid rgba(0,0,0,.15);padding:5px;font-size:11px;margin-bottom:12px;background:white;box-sizing:border-box;">

            ${isPro ? `
            <div style="border-top:2px solid rgba(0,0,0,.1);padding-top:10px;">
                <div style="font-size:8px;font-weight:900;opacity:.5;text-transform:uppercase;margin-bottom:8px;">Infos entreprise</div>
                <input type="text"  id="gm-company" value="${v('company')}" placeholder="Société"
                    style="width:100%;border:2px solid rgba(0,0,0,.15);padding:7px;font-size:12px;margin-bottom:5px;background:white;box-sizing:border-box;">
                <div style="display:flex;gap:5px;margin-bottom:5px;">
                    <input type="text" id="gm-cp"    value="${v('cp')}"    placeholder="CP"
                        style="flex:1;border:2px solid rgba(0,0,0,.15);padding:7px;font-size:12px;background:white;box-sizing:border-box;">
                    <input type="text" id="gm-ville" value="${v('ville')}" placeholder="Ville"
                        style="flex:2;border:2px solid rgba(0,0,0,.15);padding:7px;font-size:12px;background:white;box-sizing:border-box;">
                </div>
                <input type="tel"   id="gm-phone" value="${v('phonePro')}" placeholder="Téléphone"
                    style="width:100%;border:2px solid rgba(0,0,0,.15);padding:7px;font-size:12px;margin-bottom:5px;background:white;box-sizing:border-box;">
                <input type="email" id="gm-email" value="${v('emailPro')}" placeholder="Email pro"
                    style="width:100%;border:2px solid rgba(0,0,0,.15);padding:7px;font-size:12px;margin-bottom:5px;background:white;box-sizing:border-box;">
                <input type="text"  id="gm-siret" value="${v('siret')}"   placeholder="SIRET"
                    style="width:100%;border:2px solid rgba(0,0,0,.15);padding:7px;font-size:12px;background:white;box-sizing:border-box;">
            </div>` : ''}

            <div style="display:flex;gap:6px;margin-top:14px;">
                <button onclick="document.getElementById('group-modal').remove()"
                    style="flex:1;padding:11px;border:2px solid var(--accent);background:white;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">Annuler</button>
                <button onclick="submitEditGroup('${groupId}')"
                    style="flex:2;padding:11px;background:var(--accent);color:white;border:none;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">Enregistrer</button>
            </div>
        </div>

        <!-- ── Onglet Apparence tuile ─────────────────────────────────── -->
        <div class="tab-panel modal-tabs" id="group-modal-tab-look" style="padding:16px;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
                <label style="font-size:7px;font-weight:900;text-transform:uppercase;display:flex;flex-direction:column;gap:3px;">Fond
                    <input type="color" id="gm-tile-color" value="${g.tileColor||'#ffffff'}"
                        style="width:100%;height:28px;border:2px solid rgba(0,0,0,.15);padding:0;cursor:pointer;">
                </label>
                <label style="font-size:7px;font-weight:900;text-transform:uppercase;display:flex;flex-direction:column;gap:3px;">Texte
                    <input type="color" id="gm-tile-text" value="${g.tileTextColor||'#18181b'}"
                        style="width:100%;height:28px;border:2px solid rgba(0,0,0,.15);padding:0;cursor:pointer;">
                </label>
            </div>
            <div style="font-size:7px;font-weight:900;text-transform:uppercase;opacity:.5;margin-bottom:4px;">Forme</div>
            <div style="display:flex;gap:6px;margin-bottom:10px;">
                ${['rect','rounded','circle'].map(s => {
                    const active = (g.tileShape||'rect') === s;
                    const lbl = s==='rect'?'■ Rect':s==='rounded'?'▢ Arrondi':'● Cercle';
                    const br  = s==='circle'?'50%':s==='rounded'?'6px':'0';
                    return `<button onclick="selectTileShape('${s}')" id="gm-shape-${s}"
                        style="flex:1;padding:6px 4px;border:2px solid ${active?'var(--accent)':'rgba(0,0,0,.15)'};
                               background:${active?'var(--accent)':'white'};color:${active?'white':'#333'};
                               font-size:9px;font-weight:900;cursor:pointer;border-radius:${br};text-transform:uppercase;">${lbl}</button>`;
                }).join('')}
            </div>
            <input type="hidden" id="gm-tile-shape" value="${g.tileShape||''}">
            <div style="font-size:7px;font-weight:900;text-transform:uppercase;opacity:.5;margin-bottom:4px;">Police</div>
            <select id="gm-tile-font" style="width:100%;padding:7px;border:2px solid rgba(0,0,0,.15);font-size:11px;background:white;margin-bottom:8px;">
                <option value="" ${!g.tileFontFamily?'selected':''}>Défaut</option>
                <option value="sans-serif" ${g.tileFontFamily==='sans-serif'?'selected':''}>Sans-serif</option>
                <option value="Georgia,serif" ${g.tileFontFamily==='Georgia,serif'?'selected':''}>Georgia</option>
                <option value="Courier New,monospace" ${g.tileFontFamily==='Courier New,monospace'?'selected':''}>Courier</option>
            </select>
            <div style="font-size:7px;font-weight:900;text-transform:uppercase;opacity:.5;margin-bottom:4px;">
                Taille texte : <span id="gm-tile-fsize-val">${g.tileFontSize||'8'}</span>px
            </div>
            <input type="range" id="gm-tile-fsize" min="7" max="14" value="${g.tileFontSize||'8'}"
                oninput="document.getElementById('gm-tile-fsize-val').textContent=this.value"
                style="width:100%;margin-bottom:10px;accent-color:var(--accent);">
            <button onclick="resetGroupTileToDefault()"
                style="width:100%;padding:7px;border:2px solid rgba(0,0,0,.2);background:white;font-size:9px;font-weight:900;text-transform:uppercase;cursor:pointer;margin-bottom:12px;">
                ↺ Appliquer les paramètres par défaut
            </button>
            <div style="display:flex;gap:6px;">
                <button onclick="document.getElementById('group-modal').remove()"
                    style="flex:1;padding:11px;border:2px solid var(--accent);background:white;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">Annuler</button>
                <button onclick="submitEditGroup('${groupId}')"
                    style="flex:2;padding:11px;background:var(--accent);color:white;border:none;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">Enregistrer</button>
            </div>
        </div>

        <!-- ── Onglet Employés (pro seulement) ───────────────────────── -->
        ${isPro ? `
        <div class="tab-panel modal-tabs" id="group-modal-tab-employes" style="padding:16px;">
            <div id="gm-employes-list" style="margin-bottom:12px;">
                <em style="opacity:.4;font-size:10px;">Chargement…</em>
            </div>
            <div style="border:2px dashed rgba(0,0,0,.15);padding:12px;">
                <div style="font-size:8px;font-weight:900;text-transform:uppercase;opacity:.5;margin-bottom:6px;">Inviter un employé</div>
                <div style="display:flex;gap:6px;">
                    <input type="email" id="gm-employe-email" placeholder="email@exemple.com"
                        style="flex:1;padding:8px;border:2px solid var(--accent);font-size:12px;background:white;min-width:0;box-sizing:border-box;">
                    <button onclick="_gmInviteEmploye('${groupId}')"
                        style="padding:8px 12px;background:var(--accent);color:white;border:none;font-weight:900;font-size:11px;cursor:pointer;flex-shrink:0;">
                        Inviter
                    </button>
                </div>
            </div>
        </div>` : ''}

        <!-- ── Onglet Membres / Clients ───────────────────────────────── -->
        <div class="tab-panel modal-tabs" id="group-modal-tab-members" style="padding:16px;">
            <div id="members-matrix-wrap" style="margin-bottom:12px;min-height:24px;">
                <em style="opacity:.4;font-size:10px;">Chargement…</em>
            </div>
            <div style="display:flex;gap:6px;">
                <input type="email" id="new-member-email"
                    placeholder="${isPro ? 'Inviter un client par email…' : 'Ajouter un participant…'}"
                    style="flex:1;border:2px solid rgba(0,0,0,.15);padding:8px;font-size:11px;background:white;box-sizing:border-box;min-width:0;">
                <button onclick="addMemberToMatrix('${groupId}')"
                    style="padding:8px 12px;background:var(--accent);color:white;border:none;font-weight:900;font-size:12px;cursor:pointer;flex-shrink:0;">+</button>
            </div>
        </div>

        <!-- ── Onglet Rôles (pro seulement) ──────────────────────────── -->
        ${isPro ? `
        <div class="tab-panel modal-tabs" id="group-modal-tab-roles" style="padding:16px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                <div style="font-size:9px;font-weight:900;text-transform:uppercase;opacity:.4;">Rôles & Droits</div>
                <button onclick="_gmCreateRole('${groupId}')"
                    style="padding:5px 10px;border:2px solid var(--accent);background:white;font-size:10px;font-weight:900;text-transform:uppercase;cursor:pointer;">
                    + Nouveau rôle
                </button>
            </div>
            <div id="gm-roles-list" style="margin-bottom:8px;">
                <em style="opacity:.4;font-size:10px;">Chargement…</em>
            </div>
            <div style="font-size:9px;opacity:.4;line-height:1.4;">
                Les rôles définissent les droits des employés. Chaque employé peut avoir plusieurs rôles cumulés.
            </div>
        </div>` : ''}

        <!-- ── Onglet Danger ──────────────────────────────────────────── -->
        ${isOwner ? `
        <div class="tab-panel modal-tabs" id="group-modal-tab-danger" style="padding:16px;">
            <div style="font-size:9px;font-weight:900;text-transform:uppercase;color:#dc2626;margin-bottom:12px;">⚠️ Zone de danger</div>
            <button onclick="confirmDeleteGroup('${groupId}')"
                style="width:100%;padding:12px;background:#dc2626;color:white;border:none;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">
                🗑️ Supprimer ce groupe définitivement
            </button>
        </div>` : ''}

    </div>`;

    document.body.appendChild(modal);
    setTimeout(() => {
        document.getElementById('gm-name')?.focus();
        // Charger les membres si on est sur l'onglet membres par défaut
    }, 80);
}

// ── Charger les employés dans l'onglet Employés ───────────────────────────────
async function _gmLoadEmployes(groupId) {
    const wrap = document.getElementById('gm-employes-list');
    if (!wrap) return;
    try {
        const [resM, resR] = await Promise.all([
            fetchAuth(`/api/groups/${groupId}/members`),
            fetchAuth(`/api/groups/${groupId}/members/roles`),
        ]);
        const members = resM.ok ? await resM.json() : [];
        const roles   = resR.ok ? await resR.json() : [];

        const employes = members.filter(m => m.type === 'employe' || m.role === 'employe' || m.role === 'admin');
        if (!employes.length) {
            wrap.innerHTML = '<div style="font-size:11px;opacity:.4;font-weight:700;padding:8px 0;">Aucun employé pour l\'instant.</div>';
            return;
        }

        wrap.innerHTML = employes.map(m => {
            const memberRoleIds = (m.roles || []).map(r => r._id || r);
            const roleNames = memberRoleIds
                .map(id => roles.find(r => r._id === id)?.name || '')
                .filter(Boolean).join(', ') || '<span style="opacity:.4">Aucun rôle</span>';

            // Droits cumulés
            const droits = new Set();
            memberRoleIds.forEach(id => {
                (roles.find(r => r._id === id)?.droits || []).forEach(d => droits.add(d));
            });
            const droitLabels = {
                creer_commande: 'Créer cde', modifier_produit_coche: 'Modif. cochés',
                ticket_caisse: 'Ticket', gerer_membres: 'Gérer membres',
                voir_brouillons: 'Brouillons', ajouter_client: 'Inviter clients',
            };
            const droitsHtml = [...droits].map(d =>
                `<span style="background:#e0f2fe;color:#0369a1;font-size:8px;font-weight:900;padding:2px 5px;margin-right:3px;">${droitLabels[d]||d}</span>`
            ).join('') || '<span style="font-size:9px;opacity:.4">Aucun droit</span>';

            return `
            <div style="border:2px solid rgba(0,0,0,.1);margin-bottom:8px;background:white;">
                <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;">
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:900;font-size:11px;word-break:break-all;">${m.email}</div>
                        <div style="font-size:9px;opacity:.5;margin-top:2px;">Rôles : ${roleNames}</div>
                        <div style="margin-top:4px;">${droitsHtml}</div>
                    </div>
                    <div style="display:flex;gap:5px;flex-shrink:0;">
                        <button onclick="_gmEditEmployeRoles('${groupId}','${m.email}')"
                            style="padding:5px 8px;border:2px solid var(--accent);background:white;font-size:9px;font-weight:900;cursor:pointer;">
                            Rôles
                        </button>
                        <button onclick="_gmRemoveMember('${groupId}','${m.email}')"
                            style="padding:5px 8px;border:2px solid #dc2626;color:#dc2626;background:white;font-size:9px;font-weight:900;cursor:pointer;">✕</button>
                    </div>
                </div>
            </div>`;
        }).join('');
    } catch(e) {
        wrap.innerHTML = '<em style="opacity:.4;font-size:10px;">Erreur chargement</em>';
    }
}

// ── Charger les rôles dans l'onglet Rôles ────────────────────────────────────
async function _gmLoadRoles(groupId) {
    const wrap = document.getElementById('gm-roles-list');
    if (!wrap) return;
    try {
        const res = await fetchAuth(`/api/groups/${groupId}/members/roles`);
        if (!res.ok) { wrap.innerHTML = '<em style="opacity:.4;font-size:10px;">Erreur</em>'; return; }
        const roles = await res.json();

        if (!roles.length) {
            wrap.innerHTML = '<div style="font-size:11px;opacity:.4;font-weight:700;padding:8px 0;">Aucun rôle défini.</div>';
            return;
        }

        const droitLabels = {
            creer_commande: 'Créer commandes', modifier_produit_coche: 'Modifier cochés',
            ticket_caisse: 'Ticket de caisse', gerer_membres: 'Gérer membres',
            voir_brouillons: 'Voir brouillons', ajouter_client: 'Inviter clients',
        };

        wrap.innerHTML = roles.map(role => `
        <div style="border:2px solid rgba(0,0,0,.1);margin-bottom:6px;background:white;padding:10px 12px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:900;font-size:12px;">${role.name}</div>
                    <div style="font-size:9px;opacity:.5;margin-top:2px;">${(role.droits||[]).map(d=>droitLabels[d]||d).join(' · ')||'Aucun droit'}</div>
                </div>
                <div style="display:flex;gap:5px;flex-shrink:0;">
                    <button onclick="_gmEditRole('${groupId}','${role._id}')"
                        style="padding:5px 8px;border:2px solid var(--accent);background:white;font-size:9px;font-weight:900;cursor:pointer;">✏️</button>
                    <button onclick="_gmDeleteRole('${groupId}','${role._id}','${role.name}')"
                        style="padding:5px 8px;border:2px solid #dc2626;color:#dc2626;background:white;font-size:9px;font-weight:900;cursor:pointer;">✕</button>
                </div>
            </div>
        </div>`).join('');
    } catch(e) {
        wrap.innerHTML = '<em style="opacity:.4;font-size:10px;">Erreur chargement</em>';
    }
}

// ── Inviter un employé ────────────────────────────────────────────────────────
async function _gmInviteEmploye(groupId) {
    const emailEl = document.getElementById('gm-employe-email');
    const email   = emailEl?.value?.trim();
    if (!email || !email.includes('@')) return alert('Email invalide.');
    try {
        const res  = await fetchAuth(`/api/groups/${groupId}/members`, {
            method: 'POST', body: JSON.stringify({ email, type: 'employe' })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return alert(data.message || 'Erreur : ' + res.status);
        if (emailEl) emailEl.value = '';
        alert(data.invited ? `✅ Invitation envoyée à ${email}` : `✅ ${email} ajouté comme employé.`);
        _gmLoadEmployes(groupId);
    } catch(e) { alert('Erreur réseau'); }
}

// ── Retirer un membre ─────────────────────────────────────────────────────────
async function _gmRemoveMember(groupId, email) {
    if (!confirm(`Retirer "${email}" du groupe ?`)) return;
    try {
        const res = await fetchAuth(`/api/groups/${groupId}/members/${encodeURIComponent(email)}`, { method: 'DELETE' });
        if (!res.ok) return alert('Erreur : ' + await res.text());
        _gmLoadEmployes(groupId);
    } catch(e) { alert('Erreur réseau'); }
}

// ── Modal : éditer les rôles d'un employé ────────────────────────────────────
async function _gmEditEmployeRoles(groupId, email) {
    // Charger les données
    const [resM, resR] = await Promise.all([
        fetchAuth(`/api/groups/${groupId}/members`),
        fetchAuth(`/api/groups/${groupId}/members/roles`),
    ]);
    const members = resM.ok ? await resM.json() : [];
    const roles   = resR.ok ? await resR.json() : [];
    const member  = members.find(m => m.email === email);
    if (!member) return;

    const currentRoleIds = (member.roles || []).map(r => r._id || r);
    const droitLabels = {
        creer_commande: 'Créer commandes', modifier_produit_coche: 'Modifier cochés',
        ticket_caisse: 'Ticket de caisse', gerer_membres: 'Gérer membres',
        voir_brouillons: 'Voir brouillons', ajouter_client: 'Inviter clients',
    };

    const existing = document.getElementById('gm-employe-roles-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'gm-employe-roles-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    const rolesHtml = roles.length ? roles.map(role => {
        const checked = currentRoleIds.includes(String(role._id));
        return `
        <label style="display:flex;align-items:flex-start;gap:8px;padding:8px;border:2px solid ${checked?'var(--accent)':'rgba(0,0,0,.12)'};margin-bottom:6px;cursor:pointer;background:${checked?'rgba(0,0,0,.04)':'white'};"
            onchange="this.style.borderColor=this.querySelector('input').checked?'var(--accent)':'rgba(0,0,0,.12)';this.style.background=this.querySelector('input').checked?'rgba(0,0,0,.04)':'white'">
            <input type="checkbox" value="${role._id}" ${checked?'checked':''}
                style="width:16px;height:16px;flex-shrink:0;margin-top:1px;">
            <div>
                <div style="font-weight:900;font-size:12px;">${role.name}</div>
                <div style="font-size:9px;opacity:.5;">${(role.droits||[]).map(d=>droitLabels[d]||d).join(' · ')||'Aucun droit'}</div>
            </div>
        </label>`;
    }).join('') : '<div style="opacity:.4;font-size:11px;padding:8px 0;">Aucun rôle disponible — créez d\'abord des rôles dans l\'onglet Rôles.</div>';

    modal.innerHTML = `
    <div style="background:var(--bg,#efeee9);border:3px solid var(--accent);width:100%;max-width:380px;max-height:85vh;overflow-y:auto;box-shadow:6px 6px 0 rgba(0,0,0,.3);">
        <div style="padding:14px 16px;border-bottom:2px solid var(--accent);display:flex;align-items:center;justify-content:space-between;">
            <div>
                <div style="font-size:9px;font-weight:900;text-transform:uppercase;opacity:.5;">Rôles de l'employé</div>
                <div style="font-weight:900;font-size:12px;word-break:break-all;">${email}</div>
            </div>
            <button onclick="document.getElementById('gm-employe-roles-modal').remove()"
                style="background:none;border:none;font-size:20px;cursor:pointer;padding:0;">✕</button>
        </div>
        <div style="padding:16px;">
            ${rolesHtml}
            <div style="display:flex;gap:8px;margin-top:14px;">
                <button onclick="document.getElementById('gm-employe-roles-modal').remove()"
                    style="flex:1;padding:10px;border:2px solid rgba(0,0,0,.2);background:white;font-weight:900;font-size:11px;cursor:pointer;">Annuler</button>
                <button onclick="_gmSaveEmployeRoles('${groupId}','${email}')"
                    style="flex:2;padding:10px;background:var(--accent);color:white;border:none;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">Enregistrer</button>
            </div>
        </div>
    </div>`;

    document.body.appendChild(modal);
}

async function _gmSaveEmployeRoles(groupId, email) {
    const modal   = document.getElementById('gm-employe-roles-modal');
    if (!modal) return;
    const checked = [...modal.querySelectorAll('input[type=checkbox]:checked')].map(cb => cb.value);
    try {
        const res = await fetchAuth(`/api/groups/${groupId}/members/${encodeURIComponent(email)}`, {
            method: 'PUT', body: JSON.stringify({ roles: checked })
        });
        if (!res.ok) return alert('Erreur : ' + await res.text());
        modal.remove();
        _gmLoadEmployes(groupId);
    } catch(e) { alert('Erreur réseau'); }
}

// ── Créer / éditer un rôle ────────────────────────────────────────────────────
function _gmCreateRole(groupId) { _gmOpenRoleModal(groupId, null); }

async function _gmEditRole(groupId, roleId) {
    const res  = await fetchAuth(`/api/groups/${groupId}/members/roles`);
    const roles = res.ok ? await res.json() : [];
    _gmOpenRoleModal(groupId, roles.find(r => r._id === roleId) || null);
}

function _gmOpenRoleModal(groupId, role) {
    const existing = document.getElementById('gm-role-modal');
    if (existing) existing.remove();

    const isEdit  = !!role;
    const DROITS  = [
        { id: 'creer_commande',         label: 'Créer des commandes',      desc: 'Peut créer des pintalk pour des clients' },
        { id: 'modifier_produit_coche', label: 'Modifier produits cochés', desc: 'Peut modifier/supprimer un produit coché' },
        { id: 'ticket_caisse',          label: 'Ticket de caisse',         desc: 'Peut déclarer une commande "Ticket prêt"' },
        { id: 'gerer_membres',          label: 'Gérer les membres',        desc: 'Peut ajouter/retirer des clients' },
        { id: 'voir_brouillons',        label: 'Voir les brouillons',      desc: 'Peut voir les commandes en brouillon' },
        { id: 'ajouter_client',         label: 'Inviter des clients',      desc: 'Peut inviter un client dans le groupe' },
    ];
    const curDroits = role?.droits || [];

    const modal = document.createElement('div');
    modal.id = 'gm-role-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    modal.innerHTML = `
    <div style="background:var(--bg,#efeee9);border:3px solid var(--accent);width:100%;max-width:400px;max-height:85vh;overflow-y:auto;box-shadow:6px 6px 0 rgba(0,0,0,.3);">
        <div style="padding:14px 16px;border-bottom:2px solid var(--accent);display:flex;align-items:center;justify-content:space-between;">
            <div style="font-weight:900;font-size:13px;text-transform:uppercase;">${isEdit ? 'Modifier le rôle' : 'Nouveau rôle'}</div>
            <button onclick="document.getElementById('gm-role-modal').remove()"
                style="background:none;border:none;font-size:20px;cursor:pointer;padding:0;">✕</button>
        </div>
        <div style="padding:16px;">
            <div style="font-size:8px;font-weight:900;text-transform:uppercase;opacity:.5;margin-bottom:4px;">Nom du rôle</div>
            <input type="text" id="gm-role-name" value="${role?.name||''}" placeholder="Ex : Préparateur, Caisse..."
                style="width:100%;padding:10px;border:2px solid var(--accent);font-size:13px;font-weight:700;background:white;box-sizing:border-box;margin-bottom:12px;">
            <div style="font-size:8px;font-weight:900;text-transform:uppercase;opacity:.5;margin-bottom:8px;">Droits accordés</div>
            ${DROITS.map(d => {
                const checked = curDroits.includes(d.id);
                return `
                <label style="display:flex;align-items:flex-start;gap:8px;padding:8px;border:2px solid ${checked?'var(--accent)':'rgba(0,0,0,.12)'};margin-bottom:6px;cursor:pointer;background:${checked?'rgba(0,0,0,.04)':'white'};"
                    onchange="this.style.borderColor=this.querySelector('input').checked?'var(--accent)':'rgba(0,0,0,.12)';this.style.background=this.querySelector('input').checked?'rgba(0,0,0,.04)':'white'">
                    <input type="checkbox" value="${d.id}" ${checked?'checked':''}
                        style="width:16px;height:16px;flex-shrink:0;margin-top:1px;">
                    <div>
                        <div style="font-weight:900;font-size:12px;">${d.label}</div>
                        <div style="font-size:9px;opacity:.5;">${d.desc}</div>
                    </div>
                </label>`;
            }).join('')}
            <div style="display:flex;gap:8px;margin-top:14px;">
                <button onclick="document.getElementById('gm-role-modal').remove()"
                    style="flex:1;padding:10px;border:2px solid rgba(0,0,0,.2);background:white;font-weight:900;font-size:11px;cursor:pointer;">Annuler</button>
                <button onclick="_gmSaveRole('${groupId}','${role?._id||''}')"
                    style="flex:2;padding:10px;background:var(--accent);color:white;border:none;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">
                    ${isEdit ? 'Enregistrer' : 'Créer le rôle'}
                </button>
            </div>
        </div>
    </div>`;

    document.body.appendChild(modal);
    setTimeout(() => document.getElementById('gm-role-name')?.focus(), 80);
}

async function _gmSaveRole(groupId, roleId) {
    const name   = document.getElementById('gm-role-name')?.value?.trim();
    if (!name) return alert('Le nom du rôle est obligatoire.');
    const modal  = document.getElementById('gm-role-modal');
    const droits = modal ? [...modal.querySelectorAll('input[type=checkbox]:checked')].map(cb => cb.value) : [];
    const isEdit = !!roleId;
    const url    = isEdit
        ? `/api/groups/${groupId}/members/roles/${roleId}`
        : `/api/groups/${groupId}/members/roles`;
    try {
        const res = await fetchAuth(url, { method: isEdit ? 'PUT' : 'POST', body: JSON.stringify({ name, droits }) });
        if (!res.ok) return alert('Erreur : ' + await res.text());
        modal?.remove();
        _gmLoadRoles(groupId);
        _gmLoadEmployes(groupId); // rafraîchir les droits affichés
    } catch(e) { alert('Erreur réseau'); }
}

async function _gmDeleteRole(groupId, roleId, name) {
    if (!confirm(`Supprimer le rôle "${name}" ?\nLes employés ayant ce rôle le perdront.`)) return;
    try {
        const res = await fetchAuth(`/api/groups/${groupId}/members/roles/${roleId}`, { method: 'DELETE' });
        if (!res.ok) return alert('Erreur : ' + await res.text());
        _gmLoadRoles(groupId);
        _gmLoadEmployes(groupId);
    } catch(e) { alert('Erreur réseau'); }
}
