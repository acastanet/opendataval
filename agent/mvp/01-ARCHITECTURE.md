# 01 — Architecture MVP

## Principe

Le MVP réutilise les services OpenDataVdA existants. Il ne les réorganise pas par sphères.

Le nouveau centre de gravité est une **instance de dalle** orchestrée par `site-service`.

```text
lat + lon
   │
   ▼
INSTANCE / TILE
   │
   ├──────────────► pipeline 3D
   │
   └──────────────► site-service
                       │
             ┌─────────┼─────────┐
             ▼         ▼         ▼
           IGN       BRGM      météo/eau/...
             └─────────┼─────────┘
                       ▼
                 manifest.json
                       │
                       ▼
                    REVIEW
                       │
                       ▼
                  PUBLICATION
```

## Responsabilités

### Instance manager

Responsable de :

- créer l’identifiant ;
- calculer l’emprise ;
- créer le stockage de l’instance ;
- gérer les états du cycle de vie.

Il peut être initialement intégré à `site-service` si cela réduit la complexité.

### `site-service`

Responsable de :

- orchestrer la collecte ;
- appeler les services existants ;
- normaliser les résultats ;
- constituer le manifeste ;
- suivre le statut des sous-traitements ;
- exposer le dossier logique d’une dalle.

Il ne doit pas devenir :

- un moteur cartographique ;
- un moteur LiDAR ;
- un duplicateur des clients métiers existants.

### Pipeline 3D

Responsable des actifs :

- terrain ;
- bâtiments ;
- végétation ;
- orthophoto si utilisée ;
- GLB final.

La 3D est fabriquée puis stockée. Le navigateur ne reconstruit pas la dalle.

Le seul pipeline 3D existant (`poc/valleraugue-mairie-3d`) n'est pas
déclenchable automatiquement : il exige une étape Roofer amont sous Docker
lancée à la main, un environnement Python natif Windows, et un paramètre
(`GEOLOGY_DEPARTMENT`) saisi manuellement par scène. Le rendre pilotable par
`site-service` est un chantier à part entière, tracé au lot P8 du
[`08-BACKLOG.md`](08-BACKLOG.md). M1 se raccorde à une scène déjà produite par ce
POC (voir [`05-M1-VERTICAL-SLICE.md`](05-M1-VERTICAL-SLICE.md), § « Acceptable
temporairement »).

### Services métiers existants

Ils restent responsables de leur domaine : carte, géographie, météo, vigilance, BSS, OLD, feu, eau, etc.

### Frontend public

Lit une instance publiée. Il ne porte pas la logique métier de sélection des données.

`apps/web` est configuré en `output: "static"` (`apps/web/astro.config.mjs`) : il
ne peut pas générer une page par instance créée à la demande. Pour M1, la page de
consultation d'une dalle est rendue côté `gateway-service`, sur le modèle de ses
pages déjà dynamiques (`apps/gateway-service/src/pages/landing.ts`,
`pages/demo.ts`, `pages/app-terrain.ts`), et non par `apps/web`. Voir ADR-008.

### Interface de supervision

Lit l’instance en `review_required`, affiche les propositions, permet les corrections et déclenche l’approbation.

## Stockage MVP

```text
instances/
└── <tile_id>/
    ├── manifest.json
    ├── scene/
    ├── geo/
    ├── data/
    ├── report/
    └── review.json
```

Ce répertoire est un volume nommé monté par `site-service` et par le service qui
sert les actifs 3D publics, déclaré dans `docker-compose.yml` sur le modèle du
montage `publication/` de `poc/valleraugue-mairie-3d` (voir
`Caddyfile`/`docker-compose.yml`, référencés depuis
`poc/valleraugue-mairie-3d/AGENTS.md` § « Ce que la POC touche à la racine du
dépôt »). Ce n'est pas un choix ouvert : voir ADR-007.

PostgreSQL, via une migration dans `db/migrations/`, conserve :

- l’index des instances et leur `tile_id` ;
- une séquence dédiée pour le compteur `NNNNNN` de `tile_id` (voir
  [`02-TILE-CONTRACT.md`](02-TILE-CONTRACT.md)) — un compteur basé sur le
  système de fichiers ne serait pas fiable en écriture concurrente ;
- leurs états ;
- les versions ;
- les caches ou données partagées.

Les gros actifs (GLB, orthophoto, LAZ) restent sur le volume `instances/`, jamais
en base.

## Temporalité

### Snapshot

Données figées à la fabrication :

- LiDAR ;
- bâtiments ;
- cadastre ;
- géologie ;
- INSEE ;
- climat ;
- zonages.

### Live

Données pouvant être rafraîchies :

- météo ;
- vigilance ;
- feu ;
- Vigicrues.

Le manifeste doit indiquer cette différence.
