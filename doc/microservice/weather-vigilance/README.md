# Weather Vigilance Service

> Vigilance météorologique officielle Météo-France, exposée à l’échelle départementale.
> Dernière mise à jour : 2026-07-24 · Dernière vérification : 2026-07-24
> Code : `services/weather-vigilance/`

## Rôle

Weather Vigilance est le microservice autonome du lot 4. Il collecte, valide, met en cache et expose la Vigilance météorologique officielle de Météo-France pour les départements métropolitains.

Il ne calcule aucun risque local, ne produit aucune prévision météorologique ordinaire et ne réalise aucun géocodage. La résolution d’un point GPS vers un département est effectuée par le gateway avec Geography Service.

Une vigilance départementale ne prouve pas qu’un phénomène est observé ou prévu exactement aux coordonnées demandées. Toutes les réponses métier indiquent :

```json
{ "geographic_scope": "department" }
```

## Périmètre fonctionnel

Le service représente les neuf phénomènes du référentiel Météo-France :

- vent ;
- vagues-submersion ;
- pluie-inondation ;
- crues ;
- orages ;
- neige-verglas ;
- avalanches ;
- canicule ;
- grand froid.

Le phénomène `crues` correspond uniquement à celui relayé par la Vigilance météorologique. Le détail Vigicrues, APIC, la sécheresse, le risque incendie de forêt et les autres vigilances sectorielles restent hors périmètre.

## Source officielle

Le collecteur utilise DPVigilance v1 :

| Produit | Usage |
|---|---|
| `cartevigilance/encours` | Niveaux J/J1, phénomènes et chronologies |
| `textesvigilance/encours` | Bulletins officiels lorsqu’ils existent |

Le produit de textes peut légitimement être absent. Lorsqu’un bulletin est présent, sa publication doit correspondre à celle de la carte. En cas d’incohérence, le bulletin n’est pas exposé et un avertissement structuré est ajouté à la réponse.

L’accès à la source nécessite un jeton Météo-France. Deux modes d’authentification sont pris en charge :

- `apikey` : en-tête historique `apikey` ;
- `bearer` : `Authorization: Bearer`.

## Endpoints internes

| Route | Description |
|---|---|
| `GET /healthz` | Liveness indépendante de Météo-France et du cache |
| `GET /readyz` | Readiness fondée sur la présence d’un snapshot encore exploitable |
| `GET /version` | Version, commit et date de build |
| `GET /metrics` | Métriques Prometheus |
| `GET /v1/vigilance/departments/{department_code}` | Vigilance d’un département |
| `GET /v1/vigilance/departments/{department_code}?include_bulletins=true` | Même réponse avec bulletins disponibles |

Les codes acceptés sont `01` à `95`, `2A` et `2B`. Les départements et collectivités ultramarins ne sont pas couverts par ce contrat actuel.

## Route publique via le gateway

```text
GET /api/v2/vigilance?department_code=30
GET /api/v2/vigilance?department_code=30&include_bulletins=true
GET /api/v2/vigilance?lat=44.0812&lon=3.6421&accuracy=25
```

Avec `department_code`, le gateway appelle directement Weather Vigilance. Avec `lat` et `lon`, il appelle d’abord Geography pour déterminer le département. Si les coordonnées et le code sont fournis ensemble, leur cohérence est vérifiée.

La réponse publique enrichit `location` avec :

- `department_code` ;
- `department_name` lorsqu’il est connu ;
- `resolved_by` : `request` ou `geography-service` ;
- `input` : coordonnées et précision lorsqu’une résolution géographique a été effectuée.

## Contrat de réponse

Une réponse disponible contient :

- `service` et `version` ;
- `data_status: "available"` ;
- `freshness_status` ;
- `geographic_scope: "department"` ;
- `location` ;
- `periods` : aujourd’hui et demain selon la publication ;
- `bulletins` : vide sauf demande explicite et texte cohérent disponible ;
- `source` : produit, publication et dates ;
- `cache` : état de restitution et âge ;
- `warnings` : anomalies non bloquantes ;
- `requestId`.

Extrait simplifié :

```json
{
  "service": "weather-vigilance",
  "data_status": "available",
  "freshness_status": "fresh",
  "geographic_scope": "department",
  "location": {
    "department_code": "30",
    "department_name": "Gard"
  },
  "periods": [
    {
      "day": "today",
      "overall_level": {
        "code": "yellow",
        "label": "Vigilance jaune"
      },
      "phenomena": []
    }
  ],
  "bulletins": [],
  "warnings": []
}
```

L’absence de réponse, de snapshot ou de source valide n’est jamais convertie en niveau vert.

## Cache persistant et résilience

Le collecteur ne contacte pas Météo-France à chaque requête. Il :

1. recharge périodiquement la carte et les textes ;
2. limite le temps de connexion, le temps de lecture et la taille des réponses ;
3. réessaie selon la configuration ;
4. protège la source avec un circuit breaker ;
5. valide complètement la nouvelle carte ;
6. écrit le snapshot JSON de manière atomique ;
7. remplace le cache mémoire uniquement après validation.

Une réponse invalide ou un échec amont ne remplace jamais le dernier état valide. Le snapshot persistant permet de redémarrer sans perdre immédiatement la dernière publication exploitable.

États de fraîcheur :

| État | Sens | Serviable |
|---|---|---:|
| `fresh` | Dernière récupération suffisamment récente | oui |
| `stale` | Actualisation en échec, dernier snapshot encore toléré | oui |
| `expired` | Snapshot trop ancien ou hors validité | non |
| `unknown` | Dates insuffisantes pour conclure | selon le magasin, généralement non sans snapshot valide |

`/readyz` répond `200` uniquement lorsque `store.canServe()` est vrai. Sinon, il répond `503` avec `data_status: "unavailable"`.

## Erreurs métier

| Code | HTTP | Sens |
|---|---:|---|
| `INVALID_DEPARTMENT_CODE` | 400 | Code département mal formé |
| `INVALID_INCLUDE_BULLETINS` | 400 | Booléen invalide |
| `DEPARTMENT_NOT_COVERED` | 404 | Département absent de la source officielle |
| `UPSTREAM_UNAVAILABLE` | 503 | Aucun snapshot exploitable après échec de la source |
| `NO_VALID_SNAPSHOT` | 503 | Snapshot absent malgré un état théoriquement serviable |
| `INTERNAL_ERROR` | 500 | Erreur interne non prévue |

Le gateway ajoute ses propres erreurs de validation et de dépendances : `MISSING_LOCATION`, `INVALID_COORDINATES`, `DEPARTMENT_NOT_RESOLVED`, `INCONSISTENT_DEPARTMENT`, `GEOGRAPHY_SERVICE_*` et `VIGILANCE_SERVICE_*`.

## Configuration (`src/config.ts`)

| Variable | Défaut | Description |
|---|---|---|
| `HOST` | `0.0.0.0` | Adresse d’écoute |
| `PORT` | `3000` | Port HTTP interne |
| `METEOFRANCE_VIGILANCE_API_URL` | `https://public-api.meteofrance.fr/public/DPVigilance/v1` | Base DPVigilance |
| `METEOFRANCE_VIGILANCE_API_TOKEN` | — | Jeton dédié |
| `METEOFRANCE_API_TOKEN_VIGILANCE` | — | Ancien nom accepté en repli |
| `METEOFRANCE_VIGILANCE_AUTH_MODE` | `apikey` | `apikey` ou `bearer` |
| `VIGILANCE_REFRESH_SECONDS` | `300` | Période de collecte |
| `VIGILANCE_STALE_AFTER_SECONDS` | `900` | Seuil de passage en stale |
| `VIGILANCE_EXPIRE_AFTER_SECONDS` | `21600` | Seuil d’expiration |
| `VIGILANCE_CONNECT_TIMEOUT_MS` | `3000` | Délai de connexion |
| `VIGILANCE_READ_TIMEOUT_MS` | `10000` | Délai de lecture |
| `VIGILANCE_MAX_RETRIES` | `2` | Nombre maximal de nouvelles tentatives |
| `VIGILANCE_MAX_RESPONSE_BYTES` | `5000000` | Taille maximale d’une réponse amont |
| `VIGILANCE_CIRCUIT_FAILURE_THRESHOLD` | `3` | Échecs avant ouverture du circuit |
| `VIGILANCE_CIRCUIT_OPEN_SECONDS` | `60` | Durée d’ouverture du circuit |
| `VIGILANCE_SNAPSHOT_PATH` | `/app/data/vigilance-snapshot.json` | Snapshot persistant |
| `APP_VERSION` | `GIT_SHA` court puis `dev` | Version exposée |
| `GIT_SHA` | `unknown` | Commit déployé |
| `BUILT_AT` | `unknown` | Date de build |

`VIGILANCE_EXPIRE_AFTER_SECONDS` doit être strictement supérieur à `VIGILANCE_STALE_AFTER_SECONDS`. Le mode d’authentification, les URL et les valeurs numériques sont validés au démarrage.

Aucun jeton n’est retourné par l’API ni écrit volontairement dans les logs.

## Métriques et observabilité

`/metrics` expose le format Prometheus. Le service suit notamment :

- le nombre de requêtes API ;
- les hits et misses du cache ;
- la durée des requêtes ;
- les résultats des collectes et l’état du circuit selon les métriques définies dans `src/metrics.ts`.

`x-request-id` est accepté et renvoyé. Les erreurs sont journalisées avec une opération et un code stable.

## Validation

```bash
npm --prefix services/weather-vigilance run typecheck
npm --prefix services/weather-vigilance test
# ou depuis la racine
npm run check:vigilance
```

Les tests utilisent des fixtures et de faux clients ; ils ne dépendent pas de la disponibilité réelle de Météo-France.

Contrôles fonctionnels après déploiement :

```bash
curl -i http://weather-vigilance-service:3000/healthz
curl -i http://weather-vigilance-service:3000/readyz
curl -i http://weather-vigilance-service:3000/version
curl -i http://weather-vigilance-service:3000/v1/vigilance/departments/30
curl -i "http://localhost:8080/api/v2/vigilance?department_code=30"
curl -i "http://localhost:8080/api/v2/vigilance?lat=44.0812&lon=3.6421"
```

Vérifier aussi que l’absence de jeton dans les logs et qu’une indisponibilité amont ne remplace pas le dernier snapshot valide.

## Déploiement

```bash
docker build --no-cache \
  -f services/weather-vigilance/Dockerfile \
  -t opendataval-vigilance:latest .

docker compose build gateway caddy
docker compose up -d --no-deps weather-vigilance-service gateway caddy
```

Le volume `vigilance_cache` doit persister entre les recréations du conteneur. Le `Caddyfile` étant embarqué dans l’image, reconstruire Caddy lorsqu’une route publique est modifiée.

## Rollback

Avant remplacement :

```bash
docker tag opendataval-vigilance:latest \
  opendataval-vigilance:rollback-before-<sha>
```

Pour revenir en arrière, réappliquer le tag à `latest`, recréer `weather-vigilance-service` et le gateway si son contrat a changé, puis contrôler `/healthz`, `/readyz`, un département et la route publique. Conserver le volume `vigilance_cache`.

## Limites volontaires

- portée départementale uniquement ;
- France métropolitaine selon le validateur actuel ;
- aucune estimation locale au point ;
- aucun calcul incendie, sécheresse, hydrologie détaillée ou APIC ;
- dépendance juridique et technique au produit officiel DPVigilance ;
- bulletins non garantis ;
- la valeur `green` n’est exposée que lorsqu’elle provient d’un snapshot officiel valide.

## Documentation liée

- Index des microservices : [`../README.md`](../README.md)
- README d’exploitation du service : [`../../../services/weather-vigilance/README.md`](../../../services/weather-vigilance/README.md)
- Contrat OpenAPI : [`../../../services/weather-vigilance/openapi.yaml`](../../../services/weather-vigilance/openapi.yaml)
- Architecture du lot 4 : [`../../architecture/lot-4-weather-vigilance.md`](../../architecture/lot-4-weather-vigilance.md)
- ADR de périmètre : [`../../adr/ADR-weather-vigilance-scope.md`](../../adr/ADR-weather-vigilance-scope.md)
- Gateway Service : [`../gateway-service/README.md`](../gateway-service/README.md)
- Geography Service : [`../geography-service/README.md`](../geography-service/README.md)
- Weather Service : [`../weather-service/README.md`](../weather-service/README.md)
