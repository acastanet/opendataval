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
        │   validate → terrain → vegetation → ortho → geology →        │  ~ 2 à 6 min
        │   glb → source → web                                         │
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
données lourdes. À l'étage ③, l'orthophotographie fait une requête WMS vers la Géoplateforme,
et deux appels en sortent : la végétation interroge le WFS BD Forêt V2 pour typer les
houppiers, la géologie télécharge l'archive départementale de la BD Charm-50 du BRGM. Ces
deux-là sont facultatifs — le profil de houppier générique et l'absence de couche géologique
sont des issues normales, pas des échecs.

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

### Le menu, pour ne pas retenir tout cela

```powershell
.\.venv\Scripts\python.exe poc.py scenes
```

`scenes` dresse l'état de chaque configuration versionnée et enchaîne ce qu'il faut :

```text
  n°  Scène                                      État
  ────────────────────────────────────────────────────────────────────────────
   1  Chaos de Nîmes-le-Vieux · 500 m            à jour — assemblée le 02/08/2026 à 06h51
   2  Notre-Dame-de-la-Rouvière · 200 m          configuration plus récente — à réassembler
   3  Valleraugue · 100 m                        jamais assemblée
   4  Balcon du Vertige · 500 m                  aucune exécution Roofer — voir docs/lidar-roofer.md

  a  assembler les 2 scène(s) à reprendre
  s  ouvrir le visualiseur
  q  quitter
```

Quatre états, quatre suites différentes : réassembler, assembler pour la première fois, ou
commencer par l'étage ② sous Docker. Choisir un numéro propose l'assemblage seul (`glb`, deux
à six minutes) ou le pipeline natif complet ; `a` reprend d'un coup toutes celles qui le
demandent, puis met le visualiseur à jour **une seule fois**. La scène par défaut du sélecteur
reste celle du `--config`, quelle que soit la scène assemblée.

**« Configuration plus récente » est l'état qui vaut son existence au menu.** Le calage de
l'orthophotographie et la position solaire sont *cuits* dans la scène au moment de `glb` — le
premier dans les coordonnées de texture du GLB, la seconde dans `scene.json`. Retoucher un
`.conf` ne change donc rien tant que l'assemblage n'a pas été rejoué, et rien ne le signalait :
`poc.py web` le dit maintenant aussi, pour ceux qui lancent les commandes directement.

Un dépôt fraîchement cloné date tous ses fichiers du jour : les scènes y paraîtront à
reprendre. L'avertissement invite à réassembler, ce qui est sans risque — il ne supprime jamais
rien.

`check` vérifie Python, les quatre dépendances et la présence des deux entrées Roofer. `all`
enchaîne, sur la dernière exécution complète du `OUTPUT_DIR` :

| Étape | Entrées | Sorties | Ce qui peut échouer |
| --- | --- | --- | --- |
| `validate` | `lidar_subset.laz`, `roofer_output/` | `poc-validation.md` | nuage plus court que l'emprise du terrain |
| `terrain` | points LiDAR de classe 2 ; classes 3/4/5/6 pour le MNS | `terrain.tif/.npy`, `canopy.npy/.tif`, `understory.npy/.tif`, `surface.npy`, `water.npy`, `bridge.npy` | taux de mailles mesurées faible sous couvert boisé |
| `vegetation` | classe LiDAR 5, WFS BD Forêt V2 facultatif | `trees.json` | repli générique si le WFS est indisponible |
| `ortho` | WMS Géoplateforme | `orthophoto.jpg`, `orthophoto.json` | service indisponible, emprise hors couverture |
| `geology` | archive BD Charm-50 du département, en cache dans `.work/geology/` | `render/geology.png`, `geology-pick.png`, `geology.json` | `GEOLOGY_DEPARTMENT` vide ou faux, InfoTerre indisponible, département non harmonisé : la scène se charge sans la couche |
| `glb` | tout ce qui précède | `render/scene.glb`, `scene.json`, `buildings.json` | toiture dégradée sans emprise : conservation signalée de la géométrie Roofer |
| `source` | `lidar_subset.laz`, `terrain.npy`, `surface.npy` et `orthophoto.jpg` facultatifs, `render/scene.json` pour le calage | `render/source-points.glb`, `source-points.json` | plafond inférieur au nombre de classes présentes |
| `web` | `render/` de toutes les emprises | `web/` complet | — |

Le nuage témoin est plafonné par `SOURCE_POINT_LIMIT` (750 000 par défaut) et décimé par
`SOURCE_POINT_VOXEL_M` (0,4 m) : un point est retenu par voxel, le premier du fichier, jamais
un barycentre — le nuage reste une sélection de mesures réelles. La grille s’élargit d’un
facteur ∛2 tant que le plafond n’est pas tenu, ce qui rend le réglage transposable d’une
emprise à l’autre sans retouche. Les classes rares sont réinjectées jusqu’à un plancher, lui
même plié au budget : aucune classe présente ne disparaît, comme avec l’échantillonnage
stratifié que `SOURCE_POINT_VOXEL_M=0` rétablit.

Sur l’emprise 200 m, 1 923 514 points deviennent 744 933 — le budget à cinq mille points près
— mais avec une densité étale en volume : coefficient de variation par mètre cube **0,66
contre 0,80** pour l’échantillonnage pris dans l’ordre du fichier, et 17 points au lieu de 22
dans le mètre cube le plus chargé. C’est ce qui fait qu’une façade se lit comme une surface.

`SOURCE_POINT_COLOR` choisit ce qui est **cuit** dans `COLOR_0` : `ortho` échantillonne
l’orthophotographie recalée — la pratique que décrit l’IGN pour l’exploitation architecturale
du LiDAR HD — et `classification` garde la palette par classe. Le calage se relit dans
`render/scene.json`, écrit par `glb` juste avant, pour que le nuage et le modèle portent la
même translation. Sans photographie disponible, le repli sur les classes est automatique et
la fiche JSON l’annonce sous `bakedColorMode`.

L’occlusion ambiante y est cuite comme sur le terrain et le bâti : le nuage était le seul
objet de la scène à ne pas la recevoir. Elle est à la fois multipliée dans `COLOR_0`, pour
tout moteur glTF, et transportée dans l’attribut applicatif `_LIDAR` — quatre canaux
`uint8` portant classification, réflectance cadrée sur ses centiles, occlusion et une
réserve. C’est de là que le visualiseur tire ses quatre modes de couleur et son filtre par
classe, sans rien réassembler.

La fiche JSON conserve les effectifs complets et affichés, le pas de voxel employé,
l’espacement moyen, les dimensions LAS, les URL COPC amont et le SHA-256 du LAZ.
`SOURCE_POINTS=0` désactive cette représentation sans toucher au modèle.

La validation est bloquante et c'est voulu : `create_terrain` comble les cellules vides par
propagation de la moyenne des voisines. Une bande non couverte recevrait un relief lisse,
plausible et **inventé**, sans végétation ni eau, et sans le moindre message. Un déficit se
corrige en relançant l'étage ② avec un `--buffer` plus large — jamais en réduisant
`TERRAIN_MARGIN_M`, qui existe pour porter les bâtiments de bordure.

### Département géologique, à renseigner une fois par site

`poc.py scene` écrit `GEOLOGY_DEPARTMENT=""` : le numéro ne se déduit pas d'un point
Lambert-93 sans table de correspondance, et un mauvais département draperait la géologie
d'une autre région sans que rien ne le signale. Le renseigner sur trois chiffres — `030`
pour le Gard, `048` pour la Lozère, `2A` et `2B` pour la Corse — puis :

```powershell
.\.venv\Scripts\python.exe poc.py --config config\<id>.conf geology
```

Une scène dont le département reste vide se produit normalement, sans la couche : la bascule
« Carte géologique BRGM » du visualiseur est alors désactivée, avec son explication. Les
couleurs sont celles de la carte imprimée, lues dans les champs de quadrichromie du DBF ; une
formation sans fond imprimé — distinguée sur la carte par une surcharge que le drapage ne
saurait pas rendre — reçoit une teinte dérivée de son code, ce que `geology.json` signale en
passant sa clé `palette` de `brgm` à `mixte`.

### Calibration solaire, à faire une fois par site

```powershell
.\.venv\Scripts\python.exe poc.py --config config\notre-dame-rouviere-200m.conf sun
```

La commande retrouve l'azimut et la hauteur du soleil sur les ombres de l'orthophotographie,
et mesure le décalage résiduel de l'image sur les emprises bâties. Reporter les quatre
valeurs dans le `.conf` en décommentant `ORTHO_SUN_*` et `ORTHO_OFFSET_*` seulement si l'on
veut les figer ; sinon `glb` refait la mesure à chaque assemblage.

Elle écrit aussi `ortho-registration.png` dans le dossier d'exécution : les emprises bâties
posées sur l'orthophotographie, sans calage en vert et avec le calage retenu en bleu. C'est le
seul contrôle qui tranche, et il se lit en quelques secondes.

### Les deux mesures se refusent quand elles n'ont pas de prise

Aucune des deux ne vaut partout, et **une mesure fausse ne se distingue pas d'une mesure juste
à sa seule allure** — c'est pourquoi chacune est refusée dès que ses conditions ne sont pas
réunies. La scène se produit dans tous les cas.

| Mesure | Ce qu'elle suppose | Ce qu'elle fait sinon |
| --- | --- | --- |
| Calage | des toitures plus rouges que leur environnement, sur au moins 1 % de l'image | l'orthophotographie est drapée telle quelle |
| Soleil | une direction d'ombre du bâti que celle des houppiers confirme à 30° près | le visualiseur laisse le soleil librement réglable |

Le calage cherche la translation qui amène les emprises sur les toitures les plus rouges. Sur
un causse — toits de tôle et de fibrociment gris posés sur un sol ocre — le contraste s'inverse,
et maximiser le rouge chasse le masque *hors* du bâti, jusqu'à la borne du domaine de recherche.
La scène « Chaos de Nîmes-le-Vieux » y gagnait une dizaine de mètres d'écart entre la photo et
les volumes, appliqués sans réserve au terrain comme aux toitures. Le contraste mesuré sous les
emprises sépare franchement les deux situations : de +16,9 à +24,3 là où le recalage converge,
−13,8 et −6,0 là où il s'échappait.

L'azimut solaire souffre du même mal là où le bâti est maigre, sans que rien ne le trahisse :
au Col de Perjuret, cinq bâtiments donnent le creux d'ombre le plus marqué de toutes les scènes
du POC. Seule une seconde source tranche, d'où le recoupement sur les ombres des houppiers —
qui confirme justement Perjuret, et dément Nîmes-le-Vieux de 60°.

Un site refusé n'est pas un site perdu : la vignette dit si l'absence de calage suffit — c'est
le cas des deux scènes ci-dessus — et sinon l'écart s'y mesure à l'œil, pour être inscrit dans
`ORTHO_OFFSET_EAST` et `ORTHO_OFFSET_NORTH`. Une valeur renseignée court-circuite la mesure,
`0` compris.

### Caler l'orthophotographie à la main, dans le visualiseur

La section « Textures » du panneau porte deux glissières, **est** et **nord**, qui déplacent la
photographie sur le terrain et sur les toitures à la fois. C'est la manière la plus rapide de
trouver le calage d'un site que la mesure refuse : on pousse jusqu'à ce que les toits de la photo
rejoignent les volumes, puis « Copier le calage pour la configuration » rend les deux lignes à
coller dans le `.conf` **et** dans son `.example`.

```text
ORTHO_OFFSET_EAST=-1.20
ORTHO_OFFSET_NORTH=2.40
```

Relancer ensuite `glb` sur la configuration : le calage entre alors dans les coordonnées de
texture de la scène, et n'a plus à être repris à chaque ouverture. Le curseur exprime un écart à
ce qui est déjà appliqué ; le bouton, lui, rend le total, mesure cuite comprise.

Le réglage retombe à zéro d'une scène à l'autre, à dessein : un calage vaut pour une
orthophotographie, pas pour un visualiseur.

La section « Éclairage » porte le même bouton pour le soleil. Décocher « Caler le soleil sur la
mesure de l'orthophoto » libère la hauteur et l'azimut ; une fois les ombres calculées posées sur
celles de la photographie, « Copier le soleil pour la configuration » rend les deux lignes
correspondantes. L'azimut du visualiseur est déjà géographique — 0° au nord, croissant vers
l'est — soit la convention du `.conf` : aucune conversion ne s'interpose.

```text
ORTHO_SUN_AZIMUTH_DEG=285.0
ORTHO_SUN_ELEVATION_DEG=13.4
```

Le bouton sert aussi à **figer une mesure jugée bonne** : renseignées, ces deux valeurs
court-circuitent la mesure, que `glb` refait sinon à chaque assemblage.

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
- **Le département géologique**, à demander à la saisie. `plan_scene` ne le calcule pas — il
  n'y a pas de table commune → département dans le POC — et le gabarit écrit donc
  `GEOLOGY_DEPARTMENT=""`. Une interface qui connaît la commune, elle, le connaît : c'est le
  seul réglage du gabarit qu'elle a intérêt à faire remplir plutôt qu'à laisser retoucher
  après coup. Laissé vide, tout fonctionne, sans la carte géologique.

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
| `GEOLOGY_DEPARTMENT n'est pas renseigné` | scène créée par `poc.py scene`, département jamais rempli | l'inscrire sur trois chiffres dans le `.conf` **et** son `.example`, puis relancer `geology` |
| `Aucune formation géologique sur l'emprise` | mauvais département | vérifier lequel couvre le centre de la scène ; l'archive est bien lue, mais ailleurs |
| `projection inattendue, emprise … hors du Lambert-93` | archive corrompue ou format changé | vider `.work/geology/` pour forcer un nouveau téléchargement |
| `AVERTISSEMENT : couche géologique indisponible` | InfoTerre hors service, hors ligne, département non harmonisé | aucune action : la scène est complète, sans la carte. Relancer `geology` plus tard suffit à l'ajouter |
| La bascule « Carte géologique BRGM » est grisée | la scène chargée n'a pas les trois artefacts | lancer `geology` sur sa configuration, puis `web` |
| `AVERTISSEMENT : calage de l'orthophotographie non mesuré` | toitures indiscernables de leur environnement, ou emprises trop peu étendues | aucune action : la photo est drapée telle quelle. Ouvrir `ortho-registration.png` ; si les contours suivent les bâtiments, c'est le bon calage |
| Les toitures 3D portent une couleur uniforme, les bâtiments de la photo sont à côté | version antérieure aux garde-fous : un calage faux de plusieurs mètres avait été mesuré et appliqué | relancer `glb`, puis `web` |
| `AVERTISSEMENT : calibration solaire non concluante` | ombres du bâti et des houppiers contradictoires, ou azimut hors de ce qu'une prise de vue peut porter | aucune action : le soleil reste réglable dans le visualiseur. Le figer avec `ORTHO_SUN_AZIMUTH_DEG` et `ORTHO_SUN_ELEVATION_DEG` si la date de prise de vue est connue |
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
