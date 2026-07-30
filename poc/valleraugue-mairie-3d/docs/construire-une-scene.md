# Construire une scène — pipeline complet et contrat d'interface

## Objet

Ce document décrit, de bout en bout, ce qu'il faut pour transformer **un point sur une
carte** en une scène 3D chargeable dans le visualiseur. Il sert deux lecteurs :

- celui qui construit une scène **à la main**, en ligne de commande — la procédure est aux
  sections 2 à 6 ;
- celui qui construira **l'interface de construction** — le contrat de données, les
  validations et les modes d'échec sont aux sections 7 et 8.

Les documents voisins couvrent le reste : [`lidar-roofer.md`](lidar-roofer.md) détaille
l'étape amont, [`publication-visualiseur.md`](publication-visualiseur.md) la mise en ligne
derrière Caddy et [`publication-tailscale.md`](publication-tailscale.md) le transfert des
fichiers vers le serveur.

## 1. Vue d'ensemble

Une scène traverse quatre étages, dont un seul demande Docker.

```
        ┌──────────────────────────────────────────────────────────────┐
 ①      │ poc.py scene   point WGS84 + côté  →  config/<id>.conf       │  natif Windows
        │                                       config/<id>.geojson    │  ~ instantané
        └──────────────────────────────────────────────────────────────┘
                                   ↓  POC_BBOX, TERRAIN_MARGIN_M
        ┌──────────────────────────────────────────────────────────────┐
 ②      │ run.sh (Docker)  LiDAR HD + BD TOPO → Roofer LoD2.2          │  Docker + Git Bash
        │                  output-<id>/run-AAAAMMJJ-HHMMSS/            │  ~ 45 s / 600 m
        │                    lidar_subset.laz                          │  dalles en cache
        │                    roofer_output/*.city.jsonl                │
        └──────────────────────────────────────────────────────────────┘
                                   ↓
        ┌──────────────────────────────────────────────────────────────┐
 ③      │ poc.py --config config/<id>.conf all                         │  natif Windows
        │   validate → terrain → vegetation → ortho → glb → web        │  ~ 2 à 6 min
        │   render/scene.glb + render/scene.json                       │
        └──────────────────────────────────────────────────────────────┘
                                   ↓
        ┌──────────────────────────────────────────────────────────────┐
 ④      │ poc.py --config <défaut> web    → web/assets/scenes.json     │  natif Windows
        │   la scène entre dans le sélecteur du visualiseur            │  ~ 10 s
        └──────────────────────────────────────────────────────────────┘
```

L'étage ② est le seul à sortir de l'environnement Python natif : il embarque GDAL, PDAL et
Roofer dans le conteneur `3dgi/3dbag-pipeline-tools`. C'est aussi le seul à télécharger les
données lourdes. À l'étage ③, l'orthophotographie fait une requête WMS et la végétation une
requête WFS légère vers BD Forêt V2 ; cette dernière est facultative et retombe sur un profil
générique si le service est indisponible.

## 2. Étage ① — décrire la scène

```powershell
.\.venv\Scripts\python.exe poc.py scene `
  --lat 44.048777 --lon 3.700903 --side 200 `
  --title "Notre-Dame-de-la-Rouvière" `
  --subtitle "Val-d'Aigoual · IGN LiDAR HD" `
  --centre-label "Place Auguste Vidal" `
  --id notre-dame-rouviere-200m
```

Sans `--write`, **rien n'est écrit** : la commande affiche le plan et s'arrête. C'est le
mode par défaut à dessein — une scène engage plusieurs centaines de mégaoctets de
téléchargement, et le plan est ce qui permet de le voir avant.

```text
Scène « Notre-Dame-de-la-Rouvière » — notre-dame-rouviere-200m
  Centre         : 44.048776, 3.700904 (WGS84)
                   756168, 6328002 (Lambert-93)
  Emprise        : 200 × 200 m — POC_BBOX="756068 6327902 756268 6328102"
  Terrain        : 230 m de côté à 0.5 m
                   211600 mailles, scène estimée à 26 Mo
  Orthophoto     : 2048 px, soit 11 cm/pixel
  Dalles LiDAR   : LHD_FXX_0756_6329, LHD_FXX_0756_6328
  Sorties        : ./output-notre-dame-rouviere-200m
  Attention      : 2 dalles LiDAR HD à mettre en cache (~600 Mo) : …
```

Ajouter `--write` écrit trois fichiers :

| Fichier | Rôle |
| --- | --- |
| `config/<id>.conf` | configuration lue par tout le pipeline |
| `config/<id>.conf.example` | copie identique, exigée par les conventions du POC |
| `config/<id>.geojson` | centre et emprise en WGS84, pour contrôle visuel sur une carte |

`--overwrite` est nécessaire pour remplacer une configuration existante : les `.conf` sont
versionnés et se retouchent à la main, les écraser en silence ferait perdre ces retouches.

### Options

| Option | Défaut | Effet |
| --- | --- | --- |
| `--lat`, `--lon` | *obligatoires* | centre de la scène, en WGS84 (latitude puis longitude) |
| `--side` | `200` | côté de l'emprise carrée, en mètres, **pair** |
| `--title` | *obligatoire* | nom du lieu, affiché en tête du visualiseur et dans le sélecteur |
| `--subtitle` | `IGN LiDAR HD` | surtitre de provenance |
| `--centre-label` | `Point central` | intitulé du point de vue visant l'origine de la scène |
| `--id` | `<titre-en-slug>-<côté>m` | identifiant : nom du `.conf`, du dossier servi et valeur du sélecteur |
| `--resolution` | `0,5 m` jusqu'à 300 m de côté, `1 m` au-delà | maille du terrain |
| `--margin` | `15` | marge du terrain autour de l'emprise, en mètres |
| `--ortho-px` | plus petite puissance de deux tenant 15 cm/pixel, plafonnée à 4096 | côté de l'orthophotographie |
| `--output-dir` | `./output-<id>` | dossier des exécutions |
| `--write` | non | écrit les fichiers au lieu d'afficher seulement le plan |
| `--overwrite` | non | remplace une configuration existante |
| `--json` | non | rend le plan en JSON plutôt qu'en texte (cf. § 7) |

### Deux contraintes qui ne se négocient pas

**L'emprise est carrée.** La requête WMS de l'orthophotographie l'est, et `poc.py sun`
rastérise le masque bâti avec une résolution unique déduite de la seule largeur. Sur une
bbox rectangulaire, le recalage rendrait un chiffre plausible et faux, sans rien signaler.
`square_bbox` n'accepte donc qu'un côté, et pair : les bornes restent entières, ce qui rend
la bbox lisible et aligne la maille du terrain sur des coordonnées rondes.

**Le centre est arrondi au mètre.** Le point demandé est conservé tel quel dans le
`.geojson` (`requested_wgs84`), mais l'emprise est construite sur le mètre le plus proche.
L'écart est sans effet — deux mailles de terrain au plus — et il évite des bbox à décimales
que la commande amont recopierait mal.

## 3. Étage ② — LiDAR HD et reconstruction Roofer

Procédure complète dans [`lidar-roofer.md`](lidar-roofer.md). Le strict nécessaire :

1. **Docker Desktop démarré.** Sans le moteur, `run.sh` échoue sur `docker is required`.
2. **Dalles LiDAR en cache.** Les noms sont donnés par le plan. Une dalle pèse environ
   300 Mo, couvre 1 km² et porte le nom de son coin nord-ouest en kilomètres. Sans cache,
   PDAL retombe sur des requêtes de plage qui n'aboutissent pas au-delà de quelques hectares.

   ```bash
   cd .work-python/roofer-with-ignf-datasets/tiles
   curl -# -L --retry 5 --retry-all-errors -C - -A "OpenDataVdA-Roofer-POC/1.0" \
     -O "https://data.geopf.fr/telechargement/download/LiDARHD-NUALID/NUALHD_1-0__LAZ_LAMB93_MP_2024-12-13/LHD_FXX_0756_6328_PTS_LAMB93_IGN69.copc.laz"
   ```

3. **Lancer l'exécution**, en Git Bash. La commande est celle que le plan affiche :

   ```bash
   MSYS2_ARG_CONV_EXCL='*' bash .work-python/roofer-with-ignf-datasets/run.sh \
     --bbox 756068 6327902 756268 6328102 \
     --buffer 15 \
     --out output-notre-dame-rouviere-200m
   ```

`--buffer` reprend `TERRAIN_MARGIN_M`. À l'égalité exacte la validation passe avec une marge
nulle sur les bords que le bâti ne prolonge pas : deux ou trois mètres de plus évitent de
jouer sur la borne. `--out` doit reprendre `OUTPUT_DIR` sans le `./`.

Le nombre de dalles est le seul point où une scène coûte vraiment. Une emprise centrée à
proximité d'une limite kilométrique en franchit une, parfois deux : quinze mètres de marge y
suffisent. Le plan les liste, y compris celles que seule la marge fait entrer.

## 4. Étage ③ — enrichissement natif

```powershell
.\.venv\Scripts\python.exe poc.py --config config\notre-dame-rouviere-200m.conf check
.\.venv\Scripts\python.exe poc.py --config config\notre-dame-rouviere-200m.conf all
```

`check` vérifie Python, les trois dépendances et la présence des deux entrées Roofer. `all`
enchaîne, sur la dernière exécution complète du `OUTPUT_DIR` :

| Étape | Entrées | Sorties | Ce qui peut échouer |
| --- | --- | --- | --- |
| `validate` | `lidar_subset.laz`, `roofer_output/` | `poc-validation.md` | nuage plus court que l'emprise du terrain |
| `terrain` | points LiDAR de classe 2 | `terrain.tif/.tfw/.prj/.npy`, `canopy.npy`, `surface.npy`, `water.npy`, `bridge.npy` | taux de mailles mesurées faible sous couvert boisé |
| `vegetation` | classe LiDAR 5, WFS BD Forêt V2 facultatif | `trees.json` | repli générique si le WFS est indisponible |
| `ortho` | WMS Géoplateforme | `orthophoto.jpg`, `orthophoto.json` | service indisponible, emprise hors couverture |
| `glb` | tout ce qui précède | `render/scene.glb`, `scene.json`, `buildings.json` | toiture dégradée sans emprise : conservation signalée de la géométrie Roofer |
| `web` | `render/` de toutes les emprises | `web/` complet | — |

La validation est bloquante et c'est voulu : `create_terrain` comble les cellules vides par
propagation de la moyenne des voisines. Une bande non couverte recevrait un relief lisse,
plausible et **inventé**, sans végétation ni eau, et sans le moindre message. Un déficit se
corrige en relançant l'étage ② avec un `--buffer` plus large — jamais en réduisant
`TERRAIN_MARGIN_M`, qui existe pour porter les bâtiments de bordure.

### Calibration solaire, à faire une fois par site

```powershell
.\.venv\Scripts\python.exe poc.py --config config\notre-dame-rouviere-200m.conf sun
```

La commande retrouve l'azimut et la hauteur du soleil sur les ombres de l'orthophotographie,
et mesure le décalage résiduel de l'image sur les emprises bâties. Reporter les quatre
valeurs dans le `.conf` en décommentant `ORTHO_SUN_*` et `ORTHO_OFFSET_*` seulement si l'on
veut les figer ; sinon `glb` refait la mesure à chaque assemblage.

## 5. Étage ④ — entrer dans le menu du visualiseur

Rien à coder : `available_scenes` ([`src/poc3d/web.py`](../src/poc3d/web.py)) parcourt
`config/*.conf`, retient pour chacune la dernière exécution portant un `render/scene.glb`, et
écrit `web/assets/scenes.json`. Ajouter un `.conf` suffit à faire apparaître une scène.

**La configuration passée à `poc.py web` détermine la scène par défaut** : elle est la
première entrée du manifeste, donc celle que le navigateur télécharge au chargement. Sur une
publication en ligne, préparer depuis la plus légère.

```powershell
.\.venv\Scripts\python.exe poc.py --config config\poc-200m.conf web
```

```text
Scènes proposées au sélecteur : Valleraugue — 200 × 200 m (courante), Valleraugue — 600 × 600 m
```

Les scènes des autres emprises sont recopiées dans `web/assets/scenes/<id>/` : le serveur ne
sert que `web/`, il ne peut pas atteindre le `render/` d'une autre exécution.

## 6. Titre d'une scène

Quatre réglages portent l'identité, tous facultatifs — une configuration qui n'en a aucun
garde le comportement d'avant, c'est-à-dire un libellé réduit à la taille de l'emprise.

| Réglage | Où il s'affiche |
| --- | --- |
| `SCENE_TITLE` | `<h1>` de l'en-tête, onglet du navigateur, entrée du sélecteur |
| `SCENE_SUBTITLE` | surtitre au-dessus du titre |
| `SCENE_CENTRE_LABEL` | infobulle du point de vue centré sur l'origine |
| `SCENE_CENTRE_WGS84` | dialogue « Informations sur les données », section Emprise |

L'entrée du sélecteur vaut `« <titre> — <largeur> × <hauteur> m »` : le titre distingue les
communes, la taille distingue deux emprises du même lieu. Sans titre, elle retombe sur la
seule taille.

Côté visualiseur, `applySceneIdentity` ([`viewer/app.js`](../viewer/app.js)) applique ces
valeurs **avant** de lancer le chargement du GLB : la scène pèse une vingtaine de
mégaoctets, et laisser le nom de la précédente en tête pendant tout ce temps se lirait comme
une erreur. Une scène sans identité retombe sur `DEFAULT_IDENTITY`, ce qui couvre les
exécutions préparées avant l'existence de ces réglages.

Le point de vue centré vise toujours l'origine du modèle : le GLB est recentré sur le milieu
de `POC_BBOX`, quel que soit le site. Seul son intitulé change.

## 7. Contrat pour une interface de construction

`poc.py scene --json` rend le plan complet sans rien écrire. C'est le contrat entre le
pipeline et toute interface qui voudrait le piloter : elle affiche le plan, le fait valider,
puis relance la même commande avec `--write`.

```jsonc
{
  "id": "notre-dame-rouviere-200m",
  "title": "Notre-Dame-de-la-Rouvière",
  "subtitle": "Val-d'Aigoual · IGN LiDAR HD",
  "centreLabel": "Place Auguste Vidal",
  "centre": {
    "lambert93": [756168.0, 6328002.0],
    "wgs84": [3.700904, 44.048776]        // longitude, latitude — ordre GeoJSON
  },
  "sideM": 200.0,
  "bbox": [756068.0, 6327902.0, 756268.0, 6328102.0],          // EPSG:2154
  "terrainBbox": [756053.0, 6327887.0, 756283.0, 6328117.0],   // bbox + marge
  "terrainMarginM": 15.0,
  "terrainResolutionM": 0.5,
  "terrainCells": 211600,
  "orthoSizePx": 2048,
  "orthoResolutionM": 0.1123,
  "outputDir": "./output-notre-dame-rouviere-200m",
  "configPath": "config/notre-dame-rouviere-200m.conf",
  "footprintWgs84": [[…]],                // anneau fermé, prêt à poser sur une carte
  "lidarTiles": ["LHD_FXX_0756_6329", "LHD_FXX_0756_6328"],
  "lidarTileUrls": ["https://data.geopf.fr/telechargement/…"],
  "estimates": { "glbMb": 26.2, "lidarDownloadMb": 600 },
  "creationCommand": "poc.py scene --lat … --write",
  "upstreamCommand": "MSYS2_ARG_CONV_EXCL='*' bash …/run.sh --bbox … --out …",
  "warnings": ["2 dalles LiDAR HD à mettre en cache (~600 Mo) : …"]
}
```

Les mêmes valeurs sont accessibles en Python sans passer par le CLI :

```python
from poc3d.scene import SceneRequest, plan_scene, write_scene

plan = plan_scene(SceneRequest(latitude=44.048777, longitude=3.700903,
                               side_m=200, title="Notre-Dame-de-la-Rouvière"))
plan.as_dict()                    # le JSON ci-dessus
write_scene(plan, root)           # les trois fichiers
```

### Ce que l'interface doit montrer

- **L'emprise sur une carte**, à partir de `footprintWgs84`. C'est le seul contrôle qui
  attrape une latitude et une longitude inversées avant que 600 Mo ne partent en
  téléchargement.
- **`warnings`**, tel quel. Ces points coûtent du temps ou de la place, jamais la justesse :
  ils s'affichent, ils ne bloquent pas.
- **`estimates`**, avant toute action. `lidarDownloadMb` est le coût de l'étage ②,
  `glbMb` celui que le visiteur téléchargera.
- **`upstreamCommand`**, à copier tel quel : l'étage ② n'est pas pilotable depuis
  l'environnement Python natif, et l'interface ne doit pas prétendre le lancer.

### Ce que l'interface ne doit pas faire

- **Écrire un `.conf` elle-même.** Le gabarit porte les réglages de traitement calibrés sur
  le terrain et leurs justifications ; les régénérer ailleurs les ferait diverger.
- **Toucher aux `output*/`.** Ils appartiennent au pipeline, et une exécution Roofer ne se
  refait pas.
- **Proposer une emprise rectangulaire**, pour la raison donnée au § 2.

## 8. Modes d'échec

| Symptôme | Cause | Correction |
| --- | --- | --- |
| `Longitude … hors du domaine Lambert-93` | latitude et longitude inversées | remettre `--lat` et `--lon` dans le bon ordre |
| `Le côté de l'emprise doit être un nombre pair de mètres` | `--side` impair ou fractionnaire | arrondir au pair le plus proche |
| `ORTHO_SIZE_PX doit rester entre 1024 et 4096 pixels` | `--ortho-px` hors bornes | laisser la valeur déduite |
| `Déjà présent : <id>.conf` | scène déjà décrite | `--overwrite`, ou choisir un autre `--id` |
| `docker is required` | Docker Desktop arrêté | le démarrer avant l'étage ② |
| `the working directory 'C:/Program Files/Git/output' is invalid` | `MSYS2_ARG_CONV_EXCL='*'` oublié | reprendre la commande du plan telle quelle |
| **FAIL** — *le nuage LiDAR ne couvre pas l'emprise du terrain* | `--buffer` trop court, ou dalle manquante | relancer l'étage ② avec un buffer plus large ; vérifier que toutes les dalles du plan sont en cache |
| `Exécuter d'abord la commande glb` | `web` avant `all` | lancer `all` |
| `Aucune exécution complète dans …` | étage ② jamais fait pour ce `OUTPUT_DIR` | lancer l'étage ② |
| La scène n'apparaît pas dans le sélecteur | pas de `render/scene.glb` dans son `OUTPUT_DIR` | lancer `all` sur sa configuration, puis `web` sur la configuration par défaut |
| Deux entrées « 200 × 200 m » indiscernables | `SCENE_TITLE` absent | renseigner le titre dans le `.conf` **et** son `.example` |

## 9. Références de code

| Sujet | Fichier |
| --- | --- |
| Projection, dalles, coins WGS84 | [`src/poc3d/geodesy.py`](../src/poc3d/geodesy.py) |
| Plan de scène, gabarit de configuration | [`src/poc3d/scene.py`](../src/poc3d/scene.py) |
| Lecture des réglages, identité de scène | [`src/poc3d/config.py`](../src/poc3d/config.py) |
| Manifeste du sélecteur | `available_scenes` dans [`src/poc3d/web.py`](../src/poc3d/web.py) |
| Application du titre | `applySceneIdentity` dans [`viewer/app.js`](../viewer/app.js) |
| Tests | `test/test_geodesy.py`, `test/test_scene.py`, `test/test_web.py` |
