// helpers/permissions.js
// Résolution du rôle effectif d'un utilisateur dans un groupe.
// Retourne { type, droits[], isOwner, perm }
//
// type   : 'owner' | 'employe' | 'client' | 'membre' | 'membre-pintalk' | null
// droits : union des droits de tous les rôles pro de l'employé (groupes pro seulement)
//          droits possibles : 'creer_commande', 'ajouter_client', 'modifier_produit_coche',
//                             'ticket_caisse', 'gerer_membres', 'voir_brouillons'

const { Permission, Role } = require('../models');

const ALL_DROITS = [
    'creer_commande', 'ajouter_client', 'modifier_produit_coche',
    'ticket_caisse', 'gerer_membres', 'voir_brouillons'
];

async function _getUserRoleInGroup(userEmail, group) {
    if (!group) return { type: null, droits: [], isOwner: false, perm: null };

    if (group.ownerEmail === userEmail) {
        return { type: 'owner', droits: ALL_DROITS, isOwner: true, perm: null };
    }

    const perm = await Permission.findOne({
        groupId: group._id.toString(),
        guestEmail: userEmail
    });
    if (!perm) return { type: null, droits: [], isOwner: false, perm: null };

    // Résoudre le type effectif — préférer le nouveau champ type, fallback legacy
    let effectiveType = perm.type || null;
    if (!effectiveType || effectiveType === 'client') {
        if (perm.role === 'admin' || perm.role === 'employe') effectiveType = 'employe';
        else effectiveType = 'client';
        if (group.type === 'perso' && effectiveType === 'client') effectiveType = 'membre';
    }

    // Droits effectifs cumulés (groupes pro, employés uniquement)
    let droits = [];
    if (group.type === 'pro' && effectiveType === 'employe') {
        if (perm.role === 'admin') {
            // Rétrocompatibilité : ancien admin → tous les droits
            droits = [...ALL_DROITS];
        } else if (perm.roles && perm.roles.length > 0) {
            try {
                const rolesDocs = await Role.find({ _id: { $in: perm.roles } });
                const droitsSet = new Set();
                for (const r of rolesDocs) {
                    for (const d of (r.droits || [])) droitsSet.add(d);
                }
                droits = [...droitsSet];
            } catch(e) {
                console.warn('[ROLES] Erreur résolution droits:', e.message);
            }
        }
    }

    return { type: effectiveType, droits, isOwner: false, perm };
}

module.exports = { _getUserRoleInGroup, ALL_DROITS };
