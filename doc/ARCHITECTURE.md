# ARCHITECTURE.md
> **Documentation Technique** — Portail OpenData Val-d'Aigoual
> Version 1.0 — 2026-07-10

---

## 🏗️ SCHÉMA GÉNÉRAL

```
┌─────────────────────────────────────────────────────────────┐
│                        INTERNET                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      CADDY (Reverse Proxy)                       │
│  - HTTPS termination (Let's Encrypt)                           │
│  - Routing: /api -> Fastify, /* -> Astro                         │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────────┴───────────────────┐
              │                                   │
              ▼                                   ▼
┌─────────────────────────┐         ┌─────────────────────────┐
│      FASTIFY API          │         │        ASTRO WEB         │
│  - Node.js 22 + TypeScript │         │  - Static Site Generator │
│  - Routes GeoJSON         │         │  - Ïlots Svelte          │
│  - Routes metadonnees     │         │  - MapLibre GL JS        │
│  - Cache des reponses     │         │  - Fond IGN WMTS         │
└─────────────────────────┘         └─────────────────────────┘
              │                                   │
              └───────────────────┬───────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    POSTGRESQL + POSTGIS                         │
│  - PostgreSQL 16                                            │
│  - PostGIS 3.4 (extension spatiale)                          │
│  - Stockage: donnees geo + metadonnees + cache               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      WORKER (Background)                        │
│  - Node.js 22 + TypeScript + tsx                               │
│  - Fetch des donnees depuis les API publiques                │
│  - Traitement: nettoyage, geocodage, enrichissement           │
│  - Persistance: ecriture en DB + generation JSON              │
│  - Planification: Cron jobs (toutes les heures)                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 ORCHESTRATION

**Docker Compose** : `docker-compose.yml`

**Services** :
- `caddy` : Reverse proxy + HTTPS (port 80/443)
- `api` : Fastify API (port 4000)
- `web` : Astro frontend (port 3000)
- `db` : PostgreSQL/PostGIS (port 5432)
- `worker` : Background jobs

---

## 🗄️ BASE DE DONNÉES

### PostgreSQL + PostGIS
- **Version** : PostgreSQL 16 + PostGIS 3.4
- **Schémas** : `public` (tables métiers)

### Tables Principales
| Table | Description | Volume |
|---|---|---|
| `sources` | Catalogue des sources | ~20 |
| `datasets` | Jeux de données importés | ~100 |
| `geojson_cache` | Cache des géométries | Variable |
| `metrics` | Indicateurs calculés | ~50 |
| `audit_log` | Historique des imports | Croissance |

### Conventions
- Tables : `snake_case`
- Colonnes : `snake_case`
- Index spatiaux : `CREATE INDEX idx_<table>_geom ON <table> USING GIST(geom)`

---

## 🔌 API FASTIFY

### Structure
```
apps/api/src/
├── routes/
│   ├── couches.ts       # Routes GeoJSON
│   ├── sources.ts       # Catalogue
│   ├── metrics.ts       # Indicateurs
│   └── health.ts        # Health check
└── lib/
    ├── db.ts            # Connexion DB
    └── utils.ts         # Utilitaires
```

### Endpoints
| Méthode | Route | Description | Cache |
|---|---|---|---|
| GET | `/api/health` | Health check | Non |
| GET | `/api/sources` | Liste des sources | 1h |
| GET | `/api/couches` | Liste des couches GeoJSON | 1h |
| GET | `/api/metrics` | Indicateurs globaux | 5min |

---

## 🖥️ FRONTEND ASTRO

### Structure
```
apps/web/src/
├── pages/              # 14 pages thematiques
├── islands/            # Composants Svelte interactifs
│   ├── MapExplorer.svelte   # Carte principale
│   └── Chart*.svelte       # Graphiques
├── components/         # Composants Astro
├── data/               # Donnees statiques (build-time)
└── config/             # Configuration
```

### Carte (MapLibre GL JS)
- **Fonds** : IGN PLANIGNV2, ORTHOPHOTOS, ELEVATION.SLOPES
- **Couches** : Contour commune, 15 communes EPCI, Natura 2000, ZNIEFF, stations HubEau, sentiers, POI OSM
- **Centre** : Mont Aigoual (44.1216, 3.5814), zoom 11

---

## ⚙️ WORKER

### Principe
1. **Fetch** : Appel aux API publiques
2. **Transform** : Nettoyage, géocodage
3. **Persist** : Écriture en DB + JSON

### Stratégie des données
| Type | Exemple | Fréquence | Stockage |
|---|---|---|---|
| Build-time | Contours, population | Build | DB + JSON |
| Runtime | Météo, air | Heure | DB |
| Client-side | Tuiles WMTS | À la demande | Cache navigateur |

### Points de vigilance
- **OFGL** : API v2.1 uniquement
- **HubEau** : User-Agent serveur obligatoire
- **data.gouv** : Filtrer par code INSEE, pas par nom

---

## 🌐 API EXTERNES

### Sans clé (15/17)
| Source | Endpoint | Frequence |
|---|---|---|
| geo.api.gouv.fr | `/communes/30339` | Jour | JSON |
| hubeau.eaufrance.fr | `/api/v2/hydrometrie` | Heure | JSON |
| georisques.gouv.fr | `/api/v1/gaspar` | Semaine | JSON |
| apicarto.ign.fr | `/api/cadastre` | Semaine | GeoJSON |

### Avec clé 🔑 (2/17)
| Source | Endpoint | Clé |
|---|---|---|
| Météo-France | `portail-api.meteofrance.fr` | Token OAuth |
| DATAtourisme | `api.datatourisme.fr` | Clé API |

---

## 📁 DONNÉES

### Statiques (build-time)
- **Emplacement** : `apps/web/src/data/*.json`
- **Generation** : Scripts `scripts/fetch-*.mjs`

### Dynamiques (runtime)
- **Emplacement** : PostgreSQL
- **Tables** : `hubeau_observations`, `meteo_observations`, `air_quality`

---

## 🔐 SÉCURITÉ

- **Toutes les données sont publiques** (Licence Ouverte / ODbL)
- **Pas d'authentification**
- **Clés API** dans `.env` uniquement (jamais en commit)

### Variables d'environnement
```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=opendata_vda
METEO_FRANCE_TOKEN=xxx
DATATOURISME_KEY=yyy
```

---

## ⚡ PERFORMANCES

- **Temps de réponse API** : < 200ms (cache) / < 1s (sans cache)
- **Temps de chargement** : < 2s
- **Lighthouse Perf** : > 80
- **Lighthouse Accessibilité** : > 90

---

## 🛠️ OUTILS

| Composant | Technologie | Version | Rôle |
|---|---|---|---|
| API | Node.js + Fastify | 22.x | REST API |
| Worker | Node.js + tsx | 22.x | Background jobs |
| Frontend | Astro | 4.x | Static Site |
| Composants | Svelte | 5.x | Îlots interactifs |
| Carte | MapLibre GL JS | 4.x | Cartographie |
| DB | PostgreSQL | 16.x | Base de données |
| Spatial | PostGIS | 3.4 | Extension spatiale |
| Proxy | Caddy | 2.x | Reverse proxy |

---

## 🚀 DÉPLOIEMENT

```bash
# Dev
docker compose up -d

# Prod
docker compose -f docker-compose.prod.yml up -d
```

---

## 📝 CONVENTIONS

- **TypeScript** : Strict mode
- **Nommage** : `camelCase` (fonctions/variables), `PascalCase` (classes)
- **Commits** : `feat(scope): message` ou `fix(scope): message`
- **Errors** : Toujours `try/catch` pour async

---

> **Document maintenu par** : Architecte
> **Version** : 1.0 — 2026-07-10