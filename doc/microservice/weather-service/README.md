# Weather Service

> Température météo ponctuelle selon la méthode Météo V2 et plage minimale/maximale prévue pour la journée : station ajustée par le modèle si possible, observation brute ou modèle au point en repli.
> Dernière mise à jour : 2026-08-09 · Dernière vérification : 2026-08-09
> Code : `apps/weather-service/`

## Rôle

Weather Service isole la météo ordinaire du monolithe. Son premier contrat métier détermine une température actuelle pour un point donné et la plage minimale/maximale prévue pour la journée. Il ne fournit pas encore les prévisions horaires détaillées, les précipitations, le vent, l’humidité, les indices thermiques ni la vigilance.

Le service n’est pas appelé directement par le navigateur. Le gateway publie `/api/v2/weather/temperature`, transmet `x-request-id` et relaie la réponse. Weather Service dépend de Geography pour normaliser le point et obtenir son altitude.

Copernicus, Weather Vigilance et les interfaces web restent hors de son périmètre.

## Endpoints

| Route | Description |
|---|---|
| `GET /health` | Vie du processus |
| `GET /ready` | Processus prêt à recevoir une requête |
| `GET /internal/v1/weather/temperature` | Résolution interne de température |
| `GET /api/v2/weather/temperature` | Route publique équivalente via le gateway |

Exemple :

```text
GET /api/v2/weather/temperature?lat=44.0812&lon=3.6421&horizontalAccuracyMeters=25
```

Paramètres :

| Paramètre | Obligatoire | Règle |
|---|---:|---|
| `lat` | oui | Nombre entre `-90` et `90` |
| `lon` | oui | Nombre entre `-180` et `180` |
| `horizontalAccuracyMeters` | non | Précision horizontale positive ou nulle |

## Méthode température v2

La méthode suit cette chaîne :

1. valider les coordonnées et la précision éventuelle ;
2. demander à Geography les coordonnées normalisées et l’altitude ;
3. charger dans PostgreSQL les observations de stations situées dans un rayon de 50 km ;
4. appliquer la politique de sélection de station v1 ;
5. interroger le modèle au point en parallèle pour disposer d’un repli ;
6. lorsqu’une station est retenue, interroger le modèle au même créneau pour le point demandé et pour la station ;
7. si les créneaux sont compatibles, appliquer le delta spatial du modèle :

```text
T_point = T_station_observée + (T_modèle_point − T_modèle_station)
```

La valeur produite est alors une estimation `station_adjusted_by_model`, pas une observation directe. Les détails du calcul sont exposés dans `temperature.adjustment`.

Ordre de repli :

1. `station_adjusted_by_model` : observation corrigée par le delta modèle ;
2. `station_observation` : observation brute si la correction modèle échoue ;
3. `model_at_point` : modèle au point si aucune station n’est exploitable ;
4. erreur `WEATHER_NOT_AVAILABLE` si aucune source ne fournit de température.

La spécification détaillée est conservée dans [`temperature-method-v2.md`](temperature-method-v2.md).

## Contrat de réponse

La réponse comprend notamment :

- `location` : coordonnées normalisées, précision éventuelle et altitude ;
- `temperature` : valeur, nature, heure de référence, âge, qualité et ajustement éventuel ;
- `today` : températures minimale et maximale prévues par le modèle pour la journée, élargies si nécessaire pour inclure la température courante ;
- `method` : identifiant et version de la méthode ;
- `stationSelection` : résultat de la politique, candidats évalués et station retenue ;
- `provenance` : source principale de la valeur ;
- `degraded` : au moins une source ou une étape de meilleure qualité est indisponible ;
- `unavailableSources` : dépendances non disponibles, par exemple `station_observations` ou `model_correction` ;
- `requestId` : identifiant de corrélation.

Extrait simplifié d’une estimation ajustée :

```json
{
  "temperature": {
    "valueCelsius": 21.4,
    "nature": "station_adjusted_by_model",
    "referenceTime": "2026-07-24T07:00:00.000Z",
    "adjustment": {
      "modelAtPointCelsius": 20.9,
      "modelAtStationCelsius": 19.8,
      "deltaCelsius": 1.1,
      "modelReferenceTime": "2026-07-24T07:00:00.000Z"
    }
  },
  "today": {
    "minimumC": 13.8,
    "maximumC": 25.6,
    "nature": "model_forecast"
  },
  "degraded": false,
  "unavailableSources": []
}
```

## Politique de sélection de station

La politique v1 évalue la fraîcheur, la distance, l’écart d’altitude, le réseau et la qualité de la mesure. La décision et sa justification restent visibles dans `stationSelection` ; le service ne masque pas un repli modèle derrière l’apparence d’une observation.

Référence : [`station-selection-policy.md`](station-selection-policy.md).

## Erreurs et dégradation

| Code | HTTP | Sens |
|---|---:|---|
| `INVALID_COORDINATES` | 400 | Coordonnées ou précision invalides |
| `GEOGRAPHY_CONTEXT_UNAVAILABLE` | 502 | Geography n’a pas fourni le contexte nécessaire |
| `WEATHER_NOT_AVAILABLE` | 503 | Ni station ni modèle exploitables |
| `INTERNAL_ERROR` | 500 | Erreur interne non prévue |

Format : `{ error: { code, message, retryable }, requestId }`.

L’absence de base ne bloque pas le démarrage : elle désactive les observations et force le repli modèle lorsque celui-ci est disponible. Une correction modèle indisponible n’annule pas une observation sélectionnée ; la mesure brute est renvoyée avec `degraded: true` et `model_correction` dans `unavailableSources`.

`/health` et `/ready` ne testent actuellement ni PostgreSQL, ni Geography, ni le modèle externe. Une réponse `ready` confirme que le processus accepte les requêtes, pas que toutes les dépendances sont disponibles.

## Dépendances

- `geography-service` : coordonnées normalisées et altitude ;
- PostgreSQL / PostGIS : observations candidates, en lecture seule ;
- modèle météo configuré par `WEATHER_MODEL_URL` : correction spatiale et repli au point ;
- gateway : exposition publique de la route.

## Configuration (`src/config.ts`)

| Variable | Défaut | Description |
|---|---|---|
| `HOST` | `0.0.0.0` | Adresse d’écoute |
| `PORT` | `3000` | Port HTTP interne |
| `DATABASE_URL` | — | Connexion PostgreSQL ; absente = pas d’observations |
| `GEOGRAPHY_SERVICE_URL` | `http://geography-service:3000` | Cible Geography |
| `WEATHER_MODEL_URL` | `https://api.open-meteo.com/v1/meteofrance` | Modèle météo |
| `GEOGRAPHY_TIMEOUT_MS` | `1500` | Délai Geography |
| `DATABASE_TIMEOUT_MS` | `1000` | Délai de lecture des observations |
| `WEATHER_MODEL_TIMEOUT_MS` | `2000` | Délai du modèle |
| `WEATHER_GLOBAL_TIMEOUT_MS` | `2500` | Budget global |
| `APP_VERSION` | `GIT_SHA` puis `dev` | Version exposée |

Le budget global doit couvrir le plus grand délai de dépendance. Les URL doivent utiliser HTTP ou HTTPS et les délais doivent être des entiers strictement positifs.

## Journalisation

Les logs de résolution contiennent :

- `requestId` ;
- coordonnées arrondies à deux décimales ;
- nature de la température ;
- statut de sélection de station ;
- identifiant de la station retenue lorsqu’il existe ;
- indicateur `degraded`.

La position exacte n’est pas inscrite dans le message de résolution.

## Validation et lancement

```bash
pnpm check:weather

docker compose build weather-service gateway caddy
docker compose up -d weather-service gateway caddy

curl -i "http://localhost:8080/api/v2/weather/temperature?lat=44.0812&lon=3.6421"
```

Les tests doivent couvrir au minimum les trois natures de température, la compatibilité temporelle du modèle, l’indisponibilité de la correction, le repli modèle, la propagation de `x-request-id` et les coordonnées invalides.

## Rollback

Restaurer l’image précédente de Weather Service et, si le contrat de routage a changé, les images correspondantes du gateway et de Caddy. Les routes météo historiques du monolithe restent indépendantes de `/api/v2/weather/temperature`.

## Limites volontaires

- température actuelle et plage minimale/maximale du jour uniquement ;
- aucune écriture en base ;
- aucune prévision horaire détaillée ni vigilance dans ce service ;
- aucune donnée Copernicus ;
- aucune garantie de mesure locale lorsque la réponse est `model_at_point` ;
- aucune garantie d’observation directe lorsque la réponse est `station_adjusted_by_model` ;
- sondes de readiness encore superficielles.

## Documentation liée

- Index des microservices : [`../README.md`](../README.md)
- Comportement actuel et héritage : [`current-behaviour.md`](current-behaviour.md)
- Politique de sélection : [`station-selection-policy.md`](station-selection-policy.md)
- Méthode v2 : [`temperature-method-v2.md`](temperature-method-v2.md)
- Méthode v1 archivée : [`temperature-method-v1.md`](temperature-method-v1.md)
- Corpus de parité : [`parity-corpus.json`](parity-corpus.json)
- Gateway Service : [`../gateway-service/README.md`](../gateway-service/README.md)
- Geography Service : [`../geography-service/README.md`](../geography-service/README.md)
- Weather Vigilance : [`../weather-vigilance/README.md`](../weather-vigilance/README.md)
- Conception v2 : [`../../architecture/conception-v2/`](../../architecture/conception-v2/)
- Architecture globale : [`../../architecture/ARCHITECTURE-GENERALE.md`](../../architecture/ARCHITECTURE-GENERALE.md)
