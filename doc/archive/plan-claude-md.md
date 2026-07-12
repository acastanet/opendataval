# Plan — Création de CLAUDE.md

## Contexte

Le dépôt ne contient encore aucun CLAUDE.md, ni README, ni règles Cursor/Copilot, ni configuration de lint/tests. L'objectif est de documenter dans un CLAUDE.md les commandes utiles et l'architecture "big picture" du projet, pour que les prochaines instances de Claude Code soient productives rapidement sans devoir relire tous les fichiers.

Le projet (`opendata-vda`) est un portail de données ouvertes pour une seule collectivité (commune de Val-d'Aigoual et son EPCI, Gard). C'est un monorepo pnpm avec 3 apps (`web`, `api`, `worker`) et un package partagé (`shared`), sans suite de tests ni linter configurés actuellement.

## Contenu prévu pour CLAUDE.md

Le fichier commencera par l'en-tête imposé, puis contiendra :

**Commandes**
- `pnpm install` — installation (pnpm 11.10.0, workspaces `apps/*` + `packages/*`)
- `pnpm dev:web` / `pnpm dev:api` / `pnpm dev:worker` — dev de chaque app (astro dev / tsx watch)
- `pnpm worker:once` — exécute une seule fois toutes les sources du worker puis quitte (`RUN_ONCE=true`)
- `pnpm build:web` — build statique Astro
- `docker-compose up --build` — stack complète (db postgis, api, worker, caddy), nécessite un `.env` basé sur `.env.example`
- Précision : pas de suite de tests ni de linter configuré dans ce dépôt à ce jour ; ne pas inventer de commande `lint`/`test`.

**Architecture**
- Monorepo pnpm : `packages/shared` (`@opendata-vda/shared`) exporte les constantes de territoire, l'accès Postgres et les migrations ; `apps/worker` ingère les données ; `apps/api` (Fastify) les sert ; `apps/web` (Astro + île Svelte MapLibre) les affiche.
- `packages/shared/src/territoire.ts` : point d'édition unique pour ré-utiliser le projet sur un autre territoire (code INSEE, EPCI, bbox, `CATALOGUE_SOURCES`).
- Modèle de données (`db/migrations/001_init.sql`) : schémas `territoire` (communes + géométries), `couches.objets` (table générique point/polygone par couche, clé `couche` + `external_id`, `props` jsonb — destination de la plupart des sources), `series.piezo` (chroniques piézométriques), `meta.sources`/`meta.fetch_log` (journal d'exécution). `meta.migrations` est créée au runtime par `migrate.ts`.
- `packages/shared/src/db.ts` est le seul point d'accès Postgres (upsertCommune/upsertObjet/upsertPiezoMesures/logFetchStart/logFetchEnd) partagé par api et worker ; `migrate.ts` applique automatiquement au démarrage (api et worker) tout fichier `.sql` non encore appliqué — pas de commande de migration séparée.
- `apps/worker/src/scheduler.ts` : registre unique `JOBS` (slug → cron → `run(pool)`) ; chaque source dans `src/sources/*.ts` expose `run(pool): Promise<number>`. Ajouter une source = un fichier + une entrée dans `JOBS`. `runJob` journalise chaque exécution dans `meta.fetch_log`.
- `apps/api/src/routes/couches.ts` sert n'importe quelle couche déclarée dans `CATALOGUE_SOURCES` en GeoJSON via `/api/couches/:slug/geojson` (slugs whitelistés) — générique, pas besoin d'une route par couche. `routes/outils.ts` héberge de simples proxys serveur (altimétrie IGN, adresse.data.gouv.fr) pour éviter le CORS.
- `apps/web` : site Astro statique (`output: "static"`) avec une seule île Svelte interactive `MapExplorer.svelte` (`client:only`, pas de SSR) qui pilote une carte MapLibre GL (fonds IGN WMTS + calque géologie BRGM en WMS) et consomme `/api/territoire`, `/api/couches`, `/api/couches/:slug/geojson`. Le mapping couche → groupe d'affichage/couleur/nom (`GROUPES`, `COULEUR`, `NOM_COUCHE`) vit uniquement côté front, indépendamment de `CATALOGUE_SOURCES` côté back.
- Déploiement : `docker-compose.yml` + Dockerfiles par app + `Caddyfile`. Chaque Dockerfile fait un `pnpm install --filter <app>...` ciblé ; api/worker tournent directement via `tsx` en prod (pas de build JS compilé), seul `web` est buildé (`astro build`) et servi en statique par Caddy, qui reverse-proxy `/api/*` vers le service `api`.

## Vérification
- Relire le CLAUDE.md généré pour confirmer qu'il ne répète pas de détails triviaux et reste scannable.
- Pas d'action d'exécution nécessaire (tâche de documentation uniquement).
