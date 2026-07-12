# Plan — Accueil, UI carte modernisée, recherche avec suggestions

## Contexte

Le portail open data de Val-d'Aigoual n'a aujourd'hui qu'une seule page : la carte plein écran ([apps/web/src/pages/index.astro](apps/web/src/pages/index.astro)), sans navigation ni page de présentation. La recherche d'adresse est rudimentaire : déclenchée uniquement sur Entrée, bridée à la seule commune 30339, sans autocomplete, sans tolérance aux fautes, et elle ignore les lieux nommés déjà en base (Mont Aigoual, écoles, mairies, stations…).

Objectifs validés avec l'utilisateur :
1. **Page d'accueil riche** sur `/` (hero, chiffres clés, thématiques, catalogue des sources, CTA) ; la carte déménage sur `/carte`.
2. **UI carte modernisée** : facile, jolie, moderne, mobile-first — en restant sur CSS vanilla + palette « Cévennes » existante, sans nouveau framework.
3. **Recherche améliorée** : suggestions à la frappe, tolérance aux fautes, périmètre = **les 15 communes de l'EPCI**, fusion **BAN + lieux locaux en base** (pg_trgm + unaccent).

Aucune nouvelle dépendance npm. Svelte 4 (pas de runes). Pas de lint/test dans ce dépôt.

---

## Étape 0 — DX : proxy dev `/api`

**Fichier : [apps/web/astro.config.mjs](apps/web/astro.config.mjs)**

Ajouter le proxy Vite pour que `pnpm dev:web` + `pnpm dev:api` fonctionnent ensemble (aujourd'hui les fetch `/api/*` échouent en dev) :

```js
vite: { server: { proxy: { "/api": "http://localhost:3000" } } },
```

## Étape 1 — Migration : fuzzy en base

**Fichier à créer : `db/migrations/002_recherche.sql`** (appliquée automatiquement au démarrage api/worker par `runMigrations` — aucune commande à ajouter ; les extensions sont dans contrib, incluses dans l'image `postgis/postgis:16-3.4-alpine`).

```sql
create extension if not exists pg_trgm;
create extension if not exists unaccent;

create or replace view couches.lieux_recherche as
  select 'commune' as type, 'commune' as couche, nom, null::text as sous_label,
         ST_PointOnSurface(geom) as pt
  from territoire.communes
  union all
  select 'lieu', couche,
         coalesce(props->>'nom', props->>'lieu') as nom,
         props->>'commune' as sous_label,
         ST_PointOnSurface(geom)
  from couches.objets
  where coalesce(props->>'nom', props->>'lieu') is not null;
```

Points d'attention :
- `poi_osm` a des `nom` null → le `where` les exclut ; `mouvement` utilise `props->>'lieu'`.
- `ST_PointOnSurface` gère à la fois les points et les polygones (natura2000, znieff, communes).
- **Pas d'index trigram** : volumes de quelques centaines de lignes, un seq scan avec `word_similarity()` suffit. (Pas besoin non plus du wrapper `immutable_unaccent` — cette contrainte n'existe que pour indexer ; à revisiter si les volumes grossissent.)

## Étape 2 — API : route `GET /api/recherche`

**Fichiers : [apps/api/src/routes/outils.ts](apps/api/src/routes/outils.ts) et [apps/api/src/index.ts](apps/api/src/index.ts)**

- `index.ts` : passer le pool → `registerOutilsRoutes(app, pool)`.
- `outils.ts` : **remplacer** `/api/adresse` (seul consommateur = le front, modifié en même temps) par `GET /api/recherche?q=` qui interroge en parallèle (`Promise.allSettled` — une source en panne ne casse pas l'autre) :

  **a) BAN** — `https://api-adresse.data.gouv.fr/search/?q=…&autocomplete=1&limit=15&lat=44.081&lon=3.6272` (biais géographique via `TERRITOIRE.commune.centre`). ⚠️ La BAN n'accepte **qu'un seul** `citycode` → ne pas le passer, et **post-filtrer** côté serveur les features dont `properties.citycode` ∈ `Set(COMMUNES_EPCI.map(c => c.codeInsee))`, puis garder les 5 premières.

  **b) Lieux locaux** — requête sur la vue :
  ```sql
  select type, couche, nom, sous_label,
         ST_X(pt) as lon, ST_Y(pt) as lat,
         word_similarity(unaccent(lower($1)), unaccent(lower(nom))) as score
  from couches.lieux_recherche
  where unaccent(lower(nom)) ilike '%' || unaccent(lower($1)) || '%'
     or word_similarity(unaccent(lower($1)), unaccent(lower(nom))) > 0.35
  order by score desc limit 5
  ```

- Réponse unifiée, triée score décroissant :
  ```json
  { "resultats": [ { "type": "adresse|lieu|commune", "couche": "ecole",
      "label": "…", "sousLabel": "…", "lon": 3.58, "lat": 44.12, "score": 0.8 } ] }
  ```
  Pour la BAN : `label` = `properties.label`, `sousLabel` = `properties.context`, score BAN déjà en 0–1. Pour les lieux : `sousLabel` = libellé de couche (réutiliser un mapping type `NOM_COUCHE` — le déplacer/dupliquer côté partagé n'est pas nécessaire, un petit mapping local suffit).

## Étape 3 — Front : composant de recherche avec suggestions

**Fichier à créer : `apps/web/src/islands/RechercheLieux.svelte`** (composant enfant importé par MapExplorer — la logique recherche sort du monolithe).

Comportement :
- **Autocomplete à la frappe** : debounce ~250 ms, minimum 3 caractères, `AbortController` pour annuler les requêtes en vol (évite les réponses arrivées dans le désordre).
- **Clavier complet** : ↑/↓ (surbrillance), Entrée (sélection), Échap (fermeture), fermeture au clic extérieur / blur.
- **Accessibilité** : pattern ARIA combobox (`role="combobox"`, `aria-expanded`, `aria-activedescendant`, liste `role="listbox"` / `role="option"`).
- **Affichage** : résultats groupés par type (Adresses / Lieux / Communes) avec `sousLabel` en second niveau ; état « Aucun résultat » ; indicateur de chargement discret.
- Émet un événement `selection` avec `{ lon, lat, type, label }`.

**Fichier : [apps/web/src/islands/MapExplorer.svelte](apps/web/src/islands/MapExplorer.svelte)**
- Supprimer `rechercheQ/rechercheResultats/rechercheOuverte`, `lancerRecherche()`, `allerVersResultat()` (lignes 69-71, 220-240), le markup `.recherche` (419-436) et ses styles.
- Monter `<RechercheLieux on:selection={…} />` au même emplacement ; à la sélection : `map.flyTo` avec zoom adapté au type (adresse → 16, lieu → 15, commune → 13) + **marqueur temporaire** `maplibregl.Marker` au point choisi (retiré à la sélection suivante ou via Échap).

## Étape 4 — Pages : accueil riche + `/carte`

Invoquer le skill **`frontend-design`** avant d'écrire cette UI (identité « montagne/Cévennes », thème clair/sombre déjà en place).

- **Créer `apps/web/src/pages/carte.astro`** : reprend le contenu actuel d'index.astro (monte `MapExplorer client:only`), title « Carte — Val-d'Aigoual… ».
- **Réécrire [apps/web/src/pages/index.astro](apps/web/src/pages/index.astro)** — page d'accueil composée de :
  - **Hero** : nom du territoire, sous-titre EPCI, motif `--contour-rule`, CTA « Explorer la carte → /carte ».
  - **Chiffres clés** : rendus **statiquement au build** depuis `@opendata-vda/shared` (15 communes, population = somme de `COMMUNES_EPCI`, nb de sources = `CATALOGUE_SOURCES.length`, Mont Aigoual 1 567 m) → la page ne dépend pas de l'API. Enrichissement progressif optionnel : petit `<script>` qui fetch `/api/couches` pour afficher « N objets géolocalisés » avec échec silencieux si l'API est down.
  - **Thématiques** : les 6 groupes (mêmes libellés/couleurs que `GROUPES` de MapExplorer), chacun liant vers `/carte`.
  - **Catalogue des sources** : tableau/cartes depuis `CATALOGUE_SOURCES` (nom, licence, fréquence, lien).
- **Composants à créer dans `apps/web/src/components/`** : `SiteHeader.astro` (logo/nom + nav Accueil | Carte) et `SiteFooter.astro` (licences, mention sources) — utilisés par l'accueil ; la page carte reste plein écran sans header global.
- **[apps/web/src/layouts/Layout.astro](apps/web/src/layouts/Layout.astro)** : ajouter un favicon SVG inline (data URI) et une prop `description` optionnelle.
- **[apps/web/src/styles/global.css](apps/web/src/styles/global.css)** : ajouter quelques tokens (`--shadow`, espacements) et les styles de l'accueil qui méritent d'être globaux.

## Étape 5 — Modernisation incrémentale de l'UI carte

Toujours dans [MapExplorer.svelte](apps/web/src/islands/MapExplorer.svelte), sans réécriture totale, par ordre de priorité :

1. **Icônes SVG inline** à la place des émojis (loupe, thème, fermeture, calques) — cohérence visuelle, pas de dépendance.
2. **Entête carte** : bandeau compact avec lien « ← Accueil » cliquable (l'entête actuelle est `pointer-events:none`) + nom du site.
3. **Panneau couches redessiné** : sélecteur de fond en « segmented control » visuel (au lieu de radios texte), groupes avec badge du nombre d'objets (donnée déjà dispo dans `catalogue`), checkboxes stylées type interrupteur, slider d'opacité pour l'overlay géologie (`raster-opacity`, déjà prévu dans la vision MVP).
4. **Fiche détail** : libellés français lisibles pour les clés de `props` (petit mapping), transition d'apparition Svelte (`fly`), hiérarchie typographique retravaillée.
5. **Élévations douces** (`--shadow` sur panneau/fiche/recherche), focus visibles, états hover cohérents.
6. **Mobile** : conserver le bottom-sheet mais soigner la poignée, le seuil `max-height`, et vérifier que recherche + fiche ne se chevauchent pas.

Rester sur la palette Cévennes de [global.css](apps/web/src/styles/global.css) et les 3 thèmes existants (vérifier chaque ajout en clair ET en sombre).

## Étape 6 — Documentation

Mettre à jour [CLAUDE.md](CLAUDE.md) : deux pages (`/` accueil, `/carte`), nouvelle route `/api/recherche` (remplace `/api/adresse`), vue `couches.lieux_recherche`, migration 002, proxy dev Vite.

---

## Vérification de bout en bout

1. **Dev local** : `pnpm dev:api` (les logs doivent montrer l'application de `002_recherche.sql`) + `pnpm dev:web`. La base doit tourner (docker compose db) et avoir été peuplée (`pnpm worker:once` si base vide).
2. **Migration** : `docker compose exec db psql -U opendata -d opendata_vda -c "\dx"` → `pg_trgm` et `unaccent` listés ; `select * from couches.lieux_recherche limit 5;` renvoie des lignes.
3. **API — saisies fautives** :
   - `curl "localhost:3000/api/recherche?q=aigoul"` → « Mont Aigoual » (type lieu) malgré la faute ;
   - `curl "localhost:3000/api/recherche?q=valerauge"` → adresses/lieux-dits de Valleraugue ;
   - `curl "localhost:3000/api/recherche?q=lasalle"` → commune Lasalle (preuve du périmètre EPCI) ;
   - `curl "localhost:3000/api/recherche?q=ecole"` → écoles en base.
4. **Navigateur** (skill `run`) : `/` → accueil complet, chiffres corrects, liens vers `/carte` ; `/carte` → carte OK, **recherche à la frappe** (suggestions groupées, navigation clavier ↑↓/Entrée/Échap, clic extérieur ferme), sélection → flyTo + marqueur. Couper l'API → l'accueil reste intact (chiffres statiques).
5. **Thèmes et mobile** : basculer clair/sombre/auto sur les deux pages ; viewport 375 px (bottom-sheet, recherche, fiche).
6. **Build** : `pnpm build:web` passe sans erreur.
