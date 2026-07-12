# Plan — Portail Open Data : Val-d'Aigoual & CC Causses Aigoual Cévennes

## Contexte

La commune de **Val-d'Aigoual** (Gard) et son intercommunalité, la **Communauté de communes
Causses Aigoual Cévennes – Terres Solidaires**, ne disposent d'aucun point d'entrée unique
présentant les données publiques du territoire. Ces données existent pourtant en abondance et sont
ouvertes (Licence Ouverte / ODbL) : population, géographie de montagne, climat exceptionnel du Mont
Aigoual, risques naturels, biodiversité (cœur du Parc national des Cévennes), eau, finances,
tourisme, services…

**Objectif** : construire un **portail territorial open data** qui agrège et met en valeur
**l'ensemble** de ces données, à la fois comme portail grand public (habitants + touristes),
observatoire chiffré et explorateur cartographique. Toutes les sources ci-dessous ont été
**identifiées et testées par appel réel des API** (extraits JSON vérifiés le 2026-07-08).

**Décisions validées avec le commanditaire :**
- Vocation : **toutes les données** — le site combine présentation éditoriale, tableaux de bord et carte SIG.
- Stack : **Astro (site statique + îlots interactifs) + fonctions serverless** pour le peu d'API à clé/cache.
- Périmètre : **couverture large d'emblée** — tous les domaines dès la première version.

---

## Identité du territoire (données de référence confirmées)

Ces constantes pilotent **toutes** les requêtes API. À centraliser dans un fichier de configuration.

| Élément | Valeur | Vérifié via |
|---|---|---|
| Commune | **Val-d'Aigoual** | geo.api.gouv.fr |
| Code INSEE (COG) | **30339** | geo.api.gouv.fr `/communes` |
| SIREN commune | **200082725** | OFGL / recherche-entreprises |
| Code postal | 30570 | geo.api |
| Communes déléguées | **Valleraugue** (chef-lieu, ex-30339) + **Notre-Dame-de-la-Rouvière** (ex-30190) | fusion 01/01/2019 ; `/communes/30190` → 404 |
| EPCI | **CC Causses Aigoual Cévennes – Terres Solidaires** | geo.api `/epcis` |
| SIREN / code EPCI | **200034601** (identiques) | geo.api / recherche-entreprises |
| Communes membres EPCI | **15** | `/epcis/200034601/communes` |
| Population commune | **1 412** (municipale) / 1 418 (2022, INSEE) | geo.api / INSEE |
| Population EPCI | **5 391** | geo.api |
| Centroïde commune | 3.6272 E / 44.081 N | geo.api |
| Mairie | 3.6414 E / 44.081 N | geo.api |
| Superficie | 9 561,82 ha (≈ 95,6 km²) | geo.api |
| **Mont Aigoual (sommet)** | **44.1216 N / 3.5814 E**, alt. ≈ 1567 m | OSM node 26863762 / IGN |
| **Station météo Aigoual** | **NUM_POSTE 30339001** (SYNOP/OMM 07560) | Météo-France |
| Région / Département | Occitanie (76) / Gard (30) | geo.api |

**15 communes de l'EPCI** (INSEE, pop.) : Causse-Bégon (30074, 25) · Dourbies (30105, 177) ·
L'Estréchure (30108, 151) · Lanuéjols (30139, 341) · Lasalle (30140, 1202) ·
Peyrolles-en-Cévennes (30195, 30) · Les Plantiers (30198, 228) · Revens (30213, 37) ·
Saint-André-de-Majencoules (30229, 599) · Saint-André-de-Valborgne (30231, 366) ·
Saint-Sauveur-Camprieu (30297, 207) · Saumane (30310, 303) · Soudorgues (30322, 269) ·
Trèves (30332, 116) · **Val-d'Aigoual (30339, 1412)**.

---

## Catalogue des sources open data (testées, par domaine)

Toutes sont **sans clé API** sauf mention « 🔑 ». Toutes filtrables par `code_insee=30339` /
`siren=200082725` (commune) ou `200034601` (EPCI).

### Socle administratif & référentiels
| Source | Point d'entrée (pattern) | Format | Test réel |
|---|---|---|---|
| Découpage administratif | `geo.api.gouv.fr/communes/30339?fields=contour,centre,population,...` · `/epcis/200034601/communes` | JSON/GeoJSON | ✅ pop 1412, 15 communes |
| Base Adresse Nationale | `api-adresse.data.gouv.fr/search/?q=&citycode=30339` · `/reverse/?lon=&lat=` | GeoJSON | ✅ adresses commune |
| Recherche entreprises (SIRENE ouvert) | `recherche-entreprises.api.gouv.fr/search?code_commune=30339` | JSON | ✅ 17 établissements |
| Annuaire administration | `api-lannuaire.service-public.fr/api/explore/v2.1/.../records?where=code_insee_commune="30339"` | JSON (ODS) | ✅ 7 fiches (mairie, CCAS, gendarmerie, France Services, EPCI) |
| data.gouv.fr (catalogue) | `www.data.gouv.fr/api/1/datasets/?geozone=fr:commune:30339` | JSON | ✅ (peu de jeux *locaux* → s'appuyer sur les jeux nationaux filtrés) |

### Population & socio-économie
| Source | Point d'entrée | Format | Test réel |
|---|---|---|---|
| INSEE — Dossier complet | `insee.fr/fr/statistiques/2011101?geo=COM-30339` (et `EPCI-200034601`) | HTML + XLS/CSV | ✅ pop 1418, 1933 logements (1166 rés. secondaires), 77 étab. |
| INSEE — API Melodi | `api.insee.fr/melodi/data/DS_RP_POPULATION_PRINC` (+ catalogue `/catalog/all`) | JSON/CSV/SDMX | ✅ **sans clé** |
| INSEE — Populations légales | `insee.fr/fr/statistiques/{id}?geo=COM-30339` + fichier CSV national | CSV/XLSX | ✅ |
| Base Permanente des Équipements (BPE) | data.gouv `base-permanente-des-equipements-1` (miroir ODS géolocalisé) | CSV/GeoJSON | commune & IRIS |

### Économie & agriculture
| Source | Point d'entrée | Format |
|---|---|---|
| Établissements/entreprises | `recherche-entreprises.api.gouv.fr/search?code_commune=30339` | JSON ✅ |
| RPG (parcelles agricoles) | `geoservices.ign.fr/rpg` / DRAAF Occitanie (par département, clip 30339) | GeoPackage/SHP |
| Signes qualité AOP/IGP (INAO) | data.gouv / geoservices IGN — Pélardon AOP, Oignon doux Cévennes AOP, Miel des Cévennes IGP, Châtaigne | GeoJSON/SHP |

### Finances publiques
| Source | Point d'entrée | Format | Test réel |
|---|---|---|---|
| OFGL (comptes des collectivités) | `data.ofgl.fr/api/explore/v2.1/catalog/datasets/ofgl-base-communes/records?where=com_code="30339"` | JSON/CSV (ODS) | ✅ 1469 enreg. (⚠️ **v2.1** obligatoire, v1 → 400) |
| Balances comptables | `data.economie.gouv.fr/api/explore/v2.1/.../balances-comptables-des-communes-en-2023/records?where=siren="200082725"` | JSON/CSV | ✅ 331 lignes |
| Marchés publics (DECP) | `data.economie.gouv.fr` / data.gouv — filtre acheteur SIREN 200082725 / 200034601 | JSON/CSV |

### Géographie, relief & fond de carte
| Source | Point d'entrée | Format | Test réel |
|---|---|---|---|
| IGN Altimétrie (RGE ALTI) | `data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=&lat=&resource=ign_rge_alti_wld` | JSON | ✅ z=1550 m au sommet (5 req/s/IP) |
| IGN Fond de carte WMTS | `data.geopf.fr/wmts?...&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2` (aussi `ORTHOPHOTOS`, `ELEVATION.SLOPES`) — TILEMATRIXSET **PM** (EPSG:3857) | WMTS PNG/JPEG | ✅ sans clé (remplace wxs.ign.fr) |
| API Carto Cadastre | `apicarto.ign.fr/api/cadastre/commune?code_insee=30339` (+ `/parcelle`) | GeoJSON | ✅ contour MultiPolygon |
| Cadastre Etalab (masse) | `cadastre.data.gouv.fr/data/etalab-cadastre/latest/geojson/communes/30/30339/` | GeoJSON.gz | trimestriel |
| OpenStreetMap / Overpass | `overpass-api.de/api/interpreter` (POI : mairie, sommets, sentiers GR, refuges) | JSON (ODbL) | ✅ Mont Aigoual node |
| API Carto GPU (urbanisme) | `apicarto.ign.fr/api/gpu/municipality?insee=30339` | GeoJSON |

### Météo & climat (atout majeur : station de référence de l'Aigoual)
| Source | Point d'entrée | Format | Test réel |
|---|---|---|---|
| Fiche climatologique (normales) | `donneespubliques.meteofrance.fr/FichesClim/FICHECLIM_30339001.pdf` | PDF | ✅ 1567 m, T 5,7 °C, **1970 mm/an**, 128 j gel |
| Base climato quotidienne | `meteo.data.gouv.fr` → `Q_30_previous-1950-2023_*.csv.gz` (filtre `NUM_POSTE=30339001`) | CSV.gz | séries >125 ans |
| Portail API Météo-France 🔑 | `portail-api.meteofrance.fr` — DPObs (temps réel), Vigilance, AROME/ARPEGE | JSON/GRIB | 🔑 token OAuth (serveur) |

### Risques naturels & technologiques
| Source | Point d'entrée | Format | Test réel |
|---|---|---|---|
| Géorisques (BRGM) | `georisques.gouv.fr/api/v1/gaspar/risques?code_insee=30339` (+ `/catnat`, `/rga`, `/zonage_sismique`, `/radon`, `/mvt`) | JSON | ✅ inondation, feu de forêt, radon, mvt de terrain, rupture barrage, TMD |

### Environnement, biodiversité, eau & air
| Source | Point d'entrée | Format | Test réel |
|---|---|---|---|
| Hub'Eau — Hydrométrie | `hubeau.eaufrance.fr/api/v2/hydrometrie/referentiel/stations?code_commune_station=30339` (+ `qualite_rivieres`, `prelevements`, `ecoulement`) | JSON/GeoJSON | ✅ 3 stations (l'Hérault à Valleraugue) |
| API Carto Nature — Natura 2000 | `apicarto.ign.fr/api/nature/natura-habitat?geom={point}` (+ `/znieff1`, `/znieff2`, `/pn`) | GeoJSON | ✅ ZSC FR9101371 « Massif de l'Aigoual et du Lingas » |
| API Carto Nature — ZNIEFF | `apicarto.ign.fr/api/nature/znieff1?geom={point}` | GeoJSON | ✅ 910011856 « Pelouses du Mont Aigoual » |
| Parc national des Cévennes | `biodiversite.cevennes-parcnational.fr` / data.gouv `parc-national-des-cevennes` / GBIF | CSV/GeoJSON | cœur de parc |
| Atmo Occitanie (qualité air) | `data-atmo-occitanie.opendata.arcgis.com` — indice ATMO par EPCI | GeoJSON/WFS (ODbL) | quotidien |

### Services, tourisme, éducation, mobilité, vie démocratique
| Source | Point d'entrée | Format | Test réel |
|---|---|---|---|
| Annuaire éducation | `data.education.gouv.fr/api/explore/v2.1/.../fr-en-annuaire-education/records?where=code_commune="30339"` | JSON | ✅ 2 écoles (Valleraugue, Notre-Dame-de-la-Rouvière) |
| Santé FINESS | data.gouv `finess` / `referentiel-finess-t-finess` (géocodé) + « MSP du Gard » | CSV | ⚠️ nouveau flux ANS été 2026 |
| DATAtourisme 🔑 | flux Occitanie (code `OCC`) : PLACE / FMA / TOUR (randos) / PRODUCT · API `api.datatourisme.fr/v1` | JSON-LD/CSV | 🔑 clé gratuite |
| Sentiers PDIPR Gard | data.gouv org « Département du Gard » — GR/GRP/PR, véloroutes | GeoJSON/SHP | ✅ 35 jeux Gard |
| Transport liO Occitanie | `transport.data.gouv.fr/datasets/reseau-lio-occitanie` (GTFS/NeTEx, Gard couvert) | GTFS (ODbL) | ✅ à jour 07/2026 |
| Région Occitanie (opendata) | `data.laregion.fr/api/explore/v2.1/catalog/datasets` | JSON (ODS) | ✅ 96 jeux géo |
| Département du Gard | `data.gouv.fr/organizations/departement-du-gard/datasets` + `sig.gard.fr` | GeoJSON/CSV | ✅ 35 jeux |
| Élections / Élus (RNE) | data.gouv — résultats par commune 30339 + Répertoire National des Élus | CSV/JSON |

> **Mutualisation clé** : `data.education.gouv.fr`, `data.laregion.fr`, `data.ofgl.fr`,
> `data.economie.gouv.fr` et `api-lannuaire.service-public.fr` partagent **le même moteur
> Opendatasoft** → **un seul connecteur réutilisable** `/api/explore/v2.1/catalog/datasets/{id}/records?where=...`.

---

## Architecture technique

**Stack retenue : Astro + îlots Svelte + fonctions serverless**, hébergée sur **Cloudflare Pages
ou Netlify** (tier gratuit, fonctions incluses).

```
opendata-vda/
├─ src/
│  ├─ config/territoire.ts        # constantes (INSEE, SIREN, coords, station, 15 communes)
│  ├─ lib/
│  │  ├─ opendatasoft.ts          # connecteur ODS v2.1 réutilisable (where=code_commune=…)
│  │  ├─ georisques.ts, hubeau.ts, apicarto.ts, insee.ts, geoapi.ts
│  │  └─ attribution.ts           # libellés licences/sources
│  ├─ components/                 # UI Astro (cartes de chiffres, tableaux, encarts sources)
│  ├─ islands/                    # composants interactifs Svelte
│  │  ├─ MapTerritoire.svelte     # MapLibre GL + fond WMTS IGN + couches GeoJSON
│  │  ├─ Chart*.svelte            # graphiques (démographie, climat, finances)
│  │  └─ MeteoWidget.svelte
│  ├─ data/                       # JSON figés générés au build (voir pipeline)
│  ├─ pages/                      # une page par domaine (voir structure)
│  └─ layouts/
├─ functions/                     # serverless (runtime)
│  ├─ meteo.ts                    # 🔑 proxy Météo-France (token serveur, cache)
│  ├─ air.ts                      # Atmo Occitanie du jour
│  └─ hubeau-live.ts              # débits temps réel Hérault
├─ scripts/                       # fetch build-time → src/data/*.json
│  ├─ fetch-territoire.mjs, fetch-population.mjs, fetch-risques.mjs
│  ├─ fetch-nature.mjs, fetch-finances.mjs, fetch-services.mjs …
└─ astro.config.mjs
```

**Choix de composants :**
- **Carte** : **MapLibre GL JS** (ou Leaflet en repli), fond **WMTS IGN PLANIGNV2 / ORTHOPHOTOS**
  (projection PM/EPSG:3857), superposition des couches GeoJSON (contour commune, 15 communes,
  Natura 2000, ZNIEFF, cœur PNC, stations Hub'Eau, sentiers, POI OSM).
- **Graphiques** : librairie légère (**Chart.js** ou **Observable Plot**), en appliquant le
  **système de design dataviz** du projet (palette accessible, cohérence clair/sombre) — invoquer
  la skill `dataviz` avant d'écrire le premier graphique.
- **Design** : invoquer la skill `frontend-design` pour une direction visuelle assumée (identité
  « montagne / Cévennes / Aigoual »), thème clair/sombre.

---

## Stratégie d'intégration des données

Trois régimes selon la fraîcheur/volatilité de la donnée :

1. **Build-time (SSG) → `src/data/*.json`** pour les données stables (annuelles/trimestrielles) :
   contours géo, population, finances OFGL, établissements SIRENE, risques Géorisques, Natura 2000 /
   ZNIEFF, écoles, annuaire, cadastre. Des scripts `scripts/fetch-*.mjs` s'exécutent en `prebuild`.
   → site rapide, résilient (indépendant de la dispo des API à l'exécution), et **respectueux du
   fair-use** (un appel au build, pas par visiteur).
2. **Runtime serverless** (`functions/`) pour la donnée « live » et/ou à clé : **Météo-France**
   (obs + vigilance, token côté serveur), **Atmo Occitanie** (indice du jour), **Hub'Eau** débits
   temps réel de l'Hérault. Réponses mises en cache (edge, TTL court).
3. **Client-side, mis en cache** : tuiles WMTS IGN, requêtes **Overpass** ponctuelles (POI carte) —
   avec cache local pour ménager les serveurs publics.

**Points de vigilance techniques relevés lors des tests :**
- OFGL : **API v2.1 uniquement** (v1 renvoie 400).
- Hub'Eau : paramètre exact `code_commune_station` (≠ `code_commune`) ; WAF peut renvoyer un 403 sur
  user-agent atypique → définir un User-Agent serveur.
- data.gouv : recherche par apostrophe (`Val-d'Aigoual`) peu fiable → filtrer par code INSEE.
- INPN direct dégradé (cyberattaque 2025) → passer par **API Carto Nature** (mêmes données).
- FINESS : bascule vers le nouveau flux ANS à l'été 2026 → prévoir l'adaptation.

---

## Aspects juridiques & attributions

Composant d'attribution obligatoire, affiché par donnée et en pied de page :
- **Licence Ouverte / Etalab 2.0** : INSEE, IGN (geo.api, altimétrie, cadastre, API Carto),
  Météo-France, Géorisques/BRGM, Hub'Eau, DGFiP/OFGL, annuaires. → mention « Source : … ».
- **ODbL** (attribution + partage à l'identique) : **OpenStreetMap** (« © contributeurs
  OpenStreetMap »), **Atmo Occitanie**, **liO/GTFS**. → attribution visible obligatoire.
- Page **« Sources & open data »** listant chaque jeu, sa licence, sa date de mise à jour et le lien.

---

## Structure du site (une entrée par domaine — couverture large)

1. **Accueil** — carte du territoire, chiffres clés, météo + vigilance du jour, indice air.
2. **Le territoire** — identité, les 15 communes de l'EPCI, cartes admin, cadastre, urbanisme.
3. **Population & société** — démographie (INSEE Melodi / dossier complet), logement (rés. secondaires !), emploi, revenus.
4. **Économie & agriculture** — établissements (SIRENE), équipements (BPE), AOP/IGP, parcellaire (RPG).
5. **Finances publiques** — OFGL, balances comptables, marchés publics (commune + EPCI).
6. **Géographie & relief** — altimétrie, profil du Mont Aigoual, hydrographie, fonds IGN.
7. **Météo & climat** — normales Aigoual, séries historiques (>125 ans), obs temps réel, vigilance.
8. **Environnement & biodiversité** — Natura 2000, ZNIEFF, cœur PNC, qualité de l'air, eau (Hub'Eau).
9. **Risques** — inondation, feu de forêt, radon, mouvements de terrain, sismique, Cat-Nat.
10. **Services & vie pratique** — mairie/annuaire, écoles, santé (FINESS/MSP), associations.
11. **Tourisme & randonnée** — DATAtourisme, sentiers GR/PR (PDIPR Gard), POI OSM.
12. **Mobilité** — réseau liO (arrêts/lignes GTFS desservant le territoire).
13. **Vie démocratique** — résultats électoraux, élus (RNE).
14. **Sources & open data** — catalogue, licences, attributions, méthodologie.

---

## Feuille de route de mise en œuvre

Même en « couverture large », un séquençage interne évite de tout bloquer :

- **Étape 0 — Fondations** : scaffold Astro, `config/territoire.ts`, connecteur ODS réutilisable,
  clients API (`georisques`, `hubeau`, `apicarto`, `geoapi`, `insee`), composant attribution, layout + design.
- **Étape 1 — Socle carto & identité** : `MapTerritoire` (fond IGN + contour + 15 communes),
  pages Accueil + Territoire, scripts de fetch géo.
- **Étape 2 — Données figées (build-time)** : population, finances, économie, risques, nature,
  services, éducation → scripts `fetch-*.mjs` + pages + graphiques.
- **Étape 3 — Données live (serverless)** : `functions/meteo.ts` (🔑), `air.ts`, `hubeau-live.ts` + widgets.
- **Étape 4 — Tourisme, mobilité, vie démocratique** : DATAtourisme (🔑), PDIPR, GTFS liO, élections.
- **Étape 5 — Finitions** : page Sources, accessibilité (RGAA), performances (Lighthouse), SEO, déploiement.

---

## Actions préalables requises (côté commanditaire)

1. **🔑 Compte Météo-France** : créer une application sur `portail-api.meteofrance.fr` pour obtenir
   le token OAuth (obs temps réel + vigilance). Sans lui : se limiter aux normales (PDF) et séries CSV.
2. **🔑 Compte DATAtourisme** : demander une clé gratuite (flux Occitanie) pour les POI touristiques riches.
3. Choix d'hébergement (Cloudflare Pages / Netlify) et nom de domaine.
4. Confirmer le périmètre géographique par page : **commune seule**, **EPCI (15 communes)**, ou **les deux** avec bascule.

---

## Vérification (tests de bout en bout)

- **Scripts de fetch** : `node scripts/fetch-territoire.mjs` → vérifier que `src/data/*.json` sont
  générés et non vides (population 1412, 15 communes, 11 risques, ZSC FR9101371, etc.).
- **Dev** : `npm run dev` → chaque page des 14 rubriques se rend sans erreur console.
- **Carte** : tuiles WMTS IGN chargées, contour commune + 15 communes + couches GeoJSON affichés,
  centrage Mont Aigoual (44.1216 / 3.5814).
- **Serverless** : appeler `functions/meteo.ts` en local → réponse vigilance/obs (token présent) ;
  `air.ts` → indice ATMO du jour ; `hubeau-live.ts` → débit station Hérault Y200001001.
- **Graphiques** : démographie (courbe 2011→2022), climat (normales mensuelles), finances (OFGL).
- **Attributions** : présence des mentions Licence Ouverte / ODbL (OSM, Atmo, liO) sur chaque bloc.
- **Build & qualité** : `npm run build` sans erreur ; audit Lighthouse (perf/SEO/accessibilité) ;
  vérif liens de la page « Sources ».

---

> **Note historique** : cette version décrit la **vision initiale complète** du projet (toutes les
> données, en une seule fois, sur une stack Astro + Cloudflare/Netlify serverless). Elle a ensuite
> été volontairement resserrée avec le commanditaire en un **MVP « Brique 1 »** — voir
> [`plan-brique-1-mvp.md`](plan-brique-1-mvp.md) — avec une architecture différente (VPS Docker
> Compose + PostgreSQL/PostGIS), le reste des domaines (dont l'INSEE) étant reporté en Briques 2 à 5.
