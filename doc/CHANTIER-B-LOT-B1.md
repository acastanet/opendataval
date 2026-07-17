# Chantier B — Lot B.1 « Socio-économie » (indicateurs logement INSEE + couche BPE)

> Plan d'implémentation du lot B.1 de `doc/FEUILLE-DE-ROUTE-2026.md`. À mettre à jour (✅/🟡/⏳/❌) au fil
> de la livraison.

## Contexte

Le chantier A (socle modulaire) est livré : ajouter une source suit désormais une checklist courte
(1 fichier worker → 1 entrée `JOBS` → entrée(s) `catalogue.ts`/`indicateurs.ts` → `RUN_ONCE`), sans
toucher au front pour les pages génériques. Le chantier B reprend maintenant les sources de données
gelées pendant le chantier A. Le lot B.1, premier de la liste, ajoute au territoire :

- des **indicateurs de logement** (INSEE, dossier complet — logements total, résidences principales,
  résidences secondaires, logements vacants) sur la page `/population`, qui enrichissent le seul
  indicateur existant (`population_municipale`) ;
- une **couche BPE** (Base Permanente des Équipements INSEE — commerces, santé, enseignement, sports,
  tourisme) sur `/economie`, en 4ᵉ carte à côté de `entreprise`/`parcelle_agricole`/`signe_qualite`.

Point important, déjà rencontré à l'étape 5 du chantier A : **les identifiants de fichiers CSV INSEE
changent à chaque édition** (ex. `insee.fr/fr/statistiques/8581474` pour le logement 2022 vs `7631186`
pour 2020) et aucune URL stable n'a pu être confirmée pour le logement ni pour la BPE lors de
l'exploration (recherche web + tentative de fetch en timeout sur data.gouv.fr). Ce plan reproduit donc
le **même garde-fou** que `insee_population.ts` : URL en variable d'environnement, prédicat `actif` qui
désactive proprement le job tant qu'elle est absente, et une action humaine documentée pour la finaliser
— pas d'invention d'URL.

Décisions validées avec l'utilisateur :
- 4 indicateurs logement (total, résidences principales, résidences secondaires, logements vacants).
- Pas de factorisation avec `insee_population.ts` — `insee_logement.ts` autonome, pour ne prendre aucun
  risque de régression sur une source déjà livrée et vérifiée en base.
- B.1.a (indicateurs logement) et B.1.b (couche BPE) traités dans la même passe.

## B.1.a — Indicateurs logement INSEE

**Créer `apps/worker/src/sources/insee_logement.ts`**, calqué sur
`apps/worker/src/sources/insee_population.ts` (parseur CSV tolérant, filtre sur `COMMUNES_EPCI`, upsert
via `upsertIndicateurs`) :

- `variableDeColonne(col): { annee: string; variable: "LOG"|"RP"|"RSECOCC"|"LOGVAC" } | null` — regex
  `^([PD])(\d{2})_(LOG|RP|RSECOCC|LOGVAC)$` (même logique de préfixe P/D → 20xx/19xx que
  `anneeDeColonne` dans le fichier existant, mais 4 variables par colonne au lieu d'une seule).
- `parserLogementCsv(texte): IndicateurInput[]` — même boucle CODGEO/séparateur/guillemets que
  `parserPopulationCsv`, mappe chaque variable trouvée vers l'un des 4 slugs d'indicateur.
- `run(pool)` : lit `process.env.INSEE_LOGEMENT_CSV_URL`, throw une erreur explicite si absent (même
  message que le fichier existant, adapté), fetch → parse → `upsertIndicateurs(pool, points)` → retourne
  `points.length`.
- Exporter les fonctions pures (`variableDeColonne`, `parserLogementCsv`) comme le fait déjà le fichier
  existant.

**Modifier `packages/shared/src/indicateurs.ts`** — ajouter 4 entrées à `INDICATEURS`, sur le modèle
exact de `population_municipale` (source `"insee_logement"`, section `"population"`,
`representation: "ligne"`, `decimales: 0`) :
`logements_total`, `logements_residences_principales`, `logements_residences_secondaires`,
`logements_vacants`.

**Modifier `packages/shared/src/catalogue.ts`** — ajouter une entrée à `CATALOGUE_SOURCES` :
`slug: "insee_logement"`, `theme: "population"`, `job: "insee_logement"`, `frequence: "annuelle"`,
`attribution: "© INSEE"`, `licence: "Licence Ouverte 2.0"` (mêmes conventions que l'entrée
`insee_population` juste au-dessus dans le tableau).

**Modifier `apps/worker/src/scheduler.ts`** :
- importer `* as inseeLogement from "./sources/insee_logement.js"` ;
- ajouter à `JOBS`, juste après l'entrée `insee_population` :
  ```ts
  {
    slug: "insee_logement",
    cron: "10 5 25 1 *", // annuel, juste après insee_population
    run: inseeLogement.run,
    actif: () => Boolean(process.env.INSEE_LOGEMENT_CSV_URL),
  },
  ```

**Modifier `apps/web/src/pages/population.astro`** — après le bloc `GrapheIndicateur
population_municipale` existant, ajouter un `<h2>`/texte + 4 `GrapheIndicateur` (même pattern
`client:only="svelte" indicateur="..." territoire={TERRITOIRE.commune.codeInsee}`). Cette page ne passe
pas par `SectionAuto` (slot toujours rempli), donc l'édition manuelle est la seule option — confirmé par
le code.

**Réserve à documenter dans le code** (commentaire en tête de `insee_logement.ts`, comme dans le fichier
existant) : URL du CSV « dossier complet logement » à identifier manuellement (rechercher
« base-cc-logement » sur data.gouv.fr/insee.fr), format de colonnes à confirmer sur le fichier réel (peut
différer du schéma `P../D.._LOG/RP/RSECOCC/LOGVAC` supposé), `INSEE_LOGEMENT_CSV_URL` à renseigner dans
`.env` une fois trouvée.

## B.1.b — Couche BPE (équipements)

**Créer `apps/worker/src/sources/bpe.ts`**, calqué sur `apps/worker/src/sources/signesQualite.ts`
(pattern couche CSV : horodatage début → collecte `ObjetInput[]` filtrée sur `COMMUNES_EPCI` →
`upsertObjetsEnLot` par lots de 500 → `delete from couches.objets where couche = 'bpe' and maj < $1`) :

- `process.env.BPE_CSV_URL`, throw si absent.
- Détection souple de colonnes (candidats pour la commune : `DEPCOM`/`CODGEO` ; type d'équipement :
  `TYPEQU` ; coordonnées : `LATITUDE`/`LONGITUDE` ou `LAMBERT_X`/`LAMBERT_Y` ; nom : `NOMRS` optionnel).
- **Point de vigilance coordonnées** : si le fichier trouvé n'expose que des coordonnées Lambert 93, il
  faudra une conversion vers WGS84 (aucune dépendance de reprojection dans le monorepo aujourd'hui) — à
  traiter une fois le fichier réel en main, pas à deviner maintenant.
- Classification par « domaine » à partir de la 1ʳᵉ lettre du code `TYPEQU` (A = services aux
  particuliers, B = commerces, C = enseignement, D = santé/action sociale, E = transports,
  F = sports/loisirs/culture, G = tourisme — nomenclature INSEE stable), via un petit objet statique
  dans le fichier, pour éviter d'embarquer la table de libellés détaillés (sujette à évolutions
  d'édition).
- `ObjetInput`: `{ couche: "bpe", externalId, props: { domaine, typeEquipement, commune, nom? },
  geometry: { type: "Point", coordinates: [lon, lat] }, sourceUrl }`. `externalId` : à défaut de clé
  naturelle documentée de façon fiable, composer `${depcom}-${typeEquipement}-${index}` (à ajuster une
  fois le fichier réel disponible).
- `run(pool)` : retourne le nombre d'objets traités.

**Modifier `packages/shared/src/catalogue.ts`** :
- `CATALOGUE_SOURCES` : `slug: "bpe"`, `theme: "economie"`, `job: "bpe"`, `frequence: "trimestrielle"`,
  `attribution: "© INSEE"`.
- `COUCHES` (section economie) :
  ```ts
  {
    slug: "bpe",
    libelle: "Équipement (BPE)",
    libellePluriel: "Équipements (BPE)",
    section: "economie",
    source: "bpe",
    geometrie: "point",
    couleur: "#4a6f9c", // teinte bleu ardoise, distincte des 3 couches economie existantes
    cluster: true,
    popup: [
      { cle: "domaine", libelle: "domaine" },
      { cle: "typeEquipement", libelle: "type (code)" },
      { cle: "commune", libelle: "commune" },
    ],
  },
  ```

**Modifier `apps/worker/src/scheduler.ts`** : importer `* as bpe from "./sources/bpe.js"`, ajouter à
`JOBS` :
```ts
{
  slug: "bpe",
  cron: "0 4 1 */3 *", // trimestriel, comme apicarto
  run: bpe.run,
  actif: () => Boolean(process.env.BPE_CSV_URL),
},
```

**Modifier `apps/web/src/pages/economie.astro`** — ajouter un 4ᵉ bloc après `signe_qualite` avec un
`<h2>`/texte explicatif + `<CarteThematique client:only="svelte" couches={["bpe"]} />`.

**Réserve à documenter** : URL du CSV BPE « format évolution » (dataset data.gouv.fr
`base-permanente-des-equipements`, semble plus stable qu'un identifiant par édition mais non confirmée
par fetch direct) à épingler manuellement, schéma de colonnes à valider sur le fichier réel.

## Fichiers concernés (récapitulatif)

- **Créer** : `apps/worker/src/sources/insee_logement.ts`, `apps/worker/src/sources/bpe.ts`
- **Modifier** : `packages/shared/src/catalogue.ts`, `packages/shared/src/indicateurs.ts`,
  `apps/worker/src/scheduler.ts`, `apps/web/src/pages/population.astro`,
  `apps/web/src/pages/economie.astro`
- **Non modifiés** (génériques, dérivent déjà du registre) : `apps/api/src/routes/indicateurs.ts`,
  `apps/api/src/routes/couches.ts`, `apps/web/src/islands/GrapheIndicateur.svelte`,
  `apps/web/src/islands/CarteThematique.svelte`

## Vérification

1. **Sans variable d'env renseignée** (état par défaut juste après l'implémentation) :
   - `RUN_ONCE=true RUN_ONLY=insee_logement` et `RUN_ONCE=true RUN_ONLY=bpe` doivent chacun échouer
     explicitement (`process.exit(1)`, message citant la variable manquante) — comportement RUN_ONLY
     explicite déjà en place dans `apps/worker/src/index.ts`.
   - En exécution planifiée normale (`pnpm worker:once` sans `RUN_ONLY`, ou cron), ces deux jobs doivent
     être ignorés silencieusement (`console.warn`, pas d'entrée `meta.fetch_log`) — comportement déjà géré
     par `runJob` dans `scheduler.ts`, à ne pas modifier.
2. `pnpm build:web` doit passer sans erreur TypeScript (les nouveaux slugs doivent être acceptés par les
   types `as const satisfies` de `catalogue.ts`/`indicateurs.ts`).
3. `RUN_ONCE=true RUN_ONLY=meta_sources` doit repeupler `meta.sources` avec les 2 nouvelles entrées
   (`insee_logement`, `bpe`), visibles ensuite sur `/sources`.
4. **Une fois les URL réelles trouvées et renseignées dans `.env`** (action humaine, hors périmètre de
   cette implémentation) :
   - `RUN_ONCE=true RUN_ONLY=insee_logement` → `[insee_logement] ok — N lignes` ;
     `curl /api/indicateurs/logements_total?territoire=30339` → points non vides ; `/population` affiche
     les nouvelles courbes.
   - `RUN_ONCE=true RUN_ONLY=bpe` → `[bpe] ok — N lignes` ; `curl /api/couches/bpe/geojson` →
     `FeatureCollection` non vide avec `domaine`/`typeEquipement`/`commune` ; `/economie` affiche la
     nouvelle carte avec clusters et popups cohérents.
