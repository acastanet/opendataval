# Geography Service

> Enrichissement géographique d'un point (territoire, adresse, altitude).
> Dernière mise à jour : 2026-07-23 · Dernière vérification : 2026-07-23
> Code : `apps/geography-service/`

## Rôle

Service interne v2 qui résout un couple de coordonnées en contexte géographique : rattachement au territoire, adresse la plus proche (géocodage inverse) et altitude. Il n'est jamais exposé au navigateur : le gateway publie `/api/v2/geography/resolve` et transmet `x-request-id`. Aucune base de données — uniquement des appels à des fournisseurs publics, chacun avec son propre délai.

## Périmètre / endpoints

| Route | Description |
|---|---|
| `GET /health` | statut du processus |
| `GET /ready` | disponibilité |
| `GET /internal/v1/geography/resolve` | résolution géographique d'un point |

Paramètres : `lat`, `lon`, `horizontalAccuracyMeters` (optionnel), `positionSource` (`browser-geolocation`\|`manual`\|`unknown`).
Contrats JSON Schema dans `src/contracts/geography.ts`.

Codes d'erreur : `INVALID_COORDINATES` (400), `LOCATION_NOT_RESOLVABLE` (404), `GEOGRAPHY_SERVICE_UNAVAILABLE` (502), `GEOGRAPHY_SERVICE_TIMEOUT` (504). Réponse d'erreur : `{ error: { code, message, retryable }, requestId }`.

Les trois fournisseurs sont interrogés en parallèle ; l'altitude est facultative (le service reste exploitable sans elle). Les journaux ne conservent que des coordonnées arrondies et un intervalle de précision (`accuracyBucket`), jamais la position brute.

## Dépendances (fournisseurs externes)

| Client | Fournisseur par défaut |
|---|---|
| `territory` | `geo.api.gouv.fr` |
| `address` (géocodage inverse) | `data.geopf.fr/geocodage` |
| `elevation` | `data.geopf.fr/altimetrie` |

## Configuration (`src/config.ts`)

| Variable | Défaut | Description |
|---|---|---|
| `HOST` | `0.0.0.0` | Adresse d'écoute |
| `PORT` | `3000` | Port HTTP interne |
| `TERRITORY_UPSTREAM_URL` | `https://geo.api.gouv.fr` | Rattachement territoire |
| `REVERSE_GEOCODING_UPSTREAM_URL` | `https://data.geopf.fr/geocodage` | Adresse la plus proche |
| `ELEVATION_UPSTREAM_URL` | `https://data.geopf.fr/altimetrie/…/elevation.json` | Altitude |
| `TERRITORY_TIMEOUT_MS` | `2000` | Délai fournisseur territoire |
| `REVERSE_GEOCODING_TIMEOUT_MS` | `2000` | Délai fournisseur adresse |
| `ELEVATION_TIMEOUT_MS` | `2000` | Délai fournisseur altitude |
| `GEOGRAPHY_GLOBAL_TIMEOUT_MS` | `2500` | Budget global (≥ max des délais fournisseurs) |
| `APP_VERSION` | `dev` | Version exposée |

## Lancement

```bash
docker compose up -d geography-service
curl -i "http://geography-service:3000/internal/v1/geography/resolve?lat=44.12&lon=3.58"
# via le gateway :
curl -i "http://localhost:8080/api/v2/geography/resolve?lat=44.12&lon=3.58"
```

## Rollback

Retirer la route `/api/v2/geography/*` du gateway : aucun autre service ne dépend de geography-service en écriture. `weather-service` l'appelle pour son contexte — son absence dégrade la météo sans casser le monolithe.

## Docs liées

- Audit de couverture : [`audit.md`](audit.md)
- Exploitation & diagnostic : [`operations.md`](operations.md)
- Rapport de parité (vs API historique) : [`parity-report.md`](parity-report.md) · corpus [`reference-corpus.json`](reference-corpus.json)
- Architecture globale : [`../../architecture/ARCHITECTURE-GENERALE.md`](../../architecture/ARCHITECTURE-GENERALE.md)
