# Architecture générale — OpenData Val-d'Aigoual

> Vue d'ensemble technique du portail et de sa migration vers une architecture de microservices.
> Dernière mise à jour : 2026-07-24 · Dernière vérification : 2026-07-24

Ce document est le point d'entrée technique. Il décrit **deux ensembles qui coexistent** pendant la migration :

- le **monolithe v1** (historique, encore en production) ;
- les **microservices v2** (nouveau socle, déjà déployés derrière le gateway).

Pour le détail de chaque brique, suivre les liens vers les README dédiés (voir aussi [`../SOMMAIRE.md`](../SOMMAIRE.md)).

---

## 1. Schéma d'ensemble

```text
                              INTERNET
                                 │
                                 ▼
                 ┌──────────────────────────────┐
                 │ CADDY                        │
                 │ /api/v2/* → gateway         │
                 │ /api/*    → api historique  │
                 │ /*        → statique        │
                 └──────────────────────────────┘
                       │                 │
                       ▼                 ▼
              ┌────────────────┐   ┌──────────────┐
              │ GATEWAY v2     │   │ MONOLITHE v1 │
              └────────────────┘   └──────────────┘
               │    │    │    │             │
       geography weather vigilance fire     │
               │    │    │    │             ▼
               ▼    ▼    ▼    ▼       PostgreSQL/PostGIS
          ┌───────────────────────────────┐   ▲
          │ Microservices v2             │   │
          │ geography-service            │ worker / copernicus
          │ weather-service              │
          │ weather-vigilance-service    │
          │ fire-detection-service       │
          └───────────────────────────────┘
```

Le **frontend météo v2** (`apps/meteo-web`, React/Vite) consomme les routes `/api/v2/*` du gateway ; le **frontend historique** (`apps/web`, Astro) consomme les routes `/api/*` du monolithe.

---

## 2. Services `docker-compose.yml`

| Service | Génération | Rôle | Exposition | Base |
|---|---|---|---|---|
| `caddy` | transverse | Reverse proxy + HTTPS + statique + relief PMTiles | `8080:80` | — |
| `api` | v1 | API Fastify historique (`/api/*`) | interne `:3000` | PostGIS |
| `web` | v1 | Site Astro statique (servi par Caddy) | via Caddy | — |
| `worker` | v1 | Ingestion planifiée (cron) → PostGIS | — | PostGIS |
| `db` | transverse | PostgreSQL 16 + PostGIS 3.4 | interne `:5432` | — |
| `gateway` | v2 | Point d'entrée `/api/v2/*`, proxys, santé | interne `:3000` | — |
| `geography-service` | v2 | Résolution géographique (territoire, adresse, altitude) | interne `:3000` | — |
| `weather-service` | v2 | Température météo ponctuelle | interne `:3000` | PostGIS (RO) |
| `weather-vigilance-service` | v2 | Vigilance officielle départementale et bulletins | interne `:3000` | snapshot JSON |
| `fire-detection-service` | v2 | Suspicion de feu EUMETSAT/FIRMS autour du GPS | interne `:3000` | aucune |
| `copernicus` | v2 | Jobs climatiques ERA5 (profile `copernicus`) → PostGIS | — | PostGIS |

`copernicus` n'est pas un service HTTP : c'est un job Python idempotent activé par le profil Compose `copernicus`.

---

## 3. Routage (Caddy → gateway)

Caddy (`Caddyfile`) route uniquement `/api/v2` et `/api/v2/*` vers le gateway ; tout le reste de `/api/*` va directement au monolithe. Le `Caddyfile` est **embarqué dans l'image au build** (`Dockerfile.caddy`) : toute modification de route impose de reconstruire `caddy`, pas seulement le service ciblé.

Routes publiques exposées par le gateway :

| Route publique | Cible interne | Méthodes |
|---|---|---|
| `GET /api/v2/gateway` | statut du gateway | GET |
| `GET /api/v2/geography/resolve` | `geography-service:/internal/v1/geography/resolve` | GET |
| `GET /api/v2/weather/temperature` | `weather-service:/internal/v1/weather/temperature` | GET |
| `GET /api/v2/vigilance` | résolution geography puis `weather-vigilance-service:/v1/vigilance/departments/{code}` | GET |
| `GET /api/v2/fire/nearby` | `fire-detection-service:/v1/fire/nearby`, rayon 50 km et historique 7 jours imposés | GET |
| `/api/v2/legacy/*` | `api:/api/*` (pont temporaire) | GET, HEAD |

Le gateway propage `x-request-id`, normalise les erreurs (`{ error: { code, message, retryable }, requestId }`) et reste indépendant de la santé des services amont.

---

## 4. Microservices v2

Les services Fastify ne sont jamais atteints directement par le navigateur : tous les accès publics passent par le gateway.

| Service | README | Endpoint principal | Dépendances |
|---|---|---|---|
| Gateway | [`../microservice/gateway-service/README.md`](../microservice/gateway-service/README.md) | `/api/v2/*` | api et microservices v2 |
| Geography | [`../microservice/geography-service/README.md`](../microservice/geography-service/README.md) | `/internal/v1/geography/resolve` | geo.api.gouv.fr, data.geopf.fr |
| Weather | [`../microservice/weather-service/README.md`](../microservice/weather-service/README.md) | `/internal/v1/weather/temperature` | geography-service, PostGIS (RO), modèle météo |
| Weather Vigilance | [`../microservice/weather-vigilance/README.md`](../microservice/weather-vigilance/README.md) | `/v1/vigilance/departments/{code}` | API DPVigilance Météo-France, volume `vigilance_cache` |
| Fire Detection | [`../microservice/fire-detection/README.md`](../microservice/fire-detection/README.md) | `/v1/fire/nearby` | NASA FIRMS Area API, EUMETSAT Data Store |
| Copernicus | [`../microservice/copernicus/README.md`](../microservice/copernicus/README.md) | jobs ERA5 (batch) | CDS Copernicus, PostGIS |

Les spécifications transverses de la météo v2 (OpenAPI, contrat de provenance, observabilité, déploiement) sont regroupées dans [`conception-v2/`](conception-v2/).

---

## 5. Monolithe v1 (historique)

Le monolithe reste la référence documentée dans [`../v1/monolithe/architecture-legacy.md`](../v1/monolithe/architecture-legacy.md). En résumé :

- `worker` ingère des sources open data publiques → PostGIS ;
- `api` (Fastify) sert ces données (GeoJSON par couche, recherche, territoire, piézométrie, météo v1) ;
- `web` (Astro + îles Svelte MapLibre) affiche le portail et la carte.

Les mini-applications historiques (météo, vigilance feu / incendies) sont documentées sous [`../v1/`](../v1/).

---

## 6. Persistance

PostgreSQL 16 / PostGIS 3.4 (service `db`), partagé entre v1 et une partie de v2 :

- schémas historiques `territoire`, `couches`, `series`, `meta` (cf. `db/migrations`) ;
- `weather-service` lit les observations en **lecture seule** ;
- `copernicus` écrit les agrégats climatiques (`series.meteo_climatologie_jour`, `series.thermal_monthly`).

Le `weather-vigilance-service` conserve un snapshot JSON atomique dans le volume `vigilance_cache`. Le `fire-detection-service` est strictement stateless : aucun volume, aucune table et seulement un cache mémoire court.

---

## 7. Configuration & secrets

Toutes les variables sont injectées par Docker Compose depuis `.env` (cf. `.env.example`). Points sensibles :

- `POSTGRES_*` — accès base (obligatoire) ;
- tokens Météo-France (`METEOFRANCE_*`), dont `METEOFRANCE_VIGILANCE_API_TOKEN` ;
- `INFOCLIMAT_API_TOKEN`, `NASA_FIRMS_MAP_KEY` ;
- `EUMETSAT_CONSUMER_KEY`, `EUMETSAT_CONSUMER_SECRET` — téléchargement des produits CAP ;
- `COPERNICUS_CDS_KEY` — jobs climatiques ;
- délais et URLs amont des services v2 (`*_TIMEOUT_MS`, `*_SERVICE_URL`).

Les clés FIRMS et EUMETSAT restent exclusivement côté serveur.

---

## 8. Déploiement

```bash
docker compose up --build
docker compose --profile copernicus up -d copernicus
```

Rappel : après toute modification du `Caddyfile` ou d'une route derrière Caddy, reconstruire explicitement `caddy` (`docker compose build caddy`). Les lots 4 et 5 n'ajoutent aucune règle Caddy : la règle existante `/api/v2/*` couvre leurs routes.
