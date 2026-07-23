# Gateway Service

> Point d'entrée unique des API v2 (`/api/v2/*`). Aucune logique métier, aucun accès base.
> Dernière mise à jour : 2026-07-23 · Dernière vérification : 2026-07-23
> Code : `apps/gateway-service/`

## Rôle

Le gateway est la façade des nouvelles API OpenDataVal. Il valide sa configuration au démarrage, expose les contrôles de santé, propage `x-request-id`, normalise les erreurs d'infrastructure et route vers les services v2 (ou vers le monolithe via un pont temporaire). Il ne doit jamais devenir un monolithe métier : chaque nouvel endpoint est ajouté domaine par domaine avec un contrat explicite.

## Périmètre / endpoints

| Route publique | Cible | Méthodes |
|---|---|---|
| `GET /health` | statut du processus | GET |
| `GET /ready` | vérifie aussi que l'API historique répond sur `/api/health` | GET |
| `GET /api/v2/gateway` | statut du gateway | GET |
| `GET /api/v2/geography/resolve` | `geography-service:/internal/v1/geography/resolve` | GET |
| `GET /api/v2/weather/temperature` | `weather-service:/internal/v1/weather/temperature` | GET |
| `/api/v2/legacy/*` | `api:/api/*` (pont) | GET, HEAD |

Format d'erreur unifié : `{ error: { code, message, retryable }, requestId }`.

Le pont legacy : accepte uniquement `GET`/`HEAD`, transmet le `x-request-id`, applique un délai maximal, ne suit pas les redirections, retire les en-têtes de proche en proche, refuse les traversées de chemin (simples ou doublement encodées) et garantit que la cible reste sous le préfixe `/api` du monolithe.

## Dépendances

- `api` (monolithe) — cible du pont legacy et de la sonde `/ready`.
- `geography-service`, `weather-service` — cibles des proxys v2.
- Aucune base de données, aucun cache, aucune file de messages.

## Configuration (`src/config.ts`)

| Variable | Défaut | Description |
|---|---|---|
| `HOST` | `0.0.0.0` | Adresse d'écoute |
| `PORT` | `3000` | Port HTTP interne |
| `LEGACY_API_URL` | `http://api:3000` | API historique (pont + sonde ready) |
| `GATEWAY_UPSTREAM_TIMEOUT_MS` | `5000` | Délai max d'un appel amont |
| `GEOGRAPHY_SERVICE_URL` | `http://geography-service:3000` | Cible geography |
| `GEOGRAPHY_SERVICE_TIMEOUT_MS` | `3000` | Délai proxy geography |
| `WEATHER_SERVICE_URL` | `http://weather-service:3000` | Cible weather |
| `WEATHER_SERVICE_TIMEOUT_MS` | `3000` | Délai proxy weather |
| `APP_VERSION` | `dev` | Version exposée par les routes de santé |

## Lancement & contrôles

```bash
pnpm install --frozen-lockfile
pnpm check:gateway
docker compose build gateway caddy   # Caddyfile embarqué : reconstruire caddy avec le gateway
docker compose up -d gateway caddy
curl -i http://localhost:8080/api/v2/gateway
curl -i http://localhost:8080/api/v2/legacy/health
```

Point de vigilance : le `Caddyfile` est copié dans l'image au build (`Dockerfile.caddy`). Si l'on modifie une route sans reconstruire `caddy`, `/api/v2/*` retombe silencieusement sur `handle /api/*` (l'API historique), qui répond un 404 JSON au même format — piège de diagnostic classique (cf. [operations geography](../geography-service/operations.md)).

`/health` confirme que le processus tourne ; `/ready` vérifie en plus que l'API historique répond sur `/api/health`. Les tests automatisés couvrent santé, disponibilité, routage, propagation du `request-id`, délais d'attente, refus des écritures et traversées de chemin encodées.

## Rollback

Retirer le service et le proxy v2 : les routes historiques `/api/*` sont indépendantes et restent servies.

## Limites volontaires

Pas encore d'authentification, de cache, de Redis/file de messages, de gRPC, de circuit breaker avancé, ni de logique météo/géographique/incendie dans le gateway.

## Docs liées

- Architecture globale : [`../../architecture/ARCHITECTURE-GENERALE.md`](../../architecture/ARCHITECTURE-GENERALE.md)
- Conception v2 (OpenAPI, provenance) : [`../../architecture/conception-v2/`](../../architecture/conception-v2/)
