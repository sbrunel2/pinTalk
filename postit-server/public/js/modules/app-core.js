let socket;
let allMsgs = [];
let currentUser = null; // Toujours null au démarrage — rempli après login
const _aiExtractInProgress = new Set(); // Verrou anti-doublon IA par messageId
let currentGroupId = localStorage.getItem('currentGroupId') || null;
let currentGroupConfig = null; // { type, isPro, hasRayons, myRole, name }

// ─── HEADER RÉDUCTIBLE ───────────────────────────────────────────────────────
let headerCollapsed = localStorage.getItem('headerCollapsed') === '1';

function toggleHeader() {
    headerCollapsed = !headerCollapsed;
    localStorage.setItem('headerCollapsed', headerCollapsed ? '1' : '0');
    applyHeaderState();
}

function applyHeaderState() {
    const hdr = document.getElementById('fixed-header');
    const icon = document.getElementById('header-toggle-icon');
    if (!hdr) return;
    if (headerCollapsed) {
        hdr.classList.add('collapsed');
        if (icon) icon.innerText = '▼';
    } else {
        hdr.classList.remove('collapsed');
        if (icon) icon.innerText = '▲';
    }
}

function setUserDisplay() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const el = document.getElementById('user-name-display');
    if (el && user.name) el.innerText = user.name + (user.email ? ' (' + user.email + ')' : '');
}

// ─── SKINS ───────────────────────────────────────────────────────────────────
// Valeurs par défaut de la skin Défaut
const SKIN_DEFAULTS = {
    '--custom-bg':'#efeee9','--custom-accent':'#18181b','--custom-text':'#18181b',
    '--custom-field':'#ffffff','--custom-btn-bg':'#18181b','--custom-btn-text':'#ffffff',
    '--bubble-me-bg':'#18181b','--bubble-me-text':'#ffffff',
    '--bubble-other-bg':'#ffffff','--bubble-other-text':'#18181b',
    '--font-family':'sans-serif','--font-size':'14px','--border-w':'2px',
    '--tile-radius':'0px','--btn-radius':'0px',
};

function applySkin(n) {
    document.body.classList.remove('skin-1','skin-2');
    if (n === 1) document.body.classList.add('skin-1');
    if (n === 2) document.body.classList.add('skin-2');
    localStorage.setItem('activeSkin', n);

    // Mettre à jour les boutons
    document.querySelectorAll('.skin-btn').forEach((b,i) => {
        b.classList.toggle('active', i === n);
    });

    // Afficher/masquer les pickers
    const pickers = document.getElementById('skin-color-pickers');
    if (pickers) {
        if (n === 2) {
            pickers.classList.add('visible');
            pickers.style.display = 'block';
        } else {
            pickers.classList.remove('visible');
            pickers.style.display = 'none';
        }
    }

    // Skin 0 (Défaut) ou 1 (Ardoise) → réinitialiser toutes les variables CSS custom
    if (n !== 2) {
        const cssVarsToReset = [
            '--custom-bg','--custom-accent','--custom-text','--custom-field',
            '--custom-btn-bg','--custom-btn-text',
            '--bubble-me-bg','--bubble-me-text','--bubble-other-bg','--bubble-other-text',
            '--font-family','--font-size','--border-w','--tile-radius','--btn-radius',
        ];
        cssVarsToReset.forEach(v => {
            document.documentElement.style.removeProperty(v);
        });
        // Réinitialiser les pickers
        const pickerMap = { '--custom-bg':'c-bg','--custom-accent':'c-accent',
            '--custom-text':'c-text','--custom-field':'c-field',
            '--custom-btn-bg':'c-btn-bg','--custom-btn-text':'c-btn-text',
            '--bubble-me-bg':'c-bubble-me-bg','--bubble-me-text':'c-bubble-me-text',
            '--bubble-other-bg':'c-bubble-other-bg','--bubble-other-text':'c-bubble-other-text',
        };
        Object.entries(SKIN_DEFAULTS).forEach(([k,v]) => {
            document.documentElement.style.setProperty(k, v);
            if (pickerMap[k]) {
                const el = document.getElementById(pickerMap[k]);
                if (el) el.value = v;
            }
        });
        // Réinitialiser formes
        setDefaultTileShape('rect');
        setDefaultBtnShape('rect');
        // Supprimer image de fond custom
        document.body.style.backgroundImage = '';
        document.body.classList.remove('has-bg-image');
        // Réinitialiser sliders
        ['c-fontsize','c-border','c-radius'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                if (id === 'c-fontsize') el.value = '14';
                else if (id === 'c-border') el.value = '2';
                else el.value = '0';
            }
        });
        ['font-size-val','border-val','radius-val'].forEach((id,i) => {
            const el = document.getElementById(id);
            if (el) el.textContent = ['14','2','0'][i];
        });
        // NE PAS effacer le localStorage des couleurs — juste ne pas les appliquer
    }
}

function applyCustomColors() {
    const vars = {
        '--custom-bg':       document.getElementById('c-bg')?.value       || '#efeee9',
        '--custom-accent':   document.getElementById('c-accent')?.value   || '#18181b',
        '--custom-text':     document.getElementById('c-text')?.value     || '#18181b',
        '--custom-field':    document.getElementById('c-field')?.value    || '#ffffff',
        '--custom-btn-bg':   document.getElementById('c-btn-bg')?.value   || '#18181b',
        '--custom-btn-text': document.getElementById('c-btn-text')?.value || '#ffffff',
    };
    Object.entries(vars).forEach(([k,v]) => {
        document.documentElement.style.setProperty(k, v);
        localStorage.setItem(k, v);
    });

    // Police
    const font     = document.getElementById('c-font')?.value     || 'sans-serif';
    const fontSize = document.getElementById('c-fontsize')?.value || '14';
    const border   = document.getElementById('c-border')?.value   || '2';
    const radius   = document.getElementById('c-radius')?.value   || '0';

    document.documentElement.style.setProperty('--font-family', font);
    document.documentElement.style.setProperty('--font-size',   fontSize + 'px');
    document.documentElement.style.setProperty('--border-w',    border + 'px');
    document.documentElement.style.setProperty('--tile-radius', radius + 'px');

    localStorage.setItem('customFont', font);
    localStorage.setItem('customFontSize', fontSize);
    localStorage.setItem('customBorder', border);
    localStorage.setItem('customRadius', radius);

    // Couleurs bulles de conversation
    const bubbleMeBg    = document.getElementById('c-bubble-me-bg')?.value    || '#18181b';
    const bubbleMeText  = document.getElementById('c-bubble-me-text')?.value  || '#ffffff';
    const bubbleOtherBg = document.getElementById('c-bubble-other-bg')?.value || '#ffffff';
    const bubbleOtherText=document.getElementById('c-bubble-other-text')?.value|| '#18181b';
    document.documentElement.style.setProperty('--bubble-me-bg',     bubbleMeBg);
    document.documentElement.style.setProperty('--bubble-me-text',   bubbleMeText);
    document.documentElement.style.setProperty('--bubble-other-bg',  bubbleOtherBg);
    document.documentElement.style.setProperty('--bubble-other-text',bubbleOtherText);
    localStorage.setItem('bubbleMeBg',     bubbleMeBg);
    localStorage.setItem('bubbleMeText',   bubbleMeText);
    localStorage.setItem('bubbleOtherBg',  bubbleOtherBg);
    localStorage.setItem('bubbleOtherText',bubbleOtherText);

    // Appliquer bordure dynamique
    document.querySelectorAll('input:not([type=range]):not([type=color]):not([type=file]):not([type=checkbox]):not([type=radio]), select, textarea').forEach(el => {
        el.style.borderWidth = border + 'px';
    });
}

// ── Mesure hauteur header → CSS var ──────────────────────────
function measureHeaderHeight() {
    const hdr = document.getElementById('fixed-header');
    if (!hdr) return;
    const h = hdr.offsetHeight + 4;
    document.documentElement.style.setProperty('--header-h', h + 'px');
}

// Observer les changements de taille du header (replié/déployé)
const _hdrObserver = new ResizeObserver(() => measureHeaderHeight());
document.addEventListener('DOMContentLoaded', () => {
    const hdr = document.getElementById('fixed-header');
    if (hdr) _hdrObserver.observe(hdr);
    const langSel = document.getElementById('ai-dict-lang');
    const local = JSON.parse(localStorage.getItem('user') || '{}');
    if (langSel) {
        langSel.value = local.lang || 'fr';
        langSel.addEventListener('change', () => loadAiDictionaryUI());
    }
    loadAiDictionaryUI();
    _initSelectionMenu();
});

function _vibrate(pattern) {
    try {
        if (navigator && navigator.vibrate) {
            navigator.vibrate(pattern);
        }
    } catch(e) { /* silencieux */ }
}

function _redirectToLogin(reason) {
    console.warn('Session expirée ou non authentifié :', reason);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    currentUser = null;
    // Afficher l'écran de login
    const authScreen = document.getElementById('auth-screen');
    const appContent = document.getElementById('viewport');
    const fixedHdr   = document.querySelector('.fixed-header');
    const tabBar     = document.querySelector('.tab-bar');
    if (authScreen) {
        authScreen.style.display = 'flex';
        authScreen.classList.remove('hidden');
    }
    if (appContent) appContent.style.display = 'none';
    if (fixedHdr)   fixedHdr.style.display   = 'none';
    if (tabBar)     tabBar.style.display      = 'none';
}

async function fetchAuth(url, options = {}, noRedirect = false) {
    const token = localStorage.getItem('token');
    if (!token) {
        if (!noRedirect) _redirectToLogin('token manquant');
        return new Response(JSON.stringify({message: 'Non authentifié'}), {status: 401});
    }
    const headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
    let res;
    try {
        res = await fetch(url, { ...options, headers });
    } catch(e) {
        console.error('fetchAuth réseau:', e);
        throw e;
    }
    // Token expiré ou invalide → retour au login
    if (res.status === 401 || res.status === 403) {
        const body = await res.text();
        if (!noRedirect && (body.includes('xpiré') || body.includes('xpired') || body.includes('nvalide') || body.includes('nvalid') || res.status === 401)) {
            _redirectToLogin(body);
            return new Response(JSON.stringify({message: 'Session expirée'}), {status: 401});
        }
    }
    return res;
}

async function uiDeleteAccount() {
    // Double confirmation
    const c1 = confirm('⚠️ ATTENTION\n\nVous allez supprimer définitivement votre compte et TOUTES vos données.\n\nCette action est IRRÉVERSIBLE.\n\nContinuer ?');
    if (!c1) return;
    const c2 = confirm('DERNIÈRE CONFIRMATION\n\nToutes vos données seront effacées : groupes, pintalk, messages, profil.\n\nÊtes-vous absolument certain(e) ?');
    if (!c2) return;

    try {
        const res = await fetchAuth('/api/user/account', { method: 'DELETE' });
        if (res.ok) {
            // Effacer tout le localStorage
            localStorage.clear();
            // Retourner à l'écran de login
            _redirectToLogin('compte supprimé');
            alert('Votre compte a été supprimé. Au revoir !');
        } else {
            alert('Erreur : ' + await res.text());
        }
    } catch(e) {
        alert('Erreur réseau.');
    }
}

// ── Invitation par email ─────────────────────────────────────────────────────
async function sendEmailInvite(groupId) {
    const email = document.getElementById('new-member-email')?.value?.trim();
    if (!email || !email.includes('@')) return alert('Entrez un email valide.');
    try {
        const res = await fetchAuth('/api/invite', { method:'POST', body: JSON.stringify({ email, groupId }) });
        if (res.ok) {
            const d = await res.json();
            alert(`✅ Invitation envoyée à ${email}\n\nLien : ${d.inviteUrl}`);
        } else alert('Erreur : ' + await res.text());
    } catch(e) { alert('Erreur réseau.'); }
}

// ── Gestion du token d'invitation dans l'URL ──────────────────────────────────
async function handleInviteToken() {
    const params = new URLSearchParams(window.location.search);
    const token  = params.get('invite');
    const email  = params.get('email');
    const group  = params.get('group');
    const error  = params.get('error');

    if (error) {
        const msgs = { invite_expired:'Invitation expirée.', group_not_found:'Groupe introuvable.', invite_error:"Erreur d'invitation." };
        alert(msgs[error] || 'Erreur.');
        window.history.replaceState({}, '', '/');
        return;
    }
    if (!token) return;

    // Nettoyer l'URL
    window.history.replaceState({}, '', '/');

    // Si l'utilisateur est connecté → rejoindre directement
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
        try {
            const res = await fetch('/api/join', {
                method:'POST',
                headers:{'Content-Type':'application/json','Authorization':`Bearer ${storedToken}`},
                body: JSON.stringify({ token })
            });
            if (res.ok) {
                const d = await res.json();
                alert(`✅ Vous avez rejoint le groupe "${d.groupName}" !`);
                loadGroupsList();
            }
        } catch(e) {}
    } else {
        // Mémoriser le token pour après connexion
        localStorage.setItem('pendingInviteToken', token);
        alert('Vous avez été invité(e) dans ce groupe. Connectez-vous ou créez un compte pour rejoindre.');
    }
}

// ── Vérification téléphone ────────────────────────────────────────────────────
async function uiVerifyPhone() {
    const phone = document.getElementById('prof-phone')?.value?.trim();
    if (!phone || phone.length < 8) return alert('Entrez votre numéro de téléphone.');

    // Envoyer le code
    try {
        const res = await fetchAuth('/api/send-phone-code', { method:'POST', body: JSON.stringify({ phone }) });
        if (!res.ok) return alert('Erreur : ' + await res.text());
    } catch(e) { return alert('Erreur réseau.'); }

    // Demander le code
    const code = prompt('Un code a été envoyé à votre email.\nEntrez le code de vérification (6 chiffres) :');
    if (!code) return;

    try {
        const res2 = await fetchAuth('/api/verify-phone', { method:'POST', body: JSON.stringify({ code }) });
        if (res2.ok) {
            alert('✅ Téléphone vérifié !');
            document.getElementById('prof-phone')?.setAttribute('data-verified', 'true');
        } else alert('Erreur : ' + await res2.text());
    } catch(e) { alert('Erreur réseau.'); }
}

async function initApp() {
    // Charger les préférences utilisateur (couleurs/formes/ordre des tuiles)
    await _loadUserPrefs();

    // Gérer les tokens d'invitation dans l'URL
    handleInviteToken();

    // Gérer les invitations en attente (après connexion)
    const pendingToken = localStorage.getItem('pendingInviteToken');
    if (pendingToken) {
        localStorage.removeItem('pendingInviteToken');
        try {
            const storedToken = localStorage.getItem('token');
            if (storedToken) {
                const r = await fetch('/api/join', {
                    method:'POST',
                    headers:{'Content-Type':'application/json','Authorization':`Bearer ${storedToken}`},
                    body: JSON.stringify({ token: pendingToken })
                });
                if (r.ok) {
                    const d = await r.json();
                    setTimeout(() => alert(`✅ Vous avez rejoint le groupe "${d.groupName}" !`), 1000);
                }
            }
        } catch(e) {}
    }

    // Guard : détruire tout socket précédent pour éviter les listeners en doublon
    if (socket) {
        try { socket.removeAllListeners(); socket.disconnect(); } catch(e) {}
        socket = null;
    }
    socket = io({
        auth: { token: localStorage.getItem('token') },
        forceNew: true
    });

    // Rejoindre la room du groupe courant dès que le socket est connecté
    socket.on('connect', () => {
        if (currentGroupId) {
            socket.emit('join-group', currentGroupId);
            console.log('[SOCKET] join-group', currentGroupId);
        }
    });

    socket.on('new-message', m => {
        allMsgs.unshift(m);
        // Déclencher l'analyse IA UNIQUEMENT sur les nouveaux messages
        // (pas sur le rechargement de l'historique)
        try {
            const isMine    = !!(currentUser && m.senderName === currentUser.name);
            const isText    = (!m.type || m.type === 'text');
            const isUserMsg = (m.senderName !== '✨ IA');
            const hiddenFromEink = (m.isNote === true);
            // _historyJustLoaded : flag positionné pendant 2s après history-data
            // → évite de relancer l'IA sur des messages de l'historique
            const isFromHistory = !!window._historyJustLoaded;
            if (isMine && isText && isUserMsg && !hiddenFromEink && m.postitId && !isFromHistory) {
                // Ne lancer l'IA que si ce message n'a pas encore de note IA liée
                const alreadyHasAi = allMsgs.some(x =>
                    x.senderName === '✨ IA' &&
                    x.postitId   === m.postitId &&
                    x.sourceMessageId === m._id  // sourceMessageId DOIT correspondre
                );
                if (!alreadyHasAi && !_aiExtractInProgress.has(m._id)) {
                    _aiExtractInProgress.add(m._id);
                    setTimeout(() => aiAutoExtract(m.content || '', m.postitId, m._id), 120);
                }
            }
        } catch(e) {}
        refreshView(true);
    });

    socket.on('history-data', h => {
        allMsgs = h;
        // Marquer qu'on vient de charger l'historique pendant 2s
        // pour bloquer les déclenchements IA intempestifs
        window._historyJustLoaded = true;
        clearTimeout(window._historyLoadedTimer);
        window._historyLoadedTimer = setTimeout(() => { window._historyJustLoaded = false; }, 2000);
        refreshView(true);
    });
    socket.on('message-updated', (data) => {
        const msg = allMsgs.find(m => m._id === data.messageId);
        if (msg) { msg.isNote = data.isNote; refreshView(false); }
    });
    socket.on('message-content-updated', (data) => {
        const msg = allMsgs.find(m => m._id === data.messageId);
        if (msg) { msg.content = data.newContent; refreshView(false); }
    });
    socket.on('message-deleted', (id) => {
        const deleted = allMsgs.find(m => m._id === id);
        const isAiNote = deleted?.senderName === '✨ IA';

        // Retirer le message de allMsgs
        // Si c'est un message user : retirer aussi ses notes IA liées (orphelines)
        allMsgs = allMsgs.filter(m => {
            if (m._id === id) return false;
            if (!isAiNote && m.senderName === '✨ IA' && m.sourceMessageId === id) return false;
            return true;
        });

        // Appeler _deleteAiNotesForMessage UNIQUEMENT pour les messages user
        // (pas pour les notes IA — évite la récursion et les doublons)
        if (deleted && !isAiNote) {
            _deleteAiNotesForMessage(id, deleted.postitId).catch(() => {});
        }

        refreshView(false);
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
		// Si on est sur le pintalk concerné, on rafraîchit la vue
		const pSel = document.getElementById('sel-pos');
		if (pSel && pSel.value === data.postitId) {
			refreshView(false);
		}
	});

    // Session remplacée par un autre appareil
    socket.on('session-replaced', () => {
        socket.removeAllListeners();
        socket.disconnect();
        alert('\u26a0\ufe0f Votre session a été reprise sur un autre appareil. Reconnectez-vous.');
        const vp   = document.getElementById('viewport');
        const hdr  = document.querySelector('.fixed-header');
        const tabs = document.querySelector('.tab-bar');
        const auth = document.getElementById('auth-screen');
        if (vp)   vp.style.display   = 'none';
        if (hdr)  hdr.style.display  = 'none';
        if (tabs) tabs.style.display = 'none';
        if (auth) { auth.style.display = 'flex'; auth.classList.remove('hidden'); }
    });
    applyHeaderState();
    setUserDisplay();
    initSkin();
    measureHeaderHeight();

    // Annuler le mode édition si tap en dehors de la bulle en cours
    document.addEventListener('touchstart', (e) => {
        if (!window._editingMessageId) return;
        const editId  = window._editingMessageId;
        const swipeEl = document.getElementById('swipe-' + editId);
        const banner  = document.getElementById('edit-mode-banner');
        const selMenu = document.getElementById('selection-context-menu');
        // Ignorer si tap sur la bulle en cours, le bandeau, ou le menu sélection
        if (swipeEl?.contains(e.target)) return;
        if (banner?.contains(e.target)) return;
        if (selMenu?.contains(e.target)) return;
        if (typeof _cancelEditMode === 'function') _cancelEditMode();
    }, { passive: true });
    loadProfile();
    if (typeof initLang === 'function') initLang();

    // Chargement initial des groupes — un seul appel, navigation.js ne doublonnera pas
    // car goToPage est appelé APRÈS initApp depuis auth.js
    await refreshParamsLists();
    // Restaurer la config UI du dernier groupe visité
    if (currentGroupId) {
        try {
            const res = await fetchAuth('/api/groups/' + currentGroupId + '/config');
            if (res.ok) {
                currentGroupConfig = await res.json();
                applyGroupConfig();
                // Mettre à jour le badge GRP dans le header
                const stGrp = document.getElementById('st-grp');
                if (stGrp && currentGroupConfig.name) stGrp.innerText = currentGroupConfig.name.toUpperCase();
            }
        } catch(e) { console.warn('config restore:', e); }
    }
}

function truncate(str, limit = 30) {
    if (!str) return "";
    return str.length > limit ? str.substring(0, limit) + "..." : str;
}

// --- NOUVELLES FONCTIONS DE CRÉATION VIA BOUTON 3D ---
let lastCreatedId = null;
function autoResizeInput(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function togglePassVis(inputId, btn) {
    const inp = document.getElementById(inputId);
    if (!inp) return;
    const isHidden = inp.type === 'password';
    inp.type = isHidden ? 'text' : 'password';
    btn.textContent = isHidden ? '🔒' : '👁';
    btn.style.opacity = isHidden ? '0.7' : '0.5';
}

function logout() { localStorage.removeItem('user'); location.reload(); }

