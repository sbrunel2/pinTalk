// routes/users.js
const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const { authenticateToken } = require('../helpers/auth');
const { _getMailTransport, _phoneCodes } = require('../helpers/mail');
const { User, Group, Device, Postit, Message, Permission, Archive } = require('../models');

// GET profil
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user = await User.findOne({ email: req.user.email });
        if (!user) return res.status(404).send('Utilisateur introuvable');
        res.json({ email: user.email, name: user.name || '', firstname: user.firstname || '',
                   lastname: user.lastname || '', phone: user.phone || '', lang: user.lang || 'fr' });
    } catch(e) { res.status(500).send('Erreur serveur'); }
});

// PUT profil
router.put('/profile', authenticateToken, async (req, res) => {
    try {
        const { firstname, lastname, phone, lang } = req.body;
        const user = await User.findOne({ email: req.user.email });
        if (!user) return res.status(404).send('Utilisateur introuvable');
        if (firstname !== undefined) user.firstname = firstname;
        if (lastname  !== undefined) user.lastname  = lastname;
        if (phone     !== undefined) user.phone     = phone;
        if (lang      !== undefined) user.lang      = lang;
        await user.save();
        res.json({ ok: true, user: { email: user.email, firstname: user.firstname,
                                     lastname: user.lastname, phone: user.phone, lang: user.lang } });
    } catch(e) { res.status(500).send('Erreur serveur'); }
});

// PUT mot de passe
router.put('/password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) return res.status(400).send('Champs manquants');
        const user = await User.findOne({ email: req.user.email });
        if (!user) return res.status(404).send('Utilisateur introuvable');
        const valid = await bcrypt.compare(currentPassword, user.password);
        if (!valid) return res.status(403).send('Mot de passe actuel incorrect');
        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();
        res.json({ ok: true });
    } catch(e) { res.status(500).send('Erreur serveur'); }
});

// GET prefs
router.get('/prefs', authenticateToken, async (req, res) => {
    try {
        const user = await User.findOne({ email: req.user.email });
        if (!user) return res.status(404).send('Utilisateur introuvable');
        res.json(user.prefs || { tilePrefs:{}, pintalkPrefs:{}, groupsOrder:[] });
    } catch(e) { res.status(500).send('Erreur serveur'); }
});

// PUT prefs
router.put('/prefs', authenticateToken, async (req, res) => {
    try {
        const { tilePrefs, pintalkPrefs, groupsOrder } = req.body;
        const user = await User.findOne({ email: req.user.email });
        if (!user) return res.status(404).send('Utilisateur introuvable');
        const current = user.prefs || { tilePrefs:{}, pintalkPrefs:{}, groupsOrder:[] };
        if (tilePrefs    !== undefined) current.tilePrefs    = tilePrefs;
        if (pintalkPrefs !== undefined) current.pintalkPrefs = pintalkPrefs;
        if (groupsOrder  !== undefined) current.groupsOrder  = groupsOrder;
        user.prefs = current;
        user.markModified('prefs');
        await user.save();
        res.json({ ok: true });
    } catch(e) { console.error('prefs PUT:', e); res.status(500).send('Erreur serveur'); }
});

// POST send-phone-code (stub email fallback)
router.post('/send-phone-code', authenticateToken, async (req, res) => {
    try {
        const userEmail = req.user.email;
        const { phone } = req.body;
        if (!phone || phone.length < 8) return res.status(400).send('Numéro invalide.');
        const code    = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = Date.now() + 10 * 60 * 1000;
        _phoneCodes.set(userEmail, { code, phone, expires });
        try {
            const transport = _getMailTransport();
            await transport.sendMail({
                from: `"e-Postit Pro" <${process.env.SMTP_USER}>`,
                to: userEmail,
                subject: 'Code de vérification e-Postit Pro',
                html: `<div style="font-family:sans-serif;padding:24px;border:2px solid #18181b;max-width:400px;">
                    <h2 style="font-weight:900;">Code de vérification</h2>
                    <p>Votre code pour vérifier le numéro <strong>${phone}</strong> :</p>
                    <div style="font-size:32px;font-weight:900;letter-spacing:8px;margin:16px 0;">${code}</div>
                    <p style="font-size:11px;opacity:0.5;">Valable 10 minutes.</p>
                </div>`,
            });
        } catch(e) { console.warn('SMS email fallback failed:', e.message); }
        console.log(`[PHONE] Code ${code} pour ${userEmail} (tel: ${phone})`);
        res.json({ ok: true });
    } catch(err) { res.status(500).send('Erreur serveur.'); }
});

// POST verify-phone
router.post('/verify-phone', authenticateToken, async (req, res) => {
    try {
        const userEmail = req.user.email;
        const { code }  = req.body;
        const entry     = _phoneCodes.get(userEmail);
        if (!entry || Date.now() > entry.expires) return res.status(400).send('Code expiré.');
        if (entry.code !== code) return res.status(400).send('Code incorrect.');
        await User.findOneAndUpdate({ email: userEmail }, { phone: entry.phone, phoneVerified: true });
        _phoneCodes.delete(userEmail);
        console.log(`[PHONE] Vérifié pour ${userEmail} : ${entry.phone}`);
        res.json({ ok: true });
    } catch(err) { res.status(500).send('Erreur serveur.'); }
});

// DELETE account (cascade complète)
router.delete('/account', authenticateToken, async (req, res) => {
    try {
        const userEmail = req.user.email;
        console.log(`[DELETE ACCOUNT] Début suppression pour ${userEmail}`);
        const ownedGroups = await Group.find({ ownerEmail: userEmail });
        for (const group of ownedGroups) {
            if (group.isPro && group.subscriptionStatus === 'active' && group.stripeSubscriptionId) {
                console.log(`[DELETE ACCOUNT] Abonnement Stripe à annuler: ${group.stripeSubscriptionId}`);
            }
            const devices = await Device.find({ groupId: group._id });
            for (const device of devices) {
                await Postit.deleteMany({ deviceId: device._id });
                await Message.deleteMany({ deviceId: device._id });
            }
            await Device.deleteMany({ groupId: group._id });
            await Message.deleteMany({ groupId: group._id });
            await Permission.deleteMany({ groupId: group._id.toString() });
            await Archive.deleteMany({ adminId: userEmail });
        }
        await Group.deleteMany({ ownerEmail: userEmail });
        await Permission.deleteMany({ guestEmail: userEmail });
        const userPostits = await Postit.find({ ownerEmail: userEmail });
        for (const p of userPostits) await Message.deleteMany({ postitId: p._id.toString() });
        await Postit.deleteMany({ ownerEmail: userEmail });
        await User.deleteOne({ email: userEmail });
        console.log(`[DELETE ACCOUNT] Compte ${userEmail} supprimé.`);
        res.json({ ok: true });
    } catch(err) {
        console.error('[DELETE ACCOUNT] Erreur:', err);
        res.status(500).send('Erreur lors de la suppression du compte.');
    }
});

module.exports = router;
