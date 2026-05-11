# e-Postit Pro — Documentation Technique

> État du projet au moment de la rédaction de ce document.
> Destiné à une IA reprenant le projet en cours de développement.
> **Mis à jour** : juin 2025 — reflète toutes les évolutions depuis la version initiale.

---

## 1. Vue d'ensemble

**e-Postit Pro** est une application web mobile-first de gestion de commandes professionnelles basée sur un système de chat en temps réel. Les messages utilisateurs sont analysés automatiquement par IA pour en extraire les items de commande, affichés sur un simulateur d'écran e-ink (rendu "étiquette de commande").

D�ployée sur **Oracle Cloud** (aussi testable en local Node.js). Accessible uniquement via navigateur mobile (pas d'app native).

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
| IA extraction | Appel API externe (Gemini) via `/api/ai/extract-multi` + FALLBACK maison si indisponible |

### Frontend
| Composant | Technologie |
|---|---|
| Structure | HTML/CSS/JS vanilla (pas de framework) |
| Styles | Tailwind CSS (CDN) + style.css custom |
| Temps réel | Socket.io client |
| i18n | Système maison (`i18n.js`) |
| Audio | Web Speech API (transcription navigateur) |

### Fichiers source (tailles actuelles)
```
server.js         — Backend complet (~2 655 lignes)
app.js            — Logique frontend principale (~5 133 lignes)
index.html        — Structure HTML (~520 lignes)
style.css         — Styles custom (~420 lignes)
navigation.js     — Gestion des pages et swipe (~80 lignes)
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

### Device
```js
{ groupId, name, mac, ownerEmail }
```

### Postit (= "Pintalk")
```js
{ deviceId, ownerEmail, name, orderNumber, phone, email, pickupDate,
  status, isLocked, imageUrl, allowedEmails,
  tileColor, tileTextColor, tileShape, tileLogoUrl }
```

### Message
```js
{ groupId, deviceId, postitId, content, senderName,
  isNote (bool), isUncertain (bool), sourceMessageId,
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
- `GET /api/devices?groupName=` / `GET /api/devices/:gid`
- `POST /api/devices` / `PUT /api/devices/:id` / `DELETE /api/devices/:id`
- `GET /api/postits?deviceId=` / `GET /api/postits/:did`
- `GET /api/postits/details/:id`
- `POST /api/postits` / `PUT /api/postits/:id` / `DELETE /api/postits/:id`
- `POST /api/postits/:id/invite` / `DELETE /api/postits/:id/invite/:email`
- `GET /api/postits/:id/invites`

### Messages
- `PATCH /api/messages/:id` — Modifier contenu
- `DELETE /api/messages/:id` — Supprimer (+ Cloudinary si image)

### IA
- `POST /api/ai/extract-multi` — Extraction items (endpoint principal)
- `POST /api/ai/extract` — Legacy
- `GET/POST/PATCH/DELETE /api/ai-dictionary` — CRUD dictionnaire utilisateur

### Divers
- `POST /api/upload` — Upload → Cloudinary
- `POST /api/invite` / `GET|POST /api/join` / `POST /api/groups/join`
- `POST /api/archives/backup` / `GET /api/archives`
- `GET/PUT /api/user/prefs`
- `POST /api/send-phone-code` / `POST /api/verify-phone`

---

## 5. Événements Socket.io

| Événement | Direction | Description |
|---|---|---|
| `get-history` | client → serveur | Charger l'historique d'un postit |
| `history-data` | serveur → client | Retour historique |
| `send-message` | client → serveur | Envoyer un message |
| `new-message` | serveur → **tous** | Broadcast (`io.emit`) |
| `toggle-message-note` | client → serveur | Basculer isNote |
| `message-updated` | serveur → tous | Notification isNote changé |
| `toggle-check-line` | client → serveur | Cocher/décocher une ligne |
| `update-postit-status` | client → serveur | Changer statut pintalk |
| `message-deleted` | serveur → tous | Message supprimé |
| `session-replaced` | serveur → client | Session dupliquée détectée — déconnexion forcée |

⚠️ `new-message` est un `io.emit` global. Le filtrage par `postitId` est entièrement client-side dans `refreshView()`.

---

## 6. Navigation frontend (5 pages)

```
PAGE_ARCHIVES  = 0   — Consultation archives
PAGE_PARAMS    = 1   — Paramètres compte
PAGE_GROUPES   = 2   — Grille des groupes (page de démarrage)
PAGE_CHAT      = 3   — Chat + simulateur e-ink
PAGE_PREP      = 4   — Vue préparation (hors navigation swipe)
```

### Règles de swipe (simplifiées depuis version initiale)
- **PAGE_GROUPES** : swipe droite → Paramètres uniquement. Pas de swipe gauche vers Chat.
- **PAGE_PARAMS** : swipe gauche → Groupes uniquement. Pas de swipe droite vers Archives.
- **PAGE_CHAT** : aucun swipe. Retour groupes via bouton dédié dans le header.
- **PAGE_ARCHIVES** : aucun swipe.
- **PAGE_PREP** : inaccessible par swipe.

### Bouton retour groupe dans le header Chat
Dans `renderPostitTabs()`, un bouton `backBtn` est injecté comme premier élément de `#header-pintalk-tabs`. Style "onglet surélevé" : fond `rgba(255,255,255,0.15)`, bordure top `var(--accent)` 3px, `border-radius:6px 0 0 0`. Affiche la flèche ← et le nom du groupe tronqué à 12 caractères. Séparé des tuiles pintalk par un séparateur vertical.

---

## 7. Hiérarchie des entités

```
Groupe (Group)
  └── Device (écran e-ink physique)
        └── Postit / Pintalk (commande = fil de chat)
              └── Message (senderName, content, isNote, type)
```

Un groupe `perso` est limité à **4 pintalk maximum**, créables uniquement par le `owner`. Les membres (`admin`, `employe`, `client`) peuvent utiliser les pintalk existants et configurer leur apparence personnelle, mais ne peuvent pas en créer.

---

## 8. Logique IA (extraction automatique)

### Flux principal
1. `send()` → `_sendTextMessage(text)` → `socket.emit('send-message')`
2. Serveur : sauvegarde + `io.emit('new-message', msg)`
3. Handler client `socket.on('new-message')` : vérifie `alreadyHasAi` ET `_aiExtractInProgress.has(m._id)`
4. Si absent → `_aiExtractInProgress.add(m._id)` + `setTimeout(() => aiAutoExtract(...), 120ms)`
5. `aiAutoExtract` POST `/api/ai/extract-multi` avec `{ text, sourceMessageId }`
6. Serveur : verrou `_aiExtractLock` par `sourceMessageId` (anti-doublon serveur)
7. Réponse `{ items: [{text, uncertain}] }` → items sauvegardés comme messages `✨ IA`
8. `refreshView()` → rendu e-ink

### Anti-doublon (multicouche)
- **Client** : `_aiExtractInProgress` (Set) — verrou par `messageId`, libéré dans `finally`
- **Serveur** : `_aiExtractLock` (Set) — verrou par `sourceMessageId`, auto-libération après 15s
- **Socket** : `_userSockets` (Map) — une seule connexion socket par email; si doublon détecté, l'ancienne session reçoit `session-replaced` et est déconnectée

### Rendu e-ink dans refreshView
Le rendu affiche deux catégories de messages :
1. **Items IA** (`senderName === '✨ IA'`, `isNote=false`) liés à des messages source non masqués
2. **Messages user sans item IA** (`isNote=false`, non-IA, non-image) pour lesquels aucun item IA n'existe — fallback pour les anciens messages ou si l'extraction échoue

`sourcesWithAi` = Set des sourceMessageId des items IA existants, utilisé pour exclure les messages user déjà représentés par leurs items IA.

### Suppression de messages et nettoyage IA
`socket.on('message-deleted')` :
- Retire le message de `allMsgs`
- Si message user (non `✨ IA`) : retire aussi ses notes IA orphelines de `allMsgs` (filtre `sourceMessageId === id`) et appelle `_deleteAiNotesForMessage` pour nettoyage serveur
- Si message `✨ IA` : simple retrait, sans récursion

`_deleteAiNotesForMessage(sourceMessageId, postitId)` :
- Ne dépend plus de la présence du message parent dans `allMsgs` (race condition corrigée)
- Cherche directement par `sourceMessageId` dans `allMsgs`

### Helpers de parsing côté serveur
- `_splitByArticles(text)` — découpe un texte multi-items en items individuels
  - Fusionne `500 g` → `500g` / `1,5 kg` → `1,5kg` avant split
  - Protège les virgules décimales (`1,5`) dans le split sur ponctuation
  - `quantiteCollée` regex : `/^\d+[.,]?\d*\s*(g|gr|kg|ml|cl|dl|l)$/i`
  - `nomsComposes` inclut : veau, bœuf, porc, poulet, agneau, saumon, blanc, cuisse, filet, escalope, gigot...
  - `adjectifs` inclut : haché, râpé, fumé, grillé, tendre, maigre, moelleux...
  - `à` exclu des frontières d'items (ex: `chair à saucisse`)
  - `nomsComposes` exclus de `prevIsRealWord`
- `_fallbackExtract(text)` — extraction sans IA (utilisé si Gemini indisponible)
- `_cleanExtractedItemText(text)` — nettoie les items extraits; retire puces et numéros de liste (`1.`, `•`) mais **conserve les chiffres en début** (quantités)
- `_isLikelyProductText(text)` — valide qu'un item est bien un produit; accepte les quantités collées (`500g`) comme valides
- `_normalizeProductKey(text)` — clé de dédoublonnage

### Helpers de parsing côté client
- `_normalizeAiInputText(text)` — normalisation générale du texte avant envoi à l'IA
- `_extractQuotedItems(text)` — bypass IA pour contenu entre guillemets
- `_isNegativeConfirmationMessage(text)` — détection confirmation négative
- `_isQuestionLikeMessage(text)` — détection question
- `_isNegatedItemInText(text, item)` — détection négation
- `_compileProtectedPhraseRegex(phrase)` — regex dictionnaire protégé
- `_deleteAiNotesForMessage(sourceMessageId, postitId)` — supprime notes IA liées

---

## 9. Fonctionnalités implémentées

### Authentification & Profil
- Connexion / Inscription avec i18n (fr, en, es, de, it)
- Vérification téléphone par SMS
- Modification profil, mot de passe, suppression compte
- Préférences utilisateur persistées (MongoDB + localStorage)

### Groupes
- Création groupe `perso` ou `pro` (champs SIRET, adresse, Stripe)
- Code d'invitation par lien
- Gestion membres avec rôles (owner / admin / employé / client)
- Personnalisation visuelle des tuiles (couleur, forme, police, logo)
- Réorganisation par drag & pinch sur la grille
- **Restriction création pintalk** : seul le `owner` peut créer des pintalk dans un groupe `perso` (bouton `+` masqué pour les autres rôles)

### Postits / Pintalk
- Création, édition, suppression
- Statuts de commande configurables
- Restriction d'accès par `allowedEmails`
- Invitation nominative sur un postit
- Filtre par statut et date
- Personnalisation visuelle par membre (couleur, forme, logo)
- **Mémorisation dernier pintalk par groupe** : `localStorage.setItem('lastPintalk_' + groupId, postitId)` — restauré à chaque entrée dans le groupe
- **Nouveau pintalk** → sélectionné automatiquement via `selectPostit(newP._id)`

### Chat & UX mobile
- Messages texte et images (upload Cloudinary)
- Enregistrement vocal (Web Speech API → transcription → texte) — zone de saisie vidée après envoi
- **Swipe-to-reveal** sur les bulles : swipe droite → 🗑️ (suppression), swipe gauche → 🖍️ (édition)
  - Bouton 🖍️ positionné `right:-48px`, fond `rgba(30,30,30,0.85)`, bulle maintenue à `-48px`
  - Threshold de détection : 30px (au lieu de 20px initialement)
- **Édition inline** : remplacement du span par un `<input type="text">` natif — focus immédiat garanti sur iOS/Android, curseur en fin de texte, sauvegarde au `blur`
- **Bouton œil** (toggle isNote) : zone de tap `min-width/height:44px`, `ontouchend` avec `preventDefault()` pour éviter le double déclenchement touch+click
- `isNote=true` → message grisé dans le chat, masqué de l'e-ink
- Cocher/décocher les lignes de commande

### Menu contextuel sur sélection
`_initSelectionMenu()` — menu custom affiché après sélection de texte dans une bulle :
- Se positionne au-dessus de la sélection via `getBoundingClientRect()`
- **📚 Ajouter au dico PinTalk** : POST `/api/ai-dictionary` + toast de confirmation
- **❝ Mettre entre guillemets** : insère `"expression"` dans `msg-input`
- Se ferme au tap extérieur (`touchstart`/`mousedown` sur `document`)

### Simulateur e-ink
- Rendu temps réel : items IA + messages user sans items IA associés
- Exclut images et messages `isNote=true`
- Cocher/décocher les lignes directement dans l'e-ink
- Affiché dans le header du chat et dans la vue Préparation

### IA
- Extraction automatique multi-items depuis chaque message
- Bypass IA si contenu entre guillemets (verbatim)
- Suppression/recréation des notes IA à chaque édition ou toggle œil
- Dictionnaire utilisateur (CRUD) pour termes protégés
- **Fusion quantités** : "500 g" → "500g", "1,5 kg" → "1,5kg" (protection virgule décimale)
- Debug : case à cocher pour afficher les bulles `✨ IA` dans le chat

### Archives
- Sauvegarde manuelle d'un historique de chat
- Consultation par groupe / device / postit

### Paramètres
- Thèmes (skins 0/1/2 + couleurs custom + image de fond)
- Langue UI (5 langues)
- Dictionnaire IA personnel
- Changement mot de passe / suppression compte

---

## 10. Points d'attention critiques

### refreshView définie deux fois
`refreshView` est définie aux lignes ~3371 et ~3714 dans `app.js`. La **seconde définition écrase la première en JS**. Toute modification du rendu doit cibler la **seconde définition** (ligne ~3714). La première est conservée pour référence historique mais est inactive.

### io.emit global
`new-message` est un broadcast global. Pas de filtrage serveur par groupe/postit. Tout filtrage est client-side dans `refreshView()` via `m.postitId === pid`.

### CSS global input
`input:not([type=checkbox]):not([type=radio]), select, textarea` — les checkboxes sont explicitement exclues du reset CSS global. Ne pas revenir à `input, select, textarea`.

### allMsgs
Tableau global client, alimenté par `history-data` et mis à jour à chaque `new-message`. Tout le rendu chat + e-ink en dépend. Toute mutation sans `refreshView()` ne met pas à jour l'UI.

### Session unique par user (Socket.io)
`_userSockets` Map côté serveur : garantit une seule connexion socket par email. Si un second appareil se connecte, le premier reçoit `session-replaced` et est déconnecté. Côté client, `initApp()` appelle `socket.removeAllListeners()` + `socket.disconnect()` + `forceNew:true` avant toute nouvelle connexion.

### Ordre suppression messages
Dans `deleteMessage()` : `_deleteAiNotesForMessage` doit être appelé **avant** `allMsgs.filter(m => m._id !== id)` — car la fonction cherche le sourceMsg dans `allMsgs`. Le handler `socket.on('message-deleted')` peut arriver en avance (race condition) et retirer le parent avant que `fetchAuth` ne retourne.

---

## 11. Bugs connus et limites

### Autorisation micro non persistante
Sur iOS Safari et Android Chrome, les permissions microphone sont accordées par session navigateur. Aucun moyen de les rendre permanentes via le code web. Solution partielle : installer l'app comme PWA (Ajouter à l'écran d'accueil) sur Android.

### Langage oral — cas ambigus
`"deux kilos cinq cents"` (= 2,5kg) est mal géré car `"cinq cents"` est ambigu entre 500 (nombre entier) et fraction décimale. Cas très rare en pratique.

### FALLBACK actif si Gemini indisponible
Quand l'API Gemini ne répond pas, `_fallbackExtract` prend le relais. Le FALLBACK est fonctionnel pour les cas courants (listes simples, quantités) mais moins précis que l'IA pour les formulations complexes.

---

## 12. Points non implémentés (prévus)

- **Stripe** : schéma en place, aucune intégration active
- **Limite 4 pintalk** pour groupes `perso` : enforced côté UI (bouton masqué) mais **pas encore enforced côté API** — un appel direct à `POST /api/postits` peut contourner la limite
- **Notifications push** : non implémenté
- **Mode multi-écrans** : un seul device actif à la fois par session
- **Archives** : feature prévue pour suppression à terme
