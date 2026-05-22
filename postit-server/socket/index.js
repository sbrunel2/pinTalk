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

        // ── Join/Leave room groupe (pour cibler les émissions par groupe) ─────
        socket.on('join-group', (groupId) => {
            if (!groupId) return;
            // Quitter les rooms groupe précédentes
            for (const room of socket.rooms) {
                if (room.startsWith('group:') && room !== `group:${groupId}`) {
                    socket.leave(room);
                }
            }
            socket.join(`group:${groupId}`);
        });

        socket.on('leave-group', (groupId) => {
            if (groupId) socket.leave(`group:${groupId}`);
        });

        // ── Historique ────────────────────────────────────────────────────────
        socket.on('get-history', async (data) => {
            try {
                if (!data.groupId) return;
                const filter = { groupId: data.groupId };
                if (data.postitId) filter.postitId = data.postitId;
                // Inclure sourceMessageId dans la projection pour que le front
                // puisse vérifier alreadyHasAi sans re-déclencher l'extraction
                const msgs = await Message.find(filter)
                    .sort({ date: -1 })
                    .limit(200)
                    .select('-__v')  // tout sauf __v
                    .lean();         // plus rapide, pas besoin de Mongoose doc
                socket.emit('history-data', msgs);
            } catch(err) { console.error('[SOCKET] get-history:', err); }
        });

        // ── Envoi de message ──────────────────────────────────────────────────
        socket.on('send-message', async (data) => {
            try {
                if (!data.postitId || !data.groupId) return;
                // Champs autorisés uniquement (whitelist) pour éviter l'injection
                const msg = new Message({
                    groupId         : data.groupId,
                    deviceId        : data.deviceId   || '',
                    postitId        : data.postitId,
                    content         : data.content    || '',
                    senderName      : data.senderName || '',
                    type            : data.type       || 'text',
                    isNote          : !!data.isNote,
                    isUncertain     : !!data.isUncertain,
                    sourceMessageId : data.sourceMessageId || null,
                    checked         : false,
                    date            : new Date(),
                });
                await msg.save();
                // Émettre UNIQUEMENT aux clients du même groupe (room)
                // évite que tous les utilisateurs reçoivent tous les messages
                io.to(`group:${data.groupId}`).emit('new-message', msg);
                // Si l'émetteur n'est pas dans la room (edge case), lui envoyer quand même
                socket.emit('new-message', msg);
            } catch(err) { console.error('[SOCKET] send-message:', err); }
        });

        // ── Toggle note (message ↔ note) ──────────────────────────────────────
        socket.on('toggle-message-note', async (data) => {
            try {
                const msg = await Message.findById(data.messageId);
                if (msg) {
                    msg.isNote = !msg.isNote;
                    await msg.save();
                    io.to(`group:${msg.groupId}`).emit('message-updated', { messageId: msg._id, isNote: msg.isNote });
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
                    io.to(`group:${msg.groupId}`).emit('line-checked-updated', { messageId: msg._id, checked: msg.checked });
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
                    // groupId : passé par le client dans data, sinon fallback sur socket rooms
                    const groupId = data.groupId || [...socket.rooms]
                        .find(r => r.startsWith('group:'))?.replace('group:', '');

                    if (data.comment && data.comment.trim() !== '') {
                        // Libellé du message système selon le statut
                        const label = data.status === 'annulée' || data.status === 'Annulé'
                            ? `⚠️ ANNULATION : ${data.comment}`
                            : `ℹ️ ${data.status} — ${data.comment}`;
                        const newMessage = new Message({
                            groupId  : groupId || '',
                            postitId : data.postitId,
                            senderName: 'SYSTÈME',
                            content  : label,
                            isNote   : false,
                            date     : new Date(),
                        });
                        await newMessage.save();
                        if (groupId) io.to(`group:${groupId}`).emit('new-message', newMessage);
                        else io.emit('new-message', newMessage); // fallback broadcast
                    }

                    if (groupId) {
                        io.to(`group:${groupId}`).emit('postit-status-updated', { postitId: postit._id, status: postit.status });
                    } else {
                        io.emit('postit-status-updated', { postitId: postit._id, status: postit.status });
                    }
                }
            } catch (err) { console.error('Erreur update-status:', err); }
        });
    });
}

module.exports = { initSocket };
