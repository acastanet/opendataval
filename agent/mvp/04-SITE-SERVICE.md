# 04 — `site-service`

## Mission

`site-service` fabrique et maintient le **dossier logique** d’une dalle OpenDataVdA.

Il orchestre. Il ne réimplémente pas les métiers des autres services.

## API minimale visée pour M1

Les services internes du dépôt n'exposent pas directement `/api/v2/*` : ils
portent des routes `/internal/v1/<domaine>/...`, que le `gateway-service`
proxy en `/api/v2/<domaine>/...` (voir `geography-service`, qui expose
`/internal/v1/geography/resolve`, proxyé par
`apps/gateway-service/src/geography-proxy.ts`). `site-service` (lot P3, code
dans `apps/site-service/src/app.ts`) suit cette convention :

```http
POST /internal/v1/sites
GET  /internal/v1/sites/:tileId
POST /internal/v1/sites/:tileId/build
POST /internal/v1/sites/:tileId/review     — action submit | approve | request_changes
POST /internal/v1/sites/:tileId/publish
```

**Toutes les routes implémentées sont proxyées publiquement par le gateway**,
sans authentification (ADR-009 dans [`09-DECISIONS.md`](09-DECISIONS.md), qui
annule la restriction initiale de l'ADR-006) :

```http
POST /api/v2/sites                     → POST /internal/v1/sites
GET  /api/v2/sites/:tileId             → page HTML (pas de JSON public, ADR-008)
POST /api/v2/sites/:tileId/build       → POST /internal/v1/sites/:tileId/build
POST /api/v2/sites/:tileId/review      → POST /internal/v1/sites/:tileId/review
POST /api/v2/sites/:tileId/publish     → POST /internal/v1/sites/:tileId/publish
```

Le proxy d'écriture vit dans `apps/gateway-service/src/site-proxy.ts` : il
relaie tel quel le corps, le statut et les erreurs de `site-service`, sur le
modèle des proxys de lecture existants (`geography-proxy.ts`).

`GET /internal/v1/sites/:tileId` répond en JSON **camelCase**, la forme native de
`ManifesteDalle` (`packages/shared/src/dalle.ts`) — distincte du `manifest.json`
écrit sur disque, qui suit le schéma snake_case de
`schemas/tile-manifest.schema.json`. C'est un choix délibéré (contrat de fichier
versionné vs. contrat d'API interne idiomatique), pas un oubli ; voir l'en-tête de
`dalle.ts` et de `apps/gateway-service/src/pages/site-instance.ts`.

## Revue et publication (lot P6)

`POST .../review` prend un corps `{ action, reviewedBy?, notes? }` :

- `submit` (`generated → review_required`, `review.status = pending`) : déclenchée
  par le système à la fin de la fabrication, `reviewedBy` facultatif.
- `approve` (`review_required → approved`, `review.status = approved`) : décision
  humaine, `reviewedBy` **obligatoire** (400 sinon).
- `request_changes` (`review_required → collecting`, `review.status =
  changes_requested`) : décision humaine, `reviewedBy` **obligatoire**, `notes`
  fortement recommandées pour motiver la correction demandée.

Chaque décision humaine (`approve`/`request_changes`) horodate
`review.reviewedAt`. `POST .../publish` (`approved → published`) ne prend pas
de corps : `transitionValide` (`packages/shared/src/dalle.ts`) refuse déjà
structurellement d'entrer dans `approved` sans `review.status = approved`, ce
qui suffit à empêcher toute publication directe — aucune vérification
supplémentaire n'était nécessaire côté route.

## Création

Entrée minimale :

```json
{
  "lat": 44.064555,
  "lon": 3.683027,
  "title": "facultatif"
}
```

La largeur et la hauteur du MVP ne sont pas des paramètres libres : elles valent 200 m.

## Responsabilités M1

1. valider les coordonnées ;
2. créer l’instance ;
3. calculer la dalle ;
4. écrire un manifeste initial ;
5. déclencher au moins un enrichissement réel ;
6. rattacher un actif de scène ;
7. mettre à jour l’état ;
8. exposer le résultat au frontend ;
9. permettre le passage à `review_required` puis `approved/published`.

## Adapter pattern

Chaque source intégrée au site devrait être appelée via un adaptateur fin :

```text
site-service
    │
    ├── adapters/geography   — implémenté (lot P3), commune/adresse/altitude
    ├── adapters/scene       — implémenté (lot P4), rattachement provisoire
    │                           d'une scène POC déjà publiée (voir 01-ARCHITECTURE.md
    │                           § « Pipeline 3D » pour le contrat de `SceneDalle.glb`)
    ├── adapters/map
    ├── adapters/bss
    ├── adapters/weather
    └── ...
```

L’adaptateur :

- appelle le service existant ;
- transforme sa réponse vers le contrat OpenDataVdA ;
- ne duplique pas sa logique métier.

## Tolérance aux pannes

Une source secondaire indisponible ne doit pas nécessairement faire échouer toute la dalle.

Le manifeste doit enregistrer l’échec de la source.

Une erreur sur la géométrie de la dalle ou l’écriture du manifeste est en revanche bloquante.

## Idempotence

Relancer une étape de fabrication ne doit pas corrompre l’instance.

Prévoir des étapes identifiables et relançables.

Le lot P3 satisfait la première moitié de cette règle sans la seconde : `POST
.../build` sur une instance déjà `generated` échoue proprement (409, transition
refusée par `transitionValide`) plutôt que de corrompre le manifeste, mais ne
relance pas non plus l'enrichissement. Un vrai rejeu (ex. reprendre après un
échec réseau sans dupliquer les données déjà écrites) reste à faire.

## Journal de production

Le manifeste ou un journal associé doit permettre de savoir :

- étape lancée ;
- début ;
- fin ;
- succès/échec ;
- version de pipeline ;
- erreur éventuelle.
