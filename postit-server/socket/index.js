// socket/index.js
// Tous les handlers Socket.io de l'application
const jwt     = require('jsonwebtoken');
const { Message, Postit } = require('../models');

// Map userEmail → socket actif (une seule session par user)
const _userSockets = new Map();

function initSocket(io) {
    // ── Middleware JWT ────────────────────────────────────────────────────────
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) return next(new Error("Accès refusé : Token manquant"));
        jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
            if (err) return next(new Error("Token invalide"));
            socket.user = user;
            next();
        });
    });

    io.on('connection', (socket) => {
        // ── Session unique par utilisateur ────────────────────────────────────
        const userEmail = socket.user?.email;
        if (userEmail) {
            const prevSocket = _userSockets.get(userEmail);
            if (prevSocket && prevSocket.id !== socket.id) {
                console.log('[SOCKET] Session dupliquée pour', userEmail, '— déconnexion du socket précédent:', prevSocket.id);
                prevSocket.emit('session-replaced', { message: 'Une nouvelle session a été ouverte sur un autre appareil.' });
                prevSocket.disconnect(true);
            }
            _userSockets.set(userEmail, socket);
            socket.on('disconnect', () => {
                if (_userSockets.get(userEmail)?.id === socket.id) {
                    _userSockets.delete(userEmail);
                    console.log('[SOCKET] Session fermée pour', userEmail);
                }
            });
        }

        // ── Historique ────────────────────────────────────────────────────────
        socket.on('get-history', async (data) => {
            const filter = { groupId: data.groupId };
            if (data.postitId) filter.postitId = data.postitId;
            const msgs = await Message.find(filter).sort({ date: -1 }).limit(100);
            socket.emit('history-data', msgs);
        });

        // ── Envoi de message ──────────────────────────────────────────────────
        socket.on('send-message', async (data) => {
            const msg = new Message(data);
            await msg.save();
            io.emit('new-message', msg);
        });

        // ── Toggle note (message ↔ note) ──────────────────────────────────────
        socket.on('toggle-message-note', async (data) => {
            try {
                const msg = await Message.findById(data.messageId);
                if (msg) {
                    msg.isNote = !msg.isNote;
                    await msg.save();
                    io.emit('message-updated', { messageId: msg._id, isNote: msg.isNote });
                }
            } catch (err) { console.error("Erreur toggle-note:", err); }
        });

        // ── Toggle check ligne ────────────────────────────────────────────────
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

        // ── Mise à jour statut postit ─────────────────────────────────────────
        socket.on('update-postit-status', async (data) => {
            try {
                const postit = await Postit.findByIdAndUpdate(
                    data.postitId,
                    { status: data.status },
                    { returnDocument: 'after' }
                );
                if (postit) {
                    if (data.comment && data.comment.trim() !== "") {
                        const newMessage = new Message({
                            postitId: data.postitId,
                            senderName: "SYSTÈME",
                            content: `⚠️ ANNULATION : ${data.comment}`,
                            isNote: false
                        });
                        await newMessage.save();
                        io.emit('new-message', newMessage);
                    }
                    io.emit('postit-status-updated', { postitId: postit._id, status: postit.status });
                }
            } catch (err) { console.error("Erreur update-status:", err); }
        });
    });
}

module.exports = { initSocket };
