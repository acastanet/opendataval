# POC 3D Valleraugue — Consignes de travail

## Périmètre

Ce dossier est un POC Python autonome pour enrichir des sorties Roofer
existantes sur le territoire de Val-d’Aigoual. Il produit un terrain et des
proxys de végétation à partir du LiDAR, récupère et recale une
orthophotographie IGN, convertit les bâtiments en GLB et prépare un visualiseur
web local proposant plusieurs scènes.

Une scène se décrit par un point WGS84 et un côté en mètres : `poc.py scene` en
déduit l’emprise, la maille, les dalles LiDAR et la commande amont. Le pipeline
complet et le contrat destiné à une interface de construction sont dans
[`docs/construire-une-scene.md`](docs/construire-une-scene.md), qui est la
référence à lire avant toute modification de la chaîne.

La chaîne d’enrichissement doit rester native sous Windows et s’installer par un
`venv` et un `pip install` : ni conda, ni OSGeo4W, ni logiciel à piloter à la
main. C’est la seule contrainte d’outillage. Les bibliothèques SIG dont les roues
Windows sont autoportantes — `shapely`, `pyproj`, `geopandas`, `rasterio` — sont
en place et doivent être préférées à une réimplémentation. PDAL n’en fait pas
partie, faute de roue `pip` : l’introduire remplacerait la procédure
d’installation, ce qui se décide et ne se subit pas.

Docker reste présent en amont, pour Roofer, et en aval, pour le Caddy qui sert le
visualiseur. La reconstruction Roofer est une étape amont distincte : les entrées
attendues sont `lidar_subset.laz` et `roofer_output/*.city.jsonl` dans un dossier
`run-*`.

Cette étape amont est décrite dans [`docs/lidar-roofer.md`](docs/lidar-roofer.md) :
elle tourne dans un conteneur Docker, depuis un clone du dépôt
`ignfab/roofer-with-ignf-datasets` placé sous `.work-python/`. Le clone n’étant
pas versionné, les correctifs qu’il exige vivent dans [`patches/`](patches/) et
doivent y être mis à jour avec toute modification du workflow amont — sans quoi
un nouveau clone les perd en silence.

Deux appels réseau de la chaîne d’enrichissement sortent de la Géoplateforme, et
tous deux sont **non bloquants** : hors couverture ou hors ligne, la scène se
produit sans eux, et aucune étape ne doit en faire une condition de succès.

- `vegetation` interroge le WFS BD Forêt V2 pour typer les houppiers ; à défaut,
  le profil générique subsiste ;
- `geology` télécharge l’archive départementale de la BD Charm-50 du BRGM
  (InfoTerre) pour rastériser la carte géologique à 1/50 000 sur l’emprise ; à
  défaut, la scène se charge sans la couche et sa bascule reste désactivée.
  L’archive pèse une vingtaine de mégaoctets et se met en cache dans
  `.work/geology/`, partagée par toutes les scènes du même département. Le
  département ne se déduit pas des coordonnées : chaque `.conf` porte son
  `GEOLOGY_DEPARTMENT`.

## Structure

- `poc.py` : point d’entrée en ligne de commande ;
- `src/poc3d/` : CLI, géodésie, construction de scène, configuration, validation,
  terrain, végétation, surfaces d'eau et tabliers de pont, calibration solaire,
  occlusion cuite, qualité des toitures et repli LoD1, GLB et serveur local ;
- `test/` : tests unitaires Python ;
- `viewer/` : sources du visualiseur — `index.html`, `styles.css`, `app.js` et
  `favicon.svg`. Les quatre sont recopiés tels quels par `poc.py web` : modifier
  un seul d’entre eux impose de régénérer le dossier servi ;
- `config/` : une configuration par scène, plus son `.example` et son aperçu
  GeoJSON ;
- `docs/` : construction d’une scène
  ([`construire-une-scene.md`](docs/construire-une-scene.md)), grille
  d’acceptation, pistes de rendu mesurées
  ([`ameliorations-3d.md`](docs/ameliorations-3d.md)), analyse UX du visualiseur,
  procédure de l’étape amont, brief de
  mise en ligne ([`publication-visualiseur.md`](docs/publication-visualiseur.md))
  et transfert vers le serveur
  ([`publication-tailscale.md`](docs/publication-tailscale.md)) ;
- `patches/` : correctifs à appliquer au clone du workflow LiDAR + Roofer ;
- `lancer.bat` : raccourci de démonstration sur l’emprise 200 m — il régénère le
  visualiseur avant de le servir, faute de quoi il mettait en ligne une interface
  périmée sans rien signaler ; `Makefile` : les mêmes sous-commandes que `poc.py`,
  pour la ligne de commande ;
- `output*/run-*/` : entrées Roofer et résultats générés, jamais versionnés ;
- `publication/` : copie à chemin fixe du dernier `web/` préparé, précompressée,
  montée en lecture seule dans le conteneur Caddy. Générée, jamais versionnée.

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

Les `config/*.conf` sont **versionnés** : ce sont les configurations de référence
du POC, pas des copies de travail. Elles ne contiennent aucun secret et ne
doivent jamais en recevoir. Les avoir laissées hors du dépôt les avait fait
diverger silencieusement de leurs `.example`, au point qu'une correction
documentée restait sans effet à l'exécution. Toute modification d'un réglage doit
donc porter sur le `.conf` **et** son `.example` ; un test le vérifie.

Une nouvelle scène s'ajoute avec `poc.py scene … --write`, qui écrit les deux
fichiers d'un coup, plus un aperçu GeoJSON de l'emprise. Ne pas recopier un
`.conf` existant à la main : le gabarit porte les réglages de traitement
calibrés sur le terrain et leurs justifications. Toute scène versionnée doit
porter un `SCENE_TITLE`, faute de quoi elle n'apparaît dans le sélecteur que par
sa taille.

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
`vegetation`, `geology`, `sun`, `glb`, `web` et `enhance`. Passer une configuration
différente avec `--config`, avant le nom de la sous-commande. `scene` fait
exception : elle fabrique une configuration et ignore donc `--config`.

`poc.py scenes` ouvre le menu des emprises : il dresse l'état de chaque `.conf`
versionné et enchaîne assemblage, pipeline complet ou visualiseur. L'état
« configuration plus récente » compare la date du `.conf` à celle de son
`render/scene.glb` — le calage de l'orthophotographie et la position solaire sont
cuits à l'assemblage, une retouche du `.conf` reste sans effet tant que `glb`
n'a pas été rejoué. `poc.py web` signale la même chose pour toutes les emprises.
Le menu lit `printer` et `reader` en paramètres afin de rester testable sans
terminal : ne pas y appeler `print` ni `input` directement.
`lancer.bat`
contrôle l’environnement, protège les processus étrangers utilisant le port,
puis lance uniquement le serveur local. `scenes.bat` ouvre le menu ; son argument
facultatif désigne la scène par défaut du sélecteur, non celle à assembler.

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
4. pour le visualiseur, vérifier `node --check viewer\app.js`, puis le chargement
   HTTP du GLB et le passage d’une scène à l’autre dans le sélecteur. Le
   visualiseur n’a **qu’une** chaîne de rendu : le mode réaliste — ciel de
   Preetham, GTAO, `EffectComposer` — a été retiré après comparaison, et les
   modes « Orthophoto », « Modèle » et « Qualité » ne sont que des préréglages
   des bascules de texture ;
5. exécuter `git diff --check` et inspecter `git status`.

## Données générées et sécurité

Ne jamais versionner `.venv/`, `.work*/`, `output*/`, `publication/`, les
fichiers LAZ, TIFF, NPY, JPEG, GLB, `trees.json`, les caches Three.js ou les
journaux. `publication/` mérite d'être nommé : c'est un dossier de sortie comme
un autre, mais son chemin fixe et sa présence dans `docker-compose.yml` le font
ressembler à une source. Il pèse une centaine de mégaoctets par publication, pour
un artefact reproductible en une commande. Les fichiers `config/*.conf` font
exception depuis qu'ils sont suivis : ils n'accueillent que des réglages de
traitement. Ne jamais écrire de mot de passe, jeton ou autre secret dans le code,
les configurations, les commandes documentées, les rapports ou les commits.

Préserver les sorties Roofer existantes : les commandes d’enrichissement
peuvent remplacer uniquement leurs propres produits (`terrain.*`, `canopy.npy`,
`canopy.tif`, `surface.npy`, `understory.npy`, `understory.tif`, `water.npy`,
`bridge.npy`, `trees.json`, `orthophoto.*`,
`render/` — y compris `render/geology.png`, `render/geology-pick.png` et
`render/geology.json` — et `web/`). Le cache des archives BRGM vit hors de
l’exécution, dans `.work/geology/`, puisqu’il se partage entre scènes.

`poc.py web` lit en outre le `render/` des autres emprises pour alimenter le
sélecteur de scènes du visualiseur, et ne recopie ces scènes que dans son propre
`web/assets/scenes/`. Il ne doit jamais écrire hors de l’exécution préparée.

## Ce que la POC touche à la racine du dépôt

Le visualiseur est en ligne, et c’est le seul endroit où la POC sort de son
dossier. Trois fichiers versionnés de la racine portent son intégration :

- [`Caddyfile`](../../Caddyfile) : la route `/valleraugue-3d` et le `blob:` de
  `connect-src` dans la CSP, sans lequel les textures embarquées dans le GLB ne
  se chargent pas ;
- [`docker-compose.yml`](../../docker-compose.yml) : le montage
  `./poc/valleraugue-mairie-3d/publication:/srv/valleraugue-3d:ro` ;
- [`.dockerignore`](../../.dockerignore) : les exclusions `poc/**` qui gardent le
  gigaoctet de sorties hors du contexte de build.

Ces trois-là sont **posés une fois**. Une mise à jour de contenu ne les touche
pas : le chemin `publication/` est fixe précisément pour cela. La procédure et
ses pièges sont dans
[`publication-visualiseur.md`](docs/publication-visualiseur.md) § 8 ; le plus
coûteux d’entre eux est de transférer un `web/` qu’on n’a pas régénéré soi-même,
qui remet en ligne une ancienne interface sans que rien ne le signale.

## Commits

Suivre les conventions du dépôt parent avec un message Conventional Commit
concis en français, par exemple :

```text
feat(poc-3d): ajoute le traitement Python natif sous Windows
```

Avant tout commit, vérifier que seuls les fichiers source et la documentation
nécessaires sont inclus.
