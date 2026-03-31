async function login() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-pass').value;

    if (!email || !password) return alert("Email et mot de passe requis");

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        if (res.ok) {
            const data = await res.json();
            localStorage.setItem('user', JSON.stringify(data.user));
            // On force le rechargement complet
            window.location.href = "/"; 
        } else {
            const errorMsg = await res.text();
            alert("Erreur : " + errorMsg);
        }
    } catch (err) {
        alert("Impossible de contacter le serveur");
    }
}