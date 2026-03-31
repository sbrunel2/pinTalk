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

app.get('/api/groups', async (req, res) => res.json(await Group.find()));
app.post('/api/groups', async (req, res) => {
    const g = new Group(req.body);
    g.members.push({ email: "admin@system.com", role: "admin" });
    res.json(await g.save());
});

app.get('/api/devices/:gid', async (req, res) => res.json(await Device.find({ groupId: req.params.gid })));
app.post('/api/devices', async (req, res) => res.json(await new Device(req.body).save()));

app.get('/api/postits/:did', async (req, res) => res.json(await Postit.find({ deviceId: req.params.did })));
app.post('/api/postits', async (req, res) => res.json(await new Postit(req.body).save()));

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