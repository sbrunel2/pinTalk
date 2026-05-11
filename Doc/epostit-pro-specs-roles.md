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

### 2.2 Règles d'accès aux Pintalk

- Par défaut, tous les membres du groupe ont accès à tous les pintalk du groupe
- Un propriétaire peut **restreindre** un pintalk à une liste nominative (`allowedEmails`)
  - Si `allowedEmails` est non vide, seuls les utilisateurs listés y ont accès
  - Le propriétaire conserve toujours l'accès, qu'il soit dans `allowedEmails` ou non
- Un propriétaire peut **inviter un utilisateur extérieur** au groupe sur un pintalk précis
  - Cet utilisateur voit le groupe dans sa liste de groupes (accès limité à ce pintalk uniquement)
  - Il n'est pas membre du groupe — il ne voit pas les autres pintalk

### 2.3 Limites

- **Maximum 4 pintalk** par groupe perso
- Une fois 4 pintalk créés, la tuile `+` disparaît pour le propriétaire
- Cette limite est gérée côté UI (bouton masqué) — **à enforcer également côté API** (`POST /api/postits`)

### 2.4 Interface — Page Groupes

- Affiche tous les groupes auxquels l'utilisateur a accès :
  - Groupes dont il est propriétaire
  - Groupes dont il est membre
  - Groupes dont il est membre d'un pintalk uniquement (invitation nominative)
- Chaque groupe est représenté par une tuile personnalisable (couleur, forme, logo, police)
- Les tuiles sont réorganisables par drag & pinch

### 2.5 Interface — Page Chat (dans un groupe)

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
- Ne peut pas déclarer "Ticket de caisse prêt" (propriétaire uniquement)

#### Client (`client`)
- Ajouté au groupe par le propriétaire (ou employé si droit accordé)
- Ne voit que les pintalk dont il est propriétaire (`ownerEmail`) au sein du groupe
- Peut créer ses propres commandes (pintalk), dans la limite de **4 commandes ouvertes simultanément**
  - Une commande "ouverte" = statut autre que `terminée` ou `annulée`
- Peut inviter d'autres personnes à participer à ses propres commandes
  - Ne peut pas retirer le propriétaire du groupe ni les employés de ses commandes
- Peut supprimer ses commandes sous conditions (voir §3.4 Cycle de vie)
- Peut modifier le contenu de ses commandes sous conditions (voir §3.4 Cycle de vie)

### 3.2 Droits configurables par le propriétaire (Employés)

| Droit | Description | Défaut |
|---|---|---|
| Créer des commandes | L'employé peut créer des pintalk pour des clients | ❌ |
| Accès à un pintalk | Accordé pintalk par pintalk par le propriétaire | ❌ |
| Modifier/supprimer un produit coché | Peut intervenir sur les produits en cours de préparation | ❌ |

> 🔲 D'autres droits pourront être ajoutés lors de la suite du descriptif.

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

> 🔲 À compléter — suite du descriptif.

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
| Quitter le groupe | — | ✅ |

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
| Inviter sur un pintalk | ✅ | ❌ | ✅ (ses commandes, sans retirer owner/employé) |
| Modifier produits (non cochés) | ✅ | ✅ | ✅ (si commande non en préparation) |
| Modifier produits (cochés) | ✅ | ⚙️ si droit | ❌ |
| Supprimer une commande | ✅ | ❌ | ✅ (si statut `brouillon` ou `validée`) |
| Démarrer la préparation | ✅ | ✅ | ❌ |
| Cocher produits (e-ink) | ✅ | ✅ | ❌ |
| Déclarer "Ticket de caisse prêt" | ✅ | ❌ | ❌ |
| Supprimer le groupe | ✅ | ❌ | ❌ |

> ⚙️ = conditionnel selon droits accordés par le propriétaire

---

## 5. Notes d'implémentation

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
