# Map Service

> Serveur de représentation cartographique sans accès à la base de données.
> Code : `apps/map-service/`

## Responsabilité

`map-service` centralise les styles MapLibre, les fonds IGN, la géologie BRGM, le relief PMTiles, le radar raster, les glyphes, les actifs MapLibre et les légendes visuelles.

Les services métier et le monolithe restent responsables des GeoJSON, des recherches et des données thématiques.

## Routes principales

| Route | Rôle |
|---|---|
| `/health` | Vie du processus |
| `/ready` | Disponibilité du relief, des glyphes et des actifs MapLibre |
| `/api/v2/map/styles/{style}.json` | Style `plan`, `territoire`, `relief` ou `hypsometrique` |
| `/api/v2/map/tiles/{source}/{z}/{x}/{y}` | Tuiles IGN, BRGM ou radar |
| `/api/v2/map/relief/{z}/{x}/{y}.png` | DEM terrarium issu des archives PMTiles |
| `/api/v2/map/glyphs/{font}/{range}.pbf` | Glyphes locaux |
| `/api/v2/map/legends` | Index des légendes |
| `/api/v2/map/vendor/maplibre-gl.{js,css}` | Actifs MapLibre versionnés |
| `/internal/v1/map/metrics` | Cache et métriques de diffusion |

## Développement

```bash
pnpm install
pnpm dev:map
pnpm check:map
```

Le port de développement par défaut est `3003`. Le front Astro proxifie `/api/v2/map` vers ce port.

## Déploiement

```bash
docker compose build map-service caddy
docker compose up -d map-service caddy
curl -fsS http://localhost:8080/api/v2/map/styles/territoire.json
```

Les archives doivent être présentes dans `apps/web/public/relief/`. Leur absence ne bloque pas le démarrage mais place `/ready` en état `degraded`.

## Limites

- aucune donnée métier n’est stockée ou agrégée ;
- le cache mémoire n’est pas partagé entre réplicas ;
- le fond OSM public n’est pas reproxifié ;
- la migration des styles inline des îlots est progressive, avec une couche de compatibilité dans `apps/web/src/lib/carte.ts`.
