# Déploiement — Observations météo nationales

## Périmètre

Ce déploiement active conjointement :

- la présélection spatiale des stations dans l’API ;
- le catalogue national Météo-France dans le worker ;
- le paquet horaire national d’observations ;
- l’endpoint d’exploitation `/api/v1/meteo/health` ;
- la sonde Paris–Marseille–Val-d’Aigoual.

Les services concernés sont uniquement :

```text
api
worker
```

Ne pas reconstruire ni recréer :

```text
db
caddy
copernicus
```

Aucune migration destructive n’est introduite. Les nouvelles stations et observations utilisent les tables déjà existantes.

## Variables indispensables

Le fichier `.env` de production doit contenir :

```text
POSTGRES_PASSWORD
METEOFRANCE_API_TOKEN
```

La même valeur de `METEOFRANCE_API_TOKEN` est utilisée pour le catalogue, le paquet national et les collectes locales historiques.

## Variables optionnelles

```text
METEOFRANCE_STATIONS_URL
METEOFRANCE_HOURLY_PACKET_URL
METEOFRANCE_MIN_HOURLY_OBSERVATIONS
```

Ne les définir que pour remplacer volontairement les valeurs intégrées au code.

## Préparation

Les exemples supposent :

```bash
LIVE=/root/opendataval
COMMIT_CIBLE=<sha_exact_du_commit_fusionné>
SHORT=${COMMIT_CIBLE:0:7}
WORKTREE=/tmp/opendataval-deploy-$SHORT
PROJECT=opendataval
```

Vérifier l’état initial :

```bash
cd "$LIVE"
git status --short
docker compose -p "$PROJECT" ps
docker image inspect opendataval-api:latest --format '{{.Id}}'
docker image inspect opendataval-worker:latest --format '{{.Id}}'
```

Le déploiement doit partir du commit exact, jamais de la branche locale `master` du VPS.

```bash
cd "$LIVE"
git fetch origin "$COMMIT_CIBLE"
rm -rf "$WORKTREE"
git worktree add --detach "$WORKTREE" "$COMMIT_CIBLE"
test "$(git -C "$WORKTREE" rev-parse HEAD)" = "$COMMIT_CIBLE"
```

## Validation avant construction

```bash
cd "$WORKTREE"
pnpm install --frozen-lockfile
pnpm --filter api test
pnpm --filter api exec tsc --noEmit
pnpm --filter worker test
pnpm --filter worker exec tsc --noEmit
node --check scripts/verify-meteo-national.mjs
```

Interrompre le déploiement au premier échec.

## Sauvegarde des images de retour arrière

```bash
docker image tag \
  opendataval-api:latest \
  "opendataval-api:rollback-before-$SHORT"

docker image tag \
  opendataval-worker:latest \
  "opendataval-worker:rollback-before-$SHORT"
```

Vérifier les deux tags avant de poursuivre.

## Construction des nouvelles images

Utiliser le compose du worktree pour construire le code exact, mais le fichier `.env` du déploiement existant :

```bash
docker compose \
  -p "$PROJECT" \
  --env-file "$LIVE/.env" \
  -f "$WORKTREE/docker-compose.yml" \
  build --no-cache api worker
```

Vérifier que les images résultantes portent bien les noms utilisés par la stack :

```bash
docker image inspect opendataval-api:latest --format '{{.Id}}'
docker image inspect opendataval-worker:latest --format '{{.Id}}'
```

## Bascule séquentielle

### 1. API

Recréer uniquement l’API depuis le compose vivant afin de conserver les chemins et volumes de production :

```bash
cd "$LIVE"
docker compose -p "$PROJECT" up -d --no-build --force-recreate api
```

Contrôler :

```bash
docker compose -p "$PROJECT" ps api
curl -fsS http://127.0.0.1:8080/api/health
curl -fsS http://127.0.0.1:8080/api/v1/meteo/health
```

Le second endpoint peut être `degraded` à ce stade : les nouvelles ingestions n’ont pas encore été exécutées.

### 2. Catalogue national

```bash
cd "$LIVE"
docker compose -p "$PROJECT" run --rm \
  -e RUN_ONCE=true \
  -e RUN_ONLY=meteo_stations \
  worker
```

La commande doit terminer avec un statut `ok` ou `partiel` justifié et un volume national. Un résultat proche de 21 stations indique que la bascule n’est pas validée.

### 3. Paquet horaire national

```bash
cd "$LIVE"
docker compose -p "$PROJECT" run --rm \
  -e RUN_ONCE=true \
  -e RUN_ONLY=meteo_obs_national \
  worker
```

La commande doit enregistrer plusieurs centaines d’observations. Un paquet vide ou limité au catalogue cévenol est un échec.

### 4. Worker permanent

Après les deux exécutions contrôlées :

```bash
cd "$LIVE"
docker compose -p "$PROJECT" up -d --no-build --force-recreate worker
```

Contrôler :

```bash
docker compose -p "$PROJECT" ps worker
docker compose -p "$PROJECT" logs --tail=200 worker
```

## Vérification locale

```bash
curl -fsS http://127.0.0.1:8080/api/v1/meteo/health | jq

METEO_BASE_URL=http://127.0.0.1:8080 \
  node "$WORKTREE/scripts/verify-meteo-national.mjs"
```

La sonde doit confirmer :

- au moins 1 000 stations au catalogue ;
- au moins une observation fraîche ;
- un succès de `meteo_stations` ;
- un succès de `meteo_obs_national` ;
- des candidates situées à moins de 50 km pour Paris, Marseille et Val-d’Aigoual ;
- les départements 75, 13 et 30.

## Vérification publique

```bash
METEO_BASE_URL=https://euporie.cloud/val-daigoual \
  node "$WORKTREE/scripts/verify-meteo-national.mjs"
```

Vérifier également les pages :

```text
https://euporie.cloud/val-daigoual/meteo-v2/
https://euporie.cloud/val-daigoual/meteo/essentiel/
```

Aucune reconstruction de Caddy n’est nécessaire pour ce déploiement.

## Requêtes SQL de diagnostic

### Volume du catalogue

```sql
select count(*)
from couches.objets
where couche = 'station_meteo';
```

### Fraîcheur des observations

```sql
select
  count(distinct num_poste) as stations_observees,
  count(distinct num_poste) filter (
    where heure_utc >= now() - interval '90 minutes'
  ) as stations_fraiches,
  max(heure_utc) as derniere_observation
from series.meteo_horaire
where t is not null;
```

### Derniers jobs

```sql
select id, source, statut, nb_lignes, termine_a, erreur
from meta.fetch_log
where source in (
  'meteo_stations',
  'meteo_obs_national',
  'meteo_obs',
  'meteo_radome',
  'meteo_infoclimat'
)
order by id desc
limit 30;
```

## Retour arrière

Le retour arrière applicatif est compatible avec les données supplémentaires insérées : les anciennes versions ignorent les stations nationales non référencées par leur catalogue statique.

```bash
docker image tag \
  "opendataval-api:rollback-before-$SHORT" \
  opendataval-api:latest

docker image tag \
  "opendataval-worker:rollback-before-$SHORT" \
  opendataval-worker:latest

cd "$LIVE"
docker compose -p "$PROJECT" up -d --no-build --force-recreate api worker
```

Puis vérifier :

```bash
curl -fsS http://127.0.0.1:8080/api/health
docker compose -p "$PROJECT" ps api worker
```

Ne pas supprimer les données nationales pendant le retour arrière. Elles restent compatibles et pourront être réutilisées lors de la correction suivante.

## Compte rendu attendu

Le rapport de déploiement doit contenir :

- commit exact déployé ;
- chemin du worktree détaché ;
- identifiants des images avant et après ;
- tags de retour arrière ;
- résultats des tests ;
- résultats des jobs `meteo_stations` et `meteo_obs_national` ;
- réponse complète de `/api/v1/meteo/health` ;
- tableau Paris–Marseille–Val-d’Aigoual produit par la sonde ;
- état final des conteneurs ;
- confirmation que DB, Caddy et Copernicus n’ont pas été recréés.
