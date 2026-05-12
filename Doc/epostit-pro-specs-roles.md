# e-Postit Pro — Spécifications fonctionnelles : Rôles & Permissions

> Document de référence pour le développement et la reprise du projet.
> À compléter avec la partie Groupes Professionnels.

---

## 1. Vue d'ensemble

e-Postit Pro distingue deux types de groupes, avec des règles de rôles et d'accès différentes :

| Type | Cas d'usage | Rôles |
|---|---|---|
| **Perso** | Famille, amis, usage domestique | Propriétaire / Membre |
| **Pro** | Commerce, équipe professionnelle | Propriétaire / Employé / Client |

---

## 2. Groupes Particuliers (`type: 'perso'`)

### 2.1 Rôles

#### Propriétaire (`owner`)
- Crée le groupe
- Peut inviter des membres dans le groupe (via lien ou email)
- Peut retirer un membre du groupe
- Peut inviter un utilisateur extérieur au groupe sur un pintalk spécifique
- Peut retirer un membre d'un pintalk spécifique tout en le conservant dans le groupe
- Est le seul à pouvoir créer de nouveaux pintalk dans le groupe
- Est le seul à voir la tuile `+` de création de pintalk
- Peut supprimer le groupe

#### Membre
- Rejoint un groupe sur invitation du propriétaire
- Accède à tous les pintalk du groupe (sauf restriction explicite du propriétaire)
- Peut participer aux conversations (chat) de tous les pintalk auxquels il a accès
- Ne peut pas créer de nouveau pintalk
- Ne peut pas inviter d'autres membres dans le groupe
- Ne peut pas gérer les accès des autres membres

> **Note schéma** : Le schéma `Permission` en base contient `role ('admin'|'employe'|'client')` hérité du modèle pro. Pour les groupes perso, seuls deux statuts existent : `owner` (stocké dans `Group.ownerEmail`) et `membre` (entrée Permission sans rôle pro). Le rôle `admin` n'existe pas en contexte perso et ne doit pas être assigné.

### 2.2 Règles d'accès aux Pintalk

- Par défaut, tous les membres du groupe ont accès à tous les pintalk du groupe
- Un propriétaire peut **restreindre** un pintalk à une liste nominative (`allowedEmails`)
  - Si `allowedEmails` est non vide, seuls les utilisateurs listés y ont accès
  - Le propriétaire conserve toujours l'accès, qu'il soit dans `allowedEmails` ou non
- Un propriétaire peut **inviter un utilisateur extérieur** au groupe sur un pintalk précis — cet utilisateur obtient le statut **`membre-pintalk`** :
  - Il voit le groupe dans sa liste de groupes
  - Il n'accède qu'aux pintalk sur lesquels il est explicitement invité
  - Il ne voit pas les autres pintalk du groupe
  - Si le propriétaire le retire du pintalk, ce pintalk disparaît de sa vue
  - Si il n'est plus membre-pintalk d'aucun pintalk du groupe, le groupe disparaît également de sa liste de groupes
- Seul le propriétaire peut modifier les droits et la liste des membres d'un pintalk

### 2.3 Personnalisation visuelle

| Élément | Qui peut modifier | Portée |
|---|---|---|
| Nom du groupe | Propriétaire uniquement | Identique pour tous |
| Logo du groupe | Propriétaire uniquement | Identique pour tous |
| Couleur de la tuile groupe | Chaque membre pour lui-même | Propre à chaque utilisateur |
| Forme de la tuile groupe | Chaque membre pour lui-même | Propre à chaque utilisateur |
| Couleur des tuiles pintalk | Chaque membre pour lui-même | Propre à chaque utilisateur |
| Forme des tuiles pintalk | Chaque membre pour lui-même | Propre à chaque utilisateur |
| Membres et droits d'un pintalk | Propriétaire uniquement | — |

### 2.4 Limites

- **Maximum 4 pintalk** par groupe perso
- Une fois 4 pintalk créés, la tuile `+` disparaît pour le propriétaire
- Cette limite est gérée côté UI (bouton masqué) — **à enforcer également côté API** (`POST /api/postits`)

### 2.5 Cycle de vie du groupe et du propriétaire

#### Suppression du groupe
- Seul le propriétaire peut supprimer son groupe
- Le propriétaire **ne peut pas quitter** son groupe — il doit soit le supprimer, soit le transférer
- La suppression entraîne la suppression de **tous les pintalk et tous les messages** associés
- Tous les membres (et membres-pintalk) perdent l'accès immédiatement

#### Transfert de propriété
- Le propriétaire peut transférer son groupe à un membre existant
- Le membre désigné devient le nouveau propriétaire du groupe
- L'ancien propriétaire devient **membre** du groupe — le nouveau propriétaire peut le conserver ou le retirer
- Cette action est irréversible sauf si le nouveau propriétaire effectue un retransfert

#### Suppression de compte
- Si un propriétaire supprime son compte, ses groupes sont supprimés (avec tous leurs pintalk)
- *Alternative à envisager* : proposer le transfert avant suppression définitive du compte

### 2.6 Interface — Page Groupes

- Affiche tous les groupes auxquels l'utilisateur a accès :
  - Groupes dont il est propriétaire
  - Groupes dont il est membre
  - Groupes dont il est membre d'un pintalk uniquement (invitation nominative)
- Chaque groupe est représenté par une tuile personnalisable (couleur, forme, logo, police)
- Les tuiles sont réorganisables par drag & pinch

### 2.7 Interface — Page Chat (dans un groupe)

- À l'entrée dans un groupe, l'utilisateur arrive sur le **dernier pintalk consulté** dans ce groupe (mémorisé par `localStorage`)
- Si aucun historique, le premier pintalk de la liste est sélectionné
- Le header affiche :
  - À gauche : bouton retour `← [Nom du groupe]` (style onglet surélevé, accent color en haut)
  - À droite : les tuiles pintalk auxquels l'utilisateur a accès, scrollables horizontalement
  - La tuile `+` (création pintalk) visible uniquement pour le propriétaire, et uniquement si < 4 pintalk
- Chaque membre peut personnaliser l'apparence visuelle de ses propres tuiles pintalk (couleur, forme, logo) — ces préférences sont propres à chaque utilisateur

---

## 3. Groupes Professionnels (`type: 'pro'`)

> 🔲 Partiellement complété — description du cycle de vie d'une commande en cours de rédaction.

### 3.1 Rôles

Un groupe pro comporte trois rôles : **Propriétaire**, **Employé**, **Client**.

#### Propriétaire (`owner`)
- Crée et administre le groupe (champs entreprise : SIRET, adresse, logo, téléphone pro, email pro)
- Peut ajouter et retirer des employés
- Peut ajouter et retirer des clients
- Peut accorder ou révoquer des droits spécifiques aux employés (voir §3.2)
- Peut créer des commandes (pintalk) pour le compte d'un client
- A accès à **tous** les pintalk du groupe sans exception
- Peut participer au chat de n'importe quel pintalk
- Peut modifier ou supprimer un produit sur une commande, quel que soit son état
- Peut déclarer une commande **"Ticket de caisse prêt"**
- Peut préparer des commandes (cocher les produits dans l'e-ink)

#### Employé (`employe`)
- Ajouté au groupe par le propriétaire
- Ses droits sont configurables individuellement par le propriétaire :
  - **Droit de créer des commandes** : peut créer des pintalk pour des clients
  - **Droit d'accès à un pintalk** : le propriétaire peut donner ou retirer l'accès à un pintalk précis
- Par défaut, un employé **ne voit pas** les commandes non validées (statut `brouillon`)
- Peut préparer des commandes (statut `validée` requis) : déclare le début de préparation → statut `en cours de préparation`
- Peut cocher les produits dans l'e-ink au fur et à mesure de la préparation
- Peut modifier ou supprimer un produit **coché** (en cours de préparation) si le propriétaire lui en a accordé le droit
- Ne peut pas supprimer une commande
- Peut déclarer "Ticket de caisse prêt" si le droit `ticket_caisse` lui est accordé

#### Client (`client`)
- Ajouté au groupe par le propriétaire (ou employé si droit accordé)
- Ne voit que les pintalk dont il est propriétaire (`ownerEmail`) au sein du groupe
- Peut créer ses propres commandes (pintalk), dans la limite de **4 commandes ouvertes simultanément**
  - Une commande "ouverte" = statut autre que `terminée` ou `annulée`
- Peut inviter d'autres personnes à participer à ses propres commandes (clients du groupe ou personnes extérieures au groupe)
  - La personne invitée obtient le statut **co-client** du pintalk : elle a exactement les mêmes droits que le client d'origine sur ce pintalk (ajout/modification produits, validation, suppression selon état)
  - C'est un **partage à droits égaux** — il n'y a pas de hiérarchie entre le client d'origine et ses co-clients
  - Tous les co-clients peuvent à leur tour inviter d'autres personnes sur ce pintalk
  - Ne peut pas retirer le propriétaire du groupe ni les employés de ses commandes
  - Un co-client peut quitter un pintalk ; le client d'origine ne peut pas retirer un co-client (seul le propriétaire du groupe le peut)
  - **Cas particulier — employé invité comme co-client** : un employé invité sur un pintalk cumule ses deux statuts. Il conserve l'intégralité de ses droits employé (préparer, cocher les produits, déclarer ticket de caisse si droit accordé) ET acquiert en plus les droits co-client (modifier produits non cochés, valider la commande, etc.). C'est toujours le droit le plus permissif qui s'applique sur chaque action.
- Peut supprimer ses commandes sous conditions (voir §3.4 Cycle de vie)
- Peut modifier le contenu de ses commandes sous conditions (voir §3.4 Cycle de vie)

### 3.2 Système de rôles et droits (Employés)

Les droits des employés sont gérés via un **système de rôles** (groupes de droits) défini par le propriétaire du groupe. Chaque employé peut se voir attribuer un ou plusieurs rôles.

#### Rôles prédéfinis (créés automatiquement à la création du groupe pro)

| Rôle | Description | Droits inclus |
|---|---|---|
| `admin` | Administration complète | Tous les droits sauf suppression du groupe |
| `preparateur` | Préparation de commandes uniquement | Voir commandes validées, démarrer préparation, cocher produits |
| `caisse` | Gestion de la caisse uniquement | Déclarer "Ticket de caisse prêt" |

#### Droits disponibles (granulaires)

| Droit | Description |
|---|---|
| `creer_commande` | Créer des pintalk (commandes) pour des clients |
| `acces_pintalk` | Accès à un pintalk spécifique (accordé pintalk par pintalk) |
| `modifier_produit_coche` | Modifier ou supprimer un produit coché en cours de préparation |
| `preparer_commande` | Déclarer le début de préparation + cocher les produits |
| `ticket_caisse` | Déclarer une commande "Ticket de caisse prêt" |
| `gerer_employes` | Ajouter des employés et leur attribuer des rôles (droit admin) |

#### Règles de gestion des rôles

- Le **propriétaire** peut créer, modifier et supprimer des rôles personnalisés pour son groupe
- Le **propriétaire** associe chaque employé à un ou plusieurs rôles
- Un employé ayant le rôle `admin` peut :
  - Ajouter des employés au groupe
  - Attribuer des rôles aux employés (sauf le rôle propriétaire)
  - **Ne peut pas** se donner des droits supérieurs à ceux qu'il possède lui-même
- Un employé ne peut **jamais** devenir propriétaire du groupe sauf transfert explicite
- Le **transfert de propriété** est une action réservée exclusivement au propriétaire actuel :
  - Il désigne un employé comme nouveau propriétaire
  - L'ancien propriétaire devient employé avec rôle `admin` (ou rôle défini par le nouveau propriétaire)
  - Cette action est irréversible sauf si le nouveau propriétaire effectue un retransfert

#### Interface de gestion des rôles

Une interface dédiée (accessible depuis les paramètres du groupe pro) permet au propriétaire (et aux admins) de :
- Voir la liste des rôles existants du groupe
- Créer un nouveau rôle en sélectionnant les droits souhaités parmi la liste des droits disponibles
- Modifier un rôle existant (changer son nom, ses droits)
- Supprimer un rôle (les employés qui l'avaient se retrouvent sans ce rôle)
- Attribuer / retirer des rôles à chaque employé
- Voir pour chaque employé la liste de ses rôles actifs et le cumul de ses droits effectifs

### 3.3 Limites

- **Pas de limite** de nombre de pintalk pour les groupes pro (contrairement aux groupes perso)
- **Maximum 4 commandes ouvertes** par client simultanément
- Une commande "ouverte" = tout statut sauf `terminée` ou `annulée`

### 3.4 Cycle de vie d'une commande (Pintalk)

#### États et transitions

```
[brouillon] → [validée] → [en cours de préparation] → [prête] → [ticket de caisse]
     ↓              ↓
[annulée]      [annulée]
```

#### Détail des états

**`brouillon`** *(état initial)*
- Pintalk créé, le client y ajoute ses produits librement
- Visible uniquement par le propriétaire et le client propriétaire du pintalk
- Les employés ne voient pas les commandes en `brouillon` par défaut
- Le client peut :
  - Ajouter / modifier / supprimer des produits librement
  - Supprimer la commande
- Le propriétaire peut :
  - Accéder à la commande et y participer
  - Supprimer la commande

**`validée`**
- Le client valide le contenu → doit obligatoirement choisir une **date de livraison**
- La commande devient visible par les employés
- Le client peut encore :
  - Modifier le contenu (ajouter/modifier/supprimer des produits)
  - Modifier la date de livraison
  - Supprimer la commande
- La validation n'est pas bloquante : le client conserve toutes ses options

**`en cours de préparation`**
- Un employé (ou le propriétaire) déclare commencer la préparation
- Le client **ne peut plus** :
  - Supprimer la commande
  - Modifier la date de livraison
- Le client **peut encore** :
  - Ajouter des produits à la commande
- Au fur et à mesure de la préparation, l'employé **coche les produits** dans l'e-ink :
  - Un produit coché est **verrouillé pour le client** — il ne peut plus le modifier ni le supprimer
  - Seuls le propriétaire du groupe et l'employé (si droit accordé) peuvent modifier ou supprimer un produit coché

**`prête`** *(à définir — suite du descriptif)*

**`ticket de caisse`** *(à définir — suite du descriptif)*
- Déclaré par le propriétaire uniquement

**`terminée`** / **`annulée`** *(à définir — suite du descriptif)*

### 3.5 Interface

> 🔲 À compléter — interface et détails UX à définir lors de la suite du descriptif.

### 3.6 Spécificités pro

- Champs entreprise : SIRET, raison sociale, adresse (addr1, addr2, cp, ville), téléphone pro, email pro, logo
- Abonnement Stripe (`stripeSubscriptionId`, `subscriptionStatus`) — schéma en place, intégration non active
- Pas de limite de pintalk (contrairement aux groupes perso)

---

## 4. Tableau récapitulatif des permissions

### Groupes Particuliers

| Action | Propriétaire | Membre |
|---|---|---|
| Créer un groupe | ✅ | — |
| Inviter un membre dans le groupe | ✅ | ❌ |
| Retirer un membre du groupe | ✅ | ❌ |
| Créer un pintalk | ✅ (max 4) | ❌ |
| Accéder à tous les pintalk du groupe | ✅ | ✅ |
| Inviter un utilisateur sur un pintalk | ✅ | ❌ |
| Retirer un utilisateur d'un pintalk | ✅ | ❌ |
| Participer au chat d'un pintalk | ✅ | ✅ (si accès) |
| Personnaliser l'apparence de ses tuiles | ✅ | ✅ |
| Supprimer un pintalk | ✅ | ❌ |
| Supprimer le groupe | ✅ | ❌ |
| Quitter le groupe | ❌ (doit supprimer ou transférer) | ✅ |
| Transférer la propriété du groupe | ✅ | ❌ |
| Inviter un membre-pintalk (externe) | ✅ | ❌ |
| Retirer un membre-pintalk d'un pintalk | ✅ | ❌ |

### Groupes Professionnels

| Action | Propriétaire | Employé | Client |
|---|---|---|---|
| Créer le groupe | ✅ | — | — |
| Ajouter / retirer un employé | ✅ | ❌ | ❌ |
| Ajouter / retirer un client | ✅ | ⚙️ si droit | ❌ |
| Configurer les droits d'un employé | ✅ | ❌ | ❌ |
| Créer une commande (pintalk) | ✅ | ⚙️ si droit | ✅ (max 4 ouvertes) |
| Voir toutes les commandes du groupe | ✅ | ⚙️ par pintalk | ❌ (ses commandes uniquement) |
| Voir les commandes `brouillon` | ✅ | ❌ | ✅ (les siennes) |
| Voir les commandes `validée` et + | ✅ | ✅ (si accès) | ✅ (les siennes) |
| Participer au chat d'un pintalk | ✅ | ⚙️ si accès accordé | ✅ (ses commandes) |
| Inviter un co-client sur un pintalk | ✅ | ❌ | ✅ (ses commandes + co-clients peuvent aussi inviter) |
| Modifier produits (non cochés) | ✅ | ✅ | ✅ (si commande non en préparation) |
| Droits du co-client sur un pintalk | — | — | = droits du client d'origine |
| Retirer un co-client d'un pintalk | ✅ | ❌ | ❌ (peut quitter, pas retirer) |
| Modifier produits (cochés) | ✅ | ⚙️ si droit | ❌ |
| Supprimer une commande | ✅ | ❌ | ✅ (si statut `brouillon` ou `validée`) |
| Démarrer la préparation | ✅ | ✅ | ❌ |
| Cocher produits (e-ink) | ✅ | ✅ | ❌ |
| Déclarer "Ticket de caisse prêt" | ✅ | ⚙️ si droit `ticket_caisse` | ❌ |
| Supprimer le groupe | ✅ | ❌ | ❌ |
| Transférer la propriété du groupe | ✅ | ❌ | ❌ |
| Gérer les rôles du groupe | ✅ | ⚙️ si rôle `admin` | ❌ |
| Ajouter un employé | ✅ | ⚙️ si rôle `admin` | ❌ |

> ⚙️ = conditionnel selon droits accordés par le propriétaire
> Les droits se cumulent quand un employé a plusieurs rôles.

---

## 5. Notes d'implémentation

### Point d'attention — schéma `Permission` et rôles dynamiques pro

Le schéma actuel `Permission` contient un champ `role` de type `String` avec une valeur fixe parmi `('admin'|'employe'|'client')`. Ce modèle est insuffisant pour les groupes pro qui ont besoin de rôles dynamiques configurables par groupe.

**Ce qu'il faudra faire avant d'implémenter la partie pro :**
- Créer une collection `Role` : `{ groupId, name, droits: [String], isDefault: Boolean }`
- Modifier le schéma `Permission` pour référencer un ou plusieurs rôles : `{ groupId, userEmail, roles: [ObjectId → Role], type: ('owner'|'employe'|'client'|'membre'|'membre-pintalk') }`
- Les droits effectifs d'un employé = union de tous les droits de ses rôles
- Pour les groupes perso, le champ `roles` est vide — seul `type` compte (`owner` ou `membre`)

Ce changement de schéma est **significatif** et doit être anticipé avant tout développement de la partie pro.

### État actuel du code

| Règle | UI | API |
|---|---|---|
| Max 4 pintalk perso | ✅ bouton `+` masqué | ❌ non enforced |
| Création pintalk owner only | ✅ `canCreate = myRole === 'owner'` | ❌ non enforced |
| Accès pintalk par `allowedEmails` | ✅ filtrage client | ✅ filtrage serveur |
| Invitation nominative sur pintalk | ✅ | ✅ |
| Mémorisation dernier pintalk | ✅ `localStorage` | — |
| Session unique par user | — | ✅ `_userSockets` Map |

### Points à implémenter côté API
- Vérifier `type === 'perso'` + comptage pintalk existants avant `POST /api/postits`
- Vérifier rôle `owner` avant création pintalk dans groupe perso
