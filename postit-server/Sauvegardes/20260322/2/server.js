const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static('public'));

mongoose.connect('mongodb://localhost:27017/postit_pro_v2');

const User = mongoose.model('User', { email: String, password: String, name: String });
const Group = mongoose.model('Group', { name: String, members: [{ email: String, role: String }] });
const Device = mongoose.model('Device', { groupId: String, name: String, mac: String });
const Postit = mongoose.model('Postit', { deviceId: String, name: String });
const Message = mongoose.model('Message', { groupId: String, deviceId: String, postitId: String, content: String, senderName: String, date: { type: Date, default: Date.now } });

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

app.get('/api/groups', async (req, res) => res.json(await Group.find()));
app.post('/api/groups', async (req, res) => {
    const g = new Group(req.body);
    g.members.push({ email: "admin@system.com", role: "admin" });
    res.json(await g.save());
});


// --- ROUTES DEVICES ---

// 1. Pour le CHAT (Direct) : avec ID obligatoire
app.get('/api/devices/:gid', async (req, res) => {
    res.json(await Device.find({ groupId: req.params.gid }));
});

// 2. Pour les ARCHIVES : sans ID dans l'URL, utilise le query ?groupName=...
app.get('/api/devices', async (req, res) => {
    let query = {};
    if (req.query.groupName) {
        const g = await Group.findOne({ name: req.query.groupName });
        if (g) query.groupId = g._id;
        else return res.json([]);
    }
    res.json(await Device.find(query));
});

// --- ROUTES POSTITS ---

// 1. Pour le CHAT (Direct) : avec ID obligatoire
app.get('/api/postits/:did', async (req, res) => {
    res.json(await Postit.find({ deviceId: req.params.did }));
});

// 2. Pour les ARCHIVES : sans ID dans l'URL, utilise le query ?deviceName=...
app.get('/api/postits', async (req, res) => {
    let query = {};

    if (req.query.deviceName) {
        const d = await Device.findOne({ name: req.query.deviceName });
        if (d) {
            // On cherche les post-its qui ont soit l'ID en format Objet, soit en format Texte
            query.$or = [
                { deviceId: d._id },           // Format ObjectId
                { deviceId: d._id.toString() } // Format String
            ];
            console.log("Recherche Post-its avec query:", JSON.stringify(query));
        } else {
            return res.json([]);
        }
    } else if (req.query.deviceId) {
        query.deviceId = req.query.deviceId;
    }

    try {
        const postits = await Postit.find(query);
        console.log(`Nb de post-its trouvés en base : ${postits.length}`);
        res.json(postits);
    } catch (err) {
        console.error("Erreur Postit.find:", err);
        res.status(500).json(err);
    }
});

app.post('/api/devices', async (req, res) => res.json(await new Device(req.body).save()));

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

app.put('/api/postits/:id', async (req, res) => {
    await Postit.findByIdAndUpdate(req.params.id, { name: req.body.name });
    res.sendStatus(200);
});

// --- ROUTES DE SUPPRESSION ---
app.delete('/api/groups/:id', async (req, res) => {
    await Group.findByIdAndDelete(req.params.id);
    await Device.deleteMany({ groupId: req.params.id });
    res.sendStatus(200);
});

app.delete('/api/devices/:id', async (req, res) => {
    await Device.findByIdAndDelete(req.params.id);
    await Postit.deleteMany({ deviceId: req.params.id });
    res.sendStatus(200);
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
});

server.listen(3000, () => console.log('🚀 Serveur prêt sur http://localhost:3000'));