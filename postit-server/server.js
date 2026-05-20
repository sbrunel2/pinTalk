// server.js — Point d'entrée principal (orchestrateur)
// Toute la logique métier est dans routes/, helpers/, models/, socket/
require('dotenv').config();

const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const helmet   = require('helmet');
const cloudinary = require('cloudinary');
const multer   = require('multer');
const CloudinaryStorage = require('multer-storage-cloudinary');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

// ── Confiance proxy Oracle Cloud ─────────────────────────────────────────────
app.set('trust proxy', 1);
// Injecter io dans app pour l'utiliser dans les routes (messages)
app.set('io', io);

// ── Rate limiting (production uniquement) ────────────────────────────────────
const isProd = process.env.NODE_ENV === 'production';
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: isProd ? 20 : 10000,
    message: { message: 'Trop de tentatives. Réessayez dans 15 minutes.' },
    standardHeaders: true, legacyHeaders: false,
    validate: { xForwardedForHeader: false },
});
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, max: isProd ? 120 : 10000,
    standardHeaders: true, legacyHeaders: false,
    validate: { xForwardedForHeader: false },
});

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (!allowedOrigins.length || !origin || allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin || '*');
    }
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// ── Middlewares globaux ───────────────────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: false, // CSP géré manuellement si besoin
    crossOriginEmbedderPolicy: false,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ── Cloudinary + Multer upload ────────────────────────────────────────────────
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});
const cloudinaryStorage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: 'pintalk_uploads',
        allowed_formats: ['jpg', 'png', 'jpeg', 'pdf'],
        transformation: [{ width: 1000, crop: "limit" }, { quality: "auto", fetch_format: "auto" }]
    },
});
const upload = multer({ storage: cloudinaryStorage });

// ── MongoDB ───────────────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/postit_pro_v2';
mongoose.connect(MONGO_URI)
    .then(async () => {
        console.log("✅ Connecté à MongoDB");
        // Préchauffer le cache dictionnaire IA au démarrage
        try {
            const { _refreshAiDictionaryCache } = require('./helpers/ai');
            await _refreshAiDictionaryCache();
            console.log("✅ Cache dictionnaire IA initialisé");
        } catch(e) { console.warn("⚠️ Cache IA non initialisé:", e.message); }
    })
    .catch(err => console.error("❌ Erreur de connexion MongoDB:", err));

// ── Imports routes ────────────────────────────────────────────────────────────
const { authenticateToken } = require('./helpers/auth');
const { checkMailConfig }   = require('./helpers/mail');
const routeAuth    = require('./routes/auth');
const routeUsers   = require('./routes/users');
const routeGroups  = require('./routes/groups');
const routeMembers = require('./routes/members');
const routeResources = require('./routes/resources');
const routeAi      = require('./routes/ai');

// ── Branchement des routes ────────────────────────────────────────────────────
// Auth (login/register) — rate-limité
app.use('/api', authLimiter, routeAuth);

// API globale — rate-limité
app.use('/api', apiLimiter);

// Utilisateurs
app.use('/api/user', routeUsers);

// Groupes (ordre important : /mine et /fix-groups avant /:id)
app.use('/api/groups', authenticateToken, routeGroups);

// Membres et rôles — montés sur /api/groups/:id
app.use('/api/groups/:id', authenticateToken, routeMembers);

// Devices, Postits, Messages, Archives
app.use('/api', routeResources);

// IA
app.use('/api/ai', routeAi);

// Dictionnaire IA (ancienne URL /api/ai-dictionary → remappé vers /api/ai/dictionary)
// Rétrocompatibilité : l'ancien front appelle /api/ai-dictionary
app.use('/api/ai-dictionary', authenticateToken, (req, res, next) => {
    req.url = '/dictionary' + (req.url === '/' ? '' : req.url);
    routeAi(req, res, next);
});

// ── Upload Cloudinary ─────────────────────────────────────────────────────────
app.post('/api/upload', authenticateToken, upload.single('file'), (req, res) => {
    if (req.file) {
        const imageUrl = req.file.path || req.file.secure_url;
        console.log("Fichier envoyé sur Cloudinary :", imageUrl);
        res.json({ url: imageUrl });
    } else {
        res.status(400).send("Erreur d'upload");
    }
});

// ── Invitation email (ancienne route directe) ─────────────────────────────────
const crypto = require('crypto');
const { _getMailTransport, _inviteCodes } = require('./helpers/mail');
const { Group, Permission, User } = require('./models');

app.post('/api/invite', authenticateToken, async (req, res) => {
    try {
        const { email, groupId } = req.body;
        const userEmail = req.user.email;
        if (!email || !email.includes('@')) return res.status(400).send('Email invalide.');
        const group = await Group.findById(groupId);
        if (!group) return res.status(404).send('Groupe introuvable.');
        const isOwner = group.ownerEmail === userEmail;
        if (!isOwner) {
            const perm = await Permission.findOne({ groupId, guestEmail: userEmail });
            if (!perm || perm.role !== 'admin') return res.status(403).send('Accès refusé.');
        }
        const token   = crypto.randomBytes(24).toString('hex');
        const expires = Date.now() + 48 * 3600 * 1000;
        _inviteCodes.set(token, { email, groupId, expires });
        const appUrl    = process.env.APP_URL || 'http://localhost:3000';
        const inviteUrl = `${appUrl}/join?token=${token}`;
        const inviter   = await User.findOne({ email: userEmail });
        const inviterName = inviter?.firstname || inviter?.name || userEmail;
        try {
            const transport = _getMailTransport();
            await transport.sendMail({
                from: `"e-Postit Pro" <${process.env.SMTP_USER}>`,
                to: email,
                subject: `${inviterName} vous invite sur e-Postit Pro`,
                html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px;border:2px solid #18181b;">
                    <h2 style="font-weight:900;text-transform:uppercase;">Invitation</h2>
                    <p><strong>${inviterName}</strong> vous invite à rejoindre le groupe <strong>"${group.name}"</strong>.</p>
                    <p style="margin:20px 0;"><a href="${inviteUrl}" style="background:#18181b;color:#fff;padding:12px 24px;text-decoration:none;font-weight:900;text-transform:uppercase;display:inline-block;">Rejoindre le groupe →</a></p>
                    <p style="font-size:11px;opacity:0.5;">Ce lien expire dans 48h.</p>
                </div>`,
            });
        } catch(mailErr) { console.error('[INVITE] Erreur email:', mailErr.message); }
        res.json({ ok: true, inviteUrl, token });
    } catch(err) { res.status(500).send('Erreur serveur.'); }
});

app.get('/api/join', async (req, res) => {
    try {
        const { token } = req.query;
        const invite = _inviteCodes.get(token);
        if (!invite || Date.now() > invite.expires) return res.redirect('/?error=invite_expired');
        const group = await Group.findById(invite.groupId);
        if (!group) return res.redirect('/?error=group_not_found');
        res.redirect(`/?invite=${token}&email=${encodeURIComponent(invite.email)}&group=${encodeURIComponent(group.name)}`);
    } catch(err) { res.redirect('/?error=invite_error'); }
});

app.post('/api/join', authenticateToken, async (req, res) => {
    try {
        const { token } = req.body;
        const invite = _inviteCodes.get(token);
        if (!invite || Date.now() > invite.expires) return res.status(400).send('Invitation expirée.');
        const group = await Group.findById(invite.groupId);
        if (!group) return res.status(404).send('Groupe introuvable.');
        const userEmail = req.user.email;
        const existing  = await Permission.findOne({ groupId: invite.groupId, guestEmail: userEmail });
        if (!existing) {
            await Permission.create({ groupId: invite.groupId, guestEmail: userEmail, type: 'client', role: 'client' });
        }
        _inviteCodes.delete(token);
        console.log(`[JOIN] ${userEmail} a rejoint ${group.name} via invitation`);
        res.json({ ok: true, groupId: invite.groupId, groupName: group.name });
    } catch(err) { res.status(500).send('Erreur serveur.'); }
});

// ── Socket.io ─────────────────────────────────────────────────────────────────
const { initSocket } = require('./socket');
initSocket(io);

// ── Vérifications démarrage ───────────────────────────────────────────────────
setTimeout(() => {
    checkMailConfig();
    if (!process.env.GEMINI_API_KEY) console.warn('⚠️  [IA] GEMINI_API_KEY non configuré — extraction IA désactivée.');
    if (!process.env.JWT_SECRET)     console.error('🚨 [JWT] JWT_SECRET manquant ! L\'application ne fonctionnera pas.');
}, 500);

// ── Démarrage ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Serveur prêt sur http://localhost:${PORT}`));
