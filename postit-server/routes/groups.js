// routes/groups.js
const express = require('express');
const router  = express.Router();
const { authenticateToken, generateJoinCode } = require('../helpers/auth');
const { _getUserRoleInGroup } = require('../helpers/permissions');
const { Group, Permission, Device, Postit, Message, Role } = require('../models');

// GET tous les groupes accessibles (proprio + membre)
router.get('/mine', authenticateToken, async (req, res) => {
    const userEmail = req.user.email;
    try {
        const ownedGroups = await Group.find({ ownerEmail: userEmail });
        const perms = await Permission.find({ guestEmail: userEmail });
        const memberGroupIds = perms.map(p => p.groupId);
        const memberGroups = await Group.find({ _id: { $in: memberGroupIds } });
        const allGroupIds = new Set(ownedGroups.map(g => g._id.toString()));
        const merged = [...ownedGroups];
        for (const g of memberGroups) {
            if (!allGroupIds.has(g._id.toString())) merged.push(g);
        }
        const result = await Promise.all(merged.map(async g => {
            const { type, droits } = await _getUserRoleInGroup(userEmail, g);
            return { ...g.toObject(), myRole: type, myDroits: droits };
        }));
        console.log(`[MINE] ${result.length} groupes accessibles pour ${userEmail}`);
        res.json(result);
    } catch (err) {
        console.error("Erreur /api/groups/mine:", err);
        res.status(500).send("Erreur serveur");
    }
});

// GET groupes dont je suis propriétaire (compatibilité)
router.get('/', authenticateToken, async (req, res) => {
    try {
        const groups = await Group.find({ ownerEmail: req.user.email });
        res.json(groups);
    } catch (err) {
        res.status(500).send("Erreur serveur");
    }
});

// GET config d'un groupe (myRole, myDroits, etc.)
router.get('/:id/config', authenticateToken, async (req, res) => {
    const userEmail = req.user.email;
    try {
        const group = await Group.findById(req.params.id);
        if (!group) return res.status(404).send("Groupe introuvable");
        const { type: myRole, droits: myDroits, isOwner } = await _getUserRoleInGroup(userEmail, group);
        if (!myRole) return res.status(403).send("Accès refusé");
        res.json({
            _id: group._id, name: group.name,
            type: group.type || 'perso', isPro: group.isPro || false,
            isDefault: group.isDefault || false, hasRayons: group.isPro === true,
            maxPostits: group.isPro ? 0 : 4, myRole, myDroits,
            joinCode: isOwner ? group.joinCode : null,
            logoUrl: group.logoUrl || null,
            tileColor: group.tileColor || '', tileTextColor: group.tileTextColor || '',
            tileShape: group.tileShape || 'rect', tileFontFamily: group.tileFontFamily || '',
            tileFontSize: group.tileFontSize || '',
            company: group.company || null, addr1: group.addr1 || null,
            addr2: group.addr2 || null, cp: group.cp || null,
            ville: group.ville || null, phonePro: group.phonePro || null,
            emailPro: group.emailPro || null, siret: group.siret || null,
        });
    } catch (err) {
        console.error("Erreur /api/groups/:id/config:", err);
        res.status(500).send("Erreur serveur");
    }
});

// POST créer un groupe
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { name, type, siret, phonePro, emailPro, company, addr1, addr2, cp, ville, logoUrl } = req.body;
        const userEmail = req.user.email;
        if (!name) return res.status(400).send("Le nom du groupe est obligatoire");
        const groupType = type === 'pro' ? 'pro' : 'perso';
        const isPro = groupType === 'pro';
        const g = new Group({
            name, ownerEmail: userEmail, joinCode: generateJoinCode(),
            type: groupType, isPro,
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

// PUT mettre à jour un groupe
router.put('/:id', authenticateToken, async (req, res) => {
    const userEmail = req.user.email;
    try {
        const group = await Group.findById(req.params.id);
        if (!group) return res.status(404).send("Groupe introuvable");
        if (group.ownerEmail !== userEmail) return res.status(403).send("Accès refusé");
        const { name, siret, phonePro, emailPro, company, addr1, addr2, cp, ville,
                logoUrl, tileColor, tileTextColor, tileShape, tileFontFamily, tileFontSize } = req.body;
        if (name)              group.name          = name;
        if (siret    !== undefined) group.siret    = siret;
        if (phonePro !== undefined) group.phonePro = phonePro;
        if (emailPro !== undefined) group.emailPro = emailPro;
        if (company  !== undefined) group.company  = company;
        if (addr1    !== undefined) group.addr1    = addr1;
        if (addr2    !== undefined) group.addr2    = addr2;
        if (cp       !== undefined) group.cp       = cp;
        if (ville    !== undefined) group.ville    = ville;
        if (logoUrl        !== undefined) group.logoUrl        = logoUrl;
        if (tileColor      !== undefined) group.tileColor      = tileColor;
        if (tileTextColor  !== undefined) group.tileTextColor  = tileTextColor;
        if (tileShape      !== undefined) group.tileShape      = tileShape;
        if (tileFontFamily !== undefined) group.tileFontFamily = tileFontFamily;
        if (tileFontSize   !== undefined) group.tileFontSize   = tileFontSize;
        await group.save();
        res.sendStatus(200);
    } catch (err) { res.status(500).send("Erreur serveur"); }
});

// DELETE supprimer un groupe (owner only, cascade complète)
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const groupId   = req.params.id;
        const userEmail = req.user.email;
        const group = await Group.findById(groupId);
        if (!group) return res.status(404).send("Groupe introuvable.");
        if (group.ownerEmail !== userEmail) return res.status(403).send("Seul le propriétaire peut supprimer le groupe.");
        const devices   = await Device.find({ groupId });
        const deviceIds = devices.map(d => d._id.toString());
        const postits   = await Postit.find({ deviceId: { $in: deviceIds } });
        const postitIds = postits.map(p => p._id.toString());
        await Message.deleteMany({ postitId: { $in: postitIds } });
        await Message.deleteMany({ groupId });
        await Postit.deleteMany({ deviceId: { $in: deviceIds } });
        await Device.deleteMany({ groupId });
        await Permission.deleteMany({ groupId });
        await Role.deleteMany({ groupId });
        await Group.findByIdAndDelete(groupId);
        console.log(`[DELETE GROUP] ${group.name} supprimé — cascade: ${deviceIds.length} devices, ${postitIds.length} postits`);
        res.sendStatus(200);
    } catch (err) {
        console.error("Erreur suppression groupe:", err);
        res.status(500).send("Erreur serveur lors de la suppression");
    }
});

// POST rejoindre un groupe via code
router.post('/join', authenticateToken, async (req, res) => {
    try {
        const { joinCode } = req.body;
        const userEmail = req.user.email;
        if (!joinCode) return res.status(400).send("Le code de ralliement est requis.");
        const group = await Group.findOne({ joinCode: joinCode.toUpperCase() });
        if (!group) return res.status(404).send("Code invalide. Ce commerce n'existe pas.");
        const existingPerm = await Permission.findOne({ groupId: group._id, guestEmail: userEmail });
        if (existingPerm) return res.json({ message: "Vous faites déjà partie de ce groupe.", group });
        await new Permission({ groupId: group._id, guestEmail: userEmail, type: 'client', role: 'client' }).save();
        console.log(`[JOIN] ${userEmail} a rejoint ${group.name} via le code ${joinCode}`);
        res.json(group);
    } catch (err) {
        console.error("Erreur adhésion groupe :", err);
        res.status(500).send("Erreur serveur lors de l'adhésion.");
    }
});

// DELETE quitter un groupe (membre seulement)
router.delete('/:id/leave', authenticateToken, async (req, res) => {
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

// GET route de fix legacy (admin)
router.get('/fix-groups', async (req, res) => {
    const email = req.query.email;
    const result = await Group.updateMany({ ownerEmail: { $exists: false } }, { $set: { ownerEmail: email } });
    res.send(`${result.modifiedCount} groupes récupérés par ${email}`);
});

module.exports = router;
