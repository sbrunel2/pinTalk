# e-Postit Pro — Documentation Technique

> État du projet au moment de la rédaction de ce document.
> Destiné à une IA reprenant le projet en cours de développement.

---

## 1. Vue d'ensemble

**e-Postit Pro** est une application web mobile-first de gestion de commandes professionnelles basée sur un système de chat en temps réel. Les messages utilisateurs sont analysés automatiquement par IA pour en extraire les items de commande, qui sont affichés sur un simulateur d'écran e-ink (rendu "étiquette de commande").

Déployée sur **Oracle Cloud**. Accessible uniquement via navigateur mobile (pas d'app native).

---

## 2. Stack technique

### Backend
| Composant | Technologie |
|---|---|
| Runtime | Node.js |
| Framework HTTP | Express.js |
| Temps réel | Socket.io |
| Base de données | MongoDB Atlas (via Mongoose) |
| Auth | JWT (jsonwebtoken) + bcrypt |
| Upload fichiers | Multer + Cloudinary (multer-storage-cloudinary) |
| Sécurité | helmet, express-rate-limit |
| IA extraction | Appel API externe (Claude/Anthropic) via `/api/ai/extract-multi` |

### Frontend
| Composant | Technologie |
|---|---|
| Structure | HTML/CSS/JS vanilla (pas de framework) |
| Styles | Tailwind CSS (CDN) + style.css custom |
| Temps réel | Socket.io client |
| i18n | Système maison (`i18n.js`) |
| Audio | Web Speech API (transcription navigateur) |

### Fichiers source
```
server.js         — Backend complet (~2 600 lignes)
app.js            — Logique frontend principale (~4 800 lignes)
index.html        — Structure HTML (~520 lignes)
style.css         — Styles custom (~420 lignes)
navigation.js     — Gestion des pages et swipe (~70 lignes)
archives.js       — Module archives (~130 lignes)
auth.js           — Formulaires connexion/inscription (~270 lignes)
i18n.js           — Traductions (~370 lignes)
```

---

## 3. Architecture de données (Mongoose)

### User
```js
{ email, password (bcrypt), name, firstname, lastname, phone, lang,
  phoneVerified, prefs: { tilePrefs, pintalkPrefs, groupsOrder } }
```

### Group
```js
{ name, ownerEmail, joinCode, type ('perso'|'pro'), isPro,
  siret, phonePro, emailPro, company, addr1, addr2, cp, ville,
  stripeSubscriptionId, subscriptionStatus ('inactive'|'active'|'past_due'),
  isDefault, logoUrl, tileColor, tileTextColor, tileShape, tileFontFamily, tileFontSize }
```

### Permission
```js
{ groupId, guestEmail, role ('admin'|'employe'|'client') }
```
Chaque ligne = lien entre un utilisateur et un groupe.

### Device
```js
{ groupId, name, mac, ownerEmail }
```
Représente un écran e-ink physique rattaché à un groupe.

### Postit (= "Pintalk")
```js
{ deviceId, ownerEmail, name, orderNumber, phone, email, pickupDate,
  status, isLocked, imageUrl, allowedEmails,
  tileColor, tileTextColor, tileShape, tileLogoUrl }
```
Représente une commande/conversation. `allowedEmails` vide = visible par tous les membres du groupe.

### Message
```js
{ groupId, deviceId, postitId, content, senderName,
  isNote (bool — masqué de l'e-ink si true),
  isUncertain (bool), sourceMessageId (lien vers message source),
  checked (bool), date, type ('text'|'image') }
```
Les messages IA ont `senderName === '✨ IA'`.

### Archive
```js
{ groupName, deviceName, postitName, content (Array [{author, text}]),
  archivedAt, adminId }
```

### AiDictionaryEntry
```js
{ phrase, normalized, lang, category, active, scope ('global'|'user'),
  ownerEmail, createdBy }
// Index unique : (normalized, lang, scope, ownerEmail)
```

---

## 4. API REST (routes backend)

### Auth
- `POST /api/login` — JWT en retour
- `POST /api/register` — Création compte + groupe perso par défaut
- `GET /api/user/me` — Profil courant
- `PUT /api/user/profile` — Mise à jour profil
- `PUT /api/user/password` — Changement mot de passe
- `DELETE /api/user/account` — Suppression compte

### Groupes
- `GET /api/groups` — Tous les groupes visibles
- `GET /api/groups/mine` — Groupes dont l'user est membre
- `GET /api/groups/:id/config` — Config complète d'un groupe
- `POST /api/groups` — Créer un groupe
- `PUT /api/groups/:id` — Modifier un groupe
- `DELETE /api/groups/:id` — Supprimer un groupe
- `DELETE /api/groups/:id/leave` — Quitter un groupe
- `GET /api/groups/:id/members` — Liste membres
- `POST /api/groups/:id/members` — Ajouter membre
- `PUT /api/groups/:id/members/:email` — Modifier rôle
- `DELETE /api/groups/:id/members/:email` — Retirer membre

### Devices & Postits
- `GET /api/devices?groupName=` — Devices d'un groupe (par nom)
- `GET /api/devices/:gid` — Devices d'un groupe (par id)
- `POST /api/devices` — Créer un device
- `PUT /api/devices/:id` — Modifier un device
- `DELETE /api/devices/:id` — Supprimer un device
- `GET /api/postits?deviceId=` — Postits d'un device
- `GET /api/postits/:did` — Postits d'un device (variante)
- `GET /api/postits/details/:id` — Détail d'un postit
- `POST /api/postits` — Créer un postit
- `PUT /api/postits/:id` — Modifier un postit
- `DELETE /api/postits/:id` — Supprimer un postit
- `POST /api/postits/:id/invite` — Inviter un utilisateur sur un postit
- `DELETE /api/postits/:id/invite/:email` — Retirer invitation
- `GET /api/postits/:id/invites` — Liste des invités

### Messages
- `PATCH /api/messages/:id` — Modifier contenu d'un message
- `DELETE /api/messages/:id` — Supprimer un message (+ Cloudinary si image)

### IA
- `POST /api/ai/extract-multi` — Extraction items depuis texte (endpoint principal)
- `POST /api/ai/extract` — Endpoint alternatif (legacy)
- `GET /api/ai-dictionary` — Dictionnaire IA de l'user
- `POST /api/ai-dictionary` — Ajouter entrée dictionnaire
- `PATCH /api/ai-dictionary/:id` — Modifier entrée
- `DELETE /api/ai-dictionary/:id` — Supprimer entrée

### Divers
- `POST /api/upload` — Upload fichier → Cloudinary
- `POST /api/invite` — Envoyer invitation email
- `GET /api/join` / `POST /api/join` — Rejoindre via token d'invitation
- `POST /api/groups/join` — Rejoindre via code
- `POST /api/archives/backup` — Archiver un postit
- `GET /api/archives` — Consulter archives
- `GET/PUT /api/user/prefs` — Préférences utilisateur (tilePrefs, pintalkPrefs, groupsOrder)
- `POST /api/send-phone-code` / `POST /api/verify-phone` — Vérification téléphone

---

## 5. Événements Socket.io

| Événement | Direction | Description |
|---|---|---|
| `get-history` | client → serveur | Charger l'historique d'un postit |
| `history-data` | serveur → client | Retour historique (tableau de messages) |
| `send-message` | client → serveur | Envoyer un message |
| `new-message` | serveur → **tous** | Broadcast d'un nouveau message (`io.emit`) |
| `toggle-message-note` | client → serveur | Basculer isNote d'un message |
| `message-updated` | serveur → tous | Notification changement isNote |
| `toggle-check-line` | client → serveur | Cocher/décocher une ligne |
| `update-postit-status` | client → serveur | Changer le statut d'un postit |

⚠️ **Point critique** : `new-message` est un `io.emit` (broadcast global). Tous les clients connectés reçoivent tous les messages. Le filtrage par `postitId` est fait côté client dans `refreshView()`.

---

## 6. Navigation frontend (5 pages)

```
PAGE_ARCHIVES  = 0   — Consultation archives
PAGE_PARAMS    = 1   — Paramètres compte
PAGE_GROUPES   = 2   — Grille des groupes (page de démarrage)
PAGE_CHAT      = 3   — Chat + simulateur e-ink
PAGE_PREP      = 4   — Vue préparation (hors navigation swipe)
```

Navigation par swipe horizontal (threshold 60px) gérée dans `navigation.js`. La page PREP n'est pas accessible par swipe. La fonction `goToPage(index)` gère l'affichage/masquage de la barre de messages, header fixe, et les callbacks de chargement par page.

---

## 7. Hiérarchie des entités

```
Groupe (Group)
  └── Device (écran e-ink physique)
        └── Postit / Pintalk (commande = fil de chat)
              └── Message (senderName, content, isNote, type)
```

Un **groupe** peut être `perso` (max 5 postits) ou `pro` (illimité, champs entreprise + Stripe). Chaque groupe a des **membres** avec rôle (`admin` / `employe` / `client`). Chaque postit peut avoir des `allowedEmails` pour restreindre la visibilité.

---

## 8. Logique IA (extraction automatique)

### Flux principal
1. L'utilisateur envoie un message via `send()` → `_sendTextMessage(text)`
2. Le serveur broadcaste `new-message`
3. Le handler `socket.on('new-message')` vérifie `alreadyHasAi` (présence d'un message `✨ IA` lié à ce message source dans `allMsgs`)
4. Si absent → appelle `aiAutoExtract(text, postitId, messageId)` après 120ms
5. `aiAutoExtract` POST vers `/api/ai/extract-multi`
6. Le serveur répond avec `{ items: [{text, uncertain}] }`
7. Les items sont sauvegardés comme messages `senderName='✨ IA'` avec `sourceMessageId` lié
8. Ces messages `✨ IA` sont affichés dans le simulateur e-ink via `refreshView()`

### Helpers de parsing (côté client)
- `_normalizeAiInputText(text)` — Normalisation avant envoi
- `_extractQuotedItems(text)` — Extraction items entre guillemets (bypass IA serveur)
- `_isNegativeConfirmationMessage(text)` — Détection confirmation négative
- `_isQuestionLikeMessage(text)` — Détection question (pas d'extraction)
- `_isNegatedItemInText(text, item)` — Détection négation d'un item
- `_compileProtectedPhraseRegex(phrase)` — Regex pour le dictionnaire protégé
- `_deleteAiNotesForMessage(sourceMessageId, postitId)` — Supprime les notes IA liées à un message source

### Dictionnaire IA
Entrées en base (`AiDictionaryEntry`) par langue et scope (global/user). Utilisées pour enrichir/corriger l'extraction.

---

## 9. Fonctionnalités implémentées

### Authentification & Profil
- Connexion / Inscription avec i18n (fr, en, es, de, it)
- Vérification téléphone par code SMS
- Modification profil, mot de passe, suppression compte
- Préférences utilisateur persistées (MongoDB + localStorage)

### Groupes
- Création groupe perso ou pro (avec champs SIRET, adresse, etc.)
- Code d'invitation par lien
- Gestion membres avec rôles (admin / employé / client)
- Personnalisation visuelle des tuiles (couleur, forme, police, logo)
- Réorganisation par drag & pinch sur la grille

### Postits / Pintalk
- Création, édition, suppression
- Statuts de commande (configurable)
- Restriction d'accès par `allowedEmails`
- Invitation nominative sur un postit
- Filtre par statut et date
- Personnalisation visuelle (couleur, forme, logo)

### Chat
- Messages texte et images (upload Cloudinary)
- Enregistrement vocal (Web Speech API → transcription → texte)
- Swipe-to-reveal sur les bulles (actions : masquer/e-ink, supprimer, éditer)
- `isNote` : masque un message du rendu e-ink (grisé dans le chat)
- Édition inline des messages
- Cocher/décocher les lignes de commande

### Simulateur e-ink
- Rendu en temps réel des messages non-masqués (isNote=false)
- Exclut les messages `✨ IA` et les images
- Affiché dans le header du chat et dans la vue Préparation

### IA
- Extraction automatique d'items depuis chaque message entrant
- Bypass IA si contenu entre guillemets (verbatim)
- Suppression/recréation des notes IA à chaque édition de message
- Dictionnaire utilisateur (CRUD) pour termes protégés

### Archives
- Sauvegarde manuelle d'un historique de chat
- Consultation par groupe / device / postit

### Paramètres
- Thèmes (skins 0/1/2 + couleurs custom + image de fond)
- Langue UI (5 langues)
- Dictionnaire IA personnel
- Changement mot de passe
- Suppression compte
- **Case à cocher debug** : affichage des bulles `✨ IA` dans le chat (masquées par défaut)

---

## 10. Bug en cours non résolu

### Double extraction IA
**Symptôme** : `[EXTRACT-MULTI]` apparaît deux fois dans les logs serveur pour un même message, produisant des doublons dans le rendu e-ink.

**Ce qui a été vérifié** :
- Les appels à `aiAutoExtract` dans `app.js` sont identiques à l'original (diff confirmé)
- La protection `alreadyHasAi` existe dans le handler `socket.on('new-message')`
- `initApp()` n'est appelé qu'une fois (flux `auth.js` → `handleAuth()`)
- `io.emit('new-message')` est un broadcast global — tous les clients reçoivent le message

**Hypothèse non vérifiée** : Si deux onglets/instances du client sont ouverts simultanément sur le même compte, chacun reçoit le `new-message` et déclenche son propre `aiAutoExtract`. Les deux requêtes arrivent au serveur avec le même texte.

**Piste** : Ajouter un verrou global côté serveur sur `(sourceMessageId, postitId)` dans `/api/ai/extract-multi` — si une extraction est déjà en cours ou terminée pour ce `sourceMessageId`, refuser la seconde requête.

---

## 11. Points non implémentés (prévus)

- **Stripe** : schéma en place (`stripeSubscriptionId`, `subscriptionStatus`), aucune intégration active. Commentaire `TODO` pour l'annulation d'abonnement à la suppression de compte.
- **Limite 5 postits** pour les groupes `perso` : champ `type` en base, non enforced côté API.
- **Notifications push** : aucune implémentation.
- **Mode multi-écrans** : un seul device actif à la fois par session.

---

## 12. Points d'attention pour la reprise

1. **`refreshView` est définie deux fois** dans `app.js` (lignes ~3139 et ~3457). La seconde est dans un bloc `/* ... */` commenté. Seule la première est active. Toute modification du rendu doit cibler la première définition.

2. **`io.emit` vs `socket.emit`** : le broadcast `new-message` va à tous les clients. Aucun filtrage par groupe/postit n'est fait côté serveur. Le filtrage est entièrement client-side dans `refreshView()`.

3. **CSS global `input`** : la règle `input:not([type=checkbox]):not([type=radio]), select, textarea` exclut les checkboxes du reset global (modifié pour corriger un bug d'affichage). Ne pas revenir à `input, select, textarea` sans cette exclusion.

4. **Deux `refreshView` dans `app.js`** : la seconde (commentée) semble être une ancienne version conservée pour référence. Ne pas décommenter sans vérifier les conflits.

5. **`allMsgs`** : tableau global côté client, alimenté par `history-data` et mis à jour à chaque `new-message`. Tout le rendu chat + e-ink en dépend. La mutation directe (push/splice) sans `refreshView()` ne met pas à jour l'UI.
