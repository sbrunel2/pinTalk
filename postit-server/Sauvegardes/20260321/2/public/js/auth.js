async function login() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-pass').value;
    if (!email || !password) return alert("Champs requis");

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        if (res.ok) {
            const data = await res.json();
            localStorage.setItem('user', JSON.stringify(data.user));
            window.location.href = "/"; 
        } else {
            alert("Erreur d'authentification");
        }
    } catch (err) { alert("Serveur injoignable"); }
}