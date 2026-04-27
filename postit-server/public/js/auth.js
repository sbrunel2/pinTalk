// ═══════════════════════════════════════════════════════════════════════
// AUTH — Connexion / Inscription complète avec i18n
// ═══════════════════════════════════════════════════════════════════════
let isRegisterMode = false;

// ── Helpers i18n (disponibles avant app.js) ───────────────────────────
function _t(key) {
    if (typeof t === 'function') return t(key);
    const fallback = {
        login:'Connexion', register:'Créer mon compte',
        emailLabel:'Email', passwordLabel:'Mot de passe',
        firstname:'Prénom', lastname:'Nom', fullName:'Nom complet',
        phone:'Téléphone', lang:'Langue',
        noAccount:'Pas de compte ? Créer un compte',
        hasAccount:'Déjà inscrit ? Se connecter',
        nameRequired:'Veuillez remplir tous les champs',
    };
    return fallback[key] || key;
}

// ── Rendu du formulaire ───────────────────────────────────────────────
function renderAuthForm() {
    const screen = document.getElementById('auth-screen');
    if (!screen) return;

    if (!isRegisterMode) {
        // MODE CONNEXION
        screen.innerHTML = `
        <div style="max-width:380px;margin:0 auto;width:100%;">
            <h1 class="font-black italic uppercase" style="font-size:28px;margin-bottom:8px;letter-spacing:-1px;">e-Postit<br>Pro</h1>
            <p style="font-size:10px;opacity:0.4;font-weight:900;text-transform:uppercase;margin-bottom:32px;">Gestion de commandes pro</p>

            <div style="margin-bottom:12px;">
                <div style="font-size:8px;font-weight:900;text-transform:uppercase;opacity:0.5;margin-bottom:4px;" id="lbl-email">${_t('emailLabel')}</div>
                <input type="email" id="auth-email" placeholder="${_t('emailLabel')}"
                       style="width:100%;padding:12px;border:2px solid var(--accent);font-size:14px;background:white;box-sizing:border-box;">
            </div>
            <div style="margin-bottom:20px;">
                <div style="font-size:8px;font-weight:900;text-transform:uppercase;opacity:0.5;margin-bottom:4px;">${_t('passwordLabel')}</div>
                <input type="password" id="auth-pass" placeholder="${_t('passwordLabel')}"
                       style="width:100%;padding:12px;border:2px solid var(--accent);font-size:14px;background:white;box-sizing:border-box;">
            </div>
            <button id="auth-btn" onclick="handleAuth()"
                    style="width:100%;padding:14px;background:var(--accent);color:white;border:none;font-weight:900;font-size:13px;text-transform:uppercase;cursor:pointer;margin-bottom:12px;">
                ${_t('login')}
            </button>
            <p id="auth-toggle" onclick="switchToRegister()"
               style="text-align:center;font-size:11px;opacity:0.5;cursor:pointer;text-decoration:underline;font-weight:700;">
                ${_t('noAccount')}
            </p>
        </div>`;
    } else {
        // MODE INSCRIPTION — langue d'abord
        screen.innerHTML = `
        <div style="max-width:380px;margin:0 auto;width:100%;overflow-y:auto;max-height:calc(100vh - 40px);">
            <h1 class="font-black italic uppercase" style="font-size:22px;margin-bottom:4px;">Créer un compte</h1>
            <p style="font-size:9px;opacity:0.4;font-weight:900;text-transform:uppercase;margin-bottom:20px;">Toutes les informations sont requises</p>

            <!-- 1. LANGUE EN PREMIER -->
            <div style="margin-bottom:14px;padding:10px;border:2px solid var(--accent);background:white;">
                <div style="font-size:8px;font-weight:900;text-transform:uppercase;opacity:0.5;margin-bottom:6px;" id="lbl-lang">${_t('lang')}</div>
                <select id="auth-lang" onchange="onRegisterLangChange(this.value)"
                        style="width:100%;padding:10px;border:2px solid rgba(0,0,0,0.15);font-size:14px;background:white;box-sizing:border-box;">
                    <option value="fr">🇫🇷 Français</option>
                    <option value="en">🇬🇧 English</option>
                    <option value="es">🇪🇸 Español</option>
                    <option value="de">🇩🇪 Deutsch</option>
                    <option value="it">🇮🇹 Italiano</option>
                </select>
            </div>

            <!-- 2. Prénom / Nom -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
                <div>
                    <div style="font-size:8px;font-weight:900;text-transform:uppercase;opacity:0.5;margin-bottom:4px;" id="lbl-firstname">${_t('firstname')}</div>
                    <input type="text" id="auth-firstname" placeholder="${_t('firstname')}"
                           style="width:100%;padding:10px;border:2px solid var(--accent);font-size:13px;background:white;box-sizing:border-box;">
                </div>
                <div>
                    <div style="font-size:8px;font-weight:900;text-transform:uppercase;opacity:0.5;margin-bottom:4px;" id="lbl-lastname">${_t('lastname')}</div>
                    <input type="text" id="auth-lastname" placeholder="${_t('lastname')}"
                           style="width:100%;padding:10px;border:2px solid var(--accent);font-size:13px;background:white;box-sizing:border-box;">
                </div>
            </div>

            <!-- 3. Email -->
            <div style="margin-bottom:12px;">
                <div style="font-size:8px;font-weight:900;text-transform:uppercase;opacity:0.5;margin-bottom:4px;" id="lbl-email2">${_t('emailLabel')}</div>
                <input type="email" id="auth-email" placeholder="${_t('emailLabel')}"
                       style="width:100%;padding:10px;border:2px solid var(--accent);font-size:13px;background:white;box-sizing:border-box;">
            </div>

            <!-- 4. Téléphone -->
            <div style="margin-bottom:12px;">
                <div style="font-size:8px;font-weight:900;text-transform:uppercase;opacity:0.5;margin-bottom:4px;" id="lbl-phone">${_t('phone')}</div>
                <input type="tel" id="auth-phone" placeholder="${_t('phone')}"
                       style="width:100%;padding:10px;border:2px solid rgba(0,0,0,0.2);font-size:13px;background:white;box-sizing:border-box;">
            </div>

            <!-- 5. Mot de passe -->
            <div style="margin-bottom:20px;">
                <div style="font-size:8px;font-weight:900;text-transform:uppercase;opacity:0.5;margin-bottom:4px;" id="lbl-pass">${_t('passwordLabel')}</div>
                <input type="password" id="auth-pass" placeholder="${_t('passwordLabel')}"
                       style="width:100%;padding:10px;border:2px solid var(--accent);font-size:13px;background:white;box-sizing:border-box;">
            </div>

            <button id="auth-btn" onclick="handleAuth()"
                    style="width:100%;padding:14px;background:var(--accent);color:white;border:none;font-weight:900;font-size:13px;text-transform:uppercase;cursor:pointer;margin-bottom:12px;">
                ${_t('register')}
            </button>
            <p id="auth-toggle" onclick="switchToLogin()"
               style="text-align:center;font-size:11px;opacity:0.5;cursor:pointer;text-decoration:underline;font-weight:700;">
                ${_t('hasAccount')}
            </p>
        </div>`;

        // Restaurer la langue si déjà choisie
        const savedLang = localStorage.getItem('lang') || 'fr';
        const sel = document.getElementById('auth-lang');
        if (sel) sel.value = savedLang;
    }
}

function switchToRegister() {
    isRegisterMode = true;
    renderAuthForm();
}

function switchToLogin() {
    isRegisterMode = false;
    renderAuthForm();
}

// Changement de langue pendant l'inscription : re-render immédiat
function onRegisterLangChange(lang) {
    localStorage.setItem('lang', lang);
    // Mettre à jour _currentLang si i18n chargé
    if (typeof applyLang === 'function') applyLang(lang);
    // Re-render le formulaire avec la nouvelle langue
    renderAuthForm();
    // Repasser en mode register
    isRegisterMode = true;
    renderAuthForm();
    // Remettre la langue sélectionnée
    const sel = document.getElementById('auth-lang');
    if (sel) sel.value = lang;
}

// Ancien toggleAuthMode pour compatibilité
function toggleAuthMode() {
    if (isRegisterMode) switchToLogin(); else switchToRegister();
}

async function handleAuth() {
    const email    = document.getElementById('auth-email')?.value?.trim();
    const password = document.getElementById('auth-pass')?.value;

    if (!email || !password) {
        return alert(_t('nameRequired'));
    }

    let endpoint, payload;

    if (isRegisterMode) {
        const firstname = document.getElementById('auth-firstname')?.value?.trim() || '';
        const lastname  = document.getElementById('auth-lastname')?.value?.trim()  || '';
        const phone     = document.getElementById('auth-phone')?.value?.trim()     || '';
        const lang      = document.getElementById('auth-lang')?.value              || 'fr';

        if (!firstname && !lastname) {
            return alert(_t('nameRequired'));
        }

        endpoint = '/api/register';
        payload  = {
            name: `${firstname} ${lastname}`.trim(),
            firstname, lastname, email, password, phone, lang
        };
    } else {
        endpoint = '/api/login';
        payload  = { email, password };
    }

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const data = await res.json();
            currentUser = data.user;
            localStorage.setItem('user',  JSON.stringify(data.user));
            localStorage.setItem('token', data.token);
            if (data.user?.lang) {
                localStorage.setItem('lang', data.user.lang);
                if (typeof applyLang === 'function') applyLang(data.user.lang);
            }

            // Masquer l'auth-screen
            const authScreen = document.getElementById('auth-screen');
            if (authScreen) { authScreen.style.display = 'none'; authScreen.classList.add('hidden'); }

            // Afficher viewport, header, tab-bar
            const vp   = document.getElementById('viewport');
            const hdr  = document.querySelector('.fixed-header');
            const tabs = document.querySelector('.tab-bar');
            if (vp)   vp.style.display   = 'flex';
            if (hdr)  hdr.style.display  = 'flex';
            if (tabs) tabs.style.display = 'flex';

            // Lancer l'application
            if (typeof initApp === 'function') {
                try { await initApp(); } catch(e) { console.error('initApp error:', e); }
            }
            // Aller sur la page des groupes et charger la liste
            const targetPage = (typeof PAGE_GROUPES !== 'undefined') ? PAGE_GROUPES : 2;
            if (typeof goToPage === 'function') goToPage(targetPage);
            // Forcer le chargement de la grille des groupes
            if (typeof loadGroupsList === 'function') {
                setTimeout(() => loadGroupsList(), 100);
            }

        } else {
            const err = await res.json().catch(() => ({ message: res.statusText }));
            alert(err.message || 'Erreur');
        }
    } catch (err) {
        alert(_t('errorNetwork'));
    }
}

// Initialiser le formulaire au chargement
document.addEventListener('DOMContentLoaded', () => {
    renderAuthForm();
});
