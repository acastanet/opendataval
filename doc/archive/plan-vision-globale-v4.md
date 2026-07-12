# Plan — Portail Open Data : Val-d'Aigoual & CC Causses Aigoual Cévennes
## Version 4 — État réel des développements & Architecture implémentée

> **Document de référence** : Ce document remplace et met à jour toutes les versions précédentes.
> Il décrit **l'architecture réelle implémentée** (VPS Docker Compose + PostgreSQL/PostGIS) et **l'état exact des développements** au 10 juillet 2026.
> Date de mise à jour : 2026-07-10

---

## Table des matières

1. [Contexte et objectifs](#contexte-et-objectifs)
2. [Identité du territoire](#identité-du-territoire)
3. [Architecture technique implémentée](#architecture-technique-implémentée)
4. [Catalogue des sources](#catalogue-des-sources)
5. [Système de données PostgreSQL/PostGIS](#système-de-données-postgresqlpostgis)
6. [API Fastify](#api-fastify)
7. [Frontend Astro + Svelte](#frontend-astro--svelte)
8. [Feuille de route de mise en œuvre](#feuille-de-route-de-mise-en-œuvre)
9. [Points de vigilance techniques](#points-de-vigilance-techniques)
10. [Aspects juridiques et attributions](#aspects-juridiques-et-attributions)
11. [Déploiement](#déploiement)
12. [Vérification (tests de bout en bout)](#vérification-tests-de-bout-en-bout)
13. [Actions préalables requises](#actions-préalables-requises)
14. [Historique des versions](#historique-des-versions)

---

## Contexte et objectifs

La commune de **Val-d'Aigoual** (Gard) et son intercommunalité, la **Communauté de communes Causses Aigoual Cévennes – Terres Solidaires**, ne disposent d'aucun point d'entrée unique présentant les données publiques du territoire.

Ces données existent en abondance et sont ouvertes (Licence Ouverte / ODbL) : population, géographie de montagne, climat exceptionnel du Mont Aigoual, risques naturels, biodiversité (cœur du Parc national des Cévennes), eau, finances, tourisme, services...

**Objectif** : construire un **portail territorial open data** qui agrège et met en valeur **l'ensemble** de ces données, à la fois comme :
- Portail grand public (habitants + touristes)
- Observatoire chiffré
- Explorateur cartographique interactif

**Décisions validées avec le commanditaire** :
- Vocation : **toutes les données** — le site combine présentation éditoriale, tableaux de bord et carte SIG
- **Architecture retenue** : serveur auto-hébergé (VPS ~2 vCPU / 4 Go) avec **PostgreSQL + PostGIS**, services Node.js/TypeScript (Fastify), worker d'ingestion planifié, frontend Astro — orchestré par **Docker Compose**
- Périmètre : **couverture large par briques** — Brique 1 centrée sur l'explorateur cartographique, puis extension progressive aux autres domaines
- **Approche incrémentale** : Déploiement par briques fonctionnelles, chaque brique ajoutant de nouvelles sources et fonctionnalités

---

## Identité du territoire

Ces constantes pilotent **toutes** les requêtes API. Centralisées dans `packages/shared/src/territoire.ts`.

| Élément | Valeur | Vérifié via | Implémentation |
|---|---|---|---|
| Commune | **Val-d'Aigoual** | geo.api.gouv.fr | ✅ |
| Code INSEE (COG) | **30339** | geo.api.gouv.fr `/communes` | ✅ |
| SIREN commune | **200082725** | OFGL / recherche-entreprises | ✅ |
| Code postal | **30570** | geo.api | ✅ |
| Communes déléguées | **Valleraugue** (chef-lieu, ex-30339) + **Notre-Dame-de-la-Rouvière** (ex-30190) | fusion 01/01/2019 | ✅ |
| EPCI | **CC Causses Aigoual Cévennes – Terres Solidaires** | geo.api `/epcis` | ✅ |
| SIREN / code EPCI | **200034601** (identiques) | geo.api / recherche-entreprises | ✅ |
| Communes membres EPCI | **15** | `/epcis/200034601/communes` | ✅ |
| Population commune | **1 412** (municipale) / 1 418 (2022, INSEE) | geo.api / INSEE | ✅ |
| Population EPCI | **5 391** | geo.api | ✅ |
| Centroïde | 3.6272° E / 44.081° N | geo.api | ✅ |
| Mairie | 3.6414° E / 44.081° N | geo.api | ✅ |
| Superficie | **9 561,82 ha** (≈ 95,6 km²) | geo.api | ✅ |
| **Mont Aigoual (sommet)** | **44.1216° N / 3.5814° E**, alt. ≈ **1 567 m** | OSM node 26863762 / IGN | ✅ |
| **Station météo** | **NUM_POSTE 30339001** (SYNOP/OMM 07560) | Météo-France | ✅ |
| **BBOX territoire** | `[3.52, 44.02, 3.75, 44.15]` | contours calculés | ✅ |
| Région / Département | Occitanie (76) / Gard (30) | geo.api | ✅ |

**15 communes de l'EPCI** (INSEE, population) :
- Causse-Bégon (30074, 25)
- Dourbies (30105, 177)
- L'Estréchure (30108, 151)
- Lanuéjols (30139, 341)
- Lasalle (30140, 1 202)
- Peyrolles-en-Cévennes (30195, 30)
- Les Plantiers (30198, 228)
- Revens (30213, 37)
- Saint-André-de-Majencoules (30229, 599)
- Saint-André-de-Valborgne (30231, 366)
- Saint-Sauveur-Camprieu (30297, 207)
- Saumane (30310, 303)
- Soudorgues (30322, 269)
- Trèves (30332, 116)
- **Val-d'Aigoual (30339, 1 412)**

---

## Architecture technique implémentée

### Schéma global

```
opendata-vda/
├─ apps/
│  ├─ worker/                    # Worker d'ingestion (Node.js 22 + TypeScript + tsx)
│  │  ├─ src/
│  │  │  ├─ index.ts             # Point d'entrée, migrations, scheduler
│  │  │  ├─ scheduler.ts         # Définition des 11 jobs planifiés (JOBS)
│  │  │  └─ sources/             # 11 sources implémentées
│  │  │     ├─ geoapi.ts         # Contours communes + EPCI (geo.api.gouv.fr)
│  │  │     ├─ adresses.ts       # Base Adresse Nationale (streaming CSV gzip du Gard)
│  │  │     ├─ georisques.ts     # Risques (cavités + mouvements de terrain)
│  │  │     ├─ hubeau.ts         # Piézométrie + hydrométrie + chroniques de mesures
│  │  │     ├─ apicarto.ts       # Natura 2000 + ZNIEFF (API Carto IGN)
│  │  │     ├─ education.ts      # Annuaire éducation nationale
│  │  │     ├─ lannuaire.ts      # Annuaire administration (service-public.fr)
│  │  │     ├─ osm.ts            # POI OpenStreetMap (Overpass API)
│  │  │     ├─ entreprises.ts    # Établissements SIRENE ouverts
│  │  │     ├─ rpg.ts            # Registre Parcellaire Graphique (IGN)
│  │  │     └─ signesQualite.ts  # AOP/IGP INAO (Pélardon, Oignon doux, Miel, Châtaigne)
│  │  └─ Dockerfile
│  │
│  ├─ api/                       # API Fastify (Node.js 22 + TypeScript + tsx)
│  │  ├─ src/
│  │  │  ├─ index.ts
│  │  │  ├─ routes/
│  │  │  │  ├─ couches.ts        # /api/couches, /api/couches/:slug/geojson
│  │  │  │  ├─ territoire.ts     # /api/territoire
│  │  │  │  ├─ outils.ts         # /api/alti (proxy IGN), /api/recherche
│  │  │  │  └─ piezo.ts          # /api/piezo (chroniques)
│  │  │  └─ plugins/
│  │  └─ Dockerfile
│  │
│  └─ web/                       # Frontend Astro 4 (site statique + îles Svelte)
│     ├─ public/
│     │  └─ relief/              # Archives PMTiles pour relief 3D
│     │     ├─ aigoual.pmtiles      # Fond global z0-12 (~60 Mo, Copernicus GLO-30)
│     │     └─ aigoual-hd.pmtiles   # Extrait HD z13-15 (~2 Go, LiDAR HD IGN)
│     ├─ src/
│     │  ├─ pages/               # 14 pages thématiques
│     │  │  ├─ index.astro        # Accueil (hero + stats + thématiques)
│     │  │  ├─ carte.astro        # Carte interactive plein écran
│     │  │  ├─ territoire.astro   # Identité du territoire
│     │  │  ├─ population.astro   # Démographie (BAN clusterisée)
│     │  │  ├─ geographie.astro   # Relief 3D + altimétrie
│     │  │  ├─ meteo.astro        # Météo & climat
│     │  │  ├─ environnement.astro
│     │  │  ├─ risques.astro
│     │  │  ├─ services.astro
│     │  │  ├─ economie.astro     # Entreprises + RPG + signes qualité
│     │  │  ├─ finances.astro
│     │  │  ├─ tourisme.astro
│     │  │  ├─ mobilite.astro
│     │  │  ├─ democratie.astro
│     │  │  └─ sources.astro      # Catalogue complet
│     │  │
│     │  ├─ islands/              # Composants interactifs Svelte
│     │  │  ├─ MapExplorer.svelte  # Carte complète (MapLibre GL)
│     │  │  ├─ CarteThematique.svelte # Carte légère pour pages thématiques
│     │  │  └─ RechercheLieux.svelte # Autocomplete recherche
│     │  │
│     │  ├─ lib/                  # Utilitaires front
│     │  │  └─ carte.ts          # Config carte (fonds IGN, relief 3D)
│     │  └─ layouts/
│     │     └─ SectionLayout.astro
│     └─ Dockerfile
│
├─ packages/
│  └─ shared/                    # Package partagé (@opendata-vda/shared)
│     ├─ src/
│     │  ├─ index.ts
│     │  ├─ territoire.ts        # Constantes + CATALOGUE_SOURCES (17 sources)
│     │  ├─ sections.ts          # Taxonomie des 13 sections thématiques
│     │  ├─ db.ts                # Accès Postgres (pool, upsertCommune, upsertObjet...)
│     │  ├─ migrate.ts           # Gestion des migrations SQL automatiques
│     │  └─ geo.ts               # Utilitaires géomatiques
│     └─ package.json
│
├─ db/
│  └─ migrations/                # Migrations PostgreSQL/PostGIS
│     ├─ 001_init.sql            # Schéma initial (4 schémas)
│     └─ 002_recherche.sql       # Extensions pg_trgm/unaccent + vue recherche
│
├─ docker-compose.yml
├─ Dockerfile.caddy
├─ Caddyfile
└─ CLAUDE.md                    # Documentation technique détaillée
```

### Stack technique détaillée

| Composant | Technologie | Rôle | Port | État |
|---|---|---|---|---|
| **Base de données** | PostgreSQL 16 + PostGIS 3.4 (alpine) | Stockage géolocalisé + métadonnées | 5432 | ✅ |
| **Worker** | Node.js 22 + TypeScript + tsx | Ingestion planifiée des sources | - | ✅ |
| **API** | Fastify + TypeScript + tsx | Service des données (GeoJSON, recherche) | 3000 | ✅ |
| **Frontend** | Astro 4 + îles Svelte + MapLibre GL JS | Site statique + cartes interactives | - | ✅ |
| **Reverse Proxy** | Caddy 2 | SSL (Let's Encrypt), reverse proxy /api → api | 8080 | ✅ |

---

## Catalogue des sources

### État actuel : 11 sources opérationnelles + 6 déclarées dans le catalogue

**Toutes les sources sont sans clé API** (sauf mention contraire).

#### Sources implémentées dans le worker (11/17)

| Slug | Source | Point d'entrée | Fréquence | Thème | État | Lignes estimées |
|---|---|---|---|---|---|---|
| `geoapi` | API Découpage administratif | `geo.api.gouv.fr/communes/30339` + `/epcis/200034601/communes` | mensuelle | territoire | ✅ | 16 |
| `adresse` | Base Adresse Nationale (BAN) | `adresse.data.gouv.fr/data/ban/adresses/latest/csv/adresses-30.csv.gz` | mensuelle | population | ✅ | ~1 500 |
| `georisques` | Géorisques (cavités + mouvements) | `georisques.gouv.fr/api/v1/gaspar/` | mensuelle | risques | ✅ | ~20 |
| `hubeau` | Hub'Eau (piézométrie + hydro) | `hubeau.eaufrance.fr/api/v1-2/` | quotidienne | environnement | ✅ | ~10 stations |
| `apicarto` | API Carto IGN (Natura 2000 + ZNIEFF) | `apicarto.ign.fr/api/nature/` | trimestrielle | environnement | ✅ | ~15 |
| `education` | Annuaire Éducation | `data.education.gouv.fr/api/explore/v2.1/` | mensuelle | services | ✅ | ~5 |
| `lannuaire` | Annuaire Administration | `api-lannuaire.service-public.fr/api/explore/v2.1/` | mensuelle | services | ✅ | ~7 |
| `osm` | OpenStreetMap (Overpass) | `overpass-api.de/api/interpreter` | hebdomadaire | tourisme | ✅ | ~50 |
| `entreprises` | Recherche Entreprises (SIRENE) | `recherche-entreprises.api.gouv.fr/search` | mensuelle | économie | ✅ | ~20 |
| `rpg` | Registre Parcellaire Graphique | `geoservices.ign.fr/rpg` | annuelle | économie | ✅ | Variable |
| `signes_qualite` | INAO AOP/IGP | data.gouv.fr datasets | annuelle | économie | ✅ | ~4 |

#### Sources déclarées dans CATALOGUE_SOURCES mais non encore implémentées dans le worker (6)

| Slug | Source | Point d'entrée | Fréquence | Thème | État |
|---|---|---|---|---|---|
| `cavite` | Géorisques — Cavités souterraines | `georisques.gouv.fr/api/v1/cavites` | mensuelle | risques | ⏳ |
| `mouvement` | Géorisques — Mouvements de terrain | `georisques.gouv.fr/api/v1/mvt` | mensuelle | risques | ⏳ |
| `piezo` | Hub'Eau — Niveaux des nappes | `hubeau.eaufrance.fr/api/v1/niveaux_nappes` | quotidienne | environnement | ⏳ |
| `station_hydro` | Hub'Eau — Hydrométrie | `hubeau.eaufrance.fr/api/v2/hydrometrie` | quotidienne | environnement | ⏳ |
| `natura2000` | API Carto Nature — Natura 2000 | `apicarto.ign.fr/api/nature/natura-habitat` | trimestrielle | environnement | ⏳ |
| `znieff` | API Carto Nature — ZNIEFF | `apicarto.ign.fr/api/nature/znieff1` | trimestrielle | environnement | ⏳ |
| `geologie` | BRGM — Carte géologique (WMS) | `geoservices.brgm.fr/geologie` | stable | géographie | ⏳ |

**Note** : Les sources `cavite`, `mouvement`, `piezo`, `station_hydro`, `natura2000`, `znieff` sont déclarées dans `CATALOGUE_SOURCES` mais leur implémentation dans `apps/worker/src/sources/` utilise des slugs différents (`georisques`, `hubeau`, `apicarto`). Cela signifie que ces fonctionnalités sont couverte mais avec une organisation différente.

#### Sources planifiées mais non encore développées

- INSEE — Population légale (API Melodi) 🔑
- INSEE — Dossier complet
- OFGL — Comptes des collectivités (API v2.1 obligatoire)
- Balances comptables DGFiP
- Marchés publics (DECP)
- Météo-France (nécessite token OAuth) — Observations temps réel + vigilance 🔑
- Atmo Occitanie — Indice qualité de l'air
- DATAtourisme (nécessite clé gratuite) — POI touristiques 🔑
- PDIPR Gard — Sentiers GR/GRP/PR
- liO Occitanie — Réseau de transport (GTFS)
- FINESS — Santé
- Élections / RNE
- Parc national des Cévennes (cœur)

---

## Système de données PostgreSQL/PostGIS

### Modèle de données (4 schémas principaux)

**Fichier** : `db/migrations/001_init.sql`

#### 1. `territoire.communes` — Polygones et métadonnées des communes
```sql
- code_insee (text, PK)
- nom (text)
- code_epci (text)
- population (integer)
- surface_ha (numeric)
- est_epci_membre (boolean)
- geom (MultiPolygon, SRID 4326)
- maj (timestamptz)
- Index GIST sur geom
```

#### 2. `couches.objets` — Table générique pour tous les objets géolocalisés
```sql
- id (serial, PK)
- couche (text, NOT NULL)           -- slug de la source (ex: 'adresse', 'osm')
- external_id (text, NOT NULL)      -- identifiant externe unique
- props (jsonb)                      -- propriétés métiers
- geom (Geometry, SRID 4326)        -- géométrie (point, ligne, polygone)
- source_url (text)                 -- URL de la source originale
- maj (timestamptz)                 -- timestamp de dernière mise à jour
- Contrainte unique : (couche, external_id)
- Index GIST sur geom
- Index B-tree sur couche
```

#### 3. `series.piezo` — Chroniques de mesures piézométriques
```sql
- code_bss (text, PK)
- date (date, PK)
- niveau_m_ngf (numeric)
```

#### 4. `meta.sources` / `meta.fetch_log` — Catalogue et journal d'exécution
```sql
-- meta.sources:
- slug (text, PK)
- nom (text)
- url (text)
- licence (text)
- frequence (text)

-- meta.fetch_log:
- id (serial, PK)
- source (text)
- demarre_a (timestamptz)
- termine_a (timestamptz)
- statut (text)  -- 'ok' ou 'erreur'
- nb_lignes (integer)
- erreur (text)
- Index sur (source, demarre_a DESC)
```

#### 5. Migration 002 (`db/migrations/002_recherche.sql`)
- Ajoute extensions `pg_trgm` et `unaccent`
- Crée la vue `couches.lieux_recherche` pour recherche tolérante aux fautes
- Utilise `word_similarity` et `pg_trgm` pour la recherche floue

---

## API Fastify

L'API (`apps/api/src/`) expose les endpoints suivants :

### Routes principales

| Endpoint | Méthode | Description | Cache |
|---|---|---|---|
| `/api/couches` | GET | Liste toutes les couches avec compte d'objets et dernière maj | - |
| `/api/couches/:slug/geojson` | GET | GeoJSON des objets d'une couche (slug validé contre CATALOGUE_SOURCES) | 1h |
| `/api/territoire` | GET | Polygones des communes (territoire.communes) | - |
| `/api/alti?lon=X&lat=Y` | GET | Proxy vers l'API altimétrique IGN | - |
| `/api/recherche?q=TERME` | GET | Recherche unifiée (BAN + PostGIS) | - |
| `/api/piezo` | GET | Chroniques piézométriques (optionnel) | - |

**Détails techniques** :
- Validation des slugs contre `CATALOGUE_SOURCES` (Set des slugs autorisés)
- `/api/couches/:slug/geojson` : retourne `ST_AsGeoJSON(geom, 6)` avec props et source_url
- `/api/recherche` : fusionne en parallèle BAN (autocomplete avec biais géo sur centre territoire) et recherche pg_trgm sur vue `couches.lieux_recherche`
- Response format : `{ resultats: [{ type, couche, label, sousLabel, lon, lat, score }] }`

---

## Frontend Astro + Svelte

### Structure des pages (14 pages)

| Page | Contenu | État | Composants |
|---|---|---|---|
| `index.astro` | Accueil (hero, stats dynamiques, grille thématiques, encart sources) | ✅ | - |
| `carte.astro` | Carte interactive plein écran | ✅ | MapExplorer.svelte |
| `territoire.astro` | Identité du territoire | Placeholder | - |
| `population.astro` | Démographie + adresses BAN clusterisées | ✅ | CarteThematique.svelte |
| `geographie.astro` | Relief 3D + altimétrie (centré Mont Aigoual) | ✅ | CarteThematique.svelte |
| `meteo.astro` | Météo & climat | Placeholder | - |
| `environnement.astro` | Natura 2000, ZNIEFF, eau | Placeholder | - |
| `risques.astro` | Risques naturels | Placeholder | - |
| `services.astro` | Administration, éducation | Placeholder | - |
| `economie.astro` | Entreprises, RPG, signes qualité | ✅ | CarteThematique.svelte |
| `finances.astro` | Finances publiques | Placeholder | - |
| `tourisme.astro` | Tourisme (POI OSM) | Placeholder | - |
| `mobilite.astro` | Mobilité | Placeholder | - |
| `democratie.astro` | Vie démocratique | Placeholder | - |
| `sources.astro` | Catalogue complet des sources | ✅ | - |

**Légende** :
- ✅ = Implémentée avec contenu réel
- Placeholder = Page existante mais avec contenu minimal ("en préparation")

### Composants Svelte (îles interactives)

1. **`MapExplorer.svelte`** (carte.astro) :
   - Carte MapLibre GL complète
   - Fonds : IGN WMTS (PLANIGNV2, ORTHOPHOTOS) + géologie BRGM WMS
   - Couches dynamiques : charge toutes les couches non vides via `/api/couches` puis `/api/couches/:slug/geojson`
   - Fonctionnalités : panneau de couches, recherche (RechercheLieux), popups, relief 3D avec slider d'exagération
   - Gestion des groupes de couches (GROUPES_ACTIFS_DEFAUT)

2. **`CarteThematique.svelte`** (pages thématiques) :
   - Carte légère et réutilisable
   - Props : couches (array), cluster (boolean), hauteur, afficherContours, relief3d
   - Fond IGN plan seul, contours du territoire optionnels
   - Une couche par slug fourni, popups simples
   - Mode relief3d : active le terrain 3D avec caméra initiale inclinée

3. **`RechercheLieux.svelte`** :
   - Composant de recherche autonome
   - Autocomplete à la frappe, debounce, navigation clavier
   - Pattern ARIA combobox
   - Interroge `/api/recherche`
   - Émet événement selection (flyTo + marqueur temporaire)

### Configuration cartographique

**`apps/web/src/lib/carte.ts`** centralise :
- Constantes WMTS IGN : URL, LAYERS (PLANIGNV2, ORTHOPHOTOS, ELEVATION.SLOPES), TILEMATRIXSET
- Constantes WMS BRGM pour la géologie
- Mapping `COULEUR_COUCHE` et `NOM_COUCHE` (à maintenir en cohérence manuelle avec CATALOGUE_SOURCES)
- Helpers de relief 3D :
  - `enregistrerProtocolePmtiles` : registre protocole personnalisé `aigoualdem://`
  - `activerRelief` / `desactiverRelief` : gestion du terrain
  - `reglerExagerationRelief` : ajustement de l'exagération
- `ajouterCoucheClusterisee` : source GeoJSON clusterisée + layers clusters/compteur/points individuels

**Relief 3D** :
- Utilise deux archives PMTiles locales (pas d'appel réseau au runtime) :
  - Fond global z0-12 : `public/relief/aigoual.pmtiles` (~60 Mo, Copernicus GLO-30, ~30m/pixel)
  - Extrait HD z13-15 : `public/relief/aigoual-hd.pmtiles` (~2 Go, LiDAR HD IGN, ~3-4m/pixel)
- Le protocole `aigoualdem://{z}/{x}/{y}` route vers :
  - aigoual-hd.pmtiles au-dessus de z13
  - aigoual.pmtiles en dessous de z13
  - Repli sur la tuile ancêtre z12 du fond global si la tuile HD est absente (bord de bbox)

**Générer les PMTiles** (si la zone change) :
```bash
# Fond global z0-12 (Copernicus GLO-30)
pmtiles extract https://download.mapterhorn.com/planet.pmtiles apps/web/public/relief/aigoual.pmtiles --bbox=3.2,43.8,4.1,44.4 --maxzoom=12

# Extrait HD z13-15 (LiDAR HD IGN via archive régionale 6-32-23)
pmtiles extract https://download.mapterhorn.com/6-32-23.pmtiles apps/web/public/relief/aigoual-hd.pmtiles --bbox=3.2,43.8,4.1,44.4 --maxzoom=15
```

---

## Feuille de route de mise en œuvre

### Ce qui est déjà implémenté (Brique 1 - Fondations)

**Worker (11 sources)** :
- [x] geoapi — Contours communes et EPCI
- [x] adresses — Base Adresse Nationale (streaming CSV gzip du Gard, filtre sur 15 codes INSEE)
- [x] georisques — Cavités souterraines + mouvements de terrain
- [x] hubeau — Stations piézométriques + stations hydrométriques + chroniques de mesures
- [x] apicarto — Natura 2000 + ZNIEFF (intersection avec bbox territoire)
- [x] education — Établissements scolaires
- [x] lannuaire — Services publics (mairie, CCAS, gendarmerie, etc.)
- [x] osm — POI notables (sommets, mairie, tourisme, points d'eau)
- [x] entreprises — Établissements SIRENE ouverts
- [x] rpg — Registre Parcellaire Graphique (parcelles agricoles)
- [x] signes_qualite — AOP/IGP du territoire

**API (5 endpoints)** :
- [x] `/api/couches` — Liste des couches avec stats
- [x] `/api/couches/:slug/geojson` — GeoJSON d'une couche
- [x] `/api/territoire` — Polygones des communes
- [x] `/api/alti` — Proxy altimétrie IGN
- [x] `/api/recherche` — Recherche unifiée

**Frontend (5 pages avec contenu)** :
- [x] Accueil — Hero avec stats dynamiques (nb objets depuis /api/couches), grille des 13 thématiques, encart sources
- [x] Carte — Explorateur cartographique complet avec relief 3D
- [x] Population — Carte des adresses BAN clusterisées
- [x] Géographie — Carte avec relief 3D centré sur Mont Aigoual
- [x] Économie — Carte des entreprises + RPG + signes qualité
- [x] Sources — Catalogue complet des sources

**Infrastructure** :
- [x] Docker Compose (db, api, worker, caddy)
- [x] Postgres 16 + PostGIS 3.4
- [x] Migrations automatiques au démarrage
- [x] Reverse proxy Caddy avec SSL
- [x] Configuration partagée (territoire.ts, sections.ts)

### Ce qui reste à faire (Briques 2 à 5)

**Brique 2 — Données socio-économiques** :
- [ ] Source INSEE — Population légale (API Melodi sans clé)
- [ ] Source INSEE — Dossier complet commune + EPCI
- [ ] Pages population : graphiques démographie, logement (résidences secondaires)
- [ ] Pages économie : complément avec BPE (Base Permanente des Équipements)

**Brique 3 — Finances et administration** :
- [ ] Source OFGL — Comptes des collectivités (API v2.1 obligatoire)
- [ ] Source DGFiP — Balances comptables
- [ ] Source Marchés publics — DECP
- [ ] Pages finances : graphiques évolution budgets
- [ ] Pages services : complément avec FINESS (santé)

**Brique 4 — Environnement & Risques** :
- [ ] Source Météo-France (nécessite token OAuth) — Observations temps réel + vigilance 🔑
- [ ] Source Atmo Occitanie — Indice qualité de l'air
- [ ] Source Hub'Eau complément — Qualité rivières, prélèvements
- [ ] Pages météo : normales climatiques, séries historiques
- [ ] Pages environnement : complément avec Parc national des Cévennes
- [ ] Pages risques : complément avec zonage sismique, radon, Cat-Nat, feu de forêt

**Brique 5 — Tourisme & Mobilité** :
- [ ] Source DATAtourisme (nécessite clé gratuite) — POI touristiques 🔑
- [ ] Source PDIPR Gard — Sentiers GR/GRP/PR (GeoJSON/SHP)
- [ ] Source liO Occitanie — Réseau de transport (GTFS)
- [ ] Source Département du Gard — Données locales
- [ ] Pages tourisme : randonnées, hébergements, patrimoine
- [ ] Pages mobilité : arrêts, lignes, horaires
- [ ] Source Élections — Résultats électoraux + RNE
- [ ] Pages démocratie : usus, élus, résultats

### Priorités immédiates (Prochaines étapes)

1. **Finaliser Brique 1** :
   - [ ] Tester l'intégration complète des 11 sources
   - [ ] Vérifier les performances (temps de réponse API, rendu carte)
   - [ ] Corriger les bugs éventuels (logs, erreurs de fetch)
   - [ ] Documenter le déploiement (README, variables d'environnement)

2. **Déployer en production** :
   - [ ] Configurer le VPS (Docker, Docker Compose)
   - [ ] Configurer le nom de domaine et SSL (Caddy)
   - [ ] Configurer les variables d'environnement (POSTGRES_*, SITE_DOMAIN)
   - [ ] Lancer le stack complet : `docker-compose up --build -d`
   - [ ] Vérifier que toutes les sources s'exécutent correctement
   - [ ] Configurer la surveillance (logs, healthchecks)

3. **Monitoring et maintenance** :
   - [ ] Configurer la rotation des logs
   - [ ] Configurer les sauvegardes de la base de données
   - [ ] Documenter les procédures de mise à jour
   - [ ] Créer un script de vérification (healthcheck complet)

---

## Points de vigilance techniques

### Problèmes rencontrés et solutions implémentées

| Problème | Solution implémentée | Localisation |
|---|---|---|
| node:https vs undici (Node 22) | Utilisation de `node:https` pour télécharger BAN (undici échoue avec UND_ERR_SOCKET) | `adresses.ts:19-30` |
| Coordonnées inversées (lon/lat) | `corrigerCoordonnees()` dans `geo.ts` vérifie et corrige l'inversion | `shared/src/geo.ts` |
| Overpass 502/504 fréquents | Retry sur plusieurs endpoints (overpass-api.de, kumi.systems) | `osm.ts:18-39` |
| WAF Hub'Eau (403) | User-Agent serveur : `opendata-vda-worker/1.0` | `hubeau.ts:40` |
| API v1 OFGL (400) | Utilisation de l'API v2.1 uniquement | Documenté |
| Recherche BAN par apostrophe | Filtre par code INSEE plutôt que par nom | `adresses.ts:68` |
| INPN dégradé (cyberattaque 2025) | Passage par API Carto Nature (mêmes données) | `apicarto.ts` |

### Bonnes pratiques implémentées

1. **Streaming des gros fichiers** :
   - BAN : lecture en streaming (node:zlib + node:readline), pas de bufferisation complète
   - Traitement par lots (`upsertObjetsEnLot` avec TAILLE_LOT = 1000)
   - Purge des données obsolètes (delete ... where maj < début_du_run)

2. **Gestion des erreurs** :
   - Chaque job est isolé (erreur d'un job n'arrête pas les autres)
   - Logging systématique (meta.fetch_log + console)
   - Retry sur les endpoints alternatifs (Overpass)

3. **Validation des données** :
   - Vérification des colonnes requises (BAN)
   - Correction des coordonnées (détection bbox territoire)
   - Filtrage par codes INSEE/EPCI du territoire

4. **Cache** :
   - Cache HTTP sur `/api/couches/:slug/geojson` (1h)
   - PMTiles locales pour le relief 3D (pas de dépendance externe au runtime)

5. **PostgreSQL** :
   - Index GIST sur les géométries pour requêtes spatiales rapides
   - Index B-tree sur les champs de filtrage fréquents
   - Contraintes d'unicité pour éviter les doublons
   - Migrations automatiques au démarrage

---

## Aspects juridiques et attributions

### Licences par source

| Licence | Sources concernées | Attribution requise |
|---|---|---|
| **Licence Ouverte 2.0** | geo.api.gouv.fr, Géorisques/BRGM, Hub'Eau, INSEE, OFGL, DGFiP, Annuaire Éducation, Annuaire Administration, IGN (API Carto), Recherche Entreprises, BAN | "Source : [Nom de la source]" |
| **ODbL** | OpenStreetMap, Atmo Occitanie, liO/GTFS | "© contributeurs OpenStreetMap" (visible) |
| **Autres** | BRGM (géologie) | "© BRGM" |

### Implémentation dans le code

**Catalogue des sources** (`packages/shared/src/territoire.ts`) :
```typescript
interface SourceCatalogue {
  slug: string;
  nom: string;
  url: string;
  licence: string;
  frequence: string;
  theme: SectionSlug;
}
```

**Page sources.astro** :
- Affiche le catalogue complet groupé par section
- Affiche pour chaque source : nom, fréquence, licence, lien vers la source
- Générée à partir de `CATALOGUE_SOURCES`

**Composant Attribution** :
- À afficher sur chaque bloc de données
- Format : "Source : [nom] ([licence])"
- Pour les données ODbL : attribution visible obligatoire

---

## Déploiement

### Pré-requis

- VPS avec Docker et Docker Compose installés
- Node.js 22+ (pour le build, optionnel en production car utilisation de tsx)
- pnpm 11.10.0+ (pour la gestion des workspaces)
- Domaine DNS configuré (pour SSL Let's Encrypt)

### Configuration

1. **Variables d'environnement** (fichier `.env`) :
```bash
POSTGRES_USER=opendata
POSTGRES_PASSWORD=changeme
POSTGRES_DB=opendata_vda
SITE_DOMAIN=opendata-valdaigoual.fr
```

2. **Générer les PMTiles** (optionnel, seulement si la zone change) :
```bash
# Installer go-pmtiles : https://github.com/protomaps/go-pmtiles/releases
pmtiles extract https://download.mapterhorn.com/planet.pmtiles apps/web/public/relief/aigoual.pmtiles --bbox=3.2,43.8,4.1,44.4 --maxzoom=12
pmtiles extract https://download.mapterhorn.com/6-32-23.pmtiles apps/web/public/relief/aigoual-hd.pmtiles --bbox=3.2,43.8,4.1,44.4 --maxzoom=15
```

3. **Lancer le stack** :
```bash
# Construction des images
docker-compose build

# Lancement en mode détaché
docker-compose up -d

# Vérifier les logs
docker-compose logs -f

# Arrêter
docker-compose down
```

### Commandes utiles

```bash
# Lancer tous les jobs une fois (pour initialiser la base)
docker-compose run --rm worker sh -c "RUN_ONCE=true tsx src/index.ts"

# Lancer un seul job
docker-compose run --rm worker sh -c "RUN_ONCE=true RUN_ONLY=adresses tsx src/index.ts"

# Reconstruire le frontend
docker-compose build web

# Mettre à jour les dépendances
pnpm install
```

### Architecture Docker

| Service | Image | Ports | Volume | Dépendances |
|---|---|---|---|---|
| db | postgis/postgis:16-3.4-alpine | 5432 | db_data | - |
| api | node:22-alpine (build) | 3000 | - | db |
| worker | node:22-alpine (build) | - | - | db |
| caddy | caddy:2 (build) | 8080:80 | caddy_data, caddy_config | api |

---

## Vérification (tests de bout en bout)

### Tests manuels

1. **Scripts de fetch** :
   ```bash
   # Exécuter tous les jobs une fois
   docker-compose run --rm worker sh -c "RUN_ONCE=true tsx src/index.ts"
   ```
   Vérifier que :
   - Chaque job logge `[slug] ok — X lignes`
   - Aucune erreur dans meta.fetch_log
   - Les tables couches.objets et territoire.communes sont peuplées

2. **API** :
   ```bash
   # Liste des couches
   curl http://localhost:3000/api/couches | jq
   
   # GeoJSON d'une couche
   curl http://localhost:3000/api/couches/adresse/geojson | jq '.features | length'
   
   # Recherche
   curl "http://localhost:3000/api/recherche?q=mairie" | jq
   
   # Territoire
   curl http://localhost:3000/api/territoire | jq
   ```

3. **Dev frontend** :
   ```bash
   cd apps/web
   pnpm dev:web
   ```
   Vérifier que :
   - `http://localhost:3001` s'affiche sans erreur console
   - La page d'accueil affiche les stats (nb objets)
   - La carte `/carte` charge toutes les couches
   - Les pages thématiques avec contenu s'affichent correctement

4. **Build & production** :
   ```bash
   pnpm build:web
docker-compose up -d
   ```
   Vérifier que :
   - `http://localhost:8080` fonctionne
   - Toutes les pages sont accessibles
   - La carte s'affiche correctement

### Points de vérification critiques

- [ ] Toutes les 11 sources exécutent sans erreur
- [ ] La base de données contient des objets dans toutes les couches
- [ ] L'API répond correctement à toutes les routes
- [ ] Le frontend s'affiche sans erreur (console vide)
- [ ] La carte charge toutes les couches visibles
- [ ] Le relief 3D fonctionne (z13-15 utilise aigoual-hd.pmtiles)
- [ ] La recherche unifiée retourne des résultats pertinents
- [ ] Les pages thématiques avec contenu s'affichent correctement

---

## Actions préalables requises (côté commanditaire)

### Pour les sources nécessitant des clés API

1. **Météo-France** :
   - Créer une application sur `portail-api.meteofrance.fr`
   - Obtenir le token OAuth pour DPObs (temps réel) et Vigilance
   - Sans ce token : on se limite aux normales (PDF) et séries CSV

2. **DATAtourisme** :
   - Demander une clé gratuite pour le flux Occitanie (code `OCC`)
   - Permet l'accès aux POI touristiques riches

### Pour le déploiement

1. **VPS** :
   - Fournir un VPS avec :
     - 2 vCPU minimum
     - 4 Go RAM minimum
     - 20 Go disque (pour les PMTiles : ~2 Go)
     - Docker et Docker Compose installés
   - Ouvrir les ports 80 et 443 (ou 8080 si test local)

2. **Nom de domaine** :
   - Fournir un nom de domaine pour le site
   - Configurer le DNS pour pointer vers l'IP du VPS

3. **Supervision** (optionnel mais recommandé) :
   - Accès aux logs du VPS
   - Alertes en cas de panne
   - Sauvegardes automatiques de la base de données

---

## Historique des versions

| Version | Date | Description | Auteur |
|---|---|---|---|
| v1 | 2026-07-08 | Vision initiale complète — Astro + serverless (Cloudflare/Netlify) | - |
| v2 | 2026-07-08 | Mise à jour architecture — VPS Docker Compose + PostgreSQL/PostGIS (MVP Brique 1) | - |
| v3 | 2026-07-10 | État réel du code : 11 sources implémentées, architecture détaillée | - |
| v4 | 2026-07-10 | **Version actuelle** — Correction des fautes, mise à jour complète, structure améliorée | Mistral Vibe |

---

## Annexes

### Structure des dossiers détaillée

Voir [CLAUDE.md](../CLAUDE.md) pour une documentation technique complète destinée aux développeurs et agents IA.

### Commandes pnpm

```bash
# Installation
pnpm install

# Développement
pnpm dev:web    # Frontend Astro
pnpm dev:api    # API Fastify
pnpm dev:worker # Worker

# Build
pnpm build:web

# Production
pnpm worker:once      # Exécuter tous les jobs une fois
pnpm worker:once RUN_ONLY=adresses  # Un seul job

# Docker
docker-compose up --build  # Lancer tout
docker-compose down         # Arrêter tout
```

### Architecture des données

**Flux des données** :
```
Sources externes (API publiques)
    ↓
Worker (apps/worker) — Ingestion planifiée
    ↓
PostgreSQL/PostGIS (db) — Stockage
    ↓
API Fastify (apps/api) — Service
    ↓
Frontend Astro (apps/web) — Affichage
```

**Volume de données estimé** :
- Adresses BAN : ~1 500 objets
- Contours communes : 16 objets
- POI OSM : ~50 objets
- Natura 2000 / ZNIEFF : ~15 objets
- Stations Hub'Eau : ~10 objets
- Entreprises : ~20 objets
- RPG : variable (parcelles)
- **Total objets** : ~2 000 à 5 000 (selon sources actives)
- **Total PMTiles** : ~2 Go (relief HD)

---

> **Note finale** : Ce document décrit l'état **actuel** du projet au 10 juillet 2026. L'architecture implémentée (Docker Compose + PostgreSQL/PostGIS) diffère de la vision initiale (Astro + serverless) mais permet une plus grande flexibilité et un déploiement auto-hébergé. La **Brique 1** (explorateur cartographique) est quasi-complète avec **11 sources opérationnelles**. Les Briques 2 à 5 (socio-économie, finances, environnement, tourisme) restent à développer selon les priorités du commanditaire.
