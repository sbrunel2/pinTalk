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

const User = mongoose.model('User', { email: String, password: String, name: String });
const Group = mongoose.model('Group', { name: String, members: [{ email: String, role: String }] });
const Device = mongoose.model('Device', { groupId: String, name: String, mac: String });
// On ajoute le téléphone et le statut (en cours, prêt, livré)
const Postit = mongoose.model('Postit', { 
    deviceId: String, 
    name: String,        // Nom du client
    orderNumber: String, // Numéro de commande
    phone: String,       // Téléphone client
    pickupDate: String,  // Date de retrait (en string pour plus de simplicité au début)
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

app.get('/api/groups', async (req, res) => {
    try {
        const groups = await Group.find();
        console.log(`${groups.length} groupes trouvés`); // Pour tes tests
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

        // Création du groupe avec le nom et l'email du créateur
        const g = new Group({ 
            name: name,
            ownerEmail: ownerEmail // Pour savoir à qui appartient le groupe
        });

        // Optionnel : Si tu as un champ "members" dans ton schéma Group, 
        // on y ajoute le créateur comme premier membre admin
        if (g.members) {
            g.members.push({ email: ownerEmail, role: "admin" });
        }

        const savedGroup = await g.save();
        console.log(`Nouveau groupe créé : ${savedGroup.name} par ${ownerEmail}`);
        
        res.json(savedGroup);
    } catch (err) {
        console.error("Erreur création groupe:", err);
        res.status(500).send("Erreur lors de la création du groupe sur le serveur");
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
        // On récupère le groupId depuis les paramètres de l'URL
        const { groupId } = req.query; 
        
        // On crée le filtre : si groupId existe, on filtre, sinon on prend tout
        const query = groupId ? { groupId: groupId } : {};
        
        const devices = await Device.find(query);
        
        // Log de contrôle pour ton terminal (optionnel mais utile)
        console.log(`[GET] ${devices.length} rayons trouvés pour le groupe : ${groupId || 'Tous'}`);
        
        res.json(devices);
    } catch (err) {
        console.error("Erreur lors de la récupération des rayons :", err);
        res.status(500).send("Erreur serveur lors de la lecture des rayons");
    }
});

// --- ROUTES POSTITS ---

// 1. Pour le CHAT (Direct) : avec ID obligatoire
app.get('/api/postits/:did', async (req, res) => {
    res.json(await Postit.find({ deviceId: req.params.did }));
});

// 2. Pour les ARCHIVES : sans ID dans l'URL, utilise le query ?deviceName=...
app.get('/api/postits', async (req, res) => {
    let query = {};

    try {
        // Filtrage par Display (Rayon) - Obligatoire
        if (req.query.deviceId) {
            query.deviceId = req.query.deviceId;
        }

        // Filtre de Date Optionnel
        if (req.query.filterDate && req.query.filterDate !== "") {
            // Regex pour matcher le début de la string ISO (YYYY-MM-DD)
            query.pickupDate = { $regex: '^' + req.query.filterDate };
        }

        // Exclure les commandes déjà livrées/terminées
        // On ne montre que ce qui est à préparer ou prêt
        query.status = { $ne: 'Récupéré' };

        const postits = await Postit.find(query).sort({ pickupDate: 1 });
        res.json(postits);
    } catch (err) {
        console.error(err);
        res.status(500).json(err);
    }
});
app.post('/api/devices', async (req, res) => {
    try {
        // req.body contient { name, groupId, mac } envoyés par app.js
        const { name, groupId } = req.body;

        if (!name || !groupId) {
            return res.status(400).send("Nom et ID de groupe obligatoires");
        }

        const device = new Device(req.body);
        const savedDevice = await device.save();
        
        console.log(`[POST] Rayon créé : ${savedDevice.name} dans le groupe ${groupId}`);
        res.json(savedDevice);
    } catch (err) {
        console.error("Erreur création rayon :", err);
        res.status(500).send("Erreur serveur lors de la création du rayon");
    }
});

app.post('/api/postits', async (req, res) => res.json(await new Postit(req.body).save()));

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
    const g = await Group.findById(req.params.id);
    res.json(g ? g.members : []);
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
    await Postit.findByIdAndUpdate(req.params.id, { 
        name: req.body.name,
        orderNumber: req.body.orderNumber,
        phone: req.body.phone,
        pickupDate: req.body.pickupDate
    });
    res.sendStatus(200);
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