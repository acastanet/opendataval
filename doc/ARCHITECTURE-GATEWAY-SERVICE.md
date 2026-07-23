# Gateway Service — premier lot

## Rôle

Le Gateway Service constitue le point d'entrée des nouvelles API OpenDataVal. Il ne contient aucune logique métier et n'accède à aucune base de données.

Dans ce premier lot, il assure uniquement :

- la validation de sa configuration au démarrage ;
- les contrôles `/health` et `/ready` ;
- la propagation de l'en-tête `x-request-id` ;
- la normalisation des erreurs d'infrastructure ;
- un pont temporaire vers l'API historique sous `/api/v2/legacy/*`.

## Routage

```text
/api/v2/gateway                         -> gateway-service
/api/v2/legacy/meteo/v1/essential      -> api:/api/meteo/v1/essential
/api/*                                  -> API historique, inchangée
```

Caddy envoie uniquement `/api/v2` et `/api/v2/*` vers le gateway. Les routes existantes continuent d'être servies directement par le monolithe pendant la migration.

Caddy écoute sur le port HTTP indépendamment de la valeur de l'en-tête `Host`. La compression Caddy est réservée aux fichiers statiques et n'est pas appliquée aux réponses des API.

Le démarrage de Caddy ne dépend pas de la santé du gateway. Une panne du nouveau service rend uniquement `/api/v2/*` indisponible ; les fichiers statiques et les routes historiques `/api/*` restent servis.

## Pont vers l'API historique

Le pont temporaire :

- accepte uniquement `GET` et `HEAD` ;
- transmet le `x-request-id` ;
- applique un délai maximal configurable ;
- ne suit pas les redirections ;
- retire les en-têtes HTTP de proche en proche ;
- refuse les traversées de chemin simples ou doublement encodées ;
- garantit que la cible normalisée reste sous le préfixe `/api` du monolithe.

## Variables d'environnement

| Variable | Défaut | Description |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Adresse d'écoute |
| `PORT` | `3000` | Port HTTP interne |
| `LEGACY_API_URL` | `http://api:3000` | Adresse de l'API historique |
| `GATEWAY_UPSTREAM_TIMEOUT_MS` | `5000` | Délai maximal d'un appel amont |
| `APP_VERSION` | `dev` | Version exposée par les routes de santé |

## Contrôles

```bash
pnpm install --frozen-lockfile
pnpm check:gateway
docker compose build gateway
docker compose up -d gateway caddy
curl -i http://localhost:8080/api/v2/gateway
curl -i http://localhost:8080/api/v2/legacy/health
curl -i -H 'Host: 127.0.0.1' http://127.0.0.1:8080/api/health
```

`/health` confirme que le processus fonctionne. `/ready` vérifie également que l'API historique répond sur `/api/health`.

Les tests automatisés couvrent la santé, la disponibilité, le routage, la propagation du `request-id`, les délais d'attente, le refus des écritures et les traversées de chemin encodées.

## Limites volontaires du premier lot

Le service ne comprend pas encore :

- d'authentification ;
- de cache ;
- de Redis ou de file de messages ;
- de gRPC ;
- de circuit breaker avancé ;
- de logique météo, géographique ou incendie.

Les prochains endpoints devront être ajoutés domaine par domaine, avec des contrats JSON Schema explicites, sans transformer le gateway en nouveau monolithe métier.
