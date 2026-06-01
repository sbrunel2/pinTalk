// ═══════════════════════════════════════════════════════════════════════
// TUILES POSTITS — rangée horizontale dans le chat
// ═══════════════════════════════════════════════════════════════════════

// ── Statuts centralisés (source unique de vérité) ────────────────────────────
const PRO_STATUS = {
    BROUILLON    : 'brouillon',
    VALIDEE      : 'validée',
    EN_PREP      : 'en cours de préparation',
    PRETE        : 'prête',
    PRETE_MQ     : 'prête avec manquant',
    TICKET       : 'ticket de caisse',
    TERMINEE     : 'terminée',
    ANNULEE      : 'annulée',
};
// Statuts considérés "ouverts" (commande en cours, visible client)
const PRO_STATUS_OPEN   = [PRO_STATUS.BROUILLON, PRO_STATUS.VALIDEE, PRO_STATUS.EN_PREP,
                            PRO_STATUS.PRETE, PRO_STATUS.PRETE_MQ, PRO_STATUS.TICKET];
// Statuts terminaux (commande close)
const PRO_STATUS_CLOSED = [PRO_STATUS.TERMINEE, PRO_STATUS.ANNULEE];
// Statuts visibles par l'employé dans la pile (exclu : brouillon par défaut)
const PRO_STATUS_QUEUE  = [PRO_STATUS.VALIDEE, PRO_STATUS.EN_PREP,
                            PRO_STATUS.PRETE, PRO_STATUS.PRETE_MQ, PRO_STATUS.TICKET];

// Compatibilité anciens statuts perso (groupes non-pro conservent leur logique)
const PERSO_STATUS_ACTIVE = ['En attente', 'En préparation', 'brouillon', '', null, undefined];
const PERSO_STATUS_CLOSED = ['En caisse', 'Terminé', 'Annulé'];

// Postit actuellement sélectionné (id)
let currentPostitId = null;
// Cache des postits du groupe courant
let _cachedPostits = [];

// ── Enregistrement vocal ──────────────────────────────────────────────────────
let _mediaRecorder = null;
let _audioChunks   = [];
let _isRecording   = false;

// ── Rendu de la rangée de tuiles ─────────────────────────────────────────────
// ── État de la barre de message selon pintalk sélectionné ────────────────────
function _updateMessageBarState(hasPintalk) {
    const input  = document.getElementById('msg-input');
    const btnSnd = document.querySelector('#message-bar .btn-send:last-child');
    const btnMic = document.getElementById('btn-mic');
    const btnAtt = document.querySelector('#message-bar button:first-child');

    if (hasPintalk) {
        if (input) {
            input.disabled    = false;
            input.style.opacity  = '1';
            input.style.cursor   = '';
            input.placeholder = typeof t==='function' ? t('writeMsg') : 'Écrire un message…';
        }
        [btnSnd, btnMic, btnAtt].forEach(b => { if(b) { b.disabled=false; b.style.opacity='1'; b.style.cursor='pointer'; } });
    } else {
        if (input) {
            input.disabled    = true;
            input.value       = '';
            input.style.opacity  = '0.35';
            input.style.cursor   = 'not-allowed';
            input.placeholder = 'Sélectionnez ou créez un pintalk…';
        }
        [btnSnd, btnMic, btnAtt].forEach(b => { if(b) { b.disabled=true; b.style.opacity='0.35'; b.style.cursor='not-allowed'; } });
    }
    // Afficher/masquer la zone Contenu du pintalk
    const _ae = document.getElementById('acc-eink');
    if (_ae) _ae.style.display = hasPintalk ? '' : 'none';
}

function _updateMessageBarState(hasPintalk) {
    const input  = document.getElementById('msg-input');
    const btnSnd = document.querySelector('#message-bar .btn-send:last-child');
    const btnMic = document.getElementById('btn-mic');
    const btnAtt = document.querySelector('#message-bar button:first-child');

    if (hasPintalk) {
        if (input) {
            input.disabled    = false;
            input.style.opacity  = '1';
            input.style.cursor   = '';
            input.placeholder = typeof t==='function' ? t('writeMsg') : 'Écrire un message…';
        }
        [btnSnd, btnMic, btnAtt].forEach(b => { if(b) { b.disabled=false; b.style.opacity='1'; b.style.cursor='pointer'; } });
    } else {
        if (input) {
            input.disabled    = true;
            input.value       = '';
            input.style.opacity  = '0.35';
            input.style.cursor   = 'not-allowed';
            input.placeholder = 'Sélectionnez ou créez un pintalk…';
        }
        [btnSnd, btnMic, btnAtt].forEach(b => { if(b) { b.disabled=true; b.style.opacity='0.35'; b.style.cursor='not-allowed'; } });
    }
    // Afficher/masquer la zone Contenu du pintalk
    const _ae = document.getElementById('acc-eink');
    if (_ae) _ae.style.display = hasPintalk ? '' : 'none';
}

function renderPostitTabs(postits, selectedId) {
    const wrap = document.getElementById('header-pintalk-tabs');
    const hiddenWrap = document.getElementById('pintalk-tabs');
    _cachedPostits = postits || [];

    const cfg    = currentGroupConfig || {};
    const isPro  = cfg.isPro;
    const myRole = cfg.myRole || 'owner';
    const isOwnerOrAdmin = myRole === 'owner' || myRole === 'admin';
    const isEmployee     = myRole === 'employe';
    const canCreate = isPro
        ? (myRole === 'owner' || myRole === 'employe') // employé : selon droit creer_commande (vérifié au submit)
            ? true
            : myRole === 'client' && _cachedPostits.filter(p => !PRO_STATUS_CLOSED.includes(p.status)).length < 4
        : (myRole === 'owner') && _cachedPostits.length < 4;

    const tabs = _cachedPostits.map(p => {
        const isActive = p._id === selectedId;

        // ── Sélection visuelle ────────────────────────────────────────────────
        // Technique : box-shadow multicouche à la place de outline.
        // Avantage : box-shadow suit TOUJOURS le border-radius de la tuile,
        // contrairement à outline qui reste rectangulaire sur certains moteurs
        // WebKit/Blink mobiles selon le context de stacking.
        //   couche 1 (spread 3px)  : anneau noir plein — le "contour" visible
        //   couche 2 (spread 5px)  : halo blanc — sépare le contour du fond parent
        //   couche 3               : ombre portée — profondeur / relief
        // Les couleurs de fond/texte de la tuile sont TOUJOURS conservées.
        const border = isActive ? '2px solid #18181b' : '2px solid rgba(0,0,0,0.15)';
        const shadow = isActive
            ? '0 0 0 3px #18181b, 0 0 0 5px rgba(255,255,255,0.75), 2px 4px 10px rgba(0,0,0,0.3)'
            : '2px 2px 0 rgba(0,0,0,0.08)';
        const scale  = isActive ? 'scale(1.05)' : 'scale(1)';
        const zIdx   = isActive ? 'z-index:5;position:relative;' : '';

        // Label de la tuile
        let label = '';
        if (isPro) {
            // Groupes PRO : heure de retrait + nom
            const d = p.pickupDate ? new Date(p.pickupDate) : null;
            const time = d ? d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}) : '??:??';
            label = `<div style="font-size:7px;opacity:0.7;">${time}</div>
                     <div style="font-size:8px;font-weight:900;text-transform:uppercase;line-height:1.1;word-break:break-word;">${truncate(p.name,10)}</div>`;
        } else {
            // Groupes PERSO : nom seulement
            label = `<div style="font-size:9px;font-weight:900;text-transform:uppercase;line-height:1.1;word-break:break-word;">${truncate(p.name,12)}</div>`;
        }

        // Roue ⚙️ visible uniquement pour le proprio du postit ou owner/admin
        // Roue visible si proprio du postit OU owner/admin du groupe
        // Pour les autres : pas de roue (ils ne peuvent qu'ouvrir en lecture via tap sur la tuile si besoin)
        const isOwnerOfPostit = (currentUser && p.ownerEmail === currentUser.email) || isOwnerOrAdmin;
        const _ptGearShape = _userPrefs?.pintalkPrefs?.[p._id]?.shape || p.tileShape || window._currentTileShape || 'rect';
        const gearPos = _ptGearShape === 'circle'
            ? 'bottom:3px;left:50%;transform:translateX(-50%);'
            : 'bottom:2px;right:2px;';
        // Roue visible pour tous (contenu du modal adapté selon rôle)
        const gear = `<button onclick="event.stopPropagation(); uiEditPostit('${p._id}')"
                       style="position:absolute;${gearPos}background:none;border:none;
                              font-size:10px;cursor:pointer;opacity:${isActive?'0.7':'0.4'};padding:1px;z-index:2;">⚙️</button>`;

        // Forme : préf utilisateur > prop pintalk > globale
        const _ptShapeGlobal = window._currentTileShape || localStorage.getItem('tileShape') || 'rect';
        const _ptShape  = (_userPrefs?.pintalkPrefs?.[p._id]?.shape) || p.tileShape || _ptShapeGlobal;
        const _ptRadius = _ptShape === 'circle' ? '50%' : _ptShape === 'rounded' ? '16px' : '0px';
        const ptSize    = _ptShape === 'circle' ? 'width:52px;height:52px;min-height:52px;' : 'width:58px;min-height:50px;';
        // Couleurs : préf utilisateur > propriété pintalk > défaut
        const _ptPref   = _userPrefs?.pintalkPrefs?.[p._id] || {};
        // Toujours utiliser les couleurs personnalisées (même si actif)
        const ptBg    = _ptPref.color     || p.tileColor     || '#fff';
        const ptColor = _ptPref.textColor || p.tileTextColor || 'var(--accent)';
        // Logo miniature
        const ptLogoHtml = p.tileLogoUrl
            ? `<img src="${p.tileLogoUrl}" style="width:24px;height:24px;object-fit:cover;border-radius:${_ptRadius==='50%'?'50%':'3px'};margin-bottom:3px;pointer-events:none;">`
            : '';
        return `<div id="ptab-${p._id}" onclick="selectPostit('${p._id}')"
                     style="flex-shrink:0;${ptSize}${zIdx}
                            background:${ptBg};color:${ptColor};border:${border};box-shadow:${shadow};
                            border-radius:${_ptRadius};overflow:visible;
                            transform:${scale};transition:transform 0.18s,box-shadow 0.18s,border-color 0.18s;
                            padding:5px 4px 16px 4px;cursor:pointer;display:flex;
                            flex-direction:column;align-items:center;justify-content:center;text-align:center;">
                    ${ptLogoHtml}
                    ${label}
                    ${gear}
                </div>`;
    }).join('');

    // Tuile "+"
    const addTab = canCreate
        ? `<div onclick="uiCreatePostit()"
                style="flex-shrink:0;width:44px;min-height:44px;display:flex;flex-direction:column;
                       align-items:center;justify-content:center;cursor:pointer;touch-action:manipulation;
                       border:2px dashed rgba(0,0,0,0.25);color:rgba(0,0,0,0.35);
                       background:rgba(255,255,255,0.5);">
                <div style="font-size:24px;font-weight:100;line-height:1;pointer-events:none;">+</div>
                <div style="font-size:7px;font-weight:900;text-transform:uppercase;pointer-events:none;margin-top:2px;">Pintalk</div>
           </div>`
        : '';

    // Bouton retour groupe — style onglet surélevé (option A)
    const groupName = (currentGroupConfig?.name || '').toUpperCase();
    const shortName = groupName.length > 12 ? groupName.substring(0, 12) + '…' : groupName;
    const backBtn = `<div onclick="goToPage(PAGE_GROUPES)"
            style="flex-shrink:0;display:flex;flex-direction:column;align-items:center;
                   justify-content:center;padding:4px 10px;gap:2px;cursor:pointer;
                   min-width:54px;max-width:66px;min-height:44px;align-self:stretch;
                   background:rgba(255,255,255,0.15);
                   border-top:3px solid var(--accent);
                   border-right:1px solid rgba(255,255,255,0.18);
                   border-radius:6px 0 0 0;
                   touch-action:manipulation;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="3" stroke-linecap="round" stroke-linejoin="round"
                 style="pointer-events:none;">
                <polyline points="15 18 9 12 15 6"/>
            </svg>
            <span style="font-size:7px;font-weight:900;text-transform:uppercase;
                         letter-spacing:0.3px;text-align:center;line-height:1.25;
                         word-break:break-word;opacity:0.85;max-width:58px;
                         pointer-events:none;">${shortName}</span>
        </div>`;
    if (wrap) wrap.innerHTML = backBtn + tabs + addTab;
    if (hiddenWrap) hiddenWrap.innerHTML = '';

    // Activer/désactiver la zone de message selon si un pintalk est sélectionné
    _updateMessageBarState(!!selectedId);

    // border-radius appliqué directement dans le template de chaque tuile

    // Mettre à jour sel-pos caché (compatibilité)
    const selPos = document.getElementById('sel-pos');
    if (selPos) {
        selPos.innerHTML = _cachedPostits.map(p => `<option value="${p._id}">${p.name}</option>`).join('');
        if (selectedId) selPos.value = selectedId;
    }
}

// ── Sélectionner un postit ────────────────────────────────────────────────────
// Convertir un nom en teinte HSL stable (pour étiquettes utilisateurs)
function _nameToHue(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
        hash |= 0;
    }
    return Math.abs(hash) % 360;
}

// Activer/désactiver la zone de saisie selon la présence d'un pintalk


function selectPostit(postitId) {
    _vibrate(20);
    currentPostitId = postitId;
    // Mémoriser le dernier pintalk par groupe
    if (currentGroupId && postitId) {
        localStorage.setItem('lastPintalk_' + currentGroupId, postitId);
    }
    _updateMessageBarState(!!postitId);
    const selPos = document.getElementById('sel-pos');
    if (selPos) selPos.value = postitId;

    // Re-rendre les tuiles pour mettre en évidence la sélection
    renderPostitTabs(_cachedPostits, postitId);

    // Charger l'historique et rafraîchir la vue
    if (socket && currentGroupId) {
        socket.emit('get-history', { groupId: currentGroupId, postitId });
    }
    refreshView();
}

// ── Créer un nouveau postit ───────────────────────────────────────────────────

function uiCreatePostit() {
    const cfg = currentGroupConfig || {};
    const isPro = cfg.isPro;

    document.getElementById('postit-modal')?.remove();

    const modalHtml = `
    <div id="postit-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9998;display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow-y:auto;">
        <div style="background:var(--bg);border:3px solid var(--accent);box-shadow:6px 6px 0 rgba(0,0,0,0.3);padding:20px;width:100%;max-width:380px;margin-top:60px;">
            <h3 style="font-size:13px;font-weight:900;text-transform:uppercase;margin-bottom:14px;">
                ${isPro ? '📦 Nouvelle commande' : '💬 Nouveau pintalk'}
            </h3>

            <div style="font-size:8px;font-weight:900;opacity:0.5;text-transform:uppercase;margin-bottom:3px;">
                ${isPro ? 'Nom du client *' : 'Nom de la conversation *'}
            </div>
            <input type="text" id="pm-name" placeholder="${isPro ? 'Nom du client' : 'Nom'}"
                   style="width:100%;border:2px solid var(--accent);padding:9px;font-size:13px;margin-bottom:10px;background:white;box-sizing:border-box;">

            ${isPro ? `
            <div style="font-size:8px;font-weight:900;opacity:0.5;text-transform:uppercase;margin-bottom:3px;">Date de retrait *</div>
            <input type="datetime-local" id="pm-date"
                   style="width:100%;border:2px solid var(--accent);padding:8px;font-size:12px;margin-bottom:10px;background:white;box-sizing:border-box;">

            <div style="display:flex;gap:8px;margin-bottom:10px;">
                <div style="flex:1;">
                    <div style="font-size:8px;font-weight:900;opacity:0.5;text-transform:uppercase;margin-bottom:3px;">Téléphone</div>
                    <input type="tel" id="pm-phone" placeholder="06..."
                           style="width:100%;border:2px solid rgba(0,0,0,0.15);padding:8px;font-size:12px;background:white;box-sizing:border-box;">
                </div>
                <div style="flex:1;">
                    <div style="font-size:8px;font-weight:900;opacity:0.5;text-transform:uppercase;margin-bottom:3px;">Email</div>
                    <input type="email" id="pm-email" placeholder="email@..."
                           style="width:100%;border:2px solid rgba(0,0,0,0.15);padding:8px;font-size:12px;background:white;box-sizing:border-box;">
                </div>
            </div>` : ''}

            <div style="display:flex;gap:8px;margin-top:14px;">
                <button onclick="document.getElementById('postit-modal').remove()"
                        style="flex:1;padding:12px;border:2px solid var(--accent);background:white;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">Annuler</button>
                <button onclick="submitCreatePostit()"
                        style="flex:1;padding:12px;background:var(--accent);color:white;border:none;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">Créer</button>
            </div>
        </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    setTimeout(() => document.getElementById('pm-name')?.focus(), 100);
}

async function submitCreatePostit() {
    const name = document.getElementById('pm-name')?.value?.trim();
    if (!name) return alert(typeof t==='function' ? t('nameRequired') : 'Le nom est obligatoire.');

    const selDev = document.getElementById('sel-dev');
    const deviceId = selDev?.value;
    if (!deviceId) return alert('Rayon introuvable, rechargez la page.');

    const isPro   = currentGroupConfig?.isPro;
    const myRole  = currentGroupConfig?.myRole || 'owner';

    // ── Limite client pro : max 4 commandes ouvertes ──────────────────────────
    if (isPro && myRole === 'client') {
        const openCount = _cachedPostits.filter(p => !PRO_STATUS_CLOSED.includes(p.status)).length;
        if (openCount >= 4) {
            return alert('Vous avez déjà 4 commandes ouvertes. Veuillez attendre qu\'une commande soit terminée avant d\'en créer une nouvelle.');
        }
    }
    // ── Droit de création pour un employé ─────────────────────────────────────
    if (isPro && myRole === 'employe') {
        const myDroits = currentGroupConfig?.myDroits || [];
        if (!myDroits.includes('creer_commande')) {
            return alert('Vous n\'avez pas le droit de créer des commandes.');
        }
    }

    const pickupDate = isPro
        ? (document.getElementById('pm-date')?.value || new Date().toISOString())
        : new Date().toISOString();

    const payload = {
        name,
        deviceId,
        pickupDate,
        phone: document.getElementById('pm-phone')?.value?.trim() || '',
        email: document.getElementById('pm-email')?.value?.trim() || '',
    };
    if (isPro) {
        // Générer un numéro de commande automatique
        payload.orderNumber = 'CMD-' + Math.floor(1000 + Math.random() * 9000);
    }

    const res = await fetchAuth('/api/postits', { method:'POST', body: JSON.stringify(payload) });
    document.getElementById('postit-modal')?.remove();

    if (res.ok) {
        const newP = await res.json();
        await loadGroupData(currentGroupId, newP._id);
        // Forcer la sélection du nouveau pintalk après le rendu des tabs
        // (loadGroupData met à jour currentPostitId mais selectPostit
        //  mémorise aussi dans localStorage et déclenche get-history)
        selectPostit(newP._id);
        if (typeof goToPage === 'function' && typeof PAGE_CHAT !== 'undefined') {
            goToPage(PAGE_CHAT);
        }
    } else {
        alert('Erreur : ' + await res.text());
    }
}

// ── Éditer un postit (roue ⚙️) ───────────────────────────────────────────────
// Modal pintalk pour les membres (couleur, forme, quitter)
function _openPintalkMemberModal(postitId, p) {
    const pref     = _userPrefs?.pintalkPrefs?.[postitId] || {};
    const curColor = pref.color     || p.tileColor     || '#ffffff';
    const curText  = pref.textColor || p.tileTextColor || '#18181b';
    const curShape = pref.shape     || p.tileShape     || window._currentTileShape || 'rect';

    const shapeHtml = ['rect','rounded','circle'].map(s => {
        const active = curShape === s;
        const lbl = s==='rect'?'■ Rect':s==='rounded'?'▢ Arrondi':'● Cercle';
        const br  = s==='circle'?'50%':s==='rounded'?'6px':'0';
        return `<button onclick="selectPintalkMemberShape('${s}')" id="ptm-pshape-${s}"
            style="flex:1;padding:6px 3px;border:2px solid ${active?'var(--accent)':'rgba(0,0,0,0.15)'};
                   background:${active?'var(--accent)':'white'};color:${active?'white':'#333'};
                   font-size:8px;font-weight:900;cursor:pointer;border-radius:${br};text-transform:uppercase;">${lbl}</button>`;
    }).join('');

    const isGroupOwner = currentGroupConfig?.myRole === 'owner';
    const html = `
    <div id="pintalk-edit-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9998;display:flex;align-items:flex-start;justify-content:center;padding:14px;overflow-y:auto;">
      <div style="background:var(--bg);border:3px solid var(--accent);box-shadow:6px 6px 0 rgba(0,0,0,0.3);padding:18px;width:100%;max-width:380px;margin-top:60px;">
        <h3 style="font-size:13px;font-weight:900;text-transform:uppercase;margin-bottom:12px;">🎨 ${p.name}</h3>
        <div style="font-size:8px;opacity:0.5;font-weight:900;text-transform:uppercase;margin-bottom:10px;">Apparence personnelle de ce pintalk</div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
          <label style="font-size:7px;font-weight:900;text-transform:uppercase;display:flex;flex-direction:column;gap:3px;">Fond
            <input type="color" id="ptm-bg" value="${curColor}" style="width:100%;height:26px;border:2px solid rgba(0,0,0,0.15);padding:0;cursor:pointer;">
          </label>
          <label style="font-size:7px;font-weight:900;text-transform:uppercase;display:flex;flex-direction:column;gap:3px;">Texte
            <input type="color" id="ptm-text" value="${curText}" style="width:100%;height:26px;border:2px solid rgba(0,0,0,0.15);padding:0;cursor:pointer;">
          </label>
        </div>
        <div style="font-size:7px;font-weight:900;text-transform:uppercase;opacity:0.5;margin-bottom:4px;">Forme</div>
        <div style="display:flex;gap:5px;margin-bottom:10px;">${shapeHtml}</div>
        <input type="hidden" id="ptm-shape" value="${curShape}">

        <button onclick="resetPintalkMemberPrefToDefault('${postitId}')"
            style="width:100%;padding:7px;border:2px solid rgba(0,0,0,0.2);background:white;font-size:9px;font-weight:900;text-transform:uppercase;cursor:pointer;margin-bottom:10px;">
            ↺ Appliquer les paramètres par défaut
        </button>

        <div style="border-top:2px solid rgba(220,38,38,0.15);padding-top:8px;margin-bottom:10px;">
          ${isGroupOwner
            ? `<button onclick="confirmDeletePostit('${postitId}')"
                style="width:100%;padding:8px;background:#fff;color:#dc2626;border:2px solid #dc2626;font-weight:900;font-size:10px;text-transform:uppercase;cursor:pointer;">
                🗑️ Supprimer ce pintalk</button>`
            : `<button onclick="leavePintalk('${postitId}')"
                style="width:100%;padding:8px;background:#fff;color:#dc2626;border:2px solid #dc2626;font-weight:900;font-size:10px;text-transform:uppercase;cursor:pointer;">
                🚪 Quitter ce pintalk</button>`
          }
        </div>

        <div style="display:flex;gap:8px;">
          <button onclick="document.getElementById('pintalk-edit-modal').remove()"
              style="flex:1;padding:11px;border:2px solid var(--accent);background:white;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">Annuler</button>
          <button onclick="savePintalkMemberPrefs('${postitId}')"
              style="flex:1;padding:11px;background:var(--accent);color:white;border:none;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">Enregistrer</button>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
}

function selectPintalkMemberShape(shape) {
    document.getElementById('ptm-shape').value = shape;
    ['rect','rounded','circle'].forEach(s => {
        const btn = document.getElementById('ptm-pshape-' + s);
        if (!btn) return;
        btn.style.borderColor = s===shape ? 'var(--accent)' : 'rgba(0,0,0,0.15)';
        btn.style.background  = s===shape ? 'var(--accent)' : 'white';
        btn.style.color       = s===shape ? 'white' : '#333';
    });
}

function resetPintalkMemberPrefToDefault(postitId) {
    const activeSkin = parseInt(localStorage.getItem('activeSkin') || '0');
    const shape = window._currentTileShape || 'rect';
    const bg   = activeSkin===2 ? (document.documentElement.style.getPropertyValue('--custom-bg')||'#ffffff') : '#ffffff';
    const text = activeSkin===2 ? (document.documentElement.style.getPropertyValue('--custom-text')||'#18181b') : '#18181b';
    const bgEl = document.getElementById('ptm-bg'); if(bgEl) bgEl.value = bg;
    const txEl = document.getElementById('ptm-text'); if(txEl) txEl.value = text;
    document.getElementById('ptm-shape').value = '';
    selectPintalkMemberShape(shape);
}

async function savePintalkMemberPrefs(postitId) {
    const color     = document.getElementById('ptm-bg')?.value    || '';
    const textColor = document.getElementById('ptm-text')?.value  || '';
    const shape     = document.getElementById('ptm-shape')?.value || '';
    _setPintalkPref(postitId, { color, textColor, shape });
    document.getElementById('pintalk-edit-modal')?.remove();
    // Recharger les tuiles pintalk
    const pid = currentPostitId;
    renderPostitTabs(_cachedPostits, pid);
}

async function leavePintalk(postitId) {
    if (!confirm('Quitter ce pintalk ? Vous ne pourrez plus y accéder.')) return;
    document.getElementById('pintalk-edit-modal')?.remove();
    // Retirer l'email de l'utilisateur des allowedEmails
    const res = await fetchAuth('/api/postits/' + postitId + '/invite/' + encodeURIComponent(currentUser.email), { method:'DELETE' });
    if (res.ok) {
        // Supprimer prefs locales
        if (_userPrefs?.pintalkPrefs?.[postitId]) {
            delete _userPrefs.pintalkPrefs[postitId];
            _saveUserPrefs({ pintalkPrefs: _userPrefs.pintalkPrefs });
        }
        currentPostitId = null;
        await loadGroupData(currentGroupId);
    } else alert('Erreur : ' + await res.text());
}

async function uiEditPostit(postitId) {
    document.getElementById('pintalk-edit-modal')?.remove();
    const p = _cachedPostits.find(x => x._id === postitId);
    if (!p) return;

    const isPro        = currentGroupConfig?.isPro;
    const myRole       = currentGroupConfig?.myRole || 'client';
    const fmtDate      = p.pickupDate ? new Date(p.pickupDate).toISOString().slice(0,16) : '';
    const isOwnerOrAdmin = ['owner','admin'].includes(myRole);
    const isPostitOwner  = currentUser && p.ownerEmail === currentUser.email;
    const canEdit = isPostitOwner || isOwnerOrAdmin;

    // Si simple membre (pas canEdit) → modal simplifié : couleur/forme/quitter
    if (!canEdit && myRole !== 'employe') {
        _openPintalkMemberModal(postitId, p);
        return;
    }

    // Champs : readonly si lecture seule
    const ro  = canEdit ? '' : 'readonly';
    const roStyle = canEdit
        ? 'background:white;'
        : 'background:#f4f4f4;color:#888;cursor:default;';

    const modalHtml = `
    <div id="pintalk-edit-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9998;display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow-y:auto;">
        <div style="background:var(--bg);border:3px solid var(--accent);box-shadow:6px 6px 0 rgba(0,0,0,0.3);width:100%;max-width:380px;margin-top:60px;overflow:hidden;">

            <!-- Titre + fermeture -->
            <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:2px solid var(--accent);">
                <h3 style="font-size:13px;font-weight:900;text-transform:uppercase;margin:0;">
                    ${canEdit ? '⚙️' : '👁️'} ${isPro ? '📦 Commande' : 'Pintalk'}
                </h3>
                <button onclick="document.getElementById('pintalk-edit-modal').remove()"
                    style="background:none;border:none;font-size:20px;cursor:pointer;padding:0;opacity:.6;">✕</button>
            </div>

            <!-- Barre d'onglets -->
            <div class="tabs-bar modal-tabs" id="pintalk-modal-tabs">
                <button class="tab-btn active" onclick="switchModalTab('pintalk-edit-modal','info',this)">
                    ${isPro ? '📦 Commande' : '📝 Infos'}
                </button>
                ${canEdit ? `<button class="tab-btn" onclick="switchModalTab('pintalk-edit-modal','look',this)">🎨 Apparence</button>` : ''}
                ${canEdit ? `<button class="tab-btn" onclick="switchModalTab('pintalk-edit-modal','guests',this)">👥 Participants</button>` : ''}
                ${canEdit && isOwnerOrAdmin ? `<button class="tab-btn" onclick="switchModalTab('pintalk-edit-modal','danger',this)" style="color:rgba(220,38,38,.7);">⚠️</button>` : ''}
            </div>

            <!-- ── Onglet Infos ─────────────────────────────────────── -->
            <div class="tab-panel modal-tabs active" id="pintalk-edit-modal-tab-info" style="padding:16px;">
                <div style="font-size:8px;font-weight:900;opacity:0.5;text-transform:uppercase;margin-bottom:3px;">${t('clientName').replace(' *','')}</div>
                <input type="text" id="pe-name" value="${p.name||''}" ${ro}
                       style="width:100%;border:2px solid var(--accent);padding:9px;font-size:13px;margin-bottom:10px;${roStyle}box-sizing:border-box;">

                ${isPro ? `
                <div style="font-size:8px;font-weight:900;opacity:0.5;text-transform:uppercase;margin-bottom:3px;">${t('pickupDate').replace(' *','')}</div>
                <input type="datetime-local" id="pe-date" value="${fmtDate}" ${ro}
                       style="width:100%;border:2px solid var(--accent);padding:8px;font-size:12px;margin-bottom:10px;${roStyle}box-sizing:border-box;">
                <div style="display:flex;gap:8px;margin-bottom:10px;">
                    <div style="flex:1;">
                        <div style="font-size:8px;font-weight:900;opacity:0.5;text-transform:uppercase;margin-bottom:3px;">${t('phone')}</div>
                        <input type="tel" id="pe-phone" value="${p.phone||''}" ${ro}
                               style="width:100%;border:2px solid rgba(0,0,0,0.15);padding:8px;font-size:12px;${roStyle}box-sizing:border-box;">
                    </div>
                    <div style="flex:1;">
                        <div style="font-size:8px;font-weight:900;opacity:0.5;text-transform:uppercase;margin-bottom:3px;">${t('orderNum')}</div>
                        <input type="text" id="pe-ordernum" value="${p.orderNumber||''}" ${ro}
                               style="width:100%;border:2px solid rgba(0,0,0,0.15);padding:8px;font-size:12px;${roStyle}box-sizing:border-box;">
                    </div>
                </div>` : ''}

                ${!canEdit ? `<div style="font-size:9px;opacity:0.5;margin-top:8px;font-style:italic;">Lecture seule — vous n'êtes pas le créateur</div>` : ''}

                ${canEdit ? `
                <div style="display:flex;gap:6px;margin-top:14px;">
                    <button onclick="document.getElementById('pintalk-edit-modal').remove()"
                            style="flex:1;padding:10px;border:2px solid var(--accent);background:white;font-weight:900;font-size:10px;text-transform:uppercase;cursor:pointer;">${t('cancel')}</button>
                    <button onclick="submitEditPostit('${postitId}')"
                            style="flex:2;padding:10px;background:var(--accent);color:white;border:none;font-weight:900;font-size:10px;text-transform:uppercase;cursor:pointer;">${t('modify')}</button>
                </div>` : `
                <button onclick="document.getElementById('pintalk-edit-modal').remove()"
                        style="width:100%;padding:12px;background:var(--accent);color:white;border:none;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;margin-top:14px;">OK</button>`}
            </div>

            <!-- ── Onglet Apparence ───────────────────────────────────── -->
            ${canEdit ? `
            <div class="tab-panel modal-tabs" id="pintalk-edit-modal-tab-look" style="padding:16px;">
                <div style="font-size:8px;font-weight:900;opacity:0.5;text-transform:uppercase;margin-bottom:8px;">🎨 Apparence de la tuile</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
                    <label style="font-size:7px;font-weight:900;text-transform:uppercase;display:flex;flex-direction:column;gap:3px;">Fond
                        <input type="color" id="pe-tile-bg" value="${p.tileColor||'#ffffff'}"
                               style="width:100%;height:26px;border:2px solid rgba(0,0,0,0.15);padding:0;cursor:pointer;">
                    </label>
                    <label style="font-size:7px;font-weight:900;text-transform:uppercase;display:flex;flex-direction:column;gap:3px;">Texte
                        <input type="color" id="pe-tile-text" value="${p.tileTextColor||'#18181b'}"
                               style="width:100%;height:26px;border:2px solid rgba(0,0,0,0.15);padding:0;cursor:pointer;">
                    </label>
                </div>
                <div style="font-size:7px;font-weight:900;text-transform:uppercase;opacity:0.5;margin-bottom:4px;">Forme</div>
                <div style="display:flex;gap:5px;margin-bottom:8px;" id="pe-shape-btns">
                    ${['rect','rounded','circle'].map(s => {
                        const cur = p.tileShape || (window._currentTileShape||'rect');
                        const active = cur === s;
                        const label = s==='rect'?'■ Rect':s==='rounded'?'▢ Arrondi':'● Cercle';
                        const br = s==='circle'?'50%':s==='rounded'?'6px':'0';
                        return '<button onclick="selectPintalkShape(\'' + s + '\')" id="pe-pshape-' + s + '" style="flex:1;padding:5px 3px;border:2px solid ' + (active?'var(--accent)':'rgba(0,0,0,0.15)') + ';background:' + (active?'var(--accent)':'white') + ';color:' + (active?'white':'#333') + ';font-size:8px;font-weight:900;cursor:pointer;border-radius:' + br + ';text-transform:uppercase;">' + label + '</button>';
                    }).join('')}
                </div>
                <input type="hidden" id="pe-tile-shape" value="${p.tileShape||''}">
                <div style="font-size:7px;font-weight:900;text-transform:uppercase;opacity:0.5;margin-bottom:4px;">Logo (optionnel)</div>
                ${p.tileLogoUrl ? '<img src="' + p.tileLogoUrl + '" style="width:32px;height:32px;object-fit:cover;border:1px solid rgba(0,0,0,0.15);margin-bottom:4px;display:block;">' : ''}
                <input type="file" id="pe-tile-logo" accept="image/*"
                       style="width:100%;padding:4px;border:2px solid rgba(0,0,0,0.15);font-size:10px;background:white;margin-bottom:8px;">
                <button onclick="resetPintalkTileToDefault('${postitId}')"
                    style="width:100%;padding:6px;border:2px solid rgba(0,0,0,0.2);background:white;font-size:9px;font-weight:900;text-transform:uppercase;cursor:pointer;margin-bottom:12px;">
                    ↺ Appliquer les paramètres par défaut
                </button>
                <div style="display:flex;gap:6px;">
                    <button onclick="document.getElementById('pintalk-edit-modal').remove()"
                            style="flex:1;padding:10px;border:2px solid var(--accent);background:white;font-weight:900;font-size:10px;text-transform:uppercase;cursor:pointer;">${t('cancel')}</button>
                    <button onclick="submitEditPostit('${postitId}')"
                            style="flex:2;padding:10px;background:var(--accent);color:white;border:none;font-weight:900;font-size:10px;text-transform:uppercase;cursor:pointer;">${t('modify')}</button>
                </div>
            </div>` : ''}

            <!-- ── Onglet Participants ────────────────────────────────── -->
            ${canEdit ? `
            <div class="tab-panel modal-tabs" id="pintalk-edit-modal-tab-guests" style="padding:16px;">
                <div style="font-size:8px;font-weight:900;opacity:0.5;text-transform:uppercase;margin-bottom:6px;">${t('pintalkParticipants')}</div>
                <div id="pe-invites-list" style="min-height:20px;margin-bottom:6px;">
                    <em style="opacity:0.4;font-size:10px;">Chargement…</em>
                </div>
                <div style="font-size:7px;opacity:0.4;margin-bottom:5px;">${t('inviteWarning')}</div>
                <div style="display:flex;gap:6px;">
                    <input type="email" id="pe-invite-email" placeholder="${t('inviteByEmail')}"
                           style="flex:1;border:2px solid rgba(0,0,0,0.15);padding:7px;font-size:12px;background:white;box-sizing:border-box;">
                    <button onclick="submitInviteToPostit('${postitId}')"
                            style="padding:7px 10px;background:var(--accent);color:white;border:none;font-weight:900;font-size:10px;text-transform:uppercase;cursor:pointer;">+</button>
                </div>
            </div>` : ''}

            <!-- ── Onglet Danger ──────────────────────────────────────── -->
            ${canEdit ? `
            <div class="tab-panel modal-tabs" id="pintalk-edit-modal-tab-danger" style="padding:16px;">
                <div style="font-size:9px;font-weight:900;text-transform:uppercase;color:#dc2626;margin-bottom:12px;">⚠️ Zone de danger</div>

                <!-- Archiver & vider (tous les éditeurs) -->
                <button onclick="archiveAndClearPostit('${postitId}','${(p && p.name ? p.name : '').replace(/'/g,"\\'")}' )"
                    style="width:100%;padding:12px;background:#0d9488;color:white;border:none;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;margin-bottom:6px;">
                    📦 Archiver &amp; vider la conversation
                </button>
                <div style="font-size:9px;opacity:.5;margin-bottom:16px;">Sauvegarde les messages dans les Archives puis vide le pintalk. Le pintalk et ses participants sont conservés.</div>

                <!-- Supprimer (owner/admin seulement) -->
                ${isOwnerOrAdmin ? `
                <button onclick="confirmDeletePostit('${postitId}')"
                    style="width:100%;padding:12px;background:#dc2626;color:white;border:none;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">
                    🗑️ Supprimer ce pintalk
                </button>
                <div style="font-size:9px;opacity:.5;margin-top:5px;">Un code de confirmation sera envoyé par email.</div>
                ` : ''}
            </div>` : ''}

        </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    if (canEdit) setTimeout(() => loadPostitInvites(postitId), 80);
    if (canEdit) setTimeout(() => loadPostitInvites(postitId), 80);
}

function selectPintalkShape(shape) {
    const hidden = document.getElementById('pe-tile-shape');
    if (hidden) hidden.value = shape;
    ['rect','rounded','circle'].forEach(s => {
        const btn = document.getElementById('pe-pshape-' + s);
        if (!btn) return;
        const active = s === shape;
        btn.style.borderColor = active ? 'var(--accent)' : 'rgba(0,0,0,0.15)';
        btn.style.background  = active ? 'var(--accent)' : 'white';
        btn.style.color       = active ? 'white' : '#333';
    });
}

async function resetPintalkTileToDefault(postitId) {
    // Récupérer les paramètres actifs (skin perso ou défaut)
    const activeSkin = parseInt(localStorage.getItem('activeSkin') || '0');
    const payload = { tileColor:'', tileTextColor:'', tileShape:'' };
    if (activeSkin === 2) {
        // Skin perso : utiliser les couleurs custom
        payload.tileColor     = document.documentElement.style.getPropertyValue('--custom-bg')    || '#ffffff';
        payload.tileTextColor = document.documentElement.style.getPropertyValue('--custom-text')  || '#18181b';
        payload.tileShape     = window._currentTileShape || 'rect';
    }
    // Mettre à jour les pickers dans le modal
    const bgEl    = document.getElementById('pe-tile-bg');
    const textEl  = document.getElementById('pe-tile-text');
    const shapeEl = document.getElementById('pe-tile-shape');
    if (bgEl)    bgEl.value    = payload.tileColor     || '#ffffff';
    if (textEl)  textEl.value  = payload.tileTextColor || '#18181b';
    if (shapeEl) shapeEl.value = payload.tileShape     || '';
    selectPintalkShape(payload.tileShape || window._currentTileShape || 'rect');
    _vibrate(10);
    // Vider tileShape individuel pour cette tuile (la valeur vide = utilise défaut)
    // (sera effectif à la sauvegarde via submitEditPostit)
}

async function submitEditPostit(postitId) {
    const name = document.getElementById('pe-name')?.value?.trim();
    if (!name) return alert(typeof t==='function' ? t('nameRequired') : 'Le nom est obligatoire.');

    const isPro = currentGroupConfig?.isPro;
    const payload = { name };
    if (isPro) {
        const dateVal = document.getElementById('pe-date')?.value;
        if (dateVal) payload.pickupDate = new Date(dateVal).toISOString();
        payload.phone = document.getElementById('pe-phone')?.value?.trim() || '';
        payload.orderNumber = document.getElementById('pe-ordernum')?.value?.trim() || '';
    }

    // Apparence de la tuile
    payload.tileColor     = document.getElementById('pe-tile-bg')?.value    || '';
    payload.tileTextColor = document.getElementById('pe-tile-text')?.value  || '';
    payload.tileShape     = document.getElementById('pe-tile-shape')?.value || '';

    // Upload logo si sélectionné
    const logoFile = document.getElementById('pe-tile-logo')?.files?.[0];
    if (logoFile) {
        try {
            const fd = new FormData(); fd.append('file', logoFile);
            const token = localStorage.getItem('token');
            const lr = await fetch('/api/upload', { method:'POST', headers:{'Authorization':`Bearer ${token}`}, body:fd });
            if (lr.ok) { const ld = await lr.json(); payload.tileLogoUrl = ld.url; }
        } catch(e) {}
    }

    const res = await fetchAuth('/api/postits/' + postitId, { method:'PUT', body: JSON.stringify(payload) });
    document.getElementById('pintalk-edit-modal')?.remove();
    if (res.ok) {
        await loadGroupData(currentGroupId);
        selectPostit(postitId);
    } else {
        alert('Erreur : ' + await res.text());
    }
}

async function submitInviteToPostit(postitId) {
    const email = document.getElementById('pe-invite-email')?.value?.trim();
    if (!email || !email.includes('@')) return alert('Email invalide.');

    // Inviter sur ce pintalk spécifiquement (accès postit-level)
    // Le serveur ajoute aussi la personne comme membre du groupe si pas encore dedans
    const res = await fetchAuth('/api/postits/' + postitId + '/invite', {
        method: 'POST',
        body: JSON.stringify({ email })
    });
    if (res.ok) {
        document.getElementById('pe-invite-email').value = '';
        // Recharger la liste des invités
        loadPostitInvites(postitId);
    } else {
        const txt = await res.text();
        alert('Erreur : ' + txt);
    }
}

async function loadPostitInvites(postitId) {
    const wrap = document.getElementById('pe-invites-list');
    if (!wrap) return;
    try {
        const res = await fetchAuth('/api/postits/' + postitId + '/invites');
        if (!res.ok) return;
        const emails = await res.json();
        if (!emails.length) {
            wrap.innerHTML = '<em style="opacity:0.4;font-size:10px;">Aucun invité</em>';
            return;
        }
        wrap.innerHTML = emails.map(email => `
            <div style="display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid rgba(0,0,0,0.05);">
                <span style="flex:1;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${email}</span>
                <button onclick="removePostitInvite('${postitId}','${email}')"
                        style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:15px;padding:2px;flex-shrink:0;">×</button>
            </div>`).join('');
    } catch(e) {}
}

async function removePostitInvite(postitId, email) {
    const res = await fetchAuth('/api/postits/' + postitId + '/invite/' + encodeURIComponent(email), { method:'DELETE' });
    if (res.ok) loadPostitInvites(postitId);
}

function confirmDeletePostit(postitId) {
    const el = document.getElementById('pintalk-edit-modal');
    if (!el) return;
    // Remplacer le contenu par une confirmation
    const conf = el.querySelector('div');
    if (conf) conf.innerHTML = `
        <div style="padding:20px;text-align:center;">
            <div style="font-size:32px;margin-bottom:12px;">🗑️</div>
            <div style="font-size:13px;font-weight:900;text-transform:uppercase;margin-bottom:8px;">${t('deletePintalkConfirm')}</div>
            <div style="font-size:10px;opacity:0.5;margin-bottom:20px;">${t('deletePintalkMsg')}</div>
            <div style="display:flex;gap:8px;">
                <button onclick="document.getElementById('pintalk-edit-modal').remove()"
                        style="flex:1;padding:12px;border:2px solid var(--accent);background:white;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">${t('cancel')}</button>
                <button onclick="executeDeletePostit('${postitId}')"
                        style="flex:1;padding:12px;background:#dc2626;color:white;border:none;font-weight:900;font-size:11px;text-transform:uppercase;cursor:pointer;">${t('deleteBtn')}</button>
            </div>
        </div>`;
}

async function executeDeletePostit(postitId) {
    document.getElementById('pintalk-edit-modal')?.remove();
    const res = await fetchAuth('/api/postits/' + postitId, { method:'DELETE' });
    if (res.ok) {
        currentPostitId = null;
        await loadGroupData(currentGroupId);
    } else {
        alert('Erreur : ' + await res.text());
    }
}


async function loadGroupData(groupId, forcePostitId = null) {
    const selDev = document.getElementById('sel-dev');
    const selPos = document.getElementById('sel-pos');

    if (!groupId || groupId === "null") {
        updateVisualHeader();
        return;
    }
    if (groupId !== currentGroupId) {
        currentGroupId = groupId;
        localStorage.setItem('currentGroupId', groupId);
        // Rejoindre la room socket du groupe pour recevoir uniquement
        // les messages de ce groupe (évite le broadcast global)
        if (typeof socket !== 'undefined' && socket) {
            socket.emit('join-group', groupId);
        }
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

        // 2. Charger les pintalks du rayon sélectionné
        if (selDev.value) {
            let url = `/api/postits?deviceId=${selDev.value}`;
            const filterDateEl = document.getElementById('filter-date');
            if (filterDateEl && filterDateEl.value) url += `&filterDate=${filterDateEl.value}`;

            const resPos = await fetchAuth(url);
            let allPostits = await resPos.json();

            // Appliquer le filtre de statut
            let postits = [...allPostits];
            const isPro = currentGroupConfig?.isPro;
            const myRole = currentGroupConfig?.myRole || 'owner';

            if (isPro) {
                // ── Vue CLIENT pro : uniquement ses propres commandes non terminées ──
                if (myRole === 'client') {
                    const userEmail = currentUser?.email || '';
                    postits = postits.filter(p => {
                        if (PRO_STATUS_CLOSED.includes(p.status)) return false;
                        // Ses commandes : ownerEmail ou dans allowedEmails
                        return p.ownerEmail === userEmail ||
                               (p.allowedEmails && p.allowedEmails.includes(userEmail));
                    });
                } else {
                    // ── Vue EMPLOYÉ / PROPRIO : pile complète filtrée ──
                    if (showFinished) {
                        postits = postits.filter(p => PRO_STATUS_CLOSED.includes(p.status));
                    } else {
                        const myDroits = currentGroupConfig?.myDroits || [];
                        const canSeeDraft = (myRole === 'owner') || myDroits.includes('voir_brouillons');
                        postits = postits.filter(p => {
                            if (PRO_STATUS_CLOSED.includes(p.status)) return false;
                            if (p.status === PRO_STATUS.BROUILLON && !canSeeDraft) return false;
                            return true;
                        });
                    }
                }
            } else {
                // ── Groupes PERSO — comportement original ──
                if (typeof showFinished !== 'undefined') {
                    if (showFinished) {
                        postits = postits.filter(p => PERSO_STATUS_CLOSED.includes(p.status));
                    } else {
                        postits = postits.filter(p => PERSO_STATUS_ACTIVE.includes(p.status));
                    }
                }
            }

            postits.sort((a, b) => new Date(a.pickupDate) - new Date(b.pickupDate));

            if (postits && postits.length > 0) {
                // Dernier pintalk mémorisé pour CE groupe spécifiquement
                const savedPintalk = localStorage.getItem('lastPintalk_' + groupId);
                const targetId = (forcePostitId && postits.find(p => p._id === forcePostitId))
                    ? forcePostitId
                    : (savedPintalk && postits.find(p => p._id === savedPintalk))
                        ? savedPintalk
                        : (currentPostitId && postits.find(p => p._id === currentPostitId))
                            ? currentPostitId
                            : postits[0]._id;
                currentPostitId = targetId;
                // Rendre les tuiles postits
                renderPostitTabs(postits, targetId);
                // Mettre à jour sel-pos caché
                if (selPos) selPos.value = targetId;
            } else {
                currentPostitId = null;
                renderPostitTabs([], null);
                if (selPos) { selPos.innerHTML = ''; selPos.value = ''; }
            }
        }

        // 3. Mise à jour header et vue
        updateVisualHeader();
        if (typeof refreshView === 'function') refreshView();
        // Charger l'historique UNIQUEMENT si un pintalk est sélectionné
        // (évite de bombarder le serveur à chaque changement de groupe)
        if (socket && currentGroupId && currentPostitId) {
            socket.emit('get-history', { groupId, postitId: currentPostitId });
        }
        if (typeof updateBadge === 'function') updateBadge();

    } catch (err) {
        console.error("Erreur loadGroupData:", err);
    }
}

function updateVisualHeader() {
    const selG = document.getElementById('sel-group');
    const selD = document.getElementById('sel-dev');
    const selP = document.getElementById('sel-pos');
    const stGrp = document.getElementById('st-grp');
    const stDev = document.getElementById('st-dev');
    const stPos = document.getElementById('st-pos');
    const stGrpMini = document.getElementById('st-grp-mini');

    const grpName = (currentGroupConfig && currentGroupConfig.name)
        ? currentGroupConfig.name
        : (selG && selG.selectedIndex !== -1 && selG.options[selG.selectedIndex]?.text
            ? selG.options[selG.selectedIndex].text : '…');

    if (stGrp) stGrp.innerText = grpName;
    if (stGrpMini) stGrpMini.innerText = grpName;
    if (stDev && selD && selD.selectedIndex !== -1)
        stDev.innerText = selD.options[selD.selectedIndex]?.text || '…';
    if (stPos && selP && selP.selectedIndex !== -1)
        stPos.innerText = (selP.options[selP.selectedIndex]?.text || '…').substring(0, 20);
}

// Met à jour l'input date quand on sélectionne un pintalk déjà créé
function filterPostitsByStatus(postits) {
    const isPro = currentGroupConfig?.isPro;
    if (isPro) {
        if (showFinished) {
            return postits.filter(p => PRO_STATUS_CLOSED.includes(p.status));
        } else {
            // Vue employé/proprio : tout sauf terminé/annulé (brouillons inclus selon droit)
            const myRole = currentGroupConfig?.myRole || 'client';
            const myDroits = currentGroupConfig?.myDroits || [];
            const canSeeDraft = (myRole === 'owner') || myDroits.includes('voir_brouillons');
            return postits.filter(p => {
                if (PRO_STATUS_CLOSED.includes(p.status)) return false;
                if (p.status === PRO_STATUS.BROUILLON && !canSeeDraft) return false;
                return true;
            });
        }
    }
    // Groupes perso — comportement original
    if (showFinished) {
        return postits.filter(p => PERSO_STATUS_CLOSED.includes(p.status));
    } else {
        return postits.filter(p => PERSO_STATUS_ACTIVE.includes(p.status));
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
    const gid = currentGroupId || document.getElementById('sel-group')?.value;
    if (gid) { loadGroupData(gid); }
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
        const isPro = currentGroupConfig?.isPro;
        if (isPro) {
            if (showFinished) {
                postits = postits.filter(p => PRO_STATUS_CLOSED.includes(p.status));
            } else {
                const myRole = currentGroupConfig?.myRole || 'owner';
                const myDroits = currentGroupConfig?.myDroits || [];
                const canSeeDraft = (myRole === 'owner') || myDroits.includes('voir_brouillons');
                postits = postits.filter(p => {
                    if (PRO_STATUS_CLOSED.includes(p.status)) return false;
                    if (p.status === PRO_STATUS.BROUILLON && !canSeeDraft) return false;
                    return true;
                });
            }
        } else {
            if (showFinished) {
                postits = postits.filter(p => PERSO_STATUS_CLOSED.includes(p.status));
            } else {
                postits = postits.filter(p => PERSO_STATUS_ACTIVE.includes(p.status));
            }
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
                sel.innerHTML = '<option value="">(Aucun pintalk)</option>';
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

function closeOrderModal() {
    const modal = document.getElementById('order-modal');
    if(modal) modal.classList.add('hidden');
}

async function deletePostit(id) {
    try {
            const res = await fetchAuth(`/api/postits/${id}`, { method: 'DELETE' });
            if (res.ok) {
                const gid = currentGroupId || document.getElementById('sel-group')?.value;
                if (gid) {
                    await loadGroupData(gid);
                    await refreshParamsLists();
                    const checkP = document.getElementById('check-p');
                    if (checkP) checkP.checked = true;
                }
            }
        } catch (err) {
            console.error("Erreur deletePostit:", err);
        }
}

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

function uiCreatePostit(e) {
    if(e) e.stopPropagation();
    editingPostitId = null;
    document.getElementById('order-client').value = "";
    document.getElementById('order-num').value = "";
    document.getElementById('order-phone').value = "";
    document.getElementById('order-date').value = "";
    const isPro = currentGroupConfig && currentGroupConfig.isPro;
    const proFlds = document.getElementById('order-pro-fields');
    if (proFlds) proFlds.style.display = isPro ? '' : 'none';
    const titleEl = document.getElementById('order-modal-title') || document.querySelector('#order-modal h2');
    if (titleEl) titleEl.innerText = isPro ? "Nouvelle Commande" : "Nouveau Pintalk";
    document.getElementById('order-modal').classList.remove('hidden');
}

async function deleteDevice(id) {
    try {
        const res = await fetchAuth(`/api/devices/${id}`, { method: 'DELETE' });

        if (res.ok) {
            const selGroup = document.getElementById('sel-group');
            const currentGid = selGroup ? selGroup.value : null;

            // Si on a supprimé le rayon actif, on vide le header
            updateVisualHeader();
            
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

