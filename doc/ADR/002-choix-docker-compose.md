# ADR-002 : Choix de Docker Compose pour l'orchestration

## Statut
✅ Accepté

## Contexte

Le projet nécessite une infrastructure de déploiement qui :
- Permette de gérer plusieurs services (frontend, backend API, worker, base de données)
- Soit facile à déployer et à maintenir
- Offre une bonne isolation entre les composants
- Permette un déploiement local identiques à la production
- Supporte les conteneurs géospatiaux (PostGIS)

**Problème à résoudre** : Quelle solution d'orchestration choisir pour un projet avec :
1. 3-4 services distincts (web, api, worker, postgres)
2. Besoin de persistance des données (PostgreSQL/PostGIS)
3. Déploiement sur VPS unique
4. Développement local simplifié

**Contraintes** :
- Budget limité (pas de Kubernetes managed)
- Équipe réduite (1 développeur)
- Besoin de simplicité
- Compatibilité avec les outils DevOps standards

## Décision

**Utiliser Docker Compose comme solution d'orchestration conteneurisée.**

### Architecture retenue :
```
VPS /
├── docker-compose.yml    - Orchestration des services
├── Dockerfile.*          - Build des images
└── .env                  - Configuration

Services :
├── web     (nginx)       - Frontend statique Astro
├── api     (Fastify)    - Backend API RESTful
├── worker  (TypeScript)  - Ingestion des données
└── postgres (PostGIS)    - Base de données géospatiale
```

### Choix spécifiques :
- **Docker Compose v2+** : Orchestration multi-conteneurs
- **Docker Engine** : Runtime conteneur
- **Build multi-stage** : Images optimisées
- **Volumes nommés** : Persistance PostgreSQL
- **Réseau interne** : Communication sécurisée entre services

## Conséquences

### Positives
- ✅ **Simplicité** : Fichier `docker-compose.yml` unique pour toute l'infrastructure
- ✅ **Parité dev/prod** : Même configuration locale et en production
- ✅ **Isolation** : Chaque service dans son conteneur
- ✅ **Portabilité** : Déploiement identique sur n'importe quel VPS
- ✅ **Gestion des dépendances** : Version exacte de chaque service
- ✅ **PostgreSQL/PostGIS** : Image officielle disponible et bien maintenue
- ✅ **Réseautage** : Communication interne via noms de service
- ✅ **Volumes** : Persistance des données via volumes Docker
- ✅ **Logs centralisés** : `docker-compose logs` pour tous les services

### Négatives
- ❌ **Pas de scaling automatique** : Nécessite une intervention manuelle
- ❌ **Single host** : Tous les services sur un seul VPS
- ❌ **Downtime lors des mises à jour** : Nécessite une stratégie de rollout
- ❌ **Complexité pour le high availability** : Pas adapté aux architectures distribuées

## Alternatives considérées

### 1. Kubernetes (k8s)
- ✅ Scaling automatique
- ✅ High availability
- ✅ Écosystème riche
- ❌ **Trop complexe** pour 4 services et 1 VPS
- ❌ Courbe d'apprentissage très raide
- ❌ Overhead significatif pour un petit projet
- ❌ Nécessite des outils supplémentaires (Helm, Ingress, etc.)
- 📌 **Pourquoi rejetée** : Surdimensionné, complexité inutile

### 2. Podman Compose
- ✅ Compatible Docker Compose
- ✅ Pas besoin de daemon
- ✅ Rootless possible
- ❌ Moins mature que Docker
- ❌ Communauté plus petite
- ❌ Moins de documentation
- 📌 **Pourquoi rejetée** : Docker est plus mature et largement adopté

### 3. Déploiement manuel (sans conteneurs)
- ✅ Pas de dépendance à Docker
- ✅ Contrôle total
- ❌ **Incohérences dev/prod** : Difficile à reproduire localement
- ❌ Gestion complexe des dépendances
- ❌ Pas d'isolation entre services
- ❌ Difficile à maintenir
- 📌 **Pourquoi rejetée** : Non reproductible, risque élevé d'erreurs

### 4. Serverless (Cloudflare Pages / Netlify)
- ✅ Pas de gestion de serveur
- ✅ Scaling automatique
- ✅ Coût initial faible
- ❌ **Pas adapté pour PostgreSQL** : Nécessite un service externe (Supabase, etc.)
- ❌ Coûts cachés à l'échelle
- ❌ Vendor lock-in
- ❌ Moins de contrôle sur l'infrastructure
- 📌 **Pourquoi rejetée** : Incompatible avec PostGIS auto-hébergé

### 5. Ansible / Terraform
- ✅ Infrastructure as Code
- ✅ Bonne pour la reproductibilité
- ❌ **Complexité supplémentaire** pour un seul VPS
- ❌ Courbe d'apprentissage
- ❌ Surdimensionné pour nos besoins
- 📌 **Pourquoi rejetée** : Docker Compose suffit pour nos besoins

## Notes supplémentaires

### Structure du docker-compose.yml

```yaml
version: '3.8'

services:
  # Frontend statique
  web:
    build:
      context: .
      dockerfile: Dockerfile.web
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./dist:/usr/share/nginx/html:ro
    depends_on:
      - api
    restart: unless-stopped

  # Backend API
  api:
    build:
      context: .
      dockerfile: Dockerfile.api
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=${DATABASE_URL}
    depends_on:
      - postgres
    restart: unless-stopped

  # Worker d'ingestion
  worker:
    build:
      context: .
      dockerfile: Dockerfile.worker
    environment:
      - DATABASE_URL=${DATABASE_URL}
    volumes:
      - ./db/migrations:/app/db/migrations:ro
    depends_on:
      - postgres
    restart: unless-stopped

  # Base de données
  postgres:
    image: postgis/postgis:16-alpine
    environment:
      - POSTGRES_DB=${POSTGRES_DB}
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    restart: unless-stopped

volumes:
  postgres_data:
```

### Stratégie de déploiement

1. **Build local** : `docker-compose build`
2. **Stop services** : `docker-compose down`
3. **Pull images** : `docker-compose pull`
4. **Start services** : `docker-compose up -d`
5. **Migration automatique** : Le worker exécute les migrations au démarrage

### Initialisation des données
- `RUN_ONCE=true` : Mode initialisation (toutes les sources exécutées une fois)
- `RUN_ONLY=<slug>` : Exécuter une seule source

### Monitoring
- Logs : `docker-compose logs -f <service>`
- Stats : `docker stats`
- Health : `docker ps` pour vérifier les états

### Sauvegardes
- Sauvegarde PostgreSQL : `docker exec postgres pg_dump -U user db > backup.sql`
- Restauration : `docker exec -i postgres psql -U user db < backup.sql`

## Liens
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [PostGIS Docker Image](https://hub.docker.com/r/postgis/postgis/)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)

---

## Historique
| Date | Auteur | Action |
|------|--------|--------|
| 2026-07-08 | Architecte | Décision initiale (initialement prévu Astro + serverless) |
| 2026-07-09 | Architecte | Réévaluation pour Brique 1 : passage à Docker Compose + VPS |
| 2026-07-10 | Agent | Documentation ADR |
