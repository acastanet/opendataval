# ADR-007 : Ingestion planifiée via Worker

## Statut
✅ Accepté

## Contexte

Le projet doit ingérer des données provenants de multiples sources OpenData :
- API publiques (Géorisques, INSEE, Hub'Eau, etc.)
- Fichiers CSV/GeoJSON (OFGL, etc.)
- Flux temps réel (Météo-France, Atmo Occitanie)

**Problème à résoudre** : Comment organiser l'ingestion des données pour :
1. Mettre à jour les données régulièrement
2. Respecter le fair-use des API publiques (pas de spam)
3. Gérer les erreurs et les relances
4. Centraliser le logging
5. Permettre l'initialisation des données

**Contraintes** :
- Certaines API ont des limites de rate (ex: 5 req/s pour l'IGN)
- Certaines sources nécessitent des clés API
- Données à différentes fréquences (temps réel, quotidien, mensuel)
- Besoin de traçabilité (qui a mis à jour quoi, quand, avec quel résultat)

## Décision

**Utiliser un Worker dédié pour l'ingestion planifiée des données, avec exécution périodique via cron.**

### Architecture retenue :
```
Worker /
├── src/
│   ├── index.ts          - Point d'entrée, initialisation
│   ├── scheduler.ts      - Planification des jobs (cron)
│   ├── sources/
│   │   ├── georisques.ts - Script d'ingestion Géorisques
│   │   ├── ofgl.ts       - Script d'ingestion OFGL
│   │   ├── insee.ts      - Script d'ingestion INSEE
│   │   └── ...
│   ├── helpers/
│   │   ├── fetch.ts      - Fonctions de fetch réutilisables
│   │   └── transform.ts  - Fonctions de transformation
│   └── types/
│       └── *.ts          - Types TypeScript
└── Dockerfile

Système de planification :
├── Job 1 : georisques  - cron: "0 */6 * * *" (toutes les 6h)
├── Job 2 : ofgl       - cron: "0 3 * * 1" (lundi 3h)
├── Job 3 : insee      - cron: "0 4 * * *" (quotidien 4h)
├── Job 4 : hubeau     - cron: "*/30 * * * *" (toutes les 30min)
└── Job 5 : meteo     - cron: "*/15 * * * *" (toutes les 15min, 🔑 clé requise)
```

### Choix spécifiques :
- **Un script par source** : `apps/worker/src/sources/<slug>.ts`
- **Scheduler centralisé** : `apps/worker/src/scheduler.ts` avec tableau `JOBS`
- **Cron expressions** : Pour la planification
- **Mode RUN_ONCE** : Pour l'initialisation (`RUN_ONCE=true`)
- **Mode RUN_ONLY** : Pour exécuter une seule source (`RUN_ONLY=<slug>`)
- **Logging centralisé** : Table `meta.logs` dans PostgreSQL

## Conséquences

### Positives
- ✅ **Centralisation** : Toutes les sources gérées au même endroit
- ✅ **Planification flexible** : Chaque source a sa propre fréquence
- ✅ **Fair-use respecté** : Pas de spam des API publiques
- ✅ **Traçabilité** : Logging complet de toutes les opérations
- ✅ **Reprise après erreur** : Les erreurs sont loggées et peuvent être relancées
- ✅ **Initialisation facile** : `RUN_ONCE=true` pour charger toutes les données
- ✅ **Testable** : Chaque source peut être testée individuellement
- ✅ **Maintenable** : Un seul endroit pour comprendre l'ingestion
- ✅ **Extensible** : Ajout d'une nouvelle source = un seul fichier

### Négatives
- ❌ **Complexité du Worker** : Beaucoup de responsabilité dans un seul service
- ❌ **Dépendance unique** : Si le Worker tombe, plus d'ingestion
- ❌ **Mémoire** : Le Worker doit tenir en mémoire toutes les dépendances
- ❌ **Temps de démarrage** : Peut être long si beaucoup de sources
- ❌ **Debugging** : Plus complexe à debuguer que des fonctions serverless

## Alternatives considérées

### 1. Fonctions Serverless (Cloudflare Workers, AWS Lambda)
- ✅ Scaling automatique
- ✅ Pas de gestion de serveur
- ✅ Exécution à la demande
- ❌ **Coût** : Peut devenir cher avec beaucoup d'exécutions
- ❌ **Cold start** : Latence au premier appel
- ❌ **Limite de durée** : Timeout après quelques secondes/minutes
- ❌ **Complexité** : Difficile de gérer des jobs longs (ingestion de gros fichiers)
- ❌ **PostgreSQL** : Difficile à connecter depuis serverless
- 📌 **Pourquoi rejetée** : Incompatible avec notre architecture Docker/PostGIS

### 2. Airflow / Dagster / Prefect
- ✅ Planification avancée
- ✅ DAG (Directed Acyclic Graph) pour les dépendances
- ✅ UI de monitoring intégrée
- ✅ Reprise après erreur sophistiquée
- ❌ **Trop lourd** pour nos besoins simples
- ❌ **Complexité** : Courbe d'apprentissage très raide
- ❌ **Overhead** : Beaucoup de composants à maintenir
- ❌ **Surdimensionné** : Pour ~10 sources avec des cron simples
- 📌 **Pourquoi rejetée** : Trop complexe pour notre cas d'usage

### 3. Cron jobs système
- ✅ Simple
- ✅ Natif sur Linux
- ❌ **Pas de logging centralisé**
- ❌ **Difficile à monitorer**
- ❌ **Gestion des erreurs manuelle**
- ❌ **Pas portable** : Difficile à transférer sur un autre serveur
- ❌ **Pas de Docker** : Incompatible avec notre architecture
- 📌 **Pourquoi rejetée** : Moins maintenable et moins portable

### 4. BullMQ / Bull (Redis-based queue)
- ✅ Bon pour les jobs en arrière-plan
- ✅ Reprise après erreur
- ✅ Priorisation des jobs
- ✅ Monitoring intégré
- ❌ **Nécessite Redis** : Complexité supplémentaire
- ❌ **Overkill** : Pour des jobs planifiés simples
- ❌ **Complexité** : Plus adapté aux jobs déclenchés par des événements
- 📌 **Pourquoi rejetée** : Cron suffit pour nos besoins planifiés

### 5. Ingestion directe dans l'API
- ✅ Moins de composants
- ✅ Simplicité apparente
- ❌ **Problèmes de performance** : L'API serait ralentie par l'ingestion
- ❌ **Mix des responsabilités** : L'API ne devrait pas faire d'ingestion
- ❌ **Fair-use violé** : Chaque visite déclencherait des appels API
- ❌ **Non déterministe** : Données différentes selon le moment
- 📌 **Pourquoi rejetée** : Violation des invariants architecturaux

## Notes supplémentaires

### Structure du Worker

```typescript
// apps/worker/src/index.ts
import { runScheduler } from './scheduler';
import { runOnce } from './run-once';
import { getPool } from '@opendata-vda/shared';

async function main() {
  const pool = getPool();
  
  // Appliquer les migrations si nécessaire
  await applyMigrations(pool);
  
  // Vérifier si mode RUN_ONCE
  if (process.env.RUN_ONCE === 'true') {
    await runOnce(pool);
    return;
  }
  
  // Vérifier si mode RUN_ONLY
  if (process.env.RUN_ONLY) {
    await runOnly(pool, process.env.RUN_ONLY);
    return;
  }
  
  // Mode normal : lancer le scheduler
  await runScheduler(pool);
}

main().catch(console.error);
```

### Scheduler

```typescript
// apps/worker/src/scheduler.ts
import { Pool } from 'pg';
import * as georisques from './sources/georisques';
import * as ofgl from './sources/ofgl';
import * as insee from './sources/insee';
import * as hubeau from './sources/hubeau';
// ... autres imports

interface Job {
  slug: string;
  nom: string;
  cron: string;
  run: (pool: Pool) => Promise<number>;
  enabled: boolean;
}

export const JOBS: Job[] = [
  {
    slug: 'georisques',
    nom: 'Géorisques (BRGM)',
    cron: '0 */6 * * *',  // Toutes les 6 heures
    run: georisques.run,
    enabled: true
  },
  {
    slug: 'ofgl',
    nom: 'OFGL (Finances)',
    cron: '0 3 * * 1',  // Lundi à 3h
    run: ofgl.run,
    enabled: true
  },
  {
    slug: 'insee',
    nom: 'INSEE (Population)',
    cron: '0 4 * * *',  // Tous les jours à 4h
    run: insee.run,
    enabled: true
  },
  {
    slug: 'hubeau',
    nom: 'HubEau (Hydrométrie)',
    cron: '*/30 * * * *',  // Toutes les 30 minutes
    run: hubeau.run,
    enabled: true
  },
  {
    slug: 'meteo',
    nom: 'Météo-France (🔑)',
    cron: '*/15 * * * *',  // Toutes les 15 minutes
    run: meteo.run,
    enabled: process.env.METEO_API_KEY ? true : false  // Désactivé sans clé
  }
];

export async function runScheduler(pool: Pool) {
  // Initialiser cron
  import { CronJob } from 'cron';
  
  JOBS.forEach(job => {
    if (!job.enabled) return;
    
    new CronJob(
      job.cron,
      async () => {
        try {
          console.log(`[${job.slug}] Démarrage...`);
          const nbLignes = await job.run(pool);
          console.log(`[${job.slug}] ${nbLignes} objets mis à jour`);
        } catch (err) {
          console.error(`[${job.slug}] Erreur:`, err);
        }
      },
      null,
      true,
      'Europe/Paris'
    );
  });
  
  console.log('Scheduler démarré');
}
```

### Script source type

```typescript
// apps/worker/src/sources/georisques.ts
import type { Pool } from 'pg';
import { 
  upsertObjetsEnLot, 
  logFetchStart, 
  logFetchEnd,
  type ObjetGeo 
} from '@opendata-vda/shared';

const API_URL = 'https://georisques.gouv.fr/api/v1/gaspar/risques';
const COUCHE = 'risques';

export async function run(pool: Pool): Promise<number> {
  const logId = await logFetchStart(pool, 'georisques', {
    url: API_URL,
    licence: 'Licence Ouverte 2.0'
  });
  
  try {
    // 1. Fetch depuis l'API
    const response = await fetch(`${API_URL}?code_insee=30339`, {
      headers: { 'User-Agent': 'OpenDataVdA Worker' }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const rawData = await response.json();
    
    // 2. Transformer en objets
    const objets: ObjetGeo[] = rawData
      .filter((r: any) => r.geometry)  // Filtrer les risques sans géométrie
      .map((r: any) => ({
        id: String(r.id),
        nom: r.nom || `${r.type} - ${r.code}`,
        geometrie: r.geometry,
        props: {
          type: r.type,
          niveau: r.niveau,
          description: r.description,
          source: 'georisques',
          source_id: String(r.id),
          source_url: API_URL,
          licence: 'Licence Ouverte 2.0',
          date_mise_a_jour: new Date().toISOString()
        },
        couche: COUCHE
      }));
    
    // 3. Filtrer sur le territoire (déjà fait par l'API avec code_insee=30339)
    // Mais on peut filtrer aussi sur l'EPCI
    const filtered = objets.filter(obj => {
      if (obj.props?.code_epci) {
        return obj.props.code_epci === '200034601';
      }
      return true;
    });
    
    // 4. Upsert dans la base
    const nbLignes = await upsertObjetsEnLot(pool, COUCHE, filtered);
    
    await logFetchEnd(pool, logId, 'ok', nbLignes);
    return nbLignes;
    
  } catch (err) {
    await logFetchEnd(pool, logId, 'erreur', undefined, (err as Error).message);
    throw err;
  }
}
```

### Logging dans PostgreSQL

```sql
-- Table de logs
CREATE TABLE meta.logs (
    id SERIAL PRIMARY KEY,
    source VARCHAR(100) NOT NULL,        -- Nom de la source
    status VARCHAR(20) NOT NULL,        -- 'ok' ou 'erreur'
    nb_lignes INTEGER,                   -- Nombre d'objets traités
    error_message TEXT,                 -- Message d'erreur si status = 'erreur'
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMP,
    duration_ms INTEGER                 -- Durée en millisecondes
);

-- Index pour les requêtes fréquentes
CREATE INDEX idx_logs_source ON meta.logs(source);
CREATE INDEX idx_logs_status ON meta.logs(status);
CREATE INDEX idx_logs_started_at ON meta.logs(started_at);
```

```typescript
// apps/shared/src/logging.ts
export async function logFetchStart(
  pool: Pool,
  source: string,
  metadata?: Record<string, any>
): Promise<number> {
  const { rows } = await pool.query(
    `INSERT INTO meta.logs (source, status, started_at) 
     VALUES ($1, 'started', NOW()) RETURNING id`,
    [source]
  );
  return rows[0].id;
}

export async function logFetchEnd(
  pool: Pool,
  logId: number,
  status: 'ok' | 'erreur',
  nbLignes?: number,
  errorMessage?: string
) {
  await pool.query(
    `UPDATE meta.logs 
     SET status = $1, 
         nb_lignes = $2, 
         error_message = $3,
         ended_at = NOW(),
         duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
     WHERE id = $4`,
    [status, nbLignes, errorMessage, logId]
  );
}
```

### Fonctions helpers

```typescript
// apps/worker/src/helpers/fetch.ts
export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retries: number = 3
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...options?.headers,
          'User-Agent': 'OpenDataVdA Worker'
        }
      });
      
      if (response.ok) {
        return response;
      }
      
      if (response.status === 429) {
        // Rate limited, attendre avant retry
        const retryAfter = response.headers.get('Retry-After') || 5000;
        await new Promise(r => setTimeout(r, Number(retryAfter)));
        continue;
      }
      
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (err) {
      if (i === retries - 1) {
        throw err;
      }
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  
  throw new Error('Max retries exceeded');
}

// apps/worker/src/helpers/transform.ts
export function transformToObjetGeo(
  raw: any,
  config: {
    couche: string;
    source: string;
    getId: (r: any) => string;
    getNom: (r: any) => string;
    getGeometrie: (r: any) => any | null;
    getProps: (r: any) => Record<string, any>;
  }
): ObjetGeo {
  return {
    id: config.getId(raw),
    nom: config.getNom(raw),
    geometrie: config.getGeometrie(raw),
    props: {
      ...config.getProps(raw),
      source: config.source,
      source_url: raw.source_url || '',
      licence: raw.licence || 'Licence Ouverte 2.0',
      date_mise_a_jour: new Date().toISOString()
    },
    couche: config.couche
  };
}
```

### Gestion des erreurs

**Stratégies** :
1. **Retry automatique** : Pour les erreurs temporaires (rate limiting, timeout)
2. **Logging détaillé** : Toutes les erreurs sont loggées dans `meta.logs`
3. **Notification** : Envisager des alertes pour les erreurs répétées
4. **Mode dégradé** : Si une source échoue, les autres continuent

### Monitoring

```typescript
// apps/worker/src/monitoring.ts
export async function getStats(pool: Pool) {
  // Stats globales
  const { rows: globalStats } = await pool.query(`
    SELECT 
      COUNT(*) as total_logs,
      SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) as success_count,
      SUM(CASE WHEN status = 'erreur' THEN 1 ELSE 0 END) as error_count,
      AVG(duration_ms) as avg_duration_ms
    FROM meta.logs
  `);
  
  // Stats par source
  const { rows: sourceStats } = await pool.query(`
    SELECT 
      source,
      COUNT(*) as count,
      SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) as success_count,
      SUM(CASE WHEN status = 'erreur' THEN 1 ELSE 0 END) as error_count,
      AVG(duration_ms) as avg_duration_ms,
      MAX(ended_at) as last_run
    FROM meta.logs
    GROUP BY source
    ORDER BY count DESC
  `);
  
  return { globalStats, sourceStats };
}
```

### Initialisation (RUN_ONCE)

```typescript
// apps/worker/src/run-once.ts
export async function runOnce(pool: Pool) {
  console.log('Mode RUN_ONCE: Exécution de toutes les sources une fois');
  
  for (const job of JOBS) {
    if (!job.enabled) continue;
    
    try {
      console.log(`[${job.slug}] Exécution...`);
      const nbLignes = await job.run(pool);
      console.log(`[${job.slug}] ✅ ${nbLignes} objets traités`);
    } catch (err) {
      console.error(`[${job.slug}] ❌ Erreur:`, err);
    }
  }
  
  console.log('Initialisation terminée');
  process.exit(0);
}
```

### Exécution unique (RUN_ONLY)

```typescript
// apps/worker/src/run-only.ts
export async function runOnly(pool: Pool, slug: string) {
  const job = JOBS.find(j => j.slug === slug);
  
  if (!job) {
    console.error(`Source inconnue: ${slug}`);
    process.exit(1);
  }
  
  if (!job.enabled) {
    console.error(`Source désactivée: ${slug}`);
    process.exit(1);
  }
  
  try {
    console.log(`[${job.slug}] Exécution unique...`);
    const nbLignes = await job.run(pool);
    console.log(`[${job.slug}] ✅ ${nbLignes} objets traités`);
  } catch (err) {
    console.error(`[${job.slug}] ❌ Erreur:`, err);
    process.exit(1);
  }
  
  process.exit(0);
}
```

### Exemples de commandes

```bash
# Démarrer le worker en mode normal (scheduler)
docker-compose up worker

# Initialiser toutes les données (première exécution)
docker-compose run --rm worker sh -c "RUN_ONCE=true tsx src/index.ts"

# Exécuter une seule source
docker-compose run --rm worker sh -c "RUN_ONLY=georisques tsx src/index.ts"

# Forcer l'exécution d'une source en mode normal
docker-compose run --rm worker sh -c "RUN_ONLY=ofgl tsx src/index.ts"

# Voir les logs
docker-compose logs -f worker

# Vérifier les stats
docker-compose exec worker sh -c "tsx src/monitoring.ts"
```

### Performances et optimisations

**Optimisations mises en place** :
- **Batch inserts** : `upsertObjetsEnLot` pour insérer en masse
- **Transactions** : Utilisation de transactions PostgreSQL
- **Retry avec backoff** : Pour les API temporairement indisponibles
- **Logging asynchrone** : Ne bloque pas l'exécution
- **Stream processing** : Pour les gros fichiers (envisagé)

**Benchmarks attendus** :
- 100-500 objets/seconde selon la complexité
- Temps d'exécution par source : quelques secondes à quelques minutes
- Mémoire utilisée : < 100 Mo par exécution

### Sécurité

**Mesures de sécurité** :
- **User-Agent** : Toujours défini à 'OpenDataVdA Worker'
- **Rate limiting** : Respect des limites des API (retry avec backoff)
- **Timeouts** : Timeout sur les requêtes HTTP
- **Clés API** : Stockées dans les variables d'environnement, jamais dans le code
- **Validation** : Toutes les données sont validées avant insertion

## Liens
- [node-cron Documentation](https://github.com/node-cron/node-cron)
- [PostgreSQL cron](https://www.postgresql.org/docs/current/pgcron.html) (alternative)
- [BullMQ Documentation](https://docs.bullmq.io/) (si besoin de queue avancée)

---

## Historique
| Date | Auteur | Action |
|------|--------|--------|
| 2026-07-08 | Architecte | Décision initiale (Worker prévu dans la vision globale) |
| 2026-07-09 | Architecte | Confirmation pour la Brique 1 avec cron |
| 2026-07-10 | Agent | Documentation ADR |
