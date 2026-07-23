# Guide de travail pour les agents

Dernière vérification : 22 juillet 2026.

Ce fichier donne le contexte opérationnel nécessaire pour travailler dans le dépôt
`opendata-vda`. Il décrit l'état réel du code au moment de sa rédaction. Lire ce
fichier avant toute modification, puis vérifier les fichiers directement concernés :
le code et la configuration restent toujours la source de vérité finale.

## 1. Sources de vérité et documents historiques

Utiliser cet ordre de confiance :

1. code, `package.json`, migrations SQL, `docker-compose.yml`, `Caddyfile` et
   `.env.example` ;
2. ce fichier racine `AGENT.md` ;
3. `doc/gouvernance/mise-a-jour.md` pour toute mise à jour du dépôt, des dépendances ou d'un
   déploiement ;
4. documentation spécialisée récente, notamment
   `doc/v1/incendies/rapport-installation.md`,
   `doc/v1/incendies/exploitation.md`, `doc/microservice/copernicus/exploitation.md`,
   `apps/copernicus/README.md`, `mini_app/README.md` et les ADR ;
5. `doc/gouvernance/deploiement-vps.md` pour les précautions de déploiement, en vérifiant chaque
   commande contre les fichiers réellement présents ;
6. feuilles de route et documents de vision dans `doc/` ;
7. archives dans `doc/archive/`.

`CLAUDE.md`, `doc/gouvernance/AGENT.md` et `doc/v1/monolithe/architecture-legacy.md` ont servi de documents de
conception, mais sont partiellement obsolètes. Ne pas reprendre sans vérification
leurs listes de sources, tables, ports, versions, commandes ou règles de travail.
Exemples d'écarts connus :

- des tests incendies existent désormais ;
- l'API écoute sur le port 3000, pas 4000 ;
- le front Astro est statique et servi par Caddy, il n'existe pas de service web
  Astro séparé dans Compose ;
- la base utilise plusieurs schémas (`territoire`, `couches`, `series`, `meta`,
  `incendies`) et non les tables génériques décrites dans l'ancien document ;
- le projet utilise Svelte 4 et MapLibre GL 5 d'après les dépendances actuelles ;
- le worker comprend désormais la météo, les indicateurs et les incendies ;
- les calculs climatiques Copernicus sont assurés par une application Python dédiée,
  distincte du worker TypeScript.

## 2. Finalité du projet

Le projet est un portail open data pour la commune de Val-d'Aigoual et la
Communauté de communes Causses Aigoual Cévennes – Terres Solidaires, dans le Gard.
Il agrège des données publiques, les stocke et les expose sous forme de cartes,
d'indicateurs, de pages thématiques et de mini-applications terrain.

### État actuel du produit

Le travail opérationnel porte notamment sur les applications suivantes :

1. **Incendies / Feu** : déjà déployée et accessible publiquement à l'adresse
   `https://euporie.cloud/feu/`. Dans le code et dans la stack Docker locale, sa
   route reste `/incendies/`. Le préfixe public `/feu/` est une réécriture réalisée
   par le nginx de l'hôte, en dehors de ce dépôt. La page experte publique est
   `https://euporie.cloud/feu/temps-reel/` et la route interne correspondante est
   `/incendies/temps-reel/`.
2. **Eau** : mini-app actuellement en cours de développement. Les routes
   intégrées visées sont `/eau/` et `/eau/tableau-de-bord/`. Ne pas la présenter
   comme déployée ou finalisée sans nouvelle vérification de l'environnement public.
3. **Météo** : application locale en développement, avec une vue complète
   `/meteo/`, une vue simplifiée `/meteo/essentiel/`, une page d'informations
   `/meteo/informations/` et un bilan climatique `/meteo/bilan-thermique/`. Les
   agrégats Copernicus ont été ingérés une première fois le 21 juillet 2026,
   mais ne pas en déduire que ces pages sont déployées publiquement.

Le portail complet contenu dans le monorepo ne doit pas être considéré comme
entièrement déployé simplement parce que la mini-app Feu l'est. Pour l'état précis
du déploiement Feu, consulter `doc/v1/incendies/rapport-installation.md`.

Le flux principal est :

```text
sources publiques -----> worker TypeScript -----+
                                                 |
Copernicus CDS -------> service Python ----------+--> PostgreSQL 16 + PostGIS 3.4
                                                        |
                                                        v
                                                 API Fastify /api/*
                                                        |
                                                        v
                          Astro statique + îlots Svelte + MapLibre, servis par Caddy
```

Le dépôt est principalement un monorepo pnpm avec les workspaces `apps/*` et
`packages/*`, complété par l'application Python autonome `apps/copernicus`. Le
gestionnaire JavaScript attendu est pnpm 11.10.0, déclaré dans le `packageManager`
racine. TypeScript est configuré en mode strict avec `noUncheckedIndexedAccess`.

## 3. Arborescence utile

```text
apps/
  api/                  API Fastify et routes HTTP
  copernicus/           collectes climatiques Python ERA5-Land et ERA5-HEAT
  web/                  site Astro statique et îlots Svelte
  worker/               collectes, transformations et planification cron
packages/
  shared/               territoire, catalogue, indicateurs, DB et migrations
db/migrations/          migrations SQL appliquées automatiquement
data/incendies/         fichiers locaux de secours du risque Gard
data/downloads/         cache local ignoré des fichiers bruts Copernicus
doc/                    documentation, ADR, exploitation et feuilles de route
e2e/                    tests visuels et fonctionnels Playwright
mini_app/               prototype historique autonome de la mini-app Eau
docker-compose.yml      stack locale : db, api, worker, caddy + profil copernicus
Caddyfile               reverse proxy local et serveur de fichiers statiques
```

Points d'entrée importants :

- `packages/shared/src/territoire.ts` : codes du territoire, communes, emprise et
  constantes géographiques ;
- `packages/shared/src/catalogue.ts` : catalogue des sources et des couches ;
- `packages/shared/src/sections.ts` : taxonomie des pages thématiques ;
- `packages/shared/src/indicateurs.ts` : registre des indicateurs ;
- `packages/shared/src/localisationsMeteo.ts` : points météo partagés et
  normalisation des coordonnées ;
- `packages/shared/src/db.ts` : accès PostgreSQL et fonctions d'upsert communes ;
- `packages/shared/src/migrate.ts` : application automatique des migrations ;
- `apps/worker/src/scheduler.ts` : registre et fréquence de tous les jobs ;
- `apps/api/src/index.ts` : enregistrement des modules de routes ;
- `apps/api/src/routes/meteoClimate.ts` : publication des agrégats climatiques ;
- `apps/copernicus/src/copernicus/main.py` : collecte, calcul et planification
  Copernicus ;
- `apps/web/src/lib/carte.ts` : primitives MapLibre partagées ;
- `apps/web/src/styles/global.css` : variables et styles globaux.

## 4. Commandes courantes

Depuis la racine :

```bash
pnpm install
pnpm dev:web
pnpm dev:api
pnpm dev:worker
pnpm build:web
pnpm test:e2e
pnpm test:incendies
pnpm check:incendies
```

Malgré son nom historique, `pnpm test:incendies` exécute toute la suite déclarée
par l'API, y compris les tests météo, puis les tests du worker actuellement centrés
sur FIRMS. `pnpm check:incendies` ajoute les vérifications TypeScript de l'API et du
worker, puis le build Astro. `pnpm test:e2e` lance les scénarios Playwright dans
Chromium pour les formats bureau et mobile.

Il n'existe actuellement ni commande `lint`, ni commande unique couvrant TypeScript,
Python, Playwright et le build. Ne pas annoncer qu'un contrôle inexistant a été
exécuté. Pour un contrôle TypeScript ciblé :

```bash
pnpm --filter api exec tsc --noEmit
pnpm --filter worker exec tsc --noEmit
```

Pour lancer la stack locale :

```bash
docker compose up --build
```

Le portail est alors exposé sur `http://localhost:8080` et l'API via
`http://localhost:8080/api/*`. Le serveur Astro de développement proxifie `/api`
vers `http://localhost:3000`.

Le service Copernicus appartient à un profil Compose désactivé par défaut. Pour
construire son image et exécuter ses tests unitaires :

```bash
docker compose --profile copernicus build copernicus
docker compose --profile copernicus run --rm --no-deps copernicus python -m unittest discover -s /app/tests -v
```

Pour une collecte ponctuelle, préférer Docker lorsque l'environnement hôte est
Windows :

```bash
docker compose run --rm -e RUN_ONCE=true -e RUN_ONLY=geoapi worker
```

`RUN_ONLY` doit correspondre exactement à un slug de `JOBS`. Sans `RUN_ONLY`, un
run ponctuel exécute tous les jobs actifs séquentiellement. La commande
`pnpm worker:once` repose sur une affectation d'environnement de syntaxe POSIX et
peut ne pas fonctionner telle quelle dans PowerShell.

## 5. Configuration et secrets

Créer `.env` à partir de `.env.example`. Ne jamais committer ni afficher les
valeurs de `.env`.

Variables principales :

- `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`,
  `POSTGRES_DB` ;
- `SITE_DOMAIN` ;
- `METEOFRANCE_API_TOKEN` pour `meteo_obs` et `meteo_radome` ;
- `METEOFRANCE_API_TOKEN_VIGILANCE` pour la vigilance du Gard exposée par
  `/api/meteo/point` ;
- `INFOCLIMAT_API_TOKEN` pour `meteo_infoclimat` ;
- `NASA_FIRMS_MAP_KEY` pour `firms` ;
- `INSEE_POPULATION_CSV_URL` pour `insee_population` ;
- `COPERNICUS_CDS_URL` et `COPERNICUS_CDS_KEY` pour l'application Copernicus ;
- `COPERNICUS_PRODUCT_TYPE`, `COPERNICUS_RUN_ONCE` et, lors d'une relance ciblée,
  `COPERNICUS_TARGET_MONTH` ou `COPERNICUS_FORCE_DOWNLOAD` ;
- `FIRE_RISK_GARD_FALLBACK_DIR`, défini à `/app/data/incendies` dans Compose.

Les jobs TypeScript dépendant d'une clé absente sont ignorés. Le profil Copernicus
est inactif par défaut et une exécution explicite sans clé doit échouer proprement.
Une clé serveur ne doit jamais être envoyée au navigateur, ajoutée à une URL
client, journalisée ou incluse dans un ticket.

Le dossier `.claude/` contient de la configuration locale d'outil et doit rester
ignoré. Les fichiers `data/incendies/YYYYMMDD.json` sont des secours opérationnels
temporaires : ne pas les committer sans demande explicite et contrôle de leur
contenu. Seul `data/incendies/.gitkeep` est destiné à Git.
Les fichiers bruts de `data/downloads/`, ainsi que les fichiers NetCDF et GRIB,
sont des caches Copernicus ignorés et ne doivent pas être ajoutés au dépôt.

## 6. Base de données et migrations

L'API et le worker appellent `runMigrations` au démarrage. Les fichiers SQL de
`db/migrations/` sont triés par nom, exécutés dans une transaction et enregistrés
dans `meta.migrations`. Un verrou consultatif PostgreSQL empêche l'API et le worker
d'appliquer simultanément la même migration.

Ne pas modifier une migration déjà déployée. Ajouter une nouvelle migration
numérotée, de préférence additive et idempotente lorsque c'est possible. Toute
migration destructive exige une sauvegarde vérifiée et un accord explicite.

État du modèle après les migrations `001` à `010` :

- `territoire.communes` : communes, population et géométries ;
- `couches.objets` : stockage générique des objets géographiques par couche ;
- `couches.lieux_recherche` : vue de recherche textuelle et spatiale ;
- `series.piezo` : mesures piézométriques ;
- `series.meteo_quotidien` et `series.meteo_horaire` : séries météo ;
- `series.meteo_points_reference` et `series.meteo_climatologie_jour` : points
  météo fixes et références quotidiennes ERA5-Land 1991–2020 ;
- `series.thermal_monthly` : bilans UTCI mensuels ERA5-HEAT, nuits tropicales et
  dates des seuils de stress thermique ;
- `series.indicateurs` : séries d'indicateurs territoriaux ;
- `meta.sources`, `meta.fetch_log`, `meta.migrations` : catalogue et exploitation ;
- `incendies.zones`, `incendies.detections_firms`,
  `incendies.risques_officiels` : mini-app incendies.

Les géométries persistées sont en SRID 4326. Utiliser PostGIS et les helpers de
`packages/shared/src/db.ts` plutôt que de dupliquer les requêtes d'upsert. Les
index spatiaux sont des index GIST.

## 7. Worker et ingestion

Chaque source se trouve dans `apps/worker/src/sources/` et expose généralement :

```ts
export async function run(pool: pg.Pool): Promise<number>;
```

Une source doit ensuite être enregistrée dans `JOBS` dans `scheduler.ts` avec un
slug et une expression cron. `runJob` journalise chaque exécution dans
`meta.fetch_log` avec un statut `ok`, `partiel` ou `erreur`.

Jobs actuellement enregistrés :

- socle : `meta_sources`, `geoapi` ;
- territoire et données publiques : `georisques`, `apicarto`, `education`,
  `lannuaire`, `osm`, `hubeau`, `adresses`, `entreprises`, `rpg`,
  `signes_qualite`, `insee_population` ;
- météo : `meteo_obs`, `meteo_radome`, `meteo_infoclimat`, `meteo_purge`,
  `meteo_climat` ;
- incendies : `fire_zones`, `fire_risk_gard`, `firms`.

L'application Python Copernicus ne fait pas partie de `JOBS`. Elle expose
`meteo_climatologie_points` et `thermal_monthly`, lancés avec `RUN_ONLY`. En mode
planifié, elle vérifie chaque jour à 03:20 si le bilan du mois précédent doit être
calculé le 8 ou si la climatologie annuelle doit être renouvelée le 9 janvier.

Principes à conserver :

- filtrer les données sur les codes et l'emprise du territoire, pas seulement sur
  des noms ;
- préférer les upserts en lot pour les gros volumes ;
- ne pas charger entièrement en mémoire les gros exports si un traitement en flux
  est possible ;
- conserver la dernière donnée valide lors d'une panne de fournisseur ;
- distinguer une absence de résultat d'un échec de collecte ;
- rendre les fréquences explicites en fuseau `Europe/Paris`.

## 8. API Fastify

Les routes sont regroupées par module dans `apps/api/src/routes/` et enregistrées
dans `apps/api/src/index.ts`. L'API écoute par défaut sur `0.0.0.0:3000`.

Principales familles de routes :

- `/api/health` ;
- `/api/territoire` ;
- `/api/couches` et `/api/couches/:slug/geojson` ;
- `/api/piezo/chronique` ;
- `/api/alti`, `/api/vigicrues/observations`, `/api/recherche` ;
- `/api/meteo/*` ;
- `/api/meteo/contexte-climatique` et `/api/meteo/bilan-thermique` ;
- `/api/indicateurs/:slug` ;
- `/api/incendies/*`.

Pour les couches génériques, valider les slugs contre le catalogue partagé. Ne pas
créer une route spécifique si le mécanisme générique convient. Utiliser des
requêtes paramétrées et retourner une erreur publique compréhensible ; les détails
techniques restent dans les logs serveur.

Après une modification de contrat API, rechercher tous les consommateurs dans
`apps/web` et mettre à jour les types correspondants. Le dépôt n'utilise pas de
génération automatique de types entre API et front.

## 9. Front Astro, Svelte et cartographie

Astro produit un site statique dans `apps/web/dist`. Les composants interactifs
sont des îlots Svelte. Les pages principales se trouvent dans `apps/web/src/pages/`.

`src/pages/index.astro` est la landing page commune « Feu, Eau, Terre ». Elle doit
rester légère, sans dépendre de l'API, et orienter vers `/feu/`, `/eau/` et
`/carte/`, tout en conservant dans son plan du site l'accès à la Météo
essentielle. La destination Terre est l'explorateur cartographique existant. Le
préfixe public Feu reste réécrit par nginx en dehors du dépôt.

Éléments structurants :

- `SectionLayout.astro` et `SectionAuto.astro` construisent les pages thématiques ;
- `MapExplorer.svelte` pilote l'explorateur cartographique complet ;
- `CarteThematique.svelte`, `Carte3D.svelte` et `ReliefExplorer.svelte` fournissent
  les expériences cartographiques spécialisées ;
- `Meteo*.svelte`, `PiezoNappe.svelte` et les composants de graphes affichent les
  séries ;
- `MeteoPoint.svelte` porte la vue météo complète, `MeteoEssentiel.svelte` la vue
  simplifiée et `BilanThermique.svelte` les agrégats Copernicus ;
- `FireDashboard.svelte` est l'écran incendies grand public ;
- `FireExpertDashboard.svelte` est l'écran d'exploration des détections.

La mini-app Incendies est intégrée au portail et déjà déployée sous le nom public
Feu :

- `/incendies/` en local, réécrit en `/feu/` sur `euporie.cloud`, présente d'abord
  le risque officiel et les consignes ;
- `/incendies/temps-reel/` en local, réécrit en `/feu/temps-reel/` en production,
  présente les anomalies thermiques comme des indices,
  jamais comme la confirmation d'un incendie ;
- les interfaces doivent rester lisibles en extérieur, contrastées, accessibles et
  utilisables sur mobile ;
- en cas de feu observé, l'appel au 112 ou au 18 reste l'information prioritaire.

La mini-app Eau est le chantier actif. Elle a deux formes qui ne sont pas
automatiquement synchronisées :

- `mini_app/` est le prototype autonome historique ;
- `apps/web/src/pages/eau/` et `apps/web/public/eau/` sont la version intégrée.

Avant de modifier Eau, identifier explicitement la cible. Ne pas copier une
modification d'une version vers l'autre sans vérifier leurs divergences.

La partie Météo combine des données de prévision, d'observation, de vigilance et
des agrégats climatiques. Les trois points préconfigurés Val-d'Aigoual, Paris et
Marseille sont partagés dans `packages/shared/src/localisationsMeteo.ts`. Conserver
la distinction entre une position GPS précise et ces points fixes : Copernicus ne
publie actuellement ses références que pour les points préconfigurés ou les points
précis déjà calculés et persistés.

La cartographie utilise MapLibre, les fonds IGN et des archives PMTiles de relief.
Réutiliser `apps/web/src/lib/carte.ts` pour les contrôles, fonds, clusters et relief.
Les popups construites à partir de données externes doivent utiliser le DOM et
`textContent`, jamais du HTML interpolé non fiable.

Les fichiers de relief sont volumineux et régénérables :

```text
apps/web/public/relief/aigoual.pmtiles
apps/web/public/relief/aigoual-hd.pmtiles
```

Ne pas les remplacer, supprimer ou régénérer dans une tâche ordinaire. Compose les
monte fichier par fichier dans Caddy pour ne pas masquer la page `/relief/`.

## 10. Conventions de modification

Avant de coder :

1. lire la demande et inspecter l'état Git ;
2. rechercher l'implémentation existante avec `rg` ;
3. lire entièrement les fichiers concernés et les types partagés ;
4. vérifier si le même comportement existe dans plusieurs mini-apps ;
5. identifier les effets sur la DB, le worker, l'API et le front.

Pendant la modification :

- préserver les changements locaux qui ne relèvent pas de la tâche ;
- utiliser TypeScript strict et éviter `any` ;
- conserver les noms français déjà employés dans le domaine et l'interface ;
- réutiliser les registres, helpers, variables CSS et composants existants ;
- ne pas ajouter une dépendance si la pile actuelle suffit ;
- ne pas exposer d'erreur brute ni de secret ;
- préserver l'accessibilité clavier, les libellés ARIA, le contraste et le mode
  `prefers-reduced-motion` ;
- documenter les limites fonctionnelles importantes près du code ou dans le guide
  d'exploitation approprié.

Ne pas mettre à jour automatiquement toutes les feuilles de route pour une petite
correction. Mettre à jour la documentation seulement si le comportement, le
contrat, l'exploitation ou l'architecture change réellement.

## 11. Vérification proportionnée

Choisir les contrôles selon les fichiers touchés :

| Zone modifiée | Contrôles minimaux |
|---|---|
| Astro, Svelte, CSS, carte | `pnpm build:web` |
| Parcours Météo | `pnpm --filter api test`, `pnpm build:web` et scénario Playwright ciblé |
| API incendies | `pnpm --filter api test` puis `tsc --noEmit` |
| Worker FIRMS | `pnpm --filter worker test` puis `tsc --noEmit` |
| Ensemble incendies | `pnpm check:incendies` |
| Autre code API/worker | `tsc --noEmit` ciblé + contrôle fonctionnel pertinent |
| Compose ou Caddy | `docker compose config` puis démarrage ciblé si autorisé |
| Migration SQL | démarrage sur une base de test et inspection de `meta.migrations` |
| Application Copernicus | build de l'image et tests `unittest` dans le conteneur |

Le build peut signaler des avertissements d'accessibilité préexistants dans des
composants non concernés. Les mentionner sans les attribuer à la modification.
Ne pas déclarer la tâche validée si une commande a échoué ou n'a pas pu être lancée.

Pour un contrôle local après démarrage Docker :

```bash
curl http://localhost:8080/api/health
curl http://localhost:8080/api/incendies/situation
docker compose ps
```

## 12. Git et sécurité opérationnelle

Le dépôt peut être sale au début d'une session. Les changements existants
appartiennent à l'utilisateur. Ne pas les annuler, les reformater en masse ni les
inclure dans un commit sans autorisation explicite.

Avant un commit :

```bash
git status --short
git diff --check
git diff --cached --check
```

Ne jamais committer `.env`, des clés, des sauvegardes, des fichiers de secours
opérationnels ou des réglages locaux. Ne pas pousser vers une branche distante sans
demande explicite. Les messages de commit existants sont majoritairement en
français ; rester concis et décrire le résultat.

En production :

- ne pas exposer PostgreSQL, l'API interne ou le worker directement sur Internet ;
- ne jamais exécuter `docker compose down -v`, supprimer un volume ou restaurer une
  base sans accord explicite et sauvegarde vérifiée ;
- considérer le `Caddyfile` et le port `8080:80` du dépôt comme une configuration
  locale, pas comme une configuration HTTPS de production ;
- suivre `README_agent.md` pour préparer un déploiement, tout en vérifiant que les
  scripts et fichiers qu'il mentionne existent réellement ;
- après déploiement, vérifier les services, `/api/health`, les pages principales,
  les logs et la sauvegarde.

Pour la procédure complète, suivre `MISE_A_JOUR.md` à la racine.

## 13. Compte rendu attendu

À la fin d'une tâche, indiquer de façon concise :

- le résultat obtenu ;
- les fichiers réellement modifiés ;
- les vérifications exécutées et leur résultat ;
- les avertissements préexistants ou limites restantes ;
- l'état Git si un commit ou un push était demandé.

Ne pas masquer une hypothèse, une vérification impossible ou une dette découverte.
