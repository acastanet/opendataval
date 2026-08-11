# Chaîne autonome — saisons thermiques V4

Ce dossier contient toute la chaîne locale. Sa collecte est mutualisée avec `../fiche_climat` par `../climate_shared/collect.py` ; le moteur scientifique, le rendu et les données publiées restent dans ce dossier.

Il contient également un microservice Docker autonome dans `service/`. Celui-ci
n'utilise pas le collecteur parent : il télécharge uniquement la température
ERA5-Land nécessaire au cadran, puis met en cache la donnée brute et les rendus.

## Application web et microservice Docker

Créer un fichier `.env` à partir de `.env.example`, puis y renseigner le jeton
personnel du [Copernicus Climate Data Store](https://cds.climate.copernicus.eu/).
Le jeton reste côté serveur et n'est jamais envoyé au navigateur.

```bat
copy .env.example .env
docker compose up --build -d
```

L'application est alors disponible sur `http://localhost:8000` et la
documentation interactive de l'API sur `http://localhost:8000/docs`.

Exemples pour le point `44.20485692495915, 3.5139766462697613` :

```text
GET /api/v1/wheel.svg?lat=44.20485692495915&lon=3.5139766462697613
GET /api/v1/wheel.png?lat=44.20485692495915&lon=3.5139766462697613
GET /api/v1/wheel?lat=44.20485692495915&lon=3.5139766462697613&format=json
```

Le paramètre facultatif `title` personnalise le titre affiché dans le cadran :

```text
GET /api/v1/wheel.svg?lat=44.20485692495915&lon=3.5139766462697613&title=Mont%20Aigoual
```

Ajouter `download=true` aux routes `.svg` et `.png` pour obtenir un nom de
fichier de téléchargement. `/healthz` sert de sonde de santé. Les coordonnées
sont validées en WGS84 ; la donnée représentée est celle de la maille ERA5-Land
de 0,1° la plus proche.

Le volume Docker `seasons-data` conserve les téléchargements et les rendus entre
les redémarrages. La première demande d'une maille peut prendre plusieurs
minutes ; les demandes suivantes sont servies depuis ce cache. Le service lance
un seul worker afin de sérialiser proprement les premières collectes d'une même
maille.

Quand le contrôle de sensibilité V4 signale un résultat partiel ou insuffisant,
le service conserve le cadran calculé mais ajoute la mention visible
« interprétation prudente ». La route `format=json` fournit le détail des
contrôles et des raisons de qualité.

## Validité technique et erreurs API

Avant le rendu, le service vérifie l'intégrité SHA-256 du cache, le format du
CSV, l'unicité et le fuseau UTC des horodatages, l'absence de valeurs manquantes
et la couverture minimale de chaque année 1991–2025. Il vérifie aussi les seuils
et l'ordre des quatre frontières calculées. Une erreur technique bloque le rendu
et renvoie HTTP `422` avec un `detail.code`, un `detail.message` et, si utile,
des diagnostics par année. L'interface affiche ce message directement.

La qualité scientifique V4 (`valid`, `partial`, `insufficient`) reste distincte :
elle est visible dans le JSON et sur le cadran, sans être confondue avec une
erreur de données ou de calcul.

Les polices Dancing Script et Inter sont distribuées dans `service/assets/fonts/`
sous licence SIL Open Font License 1.1. Elles sont installées dans l'image pour
le rendu PNG et encodées dans chaque SVG : aucun export ne dépend du chargement
de Google Fonts.

Pour lancer le service sans Docker :

```bat
python -m pip install -r requirements-service.txt
set SEASONS_DATA_DIR=.data
set COPERNICUS_CDS_KEY=personal-access-token
uvicorn service.main:app --host 0.0.0.0 --port 8000
```

`SEASONS_MAX_CONCURRENT` vaut `1` par défaut afin de protéger la mémoire et le
quota CDS. Pour une exposition publique, conserver cette limite et placer le
conteneur derrière un reverse proxy avec HTTPS et limitation de débit.

Pour produire à la fois cette infographie et la fiche climat depuis une seule collecte GPS, utiliser `..\build-all.bat` depuis le répertoire parent. Les actifs sont alors partagés depuis `../climate_shared/cache/<GPS>/`.

```text
GPS (latitude, longitude)
        ↓ collecteur commun Copernicus CDS
input/era5-land.csv + input/climate-snapshot.json
        ↓ vérification SHA-256 et lecture des températures
engine/climate_seasons_service/ (moteur V4 embarqué)
        ↓ calcul des climatologies, T25/T75, frontières et bootstrap
output/thermal-seasons-v4-replay.json
        ↓ préparation des données web
data.js
        ↓
index.html + styles.css + app.js
```

## Partir d’un point GPS et tout produire

Python 3.11+ est requis. Configurer auparavant un compte Copernicus Climate Data Store via les variables `COPERNICUS_CDS_URL` et `COPERNICUS_CDS_KEY`, ou un fichier `~/.cdsapirc` contenant `url:` et `key:`. Les identifiants ne sont jamais enregistrés dans ce dossier.

```bat
cd /d "C:\DEV_ALX\OpenDataVdA\poc\Climat v2\saison_v2"
python -m pip install -r requirements.txt
collect-and-build.bat --lat 44.064654 --lon 3.682935
```

Le collecteur commun arrondit le point demandé à la grille ERA5-Land de 0,1°, récupère température, précipitations, UTCI et SPEI-3, puis construit le manifeste et le SHA-256 de la température utilisée par V4. Le même GPS réutilise le cache ; ajouter `--force` pour le télécharger à nouveau.

`collect-and-build.bat` enchaîne la collecte et le calcul : vérification de l’intégrité du CSV, calcul `thermal-seasons@4.0.0`, écriture du ClimateResult dans `output/`, puis régénération de `data.js`.

## Rejouer sans collecte

Lorsque `input/` contient déjà un snapshot valide, cette commande évite l’accès à Copernicus :

```bat
rebuild.bat
```

Ouvrir ensuite `index.html` dans un navigateur. La page n'a besoin ni de serveur, ni de paquet JavaScript, ni d'accès réseau.

Les entrées correspondent au snapshot ERA5-Land pour Val-d’Aigoual (1991–2025) et la méthode est explicitement une comparaison descriptive de saisons thermiques locales, non des saisons météorologiques fixes.
