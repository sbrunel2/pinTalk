// helpers/mail.js
const nodemailer = require('nodemailer');

// Codes de vérification en mémoire (à remplacer par Redis en prod)
const _phoneCodes = new Map();   // email → { code, phone, expires }
const _inviteCodes = new Map();  // token → { email, groupId, expires }

function _getMailTransport() {
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.SMTP_PORT || '587');
    const user = process.env.SMTP_USER || '';
    const pass = process.env.SMTP_PASS || '';

    if (!user || !pass) {
        console.warn('[EMAIL] SMTP_USER ou SMTP_PASS non configuré dans .env');
    }

    return nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        tls: { rejectUnauthorized: false },
    });
}

// Vérifier la config email au démarrage (appelé depuis server.js)
function checkMailConfig() {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.warn('⚠️  [EMAIL] SMTP non configuré — les emails ne seront pas envoyés.');
        console.warn('   Ajoutez SMTP_USER et SMTP_PASS dans votre fichier .env');
        console.warn('   Gmail avec 2FA : utilisez un "mot de passe d\'application" (16 chars)');
    } else {
        console.log(`✅ [EMAIL] SMTP : ${process.env.SMTP_HOST}:${process.env.SMTP_PORT} (${process.env.SMTP_USER})`);
    }
}

module.exports = { _getMailTransport, _phoneCodes, _inviteCodes, checkMailConfig };
