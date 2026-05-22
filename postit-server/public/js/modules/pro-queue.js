// ═══════════════════════════════════════════════════════════════════════
// PRO-QUEUE — Vue pile commandes pour employé et propriétaire
// Chargé uniquement si currentGroupConfig.isPro && myRole !== 'client'
// ═══════════════════════════════════════════════════════════════════════

// ── État de la vue pile ───────────────────────────────────────────────────────
let _queue = [];              // Liste complète des commandes chargées (filtrées par le serveur)
let _queueFiltered = [];      // Résultat après application des filtres UI
let _queueSelectedId = null;  // ID de la commande ouverte dans le détail
let _queueShowDraft = false;  // Afficher les brouillons (non validés)
let _queueShowClosed = false; // Afficher les commandes terminées
let _queuePeriodFrom = null;  // Date début pour les terminées
let _queuePeriodTo   = null;  // Date fin   pour les terminées

// Critères de recherche
let _queueFilters = {
    orderNumber : '',
    name        : '',
    dateFrom    : '',
    dateTo      : '',
    phone       : '',
    email       : '',
};

// ── Point d'entrée principal ──────────────────────────────────────────────────
async function openProQueue() {
    const cfg = currentGroupConfig;
    if (!cfg?.isPro) return;
    const myRole = cfg.myRole || 'owner';
    if (myRole === 'client') return; // les clients n'ont pas cette vue

    // Charger toutes les commandes du groupe
    await _queueLoad();
    _queueRenderOverlay();
}

// ── Chargement des commandes ──────────────────────────────────────────────────
async function _queueLoad() {
    try {
        const selDev = document.getElementById('sel-dev');
        const deviceId = selDev?.value;
        if (!deviceId) return;

        let url = `/api/postits?deviceId=${encodeURIComponent(deviceId)}`;

        // Inclure les terminées seulement si période définie
        if (_queueShowClosed && _queuePeriodFrom) {
            url += `&filterDateFrom=${_queuePeriodFrom}`;
            if (_queuePeriodTo) url += `&filterDateTo=${_queuePeriodTo}`;
        }

        const res = await fetchAuth(url);
        if (!res.ok) return;
        let all = await res.json();

        // Filtrage statut côté client
        const myRole  = currentGroupConfig?.myRole || 'owner';
        const myDroits = currentGroupConfig?.myDroits || [];
        const canSeeDraft = myRole === 'owner' || myDroits.includes('voir_brouillons');

        _queue = all.filter(p => {
            if (PRO_STATUS_CLOSED.includes(p.status)) {
                return _queueShowClosed; // terminées/annulées : seulement si option active
            }
            if (p.status === PRO_STATUS.BROUILLON) {
                return _queueShowDraft && canSeeDraft;
            }
            return true; // validée, en prépa, prête, ticket
        });

        _queueApplyFilters();
    } catch (e) {
        console.error('[pro-queue] _queueLoad:', e);
    }
}

// ── Application des filtres texte ─────────────────────────────────────────────
function _queueApplyFilters() {
    const f = _queueFilters;
    _queueFiltered = _queue.filter(p => {
        if (f.orderNumber && !(p.orderNumber || '').toLowerCase().includes(f.orderNumber.toLowerCase())) return false;
        if (f.name      && !(p.name        || '').toLowerCase().includes(f.name.toLowerCase()))        return false;
        if (f.phone     && !(p.phone       || '').toLowerCase().includes(f.phone.toLowerCase()))       return false;
        if (f.email     && !(p.email       || '').toLowerCase().includes(f.email.toLowerCase()))       return false;
        if (f.dateFrom) {
            const d = p.pickupDate ? new Date(p.pickupDate) : null;
            if (!d || d < new Date(f.dateFrom)) return false;
        }
        if (f.dateTo) {
            const d = p.pickupDate ? new Date(p.pickupDate) : null;
            if (!d || d > new Date(f.dateTo + 'T23:59:59')) return false;
        }
        return true;
    });

    // Tri par priorité : date de livraison croissante, puis statut
    const statusOrder = {
        [PRO_STATUS.EN_PREP]  : 0, // en préparation en premier
        [PRO_STATUS.VALIDEE]  : 1,
        [PRO_STATUS.PRETE]    : 2,
        [PRO_STATUS.PRETE_MQ] : 3,
        [PRO_STATUS.TICKET]   : 4,
        [PRO_STATUS.BROUILLON]: 5,
        [PRO_STATUS.TERMINEE] : 6,
        [PRO_STATUS.ANNULEE]  : 7,
    };
    _queueFiltered.sort((a, b) => {
        const sa = statusOrder[a.status] ?? 9;
        const sb = statusOrder[b.status] ?? 9;
        if (sa !== sb) return sa - sb;
        return new Date(a.pickupDate || 0) - new Date(b.pickupDate || 0);
    });

    // Sélection automatique : première commande si rien de sélectionné
    if (!_queueSelectedId && _queueFiltered.length > 0) {
        _queueSelectedId = _queueFiltered[0]._id;
    }
    // Vérifier que la sélection existe encore
    if (_queueSelectedId && !_queueFiltered.find(p => p._id === _queueSelectedId)) {
        _queueSelectedId = _queueFiltered.length > 0 ? _queueFiltered[0]._id : null;
    }
}

// ── Couleur de statut (Tailwind bg) ──────────────────────────────────────────
function _queueStatusBg(status) {
    const map = {
        [PRO_STATUS.BROUILLON] : '#6b7280',
        [PRO_STATUS.VALIDEE]   : '#f59e0b',
        [PRO_STATUS.EN_PREP]   : '#f97316',
        [PRO_STATUS.PRETE]     : '#3b82f6',
        [PRO_STATUS.PRETE_MQ]  : '#a855f7',
        [PRO_STATUS.TICKET]    : '#0d9488',
        [PRO_STATUS.TERMINEE]  : '#16a34a',
        [PRO_STATUS.ANNULEE]   : '#9ca3af',
    };
    return map[status] || '#18181b';
}

// ── Rendu de l'overlay pile ───────────────────────────────────────────────────
function _queueRenderOverlay() {
    const existing = document.getElementById('pro-queue-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'pro-queue-overlay';
    overlay.style.cssText = `
        position:fixed;inset:0;background:var(--bg,#efeee9);z-index:5000;
        display:flex;flex-direction:column;overflow:hidden;
    `;

    overlay.innerHTML = `
        <div id="pq-header" style="background:var(--accent,#18181b);color:#fff;padding:12px 14px;display:flex;align-items:center;gap:10px;flex-shrink:0;">
            <button onclick="closeProQueue()" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;padding:0;line-height:1;">←</button>
            <span style="font-weight:900;font-size:13px;text-transform:uppercase;letter-spacing:.04em;flex:1;">
                ${currentGroupConfig?.name || 'Commandes'}
            </span>
            <span id="pq-count" style="font-size:11px;opacity:.7;"></span>
        </div>

        <!-- Filtres -->
        <div id="pq-filters" style="background:white;border-bottom:2px solid #18181b;padding:10px 12px;flex-shrink:0;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
                <input id="pqf-ordernum" type="text" placeholder="N° commande"
                    oninput="_queueFilterInput('orderNumber',this.value)"
                    style="padding:7px 9px;border:2px solid rgba(0,0,0,0.2);font-size:12px;font-weight:700;background:white;">
                <input id="pqf-name" type="text" placeholder="Nom du client"
                    oninput="_queueFilterInput('name',this.value)"
                    style="padding:7px 9px;border:2px solid rgba(0,0,0,0.2);font-size:12px;font-weight:700;background:white;">
                <input id="pqf-phone" type="tel" placeholder="Téléphone"
                    oninput="_queueFilterInput('phone',this.value)"
                    style="padding:7px 9px;border:2px solid rgba(0,0,0,0.2);font-size:12px;font-weight:700;background:white;">
                <input id="pqf-email" type="email" placeholder="Email"
                    oninput="_queueFilterInput('email',this.value)"
                    style="padding:7px 9px;border:2px solid rgba(0,0,0,0.2);font-size:12px;font-weight:700;background:white;">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">
                <div>
                    <div style="font-size:8px;font-weight:900;text-transform:uppercase;opacity:.45;margin-bottom:2px;">Livraison du</div>
                    <input id="pqf-datefrom" type="date" oninput="_queueFilterInput('dateFrom',this.value)"
                        style="width:100%;padding:6px;border:2px solid rgba(0,0,0,0.2);font-size:12px;background:white;box-sizing:border-box;">
                </div>
                <div>
                    <div style="font-size:8px;font-weight:900;text-transform:uppercase;opacity:.45;margin-bottom:2px;">au</div>
                    <input id="pqf-dateto" type="date" oninput="_queueFilterInput('dateTo',this.value)"
                        style="width:100%;padding:6px;border:2px solid rgba(0,0,0,0.2);font-size:12px;background:white;box-sizing:border-box;">
                </div>
            </div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                <label style="display:flex;align-items:center;gap:4px;font-size:11px;font-weight:900;text-transform:uppercase;cursor:pointer;">
                    <input type="checkbox" id="pq-show-draft" onchange="_queueToggleDraft(this.checked)"
                        style="width:14px;height:14px;"> Brouillons
                </label>
                <label style="display:flex;align-items:center;gap:4px;font-size:11px;font-weight:900;text-transform:uppercase;cursor:pointer;">
                    <input type="checkbox" id="pq-show-closed" onchange="_queueToggleClosed(this.checked)"
                        style="width:14px;height:14px;"> Terminées
                </label>
                <div id="pq-period-wrap" style="display:none;flex:1;display:flex;gap:6px;align-items:center;">
                    <input id="pq-period-from" type="date" onchange="_queuePeriodChange()"
                        style="flex:1;padding:5px;border:2px solid rgba(0,0,0,0.2);font-size:11px;background:white;">
                    <span style="font-size:11px;opacity:.5;">→</span>
                    <input id="pq-period-to" type="date" onchange="_queuePeriodChange()"
                        style="flex:1;padding:5px;border:2px solid rgba(0,0,0,0.2);font-size:11px;background:white;">
                </div>
                <button onclick="_queueResetFilters()"
                    style="margin-left:auto;padding:5px 10px;border:2px solid rgba(0,0,0,0.2);background:white;font-size:10px;font-weight:900;text-transform:uppercase;cursor:pointer;">
                    Réinitialiser
                </button>
            </div>
        </div>

        <!-- Liste des commandes -->
        <div id="pq-list" style="flex:1;overflow-y:auto;"></div>

        <!-- Détail de la commande sélectionnée -->
        <div id="pq-detail" style="flex:0 0 auto;max-height:55vh;overflow-y:auto;border-top:3px solid #18181b;display:none;"></div>
    `;

    document.body.appendChild(overlay);
    _queueRenderList();
    _queueRenderDetail();
}

// ── Rendu de la liste ─────────────────────────────────────────────────────────
function _queueRenderList() {
    const list = document.getElementById('pq-list');
    const countEl = document.getElementById('pq-count');
    if (!list) return;

    if (countEl) countEl.textContent = _queueFiltered.length + ' commande' + (_queueFiltered.length > 1 ? 's' : '');

    if (_queueFiltered.length === 0) {
        list.innerHTML = `
            <div style="padding:32px;text-align:center;opacity:.35;font-size:11px;font-weight:900;text-transform:uppercase;">
                Aucune commande
            </div>`;
        return;
    }

    list.innerHTML = _queueFiltered.map((p, idx) => {
        const isSelected = p._id === _queueSelectedId;
        const bg = isSelected ? '#18181b' : (idx % 2 === 0 ? 'white' : '#f8f8f7');
        const color = isSelected ? '#fff' : '#18181b';
        const statusBg = _queueStatusBg(p.status);

        const d = p.pickupDate ? new Date(p.pickupDate) : null;
        const dateStr = d && !isNaN(d)
            ? `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
            : '--/--';

        return `
        <div onclick="_queueSelect('${p._id}')" style="
            display:grid;grid-template-columns:auto 1fr auto auto;
            gap:8px;align-items:center;
            padding:10px 14px;border-bottom:1px solid rgba(0,0,0,0.08);
            background:${bg};color:${color};cursor:pointer;
            ${isSelected ? 'border-left:4px solid '+statusBg+';' : ''}
        ">
            <div style="font-size:9px;font-weight:900;opacity:.5;white-space:nowrap;">#${idx+1}</div>
            <div>
                <div style="font-weight:900;font-size:12px;letter-spacing:-.01em;">${p.name || '—'}</div>
                <div style="font-size:9px;opacity:.55;font-weight:700;">
                    ${p.orderNumber ? '#'+p.orderNumber : ''}
                    ${p.phone ? ' · ' + p.phone : ''}
                </div>
            </div>
            <div style="font-size:10px;font-weight:900;opacity:.7;white-space:nowrap;text-align:right;">${dateStr}</div>
            <div style="
                background:${statusBg};color:white;
                font-size:8px;font-weight:900;text-transform:uppercase;
                padding:3px 6px;white-space:nowrap;min-width:52px;text-align:center;
            ">${_statusLabel(p.status)}</div>
        </div>`;
    }).join('');
}

// ── Sélection d'une commande ──────────────────────────────────────────────────
function _queueSelect(id) {
    _queueSelectedId = id;
    _queueRenderList();
    _queueRenderDetail();
}

// ── Rendu du détail ───────────────────────────────────────────────────────────
async function _queueRenderDetail() {
    const detail = document.getElementById('pq-detail');
    if (!detail) return;

    const p = _queueFiltered.find(x => x._id === _queueSelectedId);
    if (!p) { detail.style.display = 'none'; return; }

    const myRole   = currentGroupConfig?.myRole || 'owner';
    const myDroits = currentGroupConfig?.myDroits || [];
    const canPrepare = myRole === 'owner' || myRole === 'employe';
    const canTicket  = myRole === 'owner' || myDroits.includes('ticket_caisse');
    const canChat    = myRole === 'owner' || myDroits.includes('ajouter_client'); // placeholder droit messagerie
    const statusBg   = _queueStatusBg(p.status);

    const d = p.pickupDate ? new Date(p.pickupDate) : null;
    const dateStr = d && !isNaN(d)
        ? `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
        : '--/--/---- --:--';

    // Boutons d'action selon statut + droits
    const actions = [];

    if (p.status === PRO_STATUS.VALIDEE && canPrepare) {
        actions.push(`<button onclick="_queueStartPrep('${p._id}')"
            style="flex:1;padding:10px;background:#f97316;color:#fff;border:none;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">
            ▶ Démarrer prépa.
        </button>`);
    }
    if (p.status === PRO_STATUS.EN_PREP && canPrepare) {
        actions.push(`<button onclick="_queueMarkReady('${p._id}', false)"
            style="flex:1;padding:10px;background:#3b82f6;color:#fff;border:none;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">
            ✓ Marquer prête
        </button>`);
        actions.push(`<button onclick="_queueMarkReady('${p._id}', true)"
            style="flex:1;padding:10px;background:#a855f7;color:#fff;border:none;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">
            ⚠ Avec manquant
        </button>`);
    }
    if ((p.status === PRO_STATUS.PRETE || p.status === PRO_STATUS.PRETE_MQ) && canTicket) {
        actions.push(`<button onclick="_queueTicket('${p._id}')"
            style="flex:1;padding:10px;background:#0d9488;color:#fff;border:none;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">
            🧾 Ticket caisse
        </button>`);
    }
    if (p.status === PRO_STATUS.TICKET && (myRole === 'owner')) {
        actions.push(`<button onclick="_queueTerminate('${p._id}')"
            style="flex:1;padding:10px;background:#16a34a;color:#fff;border:none;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">
            ✓ Terminée
        </button>`);
    }

    // Bouton Ouvrir le chat (toujours disponible)
    actions.push(`<button onclick="_queueOpenChat('${p._id}')"
        style="flex:1;padding:10px;background:#18181b;color:#fff;border:none;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">
        💬 Ouvrir
    </button>`);

    detail.style.display = 'block';
    detail.innerHTML = `
        <div style="background:white;">
            <!-- En-tête commande -->
            <div style="padding:12px 14px;border-bottom:2px solid rgba(0,0,0,0.1);">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                    <div>
                        <div style="font-size:9px;font-weight:900;text-transform:uppercase;opacity:.4;line-height:1;">Commande</div>
                        <div style="font-size:18px;font-weight:900;font-style:italic;line-height:1.1;">#${p.orderNumber || '—'}</div>
                    </div>
                    <div style="background:${statusBg};color:white;font-size:9px;font-weight:900;text-transform:uppercase;padding:4px 8px;">
                        ${_statusLabel(p.status)}
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:11px;">
                    <div><span style="opacity:.45;font-weight:900;font-size:9px;text-transform:uppercase;">Client</span><br><strong>${p.name || '—'}</strong></div>
                    <div><span style="opacity:.45;font-weight:900;font-size:9px;text-transform:uppercase;">Livraison</span><br><strong>${dateStr}</strong></div>
                    ${p.phone ? `<div><span style="opacity:.45;font-weight:900;font-size:9px;text-transform:uppercase;">Tél.</span><br>${p.phone}</div>` : ''}
                    ${p.email ? `<div><span style="opacity:.45;font-weight:900;font-size:9px;text-transform:uppercase;">Email</span><br><span style="font-size:10px;">${p.email}</span></div>` : ''}
                </div>
            </div>
            <!-- Actions -->
            <div style="display:flex;gap:4px;padding:8px 10px;flex-wrap:wrap;">
                ${actions.join('')}
            </div>
        </div>
    `;
}

// ── Actions statut depuis la pile ─────────────────────────────────────────────
async function _queueStartPrep(pid) {
    await _queueChangeStatus(pid, PRO_STATUS.EN_PREP, null);
}

async function _queueMarkReady(pid, withMissing) {
    const status = withMissing ? PRO_STATUS.PRETE_MQ : PRO_STATUS.PRETE;
    if (withMissing) {
        const reason = prompt('Indiquez les produits manquants ou non préparables :');
        if (!reason || !reason.trim()) return;
        await _queueChangeStatus(pid, status, reason);
    } else {
        await _queueChangeStatus(pid, status, null);
    }
}

async function _queueTicket(pid) {
    await _queueChangeStatus(pid, PRO_STATUS.TICKET, null);
}

async function _queueTerminate(pid) {
    if (!confirm('Confirmer que le client a récupéré sa commande ?')) return;
    await _queueChangeStatus(pid, PRO_STATUS.TERMINEE, null);
}

async function _queueChangeStatus(pid, newStatus, comment) {
    socket.emit('update-postit-status', { groupId: currentGroupId, postitId: pid, status: newStatus, comment: comment || '' });
    // Mise à jour locale optimiste
    const p = _queue.find(x => x._id === pid);
    if (p) p.status = newStatus;
    _queueApplyFilters();
    _queueRenderList();
    await _queueRenderDetail();
}

// ── Ouvrir le chat depuis la pile ─────────────────────────────────────────────
async function _queueOpenChat(postitId) {
    closeProQueue();
    // Sélectionner le postit dans la vue normale et aller sur PAGE_CHAT
    await loadGroupData(currentGroupId);
    if (typeof selectPostit === 'function') selectPostit(postitId);
    if (typeof goToPage === 'function' && typeof PAGE_CHAT !== 'undefined') goToPage(PAGE_CHAT);
}

// ── Fermer la vue pile ────────────────────────────────────────────────────────
function closeProQueue() {
    const el = document.getElementById('pro-queue-overlay');
    if (el) el.remove();
}

// ── Callbacks filtres ─────────────────────────────────────────────────────────
function _queueFilterInput(key, value) {
    _queueFilters[key] = value;
    _queueApplyFilters();
    _queueRenderList();
    _queueRenderDetail();
}

function _queueToggleDraft(checked) {
    _queueShowDraft = checked;
    _queueLoad().then(() => { _queueRenderList(); _queueRenderDetail(); });
}

function _queueToggleClosed(checked) {
    _queueShowClosed = checked;
    const wrap = document.getElementById('pq-period-wrap');
    if (wrap) wrap.style.display = checked ? 'flex' : 'none';
    if (checked && !_queuePeriodFrom) {
        // Période par défaut : aujourd'hui - 7 jours
        const to   = new Date();
        const from = new Date(); from.setDate(from.getDate() - 7);
        _queuePeriodFrom = from.toISOString().slice(0, 10);
        _queuePeriodTo   = to.toISOString().slice(0, 10);
        const fromEl = document.getElementById('pq-period-from');
        const toEl   = document.getElementById('pq-period-to');
        if (fromEl) fromEl.value = _queuePeriodFrom;
        if (toEl)   toEl.value   = _queuePeriodTo;
    }
    _queueLoad().then(() => { _queueRenderList(); _queueRenderDetail(); });
}

function _queuePeriodChange() {
    _queuePeriodFrom = document.getElementById('pq-period-from')?.value || null;
    _queuePeriodTo   = document.getElementById('pq-period-to')?.value   || null;
    _queueLoad().then(() => { _queueRenderList(); _queueRenderDetail(); });
}

function _queueResetFilters() {
    _queueFilters    = { orderNumber:'', name:'', dateFrom:'', dateTo:'', phone:'', email:'' };
    _queueShowDraft  = false;
    _queueShowClosed = false;
    _queuePeriodFrom = null;
    _queuePeriodTo   = null;
    ['pqf-ordernum','pqf-name','pqf-phone','pqf-email','pqf-datefrom','pqf-dateto',
     'pq-period-from','pq-period-to'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    ['pq-show-draft','pq-show-closed'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = false;
    });
    const wrap = document.getElementById('pq-period-wrap');
    if (wrap) wrap.style.display = 'none';
    _queueLoad().then(() => { _queueRenderList(); _queueRenderDetail(); });
}

// ── Callback cochage eink en mode pro ─────────────────────────────────────────
// Appelé depuis toggleLineCheck dans chat.js quand le groupe est Pro
function _proCheckCompletion(pid, checkedCount, totalLines) {
    if (totalLines === 0) return;

    // Tous cochés → proposer de passer à "prête"
    if (checkedCount === totalLines) {
        const p = _queue.find(x => x._id === pid) ||
                  _cachedPostits?.find(x => x._id === pid);
        if (!p) return;

        // Petite modale non-bloquante au lieu de confirm() (confirm() bloque le thread)
        const existing = document.getElementById('pq-completion-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'pq-completion-modal';
        modal.style.cssText = `
            position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
            background:#18181b;color:white;
            border:3px solid white;
            padding:16px 18px;z-index:6000;
            width:calc(100% - 32px);max-width:380px;
            box-shadow:4px 4px 0 rgba(255,255,255,0.2);
        `;
        modal.innerHTML = `
            <div style="font-size:11px;font-weight:900;text-transform:uppercase;margin-bottom:12px;opacity:.7;">
                Tous les produits sont cochés
            </div>
            <div style="font-size:13px;font-weight:900;margin-bottom:14px;">
                La commande est-elle terminée ?
            </div>
            <div style="display:flex;gap:8px;">
                <button onclick="document.getElementById('pq-completion-modal').remove()"
                    style="flex:1;padding:10px;border:2px solid rgba(255,255,255,0.4);background:none;color:white;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">
                    Non
                </button>
                <button onclick="_proConfirmReady('${pid}', false)"
                    style="flex:1;padding:10px;background:#3b82f6;color:white;border:none;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">
                    Oui — Prête
                </button>
                <button onclick="_proConfirmReady('${pid}', true)"
                    style="flex:1;padding:10px;background:#a855f7;color:white;border:none;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">
                    Avec manquant
                </button>
            </div>
        `;
        document.body.appendChild(modal);
        // Fermeture auto après 30s
        setTimeout(() => { const el = document.getElementById('pq-completion-modal'); if(el) el.remove(); }, 30000);
    }
}

async function _proConfirmReady(pid, withMissing) {
    const modal = document.getElementById('pq-completion-modal');
    if (modal) modal.remove();

    let comment = null;
    if (withMissing) {
        comment = prompt('Indiquez les produits manquants ou non préparables :');
        if (!comment || !comment.trim()) return;
    }
    const newStatus = withMissing ? PRO_STATUS.PRETE_MQ : PRO_STATUS.PRETE;
    socket.emit('update-postit-status', { groupId: currentGroupId, postitId: pid, status: newStatus, comment: comment || '' });
    // Mise à jour locale
    const cached = _cachedPostits?.find(x => x._id === pid);
    if (cached) cached.status = newStatus;
    refreshView(false);
}
