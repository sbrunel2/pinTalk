require('dotenv').config(); // Charge les variables du fichier .env
const express = require('express');
const jwt = require('jsonwebtoken'); // À ajouter en haut

const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const rateLimit    = require('express-rate-limit');

// Faire confiance au reverse proxy Oracle Cloud (nécessaire pour rate-limit et logs IP)
app.set('trust proxy', 1);


// ── Rate limiting — anti brute-force ──────────────────────────────────────────
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { message: 'Trop de tentatives. Réessayez dans 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },  // désactive le warning derrière un proxy
});
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },  // désactive le warning derrière un proxy
});

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);


// --- À AJOUTER EN HAUT AVEC LES AUTRES REQUIRES ---
//const multer = require('multer');
//const path = require('path');
// const fs = require('fs');
// const upload = multer({ dest: 'uploads/' });

// 1. Change l'import pour prendre l'objet racine (SANS le .v2)
const cloudinary = require('cloudinary'); 
const multer = require('multer');
const CloudinaryStorage = require('multer-storage-cloudinary');
const nodemailer   = require('nodemailer');
const crypto       = require('crypto');
const bcrypt       = require('bcryptjs');
const helmet       = require('helmet');


const storage = new CloudinaryStorage({
  cloudinary: cloudinary, // On passe l'objet complet, PAS cloudinary.v2
  params: {
    folder: 'pintalk_uploads',
    allowed_formats: ['jpg', 'png', 'jpeg', 'pdf'],
    transformation: [{ width: 1000, crop: "limit" }, { quality: "auto", fetch_format: "auto" }]
  },
});

const upload = multer({ storage: storage });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/postit_pro_v2';
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ Connecté à MongoDB"))
  .catch(err => console.error("❌ Erreur de connexion MongoDB:", err));

const userSchema = new mongoose.Schema({
    email:     { type: String, required: true, unique: true },
    password:  { type: String, required: true },
    name:      { type: String },
    firstname: { type: String, default: '' },
    lastname:  { type: String, default: '' },
    phone:     { type: String, default: '' },
    lang:          { type: String, default: 'fr' },
    phoneVerified: { type: Boolean, default: false },
    prefs: {
        type: Object,
        default: () => ({
            tilePrefs:   {},  // { [groupId]:   { color, textColor, shape } }
            pintalkPrefs:{},  // { [postitId]:  { color, textColor, shape } }
            groupsOrder: [],  // [id, id, ...]
        })
    },
});

const User = mongoose.model('User', userSchema);

// 1. Le Groupe
const groupSchema = new mongoose.Schema({
    name:       { type: String, required: true },
    ownerEmail: { type: String, required: true },
    joinCode:   { type: String, unique: true },
    // Type de groupe : 'perso' (gratuit, max 5 postits) ou 'pro' (payant, illimité)
    type:       { type: String, enum: ['perso', 'pro'], default: 'perso' },
    isPro:      { type: Boolean, default: false },
    // Infos pro (SIRET, tel, email pro)
    siret:      String,
    phonePro:   String,
    emailPro:   String,
    company:    String,
    addr1:      String,
    addr2:      String,
    cp:         String,
    ville:      String,
    // Abonnement Stripe (on stocke l'ID pour la gestion future)
    stripeSubscriptionId: String,
    subscriptionStatus:   { type: String, default: 'inactive' }, // inactive | active | past_due
    // Groupe créé automatiquement à l'inscription ?
    isDefault:  { type: Boolean, default: false },
    // Personnalisation visuelle
    logoUrl:    String,
    tileColor:  { type: String, default: '' },
    tileTextColor: { type: String, default: '' },
    tileShape:  { type: String, default: 'rect' }, // rect | rounded | circle
    tileFontFamily: { type: String, default: '' },
    tileFontSize:   { type: String, default: '' },
});
const Group = mongoose.model('Group', groupSchema);

// 2. Les Permissions : chaque ligne est un lien entre UN utilisateur et UN groupe
const Permission = mongoose.model('Permission', {
    groupId:    String,
    guestEmail: String,
    role: { 
        type: String, 
        // admin : peut gérer membres | employe/preparateur | client/participant
        enum: ['admin', 'employe', 'client'], 
        default: 'client' 
    }
});

const Device = mongoose.model('Device', { 
    groupId: String, 
    name: String, 
    mac: String,
    ownerEmail: String // <--- AJOUTÉ : Optionnel mais utile pour la sécurité future
});

const Postit = mongoose.model('Postit', { 
    deviceId: String, 
    ownerEmail: String,
    name: String,        
    orderNumber: String, 
    phone: String,
    email: String,
    pickupDate: String,  
    status: { type: String, default: 'En attente' },
    isLocked: { type: Boolean, default: false },
    imageUrl: String,
    // allowedEmails : si non vide, seuls ces emails + owner + admins/employés peuvent voir ce postit
    // Si vide → visible par tous les membres du groupe (comportement par défaut)
    allowedEmails:  { type: [String], default: [] },
    tileColor:      { type: String, default: '' },
    tileTextColor:  { type: String, default: '' },
    tileShape:      { type: String, default: '' },
    tileLogoUrl:    { type: String, default: '' },
});

const Message = mongoose.model('Message', { 
    groupId: String, 
    deviceId: String, 
    postitId: String, 
    content: String, 
    senderName: String, 
    isNote:      { type: Boolean, default: false },
    isUncertain: { type: Boolean, default: false },
    checked:     { type: Boolean, default: false }, 
    date: { type: Date, default: Date.now }, 
	type: { type: String, default: 'text' }
});

const Archive = mongoose.model('Archive', { 
    groupName: String, 
    deviceName: String, 
    postitName: String, 
    content: Array, // Contiendra le tableau des messages [{author, text}]
    archivedAt: { type: Date, default: Date.now },
    adminId: String 
});

app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

app.use('/api', apiLimiter);
// ── Sécurité HTTP headers (RGPD / OWASP) ─────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: false, // Désactivé pour permettre les assets CDN (Tailwind etc.)
    crossOriginEmbedderPolicy: false,
}));

// 2. Ta configuration reste la même (elle configure l'objet global)
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// 3. C'est ICI que ça se joue : on passe l'objet racine 'cloudinary'
app.use(express.json());
app.use(express.static('public'));
//app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

//mongoose.connect('mongodb://localhost:27017/postit_pro_v2');

function generateJoinCode() {
    // Génère un code de 6 caractères (ex: 7X8Y2Z)
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// --- ROUTES API ---

app.post('/api/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. RECHERCHE : On cherche l'utilisateur, rien de plus.
        const user = await User.findOne({ email });

        // 2. VÉRIFICATION : Si l'user n'existe pas OU si le password est faux
        // On renvoie la même erreur pour ne pas aider les hackers
        if (!user) {
            return res.status(401).json({ message: "Email ou mot de passe incorrect" });
        }
        // Vérifier le mot de passe hashé
        let validPwd = false;
        if (user.password.startsWith('$2')) {
            // Mot de passe hashé bcrypt
            validPwd = await bcrypt.compare(password, user.password);
        } else {
            // Ancien mot de passe en clair (migration) → valider et hasher
            validPwd = (user.password === password);
            if (validPwd) {
                user.password = await bcrypt.hash(password, 12);
                await user.save();
                console.log(`[SECURITY] Mot de passe migré vers bcrypt pour ${user.email}`);
            }
        }
        if (!validPwd) {
            return res.status(401).json({ message: "Email ou mot de passe incorrect" });
        }

        // 3. SIGNATURE : On ne signe le badge que si tout est OK
        const token = jwt.sign(
            { _id: user._id, id: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // 4. RÉPONSE : On renvoie les infos
        res.json({ 
            token, 
            user: { _id: user._id, id: user._id, email: user.email, name: user.name,
                    firstname: user.firstname || '', lastname: user.lastname || '',
                    phone: user.phone || '', lang: user.lang || 'fr' }
        });

    } catch (err) {
        console.error("Erreur Login:", err);
        res.status(500).json({ message: "Erreur serveur lors de la connexion" });
    }
});

app.post('/api/register', authLimiter, async (req, res) => {
    try {
        const { name, firstname, lastname, email, password, phone, lang } = req.body;

        // 1. Vérifier si l'utilisateur existe déjà
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: "Cet email est déjà utilisé" });
        }

        // 2. Créer le nouvel utilisateur (sans groupe ni postit par défaut)
        // Hasher le mot de passe
        const hashedPwd = await bcrypt.hash(password, 12);

        const newUser = new User({
            name:      name || email.split('@')[0],
            firstname: firstname || '',
            lastname:  lastname  || '',
            email,
            password: hashedPwd,
            phone: phone || '',
            lang:  lang  || 'fr',
        });

        await newUser.save();

        // 3. Générer le token
        const token = jwt.sign(
            { _id: newUser._id, id: newUser._id, email: newUser.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        console.log(`[REGISTER] Nouvel utilisateur : ${newUser.email} (lang: ${newUser.lang})`);

        // 4. Répondre avec l'User ET le Token
        res.status(201).json({ 
            token,
            user: { _id: newUser._id, name: newUser.name, firstname: newUser.firstname,
                    lastname: newUser.lastname, email: newUser.email,
                    phone: newUser.phone, lang: newUser.lang }
        });

    } catch (err) {
        console.error("Erreur Inscription:", err);
        res.status(500).json({ message: "Erreur serveur lors de la création" });
    }
});

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).send("Accès refusé : Token manquant");

	jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            console.log("Erreur JWT précise :", err.message); // <-- TRÈS IMPORTANT
            return res.status(403).send("Token invalide ou expiré");
        }
        req.user = user;
        next();
    });
	
/*    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).send("Token invalide ou expiré");
        req.user = user; // On attache l'utilisateur à la requête pour les routes suivantes
        next();
    });*/
};

// On applique le middleware JWT à toutes les routes /api SAUF login et register
app.use('/api', (req, res, next) => {
    if (req.path === '/login' || req.path === '/register') return next();
    return authenticateToken(req, res, next);
});

// ── Profil utilisateur ─────────────────────────────────────────────────────
// GET profil de l'utilisateur connecté
app.get('/api/user/me', authenticateToken, async (req, res) => {
    try {
        const user = await User.findOne({ email: req.user.email });
        if (!user) return res.status(404).send('Utilisateur introuvable');
        res.json({
            email:     user.email,
            name:      user.name      || '',
            firstname: user.firstname || '',
            lastname:  user.lastname  || '',
            phone:     user.phone     || '',
            lang:      user.lang      || 'fr',
        });
    } catch(e) { res.status(500).send('Erreur serveur'); }
});


app.put('/api/user/profile', authenticateToken, async (req, res) => {
    try {
        const { firstname, lastname, phone, lang } = req.body;
        const user = await User.findOne({ email: req.user.email });
        if (!user) return res.status(404).send('Utilisateur introuvable');
        if (firstname !== undefined) user.firstname = firstname;
        if (lastname  !== undefined) user.lastname  = lastname;
        if (phone     !== undefined) user.phone     = phone;
        if (lang      !== undefined) user.lang      = lang;
        await user.save();
        res.json({ ok: true, user: { email: user.email, firstname: user.firstname, lastname: user.lastname, phone: user.phone, lang: user.lang } });
    } catch(e) { res.status(500).send('Erreur serveur'); }
});

app.put('/api/user/password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) return res.status(400).send('Champs manquants');
        const user = await User.findOne({ email: req.user.email });
        if (!user) return res.status(404).send('Utilisateur introuvable');
        const valid = await bcrypt.compare(currentPassword, user.password);
        if (!valid) return res.status(403).send('Mot de passe actuel incorrect');
        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();
        res.json({ ok: true });
    } catch(e) { res.status(500).send('Erreur serveur'); }
});


// ── Codes de vérification en mémoire (à remplacer par Redis en prod) ─────────
const _phoneCodes = new Map();   // email → { code, expires }
const _inviteCodes = new Map();  // token → { email, groupId, expires }

// ── Configurer le transport email ─────────────────────────────────────────────
function _getMailTransport() {
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.SMTP_PORT || '587');
    const user = process.env.SMTP_USER || '';
    const pass = process.env.SMTP_PASS || '';

    if (!user || !pass) {
        console.warn('[EMAIL] SMTP_USER ou SMTP_PASS non configuré dans .env');
    }

    // Pour Gmail avec 2FA : SMTP_PASS doit être un "mot de passe d'application"
    // Gmail > Compte > Sécurité > Authentification 2 facteurs > Mots de passe des applications
    // Générer un mot de passe de 16 caractères et le mettre dans SMTP_PASS
    //
    // Alternatively, use SMTP_HOST=smtp.mailgun.org or smtp.sendgrid.net

    return nodemailer.createTransport({
        host,
        port,
        secure: port === 465,  // true pour 465, false pour 587
        auth: { user, pass },
        tls: { rejectUnauthorized: false },  // tolère les certs auto-signés en dev
    });
}

// Vérifier la config email au démarrage
setTimeout(() => {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.warn('⚠️  [EMAIL] SMTP non configuré — les emails ne seront pas envoyés.');
        console.warn('   Ajoutez SMTP_USER et SMTP_PASS dans votre fichier .env');
        console.warn('   Gmail avec 2FA : utilisez un "mot de passe d\'application" (16 chars)');
        console.warn('   Gmail > Compte > Sécurité > Mots de passe des applications');
    } else {
        console.log(`✅ [EMAIL] SMTP configuré : ${process.env.SMTP_HOST}:${process.env.SMTP_PORT} (${process.env.SMTP_USER})`);
    }
}, 1000);

// POST /api/invite — Inviter un utilisateur par email dans un groupe
app.post('/api/invite', authenticateToken, async (req, res) => {
    try {
        const { email, groupId } = req.body;
        const userEmail = req.user.email;
        if (!email || !email.includes('@')) return res.status(400).send('Email invalide.');

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).send('Groupe introuvable.');

        // Seul owner/admin peut inviter
        const isOwner = group.ownerEmail === userEmail;
        if (!isOwner) {
            const perm = await Permission.findOne({ groupId, guestEmail: userEmail });
            if (!perm || perm.role !== 'admin') return res.status(403).send('Accès refusé.');
        }

        // Générer un token d'invitation
        const token   = crypto.randomBytes(24).toString('hex');
        const expires = Date.now() + 48 * 3600 * 1000; // 48h
        _inviteCodes.set(token, { email, groupId, expires });

        const appUrl  = process.env.APP_URL || 'http://localhost:3000';
        const inviteUrl = `${appUrl}/join?token=${token}`;
        const inviter = await User.findOne({ email: userEmail });
        const inviterName = inviter?.firstname || inviter?.name || userEmail;

        // Envoyer l'email
        try {
            const transport = _getMailTransport();
            await transport.sendMail({
                from: `"e-Postit Pro" <${process.env.SMTP_USER}>`,
                to:   email,
                subject: `${inviterName} vous invite sur e-Postit Pro`,
                html: `
                <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px;border:2px solid #18181b;">
                    <h2 style="font-weight:900;text-transform:uppercase;margin-bottom:8px;">Invitation</h2>
                    <p><strong>${inviterName}</strong> vous invite à rejoindre le groupe <strong>"${group.name}"</strong> sur e-Postit Pro.</p>
                    <p style="margin:20px 0;">
                        <a href="${inviteUrl}" style="background:#18181b;color:#fff;padding:12px 24px;text-decoration:none;font-weight:900;text-transform:uppercase;display:inline-block;">
                            Rejoindre le groupe →
                        </a>
                    </p>
                    <p style="font-size:11px;opacity:0.5;">Ce lien expire dans 48h. Si vous n'avez pas de compte, il vous sera demandé d'en créer un.</p>
                </div>`,
            });
            console.log(`[INVITE] Email envoyé à ${email} pour groupe ${group.name}`);
        } catch(mailErr) {
            console.error('[INVITE] Erreur email:', mailErr.message);
            // On ne bloque pas : retourner le lien quand même
        }

        res.json({ ok: true, inviteUrl, token });
    } catch(err) {
        console.error('Erreur invite:', err);
        res.status(500).send('Erreur serveur.');
    }
});

// GET /api/join?token=... — Valider une invitation
app.get('/api/join', async (req, res) => {
    try {
        const { token } = req.query;
        const invite = _inviteCodes.get(token);
        if (!invite || Date.now() > invite.expires) {
            return res.redirect('/?error=invite_expired');
        }
        const group = await Group.findById(invite.groupId);
        if (!group) return res.redirect('/?error=group_not_found');

        // Rediriger vers l'app avec les infos d'invitation
        res.redirect(`/?invite=${token}&email=${encodeURIComponent(invite.email)}&group=${encodeURIComponent(group.name)}`);
    } catch(err) {
        res.redirect('/?error=invite_error');
    }
});

// POST /api/join — Finaliser l'invitation (après login/register)
app.post('/api/join', authenticateToken, async (req, res) => {
    try {
        const { token } = req.body;
        const invite = _inviteCodes.get(token);
        if (!invite || Date.now() > invite.expires) return res.status(400).send('Invitation expirée.');

        const userEmail = req.user.email;
        const group = await Group.findById(invite.groupId);
        if (!group) return res.status(404).send('Groupe introuvable.');

        // Vérifier si déjà membre
        const existing = await Permission.findOne({ groupId: invite.groupId, guestEmail: userEmail });
        if (!existing) {
            await Permission.create({ groupId: invite.groupId, guestEmail: userEmail, role: 'client' });
        }

        _inviteCodes.delete(token); // usage unique
        console.log(`[JOIN] ${userEmail} a rejoint ${group.name} via invitation`);
        res.json({ ok: true, groupId: invite.groupId, groupName: group.name });
    } catch(err) {
        res.status(500).send('Erreur serveur.');
    }
});

// POST /api/send-phone-code — Envoyer un code SMS (stub : email fallback)
app.post('/api/send-phone-code', authenticateToken, async (req, res) => {
    try {
        const userEmail = req.user.email;
        const { phone } = req.body;
        if (!phone || phone.length < 8) return res.status(400).send('Numéro invalide.');

        const code    = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = Date.now() + 10 * 60 * 1000; // 10min
        _phoneCodes.set(userEmail, { code, phone, expires });

        // Idéalement : envoyer via Twilio/OVH SMS
        // Pour l'instant : envoyer le code par email à la place
        try {
            const transport = _getMailTransport();
            await transport.sendMail({
                from: `"e-Postit Pro" <${process.env.SMTP_USER}>`,
                to:   userEmail,
                subject: 'Code de vérification e-Postit Pro',
                html: `<div style="font-family:sans-serif;padding:24px;border:2px solid #18181b;max-width:400px;">
                    <h2 style="font-weight:900;">Code de vérification</h2>
                    <p>Votre code pour vérifier le numéro <strong>${phone}</strong> :</p>
                    <div style="font-size:32px;font-weight:900;letter-spacing:8px;margin:16px 0;">${code}</div>
                    <p style="font-size:11px;opacity:0.5;">Valable 10 minutes.</p>
                </div>`,
            });
        } catch(e) { console.warn('SMS email fallback failed:', e.message); }

        console.log(`[PHONE] Code ${code} pour ${userEmail} (tel: ${phone})`);
        res.json({ ok: true });
    } catch(err) {
        res.status(500).send('Erreur serveur.');
    }
});

// POST /api/verify-phone — Valider le code reçu
app.post('/api/verify-phone', authenticateToken, async (req, res) => {
    try {
        const userEmail = req.user.email;
        const { code }  = req.body;
        const entry     = _phoneCodes.get(userEmail);

        if (!entry || Date.now() > entry.expires) return res.status(400).send('Code expiré.');
        if (entry.code !== code) return res.status(400).send('Code incorrect.');

        // Marquer le téléphone comme vérifié
        await User.findOneAndUpdate({ email: userEmail }, {
            phone: entry.phone,
            phoneVerified: true
        });
        _phoneCodes.delete(userEmail);
        console.log(`[PHONE] Vérifié pour ${userEmail} : ${entry.phone}`);
        res.json({ ok: true });
    } catch(err) {
        res.status(500).send('Erreur serveur.');
    }
});


// ── Préférences utilisateur (prefs des tuiles, ordre des groupes) ─────────────
app.get('/api/user/prefs', authenticateToken, async (req, res) => {
    try {
        const user = await User.findOne({ email: req.user.email });
        if (!user) return res.status(404).send('Utilisateur introuvable');
        res.json(user.prefs || { tilePrefs:{}, pintalkPrefs:{}, groupsOrder:[] });
    } catch(e) { res.status(500).send('Erreur serveur'); }
});

app.put('/api/user/prefs', authenticateToken, async (req, res) => {
    try {
        const { tilePrefs, pintalkPrefs, groupsOrder } = req.body;
        const user = await User.findOne({ email: req.user.email });
        if (!user) return res.status(404).send('Utilisateur introuvable');
        const current = user.prefs || { tilePrefs:{}, pintalkPrefs:{}, groupsOrder:[] };
        if (tilePrefs    !== undefined) current.tilePrefs    = tilePrefs;
        if (pintalkPrefs !== undefined) current.pintalkPrefs = pintalkPrefs;
        if (groupsOrder  !== undefined) current.groupsOrder  = groupsOrder;
        user.prefs = current;
        user.markModified('prefs');
        await user.save();
        res.json({ ok: true });
    } catch(e) { console.error('prefs PUT:', e); res.status(500).send('Erreur serveur'); }
});

// Quitter un groupe (membre uniquement)
app.delete('/api/groups/:id/leave', authenticateToken, async (req, res) => {
    try {
        const userEmail = req.user.email;
        const group = await Group.findById(req.params.id);
        if (!group) return res.status(404).send('Groupe introuvable.');
        if (group.ownerEmail === userEmail) return res.status(403).send('Le propriétaire ne peut pas quitter son groupe. Supprimez-le.');
        await Permission.deleteOne({ groupId: req.params.id, guestEmail: userEmail });
        console.log(`[LEAVE] ${userEmail} a quitté ${group.name}`);
        res.json({ ok: true });
    } catch(e) { res.status(500).send('Erreur serveur'); }
});


// ── Suppression de compte ──────────────────────────────────────────────────────
app.delete('/api/user/account', authenticateToken, async (req, res) => {
    try {
        const userEmail = req.user.email;
        console.log(`[DELETE ACCOUNT] Début suppression pour ${userEmail}`);

        // 1. Trouver tous les groupes dont l'user est propriétaire
        const ownedGroups = await Group.find({ ownerEmail: userEmail });

        for (const group of ownedGroups) {
            // Si groupe Pro avec abonnement actif → noter pour annulation Stripe future
            if (group.isPro && group.subscriptionStatus === 'active' && group.stripeSubscriptionId) {
                // TODO: await stripe.subscriptions.cancel(group.stripeSubscriptionId);
                console.log(`[DELETE ACCOUNT] Abonnement Stripe à annuler: ${group.stripeSubscriptionId}`);
            }

            // Supprimer tous les devices du groupe
            const devices = await Device.find({ groupId: group._id });
            for (const device of devices) {
                await Postit.deleteMany({ deviceId: device._id });
                await Message.deleteMany({ deviceId: device._id });
            }
            await Device.deleteMany({ groupId: group._id });
            await Message.deleteMany({ groupId: group._id });
            await Permission.deleteMany({ groupId: group._id.toString() });
            await Archive.deleteMany({ adminId: userEmail });
        }
        await Group.deleteMany({ ownerEmail: userEmail });

        // 2. Supprimer les participations (groupes dont l'user est membre)
        await Permission.deleteMany({ guestEmail: userEmail });

        // 3. Supprimer les postits créés par l'user (dans les groupes d'autres)
        const userPostits = await Postit.find({ ownerEmail: userEmail });
        for (const p of userPostits) {
            await Message.deleteMany({ postitId: p._id.toString() });
        }
        await Postit.deleteMany({ ownerEmail: userEmail });

        // 4. Supprimer le compte utilisateur
        await User.deleteOne({ email: userEmail });

        console.log(`[DELETE ACCOUNT] Compte ${userEmail} supprimé complètement.`);
        res.json({ ok: true });
    } catch(err) {
        console.error('[DELETE ACCOUNT] Erreur:', err);
        res.status(500).send('Erreur lors de la suppression du compte.');
    }
});


// ── IA : extraction d'éléments via Gemini ─────────────────────────────────────
// ── Helpers IA ─────────────────────────────────────────────────────────────────

// ── Helpers d'extraction ─────────────────────────────────────────────────────

function _stripArticle(text) {
    return text
        .replace(/^(du|de\s+la|de\s+l['\u2019]|des|une?|le|la|les|d['\u2019])\s*/i, '')
        .trim();
}

function _isQuestion(text) {
    return /\?|faudrait|devrait|pourrait|serait|faut-il|ne\s+faut|on\s+devrait|est.ce\s+qu|peut.tre|peut tre/i.test(text);
}

// Séparer un texte en items par articles + quantités
// "100g de steak haché 300g de rôti de veau six paupiettes Un paquet de lardons" → 4 items
function _splitByArticles(text) {
    text = text.replace(/\bEt\b/g, 'et').replace(/\bET\b/g, 'et');
    const nombresEcrits = /^(deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|quinze|vingt)$/i;
    const unitesSolo    = /^(g|kg|ml|l|cl|dl|gr)$/i;
    const contenants    = /^(paquet|paquets|brique|briques|bouteille|bouteilles|bo[iî]te|bo[iî]tes|filet|filets|tranche|tranches|part|parts|pot|pots|barquette|barquettes|sachet|sachets|carton|cartons|pack|packs|c[oô]te|cotes|escalope|escalopes|r[oô]ti|rotis|morceau|morceaux|litre|litres|botte|bottes|flacon|flacons)$/i;
    const nomsComposes  = /^(veau|boeuf|b[oœ]uf|porc|poulet|agneau|saumon|thon|cabillaud|lieu|sole|dinde|canard|lapin|ail|b[oœ]uf)$/i;
    const articlesSimples = /^(de|du|des|le|la|les|un|une|et)$/i;

    // Pré-tokeniser les articles composés "de la/le/les/l'" → tokens Ⓐ
    let t = text
        .replace(/\bde\s+l['\u2019]/gi, '\u24B6DEL')
        .replace(/\bde\s+la\b/gi,       '\u24B6DELA')
        .replace(/\bde\s+les?\b/gi,     '\u24B6DLES');

    const words = t.trim().split(/\s+/);
    const boundaries = new Set();

    for (let i = 1; i < words.length; i++) {
        const w    = words[i];
        const prev = words[i-1].toLowerCase();
        const next = (words[i+1] || '').toLowerCase();
        const prevIsUnit      = unitesSolo.test(prev);
        const prevIsContenant = contenants.test(prev);
        const prevIsArtToken  = /^\u24B6/.test(words[i-1]);
        const nextIsNum       = /^\d/.test(next) || unitesSolo.test(next);
        // Mot précédent est un vrai mot produit (pas article, pas unité, pas contenant)
        const prevIsRealWord  = prev.length > 1
                                && !prevIsUnit && !prevIsContenant
                                && !articlesSimples.test(prev)
                                && !/^\u24B6/.test(prev);

        const isNewItem =
            // Chiffre (sauf après article)
            (/^\d/.test(w) && !['de','du','des','la','le','les','et','un','une'].includes(prev)) ||
            // Nombre écrit
            (nombresEcrits.test(w) && !['de','du','des','et'].includes(prev)) ||
            // un/une après un vrai mot produit
            (/^(un|une)$/i.test(w) && prevIsRealWord) ||
            // Un/Une majuscule en milieu
            /^(Un|Une)$/.test(w) ||
            // Articles simples (sauf après contenant)
            (/^(du|des|le|la|les)$/i.test(w) && !prevIsContenant) ||
            // Token article composé (sauf après contenant)
            (/^\u24B6/.test(w) && !prevIsContenant) ||
            // "de" simple (sauf après unité/contenant/avant nom composé ou chiffre)
            (/^de$/i.test(w) && !prevIsUnit && !prevIsContenant
             && !nomsComposes.test(next) && !nextIsNum) ||
            // "et" → séparateur
            /^et$/i.test(w);

        if (isNewItem) boundaries.add(i);
    }

    // Construire les items selon les frontières
    const items = [];
    let start = 0;
    const bArr = [...boundaries].sort((a, b) => a - b);
    for (const b of bArr) {
        const seg = words.slice(start, b)
            .filter(w => !/^et$/i.test(w))
            .join(' ').trim();
        if (seg.length > 1) items.push(seg);
        start = b;
    }
    const last = words.slice(start).filter(w => !/^et$/i.test(w)).join(' ').trim();
    if (last.length > 1) items.push(last);

    // Restaurer les tokens articles composés
    const restore = s => s
        .replace(/\u24B6DELA/g, 'de la')
        .replace(/\u24B6DEL/g,  "de l'")
        .replace(/\u24B6DLES/g, 'des')
        .replace(/\s+/g, ' ').trim();

    return items.map(restore).filter(s => s.length > 1) || null;
}

function _fallbackExtract(text) {
    return text
        .split(/,|;|\s+et\s+|\s+puis\s+|\s+aussi\s+/i)
        .map(s => s.replace(/^(pense\s+[aà]|il\s+faut|acheter|prendre|ramener|ajouter)\s+/i, '').trim())
        .filter(s => s.length > 1);
}

// ── IA multi-items via Gemini ───────────────────────────────────────────────────
app.post('/api/ai/extract-multi', authenticateToken, async (req, res) => {
    try {
        const { text } = req.body;
        console.log('[EXTRACT-MULTI] Reçu:', JSON.stringify(text).substring(0, 100));
        if (!text || text.length < 2) return res.status(400).send('Texte vide.');

        const geminiKey = process.env.GEMINI_API_KEY;
        const isQuestion = _isQuestion(text);

        // ── Pré-traitement : séparer par articles avant Gemini ─────────────
        // "du pain du beurre" → ["pain", "beurre"]
        const preSplit = _splitByArticles(text);
        if (!geminiKey) {
            // Sans Gemini : utiliser le pré-traitement + fallback
            const parts = preSplit || _fallbackExtract(text);
            const items = parts.map(t => ({ text: _stripArticle(t), uncertain: isQuestion }));
            console.log('[FALLBACK] Items:', JSON.stringify(items));
            return res.json({ items, source: 'fallback' });
        }

        // Si pré-traitement a trouvé plusieurs items ET pas de Gemini nécessaire
        // (liste simple sans question) → bypass Gemini pour vitesse
        if (preSplit && preSplit.length > 1 && !isQuestion &&
            !text.match(/faudrait|devrait|acheter|prendre|pense|oublie|peut.être/i)) {
            const items = preSplit.map(t => ({ text: t.trim(), uncertain: false }));
            console.log('[PRE-SPLIT] Bypass Gemini, items:', JSON.stringify(items));
            return res.json({ items, source: 'presplit' });
        }

        const safeText = text.replace(/"/g, "'").substring(0, 300);

        // ── Prompt avec rôle + few-shot + JSON forcé (conseils NLU) ─────────────
        // Rôle : extracteur logistique, pas assistant conversationnel
        // Few-shot : exemples calibrés pour questions modales et listes
        // Format : JSON strict {items:[{text,uncertain}]}
        // Température : 0.1 (exécution brute, pas de zèle conversationnel)
        const systemPrompt = `Tu es un extracteur logistique de liste de courses et de taches. Tu identifies les produits mentionnes dans tout message : affirmation, question ou suggestion. IMPORTANT : le texte peut provenir d'une transcription vocale automatique et contenir des erreurs phonetiques ou orthographiques (ex: "biscote" pour "biscottes", "yaour" pour "yaourt", "shampoin" pour "shampoing"). Corrige ces erreurs et extrais le produit correct. Tu reponds UNIQUEMENT avec du JSON valide, jamais avec du texte libre.`;

        const fewShotPrompt = `EXEMPLES DE TRANSFORMATION (few-shot) :

Message: "biscottes"
Reponse: {"items":[{"text":"biscottes","uncertain":false}]}

Message: "du pain du beurre"
Reponse: {"items":[{"text":"pain","uncertain":false},{"text":"beurre","uncertain":false}]}

Message: "du lait du fromage des oeufs"
Reponse: {"items":[{"text":"lait","uncertain":false},{"text":"fromage","uncertain":false},{"text":"oeufs","uncertain":false}]}

Message: "prends du pain et 3 croissants"
Reponse: {"items":[{"text":"pain","uncertain":false},{"text":"3 croissants","uncertain":false}]}

Message: "du pain du beurre et des oeufs"
Reponse: {"items":[{"text":"pain","uncertain":false},{"text":"beurre","uncertain":false},{"text":"oeufs","uncertain":false}]}

Message: "Il nous faudrait des pommes non ?"
Reponse: {"items":[{"text":"pommes","uncertain":true}]}

Message: "N'oublie pas le lait, et peut-etre du fromage"
Reponse: {"items":[{"text":"lait","uncertain":false},{"text":"fromage","uncertain":true}]}

Message: "Ne faudrait-il pas prendre du pain et du beurre ?"
Reponse: {"items":[{"text":"pain","uncertain":true},{"text":"beurre","uncertain":true}]}

Message: "est ce qu il ne faudrait pas acheter du pain ?"
Reponse: {"items":[{"text":"pain","uncertain":true}]}

Message: "300g viande hachee, 2 steaks, un roti de veau"
Reponse: {"items":[{"text":"300g viande hachee","uncertain":false},{"text":"2 steaks","uncertain":false},{"text":"roti de veau","uncertain":false}]}

Message: "on devrait penser a prendre du detergent"
Reponse: {"items":[{"text":"detergent","uncertain":true}]}

Message: "du pain du beurre du lait des yaourts du jambon"
Reponse: {"items":[{"text":"pain","uncertain":false},{"text":"beurre","uncertain":false},{"text":"lait","uncertain":false},{"text":"yaourts","uncertain":false},{"text":"jambon","uncertain":false}]}

REGLES CRITIQUES :
- Chaque produit = un item separe, meme sans virgule ni ponctuation
- "du/de la/des/le/la/les" avant un produit = nouveau produit distinct
- uncertain:false = affirmation, liste directe, mot seul
- uncertain:true = question, suggestion, doute ("faudrait", "devrait", "peut-etre", "?")
- Supprimer les articles (du, de la, des, le, la) dans le champ text
- Conserver les quantites (3, 300g, un, deux...)
- Ne JAMAIS retourner items vide
- Extraire UNIQUEMENT le produit/quantite, jamais la phrase entiere

MESSAGE A ANALYSER: "${safeText}"
Reponse JSON:`;

        const gRes = await fetch(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + geminiKey,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    // System instruction séparée (rôle)
                    systemInstruction: { parts: [{ text: systemPrompt }] },
                    contents: [{ role: 'user', parts: [{ text: fewShotPrompt }] }],
                    generationConfig: {
                        maxOutputTokens: 300,
                        temperature: 0.1,        // exécution brute, pas conversationnel
                        responseMimeType: 'application/json'  // force JSON natif
                    }
                })
            }
        );

        if (!gRes.ok) {
            const errText = await gRes.text();
            console.error('[GEMINI] Erreur API:', gRes.status, errText.substring(0,100));
            const simple = _fallbackExtract(text).map(t => ({ text: t, uncertain: false }));
            return res.json({ items: simple, source: 'fallback' });
        }

        const gData = await gRes.json();
        const raw = gData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '{}';
        console.log('[GEMINI RAW] ---');
        console.log(raw.substring(0, 500));
        console.log('[GEMINI RAW] ---');

        let items = [];
        try {
            const clean = raw.replace(/```json|```/g, '').trim();
            const parsed = JSON.parse(clean);
            // Accepter {items:[...]} ou directement [...]
            const arr = Array.isArray(parsed) ? parsed : (parsed.items || []);
            items = arr
                .filter(i => i && typeof i.text === 'string' && i.text.trim().length > 1)
                .map(i => ({ text: i.text.trim(), uncertain: !!i.uncertain }));
        } catch(e) {
            console.warn('[GEMINI] JSON parse failed:', e.message, '| raw:', raw.substring(0,80));
            items = _fallbackExtract(text).map(t => ({ text: t.trim(), uncertain: false }));
        }

        // Dernier filet : si toujours vide → fallback
        if (items.length === 0 && text.trim().length > 1) {
            const fb = _fallbackExtract(text);
            items = fb.length > 0
                ? fb.map(t => ({ text: t, uncertain: true }))
                : [{ text: text.trim().substring(0, 60), uncertain: true }];
        }

        console.log('[GEMINI] ' + items.length + ' items extraits de "' + text.substring(0, 50) + '"');
        res.json({ items, source: 'gemini' });

    } catch(err) {
        console.error('[AI EXTRACT-MULTI]', err.message);
        const simple = _fallbackExtract(req.body.text || '').map(t => ({ text: t, uncertain: false }));
        res.json({ items: simple, source: 'fallback' });
    }
});


app.post('/api/ai/extract', authenticateToken, async (req, res) => {
    try {
        const { text } = req.body;
        if (!text || text.length < 2) return res.status(400).send('Texte vide.');

        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) {
            // Fallback simple sans IA : retourner le texte nettoyé
            const simple = text
                .replace(/^(pense à|n'oublie pas de|il faut|acheter|prendre|ramener)\s+/i, '')
                .trim();
            return res.json({ extracted: simple, source: 'fallback' });
        }

        const prompt = `Tu es un assistant qui extrait des tâches ou éléments concrets d'un message.
Règles strictes :
- Réponds UNIQUEMENT avec le texte de l'élément extrait, rien d'autre
- Inclure les quantités si présentes (ex: "3 steaks hachés", "500g de farine")
- Si aucun élément concret : réponds exactement AUCUN
- Pas d'explication, pas de ponctuation finale, juste l'item en minuscules
Message : "${text.replace(/"/g, "'")}"`;

        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { maxOutputTokens: 60, temperature: 0.1 }
                })
            }
        );

        if (!geminiRes.ok) {
            const err = await geminiRes.text();
            console.error('[GEMINI] Erreur API:', err);
            // Fallback
            const simple = text.replace(/^(pense à|acheter|prendre|il faut)\s+/i,'').trim();
            return res.json({ extracted: simple, source: 'fallback' });
        }

        const geminiData = await geminiRes.json();
        const extracted = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        if (!extracted || extracted === 'AUCUN') {
            return res.json({ extracted: null });
        }

        console.log(`[GEMINI] Extrait : "${extracted}" depuis "${text.substring(0,40)}..."`);
        res.json({ extracted, source: 'gemini' });

    } catch(err) {
        console.error('[AI EXTRACT] Erreur:', err);
        // Fallback robuste
        const simple = req.body.text?.replace(/^(pense à|acheter|prendre|il faut)\s+/i,'').trim();
        res.json({ extracted: simple || null, source: 'fallback' });
    }
});


app.get('/api/fix-groups', async (req, res) => {
    const email = req.query.email;
    // On donne tous les groupes sans propriétaire à cet email
    const result = await Group.updateMany(
        { ownerEmail: { $exists: false } }, 
        { $set: { ownerEmail: email } }
    );
    res.send(`${result.modifiedCount} groupes ont été récupérés par ${email}`);
});


// Groupes dont je suis propriétaire (compatibilité existante)
app.get('/api/groups', async (req, res) => {
    const userEmail = req.user.email; 
    try {
        const groups = await Group.find({ ownerEmail: userEmail });
        console.log(`${groups.length} groupes (proprio) pour ${userEmail}`);
        res.json(groups);
    } catch (err) {
        console.error("Erreur récup groupes:", err);
        res.status(500).send("Erreur serveur");
    }
});

// NOUVELLE ROUTE : Tous les groupes accessibles (proprio + membre)
app.get('/api/groups/mine', async (req, res) => {
    const userEmail = req.user.email;
    try {
        // Groupes dont je suis proprio
        const ownedGroups = await Group.find({ ownerEmail: userEmail });

        // Groupes où j'ai une permission
        const perms = await Permission.find({ guestEmail: userEmail });
        const memberGroupIds = perms.map(p => p.groupId);
        const memberGroups = await Group.find({ _id: { $in: memberGroupIds } });

        // Fusionner sans doublons
        const allGroupIds = new Set(ownedGroups.map(g => g._id.toString()));
        const merged = [...ownedGroups];
        for (const g of memberGroups) {
            if (!allGroupIds.has(g._id.toString())) {
                merged.push(g);
            }
        }

        // Ajouter le rôle de l'utilisateur dans chaque groupe
        const result = merged.map(g => {
            const isOwner = g.ownerEmail === userEmail;
            const perm = perms.find(p => p.groupId === g._id.toString());
            return {
                ...g.toObject(),
                myRole: isOwner ? 'owner' : (perm ? perm.role : 'client')
            };
        });

        console.log(`[MINE] ${result.length} groupes accessibles pour ${userEmail}`);
        res.json(result);
    } catch (err) {
        console.error("Erreur /api/groups/mine:", err);
        res.status(500).send("Erreur serveur");
    }
});

// Config d'un groupe (type, hasRayons, maxPostits, myRole)
app.get('/api/groups/:id/config', async (req, res) => {
    const userEmail = req.user.email;
    try {
        const group = await Group.findById(req.params.id);
        if (!group) return res.status(404).send("Groupe introuvable");

        const isOwner = group.ownerEmail === userEmail;
        const perm = isOwner ? null : await Permission.findOne({ groupId: group._id, guestEmail: userEmail });
        const myRole = isOwner ? 'owner' : (perm ? perm.role : null);

        if (!myRole) return res.status(403).send("Accès refusé");

        res.json({
            _id: group._id,
            name: group.name,
            type: group.type || 'perso',
            isPro: group.isPro || false,
            isDefault: group.isDefault || false,
            hasRayons: group.isPro === true,
            maxPostits: group.isPro ? 0 : 5,
            myRole,
            joinCode: isOwner ? group.joinCode : null,
            logoUrl:       group.logoUrl       || null,
            tileColor:     group.tileColor     || '',
            tileTextColor: group.tileTextColor || '',
            tileShape:     group.tileShape     || 'rect',
            tileFontFamily:group.tileFontFamily|| '',
            tileFontSize:  group.tileFontSize  || '',
            company:  group.company  || null,
            addr1:    group.addr1    || null,
            addr2:    group.addr2    || null,
            cp:       group.cp       || null,
            ville:    group.ville    || null,
            phonePro: group.phonePro || null,
            emailPro: group.emailPro || null,
            siret:    group.siret    || null,
        });
    } catch (err) {
        console.error("Erreur /api/groups/:id/config:", err);
        res.status(500).send("Erreur serveur");
    }
});


app.post('/api/groups', async (req, res) => {
    try {
        const { name, type, siret, phonePro, emailPro, company, addr1, addr2, cp, ville, logoUrl } = req.body;
        const userEmail = req.user.email; 
        
        if (!name) return res.status(400).send("Le nom du groupe est obligatoire");

        const groupType = type === 'pro' ? 'pro' : 'perso';
        const isPro = groupType === 'pro';

        // Vérification limite postits pour perso : max 5 postits par groupe perso (vérif côté postit)
        
        const g = new Group({ 
            name,
            ownerEmail: userEmail,
            joinCode: generateJoinCode(),
            type: groupType,
            isPro,
            siret:    isPro ? siret    : undefined,
            phonePro: isPro ? phonePro : undefined,
            emailPro: isPro ? (emailPro || userEmail) : undefined,
            company:  isPro ? company  : undefined,
            addr1:    isPro ? addr1    : undefined,
            addr2:    isPro ? addr2    : undefined,
            cp:       isPro ? cp       : undefined,
            ville:    isPro ? ville    : undefined,
            logoUrl:  logoUrl || undefined,
            subscriptionStatus: isPro ? 'pending' : 'inactive'
        });

        const savedGroup = await g.save();
        console.log(`[POST Groupe] ${groupType.toUpperCase()} créé : ${savedGroup.name} par ${userEmail}`);
        res.json(savedGroup);
    } catch (err) {
        console.error("Erreur création groupe:", err);
        res.status(500).send("Erreur lors de la création du groupe");
    }
});

// Mise à jour infos groupe (nom, type, infos pro)
app.put('/api/groups/:id', async (req, res) => {
    const userEmail = req.user.email;
    try {
        const group = await Group.findById(req.params.id);
        if (!group) return res.status(404).send("Groupe introuvable");
        if (group.ownerEmail !== userEmail) return res.status(403).send("Accès refusé");

        const { name, siret, phonePro, emailPro, company, addr1, addr2, cp, ville,
                logoUrl, tileColor, tileTextColor, tileShape, tileFontFamily, tileFontSize } = req.body;
        if (name) group.name = name;
        if (siret    !== undefined) group.siret    = siret;
        if (phonePro !== undefined) group.phonePro = phonePro;
        if (emailPro !== undefined) group.emailPro = emailPro;
        if (company  !== undefined) group.company  = company;
        if (addr1    !== undefined) group.addr1    = addr1;
        if (addr2    !== undefined) group.addr2    = addr2;
        if (cp       !== undefined) group.cp       = cp;
        if (ville    !== undefined) group.ville    = ville;
        if (logoUrl       !== undefined) group.logoUrl       = logoUrl;
        if (tileColor     !== undefined) group.tileColor     = tileColor;
        if (tileTextColor !== undefined) group.tileTextColor = tileTextColor;
        if (tileShape     !== undefined) group.tileShape     = tileShape;
        if (tileFontFamily!== undefined) group.tileFontFamily= tileFontFamily;
        if (tileFontSize  !== undefined) group.tileFontSize  = tileFontSize;
        await group.save();
        res.sendStatus(200);
    } catch (err) {
        res.status(500).send("Erreur serveur");
    }
});

// --- ROUTES DEVICES ---

// 1. Pour le CHAT (Direct) : avec ID obligatoire
app.get('/api/devices/:gid', async (req, res) => {
    res.json(await Device.find({ groupId: req.params.gid }));
});

// 2. Pour les ARCHIVES et le CHAT : filtre par groupId, accessible à tous les membres
app.get('/api/devices', async (req, res) => {
    try {
        const { groupId, groupName } = req.query;
        const userEmail = req.user.email;

        // Si groupId fourni : vérifier que l'user est bien membre/proprio du groupe
        if (groupId) {
            const group = await Group.findById(groupId);
            if (!group) return res.json([]);

            const isOwner = group.ownerEmail === userEmail;
            if (!isOwner) {
                const perm = await Permission.findOne({
                    groupId: group._id.toString(),
                    guestEmail: userEmail
                });
                if (!perm) return res.json([]); // Pas membre → rien
            }
            // Membre ou proprio → retourner tous les devices du groupe
            const devices = await Device.find({ groupId });
            console.log(`[GET Devices] ${devices.length} rayons pour groupe ${groupId}`);
            return res.json(devices);
        }

        // Si groupName (pour archives) ou sans paramètre : 
        // retourner les devices des groupes dont l'user est proprio ou membre
        const ownedGroups = await Group.find({ ownerEmail: userEmail });
        const perms = await Permission.find({ guestEmail: userEmail });
        const memberGroupIds = perms.map(p => p.groupId);
        const allGroupIds = [
            ...ownedGroups.map(g => g._id.toString()),
            ...memberGroupIds
        ];

        const query = { groupId: { $in: allGroupIds } };
        if (groupName) {
            // Pour les archives : trouver le groupe par nom
            const g = await Group.findOne({ name: groupName, ownerEmail: userEmail });
            if (g) return res.json(await Device.find({ groupId: g._id.toString() }));
            return res.json([]);
        }

        const devices = await Device.find(query);
        console.log(`[GET Devices] ${devices.length} rayons pour ${userEmail}`);
        res.json(devices);
    } catch (err) {
        console.error("Erreur récupération rayons :", err);
        res.status(500).send("Erreur serveur");
    }
});
// --- ROUTES POSTITS ---

// 1. Pour le CHAT (Direct) : avec ID obligatoire
app.get('/api/postits/:did', async (req, res) => {
    res.json(await Postit.find({ deviceId: req.params.did }));
});

// 2. Pour les ARCHIVES : sans ID dans l'URL, utilise le query ?deviceName=...
app.get('/api/postits', async (req, res) => {
    try {
        // 1. On récupère le deviceId et le filtre de date. 
        // 🗑️ L'email "email" est supprimé de req.query.
        const { deviceId, filterDate } = req.query;
        const userEmail = req.user.email; // 🔑 Identité certifiée par le Token

        if (!deviceId) {
            return res.status(400).send("DeviceId requis");
        }

        // 2. Initialisation de la requête de base
        let query = { 
            deviceId: deviceId,
            status: { $ne: 'Récupéré' } 
        };

        if (filterDate && filterDate !== "") {
            query.pickupDate = { $regex: '^' + filterDate };
        }

        // 3. LOGIQUE DE SÉCURITÉ (Qui a le droit de voir quoi ?)
        const device = await Device.findById(deviceId);
        if (!device) return res.json([]);
        
        const group = await Group.findById(device.groupId);
        if (!group) return res.json([]);

        // ── Règles de visibilité des postits ────────────────────────────────
        // Déterminer le rôle de l'utilisateur dans ce groupe
        let userRole = null;
        if (group.ownerEmail === userEmail) {
            userRole = 'owner';
        } else {
            const perm = await Permission.findOne({
                groupId: group._id.toString(),
                guestEmail: userEmail
            });
            userRole = perm ? perm.role : null;
        }

        const isPrivileged = ['owner', 'admin', 'employe'].includes(userRole);

        // Owner, admin, employé → voient TOUS les postits sans restriction
        if (!isPrivileged) {
            // Client ou participant (perso) :
            // Ne voir que les postits où :
            //   - allowedEmails est vide (postit "public" dans le groupe) ET ownerEmail === userEmail (son propre postit)
            //   - OU allowedEmails contient son email (invité explicitement)
            //   - OU il est le owner du postit
            query.$or = [
                { ownerEmail: userEmail },
                { allowedEmails: userEmail },
            ];
            // Pour les groupes PRO, les clients ne voient que leurs propres postits
            // sauf s'ils ont été explicitement invités sur un postit d'un autre
            if (group.isPro && userRole === 'client') {
                // Déjà couvert par le $or ci-dessus
            }
        }

        // 4. Exécution avec ton tri par date
        const postits = await Postit.find(query).sort({ pickupDate: 1 });
        
        console.log(`[GET Postits] ${postits.length} trouvés pour ${userEmail} sur le rayon ${deviceId}`);
        res.json(postits);

    } catch (err) {
        console.error("Erreur GET Postits:", err);
        res.status(500).json({ message: "Erreur serveur lors de la récupération des post-its" });
    }
});

app.post('/api/devices', async (req, res) => {
    try {
        // 1. On ne récupère que le nom et le groupId du body.
        // 🗑️ On dégage 'ownerEmail' : on ne fait plus confiance au front-end pour ça.
        const { name, groupId } = req.body; 
        const userEmail = req.user.email; // 🔑 Identité certifiée par le Token

        if (!name || !groupId) {
            return res.status(400).send("Nom et ID de groupe obligatoires");
        }

        // 2. On crée le rayon (Device) en "tatouant" l'email du Token dessus
        const device = new Device({
            name,
            groupId,
            ownerEmail: userEmail, // <--- C'est ici que la sécurité se joue
            mac: req.body.mac || "00"
        });

        const savedDevice = await device.save();
        
        console.log(`[POST] Rayon créé : ${savedDevice.name} (Propriétaire certifié : ${userEmail})`);
        res.json(savedDevice);

    } catch (err) {
        console.error("Erreur création rayon :", err);
        res.status(500).send("Erreur serveur lors de la création du rayon");
    }
});

app.post('/api/postits', async (req, res) => {
    try {
        // 1. On récupère les infos de la commande depuis le body.
        // 🗑️ On supprime 'ownerEmail' de la liste : on utilise req.user.email à la place.
        const { deviceId, name, orderNumber, phone, pickupDate } = req.body;
        const userEmail = req.user.email; // 🔑 Identité certifiée par le Token

        // 2. Vérification des infos minimales
        if (!deviceId || !name) {
            return res.status(400).send("Données manquantes (Rayon ou Nom du client)");
        }

        // 3. Vérification limite 5 postits pour groupes perso
        const device = await Device.findById(deviceId);
        if (device) {
            const group = await Group.findById(device.groupId);
            if (group && !group.isPro) {
                // Compter les postits actifs du groupe
                const deviceIds = (await Device.find({ groupId: group._id })).map(d => d._id);
                const count = await Postit.countDocuments({ 
                    deviceId: { $in: deviceIds },
                    status: { $nin: ['Terminé', 'Annulé', 'En caisse'] }
                });
                if (count >= 5) {
                    return res.status(403).json({ 
                        message: "Limite de 5 post-its atteinte pour un groupe gratuit. Passez au plan Pro pour en créer davantage.",
                        limitReached: true
                    });
                }
            }
        }

        // 3. Création du Post-it "tatoué" avec l'email du Token
        // Pour les groupes PERSO : récupérer les membres existants pour les ajouter dans allowedEmails
        let allowedEmails = [];
        if (device) {
            const group = await Group.findById(device.groupId);
            if (group && !group.isPro) {
                const perms = await Permission.find({ groupId: group._id.toString() });
                allowedEmails = perms.map(p => p.guestEmail);
            }
        }

        const postit = new Postit({
            deviceId,
            name,
            orderNumber,
            phone,
            pickupDate,
            ownerEmail: userEmail,
            status: 'En attente',
            allowedEmails
        });

        const saved = await postit.save();
        
        console.log(`[POST] Post-it créé pour : ${name} (Propriétaire certifié : ${userEmail})`);
        res.json(saved);

    } catch (err) {
        console.error("Erreur création postit:", err);
        res.status(500).send("Erreur serveur lors de la création de la commande");
    }
});

app.get('/api/fix-postits', async (req, res) => {
    // 🔑 On récupère l'email depuis le Token, pas depuis l'URL.
    const userEmail = req.user.email; 

    try {
        // On donne tous les post-its sans propriétaire à l'utilisateur connecté
        const result = await Postit.updateMany(
            { ownerEmail: { $exists: false } }, 
            { $set: { ownerEmail: userEmail } }
        );
        
        console.log(`[FIX] ${result.modifiedCount} post-its rattachés à ${userEmail}`);
        res.send(`${result.modifiedCount} commandes (post-its) ont été rattachées à votre compte (${userEmail})`);
    } catch (err) {
        console.error("Erreur fix-postits:", err);
        res.status(500).send(err.message);
    }
});

// --- ROUTES DES ARCHIVES ---

// 1. Créer une sauvegarde (Backup)
app.post('/api/archives/backup', async (req, res) => {
    try {
        // 🔑 On récupère l'email certifié du Token
        const userEmail = req.user.email; 
        
        console.log("📦 Réception d'une archive pour :", req.body.postitName, `(User: ${userEmail})`);

        // 🛡️ Sécurité : on prend tout le body MAIS on écrase l'ownerEmail 
        // par celui du Token pour être sûr de l'appartenance.
        const archiveData = {
            ...req.body,
            ownerEmail: userEmail
        };

        const newArch = new Archive(archiveData);
        await newArch.save();
        
        res.status(201).json(newArch);
    } catch (err) {
        console.error("❌ Erreur sauvegarde archive:", err);
        res.status(500).send("Erreur lors de l'archivage de la commande");
    }
});

app.post('/api/upload', authenticateToken, upload.single('file'), (req, res) => {
    // Petit check pour débugger : on regarde ce que Multer a mis dans req.file
    console.log("Données reçues de Multer :", req.file);

    if (req.file) {
        // 🚨 LA CORRECTION : 
        // Sur CloudinaryStorage, l'URL se trouve dans 'path' ou 'secure_url'
        const imageUrl = req.file.path || req.file.secure_url;
        
        console.log("Fichier envoyé sur Cloudinary :", imageUrl);
        
        // On renvoie l'URL au format attendu par ton frontend
        res.json({ url: imageUrl }); 
    } else {
        res.status(400).send("Erreur d'upload");
    }
});

app.post('/api/groups/join', async (req, res) => {
    try {
        // 1. On récupère le code de join du body.
        // 🗑️ On retire 'email' : on utilise l'identité certifiée du Token.
        const { joinCode } = req.body;
        const userEmail = req.user.email; // 🔑 Identité certifiée

        if (!joinCode) {
            return res.status(400).send("Le code de ralliement est requis.");
        }

        // 2. On cherche le groupe qui possède ce code (insensible à la casse)
        const group = await Group.findOne({ joinCode: joinCode.toUpperCase() });
        
        if (!group) {
            return res.status(404).send("Code invalide. Ce commerce n'existe pas.");
        }

        // 3. Sécurité : On vérifie si l'utilisateur n'est pas déjà membre/client
        const existingPerm = await Permission.findOne({ 
            groupId: group._id, 
            guestEmail: userEmail 
        });

        if (existingPerm) {
            return res.json({ message: "Vous faites déjà partie de ce groupe.", group });
        }

        // 4. On crée la permission automatique en tant que CLIENT
        const newPermission = new Permission({
            groupId: group._id,
            guestEmail: userEmail, // <--- Lié au Token
            role: 'client' 
        });

        await newPermission.save();

        console.log(`[JOIN] ${userEmail} a rejoint ${group.name} via le code ${joinCode}`);
        res.json(group);
        
    } catch (err) {
        console.error("Erreur lors de l'adhésion au groupe :", err);
        res.status(500).send("Erreur serveur lors de l'adhésion.");
    }
});

// 2. Récupérer les archives filtrées
app.get('/api/archives', async (req, res) => {
    try {
        const { group, device, postit } = req.query;
        // On cherche les archives qui correspondent exactement aux noms sélectionnés
        const archives = await Archive.find({ 
            groupName: group, 
            deviceName: device, 
            postitName: postit 
        }).sort({ archivedAt: -1 }); // La plus récente en premier
        
        res.json(archives);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// GET membres (owner ou admin uniquement)
app.get('/api/groups/:id/members', async (req, res) => {
    try {
        const groupId = req.params.id;
        const userEmail = req.user.email;

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).send("Groupe introuvable.");

        // Owner ou admin peuvent voir et gérer les membres
        const isOwner = group.ownerEmail === userEmail;
        if (!isOwner) {
            const adminPerm = await Permission.findOne({ groupId: groupId.toString(), guestEmail: userEmail, role: 'admin' });
            if (!adminPerm) return res.status(403).send("Accès refusé.");
        }

        const perms = await Permission.find({ groupId });
        const members = perms.map(p => ({ email: p.guestEmail, role: p.role, id: p._id }));
        res.json(members);
    } catch (err) {
        console.error("Erreur récup membres:", err);
        res.status(500).send("Erreur serveur");
    }
});

// Inviter un membre dans un groupe (owner ou admin)
app.post('/api/groups/:id/members', async (req, res) => {
    try {
        const groupId = req.params.id;
        const userEmail = req.user.email;
        const { email, role } = req.body;

        if (!email) return res.status(400).send("Email requis");

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).send("Groupe introuvable.");

        const isOwner = group.ownerEmail === userEmail;
        if (!isOwner) {
            const adminPerm = await Permission.findOne({ groupId, guestEmail: userEmail, role: 'admin' });
            if (!adminPerm) return res.status(403).send("Accès refusé.");
        }

        // Vérifier si l'utilisateur existe
        const invitedUser = await User.findOne({ email });
        if (!invitedUser) {
            // Utilisateur inconnu → envoyer une invitation par email automatiquement
            // Générer un token d'invitation
            const invToken = require('crypto').randomBytes(24).toString('hex');
            const invExpires = Date.now() + 48 * 3600 * 1000;
            _inviteCodes.set(invToken, { email, groupId, expires: invExpires });

            const appUrl = process.env.APP_URL || `http://${require('os').hostname()}:3000`;
            const inviteUrl = `${appUrl}/join?token=${invToken}`;
            const inviter = await User.findOne({ email: userEmail });
            const inviterName = inviter?.firstname || inviter?.name || userEmail;

            try {
                const transport = _getMailTransport();
                await transport.sendMail({
                    from: `"Pintalk" <${process.env.SMTP_USER}>`,
                    to:   email,
                    subject: `${inviterName} vous invite sur Pintalk`,
                    html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px;border:2px solid #18181b;">
                        <h2 style="font-weight:900;text-transform:uppercase;">Invitation Pintalk</h2>
                        <p><strong>${inviterName}</strong> vous invite à rejoindre le groupe <strong>"${group.name}"</strong>.</p>
                        <p style="margin:20px 0;">
                            <a href="${inviteUrl}" style="background:#18181b;color:#fff;padding:12px 24px;text-decoration:none;font-weight:900;text-transform:uppercase;display:inline-block;">
                                Rejoindre →
                            </a>
                        </p>
                        <p style="font-size:11px;opacity:0.5;">Lien valable 48h. Vous devrez créer un compte Pintalk.</p>
                    </div>`,
                });
                console.log(`[INVITE AUTO] Email envoyé à ${email}`);
            } catch(mailErr) {
                console.error('[INVITE AUTO] Erreur email:', mailErr.message);
            }
            // Retourner 202 = invitation envoyée (pas encore membre)
            return res.status(202).json({ invited: true, email, inviteUrl });
        }

        // Vérifier qu'il n'est pas déjà membre
        const existing = await Permission.findOne({ groupId, guestEmail: email });
        if (existing) return res.status(409).send("Déjà membre de ce groupe.");

        const validRoles = ['admin', 'employe', 'client'];
        const finalRole = validRoles.includes(role) ? role : 'client';

        const perm = new Permission({ groupId, guestEmail: email, role: finalRole });
        await perm.save();

        // Pour les groupes PERSO : ajouter le nouveau membre dans allowedEmails de tous les postits du groupe
        if (!group.isPro) {
            try {
                const devices = await Device.find({ groupId });
                const deviceIds = devices.map(d => d._id.toString());
                await Postit.updateMany(
                    { deviceId: { $in: deviceIds }, allowedEmails: { $ne: email } },
                    { $push: { allowedEmails: email } }
                );
            } catch(e) { console.warn('Erreur sync allowedEmails membres:', e.message); }
        }

        console.log(`[INVITE] ${email} ajouté dans groupe ${group.name} en tant que ${finalRole}`);
        res.json({ email, role: finalRole });
    } catch (err) {
        console.error("Erreur ajout membre:", err);
        res.status(500).send("Erreur serveur");
    }
});

// Modifier le rôle d'un membre
app.put('/api/groups/:id/members/:email', async (req, res) => {
    try {
        const { id: groupId, email } = req.params;
        const { role } = req.body;
        const userEmail = req.user.email;

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).send("Groupe introuvable.");
        if (group.ownerEmail !== userEmail) return res.status(403).send("Seul le propriétaire peut modifier les rôles.");

        const validRoles = ['admin', 'employe', 'client'];
        if (!validRoles.includes(role)) return res.status(400).send("Rôle invalide.");

        const perm = await Permission.findOneAndUpdate(
            { groupId, guestEmail: email },
            { role },
            { new: true }
        );
        if (!perm) return res.status(404).send("Membre introuvable.");
        res.json({ email, role });
    } catch (err) {
        res.status(500).send("Erreur serveur");
    }
});

// Supprimer un membre d'un groupe
app.delete('/api/groups/:id/members/:email', async (req, res) => {
    try {
        const { id: groupId, email } = req.params;
        const userEmail = req.user.email;

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).send("Groupe introuvable.");

        const isOwner = group.ownerEmail === userEmail;
        if (!isOwner) {
            const adminPerm = await Permission.findOne({ groupId, guestEmail: userEmail, role: 'admin' });
            if (!adminPerm) return res.status(403).send("Accès refusé.");
        }

        await Permission.deleteOne({ groupId, guestEmail: email });
        console.log(`[REMOVE MEMBER] ${email} retiré du groupe ${groupId}`);
        res.sendStatus(200);
    } catch (err) {
        res.status(500).send("Erreur serveur");
    }
});

// --- ROUTES DE MISE À JOUR (UPDATE) ---

app.put('/api/devices/:id', async (req, res) => {
    await Device.findByIdAndUpdate(req.params.id, { name: req.body.name });
    res.sendStatus(200);
});

// Route pour récupérer les détails complets d'un post-it (pour l'édition)
app.get('/api/postits/details/:id', async (req, res) => {
    const p = await Postit.findById(req.params.id);
    res.json(p);
});

// Modifier la route PUT existante pour accepter tous les champs
app.put('/api/postits/:id', async (req, res) => {
    try {
        const { name, orderNumber, phone, email, pickupDate } = req.body;
        const userEmail = req.user.email;

        const postit = await Postit.findById(req.params.id);
        if (!postit) return res.status(404).send("Post-it introuvable.");

        // Droits : owner du postit OU owner/admin du groupe
        let canEdit = (postit.ownerEmail === userEmail);
        if (!canEdit) {
            const device = await Device.findById(postit.deviceId);
            const group  = device ? await Group.findById(device.groupId) : null;
            if (group) {
                if (group.ownerEmail === userEmail) {
                    canEdit = true;
                } else {
                    const perm = await Permission.findOne({ groupId: group._id.toString(), guestEmail: userEmail });
                    if (perm && perm.role === 'admin') canEdit = true;
                }
            }
        }
        if (!canEdit) return res.status(403).send("Accès refusé.");

        if (name        !== undefined) postit.name        = name;
        if (orderNumber !== undefined) postit.orderNumber = orderNumber;
        if (phone       !== undefined) postit.phone       = phone;
        if (email       !== undefined) postit.email       = email;
        if (pickupDate  !== undefined) postit.pickupDate  = pickupDate;
        if (req.body.tileColor     !== undefined) postit.tileColor     = req.body.tileColor;
        if (req.body.tileTextColor !== undefined) postit.tileTextColor = req.body.tileTextColor;
        if (req.body.tileShape     !== undefined) postit.tileShape     = req.body.tileShape;
        if (req.body.tileLogoUrl   !== undefined) postit.tileLogoUrl   = req.body.tileLogoUrl;
        await postit.save();

        console.log(`[PUT] Postit modifié par ${userEmail} : ${postit.name}`);
        res.sendStatus(200);
    } catch (err) {
        console.error("Erreur PUT postit:", err);
        res.status(500).send("Erreur serveur.");
    }
});

// Route pour modifier le texte d'un message
app.patch('/api/messages/:id', authenticateToken, async (req, res) => {
    try {
        const { content } = req.body;
        if (!content || content.trim() === "") {
            return res.status(400).send("Contenu vide non autorisé");
        }
        const msg = await Message.findById(req.params.id);
        if (!msg) return res.status(404).send("Message non trouvé");

        msg.content = content.trim();
        await msg.save();

        io.emit('message-content-updated', { 
            messageId: req.params.id, 
            newContent: msg.content 
        });

        res.sendStatus(200);
    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur serveur");
    }
});
// --- ROUTES DE SUPPRESSION ---
app.delete('/api/groups/:id', async (req, res) => {
    try {
        const groupId = req.params.id;
        
        // 1. Supprimer le groupe
        await Group.findByIdAndDelete(groupId);
        
        // 2. Supprimer tous les rayons (Devices) liés à ce groupe
        await Device.deleteMany({ groupId: groupId });
        
        // 3. Optionnel : Supprimer aussi les post-its liés (si tu veux un nettoyage total)
        // await Postit.deleteMany({ groupId: groupId });

        console.log(`Groupe ${groupId} et ses rayons supprimés.`);
        res.sendStatus(200);
    } catch (err) {
        console.error("Erreur lors de la suppression du groupe:", err);
        res.status(500).send("Erreur serveur lors de la suppression");
    }
});

app.delete('/api/devices/:id', async (req, res) => {
    try {
        const deviceId = req.params.id;
        
        // 1. Suppression du rayon (Display)
        await Device.findByIdAndDelete(deviceId);
        
        // 2. Nettoyage : Suppression de tous les post-its (Clients) rattachés à ce rayon
        const deleteResult = await Postit.deleteMany({ deviceId: deviceId });
        
        console.log(`[DELETE] Rayon ${deviceId} supprimé avec ${deleteResult.deletedCount} post-its.`);
        res.sendStatus(200);
    } catch (err) {
        console.error("Erreur lors de la suppression du rayon :", err);
        res.status(500).send("Erreur serveur lors de la suppression");
    }
});

// ── Inviter / retirer un email sur un postit (accès postit-level) ────────────
// POST /api/postits/:id/invite  { email }
// DELETE /api/postits/:id/invite/:email
app.post('/api/postits/:id/invite', authenticateToken, async (req, res) => {
    try {
        const userEmail = req.user.email;
        const { email } = req.body;
        if (!email) return res.status(400).send('Email requis');

        const postit = await Postit.findById(req.params.id);
        if (!postit) return res.status(404).send('Postit introuvable');

        // Seul le owner du postit, ou owner/admin du groupe peut inviter
        const device = await Device.findById(postit.deviceId);
        const group  = device ? await Group.findById(device.groupId) : null;
        let canInvite = postit.ownerEmail === userEmail;
        if (!canInvite && group) {
            if (group.ownerEmail === userEmail) canInvite = true;
            else {
                const perm = await Permission.findOne({ groupId: group._id.toString(), guestEmail: userEmail });
                if (perm && ['admin'].includes(perm.role)) canInvite = true;
            }
        }
        if (!canInvite) return res.status(403).send('Accès refusé');

        // Ajouter email à allowedEmails (éviter doublons)
        if (!postit.allowedEmails.includes(email)) {
            postit.allowedEmails.push(email);
            await postit.save();
        }

        // Ajouter la personne comme membre du groupe si pas encore dedans (rôle client)
        if (group && group.ownerEmail !== email) {
            const existPerm = await Permission.findOne({ groupId: group._id.toString(), guestEmail: email });
            if (!existPerm) {
                await Permission.create({ groupId: group._id.toString(), guestEmail: email, role: 'client' });
            }
        }

        res.json({ ok: true, allowedEmails: postit.allowedEmails });
    } catch(err) {
        console.error('Erreur invite postit:', err);
        res.status(500).send('Erreur serveur');
    }
});

app.delete('/api/postits/:id/invite/:email', authenticateToken, async (req, res) => {
    try {
        const userEmail = req.user.email;
        const emailToRemove = decodeURIComponent(req.params.email);

        const postit = await Postit.findById(req.params.id);
        if (!postit) return res.status(404).send('Postit introuvable');

        // Même vérification de droit
        const device = await Device.findById(postit.deviceId);
        const group  = device ? await Group.findById(device.groupId) : null;
        let canEdit = postit.ownerEmail === userEmail;
        if (!canEdit && group) {
            if (group.ownerEmail === userEmail) canEdit = true;
            else {
                const perm = await Permission.findOne({ groupId: group._id.toString(), guestEmail: userEmail });
                if (perm && ['admin'].includes(perm.role)) canEdit = true;
            }
        }
        if (!canEdit) return res.status(403).send('Accès refusé');

        postit.allowedEmails = postit.allowedEmails.filter(e => e !== emailToRemove);
        await postit.save();
        res.json({ ok: true, allowedEmails: postit.allowedEmails });
    } catch(err) {
        console.error('Erreur remove invite postit:', err);
        res.status(500).send('Erreur serveur');
    }
});

// GET /api/postits/:id/invites — lister les emails invités
app.get('/api/postits/:id/invites', authenticateToken, async (req, res) => {
    try {
        const postit = await Postit.findById(req.params.id);
        if (!postit) return res.status(404).send('Postit introuvable');
        res.json(postit.allowedEmails || []);
    } catch(err) { res.status(500).send('Erreur serveur'); }
});


app.delete('/api/postits/:id', authenticateToken, async (req, res) => {
    try {
        const userEmail = req.user.email;
        const postit = await Postit.findById(req.params.id);
        if (!postit) return res.status(404).send("Post-it introuvable.");

        let canDelete = (postit.ownerEmail === userEmail);
        if (!canDelete) {
            const device = await Device.findById(postit.deviceId);
            const group  = device ? await Group.findById(device.groupId) : null;
            if (group) {
                if (group.ownerEmail === userEmail) canDelete = true;
                else {
                    const perm = await Permission.findOne({ groupId: group._id.toString(), guestEmail: userEmail });
                    if (perm && perm.role === 'admin') canDelete = true;
                }
            }
        }
        if (!canDelete) return res.status(403).send("Accès refusé.");

        await Postit.findByIdAndDelete(req.params.id);
        res.sendStatus(200);
    } catch(err) {
        console.error("Erreur DELETE postit:", err);
        res.status(500).send("Erreur serveur.");
    }
});

// Route pour supprimer un message (et son image sur Cloudinary si besoin)
app.delete('/api/messages/:id', authenticateToken, async (req, res) => {
    try {
        const msg = await Message.findById(req.params.id);
        if (!msg) return res.status(404).send("Message non trouvé");

        // Suppression Cloudinary si image
        if (msg.type === 'image' && msg.content && msg.content.includes('cloudinary.com')) {
            try {
                const parts = msg.content.split('/');
                const fileNameWithExtension = parts[parts.length - 1];
                const publicId = 'pintalk_uploads/' + fileNameWithExtension.split('.')[0];
                const cloudinary = require('cloudinary');
                await cloudinary.v2.uploader.destroy(publicId);
                console.log("Image Cloudinary supprimée:", publicId);
            } catch (cloudErr) {
                console.error("Avertissement Cloudinary:", cloudErr.message);
                // On continue même si Cloudinary échoue
            }
        }

        await Message.findByIdAndDelete(req.params.id);
        io.emit('message-deleted', req.params.id);
        res.sendStatus(200);
    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur serveur");
    }
});


// --- SOCKET.IO ---
// Middleware de sécurité pour Socket.io
io.use((socket, next) => {
    const token = socket.handshake.auth.token; // On récupère le token envoyé par le front
    if (!token) {
        return next(new Error("Accès refusé : Token manquant"));
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return next(new Error("Token invalide"));
        socket.user = user; // On attache l'utilisateur au socket
        next();
    });
});

io.on('connection', (socket) => {
    socket.on('get-history', async (data) => {
        // Filtrer par groupId, et par postitId si fourni
        const filter = { groupId: data.groupId };
        if (data.postitId) filter.postitId = data.postitId;
        const msgs = await Message.find(filter).sort({ date: -1 }).limit(100);
        socket.emit('history-data', msgs);
    });

    socket.on('send-message', async (data) => {
        const msg = new Message(data);
        await msg.save();
        io.emit('new-message', msg);
    });
	socket.on('toggle-message-note', async (data) => {
		try {
			const msg = await Message.findById(data.messageId);
			if (msg) {
				msg.isNote = !msg.isNote; // On inverse l'état
				await msg.save();
				
				// On renvoie l'info à TOUS les utilisateurs connectés
				io.emit('message-updated', { 
					messageId: msg._id, 
					isNote: msg.isNote 
				});
			}
		} catch (err) {
			console.error("Erreur toggle-note:", err);
		}
	});
	socket.on('toggle-check-line', async (data) => {
		try {
			const msg = await Message.findById(data.messageId);
			if (msg) {
				msg.checked = !msg.checked;
				await msg.save();
				io.emit('line-checked-updated', { messageId: msg._id, checked: msg.checked });
			}
		} catch (err) { console.error(err); }
	});
	socket.on('update-postit-status', async (data) => {
		try {
			const updateData = { status: data.status };
			
			const postit = await Postit.findByIdAndUpdate(
				data.postitId, 
				updateData, 
				{ returnDocument: 'after' }
			);

			if (postit) {
				// Si un commentaire est fourni (annulation), on l'ajoute comme un message "Note"
				if (data.comment && data.comment.trim() !== "") {
					const newMessage = new Message({
						postitId: data.postitId,
						senderName: "SYSTÈME",
						content: `⚠️ ANNULATION : ${data.comment}`,
						isNote: true // On le met en note pour qu'il soit bien visible
					});
					await newMessage.save();
					// On informe tout le monde qu'un nouveau message est arrivé
					io.emit('new-message', newMessage);
				}

				io.emit('postit-status-updated', { 
					postitId: postit._id, 
					status: postit.status 
				});
			}
		} catch (err) {
			console.error("Erreur update-status:", err);
		}
	});
});

server.listen(3000, () => console.log('🚀 Serveur prêt sur http://localhost:3000'));