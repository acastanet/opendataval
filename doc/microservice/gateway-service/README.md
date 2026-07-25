# Gateway Service

> Point d’entrée unique des API v2 (`/api/v2/*`). Aucune logique métier, aucun accès direct à la base.
> Dernière mise à jour : 2026-07-25 · Dernière vérification : 2026-07-25
> Code : `apps/gateway-service/`

## Rôle

Le gateway est la façade HTTP des nouvelles API OpenDataVal. Il valide sa configuration au démarrage, expose les contrôles de santé, propage `x-request-id`, valide les paramètres publics, normalise les erreurs d’infrastructure et route vers les microservices v2.

Il conserve aussi un pont temporaire en lecture seule vers le monolithe historique. Il ne doit jamais devenir un monolithe métier : les règles géographiques, météorologiques et de vigilance restent dans les services concernés.

## Routes publiques

| Route | Cible ou traitement | Méthode |
|---|---|---|
| `/api/v2` | Page d’accueil HTML : présente les microservices et l’état live | `GET` |
| `/api/v2/demo/:service` | Page de démo interactive d’un microservice (formulaire → appel réel) | `GET` |
| `/api/v2/status` | État agrégé léger de chaque service (alimente les pages) | `GET` |
| `/health` | Vie du processus gateway | `GET` |
| `/ready` | Gateway prêt et API historique joignable sur `/api/health` | `GET` |
| `/api/v2/gateway` | Identité et version du gateway | `GET` |
| `/api/v2/geography/resolve` | `geography-service:/internal/v1/geography/resolve` | `GET` |
| `/api/v2/weather/temperature` | `weather-service:/internal/v1/weather/temperature` | `GET` |
| `/api/v2/vigilance` | Résolution éventuelle du département, puis `weather-vigilance-service` | `GET` |
| `/api/v2/fire/nearby` | `fire-detection-service:/v1/fire/nearby` avec 50 km / 7 jours imposés | `GET` |
| `/api/v2/legacy/*` | `api:/api/*`, pont historique en lecture seule | `GET`, `HEAD` |

Format d’erreur public privilégié :

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Message explicite.",
    "retryable": false
  },
  "requestId": "..."
}
```

## Routage Vigilance

La route `/api/v2/vigilance` accepte deux modes :

```text
GET /api/v2/vigilance?department_code=30
GET /api/v2/vigilance?lat=44.0812&lon=3.6421&accuracy=25
GET /api/v2/vigilance?department_code=30&include_bulletins=true
```

Paramètres :

| Paramètre | Règle |
|---|---|
| `department_code` | Département métropolitain : `01` à `95`, `2A` ou `2B` |
| `lat`, `lon` | Coordonnées valides ; les deux sont nécessaires |
| `accuracy` | Précision horizontale facultative, positive ou nulle |
| `include_bulletins` | `true`, `false`, `1` ou `0` |

Avec des coordonnées, le gateway appelle Geography, extrait le département, vérifie la cohérence avec un éventuel `department_code`, puis appelle `/v1/vigilance/departments/{code}`. Il enrichit la réponse avec `location.resolved_by` et les coordonnées d’entrée. Avec seulement `department_code`, Geography n’est pas appelé.

Une indisponibilité de Weather Vigilance n’est jamais traduite en vigilance verte.

## Pont legacy

Le pont `/api/v2/legacy/*` :

- accepte uniquement `GET` et `HEAD` ;
- transmet `x-request-id` ;
- applique un délai maximal et ne suit pas les redirections ;
- retire les en-têtes de proche en proche ;
- refuse les traversées de chemin simples ou doublement encodées ;
- garantit que la cible reste sous le préfixe `/api` du monolithe.

## Dépendances

- `api` : cible du pont legacy et de la sonde `/ready` ;
- `geography-service` : résolution géographique publique et résolution du département pour Vigilance ;
- `weather-service` : température ponctuelle ;
- `weather-vigilance-service` : vigilance officielle départementale ;
- `fire-detection-service` : détection stateless de suspicions de feu ;
- aucune base de données, aucun cache et aucune file de messages.

## Configuration (`src/config.ts`)

| Variable | Défaut | Description |
|---|---|---|
| `HOST` | `0.0.0.0` | Adresse d’écoute |
| `PORT` | `3000` | Port HTTP interne |
| `LEGACY_API_URL` | `http://api:3000` | API historique : pont et sonde ready |
| `GATEWAY_UPSTREAM_TIMEOUT_MS` | `5000` | Délai maximal du pont legacy |
| `GEOGRAPHY_SERVICE_URL` | `http://geography-service:3000` | Cible Geography |
| `GEOGRAPHY_SERVICE_TIMEOUT_MS` | `3000` | Délai Geography |
| `WEATHER_SERVICE_URL` | `http://weather-service:3000` | Cible Weather |
| `WEATHER_SERVICE_TIMEOUT_MS` | `3000` | Délai Weather |
| `VIGILANCE_SERVICE_URL` | `http://weather-vigilance-service:3000` | Cible Weather Vigilance |
| `VIGILANCE_SERVICE_TIMEOUT_MS` | `3000` | Délai Weather Vigilance |
| `FIRE_DETECTION_SERVICE_URL` | `http://fire-detection-service:3000` | Cible détection incendie |
| `FIRE_DETECTION_SERVICE_TIMEOUT_MS` | `20000` | Délai agrégé FIRMS/EUMETSAT |
| `APP_VERSION` | `GIT_SHA` puis `dev` | Version exposée |

Les URL doivent utiliser HTTP ou HTTPS. Les délais doivent être des entiers strictement positifs ; une configuration invalide arrête le processus au démarrage.

## Lancement et contrôles

```bash
pnpm install --frozen-lockfile
pnpm check:gateway

docker compose build gateway caddy fire-detection-service
docker compose up -d gateway caddy fire-detection-service

curl -i http://localhost:8080/api/v2/gateway
curl -i "http://localhost:8080/api/v2/geography/resolve?lat=44.0812&lon=3.6421"
curl -i "http://localhost:8080/api/v2/weather/temperature?lat=44.0812&lon=3.6421"
curl -i "http://localhost:8080/api/v2/vigilance?department_code=30"
curl -i "http://localhost:8080/api/v2/fire/nearby?lat=44.0812&lon=3.6415"
curl -i http://localhost:8080/api/v2/legacy/health
```

Le `Caddyfile` est copié dans l’image au build (`Dockerfile.caddy`). Modifier une route sans reconstruire `caddy` peut faire retomber `/api/v2/*` sur le gestionnaire historique `/api/*`, avec un 404 JSON trompeur.

`/health` confirme uniquement que le processus tourne. `/ready` vérifie actuellement l’API historique, mais ne sonde pas individuellement Geography, Weather, Weather Vigilance ou Fire Detection. La disponibilité réelle d’une route métier se vérifie donc par une requête fonctionnelle.

Les tests couvrent notamment la santé, le routage, la propagation du `request-id`, les délais, le refus des écritures, les traversées de chemin et la validation des paramètres Vigilance et Feu.

## Rollback

Retirer le service ou un proxy v2 ne modifie pas les routes historiques `/api/*`. Pour un rollback de routage, rétablir conjointement l’image du gateway et celle de Caddy afin d’éviter un décalage entre le code et le `Caddyfile` embarqué.

## Pages de présentation

Le gateway sert aussi sa propre façade HTML (styles et scripts inline, sans fichier statique ni bundler), compatible avec le CSP appliqué par Caddy :

- `/api/v2` : accueil listant les microservices (rôle, route, badge d’état) avec un lien vers chaque démo ;
- `/api/v2/demo/:service` : démonstration interactive d’un service (formulaire pré-rempli sur Val-d’Aigoual → appel réel de la route publique → affichage du résultat). Le résultat s’affiche sous deux onglets : une **synthèse lisible** (« Résultat ») et le **JSON brut**. Pour les services géographiques (champs `lat`/`lon` : geography, weather, vigilance, fire), la page ajoute un bouton **« Me localiser »** (`navigator.geolocation`) et une **carte Leaflet** (marqueur, clic pour saisir les coordonnées, cercle du rayon et marqueurs des détections pour fire) ;
- `/api/v2/status` : sonde d’état légère, dédiée à ces pages, qui interroge en parallèle la santé de chaque microservice et renvoie `{ generatedAt, version, services: [{ id, name, status, latencyMs }] }`. Elle ne relaie aucun corps amont ni secret, et ne renvoie jamais de 5xx.

Les pages et le catalogue des services sont pilotés par un descripteur unique (`src/services-catalog.ts`) ; la synthèse lisible par service vit dans `src/pages/demo-presentation.ts` (rendu en DOM sûr, jamais d’HTML interpolé).

**Dépendance externe des démos géographiques** : Leaflet 1.9.4 est chargé depuis `unpkg.com` (avec contrôle d’intégrité SRI) et les fonds de carte depuis `tile.openstreetmap.org`. Le CSP du `Caddyfile` autorise ces origines (`script-src`/`style-src` : `unpkg.com` ; `img-src` : `unpkg.com` et `tile.openstreetmap.org`). Si le CDN est inaccessible, la carte affiche un message de repli et le formulaire reste pleinement utilisable. La géolocalisation exige un contexte sécurisé (HTTPS ou `localhost`).

## Limites volontaires

Pas d’authentification, de cache, de Redis ou file de messages, de gRPC, de circuit breaker avancé, ni de logique météo, géographique, incendie ou vigilance dans le gateway. La sonde `/ready` n’agrège **pas** la santé des microservices v2 (elle ne vérifie que l’API historique) ; l’état live des services est fourni séparément par `/api/v2/status`, orienté présentation et non orchestration. La fixation du rayon et de l’historique de la route feu est un contrôle de contrat, pas un calcul de détection.

## Documentation liée

- Index des microservices : [`../README.md`](../README.md)
- Geography Service : [`../geography-service/README.md`](../geography-service/README.md)
- Weather Service : [`../weather-service/README.md`](../weather-service/README.md)
- Weather Vigilance : [`../weather-vigilance/README.md`](../weather-vigilance/README.md)
- Détection incendie : [`../fire-detection/README.md`](../fire-detection/README.md)
- Architecture globale : [`../../architecture/ARCHITECTURE-GENERALE.md`](../../architecture/ARCHITECTURE-GENERALE.md)
- Conception v2 : [`../../architecture/conception-v2/`](../../architecture/conception-v2/)
