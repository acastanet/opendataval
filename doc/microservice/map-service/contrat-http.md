# Contrat HTTP — Map Service

Toutes les routes publiques sont servies sous `/api/v2/map` directement par Caddy.

## Styles

```text
GET /api/v2/map/styles/{style}.json
```

Styles : `plan`, `territoire`, `relief`, `hypsometrique`.

Paramètres facultatifs : `prefixe`, `fond`, `terrain`, `exageration`, `geologie`, `relief`.

## Tuiles

```text
GET /api/v2/map/tiles/{source}/{z}/{x}/{y}.{ext}
GET /api/v2/map/relief/{z}/{x}/{y}.png
```

Sources : `plan`, `photo`, `satellite`, `geologie`, `radar`. Le radar exige un paramètre `path` validé contre le format des frames RainViewer.

En-têtes :

- `x-request-id` sur toutes les réponses ;
- `x-cache: hit|miss` pour les tuiles conservées en mémoire ;
- `cache-control` adapté à la durée de vie de la ressource.

## Légendes

```text
GET /api/v2/map/legends
GET /api/v2/map/legends/{layer}
```

Les réponses contiennent uniquement des informations visuelles : libellés, couleurs, géométrie, clustering, pointillés ou paliers.

## Erreurs JSON

```json
{
  "error": {
    "code": "TUILE_INVALIDE",
    "message": "Les coordonnées de tuile sont invalides.",
    "retryable": false
  },
  "requestId": "..."
}
```

Les réponses binaires valides ne sont jamais enveloppées dans du JSON.
