# Weather Service

> Température météo ponctuelle d'un point (station ajustée par le modèle si possible, sinon observation ou modèle).
> Dernière mise à jour : 2026-07-23 · Dernière vérification : 2026-07-23
> Code : `apps/weather-service/`

## Rôle

Service interne v2 qui isole progressivement la météo ordinaire de Météo V2. Il n'est jamais exposé directement au navigateur : le gateway publie `/api/v2/weather/temperature` et transmet `x-request-id`. La vigilance, Copernicus et les écrans restent hors périmètre.

## Périmètre / endpoints

| Route | Description |
|---|---|
| `GET /health` | statut du processus |
| `GET /ready` | disponibilité |
| `GET /internal/v1/weather/temperature` | température résolue pour un point |

Paramètres : `lat`, `lon`, `horizontalAccuracyMeters` (optionnel).
La réponse indique la nature de la température (`station_adjusted_by_model`, observation ou modèle), la station sélectionnée, l'état de sélection et un indicateur `degraded`. Lorsqu'elle est ajustée, `temperature.adjustment` expose les deux valeurs du modèle et le delta appliqué.

Codes d'erreur : `INVALID_COORDINATES` (400), `WEATHER_NOT_AVAILABLE` (503), `GEOGRAPHY_CONTEXT_UNAVAILABLE` (502), `INTERNAL_ERROR` (500).

Chaîne de résolution : le service demande le contexte géographique à geography-service, lit les observations candidates dans PostgreSQL (lecture seule), applique la politique de sélection de station, puis ajuste la température retenue avec le delta du modèle entre la station et le point. Si ce calcul n'est pas disponible, il renvoie la mesure brute ; sans observation exploitable, il se replie sur le modèle météo.

## Dépendances

- `geography-service` — contexte géographique du point.
- PostgreSQL / PostGIS (`db`) — observations candidates, **lecture seule**.
- Modèle météo (`WEATHER_MODEL_URL`, par défaut Open-Meteo modèle Météo-France) — repli.

## Configuration (`src/config.ts`)

| Variable | Défaut | Description |
|---|---|---|
| `HOST` | `0.0.0.0` | Adresse d'écoute |
| `PORT` | `3000` | Port HTTP interne |
| `DATABASE_URL` | — | Connexion PostgreSQL (RO). Absente ⇒ pas d'observations |
| `GEOGRAPHY_SERVICE_URL` | `http://geography-service:3000` | Contexte géographique |
| `WEATHER_MODEL_URL` | `https://api.open-meteo.com/v1/meteofrance` | Modèle de repli |
| `GEOGRAPHY_TIMEOUT_MS` | `1500` | Délai geography-service |
| `DATABASE_TIMEOUT_MS` | `1000` | Délai lecture observations |
| `WEATHER_MODEL_TIMEOUT_MS` | `2000` | Délai modèle météo |
| `WEATHER_GLOBAL_TIMEOUT_MS` | `2500` | Budget global (≥ max des délais dépendances) |
| `APP_VERSION` | `dev` | Version exposée |

## Lancement

```bash
docker compose up -d weather-service
# via le gateway :
curl -i "http://localhost:8080/api/v2/weather/temperature?lat=44.12&lon=3.58"
```

## Rollback

Retirer le service et le proxy v2 : les routes météo historiques `/api/meteo/*` du monolithe sont indépendantes.

## Docs liées

- Comportement actuel : [`current-behaviour.md`](current-behaviour.md)
- Politique de sélection de station : [`station-selection-policy.md`](station-selection-policy.md)
- Méthode de température v2 : [`temperature-method-v2.md`](temperature-method-v2.md) · méthode v1 archivée [`temperature-method-v1.md`](temperature-method-v1.md) · corpus de parité [`parity-corpus.json`](parity-corpus.json)
- Conception v2 (OpenAPI, provenance, observabilité) : [`../../architecture/conception-v2/`](../../architecture/conception-v2/)
- Architecture globale : [`../../architecture/ARCHITECTURE-GENERALE.md`](../../architecture/ARCHITECTURE-GENERALE.md)
