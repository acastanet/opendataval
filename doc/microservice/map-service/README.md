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
| `/api/v2/map/styles/carte.json` | Style unique paramétrable (fond, géologie, teintes, ombrage, terrain) |
| `/api/v2/map/tiles/{source}/{z}/{x}/{y}` | Tuiles IGN, BRGM ou radar |
| `/api/v2/map/relief/{z}/{x}/{y}.webp` | DEM terrarium issu des archives PMTiles (`.png` accepté en alias) |
| `/api/v2/map/relief-hd/{z}/{x}/{y}.png` | Même DEM jusqu’à z15, puis RGE ALTI 1 m de l’IGN reprojeté à la demande en z16 |
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
curl -fsS http://localhost:8080/api/v2/map/styles/carte.json
```

Les archives doivent être présentes dans `apps/web/public/relief/`. Leur absence ne bloque pas le démarrage mais place `/ready` en état `degraded`.

`IGN_ALTIMETRIE_LAYER` change la couche altimétrique interrogée sans reconstruire l’image. Le défaut, `RGEALTI-MNT_PYR-ZIP_FXX_LAMB93_WMS`, est la pyramide native du RGE ALTI : c’est la seule qui réponde à son pas métrique. Les couches `ELEVATION.ELEVATIONGRIDCOVERAGE.*` plafonnent à 4,78 m/px malgré leur nom et couvrent la carte d’un quadrillage — voir [`styles.md`](styles.md).

## Limites

- aucune donnée métier n’est stockée ou agrégée ;
- le cache mémoire n’est pas partagé entre réplicas ;
- le fond OSM public n’est pas reproxifié ;
- la migration des îlots vers `urlCarte()` est progressive : `urlStyle(nom, options)` reste servi, déprécié, dans `apps/web/src/lib/carte.ts` et traduit les anciens noms de style en paramètres ;
- ce même fichier recrée encore, côté client, la source DEM et la couche d’ombrage que le style fournit déjà : ce doublon sera retiré dans un lot ultérieur.
