# Déploiement, rollback et raccordement météo

Déployer `geography-service`, `gateway` **et `caddy`** ; aucun frontend, migration SQL, API historique, worker, base ou Copernicus n'est recréé.

**Piège vérifié en local (23/07/2026) :** le routage `/api/v2/*` du `Caddyfile` est compilé dans l'image `caddy` au build (`Dockerfile.caddy`), pas lu au runtime — un `caddy` qui tourne encore avec une image antérieure à ce routage renvoie un 404 JSON qui **imite le format d'erreur de `geography-service`** (404 Fastify générique de l'API historique, car `/api/v2/*` retombe alors sur `handle /api/*` → `api:3000`), ce qui piège le diagnostic. Reconstruire et recréer `caddy` à chaque déploiement qui touche le `Caddyfile` ou une route derrière lui — donc systématiquement pour ce lot.

## Procédure (agent de déploiement)

```bash
git pull origin master
docker compose build geography-service gateway caddy
docker compose up -d geography-service gateway caddy
docker compose ps --format "table {{.Name}}\t{{.Status}}"   # attendre "healthy" sur gateway et geography-service
```

Vérification fonctionnelle (remplacer `localhost:8080` par l'hôte réel si testé à distance) :

```bash
curl -s -w "\nHTTP %{http_code}\n" "http://localhost:8080/api/v2/geography/resolve?lat=44.081&lon=3.641"

# Rejouer le corpus de référence (doc/geography-reference-corpus.json)
for pt in "val-aigoual-mairie:44.081192:3.641467" "mont-aigoual:44.1216:3.5814" \
  "paris-centre:48.8566:2.3522" "marseille-centre:43.2965:5.3698" \
  "commune-rurale:43.947:3.58" "limite-communale:44.08:3.75" \
  "gard-hors-val-aigoual:44.243:4.010167" "zone-isolee:44.15:3.55" \
  "mer:43.2:4.6" "coordonnees-invalides:91:3"; do
  id="${pt%%:*}"; rest="${pt#*:}"; lat="${rest%%:*}"; lon="${rest#*:}"
  code=$(curl -s -o /tmp/resp.json -w "%{http_code}" "http://localhost:8080/api/v2/geography/resolve?lat=${lat}&lon=${lon}")
  echo "== $id (HTTP $code) =="; cat /tmp/resp.json; echo
done
```

Attendu : `200` avec `territory`/`address`/`elevation` sur les points terrestres (`address.status: "not_found"` toléré en zone rurale sans adresse structurée), `404 LOCATION_NOT_RESOLVABLE` sur `mer`, `400 INVALID_COORDINATES` sur `coordonnees-invalides`. Le point `fournisseur-indisponible` du corpus est simulé (timeout/503 injecté), déjà couvert par les tests automatisés — pas d'appel réel à rejouer.

Enfin, vérifier la non-régression des routes historiques (aucun changement attendu) :

```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" "http://localhost:8080/api/territoire"
```

## Rollback

Restaurer l'image précédente de `gateway` et, si le `Caddyfile` a été modifié dans ce déploiement, l'image précédente de `caddy` également ; arrêter `geography-service` ; puis revérifier les routes `/api/*` historiques. Aucun écran ne dépend encore de la route V2, donc ce retrait ne requiert ni migration ni changement frontend.

## Futur `weather-service`

Il doit appeler le gateway ou consommer le contrat géographique versionné ; il ne doit pas redéduire commune, adresse ou altitude ni sélectionner une station dans `geography-service`.
