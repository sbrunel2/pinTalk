// helpers/auth.js
const jwt = require('jsonwebtoken');

function generateJoinCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).send("Accès refusé : Token manquant");

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            console.log("Erreur JWT :", err.message);
            return res.status(403).send("Token invalide ou expiré");
        }
        req.user = user;
        next();
    });
};

module.exports = { authenticateToken, generateJoinCode };
