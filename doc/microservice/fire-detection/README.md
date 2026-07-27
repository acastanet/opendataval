# fire-detection-service

Documentation d'exploitation du microservice du lot 5.

## Route publique

```http
GET /api/v2/fire/nearby?lat={latitude}&lon={longitude}&radius_km={1..50}&history_days={1..7}&accuracy={metres}
```

`radius_km` et `history_days` sont obligatoires sur la route publique. Le rayon est un nombre compris entre 1 et 50 km ; l’historique est un entier compris entre 1 et 7 jours. `accuracy` reste facultatif.

## Route interne

```http
GET /v1/fire/nearby?lat={latitude}&lon={longitude}&radius_km=50&history_days=7
```

## Contrôles

```bash
curl -fsS 'http://localhost:8080/api/v2/fire/nearby?lat=44.0812&lon=3.6415&radius_km=50&history_days=7' | jq
curl -fsS http://fire-detection-service:3000/healthz
curl -fsS http://fire-detection-service:3000/readyz
```

Vérifier :

1. `data_status` ;
2. l'état individuel des six sources ;
3. l'heure `observed_at`, et non l'heure de collecte ;
4. `basis: NASA_FIRMS_AREA_API_ONLY` pour `last_detection_50km` ;
5. l'absence de secrets dans la réponse et les journaux.

## Déploiement

```bash
docker compose build fire-detection-service gateway
docker compose up -d --no-deps fire-detection-service
docker compose up -d --no-deps gateway
```

Aucun volume ne doit être créé pour ce service.

## Incident

Si une source est indisponible, conserver la réponse `partial` et le détail d'état. Ne jamais remplacer une indisponibilité par une liste vide présentée comme une absence de feu.
