# e-Postit Pro — Documentation Technique V3

> État du projet au moment de la rédaction de ce document.
> Destiné à une IA reprenant le projet en cours de développement.
> **Version** : V3 — juin 2025. Remplace la V2 intégralement.

---

## 1. Vue d'ensemble

**e-Postit Pro** est une application web mobile-first de gestion de commandes professionnelles basée sur un système de chat en temps réel. Les messages utilisateurs sont analysés automatiquement par IA pour en extraire les items de commande, affichés sur un simulateur d'écran e-ink (rendu "étiquette de commande").

Déployée sur **Oracle Cloud** (testable en local Node.js sous Windows/PowerShell). Accessible uniquement via navigateur mobile (pas d'app native).

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
| IA extraction | API Gemini (externe) + FALLBACK maison si indisponible |

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
app.js            — Logique frontend principale (~5 081 lignes)
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
⚠️ Ce schéma est insuffisant pour les rôles dynamiques pro (voir §12 — Points d'attention).

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
`allowedEmails` vide = visible par tous les membres du groupe.

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
- `PUT /api/user/profile` / `PUT /api/user/password` / `DELETE /api/user/account`

### Groupes
- `GET /api/groups` / `GET /api/groups/mine` / `GET /api/groups/:id/config`
- `POST /api/groups` / `PUT /api/groups/:id` / `DELETE /api/groups/:id`
- `DELETE /api/groups/:id/leave`
- `GET|POST /api/groups/:id/members` / `PUT /api/groups/:id/members/:email` / `DELETE /api/groups/:id/members/:email`

### Devices & Postits
- `GET /api/devices?groupName=` / `GET /api/devices/:gid`
- `POST|PUT|DELETE /api/devices/:id`
- `GET /api/postits?deviceId=` / `GET /api/postits/:did` / `GET /api/postits/details/:id`
- `POST|PUT|DELETE /api/postits/:id`
- `POST /api/postits/:id/invite` / `DELETE /api/postits/:id/invite/:email` / `GET /api/postits/:id/invites`

### Messages
- `PATCH /api/messages/:id` — Modifier contenu
- `DELETE /api/messages/:id` — Supprimer (+ Cloudinary si image)

### IA
- `POST /api/ai/extract-multi` — Extraction items (endpoint principal, reçoit `{ text, sourceMessageId }`)
- `POST /api/ai/extract` — Legacy
- `GET|POST|PATCH|DELETE /api/ai-dictionary`

### Divers
- `POST /api/upload` → Cloudinary
- `POST /api/invite` / `GET|POST /api/join` / `POST /api/groups/join`
- `POST /api/archives/backup` / `GET /api/archives`
- `GET|PUT /api/user/prefs`
- `POST /api/send-phone-code` / `POST /api/verify-phone`

---

## 5. Événements Socket.io

| Événement | Direction | Description |
|---|---|---|
| `get-history` | client → serveur | Charger l'historique d'un postit |
| `history-data` | serveur → client | Retour historique |
| `send-message` | client → serveur | Envoyer un message |
| `new-message` | serveur → **tous** | Broadcast global (`io.emit`) |
| `toggle-message-note` | client → serveur | Basculer isNote |
| `message-updated` | serveur → tous | isNote changé |
| `message-content-updated` | serveur → tous | Contenu d'un message édité |
| `message-deleted` | serveur → tous | Message supprimé |
| `toggle-check-line` | client → serveur | Cocher/décocher une ligne e-ink |
| `line-checked-updated` | serveur → tous | État coché mis à jour |
| `update-postit-status` | client → serveur | Changer statut pintalk |
| `postit-status-updated` | serveur → tous | Statut pintalk changé |
| `session-replaced` | serveur → client | Session dupliquée — déconnexion forcée |

⚠️ `new-message` est un `io.emit` global. Filtrage par `postitId` entièrement client-side dans `refreshView()`.

---

## 6. Navigation frontend (5 pages)

```
PAGE_ARCHIVES  = 0   — Consultation archives
PAGE_PARAMS    = 1   — Paramètres compte
PAGE_GROUPES   = 2   — Grille des groupes (page de démarrage)
PAGE_CHAT      = 3   — Chat + simulateur e-ink
PAGE_PREP      = 4   — Vue préparation (hors navigation swipe)
```

### Règles de swipe (simplifiées)
- **PAGE_GROUPES** : swipe droite → Paramètres uniquement
- **PAGE_PARAMS** : swipe gauche → Groupes uniquement
- **PAGE_CHAT** : aucun swipe — retour via bouton dédié dans le header
- **PAGE_ARCHIVES** / **PAGE_PREP** : aucun swipe

### Bouton retour groupe dans le header Chat
Généré dynamiquement dans `renderPostitTabs()`, injecté en tête de `#header-pintalk-tabs`. Style onglet surélevé : fond `rgba(255,255,255,0.15)`, bordure top `var(--accent)` 3px, `border-radius: 6px 0 0 0`. Affiche ← et le nom du groupe tronqué à 12 caractères. Séparé des tuiles pintalk par un séparateur vertical.

---

## 7. Hiérarchie des entités

```
Groupe (Group)
  └── Device (écran e-ink physique)
        └── Postit / Pintalk (commande = fil de chat)
              └── Message (senderName, content, isNote, type)
```

Groupe `perso` : max **4 pintalk**, créables uniquement par le `owner`. Groupe `pro` : pas de limite.

---

## 8. Logique IA (extraction automatique)

### Flux principal
1. `send()` → `_sendTextMessage(text)` → `socket.emit('send-message')`
2. Serveur : sauvegarde + `io.emit('new-message', msg)`
3. Handler client `socket.on('new-message')` : vérifie `alreadyHasAi` ET `_aiExtractInProgress.has(m._id)`
4. Si absent → `_aiExtractInProgress.add(m._id)` + `setTimeout(() => aiAutoExtract(...), 120ms)`
5. `aiAutoExtract` POST `/api/ai/extract-multi` avec `{ text, sourceMessageId }`
6. Serveur : verrou `_aiExtractLock` par `sourceMessageId` (anti-doublon serveur, 15s)
7. Réponse `{ items: [{text, uncertain}] }` → items sauvegardés comme messages `✨ IA`
8. `refreshView()` → rendu e-ink

### Anti-doublon (3 niveaux)
- **Client** : `_aiExtractInProgress` (Set) — verrou par `messageId`, libéré dans `finally`
- **Serveur** : `_aiExtractLock` (Set) — verrou par `sourceMessageId`, auto-libération 15s
- **Socket** : `_userSockets` (Map) — une seule connexion socket par email; doublon → `session-replaced` + déconnexion

### Rendu e-ink dans refreshView
Deux catégories affichées :
1. **Items IA** (`senderName === '✨ IA'`, `isNote=false`) liés à des messages source non masqués
2. **Messages user sans item IA** (`isNote=false`, non-IA, non-image) — fallback pour anciens messages ou si extraction échoue. `sourcesWithAi` = Set des `sourceMessageId` des items IA existants, utilisé pour exclure les messages déjà représentés.

### Suppression messages et nettoyage IA
`socket.on('message-deleted')` retire en une passe le message ET ses notes IA liées (`sourceMessageId === id`), sans récursion sur les notes IA elles-mêmes (évite les doublons).

`_deleteAiNotesForMessage(sourceMessageId, postitId)` : ne dépend plus de la présence du parent dans `allMsgs` (race condition corrigée). L'ordre dans `deleteMessage()` est : supprimer notes IA d'abord, retirer message de `allMsgs` ensuite.

### initApp() et socket
À chaque `initApp()` : `socket.removeAllListeners()` + `socket.disconnect()` + `forceNew: true` avant toute nouvelle connexion, pour éviter les listeners fantômes.

### Helpers côté serveur
- `_splitByArticles(text)` — découpe multi-items
  - Fusionne `500 g` → `500g`, `1,5 kg` → `1,5kg` avant split
  - Protège les virgules décimales dans le split sur ponctuation (lookbehind regex)
  - `quantiteCollée` : `/^\d+[.,]?\d*\s*(g|gr|kg|ml|cl|dl|l)$/i`
  - `nomsComposes` : veau, bœuf, porc, poulet, blanc, cuisse, filet, escalope, gigot...
  - `adjectifs` : haché, râpé, fumé, grillé, tendre, maigre, moelleux...
  - `à` exclu des frontières (`chair à saucisse`)
  - `nomsComposes` exclus de `prevIsRealWord`
- `_fallbackExtract(text)` — extraction sans IA (Gemini indisponible)
- `_cleanExtractedItemText(text)` — retire puces/numéros de liste, **conserve les chiffres en début** (quantités)
- `_isLikelyProductText(text)` — valide un item; quantités collées (`500g`) acceptées
- `_normalizeProductKey(text)` — clé de dédoublonnage

### Helpers côté client
- `_normalizeAiInputText(text)` — normalisation générale avant envoi IA
- `_extractQuotedItems(text)` — bypass IA pour contenu entre guillemets
- `_isNegativeConfirmationMessage(text)` — détection confirmation négative
- `_isQuestionLikeMessage(text)` — détection question (pas d'extraction)
- `_isNegatedItemInText(text, item)` — détection négation
- `_compileProtectedPhraseRegex(phrase)` — regex dictionnaire protégé
- `_deleteAiNotesForMessage(sourceMessageId, postitId)` — supprime notes IA liées

---

## 9. Fonctionnalités implémentées

### Authentification & Profil
- Connexion / Inscription avec i18n (fr, en, es, de, it)
- Vérification téléphone SMS, modification profil, mot de passe, suppression compte
- Préférences utilisateur persistées (MongoDB + localStorage)

### Groupes
- Création groupe `perso` ou `pro` (champs SIRET, adresse, logo, Stripe)
- Code d'invitation par lien / `POST /api/groups/join`
- Gestion membres avec rôles
- Personnalisation visuelle des tuiles (couleur, forme, police, logo) — propre à chaque utilisateur
- Réorganisation par drag & pinch sur la grille

### Postits / Pintalk
- Création (owner uniquement en perso), édition, suppression
- `canCreate = (myRole === 'owner') && _cachedPostits.length < 4` — côté UI uniquement (pas encore enforced API)
- Statuts configurables, restriction `allowedEmails`, invitation nominative
- **Mémorisation dernier pintalk par groupe** : `localStorage.setItem('lastPintalk_' + groupId, postitId)` — restauré à chaque entrée dans le groupe
- **Nouveau pintalk** → automatiquement sélectionné via `selectPostit(newP._id)`
- Personnalisation visuelle par utilisateur

### Chat & UX mobile
- Messages texte et images (upload Cloudinary)
- Enregistrement vocal → zone de saisie vidée après envoi
- **Swipe-to-reveal** : droite → 🗑️, gauche → 🖍️ (bouton `right:-48px`, bulle maintenue à `-48px`, threshold 30px)
- **Édition inline** : `<input type="text">` natif remplace le span — focus immédiat iOS/Android, curseur en fin, sauvegarde au `blur`
- **Bouton œil** (toggle isNote) : zone `min-44px`, `ontouchend` + `preventDefault()` — anti double-déclenchement
- Cocher/décocher les lignes de commande

### Menu contextuel sur sélection de texte
`_initSelectionMenu()` — affiché après sélection dans une bulle (`.msg-bubble`) :
- **📚 Ajouter au dico PinTalk** : POST `/api/ai-dictionary` + toast
- **❝ Mettre entre guillemets** : insère `"expression"` dans `msg-input`
- Se positionne via `getBoundingClientRect()`, se ferme au tap extérieur

### Simulateur e-ink
- Items IA + messages user sans items IA associés (fallback)
- Cocher/décocher directement dans l'e-ink
- Affiché dans le header Chat et dans la vue Préparation

### IA
- Extraction automatique multi-items, anti-doublon 3 niveaux
- Bypass IA si guillemets (verbatim)
- Suppression/recréation notes IA à chaque édition ou toggle œil
- Dictionnaire utilisateur (CRUD)
- Fusion quantités avec espace : `"500 g"` → `"500g"`, `"1,5 kg"` → `"1,5kg"`
- Debug : case à cocher pour afficher bulles `✨ IA` dans le chat

### Archives
- Sauvegarde manuelle d'un historique de chat
- Consultation par groupe / device / postit

### Paramètres
- Thèmes (skins 0/1/2 + couleurs custom + image de fond), langue UI (5 langues)
- Dictionnaire IA personnel, changement mot de passe, suppression compte

---

## 10. Points d'attention critiques

### refreshView définie deux fois
`refreshView` est définie deux fois dans `app.js`. La **seconde définition écrase la première en JS** — toute modification du rendu doit cibler la **seconde** (ligne ~3714). La première est conservée pour référence.

### io.emit global
`new-message` est un broadcast global. Filtrage par `postitId` entièrement client-side dans `refreshView()`.

### CSS global input
`input:not([type=checkbox]):not([type=radio]), select, textarea` — les checkboxes sont explicitement exclues. Ne pas revenir à `input, select, textarea`.

### allMsgs
Tableau global client, alimenté par `history-data` + `new-message`. Tout rendu chat + e-ink en dépend. Toute mutation sans `refreshView()` ne met pas à jour l'UI.

### Ordre suppression messages
Dans `deleteMessage()` : `_deleteAiNotesForMessage` **avant** `allMsgs.filter(m => m._id !== id)`. Le handler `socket.on('message-deleted')` peut arriver en avance et retirer le parent — `_deleteAiNotesForMessage` ne dépend plus de la présence du parent dans `allMsgs`.

### Session unique par user
`_userSockets` Map côté serveur. Si second appareil → `session-replaced` → déconnexion. Côté client : `removeAllListeners()` + `disconnect()` + `forceNew:true` à chaque `initApp()`.

---

## 11. Bugs connus et limites

### Autorisation micro non persistante
Sur iOS Safari et Android Chrome, permissions micro accordées par session. Aucun moyen de les rendre permanentes en web. Partiellement atténué en installant l'app comme PWA sur Android.

### FALLBACK si Gemini indisponible
`_fallbackExtract` prend le relais. Fonctionnel pour les cas courants, moins précis que Gemini pour les formulations complexes.

### Limite 4 pintalk perso non enforced côté API
`canCreate` est vérifié côté UI uniquement. Un appel direct à `POST /api/postits` peut contourner la limite. À corriger.

---

## 12. Points non implémentés (prévus)

- **Stripe** : schéma en place, aucune intégration active
- **Limite 4 pintalk perso côté API** : non enforced — à ajouter dans `POST /api/postits`
- **Notifications push** : non implémenté
- **Mode multi-écrans** : un seul device actif à la fois
- **Archives** : feature prévue pour suppression à terme
- **Partie pro complète** : rôles dynamiques, cycle de vie commandes, interface client/employé — spécifiée dans `epostit-pro-specs-roles.md`, non implémentée

### Prérequis avant implémentation partie pro
Le schéma `Permission` actuel (`role: String` fixe) est insuffisant pour les rôles dynamiques pro. Migration requise :
- Nouvelle collection `Role` : `{ groupId, name, droits: [String], isDefault: Boolean }`
- `Permission` modifié : `{ groupId, userEmail, roles: [ObjectId → Role], type: ('owner'|'employe'|'client'|'membre'|'membre-pintalk') }`
- Droits effectifs = union de tous les rôles (cumul additif, le plus permissif l'emporte)

---

## 13. Points d'attention pour la reprise

1. **Toujours repartir des fichiers `/outputs`** — les fichiers uploadés en conversation sont les versions d'origine non patchées. Les outputs contiennent la version à jour.

2. **`refreshView` seconde définition** — cibler la seconde occurrence (ligne ~3714) pour tout rendu e-ink ou chat.

3. **`io.emit` vs `socket.emit`** — pas de filtrage serveur, tout est client-side.

4. **CSS `input`** — garder l'exclusion `not([type=checkbox]):not([type=radio])`.

5. **`allMsgs`** — toujours appeler `refreshView()` après mutation.

6. **Ordre dans `deleteMessage()`** — notes IA supprimées avant retrait du parent de `allMsgs`.

7. **Documentation fonctionnelle** — voir `epostit-pro-specs-roles.md` pour les specs complètes des rôles perso et pro (inclut cycle de vie commandes, UI e-ink double bouton ✓/✗, système de rôles dynamiques).
