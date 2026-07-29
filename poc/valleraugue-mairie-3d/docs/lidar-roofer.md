# Étape amont — LiDAR HD et reconstruction Roofer

## Ce que produit cette étape

Le POC Python n'acquiert ni le LiDAR ni les bâtiments : il **enrichit** une exécution déjà
faite. Cette étape est ce qui la fabrique. Elle prend une bbox Lambert-93 et écrit un dossier
`run-AAAAMMJJ-HHMMSS` dont le POC ne lit que deux entrées :

- `lidar_subset.laz` — nuage LiDAR HD découpé sur l'emprise, toutes classes conservées ;
- `roofer_output/*.city.jsonl` — bâtiments LoD2.2 en CityJSONSeq.

Les autres fichiers du dossier (`buildings.gpkg`, `buildings_cleaned.gpkg`, `lidar_tiles.gpkg`,
`building_bbox.json`, `buffered_bbox.json`, `pdal_pipeline.json`, `roofer.log.json`) sont les
pièces intermédiaires ; `poc.py validate` vérifie leur présence.

Contrairement à la chaîne d'enrichissement, cette étape **n'est pas native Windows** : elle
s'exécute dans le conteneur `3dgi/3dbag-pipeline-tools:2026.06.24`, qui apporte GDAL, PDAL et
Roofer. C'est la seule raison pour laquelle Docker apparaît dans ce POC.

## Prérequis

- **Docker Desktop démarré** — sans le moteur, `run.sh` échoue sur `docker is required` ;
- **Git Bash** : `run.sh` est un script Bash et les commandes ci-dessous s'y exécutent ;
- de la place disque : environ 12 Mo de LAZ sur l'emprise 200 m, 100 Mo sur l'emprise 600 m,
  plus 13 Mo de GeoPackage par exécution.

## Installation du dépôt amont

Le workflow vient du dépôt [`ignfab/roofer-with-ignf-datasets`](https://github.com/ignfab/roofer-with-ignf-datasets),
épinglé au commit `0c4fb08` (28 juin 2026). Il est cloné dans `.work-python/`, **ignoré par
Git** : c'est un outil, pas une source du POC.

```bash
cd /c/DEV_ALX/OpenDataVdA/poc/valleraugue-mairie-3d
git clone https://github.com/ignfab/roofer-with-ignf-datasets.git \
  .work-python/roofer-with-ignf-datasets
git -C .work-python/roofer-with-ignf-datasets checkout 0c4fb08
git -C .work-python/roofer-with-ignf-datasets apply \
  ../../patches/0001-copc-source.patch \
  ../../patches/0002-lidar-extent-union.patch
```

Les deux correctifs sont versionnés dans [`../patches/`](../patches/) parce que le clone, lui,
ne l'est pas : sans eux consignés ici, un nouveau clone les perdrait en silence.

### `0001-copc-source.patch`

Décide comment `readers.copc` atteint sa dalle LiDAR.

Il ajoute d'abord un en-tête `User-Agent` aux lectures HTTP : les dalles viennent de la
Géoplateforme, qui attend un agent identifié, et le POC s'annonce partout ailleurs de la même
façon (`HTTP_USER_AGENT` dans les configurations).

Il fait ensuite **préférer une dalle déjà présente sur disque**, cherchée dans
`tiles/` à la racine du clone (`/workspace/tiles` dans le conteneur). La lecture par
requêtes de plage ne tient pas sur une grande emprise : sur les 630 m, PDAL s'est arrêté après
une minute de travail, deux connexions en `CLOSE_WAIT` — le serveur avait fermé, et
`readers.copc` les attendait toujours vingt minutes plus tard, sans délai d'expiration ni
reprise. Une dalle LiDAR HD complète pèse environ 300 Mo : la prendre une fois est à la fois
moins cher et prévisible.

### `0002-lidar-extent-union.patch`

Corrige le dimensionnement de l'extraction LiDAR. En amont, `prepare_extents()` calcule
l'emprise à extraire comme **l'étendue des bâtiments BD TOPO téléchargés ± `--buffer`** : la
bbox demandée n'y entre pas. Là où un bord de l'emprise ne porte aucun bâtiment — bois, eau,
versant nu — le nuage s'arrête donc avant le terrain.

Ce n'est pas une hypothèse : sur le run 200 m, le bâti s'étalait sur 213 × 209 m et la marge
du nuage sur le bord ouest du terrain tenait à **0,8 m**. Sur l'emprise 600 m, dont les bords
sont des versants boisés, le déficit aurait été de plusieurs dizaines de mètres — et
`create_terrain` comble les cellules vides par propagation de la moyenne des voisines : la
bande non couverte aurait reçu un relief lisse, plausible et **inventé**, sans végétation, sans
eau et sans le moindre message.

Le correctif prend l'**union de la bbox demandée et de l'étendue du bâti**, puis applique le
buffer. `--buffer` devient ainsi une marge autour de la zone demandée, ce qui permet de
l'accorder à `TERRAIN_MARGIN_M`.

## Mettre les dalles LiDAR en cache

À faire une fois par dalle, avant la première exécution d'une emprise. Le nom de la dalle se
lit dans le `pdal_pipeline.json` d'une exécution précédente, ou se déduit de l'emprise : les
dalles LiDAR HD couvrent 1 km² et sont nommées par leur coin nord-ouest en kilomètres.

```bash
mkdir -p .work-python/roofer-with-ignf-datasets/tiles
cd .work-python/roofer-with-ignf-datasets/tiles
curl -# -L --retry 5 --retry-all-errors -C - \
  -A "OpenDataVdA-Roofer-POC/1.0" \
  -O "https://data.geopf.fr/telechargement/download/LiDARHD-NUALID/NUALHD_1-0__LAZ_LAMB93_MP_2024-12-13/LHD_FXX_0751_6332_PTS_LAMB93_IGN69.copc.laz"
```

`-C -` reprend un téléchargement interrompu ; le cache tient dans le clone, donc un nouveau
clone impose de le reprendre. Sans dalle en cache, l'exécution retombe sur les requêtes de
plage — c'est-à-dire sur le blocage décrit plus haut dès que l'emprise dépasse quelques
hectares.

Les trois emprises du POC tiennent dans la seule dalle `LHD_FXX_0751_6332` (X 751000–752000,
Y 6331000–6332000).

## Lancer une exécution

Depuis `poc/valleraugue-mairie-3d` en Git Bash. `--buffer` doit valoir **au moins** le
`TERRAIN_MARGIN_M` de la configuration visée (15 m partout aujourd'hui), et `--out` son
`OUTPUT_DIR`. À l'égalité exacte, la validation passe avec une marge nulle sur les bords que le
bâti ne prolonge pas — c'est juste, mais sans réserve : deux ou trois mètres de plus évitent de
jouer sur la borne.

```bash
MSYS2_ARG_CONV_EXCL='*' bash .work-python/roofer-with-ignf-datasets/run.sh \
  --bbox 751056 6331251 751656 6331851 \
  --buffer 15 \
  --out output-600m \
  --jobs 31
```

`MSYS2_ARG_CONV_EXCL='*'` n'est pas décoratif. Sans lui, Git Bash prend les chemins internes du
conteneur pour des chemins Windows à traduire, et Docker refuse la commande :

```text
the working directory 'C:/Program Files/Git/output' is invalid
```

Cela vaut pour `-w /output` comme pour le `--out /output` passé au script du conteneur. Les
chemins d'hôte, eux, restent en forme POSIX (`/c/DEV_ALX/...`) : Docker Desktop les traduit
correctement de lui-même.

| Configuration | Emprise | `--bbox` | `--out` |
| --- | --- | --- | --- |
| `config/poc.conf` | 100 m | `751306 6331501 751406 6331601` | `output` |
| `config/poc-200m.conf` | 200 m | `751256 6331451 751456 6331651` | `output-200m` |
| `config/poc-600m.conf` | 600 m | `751056 6331251 751656 6331851` | `output-600m` |

`--jobs` vaut par défaut le nombre de cœurs moins un. Chaque exécution écrit dans un
sous-dossier horodaté et ne touche jamais les précédentes ; `--clean` efface les exécutions
antérieures du même `--out` et n'est utile que pour reprendre de la place.

## Vérifier une exécution

```powershell
.\.venv\Scripts\python.exe poc.py --config config/poc-600m.conf validate
```

La section **Couverture LiDAR** du rapport confronte l'en-tête du LAZ à l'emprise du terrain
(`POC_BBOX` élargie de `TERRAIN_MARGIN_M`) et fait échouer la validation si le nuage est trop
court, côté par côté. Un déficit résiduel se corrige en relançant l'étape avec un `--buffer`
plus large — jamais en réduisant la marge du terrain, qui existe pour porter les bâtiments de
bordure.

`poc.py terrain` imprime ensuite le **taux de cellules réellement mesurées** : c'est ce chiffre,
et non la couverture, qui dit si la donnée soutient la maille choisie sous couvert boisé.

## Coût observé

| Emprise | Nuage | Terrain couvert | Dalles COPC | Bâtiments |
| --- | --- | --- | --- | --- |
| 200 m | 11,7 Mo | 230 × 230 m | 1 (`LHD_FXX_0751_6332`) | 176 |
| 600 m | 116 Mo | 630 × 630 m | 1 (`LHD_FXX_0751_6332`) | 490 |

L'emprise 630 m tient entière dans la dalle `LHD_FXX_0751_6332` (X 751000–752000,
Y 6331000–6332000) : un seul téléchargement, malgré neuf fois la surface de l'emprise 200 m.

Depuis la dalle en cache, l'exécution 630 m prend **45 secondes** de bout en bout — dont
11 s de découpage PDAL et 14 s pour les 490 bâtiments de Roofer. La même exécution par requêtes
de plage n'a jamais abouti.
