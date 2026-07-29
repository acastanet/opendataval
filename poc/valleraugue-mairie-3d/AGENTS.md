# POC 3D Valleraugue — Consignes de travail

## Périmètre

Ce dossier est un POC Python autonome pour enrichir des sorties Roofer
existantes autour de la mairie de Valleraugue. Il produit un terrain à partir
du LiDAR, récupère une orthophotographie IGN, convertit les bâtiments en GLB et
prépare un visualiseur web local.

La chaîne d’enrichissement doit rester native sous Windows. Ne pas introduire
Docker, WSL, PDAL, GDAL ni une dépendance à un logiciel SIG. La reconstruction
Roofer est une étape amont distincte : les entrées attendues sont
`lidar_subset.laz` et `roofer_output/*.city.jsonl` dans un dossier `run-*`.

## Structure

- `poc.py` : point d’entrée en ligne de commande ;
- `src/poc3d/` : configuration, validation, terrain, végétation, occlusion cuite,
  qualité des toitures, GLB et serveur local ;
- `test/` : tests unitaires Python ;
- `viewer/` : sources HTML, CSS et JavaScript du visualiseur ;
- `config/` : exemples de configuration 100 m et 200 m ;
- `docs/` : grille d’acceptation ;
- `output*/` : données et résultats générés, jamais versionnés.

Ajouter la logique Python dans `src/poc3d/` et les tests correspondants dans
`test/`. Conserver `poc.py` comme lanceur léger.

## Environnement Windows

Exécuter les commandes depuis ce dossier avec Python 3.11 :

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item config\poc-200m.conf.example config\poc-200m.conf -ErrorAction SilentlyContinue
```

Ne pas installer les dépendances dans le Python global. `.venv/`, les fichiers
de configuration locaux et tous les résultats sont ignorés par Git.

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

## Style et tests

Utiliser Python 3.11+, les annotations de types et des messages utilisateur en
français. Garder les fonctions courtes, les chemins sous forme de
`pathlib.Path` et les dépendances limitées à celles de `requirements.txt`.

Toute modification du traitement doit couvrir au minimum le succès et une
entrée invalide ou absente. Après un changement :

1. exécuter les tests unitaires ;
2. exécuter `poc.py check` ;
3. pour une modification du pipeline, tester `poc.py all` sur les artefacts
   réels ;
4. pour le visualiseur, vérifier le JavaScript et le chargement HTTP du GLB ;
5. exécuter `git diff --check` et inspecter `git status`.

## Données générées et sécurité

Ne jamais versionner `.venv/`, `.work*/`, `output*/`, les fichiers LAZ, TIFF,
JPEG, GLB, les caches Three.js, les journaux ou les configurations locales.
Ne jamais écrire de mot de passe, jeton ou autre secret dans le code, les
commandes documentées, les rapports ou les commits.

Préserver les sorties Roofer existantes : les commandes d’enrichissement
peuvent remplacer uniquement leurs propres produits (`terrain.*`,
`orthophoto.*`, `render/` et `web/`).

## Commits

Suivre les conventions du dépôt parent avec un message Conventional Commit
concis en français, par exemple :

```text
feat(poc-3d): ajoute le traitement Python natif sous Windows
```

Avant tout commit, vérifier que seuls les fichiers source et la documentation
nécessaires sont inclus.
