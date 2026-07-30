# POC Python Windows — maquettes 3D de Val-d’Aigoual

Ce POC enrichit une sortie Roofer existante : il génère un terrain depuis le
LiDAR HD, télécharge l’orthophotographie IGN, assemble une scène GLB avec des
matériaux simples et prépare un visualiseur web local.

Une scène se décrit désormais par **un point sur une carte et un côté en mètres** :
`poc.py scene` en déduit l’emprise Lambert-93, la maille, les dalles LiDAR à mettre en
cache et la commande de l’étape amont. Le pipeline complet et le contrat destiné à une
future interface de construction sont dans
[`docs/construire-une-scene.md`](docs/construire-une-scene.md).

Toute la chaîne décrite ici s’exécute nativement avec Python sous Windows.
Docker, WSL, PDAL, GDAL et un logiciel SIG ne sont pas requis. La reconstruction
Roofer est une étape amont distincte ; le POC utilise ses deux entrées déjà
présentes dans un dossier `run-*` :

- `lidar_subset.laz` ;
- `roofer_output/*.city.jsonl`.

## Scènes disponibles

L’emprise par défaut est celle de `config/poc-200m.conf` : 200 × 200 m, soit 40 000 m²,
centrés sur la mairie de Val-d’Aigoual — bureau de Valleraugue, 1 place Francis
Cavalier-Bénézet, 30570 Val-d’Aigoual.

| Configuration | Titre | Centre WGS84 | Emprise | Maille | Cellules | Dalles LiDAR |
| --- | --- | --- | --- | --- | --- | --- |
| `config/poc.conf` | Valleraugue | 44,081089 / 3,641219 | 100 × 100 m | 0,5 m | 68 000 | 1 |
| `config/poc-200m.conf` | Valleraugue | 44,081089 / 3,641219 | 200 × 200 m | 0,5 m | 212 000 | 1 |
| `config/poc-600m.conf` | Valleraugue | 44,081089 / 3,641219 | 600 × 600 m | 1,0 m | 397 000 | 1 |
| `config/notre-dame-rouviere-200m.conf` | Notre-Dame-de-la-Rouvière | 44,048776 / 3,700904 | 200 × 200 m | 0,5 m | 212 000 | 2 |
| `config/creyssensac-et-pissot-200m.conf` | Creyssensac-et-Pissot | 45,085021 / 0,658064 | 200 × 200 m | 0,5 m | 212 000 | 1 |

Chaque `.conf` porte l’identité de sa scène — `SCENE_TITLE`, `SCENE_SUBTITLE`,
`SCENE_CENTRE_LABEL` et `SCENE_CENTRE_WGS84` — qui alimente l’en-tête du visualiseur, son
onglet et le sélecteur. Sans titre, une scène n’y apparaît que par sa taille.

Creyssensac-et-Pissot est en Dordogne, hors du territoire de Val-d’Aigoual : elle vérifie que
la chaîne ne dépend d’aucune particularité du site d’origine, à commencer par le relief
cévenol et la dalle LiDAR unique.

### Ajouter une scène

```powershell
.\.venv\Scripts\python.exe poc.py scene `
  --lat 44.048777 --lon 3.700903 --side 200 `
  --title "Notre-Dame-de-la-Rouvière" `
  --subtitle "Val-d'Aigoual · IGN LiDAR HD" `
  --centre-label "Place Auguste Vidal" `
  --id notre-dame-rouviere-200m --write
```

Sans `--write`, la commande affiche le plan et n’écrit rien : emprise Lambert-93, maille,
taille de l’orthophotographie, dalles LiDAR à mettre en cache, volume estimé et commande de
l’étape amont. `--json` rend le même plan en JSON. La procédure complète, les valeurs par
défaut et les modes d’échec sont dans
[`docs/construire-une-scene.md`](docs/construire-une-scene.md).

## Emprises carrées

Toutes les emprises sont carrées, et c'est une contrainte de la chaîne, pas une préférence.

La requête WMS est carrée, et toute la calibration de `poc.py sun` l'est aussi : le masque
bâti est rastérisé avec une résolution unique, déduite de la seule largeur. Sur une bbox
rectangulaire, ses lignes couvriraient la même distance que ses colonnes — le masque
déborderait de tout le rapport d'aspect et le recalage rendrait un chiffre plausible et faux,
**sans rien signaler**. `require_square_extent` refuse donc la mesure et indique quoi
renseigner à la place.

Sur une emprise carrée, les pixels de l'orthophotographie sont carrés, la résolution est
homogène, et le calage comme la position solaire se mesurent au lieu d'être recopiés.

Le **rendu** ne serait pas affecté par une emprise rectangulaire : les coordonnées de texture
sont normalisées sur la bbox et compenseraient exactement l'anamorphose de l'image. C'est la
seule mesure qui achoppe. Rendre la calibration anisotrope demanderait de reprendre
`footprint_mask`, `_shift` et les deux fonctions de mesure ; le jeu n'en vaut pas la chandelle
tant qu'une emprise carrée couvre le sujet.

## Emprise 600 m

Elle couvre le village dans sa longueur le long de l'Hérault, et les deux versants qui
l'encadrent — neuf fois la surface de l'emprise 200 m.

Sa maille est à **1 m** et non 0,5 : à 0,5 m elle demanderait 1,59 million de cellules, sept
fois et demie l'emprise 200 m, pour environ 170 Mo de `scene.glb`. À 1 m il en reste 397 000,
moins du double de l'emprise 200 m, et la donnée porte encore **11 points sol par cellule** au
centre du village. On n'y perd que les ruptures de pente — terrasses et murs de soutènement —
qui ne se lisent plus à cette distance de vue. La densité baisse sous couvert boisé : à
surveiller sur les versants.

L'orthophotographie passe à 4096 px, soit 15 cm/pixel contre 11 sur l'emprise 200 m. Monter
plus haut se heurterait aux limites de la Géoplateforme.

### Ce que le run 630 m a donné

| Mesure | Emprise 200 m | Emprise 600 m |
| --- | --- | --- |
| Terrain | 460 × 460 à 0,5 m | **630 × 630 à 1 m** |
| Cellules portant une mesure de sol | 50,5 % | **72,8 %** |
| Dénivelé | 57 m | **166 m** |
| Bâtiments reconstruits | 176 | **490** (482 dans la scène) |
| Toitures dégradées | 8,5 % | **9,0 %** |
| Emprise sous canopée | 27 % | **63 %** |
| Arbres | 358 | **4 371** (médiane 10,1 m) |
| `scene.glb` | 20 Mo | **57 Mo** |

La maille métrique est **mieux remplie** que la demi-maille de l'emprise 200 m : 72,8 % de
cellules mesurées contre 50,5 %. Le pari de la section précédente tient donc, y compris sous
les 63 % de couvert boisé.

Deux mesures se dégradent en revanche avec l'échelle, et c'est attendu. Le plan d'eau unique
laisse un résidu de **0,66 m** contre 0,14 m sur 200 m : sur 630 m de cours, l'Hérault n'est
plus un plan. Et la hauteur maximale de canopée annoncée, **44,4 m**, demande un œil dans le
visualiseur : sur un versant raide dont le sol est interpolé, une cime rapportée à ce sol se
surestime facilement.

Le calage de l'orthophotographie, lui, se confirme à neuf fois la surface : **2,92 m vers le
sud** mesurés sur 484 emprises, contre 2,58 m sur 178. Ce n'est donc pas un artefact local.

Cette emprise a révélé un défaut de l'étape amont : celle-ci dimensionnait son extraction LiDAR
sur l'**étendue du bâti**, sans jamais regarder l'emprise demandée. Sur 200 m, le nuage couvrait
le terrain avec 0,8 m de marge — par chance. Sur 600 m, dont les bords sont des versants
boisés sans bâtiment, il serait resté des dizaines de mètres trop court, et le terrain aurait
comblé la bande par interpolation : un relief lisse, plausible et inventé, sans végétation ni
eau, et sans le moindre message. Le correctif et le contrôle qui l'accompagne sont décrits dans
[`docs/lidar-roofer.md`](docs/lidar-roofer.md).

## Prérequis

- Python 3.11 ou supérieur pour Windows ;
- accès réseau à la Géoplateforme IGN et au CDN utilisé pour mettre Three.js en
  cache dans le visualiseur ;
- une exécution Roofer déjà présente dans `output*/run-*`. La produire relève de l’étape amont,
  décrite dans [`docs/lidar-roofer.md`](docs/lidar-roofer.md) : c’est la seule partie de la
  chaîne qui demande Docker, et `poc.py validate` vérifie désormais que son nuage couvre bien
  l’emprise du terrain.

## Démarrage rapide

Depuis PowerShell :

```powershell
cd C:\DEV_ALX\OpenDataVdA\poc\valleraugue-mairie-3d

py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

.\.venv\Scripts\python.exe poc.py check
.\.venv\Scripts\python.exe poc.py all
.\.venv\Scripts\python.exe poc.py serve
```

Aucune copie de configuration n’est nécessaire : `config/poc-200m.conf` est
versionné et prêt à l’emploi.

`all` sélectionne la dernière sortie Roofer complète, la valide, puis produit
le terrain, l’orthophoto, le GLB et le visualiseur. Il ne relance ni
l’acquisition LiDAR ni Roofer.

## Commandes

| Commande | Effet |
| --- | --- |
| `python poc.py scene` | décrit une nouvelle emprise depuis un point WGS84 et écrit sa configuration |
| `python poc.py check` | vérifie Python, les modules et les données d’entrée |
| `python poc.py validate` | valide les artefacts de la dernière exécution |
| `python poc.py terrain` | produit le terrain depuis le LiDAR sol avec `laspy` et NumPy |
| `python poc.py ortho` | télécharge `orthophoto.jpg` depuis le WMS IGN |
| `python poc.py vegetation` | détecte les cimes de la classe LiDAR 5 et écrit `trees.json` |
| `python poc.py sun` | retrouve la position solaire de l’orthophoto par ses ombres |
| `python poc.py glb` | assemble `render/scene.glb` |
| `python poc.py web` | prépare le visualiseur et met Three.js en cache |
| `python poc.py enhance` | enchaîne validation, terrain, ortho, GLB et web |
| `python poc.py all` | vérifie l’environnement puis exécute `enhance` |
| `python poc.py serve` | ouvre le visualiseur sur `http://127.0.0.1:8000` |

Une autre configuration peut être sélectionnée :

```powershell
python poc.py --config config/poc.conf enhance
```

## Sorties enrichies

Dans la dernière exécution `output-200m/run-*` :

```text
terrain.tif
terrain.tfw
terrain.prj
terrain.npy
canopy.npy
surface.npy
water.npy
bridge.npy
trees.json
orthophoto.jpg
orthophoto.json
render/
├── scene.glb
├── scene.json
└── buildings.json
web/
├── index.html
├── app.js
├── styles.css
├── assets/
│   ├── scene.glb
│   ├── scene.json
│   ├── buildings.json
│   ├── scenes.json
│   └── scenes/
│       └── <autre emprise>/
└── vendor/
```

Le fichier principal pour un rendu web est `render/scene.glb`. Il contient :

- le terrain issu des points LiDAR classés comme sol, fermé par une **tranche** en matériau
  minéral distinct, qui descend d’une profondeur constante sous le bord qu’elle longe ;
- l’orthophotographie IGN appliquée au terrain ;
- les bâtiments LoD2.2, **un nœud par bâtiment** nommé par son `cleabs` BD TOPO et
  regroupé sous un nœud parent `Batiments` ;
- des toitures **texturées depuis l’orthophotographie** (≈ 11 cm/pixel), recalée, et des murs
  en coordonnées de texture métriques prêts pour un matériau tuilé en aval ;
- une palette de tons clairs pour les murs, attribuée de façon stable à chaque bâtiment.
  Les teintes sont **écrites en sRGB et converties en linéaire** à l’écriture du GLB :
  `baseColorFactor` étant interprété en espace linéaire, y porter directement la valeur lue
  dans un sélecteur de couleur éclaircissait tout d’un cran — un mur choisi à 0,86 s’affichait
  à 239/255, d’où l’ancien aspect de maquette en polystyrène ;
- les **proxys de végétation haute** sous un nœud `Vegetation`, teintés arbre par arbre ;
- la **nappe d’eau** sous un nœud `Eau` et les **tabliers de pont** sous un nœud `Ponts`,
  reconstruits depuis les classes LiDAR 9 et 17 ;
- l’**occlusion ambiante cuite** en `COLOR_0` sur le terrain, le bâti et la végétation.

## Terrain à 0,5 m

`TERRAIN_RESOLUTION_M` vaut désormais `0.5`, soit 211 600 cellules sur l’emprise 200 m et
3 points sol par cellule. La mesure sur le run 200 m ne fait baisser l’écart-type du résidu
que de 20 % — mais le **95ᵉ centile chute de 48 %** (0,365 m → 0,188 m). Le gain est donc
concentré sur les ruptures de pente : terrasses cévenoles et murs de soutènement, jusque-là
lissés. La maille de 0,25 m n’est pas soutenue par la donnée (0,8 point par cellule) : on y
interpolerait du vide.

Coût : `scene.glb` passe d’environ 6 à 20 Mo, sans conséquence en service local.

## Tranche du terrain

La nappe est fermée sur son contour, faute de quoi elle se lit comme une dalle découpée dès
que la caméra approche de l’horizon. Deux points comptent ici.

La tranche descend d’une profondeur **constante sous le bord qu’elle longe**, et non jusqu’à
une altitude commune. Un fond unique paraît anodin sur un site plat ; sur les 57 m de
dénivelé de l’emprise, il creusait au bord amont une falaise de près de 70 m — plus haute que
tout le bâti réuni, et occupant le quart de l’image.

Elle porte un matériau propre, `Tranche`, en teinte minérale unie. Lui appliquer
l’orthophotographie revenait à reprendre les coordonnées de texture du bord : le sampler
étant en `CLAMP_TO_EDGE`, le dernier pixel de l’image s’étirait vers le bas en traînées
verticales. Une coupe n’a pas de photographie aérienne à porter.

Réglage : `TERRAIN_EDGE_SKIRT_M` (6 m par défaut).

## Végétation haute

27 % de l’emprise est sous couvert boisé (617 984 points LiDAR de classe 5) et n’existait pas
en 3D : les arbres n’étaient que de la peinture plate sur le terrain, ce qui trahit le rendu
plus sûrement que n’importe quel défaut de toiture.

`poc.py vegetation` construit un modèle de hauteur de canopée (maximum de la classe 5 moins
le MNT), retient une cime par maximum local, mesure le rayon de couronne par retombée du
profil radial, puis écrit `trees.json`. Le GLB en tire un proxy par arbre : houppier
icosaédrique et fût à section carrée, en quatre teintes de feuillage attribuées de façon
stable. Sur le run 200 m : **358 arbres**, hauteur médiane 8,0 m, maximum 29,8 m.

L’approche est délibérément grossière — pas de segmentation individuelle, pas d’essence, pas
de panneau orienté caméra. À 200 m, l’enjeu est la présence, pas le réalisme botanique.

Une limite subsiste, assumée : l’orthophotographie sert de couleur de base au terrain et
**contient déjà les arbres, peints à plat**. Chaque proxy se pose donc sur sa propre image.
Effacer la canopée peinte demanderait de repeindre le terrain sous couvert, hors du prix d’un
POC ; le plafond de couronne est en revanche assez large (8 m) pour que le houppier recouvre
la tache qui lui correspond.

**Chaque houppier prend la couleur réelle de son arbre**, moyennée dans l’orthophotographie
sous sa couronne : châtaigniers, chênes verts et résineux ne se ressemblent pas, et une
palette de quatre teintes fixes se lisait comme un damier. La couleur voyage dans `COLOR_0`,
canal déjà écrit pour l’occlusion ambiante — elle ne coûte donc **aucun octet** et remplace
les quatre matériaux de feuillage par un seul.

Deux précautions accompagnent cet échantillonnage. L’orthophotographie porte les ombres de la
prise de vue : la teinte est ramenée à une luminance constante, sinon un arbre photographié à
l’ombre ressortirait noir alors que l’éclairement de la scène est déjà calculé par ailleurs.
Et elle est mélangée à un tiers de vert de référence, pour qu’une cime mal détectée tombée sur
une toiture ne produise pas un arbre orange.

Enfin, chaque houppier reçoit une rotation et une ovalité de ±15 %, tirées de façon stable de
sa position. Aucune prétention botanique : il s’agit de rompre la répétition d’un solide
identique recopié 358 fois, que l’œil repère immédiatement sur un couvert dense.

Cela cassait la répétition d’un arbre au suivant, mais pas la régularité de **chacun** : un
icosaèdre de vingt faces reste une boule à facettes dès qu’on l’approche. Le rayon de chaque
sommet est donc tiré autour de sa valeur nominale, toujours de façon stable pour un arbre
donné. Le relief ne porte que sur le rayon horizontal : étirer aussi la verticale déplacerait
la cime, alors qu’elle est le seul chiffre que le proxy restitue. Aucun triangle ni octet de
plus, et `VEGETATION_CROWN_IRREGULARITY=0` rétablit à l’identique la géométrie régulière.

Le houppier reste **facetté**, comme tout le reste du GLB, et c’est un choix de recette. Le
lissage a été essayé — normales radiales depuis le centre du houppier — puis écarté : un solide
de douze sommets dont l’intérieur se prétend rond mais dont la silhouette reste anguleuse se lit
comme une bulle. Vingt faces éclairées distinctement se lisent au contraire comme une
représentation, au même titre que les volumes LoD2.2 du bâti. Le lissage reste disponible dans
le visualiseur, sous « Houppiers → Ombrage du feuillage », pour qui veut refaire la comparaison.

Réglages : `VEGETATION`, `VEGETATION_MIN_HEIGHT_M`, `VEGETATION_PEAK_WINDOW_M`,
`VEGETATION_MAX_CROWN_M`, `VEGETATION_TINT_FROM_ORTHO`, `VEGETATION_CROWN_IRREGULARITY`.

Sur l’emprise 600 m, où 63 % du sol est sous canopée, les proxys individuels ne suffisent
pas à rendre un couvert continu. `CANOPY_MASSIF=1` ajoute sous eux une nappe lissée, limitée
aux fenêtres dont la fraction de cellules végétalisées dépasse
`CANOPY_MASSIF_COVERAGE`. Elle est calculée directement depuis `canopy.npy` et
`terrain.npy` pendant `poc.py glb` : aucun nouvel artefact ni nouvelle lecture du LAZ.
Le défaut reste désactivé sur toutes les autres scènes.

Réglages : `CANOPY_MASSIF`, `CANOPY_MASSIF_COVERAGE`,
`CANOPY_MASSIF_SMOOTHING_M`.

## Eau et ponts

Les deux manquaient à la scène alors que la donnée était déjà là : `lidar_subset.laz`, déjà
téléchargé pour le terrain, porte **23 206 points de classe 9 (eau)** et **4 037 de classe 17
(tablier de pont)**. Ils sont extraits par `poc.py terrain`, qui lit déjà ce nuage, et écrits
en `water.npy` et `bridge.npy` sur la grille du MNT.

**L’eau tient sur un seul plan incliné.** Ce n’est pas une commodité mais une mesure :
l’ajustement aux moindres carrés sur les 243 m de cours traversant l’emprise laisse un résidu
d’écart-type de **0,14 m** pour une pente de 1,8 %. Mailler la surface au demi-mètre
décrirait du bruit. L’ajustement est repris une fois après rejet des points à plus de trois
écarts-types : le laser rebondit mal sur l’eau, et quelques reflets suffiraient à faire
basculer toute la nappe.

Seule l’emprise est rasterisée, car la rivière serpente et ne remplit pas son rectangle
englobant. Le masque est refermé par dilatation puis érosion — une classe LiDAR rasterisée est
toujours trouée, un tir sur deux ne revenant pas de l’eau.

La nappe n’est **pas** recalée sur le terrain, et c’est délibéré. Les deux s’entrecroisent :
la moitié des points d’eau passent sous le MNT interpolé, un dixième au-dessus. Cette
intersection produit gratuitement les bancs de galets émergents d’un étiage cévenol, ceux
qu’on voit en clair sur l’orthophotographie.

Elle est en revanche relevée de 20 cm au-dessus de l’altitude mesurée, faute de quoi le
raccord se lit en damier là où les deux surfaces se frôlent. `water.npy` conserve la mesure
LiDAR intacte : le relèvement s’applique au maillage, ce qui permet d’en essayer un autre avec
un simple `poc.py glb`, sans relire le nuage.

**Le tablier est plat à 0,13 m près** sur ses 10 × 20 m, et se tient 4,2 m au-dessus du lit —
le MNT passait dessous, il ne double donc aucune géométrie existante. Son altitude vient
directement des cellules, contrairement à l’eau, car la classe y est vingt fois plus dense. Il
est extrudé d’un mètre pour se voir aussi par en dessous, depuis la rivière.

Ses piles et ses garde-corps ne sont dans aucune classe LiDAR. Les inventer serait de la
fiction, pas de la donnée : le POC s’en abstient.

Réglages : `WATER`, `WATER_LIFT_M`, `BRIDGES`, `BRIDGE_THICKNESS_M`.

## Reprendre la taille des houppiers

Le rayon de couronne est mesuré par retombée du profil radial de la canopée. Ce critère
**surestime les houppiers d’un couvert continu** : entre deux arbres qui se touchent, le
profil ne retombe jamais sous le seuil, et c’est le plafond `VEGETATION_MAX_CROWN_M` qui
tranche — sur le run 200 m, il mord sur 153 des 358 arbres.

Le visualiseur permet donc de reprendre la mesure à l’œil, par trois facteurs indépendants :
largeur est-ouest, hauteur, largeur nord-sud. Chaque houppier est redimensionné **autour de
son propre centre**, sans déplacer l’arbre ; les fûts ne bougent pas. « Rétablir la mesure »
revient toujours à ce que dit la donnée.

Les houppiers étant fusionnés en une seule primitive, le GLB expose sous
`extras.crownVertices` le nombre de sommets par arbre — 60, soit les vingt faces de
l’icosaèdre. C’est ce pas qui permet au visualiseur de les segmenter ; un test vérifie qu’il
reste cohérent avec la géométrie produite.

Ces facteurs ne sont **pas** enregistrés : ils servent à trouver la bonne valeur, qu’on fige
ensuite dans `VEGETATION_MAX_CROWN_M`.

## Occlusion ambiante cuite

L’occlusion ambiante est ce qui *pose* les volumes : sans elle, une ruelle et une esplanade
reçoivent la même lumière ambiante et le bâti flotte. Elle est calculée à la génération, sur
le modèle de surface `surface.npy`, par balayage d’horizon (facteur de vue du ciel), puis
écrite en `COLOR_0`. **Tout moteur glTF la restitue** en multipliant la couleur de base, sans
passe de post-traitement, sans coût d’affichage et sans dépendance au visualiseur.

L’occlusion dépend de la hauteur autant que de la position : au sol elle vaut le facteur de
vue du ciel, et elle remonte vers le plein ciel à mesure qu’un sommet dépasse les obstacles
voisins — sinon les toitures noirciraient avec le pied des murs.

Réglages : `AMBIENT_OCCLUSION`, `OCCLUSION_AZIMUTHS`, `OCCLUSION_RADIUS_M`,
`OCCLUSION_STRENGTH` (0 n’assombrit rien, 1 assombrit au maximum).

## Qualité des toitures

Roofer étiquette lui-même ses échecs dans `rf_roof_type`, et l’information était jetée. Sur
le run 200 m : 161 `slanted`, 12 `unknown`, 2 `no planes`, 1 `no points` — soit **15 bâtiments
dégradés sur 176 (8,5 %)**, nommément identifiés.

Le décompte et la liste figurent désormais dans `poc-validation.md` et sous la clé
`roofQuality` de `render/scene.json` ; chaque nœud de bâtiment porte un booléen `rf_degraded`
dans ses `extras` et dans `render/buildings.json`. Le POC **ne cherche pas à réparer** ces
toitures : les signaler coûte une fraction du prix et ne ment pas sur la donnée.

## Calibration de l’orthophotographie

L’orthophotographie est une photographie aérienne, et deux de ses propriétés se retrouvent
dans la scène. `python poc.py sun` les mesure toutes deux sur l’image et écrit le résultat
dans `render/scene.json`.

**Elle porte les ombres de l’instant de la prise de vue.** Le terrain l’utilisant comme
couleur de base, tout éclairage calculé s’y multiplie : placer le soleil ailleurs fait
diverger les ombres du terrain de celles des bâtiments, sans remède possible. L’azimut
d’origine se retrouve en corrélant le masque des emprises bâties avec la luminance de
l’image ; la hauteur s’en déduit par voie astronomique.

**Elle n’est pas calée sur les données bâties.** Sur ce site, le recalage du masque des
emprises révèle un écart d’environ **2,6 m vers le sud**. Ce n’est pas la parallaxe d’une
orthophoto rectifiée au sol : l’écart ne croît pas avec la hauteur des bâtiments — il est même
le plus fort sur les plus bas. C’est un défaut de calage entre produits, amplifié par le
relief (57 m de dénivelé sur 200 m). L’emprise WMS demandée est bien honorée exactement, ce
qui a été vérifié en comparant deux requêtes volontairement décalées.

La correction est une translation constante, appliquée **de façon identique au terrain et aux
toitures** par une transformation unique — trois conventions d’orientation se croisent ici et
un signe divergent passerait inaperçu.

Le critère de recalage est colorimétrique (rouge moins bleu) : une zone d’ombre, sombre et
uniforme, piégerait un critère de variance ou de gradient, mais ne peut jamais maximiser la
teinte d’une tuile. La recherche porte sur toutes les emprises à la fois, le bruit de recalage
individuel atteignant plusieurs mètres.

```json
"orthoSun":    { "azimuthDeg": 95.0, "elevationDeg": 34.5, "source": "mesure des ombres" },
"orthoOffset": { "eastMetres": -0.34, "northMetres": -2.58,
                 "source": "recalage sur 178 emprises" }
```

Le visualiseur applique `orthoSun` à chaque changement de scène lorsque « Caler le soleil
sur la mesure de l’orthophoto » est coché. Les curseurs sont alors verrouillés et la source
de la valeur est affichée ; une scène sans calibration rend immédiatement la main aux
curseurs.

## Sélecteur de scènes

Le panneau porte un sélecteur de scène dès que plusieurs sont disponibles. `poc.py web`
les recense dans les configurations de `config/` : pour chacune, l'exécution la plus récente
portant un `render/scene.glb`. L'exécution préparée vient en tête, les autres sont recopiées
sous `web/assets/scenes/<configuration>/` — le serveur local ne sert que `web/`, il ne peut donc
pas atteindre le `render/` d'une autre exécution. Une emprise sans scène assemblée est
simplement absente, et avec une seule scène le sélecteur se masque.

Chaque entrée s'intitule « *titre* · *côté* m », par exemple
« Notre-Dame-de-la-Rouvière · 200 m » : le titre distingue les communes, le côté distingue
deux emprises du même lieu. Une seule dimension suffit, l'emprise étant carrée. Sans
`SCENE_TITLE`, l'entrée retombe sur « 200 × 200 m » — ce qui était le comportement avant que
plusieurs communes ne soient modélisées, et devenait indiscernable dès la deuxième.

Changer de scène change aussi le titre de la page, le surtitre de l'en-tête, l'onglet du
navigateur et l'intitulé du point de vue centré. Ces textes sont appliqués **avant** que le
GLB ne commence à se charger : la scène pèse une vingtaine de mégaoctets, et laisser le nom
de la précédente en tête pendant tout ce temps se lirait comme une erreur.

Changer d'emprise décharge la précédente — géométries, matériaux et textures — avant de charger
la suivante : sans cela, passer du 200 m au 600 m cumulerait 80 Mo de mémoire graphique. Les
réglages continus (opacité du terrain, exagération verticale, houppiers) sont réappliqués à la
scène qui arrive, tandis que les bascules de couches suivent ce que cette scène contient
réellement.

Le changement d'emprise a rendu visible un réglage jusque-là figé sur le 200 m : le frustum
d'ombre du soleil, arrêté à ±120 m, coupait les ombres aux deux tiers d'une scène de 630 m, et
la butée d'orbite à 900 m ramenait la caméra vers le sol dès qu'on demandait la vue générale.
Les deux se déduisent désormais de la scène chargée.

Le visualiseur n’a **qu’une** chaîne de rendu, en direct, sans post-traitement : fond clair
neutre, brouillard quasi nul, lumière non interprétée. Elle est faite pour repérer les défauts
de contact entre terrain et bâtiments autant que pour montrer la scène. L’environnement de
studio n’y compte que pour 0,08 : à pleine intensité il s’ajoutait à l’hémisphérique et au
directionnel, et trois sources ambiantes cumulées effaçaient les ombres portées — le bâti ne
posait plus. Le contraste vient donc du directionnel, calé sur `orthoSun`, et de l’occlusion
cuite dans le GLB.

Un second mode a existé — ciel physique de Preetham, occlusion ambiante GTAO, tone mapping
ACES, le tout derrière un `EffectComposer`. Il a été **retiré** après comparaison sur les
emprises 200 et 600 m : il comprimait le contraste sans ajouter d’information, l’orthophoto
portant déjà son propre éclairage. La courbe de rendu reste néanmoins réglable dans le panneau
(voir plus bas), ce qui permet de rejouer la comparaison sans seconde chaîne de rendu.

Les modes **Orthophoto**, **Modèle** et **Qualité** décrits plus bas ne sont pas des chaînes de
rendu : ce sont des préréglages des bascules de texture.

Les dépendances Three.js sont téléchargées et servies localement par `poc.py web`, sans appel à
un CDN à l’exécution.

### Interface du panneau

Le panneau est organisé en deux niveaux. L’analyse qui a conduit à cette organisation, ses
sources et les défauts qu’elle corrige sont dans [`docs/ux-visualiseur.md`](docs/ux-visualiseur.md).

Le **premier niveau** porte l’état du chargement, les trois mesures de la scène, les couches, les
points de vue et les deux dialogues de documentation. Ce sont les commandes dont on se sert à
chaque ouverture.

- l’état du chargement porte une **barre de progression en octets** du GLB et une pastille dont
  la couleur suit l’état — ambre pendant le chargement, vert une fois la scène prête, rouge en
  cas d’erreur. Le reste du panneau reste inactif tant que la scène n’est pas là, faute de quoi
  l’on règle ce qui va être remplacé ;
- les couches terrain, bâtiments, végétation, canopée dense, eau et ponts se masquent
  séparément, dans un accordéon replié à la demande — elles sont six et on n’y revient pas à
  chaque ouverture. Une
  couche absente de la scène chargée désactive sa bascule plutôt que de la laisser sans effet ;
- **POV** aligne sur une seule ligne, à côté de son titre, trois boutons carrés : vue générale,
  point central de la scène — dont l’intitulé vient de `SCENE_CENTRE_LABEL`, le modèle étant
  recentré sur le milieu de son emprise —, vue des toitures. Chacun déplace la caméra par
  interpolation d’environ une
  demi-seconde, interrompue dès qu’on reprend la souris — un saut instantané faisait perdre le
  repère, une animation qu’on ne peut pas interrompre est pire encore ;
- **Informations sur les données** documente sources, dates disponibles, emprise Lambert-93,
  résolutions, méthode et limites. Une date absente du flux est explicitement signalée comme
  non publiée plutôt que supposée ;
- **Navigation et raccourcis** rassemble souris, gestes tactiles, raccourcis clavier et méthode
  de contrôle d’un défaut. Ces informations tenaient auparavant dans une ligne de texte en pied
  de panneau, masquée sur écran étroit.

Le **second niveau**, replié sous « Réglages avancés », porte le mode de rendu, l’emprise, la
recherche par identifiant, les textures et le maillage, l’opacité du terrain, l’éclairage et les
houppiers. Ses sections sont indépendantes : ouvrir l’éclairage ne referme plus les textures
qu’on vient de régler. Tout l’état du panneau — réglages, sections ouvertes, emprise, panneau
masqué ou non — est conservé dans le navigateur d’une session à l’autre, ce qui évite de tout
rétablir à la main après chaque nouvelle exécution du pipeline.

- les modes **Orthophoto**, **Modèle** et **Qualité** passent respectivement de la photographie
  IGN au volume simplifié puis à une carte vert/orange/rouge de la reconstruction. Le mode de
  rendu n’est qu’un préréglage des bascules de texture — c’est ce qui le place à ce niveau : en
  reprendre une à la main affiche « textures reprises à la main », plutôt que de laisser croire
  au préréglage ;
- en mode **Qualité**, une légende donne le décompte réel des trois niveaux, et un clic sur une
  pastille **isole** ce niveau — le décompte devient une sélection ;
- la section **Éclairage** porte une **courbe de rendu** — Neutre (référence), AgX, ACES Filmic
  ou aucune —, en plus de l’exposition et du contraste d’affichage. La courbe décide de ce que
  deviennent les hautes lumières : toitures de zinc et versants au soleil. Elle se compare à
  l’écran plutôt que sur parole, et c’est ce que la seconde chaîne de rendu abandonnée
  prétendait apporter, pour quatre lignes au lieu d’un `EffectComposer`. Le préréglage
  contrasté la ramène à Neutre, faute de quoi deux postes annonçant les mêmes réglages
  n’afficheraient pas la même image ;
- le verrou solaire reprend automatiquement l’azimut et la hauteur propres à la scène
  chargée ; déplacer un curseur le libère, et le préréglage contrasté le réactive.

**Rechercher un bâtiment** accepte un `cleabs` avec autocomplétion, et « Bâtiment à contrôler
suivant » parcourt un à un ceux que Roofer signale. C’est le chemin qui manquait entre le rapport
de validation, qui nomme les bâtiments dégradés, et la scène où ils se trouvent : un bâtiment
masqué par une bascule ou par le filtre de qualité est rendu visible avant d’être cadré.

Survoler un bâtiment le souligne et change le curseur ; le sélectionner trace un contour qui
épouse son volume — une boîte englobante alignée sur les axes englobait les voisins sur un bâti
en L. Un clic affiche l’identifiant BD TOPO, la hauteur, l’emprise projetée, l’altitude au sol et
une qualité estimée à partir des indicateurs Roofer. Le lancer de rayon du survol est plafonné à
un test par image : un test par événement de souris coûterait plus que le rendu.

Les raccourcis `1`, `2` et `3` affichent respectivement le terrain seul, les bâtiments seuls et
toutes les couches — végétation, canopée dense, eau et ponts décrivent le décor et suivent donc
le même sort, puisque c’est le bâti qu’on cherche à isoler. `Échap` ferme la sélection.

`P` copie une pose caméra JSON ; `Maj+P` valide et rejoue celle du presse-papiers par la même
transition que les points de vue. « Exporter la vue en PNG » rend puis capture immédiatement
le canevas, sans conserver le tampon de dessin à chaque image.

En bas de la fenêtre, la rose des vents suit la caméra et une **barre d’échelle** donne l’ordre de
grandeur au point visé, arrondie à 1, 2 ou 5 × 10ⁿ mètres. Les deux s’écartent du panneau selon
sa taille réelle, mesurée à chaque changement : elles ne passent plus dessous.

`ORTHO_SUN_AZIMUTH_DEG` et `ORTHO_SUN_ELEVATION_DEG` forcent la position solaire si la date
de prise de vue devient connue ; `ORTHO_OFFSET_EAST` et `ORTHO_OFFSET_NORTH` forcent le
calage ; `ROOF_TEXTURE_FROM_ORTHO=0` revient aux toitures en teintes unies.

`render/buildings.json` associe chaque nom de nœud à ses attributs BD TOPO (`cleabs`,
`nature`, `usage_1`, `hauteur`…), également embarqués dans les `extras` du GLB. C’est
ce qui permet de sélectionner un bâtiment précis — la mairie, par exemple — dans un
logiciel de rendu en aval.

CityJSONSeq reste le format source sémantique. GLB est le format de diffusion
léger.

## Tests

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s test -v
```

Les tests couvrent la configuration, la projection Lambert-93 et le nommage des dalles
LiDAR, la construction d’une scène depuis un point WGS84, le choix de la dernière exécution, la
validation des artefacts, la couverture du nuage LiDAR sur l’emprise du terrain,
le recensement et le titrage des scènes du sélecteur, la séparation murs/toitures, l’écriture du conteneur
GLB, la conversion sRGB des palettes, la tranche du terrain, la détection des
cimes, la teinte et la silhouette des houppiers, l’ajustement du plan d’eau, la
fermeture des masques, le maillage des nappes, le facteur de vue du ciel et le
relevé des toitures dégradées.

## Données et composants externes

- entrées Roofer existantes : CityJSONSeq LoD2.2 et sous-ensemble LiDAR LAZ ;
- LiDAR HD et BD TOPO : Géoplateforme IGN ;
- orthophotographie : WMS raster IGN, couche
  `ORTHOIMAGERY.ORTHOPHOTOS` ;
- visualisation : Three.js mis en cache localement lors de `python poc.py web`.
