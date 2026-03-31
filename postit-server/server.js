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
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

//mongoose.connect('mongodb://localhost:27017/postit_pro_v2');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/postit_pro_v2';
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ Connecté à MongoDB"))
  .catch(err => console.error("❌ Erreur de connexion MongoDB:", err));

const User = mongoose.model('User', { 
    email: String, 
    password: String, 
    name: String 
});

// 1. Le Groupe : contient uniquement l'identité du commerce
const Group = mongoose.model('Group', { 
    name: String, 
    ownerEmail: String,
    joinCode: { type: String, unique: true } // Le code pour Mme Michu
});

// 2. Les Permissions : chaque ligne est un lien entre UN utilisateur et UN groupe
const Permission = mongoose.model('Permission', {
    groupId: String,    // L'ID du groupe (ex: ID de la Boucherie)
    guestEmail: String, // L'email de Mme Michu ou Thierry
    role: { 
        type: String, 
        enum: ['employe', 'client'], 
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
    ownerEmail: String, // <--- AJOUTÉ : Pour que les clients soient privés
    name: String,        
    orderNumber: String, 
    phone: String,       
    pickupDate: String,  
    status: { type: String, default: 'En attente' },
    isLocked: { type: Boolean, default: false }
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
    const { email, password } = req.body;
    let user = await User.findOne({ email });
    
    if (user) {
        // Cas : Utilisateur existant
        if (user.password !== password) {
            return res.status(401).send("Erreur Password");
        }
    } else {
        // Cas : Nouvel utilisateur (Création auto)
        user = new User({ 
            email, 
            password, 
            name: email.split('@')[0] 
        });
        await user.save();
    }

    // ON GÉNÈRE LE TOKEN POUR TOUT LE MONDE (Existant ou Nouveau)
    const token = jwt.sign(
        { userId: user._id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );
    
    // On renvoie toujours la même structure
    res.json({ user, token });
});

// --- AJOUTER CE BLOC DANS TON SERVEUR ---

app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // 1. Vérifier si l'utilisateur existe déjà (pour éviter les doublons)
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: "Cet email est déjà utilisé" });
        }

        // 2. Créer le nouvel utilisateur
        const newUser = new User({
            name,
            email,
            password // Attention : en production, il faudra hasher ce MDP
        });

        await newUser.save();

        // 3. Répondre avec les infos de l'utilisateur pour le connecter direct
        res.status(201).json({ 
            user: { _id: newUser._id, name: newUser.name, email: newUser.email }
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
        if (err) return res.status(403).send("Token invalide ou expiré");
        req.user = user; // On attache l'utilisateur à la requête pour les routes suivantes
        next();
    });
};

// On applique le middleware JWT à toutes les routes /api SAUF login et register
app.use('/api', (req, res, next) => {
    if (req.path === '/login' || req.path === '/register') return next();
    return authenticateToken(req, res, next);
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


app.get('/api/groups', async (req, res) => {
    // On récupère l'email passé dans l'URL (ex: /api/groups?email=test@test.com)
    const userEmail = req.query.email;

    try {
        // ON FILTRE : On ne cherche que les groupes dont l'ownerEmail correspond
        const groups = await Group.find({ ownerEmail: userEmail });
        
        console.log(`${groups.length} groupes trouvés pour ${userEmail}`);
        res.json(groups);
    } catch (err) {
        console.error("Erreur récup groupes:", err);
        res.status(500).send("Erreur serveur");
    }
});


app.post('/api/groups', async (req, res) => {
    try {
        // 1. On ne récupère que le 'name' depuis le body. 
        // 🗑️ On retire 'ownerEmail' de la déstructuration.
        const { name } = req.body;
        
        // 2. 🔑 On récupère l'email SECURISE depuis le token (grâce au middleware)
        const userEmail = req.user.email; 
        
        if (!name) return res.status(400).send("Le nom du groupe est obligatoire");

        // 3. Création du groupe avec l'email du Token
        const g = new Group({ 
            name: name,
            ownerEmail: userEmail, // <--- C'est l'email du badge !
            joinCode: generateJoinCode() 
        });

        const savedGroup = await g.save();
        
        console.log(`[V3] Groupe créé : ${savedGroup.name} (Code: ${savedGroup.joinCode}) par ${userEmail}`);
        res.json(savedGroup);
    } catch (err) {
        console.error("Erreur création groupe:", err);
        res.status(500).send("Erreur lors de la création du groupe");
    }
});

// --- ROUTES DEVICES ---

// 1. Pour le CHAT (Direct) : avec ID obligatoire
app.get('/api/devices/:gid', async (req, res) => {
    res.json(await Device.find({ groupId: req.params.gid }));
});

// 2. Pour les ARCHIVES : sans ID dans l'URL, utilise le query ?groupName=...
app.get('/api/devices', async (req, res) => {
    try {
        // 1. On récupère le groupId depuis l'URL (si présent)
        // 🗑️ On retire 'email' car on va utiliser req.user.email
        const { groupId } = req.query; 
        const userEmail = req.user.email; // 🔑 Extrait du Token
        
        const query = {};

        // 2. Si un groupId est précisé, on filtre par groupe
        if (groupId) {
            query.groupId = groupId;
        }

        // 3. SÉCURITÉ : On ne montre que les rayons appartenant à cet utilisateur
        // On garde ton $or pour la transition (pour voir les anciens rayons sans propriétaire)
        query.$or = [
            { ownerEmail: userEmail },
            { ownerEmail: { $exists: false } } 
        ];

        const devices = await Device.find(query);
        
        console.log(`[GET] ${devices.length} rayons trouvés pour ${userEmail} (Groupe: ${groupId || 'Tous'})`);
        
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

        // SCÉNARIO A : Si ce n'est PAS le propriétaire du commerce (Véro)
        if (group.ownerEmail !== userEmail) {
            
            // On vérifie le SCÉNARIO B : Est-ce un employé (Thierry) ?
            const perm = await Permission.findOne({ 
                groupId: group._id, 
                guestEmail: userEmail, 
                role: 'employe' 
            });
            
            if (!perm) {
                // SCÉNARIO C : Ce n'est ni le patron, ni un employé -> C'est un client (Mme Michu)
                // Elle ne voit QUE ses propres post-its (filtrage strict par son email du Token)
                query.ownerEmail = userEmail;
            }
        }
        // Note : Si c'est le patron ou l'employé, 'query.ownerEmail' n'est pas ajouté,
        // donc ils voient TOUS les post-its du rayon.

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

        // 2. Vérification des infos minimales (sans l'email du body donc)
        if (!deviceId || !name) {
            return res.status(400).send("Données manquantes (Rayon ou Nom du client)");
        }

        // 3. Création du Post-it "tatoué" avec l'email du Token
        const postit = new Postit({
            deviceId,
            name,
            orderNumber,
            phone,
            pickupDate,
            ownerEmail: userEmail, // <--- Sécurité garantie
            status: 'En attente'
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

app.post('/api/upload', upload.single('file'), (req, res) => {
    if (req.file) res.json({ url: `/uploads/${req.file.filename}` });
    else res.status(400).send("Erreur");
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

app.get('/api/groups/:id/members', async (req, res) => {
    try {
        const groupId = req.params.id;
        const userEmail = req.user.email; // 🔑 Identité du demandeur

        // 1. VÉRIFICATION DE SÉCURITÉ : Est-ce que le demandeur est le patron ?
        const group = await Group.findById(groupId);
        if (!group) return res.status(404).send("Groupe introuvable.");

        if (group.ownerEmail !== userEmail) {
            return res.status(403).send("Accès refusé : Seul le propriétaire peut voir la liste des membres.");
        }

        // 2. Si c'est bien le patron, on va chercher les permissions (employés + clients)
        const perms = await Permission.find({ groupId: groupId });
        
        // 3. On transforme pour le front-end
        const members = perms.map(p => ({
            email: p.guestEmail,
            role: p.role
        }));

        console.log(`[GET] Liste membres envoyée pour le groupe ${group.name} à ${userEmail}`);
        res.json(members);

    } catch (err) {
        console.error("Erreur récup membres:", err);
        res.status(500).send("Erreur serveur");
    }
});

// --- NOUVELLES ROUTES DE MISE À JOUR (UPDATE) ---
app.put('/api/groups/:id', async (req, res) => {
    await Group.findByIdAndUpdate(req.params.id, { name: req.body.name });
    res.sendStatus(200);
});

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
        // 1. On récupère les données à modifier du body.
        // 🗑️ On dégage 'ownerEmail' : on utilise l'identité du Token.
        const { name, orderNumber, phone, pickupDate } = req.body;
        const userEmail = req.user.email; // 🔑 Identité certifiée

        // 2. On cherche le post-it ET on vérifie qu'il appartient bien à cet utilisateur
        // Cela empêche un utilisateur A de modifier un post-it appartenant à B.
        const postit = await Postit.findOneAndUpdate(
            { _id: req.params.id, ownerEmail: userEmail }, 
            { 
                name, 
                orderNumber, 
                phone, 
                pickupDate 
            },
            { new: true } 
        );

        if (!postit) {
            // Si le post-it n'existe pas OU si l'ownerEmail ne correspond pas
            return res.status(404).send("Post-it non trouvé ou accès refusé.");
        }

        console.log(`[PUT] Post-it mis à jour par ${userEmail} : ${postit.name}`);
        res.sendStatus(200);
    } catch (err) {
        console.error("Erreur modification postit:", err);
        res.status(500).send("Erreur serveur lors de la modification.");
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

app.delete('/api/postits/:id', async (req, res) => {
    await Postit.findByIdAndDelete(req.params.id);
    res.sendStatus(200);
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
        const msgs = await Message.find({ groupId: data.groupId }).sort({ date: -1 }).limit(50);
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