// routes/resources.js
// Devices, Postits, Messages, Archives — regroupés car très liés
const express  = require('express');
const router   = express.Router();
const cloudinary = require('cloudinary');
const { authenticateToken } = require('../helpers/auth');
const { _getUserRoleInGroup } = require('../helpers/permissions');
const { Group, Permission, Device, Postit, Message, Archive } = require('../models');

// ── DEVICES ───────────────────────────────────────────────────────────────────

// GET rayons d'un groupe (par :gid, route directe)
router.get('/devices/:gid', authenticateToken, async (req, res) => {
    res.json(await Device.find({ groupId: req.params.gid }));
});

// GET rayons avec filtre groupId ou groupName (archives + chat)
router.get('/devices', authenticateToken, async (req, res) => {
    try {
        const { groupId, groupName } = req.query;
        const userEmail = req.user.email;
        if (groupId) {
            const group = await Group.findById(groupId);
            if (!group) return res.json([]);
            const isOwner = group.ownerEmail === userEmail;
            if (!isOwner) {
                const perm = await Permission.findOne({ groupId: group._id.toString(), guestEmail: userEmail });
                if (!perm) return res.json([]);
            }
            return res.json(await Device.find({ groupId }));
        }
        const ownedGroups = await Group.find({ ownerEmail: userEmail });
        const perms = await Permission.find({ guestEmail: userEmail });
        const allGroupIds = [
            ...ownedGroups.map(g => g._id.toString()),
            ...perms.map(p => p.groupId)
        ];
        if (groupName) {
            const g = await Group.findOne({ name: groupName, ownerEmail: userEmail });
            if (g) return res.json(await Device.find({ groupId: g._id.toString() }));
            return res.json([]);
        }
        res.json(await Device.find({ groupId: { $in: allGroupIds } }));
    } catch (err) {
        console.error("Erreur récupération rayons :", err);
        res.status(500).send("Erreur serveur");
    }
});

// POST créer un rayon
router.post('/devices', authenticateToken, async (req, res) => {
    try {
        const { name, groupId } = req.body;
        const userEmail = req.user.email;
        if (!name || !groupId) return res.status(400).send("Nom et ID de groupe obligatoires");
        const device = new Device({ name, groupId, ownerEmail: userEmail, mac: req.body.mac || "00" });
        const saved  = await device.save();
        console.log(`[POST] Rayon créé : ${saved.name} (${userEmail})`);
        res.json(saved);
    } catch (err) {
        console.error("Erreur création rayon :", err);
        res.status(500).send("Erreur serveur lors de la création du rayon");
    }
});

// DELETE rayon + ses postits
router.delete('/devices/:id', authenticateToken, async (req, res) => {
    try {
        const deviceId = req.params.id;
        await Device.findByIdAndDelete(deviceId);
        const deleteResult = await Postit.deleteMany({ deviceId });
        console.log(`[DELETE] Rayon ${deviceId} supprimé avec ${deleteResult.deletedCount} post-its.`);
        res.sendStatus(200);
    } catch (err) {
        console.error("Erreur suppression rayon :", err);
        res.status(500).send("Erreur serveur lors de la suppression");
    }
});

// ── POSTITS ───────────────────────────────────────────────────────────────────

// GET postits par deviceId (direct, sans filtre sécurité — legacy)
router.get('/postits/:did', authenticateToken, async (req, res) => {
    res.json(await Postit.find({ deviceId: req.params.did }));
});

// GET postits avec filtre sécurité (rôle, brouillon, etc.)
router.get('/postits', authenticateToken, async (req, res) => {
    try {
        const { deviceId, filterDate } = req.query;
        const userEmail = req.user.email;
        if (!deviceId) return res.status(400).send("DeviceId requis");
        let query = { deviceId, status: { $ne: 'Récupéré' } };
        if (filterDate && filterDate !== "") query.pickupDate = { $regex: '^' + filterDate };
        const device = await Device.findById(deviceId);
        if (!device) return res.json([]);
        const group = await Group.findById(device.groupId);
        if (!group) return res.json([]);
        const { type: myRole, droits } = await _getUserRoleInGroup(userEmail, group);
        if (!myRole) return res.json([]);
        if (myRole === 'owner') {
            // owner voit tout
        } else if (myRole === 'employe') {
            if (group.type === 'pro' && !droits.includes('voir_brouillons'))
                query.status = { $nin: ['Récupéré', 'brouillon'] };
        } else {
            query.$or = [{ ownerEmail: userEmail }, { allowedEmails: userEmail }];
        }
        const postits = await Postit.find(query).sort({ pickupDate: 1 });
        console.log(`[GET Postits] ${postits.length} pour ${userEmail} (${myRole}) — rayon ${deviceId}`);
        res.json(postits);
    } catch (err) {
        console.error("Erreur GET Postits:", err);
        res.status(500).json({ message: "Erreur serveur" });
    }
});

// POST créer un postit
router.post('/postits', authenticateToken, async (req, res) => {
    try {
        const { deviceId, name, orderNumber, phone, pickupDate } = req.body;
        const userEmail = req.user.email;
        if (!deviceId || !name) return res.status(400).send("Données manquantes (Rayon ou Nom du client)");
        const device = await Device.findById(deviceId);
        if (!device) return res.status(404).send("Rayon introuvable.");
        const group = await Group.findById(device.groupId);
        if (!group) return res.status(404).send("Groupe introuvable.");
        const { type: myRole, droits } = await _getUserRoleInGroup(userEmail, group);
        // Perso : owner only, max 4
        if (group.type === 'perso') {
            if (myRole !== 'owner') return res.status(403).json({ message: "Seul le propriétaire peut créer des pintalk dans un groupe personnel.", forbidden: true });
            const deviceIds = (await Device.find({ groupId: group._id })).map(d => d._id);
            const count = await Postit.countDocuments({ deviceId: { $in: deviceIds }, status: { $nin: ['Terminé', 'Annulé', 'En caisse'] } });
            if (count >= 4) return res.status(403).json({ message: "Limite de 4 pintalk atteinte.", limitReached: true });
        } else {
            // Pro
            if (myRole === 'employe' && !droits.includes('creer_commande'))
                return res.status(403).json({ message: "Vous n'avez pas le droit de créer des commandes.", forbidden: true });
            if (!myRole) return res.status(403).json({ message: "Accès refusé.", forbidden: true });
            if (myRole === 'client') {
                const deviceIds = (await Device.find({ groupId: group._id })).map(d => d._id);
                const openCount = await Postit.countDocuments({ deviceId: { $in: deviceIds }, ownerEmail: userEmail, status: { $nin: ['Terminé', 'Annulé', 'En caisse'] } });
                if (openCount >= 4) return res.status(403).json({ message: "Vous avez déjà 4 commandes ouvertes.", limitReached: true });
            }
        }
        let allowedEmails = [];
        if (group.type === 'perso') {
            const perms = await Permission.find({ groupId: group._id.toString() });
            allowedEmails = perms.map(p => p.guestEmail);
        }
        const initialStatus = (group.type === 'pro' && myRole === 'client') ? 'brouillon' : 'En attente';
        const postit = new Postit({ deviceId, name, orderNumber, phone, pickupDate, ownerEmail: userEmail, status: initialStatus, allowedEmails });
        const saved = await postit.save();
        console.log(`[POST] Pintalk "${name}" par ${userEmail} (${myRole}) — ${group.type}`);
        res.json(saved);
    } catch (err) {
        console.error("Erreur création postit:", err);
        res.status(500).send("Erreur serveur lors de la création de la commande");
    }
});

// PUT modifier un postit
router.put('/postits/:id', authenticateToken, async (req, res) => {
    try {
        const userEmail = req.user.email;
        const postit = await Postit.findById(req.params.id);
        if (!postit) return res.status(404).send("Post-it introuvable.");
        // Vérif droits : owner du postit ou owner/admin du groupe
        let canEdit = (postit.ownerEmail === userEmail);
        if (!canEdit) {
            const device = await Device.findById(postit.deviceId);
            const group  = device ? await Group.findById(device.groupId) : null;
            if (group) {
                if (group.ownerEmail === userEmail) canEdit = true;
                else {
                    const perm = await Permission.findOne({ groupId: group._id.toString(), guestEmail: userEmail });
                    if (perm && perm.role === 'admin') canEdit = true;
                }
            }
        }
        if (!canEdit) return res.status(403).send("Accès refusé.");
        const { name, orderNumber, phone, email, pickupDate } = req.body;
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

// DELETE postit
router.delete('/postits/:id', authenticateToken, async (req, res) => {
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

// POST inviter email sur un postit (accès postit-level)
router.post('/postits/:id/invite', authenticateToken, async (req, res) => {
    try {
        const userEmail = req.user.email;
        const { email } = req.body;
        if (!email) return res.status(400).send('Email requis');
        const postit = await Postit.findById(req.params.id);
        if (!postit) return res.status(404).send('Postit introuvable');
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
        if (!postit.allowedEmails.includes(email)) { postit.allowedEmails.push(email); await postit.save(); }
        if (group && group.ownerEmail !== email) {
            const existPerm = await Permission.findOne({ groupId: group._id.toString(), guestEmail: email });
            if (!existPerm) await Permission.create({ groupId: group._id.toString(), guestEmail: email, role: 'client' });
        }
        res.json({ ok: true, allowedEmails: postit.allowedEmails });
    } catch(err) { res.status(500).send('Erreur serveur'); }
});

// DELETE retirer email invité sur un postit
router.delete('/postits/:id/invite/:email', authenticateToken, async (req, res) => {
    try {
        const userEmail     = req.user.email;
        const emailToRemove = decodeURIComponent(req.params.email);
        const postit = await Postit.findById(req.params.id);
        if (!postit) return res.status(404).send('Postit introuvable');
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
    } catch(err) { res.status(500).send('Erreur serveur'); }
});

// GET liste des emails invités sur un postit
router.get('/postits/:id/invites', authenticateToken, async (req, res) => {
    try {
        const postit = await Postit.findById(req.params.id);
        if (!postit) return res.status(404).send('Postit introuvable');
        res.json(postit.allowedEmails || []);
    } catch(err) { res.status(500).send('Erreur serveur'); }
});

// GET fix-postits (legacy admin)
router.get('/fix-postits', authenticateToken, async (req, res) => {
    try {
        const result = await Postit.updateMany({ ownerEmail: { $exists: false } }, { $set: { ownerEmail: req.user.email } });
        res.send(`${result.modifiedCount} commandes rattachées à ${req.user.email}`);
    } catch (err) { res.status(500).send(err.message); }
});

// ── MESSAGES ──────────────────────────────────────────────────────────────────

// PATCH modifier contenu d'un message
router.patch('/messages/:id', authenticateToken, async (req, res) => {
    try {
        const { content } = req.body;
        if (!content || content.trim() === "") return res.status(400).send("Contenu vide non autorisé");
        const msg = await Message.findById(req.params.id);
        if (!msg) return res.status(404).send("Message non trouvé");
        msg.content = content.trim();
        await msg.save();
        // io est injecté via req.app.get('io')
        req.app.get('io').emit('message-content-updated', { messageId: req.params.id, newContent: msg.content });
        res.sendStatus(200);
    } catch (err) { res.status(500).send("Erreur serveur"); }
});

// DELETE supprimer un message (+ Cloudinary si image + notes IA liées)
router.delete('/messages/:id', authenticateToken, async (req, res) => {
    try {
        const msg = await Message.findById(req.params.id);
        if (!msg) return res.status(404).send("Message non trouvé");
        if (msg.type === 'image' && msg.content && msg.content.includes('cloudinary.com')) {
            try {
                const parts    = msg.content.split('/');
                const fileName = parts[parts.length - 1];
                const publicId = 'pintalk_uploads/' + fileName.split('.')[0];
                await cloudinary.v2.uploader.destroy(publicId);
                console.log("Image Cloudinary supprimée:", publicId);
            } catch (cloudErr) { console.error("Avertissement Cloudinary:", cloudErr.message); }
        }

        // Supprimer le message principal
        await Message.findByIdAndDelete(req.params.id);

        // Supprimer les notes IA liées (sourceMessageId === id du message supprimé)
        // Sans ça, elles reviennent au prochain chargement de l'historique
        const aiNotes = await Message.find({
            sourceMessageId: req.params.id,
            senderName: '✨ IA'
        });
        for (const note of aiNotes) {
            await Message.findByIdAndDelete(note._id);
            req.app.get('io').emit('message-deleted', note._id.toString());
        }
        if (aiNotes.length > 0) {
            console.log(`[DELETE] ${aiNotes.length} notes IA supprimées pour message ${req.params.id}`);
        }

        req.app.get('io').emit('message-deleted', req.params.id);
        res.sendStatus(200);
    } catch (err) { res.status(500).send("Erreur serveur"); }
});

// ── ARCHIVES ──────────────────────────────────────────────────────────────────

// POST sauvegarder une archive
router.post('/archives/backup', authenticateToken, async (req, res) => {
    try {
        const userEmail = req.user.email;
        console.log("📦 Archive pour :", req.body.postitName, `(${userEmail})`);
        const newArch = new Archive({ ...req.body, ownerEmail: userEmail });
        await newArch.save();
        res.status(201).json(newArch);
    } catch (err) {
        console.error("Erreur sauvegarde archive:", err);
        res.status(500).send("Erreur lors de l'archivage");
    }
});

// GET récupérer des archives filtrées
router.get('/archives', authenticateToken, async (req, res) => {
    try {
        const { group, device, postit } = req.query;
        const archives = await Archive.find({ groupName: group, deviceName: device, postitName: postit })
            .sort({ archivedAt: -1 });
        res.json(archives);
    } catch (err) { res.status(500).send(err.message); }
});

module.exports = router;
