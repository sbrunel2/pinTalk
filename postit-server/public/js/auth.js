let isRegisterMode = false;

function toggleAuthMode() {
    isRegisterMode = !isRegisterMode;
    const nameInput = document.getElementById('auth-name');
    const btn = document.getElementById('auth-btn');
    const toggleText = document.getElementById('auth-toggle');

    if (isRegisterMode) {
        nameInput.classList.remove('hidden');
        btn.innerText = "Créer mon compte";
        toggleText.innerText = "Déjà inscrit ? Se connecter";
    } else {
        nameInput.classList.add('hidden');
        btn.innerText = "Connexion";
        toggleText.innerText = "Pas de compte ? Créer un compte";
    }
}

async function handleAuth() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-pass').value;
    const name = document.getElementById('auth-name').value;

    if (!email || !password || (isRegisterMode && !name)) {
        return alert("Veuillez remplir tous les champs");
    }

    const endpoint = isRegisterMode ? '/api/register' : '/api/login';
    const payload = isRegisterMode ? { name, email, password } : { email, password };

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const data = await res.json();
            localStorage.setItem('user', JSON.stringify(data.user));
            if (data.token) localStorage.setItem('token', data.token);
            window.location.href = "/"; 
        } else {
            const errData = await res.json();
            alert(errData.message || "Erreur d'authentification");
        }
    } catch (err) { 
        alert("Serveur injoignable"); 
    }
}