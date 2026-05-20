// routes/auth.js
const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { User } = require('../models');

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(401).json({ message: "Email ou mot de passe incorrect" });

        let validPwd = false;
        if (user.password.startsWith('$2')) {
            validPwd = await bcrypt.compare(password, user.password);
        } else {
            validPwd = (user.password === password);
            if (validPwd) {
                user.password = await bcrypt.hash(password, 12);
                await user.save();
                console.log(`[SECURITY] Mot de passe migré bcrypt pour ${user.email}`);
            }
        }
        if (!validPwd) return res.status(401).json({ message: "Email ou mot de passe incorrect" });

        const token = jwt.sign(
            { _id: user._id, id: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        res.json({
            token,
            user: { _id: user._id, id: user._id, email: user.email, name: user.name,
                    firstname: user.firstname || '', lastname: user.lastname || '',
                    phone: user.phone || '', lang: user.lang || 'fr' }
        });
    } catch(err) {
        console.error("Erreur login:", err);
        res.status(500).json({ message: "Erreur serveur lors de la connexion" });
    }
});

router.post('/register', async (req, res) => {
    try {
        const { name, firstname, lastname, email, password, phone, lang } = req.body;
        const userExists = await User.findOne({ email });
        if (userExists) return res.status(400).json({ message: "Cet email est déjà utilisé" });

        const hashedPwd = await bcrypt.hash(password, 12);
        const newUser = new User({
            name:      name || email.split('@')[0],
            firstname: firstname || '',
            lastname:  lastname  || '',
            email, password: hashedPwd,
            phone: phone || '',
            lang:  lang  || 'fr',
        });
        await newUser.save();

        const token = jwt.sign(
            { _id: newUser._id, id: newUser._id, email: newUser.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        console.log(`[REGISTER] Nouvel utilisateur : ${newUser.email}`);
        res.status(201).json({
            token,
            user: { _id: newUser._id, name: newUser.name, firstname: newUser.firstname,
                    lastname: newUser.lastname, email: newUser.email,
                    phone: newUser.phone, lang: newUser.lang }
        });
    } catch(err) {
        console.error("Erreur inscription:", err);
        res.status(500).json({ message: "Erreur serveur lors de la création" });
    }
});

module.exports = router;
