# DECISIONS.md
> **Architecture Decision Records** — Choix immuables du projet
> Version 1.0 — 2026-07-10

---

## 📋 FORMAT DES DÉCISIONS

Chaque décision suit ce format :

```markdown
## Décision XXX — [Titre]

**Contexte** : [Pourquoi cette décision ?]

**Options considérées** :
- Option 1 : [description]
- Option 2 : [description]

**Décision** : [Quoi]

**Justification** : [Pourquoi ce choix]

**Conséquences** : [Impacts]

**Date** : YYYY-MM-DD

---
```

---

## 🏗️ DÉCISIONS ARCHITECTURALES

### Décision 001 — Framework Frontend

**Contexte** : Choix du framework pour le frontend du portail.

**Options considérées** :
- Next.js : Très populaire, bon SEO, mais lourd et complexe
- Nuxt.js : Similaire à Next, mais moins mature pour les sites statiques
- Astro : Léger, rapide, parfait pour les sites statiques avec îlots interactifs
- Gatsby : Bon pour le statique, mais écosystème React moins adapté
- SvelteKit : Excellent, mais moins mature pour le SSG

**Décision** : **Astro 4**

**Justification** :
- Site principalement statique avec quelques îlots interactifs (carte, graphiques)
- Performance exceptionnelle (Lighthouse > 90 facile)
- Intégration naturelle avec Svelte pour les composants interactifs
- SEO optimal (SSG par défaut)
- Simplicité de déploiement (fichiers statiques)

**Conséquences** :
- Pas de serveur Node.js nécessaire pour le frontend
- Déploiement simple sur tout hébergement statique
- Intégration possible de React/Vue/Svelte/Preact
- Necessite un build avant déploiement

**Date** : 2026-07-08

---

### Décision 002 — Base de données

**Contexte** : Choix de la base de données pour stocker les données géographiques et métiers.

**Options considérées** :
- PostgreSQL + PostGIS : Solution complète pour les données spatiales
- MongoDB : Flexible, mais pas de support natif pour les requêtes spatiales
- SQLite : Simple, mais pas adapté pour les données géo complexes
- MySQL : Bon pour les données relationnelles, mais PostGIS moins mature
- Cloud (Supabase) : Solution hébergée, mais perte de contrôle et coût

**Décision** : **PostgreSQL 16 + PostGIS 3.4** (self-hosted)

**Justification** :
- PostGIS est le standard pour les données géospatiales open source
- requêtes spatiales optimisées (index GIST, R-tree)
- Open source, mature, communauté active
- Compatible avec Docker pour un déploiement facile
- Permet de stocker à la fois les géométries et les métadonnées

**Conséquences** :
- Nécessite une gestion serveur (Docker Compose simplifie cela)
- courbe d'apprentissage pour les requêtes spatiales
- Mais : meilleure performance pour les requêtes géo

**Date** : 2026-07-08

---

### Décision 003 — Framework Backend API

**Contexte** : Choix du framework pour l'API REST qui sert les données.

**Options considérées** :
- Express : Très populaire, mais manque de structure par défaut
- Fastify : Performant, typé, moderne, conçu pour les API
- NestJS : Très structuré, mais complexe pour un projet de cette taille
- Hono : Léger et moderne, mais moins mature
- tRPC : Excellente intégration avec le frontend, mais moins adapté pour une API publique

**Décision** : **Fastify**

**Justification** :
- Performance native (benchmarks > Express)
- Support TypeScript de première classe
- Validation des schemas intégrée (via JSON Schema)
- Léger et rapide à démarrer
- Bon écosystème de plugins

**Conséquences** :
- Code plus verbos que Express pour les routes simples
- Mais : meilleure validation et documentation automatique

**Date** : 2026-07-08

---

### Décision 004 — Librairie de cartographie

**Contexte** : Choix de la librairie pour la carte interactive.

**Options considérées** :
- Leaflet : Simple, léger, mais limité pour les cartes complexes
- OpenLayers : Puissant, mais complexe et lourd
- Mapbox GL JS : Excellent, mais licence commerciale pour certains usages
- MapLibre GL JS : Fork open source de Mapbox GL JS
- Deck.gl : Pour la visualisation avancée, mais surcouche inutile

**Décision** : **MapLibre GL JS**

**Justification** :
- Toutes les fonctionnalités nécessaires (3D, couches vectorielles, styles personnalisés)
- Open source (Licence BSD)
- Compatible avec les tuiles IGN (WMTS)
- Bonne performance même avec de nombreuses couches
- Documentation complète

**Conséquences** :
- Bundle plus lourd que Leaflet (~1MB)
- Mais : bien plus puissant pour les visualisations géo

**Date** : 2026-07-08

---

### Décision 005 — Orchestration

**Contexte** : Comment orchestrer les différents services (API, frontend, DB, worker).

**Options considérées** :
- Docker Compose : Simple, adapté pour le développement et la production
- Kubernetes : Puissant, mais complexe pour un petit projet
- Serverless (Cloudflare/Netlify) : Simple, mais coût et vendor lock-in
- PM2 : Bon pour Node.js, mais pas pour PostgreSQL
- Systemd : Native, mais configuration complexe

**Décision** : **Docker Compose**

**Justification** :
- Parfait pour un projet avec 4-5 services
- Configuration déclarative (YAML)
- Identique en dev et en prod
- Facile à maintenir et à comprendre
- Intégration native avec Caddy pour le reverse proxy

**Conséquences** :
- Nécessite Docker installé sur le serveur
- Mais : déploiement très simple (`docker compose up -d`)

**Date** : 2026-07-08

---

### Décision 006 — Reverse Proxy

**Contexte** : Choix du reverse proxy pour le routing et HTTPS.

**Options considérées** :
- Nginx : Très populaire, mais configuration complexe
- Apache : Mature, mais lourd
- Traefik : Moderne, mais configuration complexe
- Caddy : Simple, HTTPS automatique, configuration facile
- HAProxy : Performant, mais plutôt pour le load balancing

**Décision** : **Caddy 2**

**Justification** :
- HTTPS automatique avec Let's Encrypt (pas de configuration manuelle)
- Configuration très simple (Caddyfile)
- Bonnes performances
- Support WebSocket natif
- Image Docker officielle maintenue

**Conséquences** :
- Moins flexible que Nginx pour les cas complexes
- Mais : parfait pour un projet de cette taille

**Date** : 2026-07-08

---

## 🗺️ DÉCISIONS GÉOGRAPHIQUES

### Décision 007 — Fond de carte

**Contexte** : Choix du fond de carte pour la visualisation.

**Options considérées** :
- OpenStreetMap : Gratuit, ODbL, mais style basique
- IGN (Géoportail) : Officiel, très précis, gratuit pour usage non commercial
- Google Maps : Très précis, mais licence commerciale
- Mapbox : Excellent, mais coût à partir d'un certain volume

**Décision** : **IGN WMTS (Géoportail)**

**Justification** :
- Données officielles françaises (meilleure précision)
- Plusieurs couches disponibles : PLANIGNV2, ORTHOPHOTOS, ELEVATION.SLOPES
- Gratuit pour usage public/non commercial
- Pas de clé API nécessaire
- Tuiles déjà en EPSG:3857 (PM)

**Conséquences** :
- Respect de l'attribution obligatoire (© IGN)
- Limite de 5 requêtes/seconde/IP (à gérer via cache)

**Date** : 2026-07-08

---

### Décision 008 — Projection cartographique

**Contexte** : Choix de la projection pour la carte.

**Options considérées** :
- EPSG:4326 (WGS84) : Standard GPS, mais déformation pour la France
- EPSG:3857 (Web Mercator) : Standard web, utilisé par IGN WMTS
- EPSG:2154 (RGF93 / Lambert-93) : Projection officielle française

**Décision** : **EPSG:3857 (Web Mercator, alias PM)**

**Justification** :
- Compatible avec IGN WMTS (LAER:PM)
- Standard de facto pour les cartes web
- MapLibre GL JS a un support natif
- Les déformations sont acceptables pour une carte interactive grand public

**Conséquences** :
- Les coordonnées doivent être converties depuis WGS84 (EPSG:4326) vers PM
- Mais : c'est transparent avec les outils modernes

**Date** : 2026-07-08

---

## 📊 DÉCISIONS DONNÉES

### Décision 009 — Stratégie d'intégration des données

**Contexte** : Comment intégrer les données de sources externes.

**Options considérées** :
- Tout en runtime : Appels directs depuis le frontend → Risque de CORS et quota
- Tout en build-time : Génération statique → Données pas à jour
- Hybride : Mix des deux selon la fraîcheur des données

**Décision** : **Stratégie hybride en 3 niveaux**

**Justification** :
- **Build-time** : Données stables (annuelles/trimestrielles) → respect du fair-use
- **Runtime** : Données live (météo, débits) → via worker + serverless
- **Client-side** : Données tuilées (WMTS) → cache navigateur

**Conséquences** :
- Complexité légèrement accrue
- Mais : meilleur respect des API publiques + données toujours fraîches quand nécessaire

**Date** : 2026-07-08

---

### Décision 010 — Stockage des données statiques

**Contexte** : Où stocker les données fetchées en build-time.

**Options considérées** :
- Directement dans le code (import JSON) : Simple, mais difficile à maintenir
- Dans la base de données : Centralisé, mais nécessite DB même pour le statique
- Fichiers JSON dans `/data` : Simple, versionnable, facile à déployer
- Git LFS : Pour les gros fichiers, mais complexe

**Décision** : **Fichiers JSON dans `apps/web/src/data/`**

**Justification** :
- Les données sont versionnées avec le code
- Pas de dépendance à la DB pour le frontend
- Déploiement simple (fichiers statiques)
- Facile à inspecter et modifier

**Conséquences** :
- Les gros fichiers (>10MB) pourraient poser problème
- Mais : nos données sont < 1MB chacune

**Date** : 2026-07-08

---

## 🔧 DÉCISIONS TECHNIQUES COMPLÉMENTAIRES

### Décision 011 — Gestion des erreurs API externes

**Contexte** : Comment gérer les erreurs des API publiques.

**Décision** : **Ne jamais exposer l'erreur brute à l'utilisateur**

**Justification** :
- Les messages d'erreur des API publiques sont souvent techniques et peu clairs
- Risque de fuite d'informations sensibles
- Meilleure expérience utilisateur avec des messages adaptés

**Implémentation** :
- Toujour wrappper les appels dans try/catch
- Retourner un message utilisateur clair
- Logger l'erreur technique côté serveur

**Date** : 2026-07-08

---

### Décision 012 — User-Agent pour les API publiques

**Contexte** : Certaines API (HubEau) bloquent les user-agents atypiques.

**Décision** : **Utiliser un User-Agent serveur standard**

**User-Agent** : `OpenDataVdA/1.0 (+https://opendata.valdaigoual.fr)`

**Justification** :
- Évite les blocages par le WAF
- Identifie clairement le projet
- Respect des bonnes pratiques

**Date** : 2026-07-08

---

### Décision 013 — Langue du projet

**Contexte** : Langue principale du code et de la documentation.

**Décision** : **Français** pour les interfaces utilisateur et la documentation

**Décision** : **Anglais** pour le code (noms de variables, fonctions, commits)

**Justification** :
- Utilisateurs finaux : francophones (Val-d'Aigoual est en France)
- Développeurs : communauté internationale, standards en anglais

**Date** : 2026-07-08

---

## 📝 RÈGLES DE MAINTENANCE

### Ajouter une nouvelle décision

1. **Vérifier** qu'une décision similaire n'existe pas déjà
2. **Suivre** le format standard
3. **Assigner** un numéro séquentiel
4. **Documenter** le contexte clairement
5. **Expliquer** pourquoi les autres options ont été rejetées

### Modifier une décision

**Interdit** : Les décisions sont immuables.

**Si nécessaire** :
1. Créer une nouvelle décision qui **remplace** l'ancienne
2. Marquer l'ancienne comme **DÉPRÉCIÉE** avec la date et la référence à la nouvelle
3. Expliquer pourquoi le changement

### Exemple de décision dépréciée

```markdown
## Décision XXX — [Ancien titre] ⚠️ DÉPRÉCIÉE

**Remplacée par** : Décision YYY — [Nouveau titre]

**Date de dépréciation** : YYYY-MM-DD

**Raison** : [Expliquer pourquoi le changement]
```

---

## 🎯 RÈGLE D'OR

> **Si une décision existe dans ce fichier, elle est IMMUABLE.**
> 
> L'Agent **n'a pas le droit** de remettre en question une décision documentée ici.
> 
> L'Architecte **peut** modifier une décision, mais doit le documenter clairement.

---

> **Document maintenu par** : Architecte (vous)
> **Version** : 1.0 — 2026-07-10
> **Nombre de décisions** : 13