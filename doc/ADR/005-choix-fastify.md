# ADR-005 : Choix de Fastify pour l'API

## Statut
✅ Accepté

## Contexte

Le projet nécessite une API backend capable de :
- Servir les données géospatiales stockées dans PostGIS
- Fournir des endpoints RESTful pour le frontend
- Être performante et scalable
- S'intégrer avec TypeScript
- Gérer l'authentification (si nécessaire pour les clés API)

**Problème à résoudre** : Quel framework Node.js utiliser pour construire l'API du projet ?

**Contraintes** :
- Performance optimale pour les requêtes géospatiales
- Typage TypeScript natif
- Facilité de développement et de test
- Compatibilité avec Docker
- Intégration avec PostGIS (via `pg`)

## Décision

**Utiliser Fastify comme framework pour l'API backend.**

### Architecture retenue :
```
API (Fastify) /
├── routes/             - Endpoints RESTful
│   ├── couches.ts      - /api/couches/*
│   ├── recherche.ts    - /api/recherche
│   └── meta.ts         - /api/meta
├── plugins/            - Plugins Fastify
│   ├── postgres.ts     - Connexion PostGIS
│   ├── cors.ts         - Gestion CORS
│   └── error.ts        - Gestion des erreurs
├── schemas/            - Schémas de validation (Zod)
└── index.ts            - Initialisation Fastify
```

### Choix spécifiques :
- **Fastify v4+** : Dernière version stable
- **TypeScript** : Typage strict pour toute l'API
- **Zod** : Validation des requêtes et réponses
- **pg** : Client PostgreSQL
- **CORS** : Configuration sécurisée pour le frontend

## Conséquences

### Positives
- ✅ **Performance** : Fastify est l'un des frameworks Node.js les plus rapides
- ✅ **TypeScript first** : Excellente intégration avec TypeScript
- ✅ **Léger** : Overhead minimal
- ✅ **Modulaire** : Architecture par plugins
- ✅ **Validation intégrée** : Support natif de JSON Schema (et Zod)
- ✅ **Documentation** : Bonne documentation et communauté
- ✅ **Testable** : Facile à tester avec des snapshots
- ✅ **Docker-friendly** : Pas de dépendances système
- ✅ **Écosystème** : Beaucoup de plugins disponibles

### Négatives
- ❌ **Moins connu** que Express
- ❌ **Écosystème plus petit** (mais en croissance rapide)
- ❌ **Courbe d'apprentissage** : Différent de Express
- ❌ **Moins de middlewares** disponibles

## Alternatives considérées

### 1. Express.js
- ✅ Très connu et mature
- ✅ Grande communauté
- ✅ Beaucoup de middlewares
- ❌ **Performances inférieures** à Fastify
- ❌ **Typage TypeScript** moins bon
- ❌ **Moins structuré** : Pas d'architecture imposée
- ❌ **Callback hell** : Moins adapté aux async/await modernes
- 📌 **Pourquoi rejetée** : Moins performant et moins bien typé

### 2. NestJS
- ✅ Architecture très structurée
- ✅ Excellente intégration TypeScript
- ✅ Beaucoup de fonctionnalités intégrées (DI, modules, etc.)
- ✅ Bonne documentation
- ❌ **Trop lourd** pour un projet simple
- ❌ **Complexité** : Courbe d'apprentissage raide
- ❌ **Overhead** : Beaucoup de code boilerplate
- ❌ **Démarrage lent** : Temps de cold start élevé
- 📌 **Pourquoi rejetée** : Trop complexe pour nos besoins simples

### 3. Hono
- ✅ Ultra-léger
- ✅ Très performant
- ✅ Multi-platforme (Cloudflare Workers, Node.js, etc.)
- ❌ **Trop récent** : Écosystème immature
- ❌ **Moins de documentation**
- ❌ **Moins de plugins**
- ❌ **Incertitude** : Pas encore largement adopté en production
- 📌 **Pourquoi rejetée** : Trop risqué pour un projet en production

### 4. Koa
- ✅ Léger et moderne
- ✅ Bonne performance
- ✅ Async/await natif
- ❌ **Moins de plugins** que Express
- ❌ **Moins de documentation**
- ❌ **Moins adapté** pour les APIs RESTful
- ❌ **Typage TypeScript** moyen
- 📌 **Pourquoi rejetée** : Moins adapté à notre cas d'usage

### 5. http (Node.js natif)
- ✅ Zéro dépendance
- ✅ Performance maximale
- ✅ Contrôle total
- ❌ **Très bas niveau** : Beaucoup de code à écrire
- ❌ **Pas de structure** : Tout à faire soi-même
- ❌ **Pas de typage** : Difficile avec TypeScript
- ❌ **Maintenance** : Très difficile à maintenir
- 📌 **Pourquoi rejetée** : Trop bas niveau, gain marginal

## Notes supplémentaires

### Structure de l'API

```
apps/api/
├── src/
│   ├── index.ts            - Initialisation Fastify
│   ├── routes/
│   │   ├── couches.ts      - Gestion des couches géospatiales
│   │   ├── recherche.ts    - Recherche full-text et spatiale
│   │   ├── stats.ts        - Statistiques et agrégations
│   │   └── meta.ts         - Métadonnées du catalogue
│   ├── plugins/
│   │   ├── postgres.ts     - Plugin de connexion PostgreSQL
│   │   ├── cors.ts         - Configuration CORS
│   │   └── error.ts        - Gestion centralisée des erreurs
│   ├── schemas/
│   │   └── *.ts            - Schémas Zod pour validation
│   └── types/
│       └── *.ts            - Types TypeScript partagés
├── Dockerfile              - Build pour Docker
└── package.json
```

### Exemple de route Fastify

```typescript
// apps/api/src/routes/couchés.ts
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getPool } from '@opendata-vda/shared';

// Schéma de validation des paramètres
const ParamsSchema = z.object({
  couche: z.string().min(1),
});

const QuerySchema = z.object({
  limit: z.number().default(1000),
  bbox: z.string().optional(), // Format: minX,minY,maxX,maxY
});

export default async function (fastify: FastifyInstance) {
  // GET /api/couches/:couche/geojson
  fastify.get(
    '/api/couches/:couche/geojson',
    {
      schema: {
        params: ParamsSchema,
        querystring: QuerySchema,
        response: {
          200: z.object({
            type: z.literal('FeatureCollection'),
            features: z.array(z.any()),
          }),
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { couche } = request.params;
      const { limit, bbox } = request.query;
      const pool = getPool();

      let query = `
        SELECT jsonb_build_object(
          'type', 'FeatureCollection',
          'features', jsonb_agg(
            jsonb_build_object(
              'type', 'Feature',
              'id', id,
              'geometry', ST_AsGeoJSON(geometrie)::jsonb,
              'properties', props
            )
          )
        ) AS geojson
        FROM couches.objets
        WHERE couche = $1
      `;

      const params: (string | number)[] = [couche];

      if (bbox) {
        const [minX, minY, maxX, maxY] = bbox.split(',').map(Number);
        query += ` AND geometrie && ST_MakeEnvelope($2, $3, $4, $5, 4326)`;
        params.push(minX, minY, maxX, maxY);
      }

      query += ` LIMIT $${params.length + 1}`;
      params.push(limit);

      const { rows } = await pool.query(query, params);
      const geojson = rows[0]?.geojson || { type: 'FeatureCollection', features: [] };

      reply.header('Content-Type', 'application/geo+json');
      return geojson;
    }
  );

  // GET /api/couches/:couche/meta
  fastify.get(
    '/api/couches/:couche/meta',
    {
      schema: {
        params: ParamsSchema,
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { couche } = request.params;
      const pool = getPool();

      const { rows } = await pool.query(
        `SELECT COUNT(*) as count, MIN(created_at) as first_date, MAX(updated_at) as last_date 
         FROM couches.objets WHERE couche = $1`,
        [couche]
      );

      return {
        couche,
        count: rows[0]?.count || 0,
        first_date: rows[0]?.first_date,
        last_date: rows[0]?.last_date,
      };
    }
  );
}
```

### Plugin PostgreSQL

```typescript
// apps/api/src/plugins/postgres.ts
import fp from 'fastify-plugin';
import { Pool } from 'pg';
import { DATABASE_URL } from '@opendata-vda/shared';

declare module 'fastify' {
  interface FastifyInstance {
    pg: Pool;
  }
}

export default fp(async (fastify) => {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  // Tester la connexion
  try {
    await pool.query('SELECT 1');
    fastify.log.info('Connected to PostgreSQL');
  } catch (err) {
    fastify.log.error(err, 'Failed to connect to PostgreSQL');
    throw err;
  }

  // Fermer le pool au shutdown
  fastify.addHook('onClose', async () => {
    await pool.end();
  });

  // Ajouter le pool à l'instance Fastify
  fastify.decorate('pg', pool);
});
```

### Validation avec Zod

```typescript
// apps/api/src/schemas/couche.ts
import { z } from 'zod';

// Schéma pour un objet géospatial
const GeometrySchema = z.object({
  type: z.enum(['Point', 'LineString', 'Polygon', 'MultiPolygon', 'GeometryCollection']),
  coordinates: z.array(z.any()),
});

const PropertiesSchema = z.record(z.any());

const FeatureSchema = z.object({
  type: z.literal('Feature'),
  id: z.string().or(z.number()),
  geometry: GeometrySchema.nullable(),
  properties: PropertiesSchema,
});

const FeatureCollectionSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(FeatureSchema),
});

export { FeatureSchema, FeatureCollectionSchema };
```

### Gestion des erreurs

```typescript
// apps/api/src/plugins/error.ts
import fp from 'fastify-plugin';
import { ZodError } from 'zod';

export default fp(async (fastify) => {
  fastify.setErrorHandler((error, request, reply) => {
    fastify.log.error(error);

    if (error instanceof ZodError) {
      return reply.status(400).send({
        success: false,
        error: 'Validation Error',
        details: error.errors,
      });
    }

    if (error.code === '23505') {
      // Unique violation
      return reply.status(409).send({
        success: false,
        error: 'Conflict',
        message: 'Resource already exists',
      });
    }

    if (error.code === '23503') {
      // Foreign key violation
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message: 'Referenced resource does not exist',
      });
    }

    // Default error
    reply.status(500).send({
      success: false,
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  });
});
```

### Performances

**Optimisations mises en place** :
- Connection pooling avec `pg`
- Requêtes SQL optimisées avec PostGIS
- Cache des réponses fréquentes (envisagé pour le futur)
- Streaming des réponses GeoJSON pour les grosses couches
- Compression gzip automatique

**Benchmarks attendus** :
- ~10,000 requêtes/secondes sur un VPS standard
- Latence < 50ms pour les requêtes simples
- Latence < 200ms pour les requêtes spatiales complexes

## Liens
- [Fastify Documentation](https://fastify.dev/)
- [Fastify TypeScript](https://fastify.dev/docs/latest/Reference/TypeScript/)
- [Fastify Plugins](https://github.com/fastify/fastify-plugin)
- [Zod Documentation](https://zod.dev/)
- [pg (PostgreSQL client)](https://node-postgres.com/)

---

## Historique
| Date | Auteur | Action |
|------|--------|--------|
| 2026-07-08 | Architecte | Décision initiale (Fastify prévu dans la vision globale) |
| 2026-07-09 | Architecte | Confirmation pour la Brique 1 |
| 2026-07-10 | Agent | Documentation ADR |
