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
| `/ready` | Disponibilité du relief, des glyphes et des actifs MapLibre, avec le détail par région dans `regionsRelief` |
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

Les archives doivent être présentes dans `apps/web/public/relief/`. Leur absence ne bloque pas le démarrage ; `/ready` ne passe en `degraded` que si **aucune** région de relief n’a ses archives — une région déclarée mais pas encore générée est un chantier connu, pas une panne, et `/ready` en donne le détail dans `regionsRelief`.

`IGN_ALTIMETRIE_LAYER` change la couche altimétrique interrogée sans reconstruire l’image. Le défaut, `RGEALTI-MNT_PYR-ZIP_FXX_LAMB93_WMS`, est la pyramide native du RGE ALTI : c’est la seule qui réponde à son pas métrique. Les couches `ELEVATION.ELEVATIONGRIDCOVERAGE.*` plafonnent à 4,78 m/px malgré leur nom et couvrent la carte d’un quadrillage — voir [`styles.md`](styles.md).

### Régions de relief

Le relief « standard » (`/api/v2/map/relief/*`) n’est pas une couverture nationale : il est servi par région, chacune avec sa propre paire d’archives `<id>.pmtiles` / `<id>-hd.pmtiles`. Les régions et leurs emprises sont déclarées dans `REGIONS_RELIEF` (`packages/shared/src/carto.ts`) :

| Région | Emprise | Archives |
|---|---|---|
| `aigoual` | Cévennes / Mont Aigoual (bbox historique) | `aigoual.pmtiles`, `aigoual-hd.pmtiles` (committées) |
| `alpes-marseille` | 100 km autour de Marseille (43.2965, 5.3698) | `alpes-marseille.pmtiles`, `alpes-marseille-hd.pmtiles` (à générer) |
| `perigueux` | 100 km autour de Périgueux (45.1848, 0.7211) | `perigueux.pmtiles`, `perigueux-hd.pmtiles` (à générer) |

`ReliefPmtiles` interroge les archives montées et laisse PMTiles répondre, **sans présélectionner de région d’après ces `bounds`**. L’ensemble des tuiles stockées déborde en effet de la bbox : une archive contient toute tuile qui *intersecte* la zone, or une tuile de bas zoom est bien plus large qu’elle. Mesuré sur `aigoual.pmtiles` (bbox `3.2/43.8 → 4.1/44.4`, zooms 0→12 ; `aigoual-hd.pmtiles` prend le relais en 13→15), la tuile `7/65/46` est servie avec 443 Ko de relief alors que son centre tombe à 4,22° E, hors de la bbox — et `0/0/0` l’est également. Filtrer sur la position de la tuile perdrait donc des données réellement présentes.

Les `bounds` restent utiles ailleurs : documentation, `bounds` de la source MapLibre (via `RELIEF_BOUNDS_GLOBAL`) et emprise cible du script de génération. Côté erreurs, une tuile qu’aucune archive montée ne sert est une absence de relief ordinaire (404) ; le service ne renvoie une panne (503, `RELIEF_INDISPONIBLE`) que si **aucune** région n’a d’archive du tout — un déploiement partiel (l’Aigoual prêt, Marseille et Périgueux pas encore générées) ne doit pas transformer en panne les tuiles que l’archive de l’Aigoual couvre déjà.

Chaque région a ses variables d’environnement propres : `MAP_RELIEF_<ID>_GLOBAL_PATH` / `MAP_RELIEF_<ID>_HD_PATH` (ex. `MAP_RELIEF_ALPES_MARSEILLE_GLOBAL_PATH`), avec un défaut `/srv/relief/<id>(-hd).pmtiles`. `aigoual` accepte en plus les variables historiques `MAP_RELIEF_GLOBAL_PATH` / `MAP_RELIEF_HD_PATH`.

**Générer une nouvelle région** — `apps/map-service/scripts/generer-region-relief.ts` calcule la bbox (depuis `REGIONS_RELIEF`, ou `--lat`/`--lon`/`--rayon-km` pour une zone ad hoc) et convertit chaque tuile du RGE ALTI IGN en PNG terrarium :

```bash
pnpm --filter map-service generer:relief -- --id alpes-marseille --sortie ../web/public/tuiles-relief/alpes-marseille
```

Ce script ne fait que produire les tuiles PNG : pour une emprise de 100 km de rayon, cela représente plusieurs dizaines de milliers de requêtes WMS et peut prendre des heures — c’est une tâche d’exploitation à part, pas une commande à lancer en développement. Reste ensuite à convertir chaque PNG en WebP sans perte puis à empaqueter l’arborescence avec la CLI `pmtiles` (voir [`doc/ADR/004-choix-maplibre-pmtiles.md`](../../ADR/004-choix-maplibre-pmtiles.md)) avant de déposer l’archive dans `apps/web/public/relief/`.

## Limites

- aucune donnée métier n’est stockée ou agrégée ;
- le cache mémoire n’est pas partagé entre réplicas ;
- le fond OSM public n’est pas reproxifié ;
- la migration des îlots vers `urlCarte()` est progressive : `urlStyle(nom, options)` reste servi, déprécié, dans `apps/web/src/lib/carte.ts` et traduit les anciens noms de style en paramètres ;
- ce même fichier recrée encore, côté client, la source DEM et la couche d’ombrage que le style fournit déjà : ce doublon sera retiré dans un lot ultérieur.
