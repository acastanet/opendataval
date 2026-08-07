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
POST /internal/v1/sites/:tileId/review     — pas encore implémentée, voir P6
POST /internal/v1/sites/:tileId/publish    — pas encore implémentée, voir P6
```

**Seules les routes de lecture (`GET`) et la page de consultation publique
seront un jour routées par Caddy/gateway.** Toutes les routes d'écriture
(`POST`, y compris la création) restent, pour tout M1, accessibles uniquement
sur le port interne du service — le câblage gateway/Caddy lui-même reste à
faire, tant que l'authentification de l'interface de supervision n'est pas
décidée. Voir ADR-006 dans [`09-DECISIONS.md`](09-DECISIONS.md).

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
