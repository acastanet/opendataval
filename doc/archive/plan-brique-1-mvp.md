# Plan — Portail Open Data : Val-d'Aigoual & CC Causses Aigoual Cévennes
## Brique 1 (MVP) : Explorateur cartographique des données du territoire

## Contexte

La commune de **Val-d'Aigoual** (Gard) et la **CC Causses Aigoual Cévennes – Terres Solidaires**
n'ont aucun point d'entrée unique vers les données publiques du territoire, pourtant abondantes et
ouvertes : géographie de montagne, géologie cévenole, climat du Mont Aigoual, risques, eau,
biodiversité, population, finances…

Le site sera construit **par briques**. Décisions validées avec le commanditaire :
- Vocation finale : **toutes les données** (portail + observatoire + SIG).
- Architecture : **serveur auto-hébergé de taille raisonnable** (VPS ~2 vCPU / 4 Go) avec
  **base de données PostgreSQL + PostGIS** et **services internes** — API **Node.js/TypeScript
  (Fastify)**, worker d'ingestion planifié, frontend Astro — le tout orchestré par **Docker Compose**.
- **Brique 1 = MVP : une interface cartographique simple, intuitive et responsive de
  localisation des données**, avec quelques exemples concrets — incluant **géologie/sous-sol**
  et **imagerie satellite libre** (vérifiés et testés le 2026-07-08).

Toutes les sources citées ont été **testées par appel réel des API** (extraits vérifiés).

---

## Identité du territoire (constantes de référence, confirmées par API)

À centraliser dans `src/config/territoire.ts` — elles pilotent toutes les requêtes.

| Élément | Valeur | Vérifié via |
|---|---|---|
| Commune | **Val-d'Aigoual** — INSEE **30339**, SIREN 200082725, CP 30570 | geo.api.gouv.fr |
| Communes déléguées | Valleraugue (chef-lieu) + Notre-Dame-de-la-Rouvière (ex-30190 → 404) | fusion 01/01/2019 |
| EPCI | CC Causses Aigoual Cévennes – Terres Solidaires — SIREN/code **200034601**, **15 communes** | geo.api |
| Population | commune **1 412** (1 418 INSEE 2022) / EPCI **5 391** | geo.api / INSEE |
| Centroïde commune | 44.081 N / 3.6272 E — superficie ≈ 95,6 km² | geo.api |
| **Mont Aigoual** | **44.1216 N / 3.5814 E**, alt. 1567 m (z IGN testé : 1550 m) | OSM / IGN |
| Station météo Aigoual | NUM_POSTE **30339001** (SYNOP 07560) — T 5,7 °C, **1 970 mm/an**, 128 j gel (normales 1991-2020) | Météo-France |
| BBOX commune (approx.) | `3.52, 44.02, 3.75, 44.15` | contours |

15 communes EPCI (INSEE, pop.) : Causse-Bégon (30074, 25) · Dourbies (30105, 177) · L'Estréchure
(30108, 151) · Lanuéjols (30139, 341) · Lasalle (30140, 1202) · Peyrolles-en-Cévennes (30195, 30) ·
Les Plantiers (30198, 228) · Revens (30213, 37) · Saint-André-de-Majencoules (30229, 599) ·
Saint-André-de-Valborgne (30231, 366) · Saint-Sauveur-Camprieu (30297, 207) · Saumane (30310, 303)
· Soudorgues (30322, 269) · Trèves (30332, 116) · Val-d'Aigoual (30339, 1412).

---

# BRIQUE 1 — MVP : Explorateur cartographique

## Objectif

Une **page carte plein écran**, simple, intuitive et **responsive (mobile-first)**, qui localise
les données ouvertes du territoire : fonds de carte (plan, photo aérienne, satellite), couche
**géologique**, points de données interactifs (**sous-sol, eau, risques, nature, services,
limites administratives**), popups riches avec lien vers la source. Les données sont **ingérées
dans PostGIS par un worker planifié** et servies au front par **l'API interne** — le site reste
fonctionnel même si une API publique est indisponible (ex. INPN dégradé), et le fair-use des
services publics est respecté (un fetch planifié, pas un par visiteur). Seules les **tuiles
raster** (IGN, BRGM, EOX, GIBS — de simples images, sans contrainte CORS) sont chargées
directement par le navigateur.

## Couches vérifiées de la brique 1 (toutes testées, sans clé)

### Fonds de carte (sélecteur bas de carte)
| Fond | URL gabarit | Licence | Note |
|---|---|---|---|
| **Plan IGN** (défaut) | `data.geopf.fr/wmts?...&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png` | Etalab | remplace wxs.ign.fr, no-key |
| **Photo aérienne IGN** | idem, `LAYER=ORTHOIMAGERY.ORTHOPHOTOS`, `FORMAT=image/jpeg` | Etalab | 20-50 cm, meilleur détail ✅ testé (capabilities `ortho.xml`) |
| **Satellite SPOT IGN** | idem, `LAYER=ORTHOIMAGERY.ORTHO-SAT.SPOT.2022` (capabilities `satellite.xml`) | Etalab (© IGN) | ~1,5 m |
| Satellite Sentinel-2 EOX | `tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg` | **CC-BY-NC-SA ⚠️** | mosaïque sans nuages ; option, usage non commercial uniquement |
| NASA GIBS (time-lapse) | `gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg` | domaine public | 375 m — neige/nuages quotidiens, slider de date (bonus) |
| Pentes IGN | `LAYER=ELEVATION.SLOPES` | Etalab | overlay relief |

### Couche géologie & sous-sol (nouveauté demandée — testée)
| Donnée | Point d'entrée testé | Résultat réel |
|---|---|---|
| **Carte géologique 1/50 000** | WMS BRGM `geoservices.brgm.fr/geologie` — couche **`SCAN_D_GEOL50`** (aussi `SCAN_F_GEOL1M`, harmonisée `SCAN_H_GEOL50_*`), EPSG:3857 OK, `AccessConstraints: None` | ✅ GetCapabilities validé — overlay WMS semi-transparent (contact socle cévenol granite/schistes ↔ Causses calcaires) |
| **Cavités souterraines** | `georisques.gouv.fr/api/v1/cavites?code_insee=30339` | ✅ **13 cavités** (anciennes galeries minières, ex. LROCS00003881 « Galerie 1 » 3.6235/44.0554) |
| **Mouvements de terrain** | `georisques.gouv.fr/api/v1/mvt?code_insee=30339` (paginé) | ✅ **34 mouvements** (glissements, chutes de blocs — ex. secteur Serreyrède/RD986) |
| **Piézométrie (nappe)** | Hub'Eau `hubeau.eaufrance.fr/api/v1/niveaux_nappes/stations?code_commune=30339` + `/chroniques?code_bss=09364X0017/111111` | ✅ 1 station BSS002DJSB « VALLERAUGUE » alt 1003 m, **6 224 mesures 2009→2026-07-04** — CORS OK, graphe client possible |
| BSS (forages) | pas d'API simple par commune → lien fiche InfoTerre (`infoterre.brgm.fr`) dans les popups ; lot départemental téléchargeable si besoin ultérieur | documenté |
| BDLISA (hydrogéologie) | WMS `reseau.eaufrance.fr/geotraitements/bdlisa/services/carto/` (`ENTITES_O1_NV*`) | overlay optionnel |

### Autres couches localisées de la brique 1 (déjà testées en phase 1)
| Donnée | Source | Résultat réel |
|---|---|---|
| Contours commune + 15 communes EPCI | `geo.api.gouv.fr/communes/30339?format=geojson&geometry=contour` · `/epcis/200034601/communes?format=geojson&geometry=contour` | ✅ Polygones valides (~1 200 pts) — **volumineux → à figer au build** |
| Stations hydrométriques (débits Hérault) | Hub'Eau `api/v2/hydrometrie/referentiel/stations?code_commune_station=30339` | ✅ 3 stations (Y200001001…) |
| Natura 2000 / ZNIEFF | `apicarto.ign.fr/api/nature/natura-habitat?geom={point}` · `/znieff1` | ✅ ZSC FR9101371 « Massif de l'Aigoual et du Lingas » · ZNIEFF « Pelouses du Mont Aigoual » |
| Risques commune (contexte popup) | `georisques.gouv.fr/api/v1/gaspar/risques?code_insee=30339` | ✅ 11 risques (inondation, feu de forêt, radon…) |
| Écoles | `data.education.gouv.fr/api/explore/v2.1/.../fr-en-annuaire-education/records?where=code_commune="30339"` | ✅ 2 écoles |
| Mairie/administrations | `api-lannuaire.service-public.fr/.../records?where=code_insee_commune="30339"` | ✅ 7 fiches |
| POI OSM (sommets, refuges…) | Overpass `overpass-api.de/api/interpreter` (area Val-d'Aigoual) | ✅ Mont Aigoual node 26863762 — **pré-fetch au build** (fair-use) |
| Altitude au clic | `data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=&lat=&resource=ign_rge_alti_wld` | ✅ z=1550,41 m au sommet (5 req/s) |
| Recherche d'adresse | BAN `api-adresse.data.gouv.fr/search/?q=&citycode=30339` | ✅ |

## Interface (simple, intuitive, responsive)

```
Desktop                                     Mobile (mobile-first)
┌────────────┬──────────────────────────┐   ┌──────────────────────┐
│ PANNEAU    │                          │   │  CARTE plein écran   │
│ Couches    │        CARTE             │   │  [🔍]        [⛶][ⓘ] │
│ ☑ Limites  │     (MapLibre GL)        │   │                      │
│ ☑ Géologie │                          │   │                      │
│ ☐ Sous-sol │   popup au clic:         │   ├──────────────────────┤
│ ☐ Eau      │   titre, données,        │   │ ▔▔ bottom-sheet ▔▔   │
│ ☐ Nature   │   graphe, lien source    │   │ chips: Géologie Eau  │
│ ☐ Services │                          │   │ Sous-sol Nature …    │
│ [ⓘ source] │ [Plan|Photo|Sat] [+][−]  │   │ [fond: Plan ▾]       │
└────────────┴──────────────────────────┘   └──────────────────────┘
```

- **Carte** : MapLibre GL JS, centrée Mont Aigoual (44.1216/3.5814), zoom ~11, bornée au territoire.
- **Panneau de couches** groupées par thème avec interrupteurs ; **drawer/bottom-sheet en mobile**
  avec « chips » thématiques. Une légende contextuelle par couche active.
- **Sélecteur de fond** : Plan IGN / Photo aérienne / Satellite (+ slider d'opacité pour l'overlay géologie).
- **Popups** : nom, attributs clés, **lien vers la fiche source** (InfoTerre, Géorisques, INPN…) ;
  pour le piézomètre : **mini-graphe de la chronique** (fetch Hub'Eau client, CORS OK).
- **Recherche d'adresse** (BAN, limitée au citycode 30339) et **altitude au clic** (API IGN).
- **Attribution dynamique** selon couches actives (« © IGN », « © BRGM », « © contributeurs OpenStreetMap » ODbL…).

## Exemples concrets embarqués dans le MVP (démonstrateurs)

1. **Géologie de l'Aigoual** : overlay `SCAN_D_GEOL50` semi-transparent sur la photo aérienne —
   lecture du contact granite/schistes ↔ calcaires des Causses.
2. **Sous-sol** : les **13 anciennes galeries minières** + **34 mouvements de terrain** en marqueurs
   cliquables (type, fiabilité, date).
3. **Nappe phréatique en direct** : popup du piézomètre BSS002DJSB avec courbe 2009→aujourd'hui.
4. **L'Hérault à sa source** : 3 stations hydrométriques localisées.
5. **Territoire administratif** : contour commune + 15 communes EPCI, population au clic.
6. *(Bonus si temps)* : time-lapse neige quotidien NASA GIBS avec slider de date.

## Architecture technique (serveur + BDD + services internes)

**VPS Debian 12 (~2 vCPU / 4 Go / 40 Go, type Hetzner CX22 ou OVH ~5-10 €/mois), Docker Compose,
4 services :**

```
                    ┌──────────────────────── VPS ────────────────────────┐
navigateur ──HTTPS──▶ caddy (reverse proxy + TLS auto)                    │
   │                │   ├── /            → web  (Astro build statique)   │
   │                │   └── /api/*       → api  (Fastify, Node 22 TS)    │
   │                │                        │                           │
   │                │        worker (ingestion planifiée) ──┐            │
   │                │                        │              │            │
   │                │                     db : PostgreSQL 16 + PostGIS   │
   └── tuiles raster (IGN/BRGM/EOX/GIBS) directement        └────────────┘
```

```
opendata-vda/                        # monorepo pnpm workspaces
├─ apps/
│  ├─ web/                           # Astro + îlot MapExplorer.svelte (MapLibre GL)
│  │   src/islands/MapExplorer.svelte, src/components/Attribution.astro, Legende.astro,
│  │   src/pages/index.astro         # la carte EST la page d'accueil du MVP
│  ├─ api/                           # Fastify + TypeScript
│  │   src/routes/territoire.ts      # GET /api/territoire (identité, 15 communes)
│  │   src/routes/couches.ts         # GET /api/couches (catalogue+licences) · GET /api/couches/:slug.geojson
│  │   src/routes/piezo.ts           # GET /api/piezo/:code_bss/chronique?depuis=
│  │   src/routes/outils.ts          # GET /api/alti?lon&lat · GET /api/adresse?q= (proxys cachés IGN/BAN)
│  └─ worker/                        # ingestion planifiée (node-cron)
│      src/sources/{geoapi,georisques,hubeau,apicarto,education,lannuaire,osm}.ts
│      src/scheduler.ts              # planning par source + upsert PostGIS + fetch_log
├─ packages/shared/                  # config territoire.ts (constantes), types, client DB
├─ db/migrations/                    # SQL (node-pg-migrate) — schéma ci-dessous
├─ docker-compose.yml                # db (postgis:16-3.4), api, worker, caddy(web)
├─ Caddyfile                         # domaine + TLS + routage /api
└─ .env.example                      # POSTGRES_*, tokens futurs (Météo-France en brique 3)
```

**Schéma PostGIS (brique 1)** — géométries en EPSG:4326 :
- `territoire.communes` (code INSEE, nom, population, `geom` MultiPolygon — la commune + les 15 de l'EPCI)
- `couches.objets` (id, `couche` slug : cavite|mouvement|station_hydro|piezo|nature|ecole|administration|poi_osm,
  `props` jsonb, `geom` Point/MultiPolygon, `source_url`, `maj`) — une table générique = une seule
  route API et l'ajout d'une couche sans migration
- `series.piezo` (code_bss, date, niveau_m_ngf) — chronique accumulée (6 224 mesures initiales, puis quotidien)
- `meta.sources` (catalogue : nom, url, licence, fréquence) · `meta.fetch_log` (source, date, statut, nb_lignes)

**Rythmes d'ingestion (worker)** : contours + annuaire + écoles → mensuel · cavités/mouvements
Géorisques → mensuel · nature (API Carto) → trimestriel · POI OSM (Overpass) → hebdomadaire ·
stations + chroniques piézo/hydro Hub'Eau → quotidien (append). Chaque run journalisé dans
`meta.fetch_log`, avec User-Agent identifiant le projet (WAF Hub'Eau).

- **Frontend** : Astro statique servi par Caddy ; l'îlot `MapExplorer` consomme `/api/couches/*.geojson`
  (même origine → zéro CORS). Tuiles raster WMTS/WMS chargées en direct par le navigateur.
- **Option ultérieure** (hors brique 1) : service de tuiles vectorielles `martin`/`pg_tileserv`
  branché sur PostGIS si les couches grossissent.
- **Exploitation** : sauvegarde nightly `pg_dump` (rotation 7 j) + snapshot VPS ; UFW + fail2ban ;
  secrets dans `.env` ; logs Docker + `meta.fetch_log` pour la supervision de l'ingestion.
- Design : invoquer les skills **`frontend-design`** (identité « montagne/Cévennes », thème
  clair/sombre) et **`dataviz`** (graphe piézométrique) avant d'écrire l'UI.

### Points de vigilance (issus des tests)
- Hub'Eau : paramètre **`code_commune_station`** en hydrométrie (≠ `code_commune`) ; User-Agent
  serveur propre au build (WAF) ; OFGL v2.1 only (brique 2).
- BRGM WMS : préférer WMS 1.1.1 + `SRS=EPSG:3857` si souci d'ordre d'axes en 1.3.0.
- **EOX s2cloudless = CC-BY-NC-SA** → fond optionnel, mention explicite, à retirer si usage commercial.
- Contours EPCI volumineux → jamais fetchés côté client, toujours figés au build (éventuellement simplifiés avec turf).
- Géorisques `/mvt` paginé (34 résultats = 2 pages) — gérer `next` dans le script de fetch.
- INPN direct dégradé (cyberattaque 2025) → passer par API Carto Nature.

## Étapes d'implémentation de la brique 1

1. **Fondations** : monorepo pnpm, `docker-compose.yml` (db PostGIS + api + worker + caddy),
   migrations SQL du schéma, `packages/shared/territoire.ts` (constantes du tableau d'identité).
2. **Worker d'ingestion** : modules sources (geoapi, georisques, hubeau, apicarto, education,
   lannuaire, osm) + scheduler + `fetch_log` ; premier run complet → vérifier les comptes attendus
   en BDD (13 cavités, 34 mouvements, 1 piézo + 6 224 mesures, 3 stations hydro, 1+15 contours, 2 écoles).
3. **API Fastify** : `/api/territoire`, `/api/couches`, `/api/couches/:slug.geojson` (PostGIS →
   GeoJSON via `ST_AsGeoJSON`), `/api/piezo/:code_bss/chronique`, proxys cachés `/api/alti` et `/api/adresse`.
4. **Îlot `MapExplorer`** (apps/web) : carte MapLibre + fonds WMTS IGN + overlay WMS BRGM +
   couches GeoJSON servies par l'API interne.
5. **UI** : panneau/bottom-sheet responsive, sélecteur de fond, légende, popups (dont graphe piézo),
   recherche d'adresse, altitude au clic, attributions dynamiques.
6. **Déploiement VPS** : location, Debian + Docker, DNS + Caddyfile (TLS auto), `.env`, sauvegardes
   pg_dump, premier run d'ingestion en production.
7. **Vérification** (voir ci-dessous), audit Lighthouse mobile.

## Vérification de bout en bout (brique 1)

- `docker compose up -d` local → les 4 services démarrent ; migrations appliquées.
- **Ingestion** : lancer le worker → `meta.fetch_log` complet, comptes en BDD conformes
  (13 cavités, 34 mouvements, 1 piézo/6 224 mesures, 3 stations hydro, 1+15 contours, 2 écoles) ;
  relancer → idempotent (upsert, pas de doublons).
- **API** : `curl /api/territoire` (population 1412, 15 communes) ; `/api/couches/cavites.geojson`
  → FeatureCollection de 13 features ; `/api/piezo/.../chronique` → série jusqu'à la dernière
  mesure ; `/api/alti?lon=3.5814&lat=44.1216` → z ≈ 1550 m.
- **Carte** : rendue sans erreur console ; tester **chaque fond** (Plan/Photo/SPOT) et
  l'**overlay géologie** avec opacité ; clic sur une galerie minière (popup), le piézomètre
  (graphe), une commune (nom + population), le sommet (altitude).
- Recherche d'adresse d'un lieu-dit de la commune → recentrage.
- **Responsive** : viewport mobile (bottom-sheet, chips, gestes carte) ; Lighthouse mobile ≥ 90 perf/accessibilité.
- Attributions visibles pour IGN/BRGM/OSM/Hub'Eau/Géorisques.
- **Prod** : HTTPS valide, site accessible depuis mobile, coupure simulée d'une API publique
  (le site continue de servir les couches depuis PostGIS), restauration d'un pg_dump testée.

---

# Briques suivantes (après validation du MVP)

- **Brique 2 — Observatoire chiffré** : population/logement (INSEE Melodi — testé sans clé, dossier
  complet : 1 933 logements dont 1 166 rés. secondaires), finances (OFGL v2.1 ✅ 1 469 enreg. ;
  balances DGFiP ✅ 331 lignes), économie (SIRENE ✅ 17 établissements, BPE), pages par domaine.
- **Brique 3 — Météo & climat en direct** : normales Aigoual (fiche 30339001 ✅), séries
  quotidiennes 1950→ ingérées dans `series.*` (meteo.data.gouv.fr, CSV `Q_30_*`), obs temps réel +
  vigilance via portail-api Météo-France (**🔑 token en `.env`, appelé par le worker**) — l'infra
  BDD/worker de la brique 1 absorbe tout cela sans nouveau composant.
- **Brique 4 — Tourisme, mobilité, vie locale** : DATAtourisme (**🔑 clé gratuite**), sentiers
  PDIPR Gard, GTFS liO (✅ à jour 07/2026), élections/élus (RNE).
- **Brique 5 — Catalogue « Sources & open data »** : page listant chaque jeu, licence, date,
  méthodologie ; connecteur Opendatasoft v2.1 mutualisé (education/laregion/ofgl/economie/lannuaire).

## Actions préalables côté commanditaire
1. **Dès la brique 1** : location du VPS (Hetzner/OVH, ~2 vCPU / 4 Go) et nom de domaine
   (le développement local sous Docker Compose peut démarrer sans attendre).
2. Briques 3-4 : 🔑 compte gratuit `portail-api.meteofrance.fr` (obs temps réel + vigilance) ;
   🔑 clé gratuite DATAtourisme (flux Occitanie `OCC`).
