# 04 — `site-service`

## Mission

`site-service` fabrique et maintient le **dossier logique** d’une dalle OpenDataVdA.

Il orchestre. Il ne réimplémente pas les métiers des autres services.

## API minimale visée pour M1

Le dépôt expose tous ses services v2 sous `/api/v2/<domaine>` via un proxy du
`gateway-service`, référencé dans son catalogue de présentation
(`apps/gateway-service/src/services-catalog.ts`) et sondé par
`/api/v2/status` (voir `apps/gateway-service/src/geologie-proxy.ts` comme
exemple de proxy à suivre). `site-service` respecte cette convention :

```http
POST /api/v2/sites
GET  /api/v2/sites/:tileId
POST /api/v2/sites/:tileId/build
POST /api/v2/sites/:tileId/review
POST /api/v2/sites/:tileId/publish
```

**Seules les routes de lecture (`GET`) et la page de consultation publique sont
routées par Caddy/gateway en M1.** Les routes d'écriture
(`build`/`review`/`publish`) restent accessibles sur le port interne du
service, non exposées publiquement, tant que l'authentification de
l'interface de supervision n'est pas décidée. Voir ADR-006 dans
[`09-DECISIONS.md`](09-DECISIONS.md).

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
    ├── adapters/geography
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

## Journal de production

Le manifeste ou un journal associé doit permettre de savoir :

- étape lancée ;
- début ;
- fin ;
- succès/échec ;
- version de pipeline ;
- erreur éventuelle.
