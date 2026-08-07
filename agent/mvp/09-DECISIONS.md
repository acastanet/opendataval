# 09 — Journal des décisions

Ce fichier conserve les décisions structurantes prises pendant le MVP.

Ne pas utiliser ce fichier pour les tâches ordinaires.

## Format

```text
## ADR-XXX — Titre

Date:
Statut: proposed | accepted | superseded

Contexte:
...

Décision:
...

Conséquences:
...

Fichiers/contrats impactés:
...
```

## ADR-001 — Dalle MVP fixe à 100 × 100 m

Statut: superseded par ADR-004

Décision :

La dalle MVP mesure 100 × 100 m et est calculée en Lambert-93 autour du centre fourni.

Conséquence :

La taille n’est pas exposée comme paramètre métier pendant le MVP.

## ADR-002 — `site-service` orchestre sans remplacer les services métiers

Statut: accepted

Décision :

Les microservices existants sont conservés. `site-service` les appelle et normalise leurs résultats.

## ADR-003 — Première priorité : tranche verticale M1

Statut: accepted

Décision :

Une chaîne complète création → consultation → revue → publication doit être démontrée avant l’élargissement massif des sources.

## ADR-004 — Dalle MVP portée à 200 × 200 m

Date: 2026-08-07
Statut: accepted

Contexte:

Le seul pipeline 3D disponible (`poc/valleraugue-mairie-3d`) ne produit aucune
scène de référence sous 200 m de côté. Sa calibration entière — marge de
terrain, résolution d'orthophotographie, segmentation des houppiers, dalles
LiDAR HD — est réglée pour l'intervalle 200–2000 m. Fixer la dalle métier à
100 m aurait forcé soit une scène 3D plus large que la dalle (deux emprises à
maintenir), soit une recalibration non validée du POC.

Décision :

La dalle MVP mesure 200 × 200 m, calculée en Lambert-93 autour du centre
fourni. Cela remplace l'ADR-001.

Conséquences :

- `width_m`/`height_m` valent `200`, `area_m2` ≈ 40 000.
- La dalle métier coïncide exactement avec l'emprise minimale du pipeline 3D :
  pas de sous-cadrage à gérer en M1.

Fichiers/contrats impactés :

`02-TILE-CONTRACT.md`, `00-PRODUCT.md`, `04-SITE-SERVICE.md`,
`schemas/tile-manifest.schema.json`.

## ADR-005 — Le critère « aucune modification par coordonnées » ne couvre pas (encore) le pipeline 3D externe

Date: 2026-08-07
Statut: proposed

Contexte:

`06-TEST-AND-ACCEPTANCE.md` exige qu'aucune dalle de recette ne nécessite de
modification de code spécifique à ses coordonnées. Or chaque scène du POC 3D
porte un `GEOLOGY_DEPARTMENT` saisi à la main, que son AGENTS.md indique
explicitement comme non déductible des coordonnées.

Décision :

Le critère s'applique à `site-service` et aux contrats qu'il orchestre. Le
pipeline 3D externe en est temporairement exempté, jusqu'au lot P8
(industrialisation du pipeline 3D), qui doit soit dériver ce paramètre
automatiquement, soit lever cette exception explicitement.

Conséquences :

Le lot P8 ne peut pas être considéré terminé tant que cette exception n'est
pas levée ou reconfirmée.

Fichiers/contrats impactés :

`06-TEST-AND-ACCEPTANCE.md`, `08-BACKLOG.md` (P8).

## ADR-006 — Les routes d'écriture de `site-service` ne sont pas exposées publiquement en M1

Date: 2026-08-07
Statut: accepted

Contexte:

Aucun service v2 du dépôt n'expose aujourd'hui de route d'écriture au public
via le gateway. `build`/`review`/`publish` sur une instance sont des écritures
sensibles, et l'authentification de l'interface de supervision n'est pas
encore décidée.

Décision :

Seules les routes `GET` de `site-service` et la page de consultation publique
sont routées par Caddy/gateway. `build`, `review` et `publish` restent
accessibles uniquement sur le port interne du service.

Conséquences :

L'interface de supervision (opérateur humain) doit, en M1, atteindre le port
interne directement (réseau Docker interne ou accès restreint), pas via le
domaine public.

Fichiers/contrats impactés :

`04-SITE-SERVICE.md`, `Caddyfile`, `docker-compose.yml` (à la mise en œuvre).

## ADR-007 — Stockage des instances sur volume nommé, index en PostgreSQL

Date: 2026-08-07
Statut: accepted

Contexte:

`01-ARCHITECTURE.md` laissait le stockage PostgreSQL au conditionnel (« peut
conserver »), et ne définissait ni le montage du répertoire `instances/`, ni le
service responsable de servir les actifs générés (GLB, orthophoto).

Décision :

`instances/` est un volume Docker nommé, monté par `site-service` et par le
service qui sert les actifs publics, sur le modèle du montage `publication/` de
`poc/valleraugue-mairie-3d`. PostgreSQL, via `db/migrations/`, indexe les
instances et porte la séquence qui alimente le compteur de `tile_id` — un
compteur sur système de fichiers ne serait pas sûr en écriture concurrente.

Conséquences :

Une migration `db/migrations/` doit être ajoutée avant le lot P2 du backlog.

Fichiers/contrats impactés :

`01-ARCHITECTURE.md`, `db/migrations/` (à la mise en œuvre).

## ADR-008 — Page de consultation d'instance rendue par `gateway-service`

Date: 2026-08-07
Statut: accepted

Contexte:

`apps/web` est configuré en `output: "static"` (`apps/web/astro.config.mjs`) :
il ne peut pas générer une page par instance créée dynamiquement à la demande.
`gateway-service` rend déjà des pages dynamiques (`pages/landing.ts`,
`pages/demo.ts`, `pages/app-terrain.ts`).

Décision :

La page publique de consultation d'une dalle (`GET /api/v2/sites/:tileId` côté
navigateur) est rendue par `gateway-service`, pas par `apps/web`.

Conséquences :

`apps/web` peut continuer à pointer vers ces pages (lien, redirection) sans
devoir changer de mode de rendu.

Fichiers/contrats impactés :

`01-ARCHITECTURE.md`, `04-SITE-SERVICE.md`.
