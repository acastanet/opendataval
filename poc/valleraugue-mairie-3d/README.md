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
orthophoto.jpg
orthophoto.json
render/
├── scene.glb
└── scene.json
web/
├── index.html
├── app.js
├── styles.css
├── assets/
│   ├── scene.glb
│   └── scene.json
└── vendor/
```

Le fichier principal pour un rendu web est `render/scene.glb`. Il contient :

- le terrain issu des points LiDAR classés comme sol ;
- l’orthophotographie IGN appliquée au terrain ;
- les bâtiments LoD2.2 ;
- un matériau clair pour les murs ;
- un matériau terre cuite pour les toitures.

CityJSONSeq reste le format source sémantique. GLB est le format de diffusion
léger.

## Tests

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s test -v
```

Les tests couvrent la configuration, le choix de la dernière exécution, la
validation des artefacts, la séparation murs/toitures et l’écriture du
conteneur GLB.

## Données et composants externes

- entrées Roofer existantes : CityJSONSeq LoD2.2 et sous-ensemble LiDAR LAZ ;
- LiDAR HD et BD TOPO : Géoplateforme IGN ;
- orthophotographie : WMS raster IGN, couche
  `ORTHOIMAGERY.ORTHOPHOTOS` ;
- visualisation : Three.js mis en cache localement lors de `python poc.py web`.
