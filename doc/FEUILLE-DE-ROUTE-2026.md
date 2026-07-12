# Feuille de route 2026 — Portail Open Data Val-d'Aigoual

> **Document de référence** : cette feuille de route remplace fonctionnellement `doc/ROADMAP.md` (v1 du 2026-07-10, désynchronisée du code) et l'ancien plan `doc/archive/plan-vision-globale-v4.md`.
> **Version** : 1.0 — **Date** : 2026-07-12
> **Orientation validée par le commanditaire** : **socle modulaire d'abord** — l'ajout de nouvelles sources est gelé le temps du chantier A.

---

## Table des matières

1. [Pourquoi une nouvelle feuille de route](#pourquoi-une-nouvelle-feuille-de-route)
2. [État des lieux au 12 juillet 2026](#état-des-lieux-au-12-juillet-2026)
3. [Diagnostic : le coût d'ajout d'une source](#diagnostic--le-coût-dajout-dune-source)
4. [Chantier A — Socle modulaire](#chantier-a--socle-modulaire)
5. [Chantier B — Reprise des sources](#chantier-b--reprise-des-sources)
6. [Chantier C — Mise en production et transverse](#chantier-c--mise-en-production-et-transverse)
7. [Séquençage et dépendances](#séquençage-et-dépendances)
8. [Blocages externes](#blocages-externes)

**Conventions** : priorités 🔴 P0 / 🟠 P1 / 🟡 P2 / 🟢 P3 — états ✅ fait / 🟡 en cours / ⏳ prêt / ❌ bloqué / 🔑 clé ou ressource externe requise.

---

## Pourquoi une nouvelle feuille de route

Deux constats motivent ce document :

1. **La documentation de pilotage a décroché du code.** `doc/ROADMAP.md` (10/07) annonce « 11/17 sources, 5/14 pages, brique météo bloquée » ; en réalité la brique météo est entièrement livrée et le projet compte 17 jobs planifiés. L'état des lieux ci-dessous rétablit les faits, vérifiés fichier par fichier.

2. **Un problème structurel identifié par le commanditaire** : *chaque nouvelle source open data rend le site plus complexe et moins lisible*. Le constat est confirmé dans le code (voir [Diagnostic](#diagnostic--le-coût-dajout-dune-source)). Continuer à empiler des sources sur l'architecture actuelle aggraverait le problème : la priorité passe donc à un **chantier socle** qui rend le coût marginal d'une source quasi nul côté front, puis seulement ensuite à la reprise des briques de données.

**Principe directeur** : après le chantier A, ajouter une source = **1 fichier dans `apps/worker/src/sources/` + 1 entrée `JOBS` + 1-2 entrées de catalogue** (couche et/ou indicateur), **zéro modification du front**. Les pages de section, le panneau de couches, les popups et la page `/sources` se mettent à jour automatiquement.

---

## État des lieux au 12 juillet 2026

### Écarts avec ROADMAP.md v1

| Item | ROADMAP v1 (10/07) | Réalité du code (12/07) |
|---|---|---|
| Jobs worker | « 11/17 » | **17 jobs** dans `apps/worker/src/scheduler.ts` (dont 5 météo, actifs sous `METEOFRANCE_API_TOKEN` / `INFOCLIMAT_API_TOKEN`) |
| Catalogue | 17 entrées | **23 entrées** dans `CATALOGUE_SOURCES` (`packages/shared/src/territoire.ts`) |
| Pages avec contenu réel | « 5/14 » | **8/16** : accueil, carte, relief, sources, météo, population, économie, géographie |
| Brique 4 météo | ❌ bloquée (token) | ✅ **livrée** : 5 jobs (`meteo_obs`, `meteo_radome`, `meteo_infoclimat`, `meteo_climat`, `meteo_purge`), 6 endpoints `/api/meteo/*` (`apps/api/src/routes/meteo.ts`), page `meteo.astro` riche (temps réel, prévisions, normales, records), migration `003_meteo.sql` |
| Îles Svelte | 3 | **8** (+ `ReliefExplorer`, `MeteoTempsReel`, `MeteoStationsDirect`, `MeteoPrevisions`, `MeteoClimat`) + composants graphes réutilisables (`apps/web/src/components/graphes/`) |
| Migrations | 001, 002 | 001, 002, **003** (`series.meteo_quotidien`, `series.meteo_horaire`) |

### Acquis solides (ne pas retoucher)

- Flux worker → PostGIS → API → front stable ; jobs isolés, journalisés dans `meta.fetch_log`, migrations automatiques au démarrage.
- Relief 3D local (PMTiles Copernicus + LiDAR HD IGN, protocole `aigoualdem://`), recherche unifiée BAN + `pg_trgm`, ingestion BAN en streaming avec purge.
- Pattern « série temporelle » éprouvé par la météo (table `series.*` → endpoint API → île graphique) : c'est le modèle que le pilier indicateurs va généraliser.

### Manques connus

- Pas de `README.md` racine, pas de dépôt git initialisé, pas de tests, pas de CI.
- 8 pages de section encore en placeholder « en préparation » — dont `environnement` et `risques` **alors que leurs données sont déjà en base et servies par l'API** (couches `natura2000`, `znieff`, `piezo`, `station_hydro`, `cavite`, `mouvement`).

---

## Diagnostic : le coût d'ajout d'une source

Ajouter une source aujourd'hui touche **4 à 5 endroits**, et deux d'entre eux dégradent la lisibilité du site à chaque ajout :

| # | Point de friction | Localisation | Symptôme |
|---|---|---|---|
| 1 | Fichier source + registre `JOBS` | `apps/worker/src/sources/*.ts`, `apps/worker/src/scheduler.ts` | Normal — c'est le seul coût légitime |
| 2 | Entrée `CATALOGUE_SOURCES` | `packages/shared/src/territoire.ts` | Mélange sources amont (ingesteurs) et couches affichables ; slugs jobs ≠ slugs catalogue (`georisques` produit `cavite` + `mouvement`, `apicarto` produit `natura2000` + `znieff`, `hubeau` produit `piezo` + `station_hydro`) |
| 3 | Mappings manuels `COULEUR` / `NOM_COUCHE` | `apps/web/src/lib/carte.ts` | À maintenir à la main, déjà incomplets (`natura2000`/`znieff` ont un nom mais pas de couleur) |
| 4 | Page de section écrite à la main | `apps/web/src/pages/*.astro` | Les données arrivent en base mais restent invisibles tant que personne n'écrit la page → placeholders `environnement`, `risques`, `services`, `tourisme` |
| 5 | Panneau de couches codé en dur | `apps/web/src/islands/MapExplorer.svelte` | `GROUPES`, `GROUPES_ACTIFS_DEFAUT`, `LIBELLE_CLE`, détection polygone `["natura2000","znieff"]`, cas spéciaux popup par `if (slug === ...)` — le panneau grossit linéairement et devient illisible |

`CarteThematique.svelte` a le même défaut : 5 cas spéciaux `if (slug === ...)` pour construire ses popups.

---

## Chantier A — Socle modulaire

> ✅ **Chantier A livré le 2026-07-12** — les 6 étapes sont implémentées, buildées et vérifiées en base (dépôt git initialisé, un commit par étape). Le gel de l'ajout de sources est levé : le chantier B peut démarrer. Reste à faire côté humain : parcours navigateur de `/carte` et des sections, et renseigner la source INSEE réelle (cf. étape 5).

**Priorité** : 🔴 P0 — **l'ajout de sources est gelé jusqu'à la fin des étapes 1, 2 et 6** (les étapes 3, 4, 5 peuvent glisser en parallèle).
**Invariants** : aucune URL ne change (`/api/couches/:slug`, pages), Astro reste statique, migrations SQL additives, pas de nouveau framework, chaque étape laisse le site iso-fonctionnel et livrable.

### Étape 1 — Descripteur de couche unique ✅ 🔴 P0

**Objectif** : séparer « source amont » (jeu de données externe, ingéré par un job) et « couche » (ce qui s'affiche), et déclarer en **un seul endroit** tout ce dont le front a besoin.

**Fichiers** :
- **Créer** `packages/shared/src/catalogue.ts` — client-safe (aucun import `pg`), exposé en subpath `@opendata-vda/shared/catalogue` (même mécanisme que `./sections`).
- **Modifier** `packages/shared/src/territoire.ts` (retirer `CATALOGUE_SOURCES`/`SourceCatalogue`, déplacés), `packages/shared/package.json` (export subpath), `packages/shared/src/index.ts`.
- **Modifier** `apps/api/src/routes/couches.ts` : slugs validés contre `COUCHES` (et plus contre le catalogue mixte).

**Structures** :

```ts
/** Source amont = un jeu de données externe, ingéré par un job worker. */
interface SourceAmont {
  slug: string;            // stable — PK de meta.sources
  nom: string;
  url: string;
  licence: string;
  attribution?: string;    // mention courte carte ("© IGN", "© contributeurs OSM")
  frequence: string;
  theme: SectionSlug;      // rubrique pour /sources
  job?: string;            // slug du job worker — résout le désalignement jobs ↔ catalogue
}

type FormatChamp = "texte" | "nombre" | "metres" | "surface_ha" | "date" | "labels_json";
interface ChampPopup { cle: string; libelle: string; format?: FormatChamp }

/** Couche = un jeu d'objets de couches.objets, affichable sur les cartes. */
interface CoucheCarte {
  slug: string;                 // = couches.objets.couche — NE PAS renommer (URLs stables)
  libelle: string;              // "Cavité souterraine"
  libellePluriel: string;       // "Cavités souterraines"
  section: SectionSlug;
  source: string;               // slug SourceAmont
  geometrie: "point" | "polygone";   // "ligne" sera ajouté au chantier B.4
  couleur: string;
  cluster?: boolean;
  tirets?: boolean;             // contour pointillé (znieff)
  visibleParDefaut?: boolean;   // état initial sur /carte
  titreProps?: string[];        // titre de popup composé (adresse : numero + rep + nom_voie)
  popup?: ChampPopup[];         // absent = auto (props scalaires non techniques)
  chronique?: { endpoint: string; cle: string };  // piezo : /api/piezo/chronique + code_bss
}
```

Plus les helpers dérivés : `COUCHES_PAR_SLUG`, `couchesDeSection(slug)`, `sourceDeCouche(c)`, et deux fonctions **pures** (pas de DOM) partagées par toutes les îles : `titrePopup(couche, props)` et `lignesPopup(couche, props)`.

Le nom `CATALOGUE_SOURCES` est conservé (compat `metaSources.ts`, `SectionLayout.astro`, `sources.astro`) mais nettoyé : les entrées `cavite`, `mouvement`, `natura2000`, `znieff`, `piezo`, `station_hydro` deviennent des `COUCHES` référençant leurs sources `georisques`/`apicarto`/`hubeau`. Aucun slug existant n'est renommé (`meta.sources` et `meta.fetch_log` restent cohérents). ~14 couches attendues : `cavite`, `mouvement`, `piezo`, `station_hydro`, `natura2000`, `znieff`, `ecole`, `administration`, `poi_osm`, `adresse`, `entreprise`, `parcelle_agricole`, `signe_qualite`, `station_meteo`.

**Risques** : oubli d'un slug de couche → 404 sur `/api/couches/:slug/geojson` (croiser avec un grep `couche:` dans `apps/worker/src/sources/`) ; `/sources` affichera « Géorisques » une fois au lieu de deux entrées (comportement voulu).

**Vérification** : `pnpm build:web` passe ; `curl /api/couches/<slug>/geojson` répond pour chacun des 14 slugs ; `/sources` affiche toutes les sections ; `pnpm worker:once` avec `RUN_ONLY=meta_sources` repeuple `meta.sources` sans erreur.

### Étape 2 — Le front consomme le descripteur ✅ 🔴 P0 (dépend de 1)

**Objectif** : supprimer les mappings manuels et tous les `if (slug === ...)` des îles — une seule fabrique de couche MapLibre, une seule fabrique de popup.

**Fichiers** :
- **Modifier** `apps/web/src/lib/carte.ts` : supprimer `COULEUR`/`NOM_COUCHE` ; ajouter la fabrique unique
  `ajouterCoucheCarte(map, couche: CoucheCarte, geojson, visible, onClic): string[]`
  qui remplace les créations ad hoc de MapExplorer et CarteThematique et délègue à `ajouterCoucheClusterisee` si `couche.cluster`.
- **Modifier** `apps/web/src/islands/CarteThematique.svelte` : résolution `slugs → COUCHES_PAR_SLUG` ; popup DOM générique via `titrePopup`/`lignesPopup` (les 5 cas spéciaux deviennent des `titreProps`/`popup` du descripteur ; le format `labels_json` gère les props sérialisées en JSON-string par MapLibre) ; la prop `cluster` devient un override optionnel (défaut : `couche.cluster`) pour ne pas casser `meteo.astro`/`economie.astro`.
- **Modifier** `apps/web/src/islands/MapExplorer.svelte` : création des couches via la fabrique (fin de la détection polygone en dur et du cas `adresse`) ; popup générique (suppression de `LIBELLE_CLE`) ; le graphe piézo est déclenché par `couche.chronique` (rendu SVG inchangé).

**Risques** : régressions visuelles de popups — comparer manuellement chaque couche avant/après ; préserver l'ordre d'insertion des layers (polygones sous les points).

**Vérification** : sur `/carte`, cliquer une feature de chaque couche (dont piezo avec graphe et adresse avec titre composé) ; `/population`, `/economie`, `/meteo` : popups identiques à avant ; `natura2000`/`znieff` ont désormais une couleur propre.

### Étape 3 — Panneau de couches à l'échelle ✅ 🟠 P1 (dépend de 2)

**Objectif** : panneau de `MapExplorer.svelte` groupé par section, dérivé du descripteur — l'ajout d'une couche au catalogue fait apparaître son entrée sans toucher le composant.

**Fichiers** : `apps/web/src/islands/MapExplorer.svelte` uniquement.

- `GROUPES` codé en dur → groupes « infrastructure » fixes (Limites administratives, Géologie WMS + opacité) + un groupe par entrée de `SECTIONS` ayant ≥ 1 couche dans `COUCHES` (titre/couleur de la section).
- Interrupteur **par couche**, interrupteur de groupe = tout/rien, groupes repliables (repliés par défaut sauf si une couche du groupe est active).
- État initial : `COUCHES.filter(c => c.visibleParDefaut)` (remplace `GROUPES_ACTIFS_DEFAUT`).

**Vérification** : toutes les couches non vides apparaissent groupées par section ; ajouter une couche fictive dans `COUCHES` la fait apparaître sans modification de `MapExplorer` ; accessibilité conservée (`role="switch"`, `aria-checked`).

### Étape 4 — Socle indicateurs ✅ 🟠 P1 (parallélisable avec 2-3)

**Objectif** : généraliser le pattern météo (table `series.*` → endpoint → île graphique) pour toute série non cartographique (INSEE, OFGL/DGFiP…). **Les tables et pages météo existantes ne bougent pas.**

**Fichiers** :
- **Créer** `db/migrations/004_indicateurs.sql` :
  ```sql
  create table series.indicateurs (
    indicateur text not null,   -- slug du registre (ex. 'population_municipale')
    territoire text not null,   -- code INSEE commune ou code EPCI
    periode    text not null,   -- '1968', '2022', '2022-T1' — format normalisé, tri lexicographique
    valeur     numeric,
    source     text not null,   -- slug SourceAmont
    maj        timestamptz not null default now(),
    primary key (indicateur, territoire, periode)
  );
  ```
- **Créer** `packages/shared/src/indicateurs.ts` (subpath client-safe `./indicateurs`) : registre `DefinitionIndicateur { slug, libelle, unite, source, section, representation: "ligne" | "barres", decimales? }` + `INDICATEURS_PAR_SLUG` + `indicateursDeSection(slug)`.
- **Modifier** `packages/shared/src/db.ts` : `upsertIndicateurs(pool, lignes)` — upsert par lots via `unnest`, calqué sur `upsertObjetsEnLot`.
- **Créer** `apps/api/src/routes/indicateurs.ts` : `GET /api/indicateurs/:slug?territoire=&depuis=` → `{ indicateur, points: [{ territoire, periode, valeur }] }`, slug validé contre le registre, cache long. **Modifier** `apps/api/src/index.ts` (register).
- **Créer** `apps/web/src/islands/GrapheIndicateur.svelte` : props `{ indicateur, territoire?, hauteur?, titre? }`, fetch au montage, états chargement/vide/erreur (calqués sur `MeteoClimat`), rendu via les composants **existants** `components/graphes/GrapheLignes.svelte` / `GrapheBarres.svelte`.

**Vérification** : insérer 2-3 lignes en SQL, `curl /api/indicateurs/population_municipale?territoire=30339`, monter l'île sur une page locale.

### Étape 5 — Première source d'indicateurs (preuve de bout en bout) 🟡 🟠 P1 (dépend de 4)

**Objectif** : valider le socle avec la population historique INSEE (recensements 1968 → aujourd'hui, séries historiques data.gouv/INSEE, sans clé).

**Fichiers** : **créer** `apps/worker/src/sources/insee_population.ts` (filtre sur les 15 codes de `COMMUNES_EPCI`, `upsertIndicateurs`) ; **modifier** `scheduler.ts` (cron annuel), `catalogue.ts` (SourceAmont `insee_population`, theme `population`), `indicateurs.ts` (définition `population_municipale`, representation `ligne`) ; **modifier** `population.astro` (monter `GrapheIndicateur`).

**Vérification** : `RUN_ONCE=true RUN_ONLY=insee_population` sans erreur, courbe visible sur `/population`, run consigné dans `meta.fetch_log`.

> ⚠️ **À finaliser — URL de la source INSEE (🔑 découverte de donnée)**. Le code est livré et vérifié (parseur tolérant aux deux formats de colonnes INSEE `PMUN`/`PSDC` et `P/D_POP` testé ; chaîne API→île prouvée en base avec des points injectés), **mais l'URL du fichier CSV historique INSEE n'a pas pu être épinglée** : les identifiants de fichier `insee.fr` testés renvoient 500 (INSEE les fait tourner à chaque édition), et la recherche data.gouv ne remonte pas la série nationale par commune. En conséquence :
> - le worker lit l'URL dans la variable d'environnement **`INSEE_POPULATION_CSV_URL`** et le job est **ignoré proprement** (prédicat `actif`) tant qu'elle n'est pas renseignée — donc aucune régression ;
> - **action requise** : identifier le bon fichier (candidats : INSEE « base des populations historiques » / « séries historiques du recensement », ou un miroir CSV data.gouv/ODS ; attention aux formats `.xlsx`/`.zip` qui nécessiteraient un dézippage — privilégier un CSV brut), renseigner `INSEE_POPULATION_CSV_URL` dans `.env`, puis `RUN_ONCE=true RUN_ONLY=insee_population`. Adapter au besoin les motifs de colonnes dans `anneeDeColonne` (`insee_population.ts`).

### Étape 6 — SectionAuto : fin des placeholders ✅ 🔴 P0 (dépend de 2 ; enrichie par 4-5 sans en dépendre)

**Objectif** : restitution par défaut automatique dès qu'une section a des couches et/ou des indicateurs. Une page peut toujours surcharger via le slot (`meteo.astro` inchangée).

**Fichiers** :
- **Créer** `apps/web/src/components/SectionAuto.astro` : si `couchesDeSection(slug)` non vide → bloc « Sur la carte » (`CarteThematique` avec les slugs de la section, cluster piloté par le descripteur) + légende (pastille couleur, `libellePluriel`, attribution de la source) ; si `indicateursDeSection(slug)` non vide → un `GrapheIndicateur` par indicateur ; sinon → message « en préparation » actuel.
- **Modifier** `apps/web/src/layouts/SectionLayout.astro` : le fallback du `<slot>` devient `<SectionAuto slug={slug} />`. Les pages une-ligne (`environnement`, `risques`, `services`, `tourisme`, `mobilite`, `democratie`, `finances`, `territoire`) **n'ont pas besoin d'être modifiées** ; les pages sur mesure (`population`, `economie`, `geographie`, `meteo`) gardent leur contenu.

**Risques** : couches volumineuses (`poi_osm` pour services/tourisme) → `cluster: true` dans le descripteur ; cartes mixtes points + polygones (environnement) → ordre polygones d'abord (géré à l'étape 2).

**Vérification** : `/environnement`, `/risques`, `/services`, `/tourisme` affichent carte + légende + sources sans placeholder et **sans page écrite à la main** ; `/meteo` inchangée ; `pnpm build:web` OK.

---

## Chantier B — Reprise des sources

**Précondition** : chantier A étapes 1, 2, 6 livrées (+ 4 pour les sources « indicateurs »). Grâce au socle, chaque source suit désormais la même checklist courte :

> ☐ fichier `apps/worker/src/sources/<x>.ts` → ☐ entrée `JOBS` → ☐ entrée(s) `catalogue.ts` (SourceAmont + CoucheCarte) et/ou `indicateurs.ts` → ☐ `RUN_ONCE=true RUN_ONLY=<x>` → la restitution (pages de section, carte, /sources) est automatique.

Ordre proposé (reprend les briques 2-5 de l'ancienne roadmap, réordonnées) :

| # | Lot | Sources | Type | Priorité | Notes |
|---|---|---|---|---|---|
| B.1 | Socio-économie | INSEE dossier complet (logement, résidences secondaires), BPE | indicateurs + couche | 🟠 P1 | Pages population/économie enrichies automatiquement |
| B.2 | Finances | OFGL (**API v2.1 obligatoire**, la v1 renvoie 400), balances DGFiP, DECP | indicateurs | 🟠 P1 | `finances` sort du placeholder via SectionAuto ; SIREN commune 200082725, EPCI 200034601 |
| B.3 | Environnement & risques compléments | Hub'Eau qualité rivières/écoulement, Géorisques zonage sismique/radon/Cat-Nat/feu, cœur du Parc national des Cévennes | couches | 🟡 P2 | Pures couches — coût marginal minimal |
| B.4 | Tourisme & mobilité | PDIPR Gard (sentiers GR/GRP/PR), liO Occitanie (GTFS), DATAtourisme 🔑 | couches | 🟡 P2 | **Extension du descripteur : `geometrie: "ligne"`** (sentiers, lignes de transport) — seule évolution front prévue |
| B.5 | Démocratie | Résultats électoraux, RNE (élus) | indicateurs + tableaux | 🟡 P2 | Représentation « tableau » à ajouter au registre si nécessaire |

---

## Chantier C — Mise en production et transverse

Indépendant des chantiers A et B, à mener au fil de l'eau.

| Tâche | Priorité | État | Notes |
|---|---|---|---|
| **Init git du dépôt** | 🔴 P0 | ⏳ | Le projet n'est **pas un dépôt git**. Préalable à tout déploiement propre. Vérifier que `.env` (présent à la racine) est couvert par `.gitignore` avant le premier commit. |
| `README.md` racine | 🟠 P1 | ⏳ | Absent. Installation, commandes, variables d'environnement, guide de déploiement. |
| Déploiement VPS | 🔴 P0 | ❌ 🔑 | Bloqué : VPS (2 vCPU / 4 Go / 20 Go) + domaine côté commanditaire. Procédure déjà décrite dans `CLAUDE.md` (docker-compose, Caddy/SSL). |
| Sauvegardes + logs | 🟠 P1 | ⏳ | `pg_dump` nightly, rotation des logs Docker, script de healthcheck. Après déploiement. |
| Audit Lighthouse / accessibilité | 🟡 P2 | ⏳ | Après chantier A étape 6 (les pages auto changent le DOM). Cibles : ≥ 90 partout. |
| Tests automatisés | 🟢 P3 | ⏳ | Candidats prioritaires une fois le socle en place : helpers purs du catalogue (`titrePopup`, `lignesPopup`), formats de popup, registre indicateurs — fonctions pures faciles à tester. |

---

## Séquençage et dépendances

```
Chantier A :  1 ──> 2 ──> 3
                    └────> 6  (fin des placeholders)
              4 ──> 5 ─(enrichit)─> 6        (4 parallélisable avec 2-3)

Chantier B :  après A.1, A.2, A.6 (+ A.4 pour B.1/B.2/B.5)
              B.1 → B.2 → B.3 → B.4 → B.5 (ordre indicatif, lots indépendants)

Chantier C :  git + README dès maintenant ; VPS dès que fourni ; le reste après A.6
```

Pas de deadlines datées : le séquencement est piloté par les dépendances ci-dessus. Chaque étape du chantier A laisse le site iso-fonctionnel — on peut s'arrêter et livrer entre chaque étape.

---

## Blocages externes

| Ressource | Bloque | Action côté commanditaire |
|---|---|---|
| VPS (2 vCPU / 4 Go / 20 Go) + nom de domaine | Chantier C (déploiement) | Fournir l'accès ; DNS vers l'IP du VPS |
| Clé DATAtourisme (flux Occitanie `OCC`, gratuite) | Chantier B.4 (POI touristiques) | Demander la clé sur datatourisme.fr |
| Tokens météo (`METEOFRANCE_API_TOKEN`, `INFOCLIMAT_API_TOKEN`) | Rien — déjà gérés | En place via `.env` ; les jobs météo se désactivent proprement sans token |

Aucun blocage externe sur le chantier A : il peut démarrer immédiatement.

---

> **Note** : ce document est vivant — le mettre à jour à la fin de chaque étape du chantier A et de chaque lot du chantier B (états ✅/🟡/⏳/❌). Ne pas modifier sans validation humaine.
