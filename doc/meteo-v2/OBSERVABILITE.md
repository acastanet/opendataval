# Observabilité de la chaîne météo

## Endpoint d’exploitation

```text
GET /api/v1/meteo/health
```

Cet endpoint ne fait pas partie du client OpenAPI de l’interface Météo V2. Il est destiné aux contrôles d’exploitation, aux sondes de déploiement et au diagnostic de la chaîne d’observations.

La réponse est systématiquement envoyée avec :

```http
Cache-Control: no-store
```

Aucun jeton, message SQL ou détail d’infrastructure n’est exposé.

## Exemple de réponse saine

```json
{
  "schemaVersion": "1",
  "status": "ok",
  "degradedReasons": [],
  "catalogue": {
    "stationCount": 2140,
    "minimumExpectedStations": 1000,
    "updatedAt": "2026-07-23T02:15:04.000Z",
    "status": "ready"
  },
  "observations": {
    "observedStationCount": 1800,
    "freshStationCount": 1750,
    "freshObservationCount": 1750,
    "latestObservationAt": "2026-07-23T09:00:00.000Z",
    "latestObservationAgeMinutes": 60,
    "maximumAgeMinutes": 90,
    "status": "fresh"
  },
  "ingestion": [],
  "generatedAt": "2026-07-23T10:00:00.000Z"
}
```

## États du catalogue

| État | Signification |
|---|---|
| `ready` | au moins 1 000 stations sont présentes |
| `incomplete` | des stations existent, mais le volume national attendu n’est pas atteint |
| `empty` | aucune station n’est présente dans la couche `station_meteo` |

## États des observations

| État | Signification |
|---|---|
| `fresh` | au moins une station possède une observation de moins de 90 minutes |
| `stale` | des observations existent mais aucune n’est suffisamment récente |
| `empty` | aucune température de station n’est disponible |

## Motifs de dégradation

```text
catalogue_empty
catalogue_incomplete
observations_empty
observations_stale
critical_ingestion_error
critical_ingestion_never_succeeded
```

Les jobs critiques sont :

```text
meteo_stations
meteo_obs_national
```

Les jobs locaux restent visibles mais ne suffisent pas à établir la couverture nationale :

```text
meteo_obs
meteo_radome
meteo_infoclimat
```

## Réponse lorsque PostgreSQL est indisponible

```json
{
  "schemaVersion": "1",
  "status": "unavailable",
  "reason": "database_unavailable",
  "generatedAt": "2026-07-23T10:00:00.000Z"
}
```

Le code HTTP est alors `503`.

## Contrôles après déploiement

1. vérifier que `catalogue.status` vaut `ready` ;
2. vérifier que `observations.status` vaut `fresh` ;
3. vérifier que `meteo_stations` possède un `lastSuccessAt` ;
4. vérifier que `meteo_obs_national` possède un `lastSuccessAt` récent ;
5. contrôler Paris, Marseille et Val-d’Aigoual dans `/api/v1/meteo/essential` ;
6. ne pas considérer le déploiement terminé si les seules stations reçues appartiennent encore au catalogue cévenol historique.
