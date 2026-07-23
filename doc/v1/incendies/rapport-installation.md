# Rapport d'installation — Mini-app incendies sur https://euporie.cloud/feu

**Date** : 17 juillet 2026
**Auteur** : déploiement automatisé (Hermes)
**Cible** : serveur hôte `195.20.241.54` (euporie.cloud), stack Docker Compose locale + reverse proxy nginx existant

---

## 1. Objectif

Mettre la mini-app « Risque incendie — Aigoual & Cévennes » (portail OpenData Val-d'Aigoual)
en ligne sur l'URL publique **https://euporie.cloud/feu**, en HTTPS, sans toucher au reste
du portail ni au serveur nginx principal.

---

## 2. Architecture retenue

```
Internet
  │  HTTPS :443  (certificat Let's Encrypt existant sur euporie.cloud)
  ▼
nginx  (hôte, /etc/nginx/sites-enabled/euporie.cloud)
  │  location /feu/        → proxy_pass http://127.0.0.1:8080/incendies/
  │  location /feu/_astro/ → proxy_pass http://127.0.0.1:8080/_astro/
  │  location /feu/api/    → proxy_pass http://127.0.0.1:8080/api/
  │  location /_astro/     → proxy_pass http://127.0.0.1:8080/_astro/   (fallback racine)
  │  location /incendies/  → proxy_pass http://127.0.0.1:8080/incendies/ (fallback)
  │  location /api/incendies/ → proxy_pass http://127.0.0.1:8080/api/incendies/ (fallback)
  ▼
Caddy  (conteneur opendataval-caddy, build du repo, écoute :8080)
  │  http://{$SITE_DOMAIN:localhost}  → SITE_DOMAIN=euporie.cloud
  │  /incendies/ et /incendies/temps-reel/ = pages statiques (Astro)
  │  /api/* = reverse proxy vers l'API Fastify (conteneur api:3000)
  ▼
API Fastify (api:3000) ⇄ PostgreSQL/PostGIS (db:5432)
Worker (ingestion FIRMS, risque Gard, zones) ⇄ même base
```

La mini-app est donc servie **sous le préfixe `/feu`** par réécriture nginx, alors que
le Caddy local la sert sous `/incendies`. Aucune modification du code de l'application
n'a été nécessaire (pas de changement du `base` Astro) : le routage est entièrement porté
par nginx + Caddy.

---

## 3. Étapes réalisées

### 3.1 Récupération et build
- `git clone https://github.com/acastanet/opendataval.git` → `/root/opendataval`
- Création du `.env` (ignoré par git) à partir des valeurs fournies :
  - `POSTGRES_*` (db / opendata / opendata_vda)
  - `METEOFRANCE_API_TOKEN` (présent)
  - `NASA_FIRMS_MAP_KEY` (présent)
  - `SITE_DOMAIN=euporie.cloud`
- `docker compose up -d --build` → images `opendataval-api`, `opendataval-worker`,
  `opendataval-caddy` construites et démarrées.
- Migrations PostGIS appliquées (001 → 006). Worker : 18/19 jobs OK
  (seul `entreprises` en 429 rate-limit SIRENE, relançable).

### 3.2 Fichiers relief PMTiles
Les fichiers `apps/web/public/relief/aigoual.pmtiles` et `aigoual-hd.pmtiles` sont
**absents du dépôt**. Pour ne pas bloquer le démarrage de Caddy (mounts requis), deux
fichiers **vides (0 octet)** ont été créés localement. La carte relief 3D est donc
inactive jusqu'à dépôt des vrais fichiers (~2 Go) — le reste du site est indépendant.
Ces fichiers vides ne sont pas suivis par git.

### 3.3 Exposition web via nginx (euporie.cloud)
Le serveur nginx de l'hôte sert déjà euporie.cloud en HTTPS et proxyfie de nombreux
sous-services locaux (`/geo2`, `/vikunja`, `/tache`, etc.). Ajout des blocs suivants
dans `/etc/nginx/sites-enabled/euporie.cloud` (backup : `euporie.cloud.bak.20260717-185044`) :

```nginx
# Mini-app incendies — /feu/incendies/* -> Caddy /incendies/*
location /feu/incendies/ {
    proxy_pass http://127.0.0.1:8080/incendies/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffer_size 128k; proxy_buffers 4 256k; proxy_busy_buffers_size 256k;
}
# Mini-app incendies — page principale /feu/
location /feu/ {
    proxy_pass http://127.0.0.1:8080/incendies/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Accept-Encoding "";
    proxy_buffer_size 128k; proxy_buffers 4 256k; proxy_busy_buffers_size 256k;
    sub_filter_types text/html text/css application/javascript application/json;
    sub_filter_once off;
    sub_filter 'href="/' 'href="/feu/';
    sub_filter 'src="/' 'src="/feu/';
    sub_filter '"/api/' '"/feu/api/';
    sub_filter 'fetch("/' 'fetch("/feu/';
    sub_filter "'/api/" "'/feu/api/";
}
location /feu/_astro/  { proxy_pass http://127.0.0.1:8080/_astro/;     /* + headers */ }
location /feu/api/     { proxy_pass http://127.0.0.1:8080/api/;        /* + headers */ }
location /_astro/      { proxy_pass http://127.0.0.1:8080/_astro/;     /* fallback racine */ }
location /incendies/   { proxy_pass http://127.0.0.1:8080/incendies/;  /* fallback */ }
location /api/incendies/ { proxy_pass http://127.0.0.1:8080/api/incendies/; /* fallback fetch JS */ }
```

`nginx -t` validé, `nginx -s reload` appliqué. Les `.bak` obsolètes ont été retirés de
`sites-enabled` pour éviter les avertissements de server_name en conflit.

### 3.4 Réglage Caddy (SITE_DOMAIN)
Le Caddyfile du repo écoute `http://{$SITE_DOMAIN:localhost}`. Pour que les requêtes
nginx (Host: `euporie.cloud`) soient acceptées, `SITE_DOMAIN` a été mis à `euporie.cloud`
dans `.env` et le conteneur caddy recréé (`docker compose up -d caddy`).

---

## 4. Vérifications finales

| Contrôle | URL | Résultat |
|---|---|---|
| Page principale | `https://euporie.cloud/feu/` | 200 ✓ |
| Page temps réel | `https://euporie.cloud/feu/temps-reel/` | 200 ✓ |
| Page nav /incendies/ | `https://euporie.cloud/feu/incendies/` | 200 ✓ |
| Page nav /incendies/temps-reel/ | `https://euporie.cloud/feu/incendies/temps-reel/` | 200 ✓ |
| API situation | `https://euporie.cloud/feu/api/incendies/situation` | 200 ✓ (JSON risque Gard) |
| API détections | `https://euporie.cloud/feu/api/incendies/detections` | 200 ✓ (GeoJSON) |
| Assets CSS/JS (`/_astro` + `/feu/_astro`) | `https://euporie.cloud/_astro/*.js`, `/feu/_astro/*.css` | 200 ✓ (plus de 404) |
| HTTP → HTTPS | `http://euporie.cloud/feu/` | 301 ✓ |
| Health API | `https://euporie.cloud/feu/api/health` | 200 ✓ |

Stack Docker : `db` (healthy), `api`, `worker`, `caddy` tous `Up`.

---

## 5. Points d'attention

1. **Assets absolus Astro** : Astro génère des chemins `/_astro/...` absolus pour les
   modules JS importés dynamiquement. Le `sub_filter` ne les réécrit pas tous ; les
   locations de fallback `/_astro/` et `/feu/_astro/` couvrent ces cas. Si l'app est
   rebuildée avec un `base: '/feu'` Astro, ces fallback deviendraient inutiles.
2. **Fichiers relief vides** : la carte relief 3D ne s'affiche pas tant que les vrais
   PMTiles ne sont pas déposés dans `apps/web/public/relief/`.
3. **Job `entreprises`** : en 429 (rate-limit SIRENE) au premier run. Relançable via
   `docker compose restart worker` ou au prochain cron.
4. **`insee_population`** : ignoré (clé API INSEE non fournie).
5. **Mots de passe** : `POSTGRES_PASSWORD=changeme` conservé tel que fourni (install
   locale derrière nginx). Pour une exposition directe, à durcir.
6. **Persistance nginx** : la config nginx est sur l'hôte (hors conteneur). Un
   `docker compose down` ne touche pas au proxy ; en revanche `docker compose down -v`
   détruirait la base — à ne jamais faire sans sauvegarde (voir README_agent.md).

---

## 6. Fichiers concernés

| Fichier | Modification |
|---|---|
| `/root/opendataval/.env` | `SITE_DOMAIN=euporie.cloud` (ignoré par git) |
| `/root/opendataval/apps/web/public/relief/*.pmtiles` | créés vides (ignorés par git) |
| `/etc/nginx/sites-enabled/euporie.cloud` | ajout des blocs `/feu*` (sur l'hôte, hors repo) |
| `doc/RAPPORT-INSTALLATION-INCENDIES.md` | **nouveau** (ce document, poussé sur le repo) |

---

## 7. Conclusion

La mini-app incendies est **en ligne et fonctionnelle** sur https://euporie.cloud/feu
(HTTPS, certificat Let's Encrypt renouvelé automatiquement). Les données (risque Gard
officiel, détections FIRMS, zones) sont servies par l'API Fastify et s'affichent dans le
dashboard. Aucune régression sur le reste du portail ni sur les autres services nginx.
