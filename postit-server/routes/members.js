// routes/members.js
// Gestion des membres (/api/groups/:id/members) et des rôles pro (/api/groups/:id/roles)
const express = require('express');
const router  = express.Router({ mergeParams: true }); // mergeParams pour accéder à :id
const crypto  = require('crypto');
const os      = require('os');
const { authenticateToken } = require('../helpers/auth');
const { _getUserRoleInGroup, ALL_DROITS } = require('../helpers/permissions');
const { _getMailTransport, _inviteCodes } = require('../helpers/mail');
const { Group, Permission, Role, Device, Postit, User } = require('../models');

// ── Membres ───────────────────────────────────────────────────────────────────

// GET liste des membres
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { id: groupId } = req.params;
        const userEmail = req.user.email;
        const group = await Group.findById(groupId);
        if (!group) return res.status(404).send("Groupe introuvable.");
        const { type: myRole, droits, isOwner } = await _getUserRoleInGroup(userEmail, group);
        if (!isOwner && !(myRole === 'employe' && droits.includes('gerer_membres'))) {
            return res.status(403).send("Accès refusé.");
        }
        const perms = await Permission.find({ groupId }).populate('roles', 'name droits');
        const members = perms.map(p => ({
            email: p.guestEmail,
            type:  p.type || (p.role === 'admin' || p.role === 'employe' ? 'employe' : 'client'),
            role:  p.role,
            roles: p.roles || [],
            id:    p._id
        }));
        res.json(members);
    } catch (err) {
        console.error("Erreur récup membres:", err);
        res.status(500).send("Erreur serveur");
    }
});

// POST inviter un membre
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { id: groupId } = req.params;
        const userEmail = req.user.email;
        const { email, role, type: reqType } = req.body;
        if (!email) return res.status(400).send("Email requis");

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).send("Groupe introuvable.");
        const { type: myRole, droits, isOwner } = await _getUserRoleInGroup(userEmail, group);

        if (!isOwner) {
            if (myRole !== 'employe' || !droits.includes('gerer_membres'))
                return res.status(403).send("Accès refusé.");
            if (reqType === 'employe' || role === 'employe' || role === 'admin')
                return res.status(403).send("Seul le propriétaire peut ajouter des employés.");
        }

        // Utilisateur inconnu → invitation email automatique
        const invitedUser = await User.findOne({ email });
        if (!invitedUser) {
            const invToken   = crypto.randomBytes(24).toString('hex');
            const invExpires = Date.now() + 48 * 3600 * 1000;
            _inviteCodes.set(invToken, { email, groupId, expires: invExpires });
            const appUrl    = process.env.APP_URL || `http://${os.hostname()}:3000`;
            const inviteUrl = `${appUrl}/join?token=${invToken}`;
            const inviter   = await User.findOne({ email: userEmail });
            const inviterName = inviter?.firstname || inviter?.name || userEmail;
            try {
                const transport = _getMailTransport();
                await transport.sendMail({
                    from: `"Pintalk" <${process.env.SMTP_USER}>`,
                    to: email,
                    subject: `${inviterName} vous invite sur Pintalk`,
                    html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px;border:2px solid #18181b;">
                        <h2 style="font-weight:900;text-transform:uppercase;">Invitation Pintalk</h2>
                        <p><strong>${inviterName}</strong> vous invite à rejoindre le groupe <strong>"${group.name}"</strong>.</p>
                        <p style="margin:20px 0;"><a href="${inviteUrl}" style="background:#18181b;color:#fff;padding:12px 24px;text-decoration:none;font-weight:900;text-transform:uppercase;display:inline-block;">Rejoindre →</a></p>
                        <p style="font-size:11px;opacity:0.5;">Lien valable 48h.</p>
                    </div>`,
                });
                console.log(`[INVITE AUTO] Email envoyé à ${email}`);
            } catch(mailErr) { console.error('[INVITE AUTO] Erreur email:', mailErr.message); }
            return res.status(202).json({ invited: true, email, inviteUrl });
        }

        const existing = await Permission.findOne({ groupId, guestEmail: email });
        if (existing) return res.status(409).send("Déjà membre de ce groupe.");

        let finalType, finalRoleLegacy;
        if (group.type === 'pro') {
            const requestedType = reqType || role;
            if (requestedType === 'employe' || requestedType === 'admin') {
                finalType = 'employe'; finalRoleLegacy = 'employe';
            } else {
                finalType = 'client'; finalRoleLegacy = 'client';
            }
        } else {
            finalType = 'membre'; finalRoleLegacy = 'client';
        }

        const perm = new Permission({ groupId, guestEmail: email, type: finalType, role: finalRoleLegacy });
        await perm.save();

        // Groupes perso → sync allowedEmails sur tous les postits
        if (group.type === 'perso') {
            try {
                const devices = await Device.find({ groupId });
                const deviceIds = devices.map(d => d._id.toString());
                await Postit.updateMany(
                    { deviceId: { $in: deviceIds }, allowedEmails: { $ne: email } },
                    { $push: { allowedEmails: email } }
                );
            } catch(e) { console.warn('Erreur sync allowedEmails:', e.message); }
        }

        console.log(`[INVITE] ${email} → ${group.name} (${group.type}) en tant que ${finalType}`);
        res.json({ email, type: finalType, role: finalRoleLegacy });
    } catch (err) {
        console.error("Erreur ajout membre:", err);
        res.status(500).send("Erreur serveur");
    }
});

// PUT modifier type/rôles d'un membre (owner only)
router.put('/:email', authenticateToken, async (req, res) => {
    try {
        const { id: groupId, email } = req.params;
        const { role, type: newType, roles: newRoles } = req.body;
        const userEmail = req.user.email;
        const group = await Group.findById(groupId);
        if (!group) return res.status(404).send("Groupe introuvable.");
        if (group.ownerEmail !== userEmail) return res.status(403).send("Seul le propriétaire peut modifier les rôles.");
        const perm = await Permission.findOne({ groupId, guestEmail: email });
        if (!perm) return res.status(404).send("Membre introuvable.");
        if (newType) {
            const validTypes = ['employe', 'client', 'membre', 'membre-pintalk'];
            if (!validTypes.includes(newType)) return res.status(400).send("Type invalide.");
            perm.type = newType;
            perm.role = (newType === 'employe') ? 'employe' : 'client';
        } else if (role) {
            const validRoles = ['admin', 'employe', 'client'];
            if (!validRoles.includes(role)) return res.status(400).send("Rôle invalide.");
            perm.role = role;
            if (role === 'employe' || role === 'admin') perm.type = 'employe';
            else perm.type = group.type === 'perso' ? 'membre' : 'client';
        }
        if (group.type === 'pro' && Array.isArray(newRoles)) {
            const validRoleIds = (await Role.find({ groupId, _id: { $in: newRoles } })).map(r => r._id);
            perm.roles = validRoleIds;
        }
        await perm.save();
        res.json({ email, type: perm.type, role: perm.role, roles: perm.roles });
    } catch (err) { res.status(500).send("Erreur serveur"); }
});

// DELETE retirer un membre
router.delete('/:email', authenticateToken, async (req, res) => {
    try {
        const { id: groupId, email } = req.params;
        const userEmail = req.user.email;
        const group = await Group.findById(groupId);
        if (!group) return res.status(404).send("Groupe introuvable.");
        const { type: myRole, droits, isOwner } = await _getUserRoleInGroup(userEmail, group);
        if (!isOwner && !(myRole === 'employe' && droits.includes('gerer_membres')))
            return res.status(403).send("Accès refusé.");
        if (!isOwner) {
            const targetPerm = await Permission.findOne({ groupId, guestEmail: email });
            if (targetPerm && (targetPerm.type === 'employe' || targetPerm.role === 'admin'))
                return res.status(403).send("Seul le propriétaire peut retirer un employé.");
        }
        await Permission.deleteOne({ groupId, guestEmail: email });
        console.log(`[REMOVE MEMBER] ${email} retiré du groupe ${groupId}`);
        res.sendStatus(200);
    } catch (err) { res.status(500).send("Erreur serveur"); }
});

// ── Rôles pro ─────────────────────────────────────────────────────────────────

// GET liste des rôles
router.get('/roles', authenticateToken, async (req, res) => {
    try {
        const { id: groupId } = req.params;
        const userEmail = req.user.email;
        const group = await Group.findById(groupId);
        if (!group) return res.status(404).send("Groupe introuvable.");
        if (group.type !== 'pro') return res.status(400).send("Les rôles ne s'appliquent qu'aux groupes pro.");
        const { type: myRole, droits, isOwner } = await _getUserRoleInGroup(userEmail, group);
        if (!isOwner && !(myRole === 'employe' && droits.includes('gerer_membres')))
            return res.status(403).send("Accès refusé.");
        res.json(await Role.find({ groupId }));
    } catch(err) { console.error("Erreur GET roles:", err); res.status(500).send("Erreur serveur"); }
});

// POST créer un rôle
router.post('/roles', authenticateToken, async (req, res) => {
    try {
        const { id: groupId } = req.params;
        const userEmail = req.user.email;
        const { name, droits, isDefault } = req.body;
        if (!name || !name.trim()) return res.status(400).send("Nom du rôle requis.");
        const group = await Group.findById(groupId);
        if (!group) return res.status(404).send("Groupe introuvable.");
        if (group.type !== 'pro') return res.status(400).send("Les rôles ne s'appliquent qu'aux groupes pro.");
        if (group.ownerEmail !== userEmail) return res.status(403).send("Seul le propriétaire peut créer des rôles.");
        const sanitizedDroits = (droits || []).filter(d => ALL_DROITS.includes(d));
        const role = new Role({ groupId, name: name.trim(), droits: sanitizedDroits, isDefault: !!isDefault });
        await role.save();
        console.log(`[ROLES] Rôle "${role.name}" créé pour groupe ${group.name}`);
        res.status(201).json(role);
    } catch(err) { console.error("Erreur POST role:", err); res.status(500).send("Erreur serveur"); }
});

// PUT modifier un rôle
router.put('/roles/:roleId', authenticateToken, async (req, res) => {
    try {
        const { id: groupId, roleId } = req.params;
        const userEmail = req.user.email;
        const { name, droits, isDefault } = req.body;
        const group = await Group.findById(groupId);
        if (!group) return res.status(404).send("Groupe introuvable.");
        if (group.ownerEmail !== userEmail) return res.status(403).send("Seul le propriétaire peut modifier les rôles.");
        const role = await Role.findOne({ _id: roleId, groupId });
        if (!role) return res.status(404).send("Rôle introuvable.");
        if (name && name.trim()) role.name = name.trim();
        if (Array.isArray(droits)) role.droits = droits.filter(d => ALL_DROITS.includes(d));
        if (isDefault !== undefined) role.isDefault = !!isDefault;
        await role.save();
        res.json(role);
    } catch(err) { console.error("Erreur PUT role:", err); res.status(500).send("Erreur serveur"); }
});

// DELETE supprimer un rôle
router.delete('/roles/:roleId', authenticateToken, async (req, res) => {
    try {
        const { id: groupId, roleId } = req.params;
        const userEmail = req.user.email;
        const group = await Group.findById(groupId);
        if (!group) return res.status(404).send("Groupe introuvable.");
        if (group.ownerEmail !== userEmail) return res.status(403).send("Seul le propriétaire peut supprimer des rôles.");
        await Role.deleteOne({ _id: roleId, groupId });
        await Permission.updateMany({ groupId }, { $pull: { roles: roleId } });
        console.log(`[ROLES] Rôle ${roleId} supprimé du groupe ${groupId}`);
        res.json({ ok: true });
    } catch(err) { console.error("Erreur DELETE role:", err); res.status(500).send("Erreur serveur"); }
});

module.exports = router;
