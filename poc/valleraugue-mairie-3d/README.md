# POC Python Windows — mairie de Valleraugue en 3D

Ce POC enrichit une sortie Roofer existante : il génère un terrain depuis le
LiDAR HD, télécharge l’orthophotographie IGN, assemble une scène GLB avec des
matériaux simples et prépare un visualiseur web local.

Toute la chaîne décrite ici s’exécute nativement avec Python sous Windows.
Docker, WSL, PDAL, GDAL et un logiciel SIG ne sont pas requis. La reconstruction
Roofer est une étape amont distincte ; le POC utilise ses deux entrées déjà
présentes dans un dossier `run-*` :

- `lidar_subset.laz` ;
- `roofer_output/*.city.jsonl`.

## Emprise

- centre : mairie de Val-d’Aigoual, bureau de Valleraugue ;
- adresse : 1 place Francis Cavalier-Bénézet, 30570 Val-d’Aigoual ;
- emprise par défaut : 200 × 200 m, soit 40 000 m² ;
- bbox Lambert-93 : `751256 6331451 751456 6331651` ;

La configuration historique 100 × 100 m reste disponible dans
`config/poc.conf.example`.

## Prérequis

- Python 3.11 ou supérieur pour Windows ;
- accès réseau à la Géoplateforme IGN et au CDN utilisé pour mettre Three.js en
  cache dans le visualiseur.

## Démarrage rapide

Depuis PowerShell :

```powershell
cd C:\DEV_ALX\OpenDataVdA\poc\valleraugue-mairie-3d

Copy-Item config\poc-200m.conf.example config\poc-200m.conf -ErrorAction SilentlyContinue

py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

.\.venv\Scripts\python.exe poc.py check
.\.venv\Scripts\python.exe poc.py all
.\.venv\Scripts\python.exe poc.py serve
```

`all` sélectionne la dernière sortie Roofer complète, la valide, puis produit
le terrain, l’orthophoto, le GLB et le visualiseur. Il ne relance ni
l’acquisition LiDAR ni Roofer.

## Commandes

| Commande | Effet |
| --- | --- |
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
│   └── buildings.json
└── vendor/
```

Le fichier principal pour un rendu web est `render/scene.glb`. Il contient :

- le terrain issu des points LiDAR classés comme sol, fermé par une jupe de bord ;
- l’orthophotographie IGN appliquée au terrain ;
- les bâtiments LoD2.2, **un nœud par bâtiment** nommé par son `cleabs` BD TOPO et
  regroupé sous un nœud parent `Batiments` ;
- des toitures **texturées depuis l’orthophotographie** (≈ 11 cm/pixel), recalée, et des murs
  en coordonnées de texture métriques prêts pour un matériau tuilé en aval ;
- une palette de tons clairs pour les murs, attribuée de façon stable à chaque bâtiment ;
- les **proxys de végétation haute** sous un nœud `Vegetation` ;
- l’**occlusion ambiante cuite** en `COLOR_0` sur le terrain, le bâti et la végétation.

## Terrain à 0,5 m

`TERRAIN_RESOLUTION_M` vaut désormais `0.5`, soit 211 600 cellules sur l’emprise 200 m et
3 points sol par cellule. La mesure sur le run 200 m ne fait baisser l’écart-type du résidu
que de 20 % — mais le **95ᵉ centile chute de 48 %** (0,365 m → 0,188 m). Le gain est donc
concentré sur les ruptures de pente : terrasses cévenoles et murs de soutènement, jusque-là
lissés. La maille de 0,25 m n’est pas soutenue par la donnée (0,8 point par cellule) : on y
interpolerait du vide.

Coût : `scene.glb` passe d’environ 6 à 20 Mo, sans conséquence en service local.

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

Réglages : `VEGETATION`, `VEGETATION_MIN_HEIGHT_M`, `VEGETATION_PEAK_WINDOW_M`,
`VEGETATION_MAX_CROWN_M`.

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

Le visualiseur propose deux modes :

- **diagnostic** (défaut) — fond clair neutre, brouillard quasi nul, lumière non interprétée.
  Fait pour repérer les défauts de contact entre terrain et bâtiments, pas pour être beau ;
- **rendu réaliste** — ciel physique (modèle de Preetham) servant à la fois de fond et
  d’éclairement ambiant, occlusion ambiante GTAO, tone mapping ACES, soleil calé par défaut
  sur `orthoSun`. S’écarter de ce calage est signalé dans le panneau.

Le mode diagnostic rend en direct ; le mode réaliste passe par une chaîne de post-traitement
(`EffectComposer`). Les dépendances Three.js correspondantes sont téléchargées et servies
localement par `poc.py web`, sans appel à un CDN à l’exécution.

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

Les tests couvrent la configuration, le choix de la dernière exécution, la
validation des artefacts, la séparation murs/toitures, l’écriture du conteneur
GLB, la détection des cimes, le facteur de vue du ciel et le relevé des toitures
dégradées.

## Données et composants externes

- entrées Roofer existantes : CityJSONSeq LoD2.2 et sous-ensemble LiDAR LAZ ;
- LiDAR HD et BD TOPO : Géoplateforme IGN ;
- orthophotographie : WMS raster IGN, couche
  `ORTHOIMAGERY.ORTHOPHOTOS` ;
- visualisation : Three.js mis en cache localement lors de `python poc.py web`.
