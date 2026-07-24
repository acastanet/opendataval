# Geography Service

> Enrichissement géographique d’un point : territoire, adresse postale et altitude.
> Dernière mise à jour : 2026-07-24 · Dernière vérification : 2026-07-24
> Code : `apps/geography-service/`

## Rôle

Geography Service transforme un couple latitude–longitude en contexte géographique structuré. Il résout en parallèle :

- la commune, le département et l’EPCI ;
- l’adresse postale la plus proche par géocodage inverse ;
- l’altitude et, lorsqu’elles sont fournies, les métadonnées de précision altimétrique.

Le service n’est pas appelé directement par le navigateur. Le gateway publie `/api/v2/geography/resolve`, propage `x-request-id` et utilise également Geography pour déterminer le département d’une requête Vigilance par coordonnées. Weather Service l’appelle pour normaliser le point et récupérer son altitude.

Le service ne possède ni base de données ni cache : il interroge des fournisseurs publics avec des délais indépendants et un budget global.

## Endpoints

| Route | Description |
|---|---|
| `GET /health` | Vie du processus |
| `GET /ready` | Processus prêt à recevoir une requête |
| `GET /internal/v1/geography/resolve` | Résolution géographique interne |
| `GET /api/v2/geography/resolve` | Route publique équivalente via le gateway |

Exemple :

```text
GET /api/v2/geography/resolve?lat=44.0812&lon=3.6421&horizontalAccuracyMeters=25&positionSource=browser-geolocation
```

## Paramètres

| Paramètre | Obligatoire | Règle |
|---|---:|---|
| `lat` | oui | Nombre entre `-90` et `90` |
| `lon` | oui | Nombre entre `-180` et `180` |
| `horizontalAccuracyMeters` | non | Précision GPS positive ou nulle |
| `positionSource` | non | `browser-geolocation`, `manual` ou `unknown` |

Les paramètres supplémentaires sont refusés par le schéma JSON. En l’absence de `positionSource`, le domaine normalise la provenance selon le comportement défini dans `src/domain/coordinates.ts`.

## Contrat de réponse

La réponse contient :

- `query` : coordonnées validées, précision éventuelle et source de position ;
- `territory` : libellé, commune, département et EPCI ;
- `address` : adresse formatée, numéro, voie, code postal, ville, précision et distance ;
- `elevation` : altitude, référentiel vertical et précisions disponibles ;
- `requestId` : identifiant de corrélation.

Chaque enrichissement suit la même structure :

```json
{
  "status": "available",
  "data": {},
  "provenance": {
    "source": "fournisseur",
    "resolvedAt": "2026-07-24T07:00:00.000Z"
  }
}
```

Valeurs possibles de `status` : `available`, `not_found`, `unavailable`, `timeout`. L’altitude est facultative : son absence ne rend pas nécessairement la réponse globale inutilisable. Le service peut donc répondre `200` avec certains enrichissements dégradés.

## Politique d’échec

Les trois fournisseurs sont interrogés en parallèle. Une erreur globale n’est renvoyée que lorsqu’aucun enrichissement exploitable ne subsiste :

| Code | HTTP | Sens |
|---|---:|---|
| `INVALID_COORDINATES` | 400 | Coordonnées, précision ou paramètres invalides |
| `LOCATION_NOT_RESOLVABLE` | 404 | Aucun enrichissement exploitable |
| `GEOGRAPHY_SERVICE_UNAVAILABLE` | 502 | Fournisseurs indisponibles |
| `GEOGRAPHY_SERVICE_TIMEOUT` | 504 | Budget de temps dépassé |
| `INTERNAL_ERROR` | 500 | Erreur interne non prévue |

Format : `{ error: { code, message, retryable }, requestId }`.

`/health` et `/ready` ne contactent pas les fournisseurs. Une réponse `ready` indique que le processus accepte les requêtes, pas que chaque source externe est disponible.

## Confidentialité et journalisation

Les journaux applicatifs ne conservent pas la position brute :

- latitude et longitude sont arrondies à deux décimales ;
- la précision est convertie en classe (`<10m`, `10-50m`, `50-200m`, `200m-1km`, `>1km`, `unknown`) ;
- les statuts des trois fournisseurs sont journalisés séparément ;
- `x-request-id` permet la corrélation avec le gateway et les services consommateurs.

## Fournisseurs externes

| Client | Fournisseur par défaut | Donnée |
|---|---|---|
| `territory` | `geo.api.gouv.fr` | Commune, département, EPCI |
| `address` | `data.geopf.fr/geocodage` | Géocodage inverse |
| `elevation` | `data.geopf.fr/altimetrie` | Altitude |

## Configuration (`src/config.ts`)

| Variable | Défaut | Description |
|---|---|---|
| `HOST` | `0.0.0.0` | Adresse d’écoute |
| `PORT` | `3000` | Port HTTP interne |
| `TERRITORY_UPSTREAM_URL` | `https://geo.api.gouv.fr` | Fournisseur territoire |
| `REVERSE_GEOCODING_UPSTREAM_URL` | `https://data.geopf.fr/geocodage` | Fournisseur adresse |
| `ELEVATION_UPSTREAM_URL` | `https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json` | Fournisseur altitude |
| `TERRITORY_TIMEOUT_MS` | `2000` | Délai territoire |
| `REVERSE_GEOCODING_TIMEOUT_MS` | `2000` | Délai adresse |
| `ELEVATION_TIMEOUT_MS` | `2000` | Délai altitude |
| `GEOGRAPHY_GLOBAL_TIMEOUT_MS` | `2500` | Budget global |
| `APP_VERSION` | `GIT_SHA` puis `dev` | Version exposée |

Le budget global doit être supérieur ou égal au plus grand délai fournisseur. Une URL non HTTP(S), un délai non positif ou un budget incohérent arrête le service au démarrage.

## Validation et lancement

```bash
pnpm --filter geography-service typecheck
pnpm test:geography

docker compose build geography-service gateway caddy
docker compose up -d geography-service gateway caddy

curl -i http://localhost:8080/api/v2/gateway
curl -i "http://localhost:8080/api/v2/geography/resolve?lat=44.0812&lon=3.6421"
```

Pour valider la dégradation, contrôler séparément les statuts `territory`, `address` et `elevation`, et ne pas réduire une altitude absente à un échec complet.

## Dépendants et impact d’une panne

- Weather Service ne peut pas résoudre une température v2 si Geography est indisponible ; sa route renvoie alors une erreur de contexte géographique.
- La route Vigilance par coordonnées échoue si le département ne peut pas être résolu.
- La route Vigilance avec `department_code` reste utilisable sans Geography.
- Le monolithe et ses routes historiques restent indépendants.

## Rollback

Retirer le proxy `/api/v2/geography/*` ou revenir à l’image précédente de Geography. Si le routage Caddy change, restaurer également l’image Caddy correspondante. Vérifier ensuite explicitement Weather et Vigilance par coordonnées, qui dépendent de ce service.

## Documentation liée

- Index des microservices : [`../README.md`](../README.md)
- Audit de couverture : [`audit.md`](audit.md)
- Exploitation et diagnostic : [`operations.md`](operations.md)
- Rapport de parité : [`parity-report.md`](parity-report.md)
- Corpus de référence : [`reference-corpus.json`](reference-corpus.json)
- Gateway Service : [`../gateway-service/README.md`](../gateway-service/README.md)
- Weather Service : [`../weather-service/README.md`](../weather-service/README.md)
- Weather Vigilance : [`../weather-vigilance/README.md`](../weather-vigilance/README.md)
- Architecture globale : [`../../architecture/ARCHITECTURE-GENERALE.md`](../../architecture/ARCHITECTURE-GENERALE.md)
