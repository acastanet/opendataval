# Déploiement — Climat v2

Le déploiement en ligne concerne le microservice de cadran des saisons
thermiques situé dans [`saison_v2`](./saison_v2). Il fournit une interface web
et une API qui reçoit un point GPS WGS84 et produit un cadran en PNG ou SVG.

## Prérequis

- Docker Engine avec Docker Compose v2 ;
- un compte [Copernicus Climate Data Store](https://cds.climate.copernicus.eu/)
  disposant d'un jeton personnel actif ;
- un nom de domaine et un reverse proxy HTTPS pour une exposition publique.

Le jeton Copernicus reste uniquement côté serveur. Ne le placer ni dans le
code, ni dans une image Docker, ni dans Git.

## Configuration

Les variables suivantes sont nécessaires :

```dotenv
COPERNICUS_CDS_KEY=votre-jeton-personnel
COPERNICUS_CDS_URL=https://cds.climate.copernicus.eu/api
CORS_ORIGINS=https://climat.exemple.fr
SEASONS_MAX_CONCURRENT=1
```

Dans ce dépôt, les identifiants sont déjà conservés dans le fichier `.env` à la
racine. Pour un serveur neuf, créer un fichier `.env` protégé (lecture réservée
au compte de déploiement) à partir de
[`saison_v2/.env.example`](./saison_v2/.env.example).

`SEASONS_MAX_CONCURRENT=1` est volontaire : une première collecte ERA5-Land
peut être coûteuse en mémoire et en quota Copernicus. Conserver cette valeur
sur un petit conteneur.

## Lancement local

Depuis le dossier `saison_v2`, utiliser le `.env` actuel de la racine :

```powershell
Set-Location 'C:\DEV_ALX\OpenDataVdA\poc\Climat v2\saison_v2'
docker compose --env-file ..\..\..\.env up --build -d
docker compose ps
```

Vérifier la disponibilité :

```powershell
Invoke-WebRequest http://localhost:8000/healthz
```

L'interface est disponible sur <http://localhost:8000>, la documentation API
sur <http://localhost:8000/docs>.

La première demande pour une maille ERA5-Land peut prendre plusieurs minutes.
Les données et rendus sont ensuite conservés dans le volume Docker
`seasons-data` : les demandes suivantes pour la même maille sont servies depuis
le cache.

## API publique

Exemple pour le point `44.20485692495915, 3.5139766462697613` :

```text
GET /api/v1/wheel.svg?lat=44.20485692495915&lon=3.5139766462697613
GET /api/v1/wheel.png?lat=44.20485692495915&lon=3.5139766462697613
GET /api/v1/wheel?lat=44.20485692495915&lon=3.5139766462697613&format=json
GET /healthz
```

Ajouter `title=Nom%20du%20lieu` à une route de cadran pour personnaliser le
titre visible dans les exports PNG et SVG.

Les routes PNG et SVG acceptent `download=true` pour déclencher le
téléchargement. Toutes les coordonnées sont validées en WGS84.

Une erreur technique (données incomplètes, cache corrompu ou calcul invalide)
renvoie HTTP `422`, avec `detail.code`, `detail.message` et les diagnostics
utiles. La qualité scientifique (`valid`, `partial`, `insufficient`) est une
information distincte, affichée dans le cadran et dans la réponse JSON.

## Exposition HTTPS

Le compose publie le port local `8000`. En production, placer ce port derrière
un reverse proxy HTTPS et n'exposer publiquement que `80`/`443`. Avec Caddy,
un site minimal est par exemple :

```caddyfile
climat.exemple.fr {
    reverse_proxy 127.0.0.1:8000
}
```

Renseigner ensuite l'URL HTTPS exacte dans `CORS_ORIGINS`, redémarrer le
conteneur et vérifier :

```powershell
docker compose --env-file ..\..\..\.env up -d
docker compose logs --tail=100 seasons-wheel
```

Si le reverse proxy est installé sur une autre machine, limiter le pare-feu à
son adresse ou adapter le port publié afin que `8000` ne soit pas accessible
depuis Internet directement.

## Exploitation courante

```powershell
# État et journaux
docker compose ps
docker compose logs -f seasons-wheel

# Mise à jour après récupération des sources
docker compose --env-file ..\..\..\.env up --build -d

# Arrêt sans effacer les données en cache
docker compose down
```

Ne pas utiliser `docker compose down --volumes` sans vouloir effacer le cache
ERA5-Land et les cadrans déjà générés. Les sources détaillées du service et les
instructions de développement sont dans [`saison_v2/README.md`](./saison_v2/README.md).
