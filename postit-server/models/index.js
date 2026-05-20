// models/index.js — Point d'entrée unique pour tous les modèles Mongoose
const mongoose = require('mongoose');

// ── User ──────────────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
    email:     { type: String, required: true, unique: true },
    password:  { type: String, required: true },
    name:      { type: String },
    firstname: { type: String, default: '' },
    lastname:  { type: String, default: '' },
    phone:     { type: String, default: '' },
    lang:          { type: String, default: 'fr' },
    phoneVerified: { type: Boolean, default: false },
    prefs: {
        type: Object,
        default: () => ({
            tilePrefs:   {},  // { [groupId]:   { color, textColor, shape } }
            pintalkPrefs:{},  // { [postitId]:  { color, textColor, shape } }
            groupsOrder: [],  // [id, id, ...]
        })
    },
});
const User = mongoose.model('User', userSchema);

// ── Group ─────────────────────────────────────────────────────────────────────
const groupSchema = new mongoose.Schema({
    name:       { type: String, required: true },
    ownerEmail: { type: String, required: true },
    joinCode:   { type: String, unique: true },
    type:       { type: String, enum: ['perso', 'pro'], default: 'perso' },
    isPro:      { type: Boolean, default: false },
    siret:      String,
    phonePro:   String,
    emailPro:   String,
    company:    String,
    addr1:      String,
    addr2:      String,
    cp:         String,
    ville:      String,
    stripeSubscriptionId: String,
    subscriptionStatus:   { type: String, default: 'inactive' },
    isDefault:  { type: Boolean, default: false },
    logoUrl:    String,
    tileColor:      { type: String, default: '' },
    tileTextColor:  { type: String, default: '' },
    tileShape:      { type: String, default: 'rect' },
    tileFontFamily: { type: String, default: '' },
    tileFontSize:   { type: String, default: '' },
});
const Group = mongoose.model('Group', groupSchema);

// ── Role (groupes pro uniquement) ─────────────────────────────────────────────
// droits possibles : 'creer_commande', 'ajouter_client', 'modifier_produit_coche',
//                    'ticket_caisse', 'gerer_membres', 'voir_brouillons'
const roleSchema = new mongoose.Schema({
    groupId:   { type: String, required: true, index: true },
    name:      { type: String, required: true },
    droits:    { type: [String], default: [] },
    isDefault: { type: Boolean, default: false },
});
const Role = mongoose.model('Role', roleSchema);

// ── Permission ────────────────────────────────────────────────────────────────
// type : 'owner' | 'employe' | 'client' | 'membre' | 'membre-pintalk'
// roles : rôles pro dynamiques (ObjectId → Role)
// role  : legacy — conservé pour migration progressive
const permissionSchema = new mongoose.Schema({
    groupId:    { type: String, required: true, index: true },
    guestEmail: { type: String, required: true, index: true },
    type: {
        type: String,
        enum: ['owner', 'employe', 'client', 'membre', 'membre-pintalk'],
        default: 'client'
    },
    roles: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Role' }],
    role: { type: String, enum: ['admin', 'employe', 'client'], default: 'client' }
});
permissionSchema.index({ groupId: 1, guestEmail: 1 }, { unique: true });
const Permission = mongoose.model('Permission', permissionSchema);

// ── Device ────────────────────────────────────────────────────────────────────
const Device = mongoose.model('Device', {
    groupId:    String,
    name:       String,
    mac:        String,
    ownerEmail: String,
});

// ── Postit (= Pintalk) ────────────────────────────────────────────────────────
const Postit = mongoose.model('Postit', {
    deviceId:    String,
    ownerEmail:  String,
    name:        String,
    orderNumber: String,
    phone:       String,
    email:       String,
    pickupDate:  String,
    status:      { type: String, default: 'En attente' },
    isLocked:    { type: Boolean, default: false },
    imageUrl:    String,
    allowedEmails:  { type: [String], default: [] },
    tileColor:      { type: String, default: '' },
    tileTextColor:  { type: String, default: '' },
    tileShape:      { type: String, default: '' },
    tileLogoUrl:    { type: String, default: '' },
});

// ── Message ───────────────────────────────────────────────────────────────────
const Message = mongoose.model('Message', {
    groupId:         String,
    deviceId:        String,
    postitId:        String,
    content:         String,
    senderName:      String,
    isNote:          { type: Boolean, default: false },
    isUncertain:     { type: Boolean, default: false },
    sourceMessageId: { type: String,  default: '' },
    checked:         { type: Boolean, default: false },
    date:            { type: Date, default: Date.now },
    type:            { type: String, default: 'text' },
});

// ── Archive ───────────────────────────────────────────────────────────────────
const Archive = mongoose.model('Archive', {
    groupName:  String,
    deviceName: String,
    postitName: String,
    content:    Array,
    archivedAt: { type: Date, default: Date.now },
    adminId:    String,
});

// ── AiDictionaryEntry ─────────────────────────────────────────────────────────
const aiDictionaryEntrySchema = new mongoose.Schema({
    phrase:     { type: String, required: true, trim: true },
    normalized: { type: String, required: true, trim: true, index: true },
    lang:       { type: String, default: 'fr', trim: true, index: true },
    category:   { type: String, default: '', trim: true },
    active:     { type: Boolean, default: true, index: true },
    scope:      { type: String, enum: ['global', 'user'], default: 'user', index: true },
    ownerEmail: { type: String, default: '', trim: true, index: true },
    createdBy:  { type: String, default: '', trim: true },
}, { timestamps: true });
aiDictionaryEntrySchema.index({ normalized: 1, lang: 1, scope: 1, ownerEmail: 1 }, { unique: true });
const AiDictionaryEntry = mongoose.model('AiDictionaryEntry', aiDictionaryEntrySchema);

module.exports = { User, Group, Role, Permission, Device, Postit, Message, Archive, AiDictionaryEntry };
