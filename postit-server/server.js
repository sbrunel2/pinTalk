require('dotenv').config(); // Charge les variables du fichier .env
const express = require('express');
const jwt = require('jsonwebtoken'); // À ajouter en haut

const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- À AJOUTER EN HAUT AVEC LES AUTRES REQUIRES ---
//const multer = require('multer');
//const path = require('path');
// const fs = require('fs');
// const upload = multer({ dest: 'uploads/' });

// 1. Change l'import pour prendre l'objet racine (SANS le .v2)
const cloudinary = require('cloudinary'); 
const multer = require('multer');
const CloudinaryStorage = require('multer-storage-cloudinary');

// 2. Ta configuration reste la même (elle configure l'objet global)
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// 3. C'est ICI que ça se joue : on passe l'objet racine 'cloudinary'
const storage = new CloudinaryStorage({
  cloudinary: cloudinary, // On passe l'objet complet, PAS cloudinary.v2
  params: {
    folder: 'pintalk_uploads',
    allowed_formats: ['jpg', 'png', 'jpeg', 'pdf'],
    transformation: [{ width: 1000, crop: "limit" }, { quality: "auto", fetch_format: "auto" }]
  },
});

const upload = multer({ storage: storage });

app.use(express.json());
app.use(express.static('public'));
//app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

//mongoose.connect('mongodb://localhost:27017/postit_pro_v2');
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
    lang:      { type: String, default: 'fr' },
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
    isDefault:  { type: Boolean, default: false }
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
    allowedEmails: { type: [String], default: [] }
});

const Message = mongoose.model('Message', { 
    groupId: String, 
    deviceId: String, 
    postitId: String, 
    content: String, 
    senderName: String, 
    isNote: { type: Boolean, default: false },
    checked: { type: Boolean, default: false }, 
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

function generateJoinCode() {
    // Génère un code de 6 caractères (ex: 7X8Y2Z)
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// --- ROUTES API ---

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. RECHERCHE : On cherche l'utilisateur, rien de plus.
        const user = await User.findOne({ email });

        // 2. VÉRIFICATION : Si l'user n'existe pas OU si le password est faux
        // On renvoie la même erreur pour ne pas aider les hackers
        if (!user || user.password !== password) {
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

app.post('/api/register', async (req, res) => {
    try {
        const { name, firstname, lastname, email, password, phone, lang } = req.body;

        // 1. Vérifier si l'utilisateur existe déjà
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: "Cet email est déjà utilisé" });
        }

        // 2. Créer le nouvel utilisateur (sans groupe ni postit par défaut)
        const newUser = new User({
            name:      name || email.split('@')[0],
            firstname: firstname || '',
            lastname:  lastname  || '',
            email,
            password,
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
        const bcrypt = require('bcryptjs');
        const valid = await bcrypt.compare(currentPassword, user.password);
        if (!valid) return res.status(403).send('Mot de passe actuel incorrect');
        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();
        res.json({ ok: true });
    } catch(e) { res.status(500).send('Erreur serveur'); }
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
            logoUrl:  group.logoUrl  || null,
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

        const { name, siret, phonePro, emailPro, company, addr1, addr2, cp, ville, logoUrl } = req.body;
        if (name) group.name = name;
        if (siret    !== undefined) group.siret    = siret;
        if (phonePro !== undefined) group.phonePro = phonePro;
        if (emailPro !== undefined) group.emailPro = emailPro;
        if (company  !== undefined) group.company  = company;
        if (addr1    !== undefined) group.addr1    = addr1;
        if (addr2    !== undefined) group.addr2    = addr2;
        if (cp       !== undefined) group.cp       = cp;
        if (ville    !== undefined) group.ville    = ville;
        if (logoUrl  !== undefined) group.logoUrl  = logoUrl;
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

        // Vérifier que l'utilisateur invité existe
        const invitedUser = await User.findOne({ email });
        if (!invitedUser) return res.status(404).send("Utilisateur introuvable.");

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