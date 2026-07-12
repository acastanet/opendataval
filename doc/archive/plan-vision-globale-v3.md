# Plan — Portail Open Data : Val-d'Aigoual & CC Causses Aigoual Cevennes
## Version 3 — Architecture implementee & Etat des developpements

> **Document de reference** : Ce document remplace et met a jour [plan-vision-globale-v2.md](plan-vision-globale-v2.md) et [plan-vision-globale.md](plan-vision-globale.md).
> Il decrit **l'architecture reelle implementee** (VPS Docker Compose + PostgreSQL/PostGIS) et l'**etat actuel des developpements**.
> Date de mise a jour : 2026-07-10

---

## Contexte et objectifs

La commune de **Val-d'Aigoual** (Gard) et son intercommunalite, la **Communaute de communes Causses Aigoual Cevennes - Terres Solidaires**, ne disposent d'aucun point d'entree unique presentant les donnees publiques du territoire.

Ces donnees existent en abondance et sont ouvertes (Licence Ouverte / ODbL) : population, geographie de montagne, climat exceptionnel du Mont Aigoual, risques naturels, biodiversite (coeur du Parc national des Cevennes), eau, finances, tourisme, services...

**Objectif** : construire un **portail territorial open data** qui agrege et met en valeur **l'ensemble** de ces donnees, a la fois comme :
- Portail grand public (habitants + touristes)
- Observatoire chiffre
- Explorateur cartographique interactif

**Decisions validees avec le commanditaire** :
- Vocation : **toutes les donnees** — le site combine presentation editoriale, tableaux de bord et carte SIG
- **Architecture retenue** : serveur auto-heberge (VPS ~2 vCPU / 4 Go) avec **PostgreSQL + PostGIS**, services Node.js/TypeScript (Fastify), worker d'ingestion planifie, frontend Astro — orchestre par **Docker Compose**
- Perimetre : **couverture large par briques** — Brique 1 centre sur l'explorateur cartographique, puis extension progressive aux autres domaines
- **Approche incrementale** : Deployement par briques fonctionnelles, chaque brique ajoutant de nouvelles sources et fonctionnalites

---

## Identite du territoire

Ces constantes pilotent **toutes** les requetes API. Centralisees dans `packages/shared/src/territoire.ts`.

| Element | Valeur | Verifie via | Implementation |
|---|---|---|---|
| Commune | **Val-d'Aigoual** | geo.api.gouv.fr | ✅ |
| Code INSEE (COG) | **30339** | geo.api.gouv.fr `/communes` | ✅ |
| SIREN commune | **200082725** | OFGL / recherche-entreprises | ✅ |
| Code postal | **30570** | geo.api | ✅ |
| Communes deleguees | **Valleraugue** (chef-lieu, ex-30339) + **Notre-Dame-de-la-Rouviere** (ex-30190) | fusion 01/01/2019 | ✅ |
| EPCI | **CC Causses Aigoual Cevennes - Terres Solidaires** | geo.api `/epcis` | ✅ |
| SIREN / code EPCI | **200034601** (identiques) | geo.api / recherche-entreprises | ✅ |
| Communes membres EPCI | **15** | `/epcis/200034601/communes` | ✅ |
| Population commune | **1 412** (municipale) / 1 418 (2022, INSEE) | geo.api / INSEE | ✅ |
| Population EPCI | **5 391** | geo.api | ✅ |
| Centroide | 3.6272 E / 44.081 N | geo.api | ✅ |
| Mairie | 3.6414 E / 44.081 N | geo.api | ✅ |
| Superficie | 9 561.82 ha (~ 95.6 km2) | geo.api | ✅ |
| **Mont Aigoual (sommet)** | **44.1216 N / 3.5814 E**, alt. ~ 1567 m | OSM node 26863762 / IGN | ✅ |
| **Station meteo** | **NUM_POSTE 30339001** (SYNOP/OMM 07560) | Meteo-France | ✅ |
| **BBOX territoire** | `[3.52, 44.02, 3.75, 44.15]` | contours calcules | ✅ |
| Region / Departement | Occitanie (76) / Gard (30) | geo.api | ✅ |

**15 communes EPCI** (INSEE, population) :
Causse-Begon (30074,25) - Dourbies (30105,177) - L'Estréchure (30108,151) - Lanuejols (30139,341) - Lasalle (30140,1202) - Peyrolles-en-Cevennes (30195,30) - Les Plantiers (30198,228) - Revens (30213,37) - Saint-Andre-de-Majencoules (30229,599) - Saint-Andre-de-Valborgne (30231,366) - Saint-Sauveur-Camprieu (30297,207) - Saumane (30310,303) - Soudorgues (30322,269) - Treves (30332,116) - **Val-d'Aigoual (30339,1412)**.

---

## Architecture technique implementee

### Schema global

```
opendata-vda/
├─ apps/
│  ├─ worker/                    # Worker d'ingestion (Node.js + TypeScript)
│  │  ├─ src/
│  │  │  ├─ index.ts             # Point d'entree, gestion des migrations, scheduler
│  │  │  ├─ scheduler.ts         # Definition des jobs planifies (JOBS)
│  │  │  └─ sources/             # 11 sources implementees
│  │  │     ├─ geoapi.ts         # Contours communes + EPCI
│  │  │     ├─ adresses.ts       # Base Adresse Nationale (streaming CSV gzip)
│  │  │     ├─ georisques.ts     # Risques (cavites, mouvements de terrain)
│  │  │     ├─ hubeau.ts         # Piezo + hydrometrie
│  │  │     ├─ apicarto.ts       # Natura 2000, ZNIEFF
│  │  │     ├─ education.ts      # Annuaire education
│  │  │     ├─ lannuaire.ts      # Annuaire administration
│  │  │     ├─ osm.ts            # POI OpenStreetMap (Overpass)
│  │  │     ├─ entreprises.ts    # Etablissements SIRENE
│  │  │     ├─ rpg.ts            # Registre Parcellaire Graphique
│  │  │     └─ signesQualite.ts  # AOP/IGP INAO
│  │  └─ Dockerfile
│  │
│  ├─ api/                       # API Fastify (Node.js + TypeScript)
│  │  ├─ src/
│  │  │  ├─ index.ts
│  │  │  ├─ routes/
│  │  │  │  ├─ couches.ts        # /api/couches, /api/couches/:slug/geojson
│  │  │  │  ├─ territoire.ts     # /api/territoire
│  │  │  │  └─ outils.ts         # /api/alti, /api/recherche
│  │  │  └─ plugins/
│  │  └─ Dockerfile
│  │
│  └─ web/                       # Frontend Astro (site statique + iles Svelte)
│     ├─ src/
│     │  ├─ pages/               # 14 pages thematiques
│     │  │  ├─ index.astro        # Accueil (heros + stats + thematiques)
│     │  │  ├─ carte.astro        # Carte interactive plein ecran
│     │  │  ├─ territoire.astro   # Identite du territoire
│     │  │  ├─ population.astro   # Demographie (BAN clusterisee)
│     │  │  ├─ geographie.astro   # Relief 3D + altimetrie
│     │  │  ├─ meteo.astro
│     │  │  ├─ environnement.astro
│     │  │  ├─ risques.astro
│     │  │  ├─ services.astro
│     │  │  ├─ economie.astro     # Entreprises + RPG + signes qualite
│     │  │  ├─ finances.astro
│     │  │  ├─ tourisme.astro
│     │  │  ├─ mobilite.astro
│     │  │  ├─ democratie.astro
│     │  │  └─ sources.astro      # Catalogue complet
│     │  │
│     │  ├─ islands/              # Composants interactifs Svelte
│     │  │  ├─ MapExplorer.svelte  # Carte complete (MapLibre GL)
│     │  │  ├─ CarteThematique.svelte # Carte legere pour pages thematiques
│     │  │  └─ RechercheLieux.svelte # Autocomplete recherche
│     │  │
│     │  ├─ lib/                  # Utilitaires front
│     │  │  └─ carte.ts          # Config carte (fonds IGN, relief 3D)
│     │  └─ layouts/
│     │
│     └─ Dockerfile
│
├─ packages/
│  └─ shared/                    # Package partage (@opendata-vda/shared)
│     ├─ src/
│     │  ├─ index.ts
│     │  ├─ territoire.ts        # Constantes + CATALOGUE_SOURCES
│     │  ├─ sections.ts          # Taxonomie des 13 sections
│     │  ├─ db.ts                # Acces Postgres (upsertCommune, upsertObjet...)
│     │  ├─ migrate.ts           # Gestion des migrations SQL
│     │  └─ geo.ts               # Utilitaires geo
│     └─ package.json
│
├─ db/
│  └─ migrations/                # Migrations PostgreSQL/PostGIS
│     ├─ 001_init.sql
│     └─ 002_recherche.sql
│
├─ docker-compose.yml
├─ Dockerfile.caddy
├─ Caddyfile
└─ CLAUDE.md
```

### Stack technique detaillee

| Composant | Technologie | Role | Port | Etat |
|---|---|---|---|---|
| **Base de donnees** | PostgreSQL 16 + PostGIS 3.4 (alpine) | Stockage geolocalise + metadonnees | 5432 | ✅ |
| **Worker** | Node.js 22 + TypeScript + tsx | Ingestion planifiee des sources | - | ✅ |
| **API** | Fastify + TypeScript + tsx | Service des donnees (GeoJSON, recherche) | 3000 | ✅ |
| **Frontend** | Astro 4 + iles Svelte + MapLibre GL JS | Site statique + cartes interactives | - | ✅ |
| **Reverse Proxy** | Caddy 2 | SSL (Let's Encrypt), reverse proxy /api -> api | 8080 | ✅ |

### Modele de donnees PostgreSQL/PostGIS

**4 schemas principaux** (definis dans `db/migrations/001_init.sql`) :

1. **`territoire.communes`** — Polygones et metadonnees des communes
   - code_insee (PK), nom, code_epci, population, surface_ha, est_epci_membre, geom (MultiPolygon, 4326), maj
   - Index GIST sur geom

2. **`couches.objets`** — Table generique pour tous les objets geolocalises
   - id (serial PK), couche (text), external_id (text), props (jsonb), geom (Geometry, 4326), source_url (text), maj (timestamptz)
   - Contrainte unique : (couche, external_id)
   - Index GIST sur geom, index B-tree sur couche

3. **`series.piezo`** — Chroniques de mesures piezometriques
   - code_bss (PK), date (PK), niveau_m_ngf (numeric)

4. **`meta.sources`** / **`meta.fetch_log`** — Catalogue et journal d'execution
   - sources : slug (PK), nom, url, licence, frequence
   - fetch_log : id (serial PK), source, demarre_a, termine_a, statut, nb_lignes, erreur
   - Index sur (source, demarre_a desc)

**Migration 002** (`db/migrations/002_recherche.sql`) :
- Ajoute extensions pg_trgm et unaccent
- Cree vue couches.lieux_recherche pour recherche tolerante aux fautes

---

## Catalogue des sources implementees

### Etat actuel : 11 sources operationnelles

Toutes les sources sont **sans cle API** (sauf mention contraire).

| Slug | Source | Point d'entree | Frequence | Theme | Etat |
|---|---|---|---|---|---|
| `geoapi` | API Decoupage administratif | geo.api.gouv.fr/communes/30339 + /epcis/200034601/communes | mensuelle | territoire | ✅ |
| `adresse` | Base Adresse Nationale (BAN) | adresse.data.gouv.fr/data/ban/adresses/latest/csv/adresses-30.csv.gz | mensuelle | population | ✅ |
| `georisques` | Georisques (cavites + mouvements) | georisques.gouv.fr/api/v1/gaspar/ | mensuelle | risques | ✅ |
| `hubeau` | Hub'Eau (piezo + hydro) | hubeau.eaufrance.fr/api/v1-2/ | quotidienne | environnement | ✅ |
| `apicarto` | API Carto IGN (natura2000 + znieff) | apicarto.ign.fr/api/nature/ | trimestrielle | environnement | ✅ |
| `education` | Annuaire Education | data.education.gouv.fr/api/explore/v2.1/ | mensuelle | services | ✅ |
| `lannuaire` | Annuaire Administration | api-lannuaire.service-public.fr/api/explore/v2.1/ | mensuelle | services | ✅ |
| `osm` | OpenStreetMap (Overpass) | overpass-api.de/api/interpreter | hebdomadaire | tourisme | ✅ |
| `entreprises` | Recherche Entreprises (SIRENE) | recherche-entreprises.api.gouv.fr/search | mensuelle | economie | ✅ |
| `rpg` | Registre Parcellaire Graphique | geoservices.ign.fr/rpg | annuelle | economie | ✅ |
| `signes_qualite` | INAO AOP/IGP | data.gouv datasets | annuelle | economie | ✅ |

**Sources planifiees mais non encore implementees** :
- INSEE — Population legale (API Melodi)
- INSEE — Dossier complet
- OFGL — Finances communales
- Balances comptables DGFiP
- Meteo-France (necessite token OAuth)
- Atmo Occitanie — Qualite de l'air
- DATAtourisme (necessite cle)
- PDIPR Gard — Sentiers
- liO Occitanie — Mobilite (GTFS)
- FINESS — Sante
- Elections / RNE

---

## Scheduler et planification

Le worker (`apps/worker/src/scheduler.ts`) gere **11 jobs planifies** via `node-cron` :

```typescript
// Expression cron : minute heure jour_mois mois jour_semaine
JOBS: SourceJob[] = [
  { slug: "geoapi", cron: "0 3 1 * *", run: geoapi.run },          // mensuel, 1er du mois a 3h
  { slug: "georisques", cron: "0 3 2 * *", run: georisques.run },  // mensuel, 2 du mois a 3h
  { slug: "apicarto", cron: "0 3 1 */3 *", run: apicarto.run },     // trimestriel
  { slug: "education", cron: "0 3 3 * *", run: education.run },    // mensuel, 3 du mois
  { slug: "lannuaire", cron: "0 3 4 * *", run: lannuaire.run },    // mensuel, 4 du mois
  { slug: "osm", cron: "0 3 * * 1", run: osm.run },                // hebdomadaire, lundi a 3h
  { slug: "hubeau", cron: "0 5 * * *", run: hubeau.run },          // quotidien a 5h
  { slug: "adresses", cron: "0 4 5 * *", run: adresses.run },      // mensuel, 5 du mois
  { slug: "entreprises", cron: "0 4 6 * *", run: entreprises.run },// mensuel, 6 du mois
  { slug: "rpg", cron: "0 4 15 1 *", run: rpg.run },              // annuel, 15 janvier
  { slug: "signes_qualite", cron: "0 4 20 1 *", run: signesQualite.run }, // annuel, 20 janvier
];
```

**Fonctionnement** :
- Chaque job est encapsule dans `runJob()` qui enregistre :
  - Debut d'execution dans `meta.fetch_log` (logFetchStart)
  - Fin avec statut (ok/erreur) et nombre de lignes (logFetchEnd)
  - Log console : `[slug] ok — X lignes` ou `[slug] erreur — [message]`
- **Mode RUN_ONCE** : `RUN_ONCE=true tsx src/index.ts` execute tous les jobs une fois puis quitte
- **Mode RUN_ONLY** : `RUN_ONLY=adresses` pour n'executer qu'un seul job
- **Gestion des erreurs** : Chaque job continue meme si un autre echoue

---

## API Fastify

L'API (`apps/api/src/`) expose les endpoints suivants :

### Routes principales

| Endpoint | Methode | Description | Cache |
|---|---|---|---|
| `/api/couches` | GET | Liste toutes les couches avec compte d'objets et derniere maj | - |
| `/api/couches/:slug/geojson` | GET | GeoJSON des objets d'une couche (slug valide) | 1h |
| `/api/territoire` | GET | Polygones des communes (territoire.communes) | - |
| `/api/alti?lon=X&lat=Y` | GET | Proxy vers l'API altimetrique IGN | - |
| `/api/recherche?q=TERME` | GET | Recherche unifiee (BAN + PostGIS) | - |

**Detail technique** :
- Validation des slugs contre `CATALOGUE_SOURCES` (Set des slugs autorises)
- `/api/couches/:slug/geojson` : retourne `ST_AsGeoJSON(geom, 6)` avec props et source_url
- `/api/recherche` : fusionne en parallele BAN (autocomplete avec biais geo) et recherche pg_trgm sur vue couches.lieux_recherche

---

## Frontend Astro + Svelte

### Structure des pages (14 pages)

| Page | Contenu | Etat | Composants |
|---|---|---|---|
| `index.astro` | Accueil (heros, stats dynamiques, grille thematiques, encart sources) | ✅ | - |
| `carte.astro` | Carte interactive plein ecran | ✅ | MapExplorer.svelte |
| `territoire.astro` | Identite du territoire | Placeholder | - |
| `population.astro` | Demographie + adresses BAN clusterisees | ✅ | CarteThematique.svelte |
| `geographie.astro` | Relief 3D + altimetrie (centre Mont Aigoual) | ✅ | CarteThematique.svelte |
| `meteo.astro` | Meteo & climat | Placeholder | - |
| `environnement.astro` | Natura 2000, ZNIEFF, eau | Placeholder | - |
| `risques.astro` | Risques naturels | Placeholder | - |
| `services.astro` | Administration, education | Placeholder | - |
| `economie.astro` | Entreprises, RPG, signes qualite | ✅ | CarteThematique.svelte |
| `finances.astro` | Finances publiques | Placeholder | - |
| `tourisme.astro` | Tourisme (POI OSM) | Placeholder | - |
| `mobilite.astro` | Mobilite | Placeholder | - |
| `democratie.astro` | Vie democratique | Placeholder | - |
| `sources.astro` | Catalogue complet des sources | ✅ | - |

**Legende** :
- ✅ = Implementee avec contenu reel
- Placeholder = Page existante mais avec contenu minimal (en preparation)

### Composants Svelte (iles interactives)

1. **`MapExplorer.svelte`** (carte.astro) :
   - Carte MapLibre GL complete
   - Fonds : IGN WMTS (PLANIGNV2, ORTHOPHOTOS) + geologie BRGM WMS
   - Couches dynamiques : charge toutes les couches non vides via /api/couches puis /api/couches/:slug/geojson
   - Fonctionnalites : panneau de couches, recherche (RechercheLieux), popups, relief 3D avec slider d'exageration
   - Gestion des groupes de couches (GROUPES_ACTIFS_DEFAUT)

2. **`CarteThematique.svelte`** (pages thematiques) :
   - Carte legere et reutilisable
   - Props : couches (array), cluster (boolean), hauteur, afficherContours, relief3d
   - Fond IGN plan seul, contours du territoire optionnels
   - Une couche par slug fourni, popups simples
   - Mode relief3d : active le terrain 3D avec camera initiale inclinee

3. **`RechercheLieux.svelte`** :
   - Composant de recherche autonome
   - Autocomplete a la frappe, debounce, navigation clavier
   - Pattern ARIA combobox
   - Interroge /api/recherche
   - Emet evenement selection (flyTo + marqueur temporaire)

### Configuration cartographique

**`apps/web/src/lib/carte.ts`** centralise :
- Constantes WMTS IGN : URL, LAYERS (PLANIGNV2, ORTHOPHOTOS, ELEVATION.SLOPES), TILEMATRIXSET
- Constantes WMS BRGM pour la geologie
- Mapping COULEUR_COUCHE et NOM_COUCHE (a maintenir en coherence manuelle avec CATALOGUE_SOURCES)
- Helpers de relief 3D :
  - `enregistrerProtocolePmtiles` : registre protocole personnalise `aigoualdem://`
  - `activerRelief` / `desactiverRelief` : gestion du terrain
  - `reglerExagerationRelief` : ajustement de l'exageration
- `ajouterCoucheClusterisee` : source GeoJSON clusterisee + layers clusters/compteur/points individuels

**Relief 3D** :
- Utilise deux archives PMTiles locales (pas d'appel reseau au runtime) :
  - Fond global z0-12 : `public/relief/aigoual.pmtiles` (~60 Mo, Copernicus GLO-30, ~30m/pixel)
  - Extrait HD z13-15 : `public/relief/aigoual-hd.pmtiles` (~2 Go, LiDAR HD IGN, ~3-4m/pixel)
- Le protocole `aigoualdem://{z}/{x}/{y}` route vers :
  - aigoual-hd.pmtiles au-dessus de z13
  - aigoual.pmtiles en dessous de z13
  - Repli sur la tuile ancetre z12 du fond global si la tuile HD est absente (bord de bbox)

**Generer les PMTiles** (si la zone change) :
```bash
# Fond global z0-12 (Copernicus GLO-30)
pmtiles extract https://download.mapterhorn.com/planet.pmtiles apps/web/public/relief/aigoual.pmtiles --bbox=3.2,43.8,4.1,44.4 --maxzoom=12

# Extrait HD z13-15 (LiDAR HD IGN via archive regionale 6-32-23)
pmtiles extract https://download.mapterhorn.com/6-32-23.pmtiles apps/web/public/relief/aigoual-hd.pmtiles --bbox=3.2,43.8,4.1,44.4 --maxzoom=15
```

---

## Feuille de route de mise en oeuvre

### Ce qui est deja implemente (Brique 1 - Fondations)

**Worker (11 sources)** :
- [x] geoapi — Contours communes et EPCI
- [x] adresses — Base Adresse Nationale (streaming CSV gzip du Gard, filtre sur 15 codes INSEE)
- [x] georisques — Cavites souterraines + mouvements de terrain
- [x] hubeau — Stations piezometriques + stations hydrometriques + chroniques de mesures
- [x] apicarto — Natura 2000 + ZNIEFF (intersection avec bbox territoire)
- [x] education — Etablissements scolaires
- [x] lannuaire — Services publics (mairie, CCAS, gendarmerie, etc.)
- [x] osm — POI notables (sommets, mairie, tourisme, points d'eau)
- [x] entreprises — Etablissements SIRENE ouverts
- [x] rpg — Registre Parcellaire Graphique (parcelles agricoles)
- [x] signes_qualite — AOP/IGP du territoire

**API (5 endpoints)** :
- [x] /api/couches — Liste des couches avec stats
- [x] /api/couches/:slug/geojson — GeoJSON d'une couche
- [x] /api/territoire — Polygones des communes
- [x] /api/alti — Proxy altimetrie IGN
- [x] /api/recherche — Recherche unifiee

**Frontend (5 pages avec contenu)** :
- [x] Accueil — Heros avec stats dynamiques (nb objets depuis /api/couches), grille des 13 thematiques, encart sources
- [x] Carte — Explorateur cartographique complet avec relief 3D
- [x] Population — Carte des adresses BAN clusterisees
- [x] Geographie — Carte avec relief 3D centre sur Mont Aigoual
- [x] Economie — Carte des entreprises + RPG + signes qualite
- [x] Sources — Catalogue complet des sources

**Infrastructure** :
- [x] Docker Compose (db, api, worker, caddy)
- [x] Postgres 16 + PostGIS 3.4
- [x] Migrations automatiques au demarrage
- [x] Reverse proxy Caddy avec SSL
- [x] Configuration partagée (territoire.ts, sections.ts)

### Ce qui reste a faire (Briques 2 a 5)

**Brique 2 — Donnees socio-economiques** :
- [ ] Source INSEE — Population legale (API Melodi sans cle)
- [ ] Source INSEE — Dossier complet commune + EPCI
- [ ] Pages population : graphiques demographie, logement (residences secondaires)
- [ ] Pages economie : complement avec BPE (Base Permanente des Equipements)

**Brique 3 — Finances et administration** :
- [ ] Source OFGL — Comptes des collectivites (API v2.1 obligatoire)
- [ ] Source DGFiP — Balances comptables
- [ ] Source Marches publics — DECP
- [ ] Pages finances : graphiques evolution budgets
- [ ] Pages services : complement avec FINESS (sante)

**Brique 4 — Environnement & Risques** :
- [ ] Source Meteo-France (necessite token OAuth) — Observations temps reel + vigilance
- [ ] Source Atmo Occitanie — Indice qualite de l'air quotidien
- [ ] Source Hub'Eau complement — Qualite rivieres, prelevements
- [ ] Pages meteo : normales climatiques, series historiques
- [ ] Pages environnement : complement avec Parc national des Cevennes
- [ ] Pages risques : complement avec zonage sismique, radon, Cat-Nat, feu de foret

**Brique 5 — Tourisme & Mobilite** :
- [ ] Source DATAtourisme (necessite cle gratuite) — POI touristiques
- [ ] Source PDIPR Gard — Sentiers GR/GRP/PR (GeoJSON/SHP)
- [ ] Source liO Occitanie — Reseau de transport (GTFS)
- [ ] Source Departement du Gard — Donnees locales
- [ ] Pages tourisme : randonnees, hebergements, patrimoine
- [ ] Pages mobilite : arrets, lignes, horaires
- [ ] Source Elections — Resultats electoraux + RNE
- [ ] Pages democratie :usus, elus, resultats

### Priorites immediates (Prochaines etapes)

1. **Finaliser Brique 1** :
   - [ ] Tester l'integration complete des 11 sources
   - [ ] Verifier les performances (temps de reponse API, rendu carte)
   - [ ] Corriger les bugs eventuels (logs, erreurs de fetch)
   - [ ] Documenter le deployement (README, variables d'environnement)

2. **Deployer en production** :
   - [ ] Configurer le VPS (Docker, Docker Compose)
   - [ ] Configurer le nom de domaine et SSL (Caddy)
   - [ ] Configurer les variables d'environnement (POSTGRES_*, SITE_DOMAIN)
   - [ ] Lancer le stack complet : `docker-compose up --build -d`
   - [ ] Verifier que toutes les sources s'executent correctement
   - [ ] Configurer la surveillance (logs, healthchecks)

3. **Monitoring et maintenance** :
   - [ ] Configurer la rotation des logs
   - [ ] Configurer les sauvegardes de la base de donnees
   - [ ] Documenter les procedures de mise a jour
   - [ ] Creer un script de verification (healthcheck complet)

---

## Points de vigilance techniques

### Problemes rencontres et solutions implementees

| Probleme | Solution implementee | Localisation |
|---|---|---|
| node:https vs undici (Node 22) | Utilisation de `node:https` pour telecharger BAN (undici echoue avec UND_ERR_SOCKET) | `adresses.ts:19-30` |
| Coordonnees inverses (lon/lat) | `corrigerCoordonnees()` dans `geo.ts` verifie et corrige l'inversion | `shared/src/geo.ts` |
| Overpass 502/504 fréquents | Retry sur plusieurs endpoints (overpass-api.de, kumi.systems) | `osm.ts:18-39` |
| WAF Hub'Eau (403) | User-Agent serveur : `opendata-vda-worker/1.0` | `hubeau.ts:40` |
| API v1 OFGL (400) | Utilisation de l'API v2.1 uniquement | Documenté |
| Recherche BAN par apostrophe | Filtre par code INSEE pluto que par nom | `adresses.ts:68` |
| INPN degrade (cyberattaque 2025) | Passage par API Carto Nature (memes donnees) | `apicarto.ts` |

### Bonnes pratiques implementees

1. **Streaming des gros fichiers** :
   - BAN : lecture en streaming (node:zlib + node:readline), pas de bufferisation complete
   - Traitement par lots (`upsertObjetsEnLot` avec TAILLE_LOT = 1000)
   - Purge des donnees obsolètes (delete ... where maj < debut_du_run)

2. **Gestion des erreurs** :
   - Chaque job est isole (erreur d'un job n'arrete pas les autres)
   - Logging systematique (meta.fetch_log + console)
   - Retry sur les endpoints alternatifs (Overpass)

3. **Validation des donnees** :
   - Verification des colonnes requises (BAN)
   - Correction des coordonnees (detection bbox territoire)
   - Filtrage par codes INSEE/EPCI du territoire

4. **Cache** :
   - Cache HTTP sur /api/couches/:slug/geojson (1h)
   - PMTiles locales pour le relief 3D (pas de dependance externe au runtime)

5. **PostgreSQL** :
   - Index GIST sur les geometries pour requetes spatiales rapides
   - Index B-tree sur les champs de filtrage frequents
   - Contraintes d'unicite pour eviter les doublons
   - Migrations automatiques au demarrage

---

## Aspects juridiques et attributions

### Licences par source

| Licence | Sources concernees | Attribution requise |
|---|---|---|
| **Licence Ouverte 2.0** | geo.api.gouv.fr, Georisques/BRGM, Hub'Eau, INSEE, OFGL, DGFiP, Annuaire Education, Annuaire Administration, IGN (API Carto), Recherche Entreprises | "Source : [Nom de la source]" |
| **ODbL** | OpenStreetMap, Atmo Occitanie, liO/GTFS | "© contributeurs OpenStreetMap" (visible) |
| **Autres** | BRGM (geologie) | "© BRGM" |

### Implementation dans le code

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
- Affiche le catalogue complet groupe par section
- Affiche pour chaque source : nom, frequence, licence, lien vers la source
- Generee a partir de `CATALOGUE_SOURCES`

**Composant Attribution** :
- A afficher sur chaque bloc de donnees
- Format : "Source : [nom] ([licence])"
- Pour les donnees ODbL : attribution visible obligatoire

---

## Deployement

### Pre-requis

- VPS avec Docker et Docker Compose installes
- Node.js 22+ (pour le build, optionnel en production car utilisation de tsx)
- pnpm 11.10.0+ (pour la gestion des workspaces)
- Domaine DNS configure (pour SSL Let's Encrypt)

### Configuration

1. **Variables d'environnement** (fichier `.env`) :
```bash
POSTGRES_USER=opendata
POSTGRES_PASSWORD=changeme
POSTGRES_DB=opendata_vda
SITE_DOMAIN=opendata-valdaigoual.fr
```

2. **Generer les PMTiles** (optionnel, seulement si la zone change) :
```bash
# Installer go-pmtiles : https://github.com/protomaps/go-pmtiles/releases
pmtiles extract https://download.mapterhorn.com/planet.pmtiles apps/web/public/relief/aigoual.pmtiles --bbox=3.2,43.8,4.1,44.4 --maxzoom=12
pmtiles extract https://download.mapterhorn.com/6-32-23.pmtiles apps/web/public/relief/aigoual-hd.pmtiles --bbox=3.2,43.8,4.1,44.4 --maxzoom=15
```

3. **Lancer le stack** :
```bash
# Construction des images
docker-compose build

# Lancement en mode detache
docker-compose up -d

# Verifier les logs
docker-compose logs -f

# Arreter
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

# Mettre a jour les dependances
pnpm install
```

### Architecture Docker

| Service | Image | Ports | Volume | Dependances |
|---|---|---|---|---|
| db | postgis/postgis:16-3.4-alpine | 5432 | db_data | - |
| api | node:22-alpine (build) | 3000 | - | db |
| worker | node:22-alpine (build) | - | - | db |
| caddy | caddy:2 (build) | 8080:80 | caddy_data, caddy_config | api |

---

## Verification (tests de bout en bout)

### Tests manuels

1. **Scripts de fetch** :
   ```bash
   # Executer tous les jobs une fois
   docker-compose run --rm worker sh -c "RUN_ONCE=true tsx src/index.ts"
   ```
   Verifier que :
   - Chaque job logge `[slug] ok — X lignes`
   - Aucune erreur dans meta.fetch_log
   - Les tables couches.objets et territoire.communes sont populated

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
   Verifier que :
   - `http://localhost:3001` s'affiche sans erreur console
   - La page d'accueil affiche les stats (nb objets)
   - La carte `/carte` charge toutes les couches
   - Les pages thematiques avec contenu s'affichent correctement

4. **Build & production** :
   ```bash
   pnpm build:web
docker-compose up -d
   ```
   Verifier que :
   - `http://localhost:8080` fonctionne
   - Toutes les pages sont accessibles
   - La carte s'affiche correctement

### Points de verification critiques

- [ ] Toutes les 11 sources executent sans erreur
- [ ] La base de donnees contient des objets dans toutes les couches
- [ ] L'API repond correctement a toutes les routes
- [ ] Le frontend s'affiche sans erreur (console vide)
- [ ] La carte charge toutes les couches visibles
- [ ] Le relief 3D fonctionne (z13-15 utilise aigoual-hd.pmtiles)
- [ ] La recherche unifiee retourne des resultats pertinents
- [ ] Les pages thematiques avec contenu s'affichent correctement

---

## Actions prealables requises (cote commanditaire)

### Pour les sources necessitant des cles API

1. **Meteo-France** :
   - Creer une application sur `portail-api.meteofrance.fr`
   - Obtenir le token OAuth pour DPObs (temps reel) et Vigilance
   - Sans ce token : on se limite aux normales (PDF) et series CSV

2. **DATAtourisme** :
   - Demander une cle gratuite pour le flux Occitanie (code `OCC`)
   - Permet l'acces aux POI touristiques riches

### Pour le deployement

1. **VPS** :
   - Fournir un VPS avec :
     - 2 vCPU minimum
     - 4 Go RAM minimum
     - 20 Go disque (pour les PMTiles : ~2 Go)
     - Docker et Docker Compose installes
   - Ouvrir les ports 80 et 443 (ou 8080 si test local)

2. **Nom de domaine** :
   - Fournir un nom de domaine pour le site
   - Configurer le DNS pour pointer vers l'IP du VPS

3. **Supervision** (optionnel mais recommande) :
   - Acces aux logs du VPS
   - Alertes en cas de panne
   - Sauvegardes automatiques de la base de donnees

---

## Historique des versions

| Version | Date | Description | Auteur |
|---|---|---|---|
| v1 | 2026-07-08 | Vision initiale complete — Astro + serverless (Cloudflare/Netlify) | - |
| v2 | 2026-07-08 | Mise a jour architecture — VPS Docker Compose + PostgreSQL/PostGIS (MVP Brique 1) | - |
| v3 | 2026-07-10 | **Version actuelle** — Etat reel du code : 11 sources implementees, architecture detaillee, feuille de route mise a jour | - |

---

## Annexes

### Structure des dossiers detaillee

Voir [CLAUDE.md](../CLAUDE.md) pour une documentation technique complete destinee aux developpeurs et agents IA.

### Commandes pnpm

```bash
# Installation
pnpm install

# Developpement
pnpm dev:web    # Frontend Astro
pnpm dev:api    # API Fastify
pnpm dev:worker # Worker

# Build
pnpm build:web

# Production
pnpm worker:once      # Executer tous les jobs une fois
pnpm worker:once RUN_ONLY=adresses  # Un seul job

# Docker
docker-compose up --build  # Lancer tout
docker-compose down         # Arreter tout
```

### Architecture des donnes

**Flux des donnes** :
```
Sources externes (API publiques)
    ↓
Worker (apps/worker) — Ingestion planifiee
    ↓
PostgreSQL/PostGIS (db) — Stockage
    ↓
API Fastify (apps/api) — Service
    ↓
Frontend Astro (apps/web) — Affichage
```

**Volume de donnees estime** :
- Adresses BAN : ~1 500 objets
- Contours communes : 16 objets
- POI OSM : ~50 objets
- Natura 2000 / ZNIEFF : ~15 objets
- Stations Hub'Eau : ~10 objets
- Entreprises : ~20 objets
- RPG : variable (parcelles)
- **Total objets** : ~2 000 a 5 000 (selon sources actives)
- **Total PMTiles** : ~2 Go (relief HD)

---

> **Note finale** : Ce document decrit l'etat **actuel** du projet au 10 juillet 2026. L'architecture implementee (Docker Compose + PostgreSQL/PostGIS) differencie de la vision initiale (Astro + serverless) mais permet une plus grande flexibilite et un deployement auto-heberge. La Brique 1 (explorateur cartographique) est quasi-complete avec 11 sources operationnelles. Les Briques 2 a 5 (socio-economie, finances, environnement, tourisme) restent a developper selon les priorites du commanditaire.
