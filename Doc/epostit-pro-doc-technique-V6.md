# e-Postit Pro — Documentation Technique V6
**Date** : Mai 2026 | **Stack** : Node.js / Express / MongoDB Atlas / Socket.io / Cloudinary  
**Déploiement** : Oracle Cloud (Ubuntu 24) | **Frontend** : Vanilla JS + Tailwind CSS (mobile-first)

---

## 1. Architecture générale

```
postit-server/
├── server.js                  — Point d'entrée Express + Socket.io
├── routes/
│   ├── auth.js                — Login / Register (JWT)
│   ├── users.js               — Profil, préférences, mot de passe, suppression compte
│   ├── groups.js              — CRUD groupes, join par code
│   ├── members.js             — Membres, rôles pro (CRUD droits)
│   ├── resources.js           — Devices, Postits, Messages, Archives
│   │                            + archivage/restauration conversation
│   │                            + codes de confirmation suppression (email)
│   └── ai.js                  — Extraction IA (Gemini), dictionnaire personnel
├── helpers/
│   ├── auth.js                — JWT middleware, generateJoinCode
│   ├── ai.js                  — NLP : _fallbackExtract, _isLikelyProductText, etc.
│   ├── mail.js                — Nodemailer, codes invitation/vérification
│   └── permissions.js         — _getUserRoleInGroup, ALL_DROITS
├── models/                    — Schemas Mongoose (voir §3)
├── socket/
│   └── index.js               — Tous les handlers Socket.io (rooms par groupe)
└── public/
    ├── js/modules/
    │   ├── app-core.js        — Init app, socket, handlers new-message/history-data
    │   ├── groups.js          — loadGroupsList, selectGroup, drag/pinch tuiles
    │   ├── postits.js         — renderPostitTabs, selectPostit, uiEditPostit (onglets)
    │   ├── chat.js            — refreshView, showStatusMenu, toggleLineCheck
    │   ├── navigation.js      — goToPage, swipe (PAGE_GROUPES↔PAGE_PARAMS)
    │   ├── archives.js        — Consultation, archivage, restauration conversations
    │   ├── pro-queue.js       — Vue pile commandes (employé/proprio groupes pro)
    │   ├── pro-params.js      — Onglets paramètres page (switchParamsTab)
    │   ├── group-modal.js     — Modal groupe avec onglets (infos/tuile/employés/rôles)
    │   ├── delete-confirm.js  — Confirmation suppression par code email 6 chiffres
    │   ├── tile-select.js     — Sélection visuelle tuiles (outline+scale, sans écraser couleurs)
    │   ├── ai-extract.js      — aiAutoExtract, _isNegativeConfirmationMessage
    │   ├── ui.js              — editMessage, deleteMessage, skins, dictionnaire IA UI
    │   ├── params.js          — Profil utilisateur, mot de passe
    │   ├── media.js           — Upload Cloudinary, dictée vocale
    │   └── i18n.js            — Traductions (fr/en/es/de/it)
    └── css/
        └── style.css          — Styles globaux + système d'onglets (.tabs-bar/.tab-btn/.tab-panel)
```

---

## 2. Variables d'environnement (.env)

```env
# Base de données
MONGO_URI=mongodb+srv://...

# Authentification
JWT_SECRET=...

# Email (Nodemailer)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...              # Mot de passe application Gmail (16 chars)
APP_URL=https://...

# Cloudinary (uploads fichiers/images)
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

# IA — Extraction de produits
# Si GEMINI_API_KEY ou GEMINI_MODEL absent → fallback NLP uniquement (pas d'erreur)
GEMINI_API_KEY=AIza...
GEMINI_MODEL=gemini-2.5-flash-lite   # Modèle actif (mai 2026)
GEMINI_API_ENDPOINT=https://generativelanguage.googleapis.com/v1beta  # endpoint stable
GEMINI_MIN_INTERVAL_MS=2500          # Délai minimum entre appels (ms)

# Dictionnaire IA admin
AI_DICTIONARY_ADMIN_EMAILS=admin@example.com

# Environnement
NODE_ENV=production
PORT=3000
ALLOWED_ORIGINS=https://...
```

**Important IA** : L'appel Gemini n'est effectué que si `GEMINI_API_KEY` ET `GEMINI_MODEL` sont définis. Si l'un des deux est absent, le système bascule automatiquement sur le fallback NLP sans erreur.

---

## 3. Modèles Mongoose

```js
User         { email, name, firstname, lastname, password(bcrypt), phone, lang, prefs }
Group        { name, ownerEmail, joinCode, type('perso'|'pro'), isPro, subscriptionStatus,
               tileColor, tileTextColor, tileShape, tileFontFamily, tileFontSize, logoUrl,
               company, addr1, addr2, cp, ville, phonePro, emailPro, siret }
Device       { name, groupId }                          // "Rayon"
Postit       { name, deviceId, ownerEmail, allowedEmails[], status, tileColor, tileTextColor,
               tileShape, tileLogoUrl, pickupDate, phone, email, orderNumber,
               isPro, groupId }                         // "Pintalk" / "Commande"
Message      { groupId, deviceId, postitId, content, senderName, type, isNote, isUncertain,
               checked, sourceMessageId, date, restoredFrom }
Archive      { groupName, deviceName, postitName, postitId, groupId, deviceId,
               content[{author,text,date,type,isNote,checked}],
               archivedAt, adminId, ownerEmail, archivedBy, msgCount }
Permission   { groupId, guestEmail, type('owner'|'employe'|'client'|'membre'), role, roles[] }
Role         { groupId, name, droits[], isDefault }
AiDictionaryEntry { phrase, normalized, lang, category, active, scope, ownerEmail }
```

### Statuts Postit

**Groupes perso** : `En attente` → `En préparation` → `Terminé` | `Annulé`

**Groupes pro** (constants `PRO_STATUS` dans `postits.js`) :
```
brouillon → validée → en cours de préparation → prête → prête avec manquant → ticket de caisse → terminée | annulée
```

---

## 4. API Routes

### Auth
| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/login` | Connexion → JWT |
| POST | `/api/register` | Inscription |

### Groupes
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/groups/mine` | Tous les groupes accessibles (myRole, myDroits) |
| GET | `/api/groups/:id/config` | Config groupe (rôle courant, joinCode si owner) |
| POST | `/api/groups` | Créer un groupe (perso ou pro) |
| PUT | `/api/groups/:id` | Modifier |
| DELETE | `/api/groups/:id` | Supprimer (cascade, owner only) |
| POST | `/api/groups/join` | Rejoindre via joinCode |

### Membres & Rôles pro
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/groups/:id/members` | Liste membres |
| POST | `/api/groups/:id/members` | Inviter (email → invitation auto si inconnu) |
| PUT | `/api/groups/:id/members/:email` | Modifier type/rôles |
| DELETE | `/api/groups/:id/members/:email` | Retirer |
| GET/POST/PUT/DELETE | `/api/groups/:id/members/roles` | CRUD rôles pro |

### Resources
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/devices` | Rayons (filtre groupId ou groupName) |
| GET/POST | `/api/postits` | Pintalk |
| DELETE | `/api/postits/:id` | Supprimer pintalk (via delete-confirm) |
| POST | `/api/postits/:id/archive-clear` | Archiver messages + vider pintalk |
| GET | `/api/archives` | Lister archives (filtre group/device/postit) |
| POST | `/api/archives/backup` | Sauvegarde manuelle |
| POST | `/api/archives/:id/restore` | Restaurer dans un pintalk cible |
| POST | `/api/delete-confirm/request` | Envoyer code 6 chiffres par email |
| POST | `/api/delete-confirm/execute` | Vérifier code + exécuter suppression |

### IA
| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/ai/extract-multi` | Extraction produits (Gemini ou fallback NLP) |
| GET | `/api/ai/status` | État rate-limiter Gemini (diagnostic) |
| GET/POST/DELETE | `/api/ai/dictionary` | Dictionnaire personnel |

### Upload / Invitation
| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/upload` | Upload Cloudinary (image/audio/PDF) |
| POST | `/api/invite` | Invitation par email avec token 48h |
| GET/POST | `/api/join` | Rejoindre via token invitation |

---

## 5. Socket.io

**Authentification** : token JWT dans `socket.handshake.auth.token`  
**Session unique** : une session par email (la précédente reçoit `session-replaced`)  
**Rooms** : chaque client rejoint `group:{groupId}` via `socket.emit('join-group', groupId)`  
Toutes les émissions sont ciblées sur la room — pas de broadcast global.

| Événement (client→serveur) | Description |
|---------------------------|-------------|
| `join-group` / `leave-group` | Rejoindre/quitter une room groupe |
| `get-history` | Charger historique (filtre groupId + postitId) |
| `send-message` | Envoyer un message (whitelist des champs) |
| `toggle-message-note` | Basculer message ↔ note eink |
| `toggle-check-line` | Cocher/décocher un item |
| `update-postit-status` | Changer statut pintalk (groupId requis) |

| Événement (serveur→client) | Description |
|---------------------------|-------------|
| `history-data` | Historique des messages |
| `new-message` | Nouveau message (room ciblée) |
| `message-updated` | Mise à jour isNote |
| `line-checked-updated` | Mise à jour checked |
| `postit-status-updated` | Statut changé |
| `session-replaced` | Connexion depuis autre appareil |

---

## 6. Extraction IA (routes/ai.js)

### Pipeline extract-multi

```
rawText
  → _normalizeTextWithAiDictionary()   ← soude mots composés du dico (steak-haché)
  → _isHardNegation()                  ← négation ferme → items:[] sans appel Gemini
  → _isGeminiBlocked() ?               ← rate-limiter (timestamp, pas flag booléen)
  → cache (_geminiCache, TTL 30min)    ← hit → réponse immédiate
  → _respectRateLimit()                ← délai minimum entre appels
  → _callGeminiWithMeta()              ← appel API
       → 429 → _blockGemini(Xs)        ← pause courte (max 120s)
       → succès → cache + items
  → _isDefinitelyAProduct()            ← filtre sécurité post-Gemini
  → _mergeStandaloneQuantities()       ← "3" + "œufs" → "3 œufs"
  → dédoublonnage par _normalizeProductKey()
  → { items, source, understood }
```

### Configuration Gemini (.env)
- `GEMINI_MODEL` : nom du modèle (ex: `gemini-2.5-flash-lite`)
- `GEMINI_API_ENDPOINT` : endpoint API (ex: `https://generativelanguage.googleapis.com/v1beta`)
- `GEMINI_API_KEY` : clé API Google AI Studio
- Si l'un des deux premiers est absent → **fallback NLP uniquement**

### Rate-limiter
- `_geminiBlockedUntil` : timestamp (0 = pas bloqué) — expire automatiquement
- Pas de flag booléen permanent (ancienne `_geminiDailyQuotaHit` supprimée)
- 429 quota/minute → pause 15-120s | 429 quota/jour (retryDelay > 60s) → pause 120s

### Fallback NLP (sans Gemini)
- `_fallbackExtract` → split par articles/prépositions
- `_isLikelyProductText` + `_isDefinitelyAProduct` → double filtre
- `_isLikelyPureConversation` → bulle marquée ⚠️ si aucun produit

---

## 7. Système d'onglets UI

### CSS (`style.css`)
```css
.tabs-bar    /* barre d'onglets : fond blanc, sticky, overflow-y:visible */
.tab-btn     /* bouton onglet : soulignement accent sur actif */
.tab-panel   /* panneau : display:none par défaut, block si .active */
```

### Page Paramètres (#p1)
- Structure : `#p1` flex-column, `overflow:hidden` → seul le panneau actif scroll
- Onglets : Profil | Apparence | Dico IA | Groupe Pro (si owner groupe pro) | À propos
- `switchParamsTab(tabId, btn)` dans `pro-params.js`
- Scroll de la barre : `bar.scrollTo()` ciblé (jamais `scrollIntoView` qui déplace `#viewport`)

### Modals avec onglets
- Modal groupe (`group-modal.js`) : Infos | Tuile | Employés | Clients | Rôles | ⚠️
- Modal pintalk (`postits.js`) : Infos | Apparence | Participants | ⚠️
- `switchModalTab(modalId, tabId, btn)` dans `pro-params.js`

---

## 8. Sélection visuelle des tuiles

### Principe
La sélection **ne modifie jamais les couleurs** des tuiles — elle utilise :
- `outline: 3px solid var(--accent)` avec `outline-offset: 3px` (hors flux)
- `transform: scale(1.03)` avec `transition`
- `z-index: 10` + `overflow: visible`

### Tuiles groupe (`tile-select.js`)
- `MutationObserver` sur `#p2` avec debounce 150ms (passe après `setDefaultTileShape`)
- Délégation de clic avec `capture:true` pour retour visuel immédiat
- Reconfirmation à 400ms et 800ms après le clic (couvre les renders asynchrones)

### Tuiles pintalk (`app.js` + `postits.js`)
- Couleurs perso conservées même si actif (`ptBg`/`ptColor` ne dépendent plus de `isActive`)
- `outline` et `scale` appliqués via style inline sur la tuile active

---

## 9. Groupes Pro — Rôles & Droits

### Rôles (modèle `Role`)
Créés par le propriétaire, attribuables aux employés. Droits cumulatifs.

| Droit | Description |
|-------|-------------|
| `creer_commande` | Créer des pintalk/commandes pour des clients |
| `modifier_produit_coche` | Modifier/supprimer un produit coché |
| `ticket_caisse` | Déclarer une commande "Ticket de caisse prêt" |
| `gerer_membres` | Ajouter/retirer des clients, voir les membres |
| `voir_brouillons` | Voir les commandes en statut brouillon |
| `ajouter_client` | Inviter un client dans le groupe |

### Vue pile employé/proprio (`pro-queue.js`)
- Filtres combinables : N° commande, nom, téléphone, email, date livraison
- Options : voir brouillons, voir terminées (avec période obligatoire)
- Tri : en préparation en premier, puis par date de livraison
- Actions contextuelles selon statut + droits

### Accès client
- Via invitation email (owner ou employé avec `ajouter_client`)
- Via scan QR code (URL contenant le `joinCode` du groupe)
- Max 4 commandes ouvertes simultanément

---

## 10. Archivage des conversations

### Archiver & vider (`POST /api/postits/:id/archive-clear`)
1. Sauvegarde tous les messages dans `Archive` (format enrichi avec métadonnées)
2. Supprime les messages du pintalk
3. Le pintalk reste intact (participants, statut, paramètres)

### Restaurer (`POST /api/archives/:id/restore`)
- Si < 4 pintalk ouverts → option créer un nouveau pintalk
- Si = 4 pintalk ouverts → choisir un pintalk existant
- Les `checked` sont remis à zéro à la restauration

---

## 11. Confirmation suppression par code email

### Flux
1. Clic "Supprimer" → `requestDeleteConfirm(type, targetId, targetName, onSuccess)`
2. `POST /api/delete-confirm/request` → génère code 6 chiffres (TTL 10min), envoie email
3. Modal saisie code → `POST /api/delete-confirm/execute` → vérifie + supprime (cascade)

### En développement
Si `NODE_ENV !== 'production'`, le code est retourné dans la réponse JSON (`devCode`) pour tester sans email.

---

## 12. Script utilitaires

### reset-db.js
```bash
node reset-db.js                  # Reset complet (confirmation "OUI" requise)
node reset-db.js --status         # Statistiques sans modification
node reset-db.js --dry-run        # Simulation
node reset-db.js --keep-users     # Reset sans les comptes utilisateurs
node reset-db.js --keep-dict      # Reset sans le dictionnaire IA
node reset-db.js --only-messages  # Vide uniquement les messages
```

---

## 13. Points d'attention / Pièges connus

| Sujet | Détail |
|-------|--------|
| **API Gemini v1beta** | Utiliser `/v1beta` (pas `/v1`). En v1 : `system_instruction` en snake_case, `responseMimeType` absent. En v1beta : `systemInstruction` en camelCase accepté. |
| **Quota Gemini free tier** | `gemini-2.5-flash-lite` : ~1500 RPD. Quota par projet Google Cloud, pas par clé. |
| **Socket rooms** | `join-group` doit être émis dès `socket.on('connect')` + à chaque changement de groupe |
| **scrollIntoView** | Ne jamais utiliser sur les éléments dans `#viewport` — ça déplace toutes les pages. Utiliser `element.scrollTo()` ciblé. |
| **history-data flag** | `window._historyJustLoaded = true` pendant 2s après réception → bloque `aiAutoExtract` sur les anciens messages |
| **isActive couleurs** | Ne jamais écraser `tColor`/`ptBg` avec `var(--accent)` quand `isActive`. Utiliser `outline` + `scale`. |
| **_geminiDailyQuotaHit** | Supprimé. Remplacé par `_geminiBlockedUntil` (timestamp expirant automatiquement). |
| **MutationObserver tiles** | Observer `#p2` (pas `#groups-grid`) avec debounce 150ms pour passer après `setDefaultTileShape`. |
