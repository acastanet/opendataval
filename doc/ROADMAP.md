# ROADMAP — Portail Open Data Val-d'Aigoual

> **Document de référence** : Backlog structuré et feuille de route du projet OpenDataVdA.
> **Version** : 1.0 — **Date** : 2026-07-10
> **Auteur** : Mistral Vibe (sous supervision humaine)
> **Statut** : En cours de développement — Brique 1 quasi-complète

---

## Table des matières

1. [Contexte et état actuel](#contexte-et-état-actuel)
2. [Légende et conventions](#légende-et-conventions)
3. [Brique 1 — Fondations & Explorateur cartographique](#brique-1---fondations--explorateur-cartographique)
4. [Brique 2 — Données socio-économiques](#brique-2---données-socio-économiques)
5. [Brique 3 — Finances et administration](#brique-3---finances-et-administration)
6. [Brique 4 — Environnement & Risques](#brique-4---environnement--risques)
7. [Brique 5 — Tourisme & Mobilité](#brique-5---tourisme--mobilité)
8. [Épics transverses](#épics-transverses)
9. [Priorités et séquençage](#priorités-et-séquençage)
10. [Dépendances et blocages](#dépendances-et-blocages)
11. [Critères de validation globaux](#critères-de-validation-globaux)

---

## Contexte et état actuel

### État du projet au 10 juillet 2026

- **Architecture** : VPS Docker Compose + PostgreSQL/PostGIS + Fastify API + Astro frontend
- **Sources implémentées** : 11/17 opérationnelles dans le worker
- **Pages implémentées** : 5/14 avec contenu réel
- **Brique 1** : **95% complète** — Tests et déploiement production restants
- **Briques 2-5** : À développer

### Stack technique validée (invariants)

| Composant | Technologie | État |
|---|---|---|
| Base de données | PostgreSQL 16 + PostGIS 3.4 | ✅ |
| Worker | Node.js 22 + TypeScript + tsx | ✅ |
| API | Fastify + TypeScript + tsx | ✅ |
| Frontend | Astro 4 + îles Svelte + MapLibre GL | ✅ |
| Reverse Proxy | Caddy 2 | ✅ |
| Orquestration | Docker Compose | ✅ |

---

## Légende et conventions

### États des tâches

| Symbole | Signification | Description |
|---|---|---|
| ✅ | **Terminé** | Implémenté, testé, validé |
| 🟡 | **En cours** | Développement actif |
| ⏳ | **Prêt** | Spécifié, prêt à être développé |
| ❌ | **Bloqué** | Dépendance manquante |
| 🔑 | **Nécessite clé API** | Token/clef requis côté commanditaire |
| 📋 | **Placeholder** | Page existante mais contenu minimal |

### Types d'éléments

- **🎯 Épic** : Regroupement de fonctionnalités (ex: "Brique 2")
- **📌 Story** : Fonctionnalité autonome et testable
- **✅ Task** : Tâche technique atomique
- **🔍 Test** : Critère de validation

### Priorités

1. **🔴 P0 — Critique** : Bloque le déploiement ou la production
2. **🟠 P1 — Haute** : Fonctionnalité principale de la brique en cours
3. **🟡 P2 — Moyenne** : Amélioration ou fonctionnalité secondaire
4. **🟢 P3 — Basse** : Nice-to-have, optimisation

---

## Brique 1 — Fondations & Explorateur cartographique

**Objectif** : Une interface cartographique simple, intuitive et responsive de localisation des données du territoire, avec ingestion automatisée dans PostGIS.

**État** : 🟡 **95% complète** — Finalisation et déploiement en cours

**Responsable** : Développeur principal

**Deadline estimée** : 2026-07-15 (déploiement production)

### 🎯 Épic 1.0 — Finalisation technique

#### 📌 Story 1.1 : Tests d'intégration complète
**Priorité** : 🔴 P0
**État** : ⏳ Prêt

**Description** : Vérifier que les 11 sources s'intègrent correctement ensemble.

**Tasks** :
- [ ] Exécuter tous les jobs du worker : `docker-compose run --rm worker sh -c "RUN_ONCE=true tsx src/index.ts"`
- [ ] Vérifier les logs : chaque job doit logger `[slug] ok — X lignes`
- [ ] Vérifier `meta.fetch_log` : pas d'erreurs, tous les statuts = 'ok'
- [ ] Vérifier les comptes attendus en BDD :
  - `territoire.communes` : 16 lignes (1 commune + 15 EPCI)
  - `couches.objets` : ~2 000-5 000 objets (selon sources actives)
  - `series.piezo` : 6 224 mesures pour BSS002DJSB
  - `meta.sources` : 17 entrées

**Critères d'acceptation** :
- [ ] Tous les jobs exécutent sans erreur
- [ ] Toutes les tables sont peuplées avec les bonnes données
- [ ] Aucune erreur dans les logs Docker

#### 📌 Story 1.2 : Validation des performances
**Priorité** : 🔴 P0
**État** : ⏳ Prêt

**Description** : Vérifier les temps de réponse et l'expérience utilisateur.

**Tasks** :
- [ ] Mesurer le temps de réponse de `/api/couches` (< 500ms)
- [ ] Mesurer le temps de réponse de `/api/couches/:slug/geojson` pour chaque couche (< 1s)
- [ ] Mesurer le temps de rendu de la page carte (< 3s sur mobile)
- [ ] Tester avec 10 utilisateurs simultanés (load test simple)
- [ ] Vérifier la consommation mémoire (target: < 2 Go RAM)

**Critères d'acceptation** :
- [ ] Toutes les routes API répondent en < 1s
- [ ] La carte s'affiche en < 3s sur mobile (3G)
- [ ] Consommation mémoire stable < 2 Go

#### 📌 Story 1.3 : Correction des bugs connus
**Priorité** : 🔴 P0
**État** : ⏳ Prêt

**Description** : Résoudre les problèmes identifiés dans les tests.

**Tasks** :
- [ ] Vérifier et corriger les erreurs de logs éventuelles
- [ ] Corriger les problèmes d'affichage sur mobile
- [ ] Vérifier la cohérence des attributions (licences)
- [ ] Tester le relief 3D sur tous les niveaux de zoom

**Critères d'acceptation** :
- [ ] Aucune erreur dans la console navigateur
- [ ] Aucune erreur 500 côté serveur
- [ ] Toutes les fonctionnalités fonctionnent sur mobile

### 🎯 Épic 1.1 — Déploiement production

#### 📌 Story 1.4 : Configuration du VPS
**Priorité** : 🔴 P0
**État** : ❌ Bloqué (attente VPS commanditaire)
**Dépendance** : 🔑 VPS fourni par commanditaire

**Description** : Configurer l'infrastructure de production.

**Tasks** :
- [ ] Installer Docker et Docker Compose sur le VPS
- [ ] Configurer le nom de domaine DNS (pointer vers IP VPS)
- [ ] Configurer les ports (80, 443 ouverts)
- [ ] Créer les volumes Docker persistants
- [ ] Configurer UFW (pare-feu)

**Critères d'acceptation** :
- [ ] Docker et Docker Compose fonctionnels
- [ ] Domaine résolu vers l'IP du VPS
- [ ] Ports 80 et 443 accessibles

#### 📌 Story 1.5 : Déploiement du stack
**Priorité** : 🔴 P0
**État** : ❌ Bloqué (attente Story 1.4)
**Dépendance** : Story 1.4

**Description** : Déployer l'application complète en production.

**Tasks** :
- [ ] Copier le code sur le VPS (git clone)
- [ ] Configurer le fichier `.env` avec les variables :
  ```bash
  POSTGRES_USER=opendata
  POSTGRES_PASSWORD=changeme
  POSTGRES_DB=opendata_vda
  SITE_DOMAIN=opendata-valdaigoual.fr
  ```
- [ ] Construire les images : `docker-compose build`
- [ ] Lancer le stack : `docker-compose up -d`
- [ ] Vérifier les logs : `docker-compose logs -f`

**Critères d'acceptation** :
- [ ] Les 4 services (db, api, worker, caddy) sont en cours d'exécution
- [ ] HTTPS fonctionne (Let's Encrypt configuré)
- [ ] Le site est accessible via le domaine

#### 📌 Story 1.6 : Exécution initiale des jobs
**Priorité** : 🔴 P0
**État** : ❌ Bloqué (attente Story 1.5)
**Dépendance** : Story 1.5

**Description** : Peupler la base de données en production.

**Tasks** :
- [ ] Lancer tous les jobs une fois :
  ```bash
  docker-compose run --rm worker sh -c "RUN_ONCE=true tsx src/index.ts"
  ```
- [ ] Vérifier que toutes les sources sont ingérées
- [ ] Vérifier les comptes en BDD (comparer avec développement)

**Critères d'acceptation** :
- [ ] Toutes les tables sont peuplées
- [ ] Pas d'erreurs dans `meta.fetch_log`
- [ ] Les données correspondent aux attentes

#### 📌 Story 1.7 : Vérification de bout en bout
**Priorité** : 🔴 P0
**État** : ❌ Bloqué (attente Story 1.6)
**Dépendance** : Story 1.6

**Description** : Tester l'application complète en production.

**Tasks** :
- [ ] Vérifier que toutes les pages s'affichent
- [ ] Tester la carte avec toutes les couches
- [ ] Tester la recherche unifiée
- [ ] Tester le relief 3D
- [ ] Tester sur mobile
- [ ] Vérifier les attributions (licences)

**Critères d'acceptation** :
- [ ] Toutes les pages accessibles sans erreur
- [ ] Toutes les couches s'affichent correctement
- [ ] La recherche retourne des résultats pertinents
- [ ] Le relief 3D fonctionne sur tous les zooms

### 🎯 Épic 1.2 — Documentation et maintenance

#### 📌 Story 1.8 : Documentation technique
**Priorité** : 🟠 P1
**État** : ⏳ Prêt

**Description** : Documenter le projet pour les développeurs et la maintenance.

**Tasks** :
- [ ] Mettre à jour le README.md à la racine
- [ ] Documenter les variables d'environnement
- [ ] Documenter les commandes Docker
- [ ] Documenter les commandes pnpm
- [ ] Créer un guide de déploiement

**Critères d'acceptation** :
- [ ] README.md complet avec toutes les informations nécessaires
- [ ] Guide de déploiement testé et validé

#### 📌 Story 1.9 : Configuration de la surveillance
**Priorité** : 🟡 P2
**État** : ⏳ Prêt

**Description** : Mettre en place le monitoring de base.

**Tasks** :
- [ ] Configurer la rotation des logs Docker
- [ ] Configurer les sauvegardes automatiques de la BDD (`pg_dump` nightly)
- [ ] Configurer un script de healthcheck
- [ ] Documenter les procédures de restauration

**Critères d'acceptation** :
- [ ] Logs rotatifs (7 jours de rétention)
- [ ] Sauvegardes automatiques fonctionnelles
- [ ] Script de healthcheck opérationnel

#### 📌 Story 1.10 : Audit Lighthouse
**Priorité** : 🟡 P2
**État** : ⏳ Prêt

**Description** : Vérifier la qualité du site (performance, SEO, accessibilité).

**Tasks** :
- [ ] Exécuter Lighthouse sur mobile
- [ ] Exécuter Lighthouse sur desktop
- [ ] Corriger les problèmes identifiés
- [ ] Documenter les résultats

**Critères d'acceptation** :
- [ ] Score Performance ≥ 90 (mobile)
- [ ] Score Accessibilité ≥ 90
- [ ] Score SEO ≥ 90
- [ ] Score Best Practices ≥ 90

---

## Brique 2 — Données socio-économiques

**Objectif** : Ajouter les données INSEE (population, logement) et compléter les données économiques.

**État** : ⏳ Prêt

**Responsable** : Développeur principal

**Deadline estimée** : 2026-07-25 (si Brique 1 déployée)

### 🎯 Épic 2.0 — Sources INSEE

#### 📌 Story 2.1 : Implémentation source INSEE Population légale
**Priorité** : 🟠 P1
**État** : ⏳ Prêt

**Description** : Ajouter la source INSEE pour les populations légales via API Melodi (sans clé).

**Tasks** :
- [ ] Créer `apps/worker/src/sources/inseePopulation.ts`
- [ ] Implémenter le fetch depuis `api.insee.fr/melodi/data/DS_RP_POPULATION_PRINC`
- [ ] Parser les données pour la commune 30339 et l'EPCI 200034601
- [ ] Insérer dans une nouvelle table `socio_economie.population` ou `couches.objets`
- [ ] Créer la migration SQL si nécessaire
- [ ] Ajouter au scheduler (fréquence : annuelle)
- [ ] Ajouter au CATALOGUE_SOURCES

**Critères d'acceptation** :
- [ ] Données de population récupérées pour 30339 et 200034601
- [ ] Historique des années disponibles stocké
- [ ] Job exécute sans erreur

#### 📌 Story 2.2 : Implémentation source INSEE Dossier complet
**Priorité** : 🟠 P1
**État** : ⏳ Prêt

**Description** : Ajouter les données du dossier complet INSEE (logements, établissements).

**Tasks** :
- [ ] Identifier les endpoints pour le dossier complet
- [ ] Créer `apps/worker/src/sources/inseeDossier.ts`
- [ ] Implémenter le fetch et le parsing
- [ ] Stocker les données dans `couches.objets` ou tables dédiées
- [ ] Ajouter au scheduler (fréquence : annuelle)
- [ ] Ajouter au CATALOGUE_SOURCES

**Critères d'acceptation** :
- [ ] Données de logement récupérées (incluant résidences secondaires)
- [ ] Données des établissements récupérées
- [ ] Job exécute sans erreur

#### 📌 Story 2.3 : Source Base Permanente des Équipements (BPE)
**Priorité** : 🟡 P2
**État** : ⏳ Prêt

**Description** : Ajouter les équipements (services publics, commerces, etc.).

**Tasks** :
- [ ] Identifier le jeu de données BPE sur data.gouv.fr
- [ ] Créer `apps/worker/src/sources/bpe.ts`
- [ ] Implémenter le fetch (CSV/GeoJSON)
- [ ] Filtrer par code INSEE 30339 et codes EPCI
- [ ] Stocker dans `couches.objets` avec couche='bpe'
- [ ] Ajouter au scheduler (fréquence : trimestrielle)
- [ ] Ajouter au CATALOGUE_SOURCES

**Critères d'acceptation** :
- [ ] Équipements de la commune et EPCI récupérés
- [ ] Données géolocalisées correctement
- [ ] Job exécute sans erreur

### 🎯 Épic 2.1 — Pages socio-économiques

#### 📌 Story 2.4 : Page Population complète
**Priorité** : 🟠 P1
**État** : 📋 Placeholder existant

**Description** : Compléter la page population avec graphiques et données INSEE.

**Tasks** :
- [ ] Créer des graphiques démographiques (Chart.js ou Observable Plot)
- [ ] Afficher l'évolution de la population 2011→2022
- [ ] Afficher les données de logement (total, résidences secondaires)
- [ ] Afficher les données par tranche d'âge (si disponibles)
- [ ] Ajouter une carte des adresses BAN clusterisées (déjà partiellement fait)
- [ ] Intégrer les composants avec CarteThematique.svelte

**Critères d'acceptation** :
- [ ] Graphiques interactifs et responsive
- [ ] Données correctement affichées
- [ ] Page s'affiche sans erreur console
- [ ] Design cohérent avec le reste du site

#### 📌 Story 2.5 : Page Économie complète
**Priorité** : 🟡 P2
**État** : ✅ Partiellement fait (entreprises + RPG + signes qualité)

**Description** : Compléter la page économie avec BPE et visualisations.

**Tasks** :
- [ ] Ajouter l'affichage des équipements (BPE)
- [ ] Créer des graphiques/statistiques sur les établissements
- [ ] Afficher les signes de qualité (AOP/IGP) sur une carte
- [ ] Ajouter une section "Chiffres clés" économie
- [ ] Intégrer avec CarteThematique.svelte

**Critères d'acceptation** :
- [ ] Toutes les données économiques affichées
- [ ] Graphiques fonctionnels
- [ ] Page responsive

### 🎯 Épic 2.2 — API socio-économie

#### 📌 Story 2.6 : Endpoints API INSEE
**Priorité** : 🟠 P1
**État** : ⏳ Prêt

**Description** : Ajouter des endpoints dédiés aux données INSEE.

**Tasks** :
- [ ] Créer `/api/socio-economie/population` (historique)
- [ ] Créer `/api/socio-economie/logement`
- [ ] Créer `/api/socio-economie/etablissements`
- [ ] Valider les slugs contre CATALOGUE_SOURCES
- [ ] Documenter les endpoints

**Critères d'acceptation** :
- [ ] Endpoints fonctionnels
- [ ] Données correctement formatées (JSON)
- [ ] Cache configuré (1h)

---

## Brique 3 — Finances et administration

**Objectif** : Ajouter les données financières (OFGL, DGFiP) et compléter les services.

**État** : ⏳ Prêt

**Responsable** : Développeur principal

**Deadline estimée** : 2026-08-05

### 🎯 Épic 3.0 — Sources financières

#### 📌 Story 3.1 : Implémentation source OFGL
**Priorité** : 🟠 P1
**État** : ⏳ Prêt
**Attention** : API v2.1 **obligatoire** (v1 → 400)

**Description** : Ajouter les comptes des collectivités depuis OFGL.

**Tasks** :
- [ ] Créer `apps/worker/src/sources/ofgl.ts`
- [ ] Implémenter le fetch depuis `data.ofgl.fr/api/explore/v2.1/catalog/datasets/ofgl-base-communes/records`
- [ ] Filtrer par `com_code="30339"` et `com_code="200034601"` (EPCI)
- [ ] Parser les données financières (1 469 enregistrement attendus pour la commune)
- [ ] Stocker dans une table `finances.ofgl` ou `couches.objets`
- [ ] Créer la migration SQL
- [ ] Ajouter au scheduler (fréquence : annuelle)
- [ ] Ajouter au CATALOGUE_SOURCES

**Critères d'acceptation** :
- [ ] Données OFGL récupérées pour commune et EPCI
- [ ] Structure des données préservée
- [ ] Job exécute sans erreur

#### 📌 Story 3.2 : Implémentation source Balances comptables DGFiP
**Priorité** : 🟠 P1
**État** : ⏳ Prêt

**Description** : Ajouter les balances comptables des communes.

**Tasks** :
- [ ] Créer `apps/worker/src/sources/balancesComptables.ts`
- [ ] Implémenter le fetch depuis `data.economie.gouv.fr/api/explore/v2.1/`
- [ ] Filtrer par `siren="200082725"` (commune) et `siren="200034601"` (EPCI)
- [ ] Parser les 331 lignes attendues pour la commune
- [ ] Stocker dans une table `finances.balances`
- [ ] Créer la migration SQL
- [ ] Ajouter au scheduler (fréquence : annuelle)
- [ ] Ajouter au CATALOGUE_SOURCES

**Critères d'acceptation** :
- [ ] Données de balances récupérées
- [ ] Données correctement structurées
- [ ] Job exécute sans erreur

#### 📌 Story 3.3 : Source Marchés publics (DECP)
**Priorité** : 🟡 P2
**État** : ⏳ Prêt

**Description** : Ajouter les marchés publics.

**Tasks** :
- [ ] Identifier l'API ou le jeu de données DECP
- [ ] Créer `apps/worker/src/sources/marchesPublics.ts`
- [ ] Implémenter le fetch
- [ ] Filtrer par acheteur SIREN 200082725 et 200034601
- [ ] Stocker dans `couches.objets` avec couche='marche_public'
- [ ] Ajouter au scheduler (fréquence : mensuelle)
- [ ] Ajouter au CATALOGUE_SOURCES

**Critères d'acceptation** :
- [ ] Marchés publics récupérés
- [ ] Données filtrées correctement
- [ ] Job exécute sans erreur

### 🎯 Épic 3.1 — Pages finances

#### 📌 Story 3.4 : Page Finances publiques
**Priorité** : 🟠 P1
**État** : 📋 Placeholder existant

**Description** : Créer la page finances avec visualisations des données OFGL et DGFiP.

**Tasks** :
- [ ] Créer des graphiques d'évolution des budgets
- [ ] Afficher les comptes de la commune et de l'EPCI
- [ ] Créer des visualisations comparatives (commune vs EPCI)
- [ ] Ajouter des indicateurs clés (dette, investissement, fonctionnement)
- [ ] Intégrer avec CarteThematique.svelte si nécessaire

**Critères d'acceptation** :
- [ ] Graphiques interactifs et clairs
- [ ] Données financières correctement affichées
- [ ] Page responsive

#### 📌 Story 3.5 : Page Services complet
**Priorité** : 🟡 P2
**État** : 📋 Placeholder existant

**Description** : Compléter la page services avec FINESS et autres données.

**Tasks** :
- [ ] Ajouter la source FINESS (attention : nouveau flux ANS été 2026)
- [ ] Créer `apps/worker/src/sources/finess.ts`
- [ ] Récupérer les établissements de santé
- [ ] Afficher les services administratifs (déjà partiellement fait)
- [ ] Afficher les services de santé
- [ ] Créer une carte interactive des services

**Critères d'acceptation** :
- [ ] Toutes les données services affichées
- [ ] Carte fonctionnelle
- [ ] Page responsive

### 🎯 Épic 3.2 — API finances

#### 📌 Story 3.6 : Endpoints API finances
**Priorité** : 🟠 P1
**État** : ⏳ Prêt

**Description** : Ajouter des endpoints dédiés aux données financières.

**Tasks** :
- [ ] Créer `/api/finances/ofgl` (données OFGL)
- [ ] Créer `/api/finances/balances` (balances comptables)
- [ ] Créer `/api/finances/marches` (marchés publics)
- [ ] Valider les accès
- [ ] Configurer le cache (1h)
- [ ] Documenter les endpoints

**Critères d'acceptation** :
- [ ] Endpoints fonctionnels
- [ ] Données correctement formatées
- [ ] Cache configuré

---

## Brique 4 — Environnement & Risques

**Objectif** : Ajouter les données météo, qualité de l'air, et compléter les données environnementales et de risques.

**État** : ⏳ Prêt

**Responsable** : Développeur principal

**Deadline estimée** : 2026-08-15
**Dépendance** : 🔑 Token Météo-France requis

### 🎯 Épic 4.0 — Sources environnementales

#### 📌 Story 4.1 : Implémentation source Météo-France
**Priorité** : 🟠 P1
**État** : ❌ Bloqué (attente token)
**Dépendance** : 🔑 Token OAuth depuis `portail-api.meteofrance.fr`

**Description** : Ajouter les observations temps réel et vigilance Météo-France.

**Tasks** :
- [ ] Obtenir le token OAuth du commanditaire
- [ ] Configurer le token dans `.env` (variable `METEO_FRANCE_TOKEN`)
- [ ] Créer `apps/worker/src/sources/meteoFrance.ts`
- [ ] Implémenter le fetch depuis `portail-api.meteofrance.fr`
- [ ] Récupérer les données de la station 30339001 (NUM_POSTE)
- [ ] Stocker les observations dans `series.meteo`
- [ ] Stocker les vigilances dans `couches.objets` avec couche='vigilance'
- [ ] Ajouter au scheduler (fréquence : horaire pour obs, quotidienne pour vigilance)
- [ ] Ajouter au CATALOGUE_SOURCES

**Critères d'acceptation** :
- [ ] Observations temps réel récupérées
- [ ] Vigilance récupérée et affichable
- [ ] Job exécute sans erreur
- [ ] Token sécurisé (ne jamais commiter dans le repo)

#### 📌 Story 4.2 : Source Atmo Occitanie
**Priorité** : 🟠 P1
**État** : ⏳ Prêt

**Description** : Ajouter l'indice qualité de l'air.

**Tasks** :
- [ ] Identifier l'API ou le flux Atmo Occitanie
- [ ] Créer `apps/worker/src/sources/atmoOccitanie.ts`
- [ ] Implémenter le fetch (GeoJSON/WFS)
- [ ] Filtrer par EPCI 200034601
- [ ] Stocker dans `series.qualite_air` ou `couches.objets`
- [ ] Ajouter au scheduler (fréquence : quotidienne)
- [ ] Ajouter au CATALOGUE_SOURCES

**Critères d'acceptation** :
- [ ] Indice ATMO récupéré pour l'EPCI
- [ ] Données géolocalisées correctement
- [ ] Job exécute sans erreur

#### 📌 Story 4.3 : Source Hub'Eau complémentaire
**Priorité** : 🟡 P2
**État** : ⏳ Prêt

**Description** : Ajouter qualité des rivières et prélèvements.

**Tasks** :
- [ ] Étendre `apps/worker/src/sources/hubeau.ts`
- [ ] Ajouter le fetch pour `/qualite_rivieres`
- [ ] Ajouter le fetch pour `/prelevements`
- [ ] Ajouter le fetch pour `/ecoulement`
- [ ] Stocker dans les tables appropriées
- [ ] Mettre à jour le scheduler

**Critères d'acceptation** :
- [ ] Nouvelles données Hub'Eau récupérées
- [ ] Données correctement stockées
- [ ] Jobs exécutent sans erreur

### 🎯 Épic 4.1 — Pages environnement & risques

#### 📌 Story 4.4 : Page Météo & Climat
**Priorité** : 🟠 P1
**État** : 📋 Placeholder existant

**Description** : Compléter la page météo avec données temps réel et historiques.

**Tasks** :
- [ ] Afficher les observations temps réel (si Story 4.1 faite)
- [ ] Afficher la vigilance météo
- [ ] Afficher les normales climatiques (fiche PDF 30339001)
- [ ] Créer des graphiques de séries historiques (si données disponibles)
- [ ] Intégrer avec CarteThematique.svelte

**Critères d'acceptation** :
- [ ] Données météo correctement affichées
- [ ] Vigilance visible et compréhensible
- [ ] Graphiques fonctionnels
- [ ] Page responsive

#### 📌 Story 4.5 : Page Environnement complète
**Priorité** : 🟠 P1
**État** : 📋 Placeholder existant

**Description** : Compléter la page environnement avec toutes les données.

**Tasks** :
- [ ] Afficher Natura 2000 (déjà partiellement fait)
- [ ] Afficher ZNIEFF (déjà partiellement fait)
- [ ] Afficher les stations Hub'Eau
- [ ] Afficher la qualité de l'air (si Story 4.2 faite)
- [ ] Ajouter le cœur du Parc national des Cévennes
- [ ] Intégrer avec CarteThematique.svelte

**Critères d'acceptation** :
- [ ] Toutes les données environnementales affichées
- [ ] Carte interactive fonctionnelle
- [ ] Page responsive

#### 📌 Story 4.6 : Page Risques complète
**Priorité** : 🟠 P1
**État** : 📋 Placeholder existant

**Description** : Compléter la page risques avec toutes les données disponibles.

**Tasks** :
- [ ] Afficher les risques Géorisques (déjà partiellement fait)
- [ ] Ajouter le zonage sismique
- [ ] Ajouter le radon
- [ ] Ajouter les Cat-Nat
- [ ] Ajouter les feux de forêt
- [ ] Intégrer avec CarteThematique.svelte

**Critères d'acceptation** :
- [ ] Toutes les données risques affichées
- [ ] Cartes et visualisations claires
- [ ] Page responsive

---

## Brique 5 — Tourisme & Mobilité

**Objectif** : Ajouter les données touristiques, de mobilité et de vie démocratique.

**État** : ⏳ Prêt

**Responsable** : Développeur principal

**Deadline estimée** : 2026-08-25
**Dépendance** : 🔑 Clé DATAtourisme requise

### 🎯 Épic 5.0 — Sources tourisme & mobilité

#### 📌 Story 5.1 : Implémentation source DATAtourisme
**Priorité** : 🟠 P1
**État** : ❌ Bloqué (attente clé)
**Dépendance** : 🔑 Clé gratuite pour flux Occitanie (code `OCC`)

**Description** : Ajouter les POI touristiques riches.

**Tasks** :
- [ ] Obtenir la clé API du commanditaire
- [ ] Configurer la clé dans `.env` (variable `DATATOURISME_KEY`)
- [ ] Créer `apps/worker/src/sources/datTourisme.ts`
- [ ] Implémenter le fetch depuis `api.datatourisme.fr/v1`
- [ ] Récupérer les flux : PLACE, FMA, TOUR (randos), PRODUCT
- [ ] Filtrer par territoire (code commune/EPCI)
- [ ] Stocker dans `couches.objets` avec couche='tourisme'
- [ ] Ajouter au scheduler (fréquence : hebdomadaire)
- [ ] Ajouter au CATALOGUE_SOURCES

**Critères d'acceptation** :
- [ ] POI touristiques récupérés
- [ ] Données complètes et géolocalisées
- [ ] Job exécute sans erreur
- [ ] Clé sécurisée (ne jamais commiter dans le repo)

#### 📌 Story 5.2 : Source PDIPR Gard
**Priorité** : 🟠 P1
**État** : ⏳ Prêt

**Description** : Ajouter les sentiers GR/GRP/PR du Gard.

**Tasks** :
- [ ] Identifier le jeu de données PDIPR sur data.gouv.fr
- [ ] Télécharger les données (GeoJSON/SHP)
- [ ] Créer `apps/worker/src/sources/pdipr.ts`
- [ ] Parser et filtrer les sentiers du territoire
- [ ] Stocker dans `couches.objets` avec couche='sentier'
- [ ] Ajouter au scheduler (fréquence : trimestrielle)
- [ ] Ajouter au CATALOGUE_SOURCES

**Critères d'acceptation** :
- [ ] Sentiers du territoire récupérés
- [ ] Données géolocalisées correctement
- [ ] Job exécute sans erreur

#### 📌 Story 5.3 : Source liO Occitanie
**Priorité** : 🟡 P2
**État** : ⏳ Prêt

**Description** : Ajouter le réseau de transport GTFS.

**Tasks** :
- [ ] Télécharger les données GTFS du réseau liO
- [ ] Créer `apps/worker/src/sources/lio.ts`
- [ ] Parser les données GTFS (arrêts, lignes, horaires)
- [ ] Filtrer par territoire (arrêts dans bbox)
- [ ] Stocker les arrêts dans `couches.objets` avec couche='arret_lio'
- [ ] Stocker les lignes dans une table dédiée ou `couches.objets`
- [ ] Ajouter au scheduler (fréquence : mensuelle)
- [ ] Ajouter au CATALOGUE_SOURCES

**Critères d'acceptation** :
- [ ] Arrêts du territoire récupérés
- [ ] Lignes desservant le territoire identifiées
- [ ] Job exécute sans erreur

#### 📌 Story 5.4 : Source Élections / RNE
**Priorité** : 🟡 P2
**État** : ⏳ Prêt

**Description** : Ajouter les résultats électoraux et le répertoire des élus.

**Tasks** :
- [ ] Identifier les APIs ou jeux de données
- [ ] Créer `apps/worker/src/sources/elections.ts`
- [ ] Créer `apps/worker/src/sources/rne.ts`
- [ ] Implémenter le fetch
- [ ] Filtrer par code INSEE 30339
- [ ] Stocker dans les tables appropriées
- [ ] Ajouter au scheduler
- [ ] Ajouter au CATALOGUE_SOURCES

**Critères d'acceptation** :
- [ ] Résultats électoraux récupérés
- [ ] Répertoire des élus récupéré
- [ ] Jobs exécutent sans erreur

### 🎯 Épic 5.1 — Pages tourisme & mobilité

#### 📌 Story 5.5 : Page Tourisme & Randonnée
**Priorité** : 🟠 P1
**État** : 📋 Placeholder existant

**Description** : Compléter la page tourisme avec toutes les données.

**Tasks** :
- [ ] Afficher les POI touristiques (si Story 5.1 faite)
- [ ] Afficher les sentiers (si Story 5.2 faite)
- [ ] Créer des itinéraires interactifs
- [ ] Afficher les hébergements, restaurants, sites
- [ ] Intégrer avec CarteThematique.svelte

**Critères d'acceptation** :
- [ ] Toutes les données touristiques affichées
- [ ] Carte interactive fonctionnelle
- [ ] Page responsive

#### 📌 Story 5.6 : Page Mobilité
**Priorité** : 🟡 P2
**État** : 📋 Placeholder existant

**Description** : Créer la page mobilité avec les données de transport.

**Tasks** :
- [ ] Afficher les arrêts liO (si Story 5.3 faite)
- [ ] Afficher les lignes desservant le territoire
- [ ] Créer un outil de recherche d'itinéraire (optionnel)
- [ ] Intégrer avec CarteThematique.svelte

**Critères d'acceptation** :
- [ ] Données de mobilité affichées
- [ ] Carte fonctionnelle
- [ ] Page responsive

#### 📌 Story 5.7 : Page Vie démocratique
**Priorité** : 🟡 P2
**État** : 📋 Placeholder existant

**Description** : Compléter la page démocratie avec élections et élus.

**Tasks** :
- [ ] Afficher les résultats électoraux (si Story 5.4 faite)
- [ ] Afficher le répertoire des élus
- [ ] Créer des visualisations des résultats
- [ ] Ajouter des informations sur les usus

**Critères d'acceptation** :
- [ ] Données électorales affichées
- [ ] Répertoire des élus visible
- [ ] Page responsive

---

## Épics transverses

### 🎯 Épic T.0 — Tests et qualité

#### 📌 Story T.1 : Suite de tests automatisés
**Priorité** : 🟡 P2
**État** : ⏳ Prêt

**Description** : Mettre en place des tests automatisés pour le backend et le frontend.

**Tasks** :
- [ ] Créer des tests unitaires pour les fonctions partagées
- [ ] Créer des tests d'intégration pour l'API
- [ ] Créer des tests pour les sources du worker
- [ ] Configurer un runner de tests (Vitest, Jest, ou autres)
- [ ] Intégrer dans le pipeline CI/CD (si mis en place)

**Critères d'acceptation** :
- [ ] Tests couvrant les fonctions critiques
- [ ] Tous les tests passent
- [ ] Tests exécutables localement

#### 📌 Story T.2 : Audit accessibilité (RGAA)
**Priorité** : 🟡 P2
**État** : ⏳ Prêt

**Description** : Vérifier et corriger l'accessibilité du site.

**Tasks** :
- [ ] Exécuter un audit RGAA complet
- [ ] Corriger les problèmes identifiés
- [ ] Documenter les conformités et non-conformités
- [ ] Ajouter des alternatives textuelles aux éléments visuels

**Critères d'acceptation** :
- [ ] Score accessibilité ≥ 95%
- [ ] Tous les éléments ont des alternatives textuelles
- [ ] Navigation clavier fonctionnelle

### 🎯 Épic T.1 — Documentation

#### 📌 Story T.3 : Documentation utilisateur
**Priorité** : 🟡 P2
**État** : ⏳ Prêt

**Description** : Créer la documentation pour les utilisateurs finaux.

**Tasks** :
- [ ] Créer un guide d'utilisation du site
- [ ] Documenter les fonctionnalités de la carte
- [ ] Documenter les sources de données
- [ ] Créer une FAQ

**Critères d'acceptation** :
- [ ] Documentation complète et compréhensible
- [ ] Accessible depuis le site

#### 📌 Story T.4 : Documentation technique complète
**Priorité** : 🟡 P2
**État** : ⏳ Prêt

**Description** : Finaliser la documentation technique.

**Tasks** :
- [ ] Mettre à jour tous les documents de la doc/
- [ ] Documenter les workflows de développement
- [ ] Documenter les procédures de déploiement
- [ ] Documenter les procédures de maintenance

**Critères d'acceptation** :
- [ ] Documentation complète et à jour
- [ ] Accessible et compréhensible par un nouveau développeur

### 🎯 Épic T.2 — Optimisations

#### 📌 Story T.5 : Optimisation des performances
**Priorité** : 🟢 P3
**État** : ⏳ Prêt

**Description** : Optimiser les performances du site.

**Tasks** :
- [ ] Analyser les performances actuelles
- [ ] Optimiser les requêtes SQL (index, requêtes)
- [ ] Optimiser le chargement des couches GeoJSON
- [ ] Mettre en place le caching HTTP
- [ ] Optimiser les assets frontend (images, JS)

**Critères d'acceptation** :
- [ ] Amélioration mesurable des performances
- [ ] Score Lighthouse Performance ≥ 95

#### 📌 Story T.6 : Optimisation de l'ingestion
**Priorité** : 🟢 P3
**État** : ⏳ Prêt

**Description** : Optimiser les jobs du worker.

**Tasks** :
- [ ] Analyser les temps d'exécution des jobs
- [ ] Optimiser les requêtes API (parallelisation)
- [ ] Mettre en place du caching des réponses API
- [ ] Optimiser le streaming des gros fichiers

**Critères d'acceptation** :
- [ ] Réduction mesurable des temps d'exécution
- [ ] Moins de requêtes aux APIs publiques

---

## Priorités et séquençage

### Phase 1 — Finalisation Brique 1 (Immédiat)
**Objectif** : Déployer le MVP en production

| Story | Priorité | Dépendances | Deadline |
|---|---|---|---|
| 1.1 | 🔴 P0 | Aucune | 2026-07-12 |
| 1.2 | 🔴 P0 | Aucune | 2026-07-13 |
| 1.3 | 🔴 P0 | Aucune | 2026-07-14 |
| 1.4 | 🔴 P0 | Aucune | 🔑 Attente VPS |
| 1.5 | 🔴 P0 | 1.4 | 🔑 Attente VPS |
| 1.6 | 🔴 P0 | 1.5 | 🔑 Attente VPS |
| 1.7 | 🔴 P0 | 1.6 | 🔑 Attente VPS |
| 1.8 | 🟠 P1 | Aucune | 2026-07-15 |
| 1.10 | 🟡 P2 | Aucune | 2026-07-16 |
| 1.9 | 🟡 P2 | Aucune | 2026-07-17 |

### Phase 2 — Brique 2 (2 semaines après déploiement Brique 1)
**Objectif** : Ajouter les données socio-économiques

| Story | Priorité | Dépendances | Deadline |
|---|---|---|---|
| 2.1 | 🟠 P1 | Brique 1 déployée | 2026-07-20 |
| 2.2 | 🟠 P1 | Brique 1 déployée | 2026-07-22 |
| 2.3 | 🟡 P2 | Brique 1 déployée | 2026-07-23 |
| 2.6 | 🟠 P1 | 2.1, 2.2 | 2026-07-24 |
| 2.4 | 🟠 P1 | 2.1, 2.6 | 2026-07-25 |
| 2.5 | 🟡 P2 | 2.2, 2.3 | 2026-07-26 |

### Phase 3 — Brique 3 (2 semaines après Brique 2)
**Objectif** : Ajouter les données financières

| Story | Priorité | Dépendances | Deadline |
|---|---|---|---|
| 3.1 | 🟠 P1 | Brique 2 | 2026-08-01 |
| 3.2 | 🟠 P1 | Brique 2 | 2026-08-03 |
| 3.3 | 🟡 P2 | Brique 2 | 2026-08-04 |
| 3.6 | 🟠 P1 | 3.1, 3.2 | 2026-08-05 |
| 3.4 | 🟠 P1 | 3.1, 3.2, 3.6 | 2026-08-07 |
| 3.5 | 🟡 P2 | 3.3 | 2026-08-08 |

### Phase 4 — Brique 4 (2 semaines après Brique 3)
**Objectif** : Ajouter les données environnementales et de risques

| Story | Priorité | Dépendances | Deadline |
|---|---|---|---|
| 4.1 | 🟠 P1 | Brique 3 | 🔑 Attente token |
| 4.2 | 🟠 P1 | Brique 3 | 2026-08-12 |
| 4.3 | 🟡 P2 | Brique 3 | 2026-08-13 |
| 4.6 | 🟠 P1 | 4.1, 4.2 | 2026-08-14 |
| 4.4 | 🟠 P1 | 4.1 | 2026-08-15 |
| 4.5 | 🟠 P1 | 4.2, 4.3 | 2026-08-16 |

### Phase 5 — Brique 5 (2 semaines après Brique 4)
**Objectif** : Ajouter les données tourisme, mobilité et démocratie

| Story | Priorité | Dépendances | Deadline |
|---|---|---|---|
| 5.1 | 🟠 P1 | Brique 4 | 🔑 Attente clé |
| 5.2 | 🟠 P1 | Brique 4 | 2026-08-20 |
| 5.3 | 🟡 P2 | Brique 4 | 2026-08-22 |
| 5.4 | 🟡 P2 | Brique 4 | 2026-08-23 |
| 5.7 | 🟡 P2 | 5.4 | 2026-08-24 |
| 5.5 | 🟠 P1 | 5.1, 5.2 | 2026-08-25 |
| 5.6 | 🟡 P2 | 5.3 | 2026-08-26 |

### Phase 6 — Finalisation (après toutes les briques)
**Objectif** : Tests, qualité et documentation finale

| Story | Priorité | Dépendances | Deadline |
|---|---|---|---|
| T.1 | 🟡 P2 | Toutes briques | 2026-09-01 |
| T.2 | 🟡 P2 | Toutes briques | 2026-09-02 |
| T.3 | 🟡 P2 | Toutes briques | 2026-09-03 |
| T.4 | 🟡 P2 | Toutes briques | 2026-09-05 |
| T.5 | 🟢 P3 | Toutes briques | 2026-09-06 |
| T.6 | 🟢 P3 | Toutes briques | 2026-09-07 |

---

## Dépendances et blocages

### 🔑 Clés API requises

| Clé | Service | Utilisation | Story bloquée | Action requise |
|---|---|---|---|---|
| Token OAuth | Météo-France | Observations temps réel + vigilance | 4.1 | Créer application sur `portail-api.meteofrance.fr` |
| Clé gratuite | DATAtourisme | POI touristiques | 5.1 | Demander clé flux Occitanie `OCC` |

**Statut** : ❌ **Bloquant** — Sans ces clés, les Stories 4.1 et 5.1 ne peuvent pas être démarrées.

### 🖥️ Infrastructure requise

| Ressource | Utilisation | Story bloquée | Action requise |
|---|---|---|---|
| VPS (2 vCPU / 4 Go) | Hébergement production | 1.4-1.7 | Fournir VPS avec Docker Compose |
| Nom de domaine | Accès HTTPS | 1.4 | Configurer DNS |

**Statut** : ❌ **Bloquant** — Sans VPS, le déploiement production ne peut pas avoir lieu.

### Dépendances techniques internes

| Story | Dépend de | Type |
|---|---|---|
| 1.5 | 1.4 | Technique (infrastructure) |
| 1.6 | 1.5 | Technique (déploiement) |
| 1.7 | 1.6 | Technique (données) |
| 2.1, 2.2, 2.3 | Brique 1 déployée | Technique (fondations) |
| 2.4 | 2.1, 2.2 | Fonctionnelle (données) |
| 2.5 | 2.2, 2.3 | Fonctionnelle (données) |
| 2.6 | 2.1, 2.2 | Technique (API) |
| 3.1, 3.2, 3.3 | Brique 2 | Technique (fondations) |
| 3.4, 3.5 | 3.1, 3.2, 3.3 | Fonctionnelle (données) |
| 3.6 | 3.1, 3.2 | Technique (API) |
| 4.1, 4.2, 4.3 | Brique 3 | Technique (fondations) |
| 4.4, 4.5, 4.6 | 4.1, 4.2 | Fonctionnelle (données) |
| 5.1-5.4 | Brique 4 | Technique (fondations) |
| 5.5-5.7 | 5.1-5.4 | Fonctionnelle (données) |

---

## Critères de validation globaux

### Pour chaque Story

- [ ] Code compilé sans erreur
- [ ] Pas de duplication de code
- [ ] Pas de TODO oublié
- [ ] Pas de code mort
- [ ] Pas de variable inutilisée
- [ ] Documentation mise à jour
- [ ] Logs cohérents
- [ ] Tests manuels passés
- [ ] Attributions correctes (licences)

### Pour le déploiement

- [ ] `docker compose up -d` démarre sans erreur
- [ ] Toutes les migrations s'appliquent
- [ ] Tous les jobs du worker exécutent sans erreur
- [ ] L'API répond correctement à toutes les routes
- [ ] Le frontend s'affiche sans erreur console
- [ ] Le site est accessible en HTTPS
- [ ] Les sauvegardes sont configurées

### Pour les performances

- [ ] Temps de réponse API < 1s
- [ ] Temps de rendu page carte < 3s (mobile)
- [ ] Score Lighthouse Performance ≥ 90 (mobile)
- [ ] Score Lighthouse Accessibilité ≥ 90
- [ ] Score Lighthouse SEO ≥ 90

### Pour la qualité des données

- [ ] Toutes les sources déclaré dans CATALOGUE_SOURCES
- [ ] Toutes les licences correctement attribuées
- [ ] Toutes les géométries valides (EPSG:4326)
- [ ] Toutes les données filtrées par territoire

---

## Résumé des prochaines étapes

### 🎯 Priorité absolue (à faire immédiatement)

1. **Finaliser les tests de la Brique 1** (Stories 1.1, 1.2, 1.3)
2. **Obtenir le VPS et le nom de domaine** (pour Story 1.4)
3. **Obtenir les tokens API** (Météo-France, DATAtourisme)

### 📅 Calendrier prévisionnel

| Période | Phase | Objectif |
|---|---|---|
| 10-17 juillet | Phase 1 | Déploiement Brique 1 en production |
| 18-25 juillet | Phase 2 | Développement Brique 2 (socio-économie) |
| 26 juillet - 2 août | Phase 3 | Développement Brique 3 (finances) |
| 3-16 août | Phase 4 | Développement Brique 4 (environnement) |
| 17-29 août | Phase 5 | Développement Brique 5 (tourisme) |
| 30 août - 7 septembre | Phase 6 | Finalisation, tests et documentation |

### 📊 État d'avancement

- **Brique 1** : 95% ✅ (10 stories, 7 restantes)
- **Brique 2** : 0% ⏳ (6 stories)
- **Brique 3** : 0% ⏳ (6 stories)
- **Brique 4** : 0% ❌ (6 stories, 2 bloquées)
- **Brique 5** : 0% ❌ (6 stories, 2 bloquées)
- **Transverse** : 0% ⏳ (6 stories)

**Total** : ~40% du projet complet (estimation)

---

> **Note** : Cette roadmap est **vivante** et doit être mise à jour régulièrement en fonction de l'avancement réel, des blocages rencontrés et des priorités du commanditaire. Les deadlines sont **estimatives** et dépendent de la disponibilité des ressources (VPS, clés API) et de la validation des livrables.

> **Rappel** : L'agent ne doit **jamais** modifier cette roadmap sans validation humaine. Toute évolution doit être discutée et validée avant mise à jour.