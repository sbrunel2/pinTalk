const express = require('express');
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

mongoose.connect('mongodb://localhost:27017/postit_pro_v2');

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
        if (user.password === password) return res.json({ user });
        return res.status(401).send("Erreur Password");
    }
    user = new User({ email, password, name: email.split('@')[0] });
    await user.save();
    res.json({ user });
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

    if (!userEmail) {
        return res.status(400).send("Email utilisateur requis pour filtrer les données.");
    }

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
        const { name, ownerEmail } = req.body;
        
        if (!name) return res.status(400).send("Le nom du groupe est obligatoire");

        // Création du groupe avec le code unique pour les clients
        const g = new Group({ 
            name: name,
            ownerEmail: ownerEmail,
            joinCode: generateJoinCode() 
        });

        const savedGroup = await g.save();
        
        // LOGIQUE V3 : On n'utilise plus g.members. 
        // Le créateur est reconnu par son "ownerEmail" dans toutes les routes.
        
        console.log(`[V3] Groupe créé : ${savedGroup.name} (Code: ${savedGroup.joinCode}) par ${ownerEmail}`);
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
        const { email, groupId } = req.query; 
        const query = {};
        
        // Si on a un groupId, c'est la priorité (utilisé par le chat et les params)
        if (groupId) {
            query.groupId = groupId;
        }

        // Sécurité V3 : Si on a un email, on s'assure que l'utilisateur possède bien ces rayons
        // On utilise $or pour être plus souple pendant la transition
        if (email) {
            query.$or = [
                { ownerEmail: email },
                { ownerEmail: { $exists: false } } // Permet de voir les anciens rayons non "tatoués"
            ];
        }
        
        const devices = await Device.find(query);
        console.log(`[GET] ${devices.length} rayons trouvés (Groupe: ${groupId || 'Tous'}, Email: ${email || 'Non fourni'})`);
        
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
        const { deviceId, email, filterDate } = req.query;

        if (!deviceId || !email) {
            return res.status(400).send("DeviceId et Email requis");
        }

        // 1. Initialisation de la requête avec tes filtres existants
        let query = { 
            deviceId: deviceId,
            status: { $ne: 'Récupéré' } // On garde ton filtre d'exclusion
        };

        // 2. Ajout du filtre de date si présent (ton regex)
        if (filterDate && filterDate !== "") {
            query.pickupDate = { $regex: '^' + filterDate };
        }

        // 3. LOGIQUE DE SÉCURITÉ V3 (L'intelligence de filtrage)
        const device = await Device.findById(deviceId);
        if (!device) return res.json([]);
        
        const group = await Group.findById(device.groupId);
        if (!group) return res.json([]);

        // Si ce n'est PAS la patronne (Véro)
        if (group.ownerEmail !== email) {
            // On vérifie si c'est un employé (Thierry)
            const perm = await Permission.findOne({ 
                groupId: group._id, 
                guestEmail: email, 
                role: 'employe' 
            });
            
            if (!perm) {
                // Ce n'est ni la patronne, ni un employé -> C'est Mme Michu
                // Elle ne voit que ses propres post-its
                query.ownerEmail = email;
            }
        }

        // 4. Exécution avec ton tri par date
        const postits = await Postit.find(query).sort({ pickupDate: 1 });
        res.json(postits);

    } catch (err) {
        console.error("Erreur GET Postits:", err);
        res.status(500).json(err);
    }
});

app.post('/api/devices', async (req, res) => {
    try {
        const { name, groupId, ownerEmail } = req.body; // On récupère l'email envoyé par le front

        if (!name || !groupId || !ownerEmail) {
            return res.status(400).send("Nom, ID de groupe et Email obligatoires");
        }

        // On crée le rayon en incluant l'ownerEmail
        const device = new Device({
            name,
            groupId,
            ownerEmail,
            mac: req.body.mac || "00"
        });

        const savedDevice = await device.save();
        console.log(`[POST] Rayon créé : ${savedDevice.name} (Propriétaire: ${ownerEmail})`);
        res.json(savedDevice);
    } catch (err) {
        console.error("Erreur création rayon :", err);
        res.status(500).send("Erreur serveur lors de la création du rayon");
    }
});

app.post('/api/postits', async (req, res) => {
    try {
        const { deviceId, name, orderNumber, phone, pickupDate, ownerEmail } = req.body;

        // Sécurité : on vérifie que les infos minimales sont là
        if (!deviceId || !name || !ownerEmail) {
            return res.status(400).send("Données manquantes (Rayon, Nom ou Email)");
        }

        const postit = new Postit({
            deviceId,
            name,
            orderNumber,
            phone,
            pickupDate,
            ownerEmail, // <--- Lié à l'utilisateur V3
            status: 'En attente'
        });

        const saved = await postit.save();
        console.log(`[POST] Post-it créé pour client: ${name} (Propriétaire: ${ownerEmail})`);
        res.json(saved);
    } catch (err) {
        console.error("Erreur création postit:", err);
        res.status(500).send("Erreur serveur");
    }
});

app.get('/api/fix-postits', async (req, res) => {
    const email = req.query.email;
    if (!email) return res.status(400).send("Email requis.");

    try {
        // On donne tous les post-its sans propriétaire à cet email
        const result = await Postit.updateMany(
            { ownerEmail: { $exists: false } }, 
            { $set: { ownerEmail: email } }
        );
        res.send(`${result.modifiedCount} commandes (post-its) ont été rattachées à ${email}`);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// --- ROUTES DES ARCHIVES ---

// 1. Créer une sauvegarde (Backup)
app.post('/api/archives/backup', async (req, res) => {
    try {
        console.log("📦 Réception d'une archive pour :", req.body.postitName);
        const newArch = new Archive(req.body);
        await newArch.save();
        res.status(201).json(newArch);
    } catch (err) {
        console.error("❌ Erreur sauvegarde archive:", err);
        res.status(500).send(err.message);
    }
});

app.post('/api/upload', upload.single('file'), (req, res) => {
    if (req.file) res.json({ url: `/uploads/${req.file.filename}` });
    else res.status(400).send("Erreur");
});

app.post('/api/groups/join', async (req, res) => {
    try {
        const { email, joinCode } = req.body;

        if (!email || !joinCode) {
            return res.status(400).send("Email et Code requis.");
        }

        // 1. On cherche le groupe qui possède ce code (insensible à la casse)
        const group = await Group.findOne({ joinCode: joinCode.toUpperCase() });
        
        if (!group) {
            return res.status(404).send("Code invalide. Ce commerce n'existe pas.");
        }

        // 2. Sécurité : On vérifie si Mme Michu n'est pas déjà cliente
        const existingPerm = await Permission.findOne({ 
            groupId: group._id, 
            guestEmail: email 
        });

        if (existingPerm) {
            // Si elle est déjà membre, on ne crée rien, on confirme juste
            return res.json({ message: "Vous faites déjà partie de ce groupe.", group });
        }

        // 3. On crée la permission automatique en tant que CLIENT
        const newPermission = new Permission({
            groupId: group._id,
            guestEmail: email,
            role: 'client' // <--- Toujours client par défaut via un code
        });

        await newPermission.save();

        console.log(`[JOIN] ${email} a rejoint ${group.name} via le code ${joinCode}`);
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
        // 1. On va chercher dans la table Permission tous ceux qui sont liés à ce groupe
        const perms = await Permission.find({ groupId: req.params.id });
        
        // 2. On transforme le résultat pour qu'il ressemble exactement 
        // à ce que ton app.js attend (un tableau d'objets avec email et role)
        const members = perms.map(p => ({
            email: p.guestEmail,
            role: p.role
        }));

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
        const { name, orderNumber, phone, pickupDate, ownerEmail } = req.body;

        // On cherche le post-it ET on vérifie qu'il appartient bien à cet email
        const postit = await Postit.findOneAndUpdate(
            { _id: req.params.id, ownerEmail: ownerEmail }, 
            { 
                name, 
                orderNumber, 
                phone, 
                pickupDate 
            },
            { new: true } // Pour renvoyer le document mis à jour
        );

        if (!postit) {
            return res.status(404).send("Post-it non trouvé ou vous n'avez pas l'autorisation.");
        }

        console.log(`[PUT] Post-it mis à jour : ${postit.name}`);
        res.sendStatus(200);
    } catch (err) {
        console.error("Erreur modification postit:", err);
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

app.delete('/api/postits/:id', async (req, res) => {
    await Postit.findByIdAndDelete(req.params.id);
    res.sendStatus(200);
});

// --- SOCKET.IO ---
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