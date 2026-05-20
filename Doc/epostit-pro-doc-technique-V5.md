# e-Postit Pro / Pintalk — Documentation Technique V5

> État du projet au 17 mai 2026.
> Destiné à une IA reprenant le projet en cours de développement.
> **Version** : V5 — remplace la V4 et la V3 intégralement.

---

## 1. Vue d'ensemble

**e-Postit Pro** (nom commercial : **Pintalk**) est une application web mobile-first de gestion de commandes professionnelles basée sur un système de chat en temps réel. Les messages sont analysés automatiquement par IA (Gemini 2.0 Flash) pour en extraire les items de commande, affichés sur un simulateur d'écran e-ink (rendu "étiquette de commande").

Déployée sur **Oracle Cloud** (testable en local Node.js sous Windows/PowerShell). Accessible via navigateur mobile — **pas encore d'app native**, architecture PWA/Capacitor envisagée comme prochaine étape.

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
| Emails | nodemailer (SMTP Gmail) |
| IA extraction | API Gemini 2.0 Flash + fallback maison |

### Frontend
| Composant | Technologie |
|---|---|
| Structure | HTML/CSS/JS vanilla (pas de framework) |
| Styles | Tailwind CSS (CDN) + style.css custom |
| Temps réel | Socket.io client |
| i18n | Système maison (`i18n.js`) — 5 langues (fr, en, es, de, it) |
| Audio | Web Speech API (transcription navigateur) |

---

## 3. Architecture des fichiers (V5 — refactorisée depuis V3)

La V5 est une **refactorisation complète** des monolithes V3 (`server.js` 2 655 L, `app.js` 5 081 L) en modules distincts.

### Backend
```
server.js                  — Orchestrateur : imports, middlewares, branchement routes (~220 L)
models/
  index.js                 — Tous les schémas Mongoose (~145 L)
helpers/
  auth.js                  — authenticateToken, generateJoinCode (~23 L)
  permissions.js           — _getUserRoleInGroup() (~61 L)
  mail.js                  — _getMailTransport, _phoneCodes, _inviteCodes (~38 L)
  ai.js                    — Cache dictionnaire, NLP, splitByArticles, fallbackExtract (~270 L)
routes/
  auth.js                  — POST /api/login, POST /api/register (~79 L)
  users.js                 — Profil, prefs, password, phone, DELETE account (~154 L)
  groups.js                — CRUD groupes, /mine, /config, /join, /leave (~198 L)
  members.js               — Membres + rôles pro (GET/POST/PUT/DELETE) (~248 L)
  resources.js             — Devices, Postits, Messages, Archives (~360 L)
  ai.js                    — /api/ai/extract-multi, /api/ai/extract, dictionnaire CRUD (~302 L)
socket/
  index.js                 — Tous les handlers Socket.io (~105 L)
```

### Frontend
```
public/
  index.html               — Structure HTML (~560 L)
  style.css                — Styles custom (~420 L)
  js/
    i18n.js                — Traductions (~370 L)
    auth.js                — Formulaires connexion/inscription (~270 L)
    navigation.js          — Pages et swipe-navigation (~80 L)
    archives.js            — Module archives (~130 L)
    modules/
      app-core.js          — Globals, fetchAuth, initApp, skins, header (~520 L)
      ui.js                — Swipe-to-reveal, menu sélection, editMessage (~420 L)
      params.js            — Profil, password, skins, dictionnaire IA, téléphone (~345 L)
      groups.js            — loadGroupsList, selectGroup, drag/pinch, CRUD groupes (~1 115 L)
      postits.js           — renderPostitTabs, selectPostit, CRUD pintalk (~960 L)
      chat.js              — refreshView, send, toggleNote, deleteMessage (~610 L)
      media.js             — Upload images, enregistrement vocal (~228 L)
      ai.js                — aiAutoExtract, normalisation côté client (~418 L)
```

### Ordre de chargement des scripts (index.html)
```html
<script src="js/i18n.js"></script>
<script src="js/auth.js"></script>
<script src="js/navigation.js"></script>
<script src="js/modules/app-core.js"></script>
<script src="js/modules/ui.js"></script>
<script src="js/modules/params.js"></script>
<script src="js/modules/groups.js"></script>
<script src="js/modules/postits.js"></script>
<script src="js/modules/chat.js"></script>
<script src="js/modules/media.js"></script>
<script src="js/modules/ai.js"></script>
<script src="js/archives.js"></script>
```

---

## 4. Architecture de données (Mongoose — models/index.js)

### User
```js
{ email, password (bcrypt), name, firstname, lastname, phone, lang,
  phoneVerified, prefs: { tilePrefs, pintalkPrefs, groupsOrder } }
```

### Group
```js
{ name, ownerEmail, joinCode, type ('perso'|'pro'), isPro,
  siret, phonePro, emailPro, company, addr1, addr2, cp, ville,
  stripeSubscriptionId, subscriptionStatus, isDefault,
  logoUrl, tileColor, tileTextColor, tileShape, tileFontFamily, tileFontSize }
```

### Role *(nouveau V5)*
```js
{ groupId, name, droits: [String], isDefault: Boolean }
// droits possibles : 'creer_commande', 'ajouter_client', 'modifier_produit_coche',
//                    'ticket_caisse', 'gerer_membres', 'voir_brouillons'
// Uniquement pour groupes pro. Index : groupId.
```

### Permission *(migré V5)*
```js
{ groupId, guestEmail,
  type: ('owner'|'employe'|'client'|'membre'|'membre-pintalk'),  // nouveau
  roles: [ObjectId → Role],   // rôles pro dynamiques
  role: ('admin'|'employe'|'client')  // legacy — conservé pour migration progressive
}
// Index unique : (groupId, guestEmail)
```

### Device
```js
{ groupId, name, mac, ownerEmail }
```

### Postit (= "Pintalk")
```js
{ deviceId, ownerEmail, name, orderNumber, phone, email, pickupDate,
  status, isLocked, imageUrl, allowedEmails,
  tileColor, tileTextColor, tileShape, tileLogoUrl }
// Statuts perso : 'En attente', 'Terminé', 'Annulé', 'En caisse', 'Récupéré'
// Statuts pro   : 'brouillon', 'validée', 'en cours de préparation', 'prête',
//                 'ticket de caisse', 'terminée', 'annulée'
// allowedEmails vide = visible par tous les membres du groupe (perso)
```

### Message
```js
{ groupId, deviceId, postitId, content, senderName,
  isNote (bool), isUncertain (bool), sourceMessageId,
  checked (bool), date, type ('text'|'image') }
// Les messages IA ont senderName === '✨ IA'
// sourceMessageId : lie une note IA au message user qui l'a générée
```

### Archive
```js
{ groupName, deviceName, postitName, content: [{author, text}], archivedAt, adminId }
```

### AiDictionaryEntry
```js
{ phrase, normalized, lang, category, active, scope ('global'|'user'),
  ownerEmail, createdBy }
// Index unique : (normalized, lang, scope, ownerEmail)
```

---

## 5. Helper central — `_getUserRoleInGroup(userEmail, group)`

Défini dans `helpers/permissions.js`. Centralise toute la logique de résolution de rôle.

**Retourne** `{ type, droits[], isOwner, perm }` :
- `type` : `'owner'` | `'employe'` | `'client'` | `'membre'` | `'membre-pintalk'` | `null`
- `droits` : union des droits de tous les rôles pro de l'employé
- `isOwner` : raccourci boolean

**Règles** :
- Owner → tous les droits automatiquement
- Rétrocompatibilité : ancien `role: 'admin'` → `type: 'employe'` + tous droits
- Droits cumulatifs (union additive)
- Groupes perso : `client` → `membre` automatiquement

---

## 6. API REST

### Auth
- `POST /api/login` — JWT en retour
- `POST /api/register` — Création compte
- `GET /api/user/me` / `PUT /api/user/profile` / `PUT /api/user/password` / `DELETE /api/user/account`
- `GET /api/user/prefs` / `PUT /api/user/prefs`
- `POST /api/user/send-phone-code` / `POST /api/user/verify-phone`

### Groupes
- `GET /api/groups` — groupes dont je suis owner
- `GET /api/groups/mine` — tous les groupes accessibles → expose `myRole`, `myDroits`
- `GET /api/groups/:id/config` → expose `myRole`, `myDroits`, `maxPostits`, `joinCode`
- `POST /api/groups` / `PUT /api/groups/:id` / `DELETE /api/groups/:id` (owner, cascade complète)
- `POST /api/groups/join` (via joinCode) / `DELETE /api/groups/:id/leave`
- `POST /api/invite` / `GET|POST /api/join`

### Membres & Rôles pro
- `GET /api/groups/:id/members` — expose `type`, `roles` peuplés
- `POST /api/groups/:id/members` — `type: 'employe'|'client'` ; invitation email auto si user inconnu
- `PUT /api/groups/:id/members/:email` / `DELETE /api/groups/:id/members/:email`
- `GET /api/groups/:id/roles` / `POST /api/groups/:id/roles`
- `PUT /api/groups/:id/roles/:roleId` / `DELETE /api/groups/:id/roles/:roleId`

### Devices & Postits
- `GET /api/devices?groupId=` / `POST /api/devices` / `DELETE /api/devices/:id`
- `GET /api/postits?deviceId=&filterDate=` — filtré par rôle (brouillon masqué sans droit)
- `GET /api/postits/details/:id` — détails complets
- `POST /api/postits` — enforce owner-only perso, limite 4, droits pro vérifiés
- `PUT /api/postits/:id` / `DELETE /api/postits/:id`
- `POST /api/postits/:id/invite` / `DELETE /api/postits/:id/invite/:email` / `GET /api/postits/:id/invites`

### Messages
- `PATCH /api/messages/:id` — modifier contenu + `io.emit('message-content-updated')`
- `DELETE /api/messages/:id` — supprimer message + **toutes ses notes IA liées** (`sourceMessageId`) + Cloudinary si image

### IA
- `POST /api/ai/extract-multi` — `{ text, sourceMessageId }` → `{ items, source }`
- `POST /api/ai/extract` — extraction single (legacy)
- `GET|POST|PATCH|DELETE /api/ai/dictionary`
- `GET|POST|PATCH|DELETE /api/ai-dictionary` — alias legacy redirigé

### Divers
- `POST /api/upload` → Cloudinary
- `POST /api/archives/backup` / `GET /api/archives`

---

## 7. Événements Socket.io

| Événement | Direction | Description |
|---|---|---|
| `get-history` | client → serveur | Charger l'historique d'un postit |
| `history-data` | serveur → client | Retour historique |
| `send-message` | client → serveur | Envoyer un message |
| `new-message` | serveur → **tous** | Broadcast global (`io.emit`) |
| `toggle-message-note` | client → serveur | Basculer isNote |
| `message-updated` | serveur → tous | isNote changé |
| `message-content-updated` | serveur → tous | Contenu édité |
| `message-deleted` | serveur → tous | Message supprimé |
| `toggle-check-line` | client → serveur | Cocher/décocher ligne e-ink |
| `line-checked-updated` | serveur → tous | État coché mis à jour |
| `update-postit-status` | client → serveur | Changer statut pintalk |
| `postit-status-updated` | serveur → tous | Statut pintalk changé |
| `session-replaced` | serveur → client | Session dupliquée → déconnexion forcée |

⚠️ `new-message` est un `io.emit` global. Filtrage par `postitId` entièrement client-side dans `refreshView()`.

---

## 8. Navigation frontend (5 pages)

```
PAGE_ARCHIVES  = 0   — Consultation archives
PAGE_PARAMS    = 1   — Paramètres utilisateur
PAGE_GROUPES   = 2   — Grille des groupes (page d'accueil)
PAGE_CHAT      = 3   — Chat + e-ink (dans un groupe/pintalk)
PAGE_PREP      = 4   — Vue préparation e-ink plein écran (hors navigation)
```

**Swipe autorisé** :
- `PAGE_GROUPES` → droite → `PAGE_PARAMS`
- `PAGE_PARAMS` → gauche → `PAGE_GROUPES`
- `PAGE_CHAT` et `PAGE_ARCHIVES` : aucun swipe de navigation

**Chargement** :
- `goToPage(PAGE_GROUPES)` → `loadGroupsList()` (debounced 80ms + flag `_inProgress`)
- `initApp()` ne charge plus `loadGroups()` — délégué à `goToPage` appelé depuis `auth.js`

---

## 9. Pipeline IA (extraction items)

1. Utilisateur envoie un message → `socket.emit('send-message')`
2. Serveur sauvegarde → `io.emit('new-message', msg)`
3. Handler client `socket.on('new-message')` : vérifie `alreadyHasAi` + `_aiExtractInProgress.has(m._id)`
4. Si absent → `_aiExtractInProgress.add(m._id)` + `setTimeout(() => aiAutoExtract(...), 120ms)`
5. `aiAutoExtract` → POST `/api/ai/extract-multi` avec `{ text, sourceMessageId }`
6. Serveur : verrou `_aiExtractLock` par `sourceMessageId` (anti-doublon, 15s)
7. Réponse `{ items: [{text, uncertain}], source }` → items sauvegardés comme messages `✨ IA`
8. `refreshView()` → rendu e-ink

**Anti-doublon (3 niveaux)** :
- **Client** : `_aiExtractInProgress` (Set) par `messageId`
- **Serveur** : `_aiExtractLock` (Set) par `sourceMessageId`, auto-libération 15s
- **Socket** : `_userSockets` (Map) — session unique par email

**Sources** : `'gemini'` | `'presplit'` (bypass Gemini) | `'fallback'` (Gemini indisponible)

**Préfixe `__WORD__`** : généré par `_fallbackExtract` pour mots isolés, nettoyé dans `routes/ai.js` (serveur) ET dans `aiAutoExtract` (client) avant affichage.

**Dictionnaire utilisateur** : appliqué avant envoi à Gemini via `_normalizeTextWithAiDictionary()`. Cache serveur TTL 60s.

---

## 10. Mode édition de message (V5)

**Approche** : textarea inline inséré dans la bulle à la place du span texte.

**Flux** :
1. Tap sur stylo (swipe gauche) → `editMessage(id, [initialText])`
2. `window.getSelection()?.removeAllRanges()` — **obligatoire avant manipulation DOM** pour éviter la duplication iOS (iOS injecte la sélection active dans le premier champ éditable créé)
3. `setTimeout(200ms)` — laisse iOS traiter le `removeAllRanges`
4. `<textarea>` inséré à la place du `span` texte, auto-redimensionné
5. Bulle : contour jaune `#f59e0b`
6. Bandeau orange au-dessus de la tab-bar : `✏️ Modification : [nom] — ✕`
7. Scroll vers la bulle (`scrollIntoView block:'end'`)
8. **Valider** : `blur` ou `Enter` → PATCH `/api/messages/:id` → `_cancelEditMode()`
9. **Annuler** : tap ailleurs → `_cancelEditMode()` → textarea retiré, span restauré

**Variables globales** :
- `window._editingMessageId` — ID du message en cours
- `window._editingOriginalText` — texte original
- `window._editingTextarea` — référence au textarea
- `window._editingTextSpan` — référence au span masqué
- `window._scrollToEditBubble` — callback scroll, rappelé par `refreshView` si édition active

**Important** : `refreshView` ne scrolle pas en bas si `_editingMessageId` est actif.

---

## 11. Menu contextuel sur sélection de texte (V5)

`_initSelectionMenu()` dans `public/js/modules/ui.js`.

**Déclenchement** : `selectionchange` — fiable sur iOS Chrome/Safari si la sélection est dans une `.msg-bubble` ou dans un `textarea` en mode édition.

**Affichage** : bandeau `position:fixed`, largeur plein écran, hauteur 36px.
- **Hors mode édition** : positionné juste au-dessus du clavier via `visualViewport` (`top = vv.offsetTop + vv.height - 36`)
- **Fallback sans clavier** : au-dessus du bandeau orange ou de la tab-bar

**Actions** :
- **📚 Dico** : POST `/api/ai/dictionary` + toast de confirmation
- **❝ Citer** : si déjà en mode édition → met à jour le textarea directement ; sinon → `editMessage(id, newContent)` avec la sélection entourée de `"..."` (guillemets typographiques `\u201c\u201d`)

**Blocage swipe pendant sélection** :
- `handleTouchStart` bloque si `window.getSelection().toString()` non vide
- Flag `window._selectionJustEnded` posé au `touchend` si sélection active → bloque swipe 800ms

---

## 12. Suppression messages et cascade IA

**Côté serveur** (`routes/resources.js`) :
`DELETE /api/messages/:id` supprime le message ET toutes ses notes IA liées (`sourceMessageId === id`, `senderName === '✨ IA'`), avec `io.emit('message-deleted')` pour chacune. **Sans cette cascade, les notes IA reviennent au prochain chargement de l'historique.**

**Côté client** (`socket.on('message-deleted')`) :
Retire en une passe le message ET ses notes IA orphelines (`sourceMessageId === id`), sans récursion sur les notes IA elles-mêmes.

---

## 13. Fonctionnalités implémentées

### Authentification & Profil
- Connexion / Inscription avec i18n (fr, en, es, de, it)
- Langue sélectionnable à l'inscription, mémorisée en base
- Vérification téléphone (code par email fallback), modification profil, mot de passe, suppression compte (cascade complète)
- Préférences utilisateur persistées (MongoDB + localStorage)

### Groupes perso
- Création, édition, suppression (cascade complète)
- Code d'invitation + invitation email automatique si user inconnu
- Gestion membres, personnalisation visuelle des tuiles par utilisateur
- Réorganisation par drag & pinch sur la grille
- `loadGroupsList` debounced (80ms + flag `_inProgress`)

### Groupes pro (schéma + API — UI partielle)
- Schémas `Role` et `Permission` migrés V5
- `_getUserRoleInGroup` — résolution centralisée des droits effectifs
- CRUD rôles pro via `/api/groups/:id/roles`
- `POST /api/postits` : enforce owner-only perso, limite 4, droits pro vérifiés
- `GET /api/postits` : filtre `brouillon` invisible sans `voir_brouillons`
- Statut initial `brouillon` pour clients pro

### Postits / Pintalk
- Création → sélection via `loadGroupData(groupId, forcePostitId)` + `selectPostit` + navigation PAGE_CHAT
- Statut `brouillon` inclus dans le filtre des pintalks actifs
- Mémorisation dernier pintalk par groupe (`localStorage`)
- Personnalisation visuelle par utilisateur, invitation nominative

### Chat & UX mobile
- Messages texte et images (upload Cloudinary)
- Enregistrement vocal → transcription → zone de saisie
- **Swipe-to-reveal** : droite → 🗑️, gauche → 🖍️ — bloqué si sélection de texte active ou `_selectionJustEnded`
- **Mode édition V5** : textarea inline dans la bulle, `removeAllRanges` + délai 200ms anti-duplication iOS
- Bouton œil (toggle isNote), cocher/décocher lignes e-ink
- **Eink plein écran** (PAGE_PREP) : bouton `← Retour` garanti même si `/api/postits/details` échoue

### IA
- Extraction automatique multi-items, anti-doublon 3 niveaux
- Bypass IA si guillemets (verbatim)
- Préfixe `__WORD__` nettoyé côté serveur ET côté client
- Dictionnaire utilisateur (CRUD complet + cache serveur TTL 60s)

### Archives, Paramètres
- Sauvegarde manuelle, consultation par groupe/device/postit
- Thèmes (skins + couleurs + image de fond), langue UI, dictionnaire IA

---

## 14. Rate limiting

```js
authLimiter : 20 req / 15 min (prod) — 10 000 en dev
apiLimiter  : 120 req / min (prod)   — 10 000 en dev
```
Détection via `process.env.NODE_ENV === 'production'`.

**Important** : le rate limiter est en mémoire — un redémarrage serveur vide les compteurs.

---

## 15. Points d'attention critiques

### Fichiers de référence
**Toujours repartir des fichiers en `/outputs`** — les fichiers uploadés en conversation sont les versions d'origine. Les outputs contiennent la version courante.

### removeAllRanges avant DOM (iOS)
Toute insertion d'un champ éditable (`input`, `textarea`) dans le DOM **doit** être précédée de `window.getSelection()?.removeAllRanges()` + `setTimeout(200ms)` sur iOS, sinon le texte sélectionné est dupliqué dans le nouveau champ.

### io.emit global
`new-message` est un broadcast global. Filtrage par `postitId` entièrement client-side dans `refreshView()`.

### allMsgs
Tableau global client, alimenté par `history-data` + `new-message`. Tout rendu chat + e-ink en dépend. Toujours appeler `refreshView()` après mutation.

### Ordre suppression messages
Dans `deleteMessage()` : `_deleteAiNotesForMessage` **avant** `allMsgs.filter()`. Le cascade serveur `DELETE /api/messages/:id` supprime aussi les notes IA en base.

### CSS global input
`input:not([type=checkbox]):not([type=radio]), select, textarea` — ne pas revenir à `input, select, textarea`.

### Session unique par user
`_userSockets` Map côté serveur. Second appareil → `session-replaced` → déconnexion. Client : `removeAllListeners()` + `disconnect()` + `forceNew:true` à chaque `initApp()`.

---

## 16. Bugs connus en cours

### Sélection automatique après création pintalk
`selectPostit(newP._id)` est appelé après `loadGroupData(groupId, forcePostitId)` mais le pintalk créé n'est pas toujours sélectionné — on reste sur le premier pintalk. Cause probable : `_cachedPostits` non à jour au moment de l'appel, ou `localStorage.lastPintalk_` qui écrase `forcePostitId`. À investiguer avec logs sur `_cachedPostits` au moment de `selectPostit`.

### Autorisation micro non persistante
Sur iOS/Android, permission micro accordée par session. Permanente uniquement via app native (Capacitor).

---

## 17. Points non implémentés (prévus)

| Fonctionnalité | État |
|---|---|
| Stripe (abonnements pro) | Schéma en place, aucune intégration active |
| Notifications push | Non implémenté |
| PWA (manifest + Service Worker) | Non implémenté — **prochaine étape prioritaire** |
| Capacitor (app native iOS/Android) | Non implémenté — après PWA |
| Interface pro complète | Schéma + API partiels, UI non faite |
| Cycle de vie commandes pro | Spécifié dans specs-roles, non implémenté |
| Transfert propriété groupe | Non implémenté |
| Mode multi-écrans | Un seul device actif à la fois |
| Archives | Feature prévue pour suppression à terme |

### Interface pro — ce qui manque côté UI
- Accès conditionnel aux actions selon `myDroits` (boutons masqués/désactivés)
- Cycle de vie : brouillon → validée → en préparation → prête → ticket caisse
- Interface gestion rôles (créer, modifier, attribuer aux employés)
- Vue client : uniquement ses commandes
- Vue employé : commandes visibles selon droits

---

## 18. Roadmap suggérée

1. **Fix** : sélection automatique après création pintalk
2. **PWA** — `manifest.json` + Service Worker + icônes → installable iOS/Android
3. **Interface pro** — UI adaptée selon `myRole` + `myDroits` (déjà exposés par l'API)
4. **Notifications push** — via Service Worker (PWA) ou Capacitor
5. **Capacitor** — enveloppe native → App Store / Play Store → permission micro permanente
6. **Stripe** — intégration abonnements groupes pro
