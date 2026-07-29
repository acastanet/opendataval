# POC 3D Valleraugue — Consignes de travail

## Périmètre

Ce dossier est un POC Python autonome pour enrichir des sorties Roofer
existantes autour de la mairie de Valleraugue. Il produit un terrain et des
proxys de végétation à partir du LiDAR, récupère et recale une
orthophotographie IGN, convertit les bâtiments en GLB et prépare un visualiseur
web local.

La chaîne d’enrichissement doit rester native sous Windows. Ne pas introduire
Docker, WSL, PDAL, GDAL ni une dépendance à un logiciel SIG. La reconstruction
Roofer est une étape amont distincte : les entrées attendues sont
`lidar_subset.laz` et `roofer_output/*.city.jsonl` dans un dossier `run-*`.

Cette étape amont est décrite dans [`docs/lidar-roofer.md`](docs/lidar-roofer.md) :
elle tourne dans un conteneur Docker, depuis un clone du dépôt
`ignfab/roofer-with-ignf-datasets` placé sous `.work-python/`. Le clone n’étant
pas versionné, les correctifs qu’il exige vivent dans [`patches/`](patches/) et
doivent y être mis à jour avec toute modification du workflow amont — sans quoi
un nouveau clone les perd en silence.

## Structure

- `poc.py` : point d’entrée en ligne de commande ;
- `src/poc3d/` : CLI, configuration, validation, terrain, végétation, surfaces
  d'eau et tabliers de pont, calibration solaire, occlusion cuite, qualité des
  toitures, GLB et serveur local ;
- `test/` : tests unitaires Python ;
- `viewer/` : sources HTML, CSS et JavaScript du visualiseur ;
- `config/` : exemples de configuration 100 m, 200 m et 600 m ;
- `docs/` : grille d’acceptation, analyse UX du visualiseur, procédure de l’étape
  amont et brief de mise en ligne
  ([`publication-visualiseur.md`](docs/publication-visualiseur.md)) ;
- `patches/` : correctifs à appliquer au clone du workflow LiDAR + Roofer ;
- `output*/run-*/` : entrées Roofer et résultats générés, jamais versionnés.

Ajouter la logique Python dans `src/poc3d/` et les tests correspondants dans
`test/`. Conserver `poc.py` comme lanceur léger. Les fichiers de configuration
emploient un sous-ensemble simple du format `KEY=VALUE` ; documenter tout
nouveau réglage dans les fichiers `.conf.example` concernés.

## Environnement Windows

Exécuter les commandes depuis ce dossier avec Python 3.11 :

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Ne pas installer les dépendances dans le Python global. `.venv/` et tous les
résultats sont ignorés par Git.

`config/poc.conf` et `config/poc-200m.conf` sont désormais **versionnés** : ce
sont les configurations de référence du POC, pas des copies de travail. Elles ne
contiennent aucun secret et ne doivent jamais en recevoir. Les avoir laissées
hors du dépôt les avait fait diverger silencieusement de leurs `.example`, au
point qu'une correction documentée restait sans effet à l'exécution. Toute
modification d'un réglage doit donc porter sur le `.conf` **et** son `.example`.

## Commandes de développement

```powershell
.\.venv\Scripts\python.exe poc.py check
.\.venv\Scripts\python.exe poc.py all
.\.venv\Scripts\python.exe poc.py serve
.\.venv\Scripts\python.exe -m unittest discover -s test -v
node --check viewer\app.js
```

`poc.py all` doit réutiliser la dernière exécution Roofer complète. Il ne doit
ni télécharger à nouveau les données LiDAR sources ni lancer Roofer.

Les commandes ciblées disponibles sont `validate`, `terrain`, `ortho`,
`vegetation`, `sun`, `glb`, `web` et `enhance`. Passer une configuration
différente avec `--config`, avant le nom de la sous-commande. `lancer.bat`
contrôle l’environnement, protège les processus étrangers utilisant le port,
puis lance uniquement le serveur local.

## Style et tests

Utiliser Python 3.11+, les annotations de types et des messages utilisateur en
français. Garder les fonctions courtes, les chemins sous forme de
`pathlib.Path` et les dépendances limitées à celles de `requirements.txt`.

Toute modification du traitement doit couvrir au minimum le succès et une
entrée invalide ou absente. Les tests utilisent `unittest`; éviter les accès
réseau réels et les gros artefacts dans les tests unitaires. Après un
changement :

1. exécuter les tests unitaires ;
2. exécuter `poc.py check` ;
3. pour une modification du pipeline, tester `poc.py all` sur les artefacts
   réels ;
4. pour le visualiseur, vérifier `node --check viewer\app.js`, les deux modes de
   rendu et le chargement HTTP du GLB ;
5. exécuter `git diff --check` et inspecter `git status`.

## Données générées et sécurité

Ne jamais versionner `.venv/`, `.work*/`, `output*/`, les fichiers LAZ, TIFF,
NPY, JPEG, GLB, `trees.json`, les caches Three.js ou les journaux. Les fichiers
`config/*.conf` font exception depuis qu'ils sont suivis : ils n'accueillent que
des réglages de traitement. Ne jamais écrire de mot de passe, jeton ou autre
secret dans le code, les configurations, les commandes documentées, les rapports
ou les commits.

Préserver les sorties Roofer existantes : les commandes d’enrichissement
peuvent remplacer uniquement leurs propres produits (`terrain.*`, `canopy.npy`,
`surface.npy`, `water.npy`, `bridge.npy`, `trees.json`, `orthophoto.*`,
`render/` et `web/`).

`poc.py web` lit en outre le `render/` des autres emprises pour alimenter le
sélecteur de scènes du visualiseur, et ne recopie ces scènes que dans son propre
`web/assets/scenes/`. Il ne doit jamais écrire hors de l’exécution préparée.

## Commits

Suivre les conventions du dépôt parent avec un message Conventional Commit
concis en français, par exemple :

```text
feat(poc-3d): ajoute le traitement Python natif sous Windows
```

Avant tout commit, vérifier que seuls les fichiers source et la documentation
nécessaires sont inclus.
