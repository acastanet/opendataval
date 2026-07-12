# STYLEGUIDE.md
## Conventions de Code — Portail OpenData Val-d'Aigoual

> **Document satellite du AGENT_OPERATING_MANUAL.md**
> **Ce document est contraignant.** Tout code qui ne respecte pas ces conventions doit être corrigé.

---

## 1. Principe directeur

**"Il doit être possible de deviner où placer un fichier et comment le nommer sans réfléchir."**

La cohérence est plus importante que la perfection individuelle. **Toujours** suivre les conventions existantes dans le codebase.

---

## 2. Conventions de nommage

### 2.1 Fichiers et dossiers

| Type | Convention | Exemple | Localisation |
|------|------------|---------|--------------|
| Fichier TypeScript | `kebab-case.ts` | `territoire.ts`, `geo-utils.ts` | `packages/shared/src/` |
| Dossier | `kebab-case/` | `src/sources/`, `src/lib/` | Partout |
| Composant Svelte | `PascalCase.svelte` | `MapExplorer.svelte`, `RechercheLieux.svelte` | `apps/web/src/islands/` |
| Page Astro | `kebab-case.astro` | `index.astro`, `population.astro`, `carte.astro` | `apps/web/src/pages/` |
| Route API | `kebab-case.ts` | `couches.ts`, `territoire.ts`, `outils.ts` | `apps/api/src/routes/` |
| Source Worker | `<slug>.ts` | `adresses.ts`, `georisques.ts`, `hubeau.ts` | `apps/worker/src/sources/` |
| Migration SQL | `NNN_description.sql` | `001_init.sql`, `002_recherche.sql` | `db/migrations/` |
| ADR | `NNN-titre-en-minuscules.md` | `001-choix-astro.md`, `002-choix-postgres.md` | `doc/ADR/` |
| Test | `*.spec.ts` ou `*.test.ts` | `carte.spec.ts` | `tests/` (futur) |
| Configuration | `*.config.*` | `astro.config.mjs`, `tsconfig.base.json` | Racine |
| Docker | `Dockerfile.*` | `Dockerfile.caddy`, `Dockerfile` | Racine / apps/* |

**Règles supplémentaires** :
- Utiliser des noms **explicites** : `fetch-geoapi-communes.ts` > `fetch.ts`
- Éviter les abréviations sauf si standard (ex: `config`, `lib`, `src`)
- Les numéros de migration/migration ADR utilisent des **zéros en tête** (001, 002, ...)

---

### 2.2 Variables et fonctions

| Type | Convention | Exemple |
|------|------------|---------|
| Variable constante | `UPPER_SNAKE_CASE` | `COMMUNES_EPCI`, `TERRITOIRE`, `CODE_INSEE` |
| Variable | `camelCase` | `pool`, `nbLignes`, `currentJob`, `fetchCount` |
| Fonction | `camelCase` | `fetchGeoapi`, `upsertObjet`, `corrigerCoordonnees` |
| Méthode de classe | `camelCase` | `getCommune`, `validateSource` |
| Type/Interface | `PascalCase` | `SourceConfig`, `CommuneData`, `JobConfig` |
| Enum | `PascalCase` | `SectionSlug`, `LicenceType` |
| Paramètre de fonction | `camelCase` | `pool: pg.Pool`, `slug: string`, `options?: Config` |
| Variable booléenne | Préfixe `is`, `has`, `can` | `isActive`, `hasData`, `canFetch` |
| Promesse | Préfixe verbale | `fetchCommunes`, `loadConfig`, `validateInput` |

**Noms à éviter** :
- ❌ `data`, `item`, `list` → ✅ `communeData`, `addressItem`, `schoolList`
- ❌ `temp`, `tmp` → ✅ `buffer`, `draft` (si nécessaire)
- ❌ `x`, `i` (sauf en boucle for) → ✅ `index`, `coordinate`

---

### 2.3 Classes et objets

| Type | Convention | Exemple |
|------|------------|---------|
| Classe | `PascalCase` | `TerritoireConfig`, `PMTilesLoader` |
| Propriété d'objet | `camelCase` ou `snake_case` | `codeInsee` ou `code_insee` (selon contexte) |
| Méthode | `camelCase` | `getGeometry`, `toGeoJSON` |
| Propriété privée | Préfixe `_` | `_pool`, `_internalCache` |

---

### 2.4 Bases de données (PostgreSQL/PostGIS)

| Type | Convention | Exemple |
|------|------------|---------|
| Schéma | `snake_case` | `territoire`, `couches`, `series`, `meta` |
| Table | `snake_case` | `communes`, `objets`, `piezo`, `sources`, `fetch_log` |
| Colonne | `snake_case` | `code_insee`, `geom`, `maj`, `external_id`, `source_url` |
| Index | `idx_<table>_<colonne>` | `idx_objets_geom`, `idx_objets_couche` |
| Contrainte PRIMARY KEY | `ck_<table>_<colonne>_pk` | `ck_communes_code_insee_pk` |
| Contrainte UNIQUE | `ck_<table>_<colonne>_unique` | `ck_sources_slug_unique` |
| Contrainte CHECK | `ck_<table>_<condition>` | `ck_objets_geom_not_null` |
| Séquence | `<table>_<colonne>_seq` | `sources_id_seq` |
| Vue | `v_<description>` | `v_lieux_recherche`, `v_stats_territoire` |
| Fonction PL/pgSQL | `<verbe>_<objet>` | `upsert_commune`, `get_geojson_by_slug` |

**Types PostgreSQL préférés** :
- `TEXT` pour les chaînes (sauf si taille fixe)
- `INTEGER` / `BIGINT` pour les entiers
- `NUMERIC` pour les décimaux
- `TIMESTAMP WITH TIME ZONE` pour les dates/heures
- `BOOLEAN` pour les booléens
- `JSONB` pour les données semi-structurées
- `GEOMETRY(POLYGON, 4326)` pour les polygones
- `GEOMETRY(POINT, 4326)` pour les points
- `GEOMETRY(GEOMETRY, 4326)` pour les géométries mixtes

---

## 3. Organisation des fichiers

### 3.1 Structure globale du projet

```
opendata-vda/
├── apps/                    # Applications
│   ├── worker/             # Ingestion des données
│   │   ├── src/
│   │   │   ├── index.ts          # Point d'entrée + migrations
│   │   │   ├── scheduler.ts      # Registre des jobs (JOBS)
│   │   │   └── sources/
│   │   │       └── <slug>.ts     # Une source = un fichier
│   │   └── Dockerfile
│   │
│   ├── api/                # API Fastify
│   │   ├── src/
│   │   │   ├── index.ts          # Initialisation
│   │   │   ├── routes/
│   │   │   │   └── <nom>.ts      # Une route = un fichier
│   │   │   └── plugins/
│   │   └── Dockerfile
│   │
│   └── web/                # Frontend Astro
│       ├── public/
│       │   └── relief/
│       │       └── *.pmtiles     # Données de relief
│       ├── src/
│       │   ├── pages/
│       │   │   └── <nom>.astro   # Une page = un fichier
│       │   ├── islands/
│       │   │   └── <Nom>.svelte  # Un composant = un fichier
│       │   ├── components/
│       │   │   └── *.astro       # Composants Astro
│       │   ├── layouts/
│       │   │   └── *.astro       # Layouts
│       │   └── lib/
│       │       └── *.ts          # Utilitaires
│       └── Dockerfile
│
├── packages/               # Code partagé
│   └── shared/
│       └── src/
│           ├── index.ts          # Barrel exports
│           ├── territoire.ts     # **SOURCE UNIQUE DE VERITE**
│           ├── sections.ts        # Taxonomie des sections
│           ├── db.ts             # Accès PostgreSQL
│           ├── migrate.ts         # Migrations automatiques
│           └── geo.ts            # Helpers géo
│
├── db/                     # Base de données
│   └── migrations/
│       └── NNN_*.sql            # Migrations SQL
│
├── doc/                    # Documentation
│   ├── AGENT_OPERATING_MANUAL.md
│   ├── VISION.md
│   ├── ARCHITECTURE.md
│   ├── AGENT.md
│   ├── STYLEGUIDE.md          # CE DOCUMENT
│   ├── WORKFLOWS.md
│   ├── ROADMAP.md
│   └── ADR/
│       └── NNN-*.md
│
├── Caddyfile               # Configuration Caddy
├── docker-compose.yml     # Orchestration
├── package.json
└── pnpm-workspace.yaml
```

### 3.2 Règles d'organisation

1. **Un fichier = une responsabilité** : Un fichier ne doit faire qu'une seule chose
2. **Pas de dossiers vides** : Si un dossier n'a qu'un fichier, supprimer le dossier
3. **Colocation** : Les fichiers utilisés ensemble doivent être proches
4. **Nommer les dossiers au pluriel** : `sources/`, `routes/`, `pages/` (sauf si concept singulier)
5. **Éviter les dossiers utilitaires** : Préférer `lib/` à `utils/`, `helpers/`

**Où placer un nouveau fichier ?** :
```
Fichier pour une source de données → apps/worker/src/sources/<slug>.ts
Fichier pour une route API → apps/api/src/routes/<nom>.ts
Fichier pour une page → apps/web/src/pages/<nom>.astro
Composant Svelte réutilisable → apps/web/src/islands/<Nom>.svelte
Code partagé → packages/shared/src/<nom>.ts
Migration → db/migrations/NNN_description.sql
```

---

## 4. Conventions TypeScript

### 4.1 Typage

**Règles strictes** :
- ✅ **Toujours** typer les paramètres de fonction
- ✅ **Toujours** typer les retours de fonction (sauf `void`)
- ✅ **Toujours** typer les variables exportées
- ✅ **Préférer** les `interface` pour les objets
- ✅ **Préférer** les `type` pour les unions et types complexes
- ✅ **Utiliser** `as const` pour les objets littéraux constants
- ✅ **Utiliser** `satisfies` pour valider les types sans changer le runtime

**Exemples** :
```typescript
// ✅ Bien
function fetchGeoapi(pool: pg.Pool, code: string): Promise<GeoapiCommune> { ... }

// ❌ Mal - paramètre non typé
function fetchGeoapi(pool, code: string): Promise<GeoapiCommune> { ... }

// ❌ Mal - retour non typé
function fetchGeoapi(pool: pg.Pool, code: string) { ... }

// ✅ Bien - as const pour les constantes
const TERRITOIRE = {
  codeInsee: '30339',
  nom: 'Val-d\'Aigoual',
} as const;

// ✅ Bien - satisfies pour la validation
type SourceConfig = { slug: string; nom: string; licence: string };
const source: SourceConfig = { slug: 'adresses', nom: 'BAN' } satisfies SourceConfig;
```

### 4.2 Imports

**Règles strictes** :
- ✅ **Grouper** les imports par source
- ✅ **Ordre** : Node.js built-ins → external → internal → relative
- ✅ **Ne pas** utiliser d'alias (`import * as x`) sauf pour les namespaces
- ✅ **Une ligne par import** (sauf imports du même module)

**Exemple de fichier bien organisé** :
```typescript
// 1. Node.js built-ins
import fs from 'node:fs';
import path from 'node:path';

// 2. Dependances externes
import pg from 'pg';
import { fastify } from 'fastify';

// 3. Imports internes (workspace)
import { TERRITOIRE, COMMUNES_EPCI } from '@opendata-vda/shared';

// 4. Imports relatifs (même dossier ou parent)
import { upsertObjet } from '../db.js';
import { logFetchStart } from './utils.js';

// 5. Re-exports (si nécessaire)
export { fetchCommunes } from './geoapi.js';
```

**❌ À éviter** :
```typescript
// Imports mélangés
import { fastify } from 'fastify';
import { TERRITOIRE } from '@opendata-vda/shared';
import fs from 'node:fs';

// Alias inutiles
import * as shared from '@opendata-vda/shared';
```

---

## 5. Conventions Astro

### 5.1 Pages

- **Nom** : `kebab-case.astro`
- **Emplacement** : `apps/web/src/pages/`
- **Une page = un fichier** : Pas de routes dynamiques complexes (sauf si nécessaire)
- **Frontmatter** : Utiliser le frontmatter Astro pour le titre et la description

**Exemple** :
```astro
---
// apps/web/src/pages/population.astro
import Layout from '../layouts/SectionLayout.astro';

type Props = {
  slug: string;
};

const { slug } = Astro.props;
---

<Layout slug={slug}>
  <!-- Contenu -->
</Layout>
```

### 5.2 Composants

- **Nom** : `PascalCase.astro` (composants Astro) ou `PascalCase.svelte` (îles Svelte)
- **Props** : Toujours typer avec `type Props` dans le frontmatter
- **Slots** : Utiliser les slots pour la composition

**Exemple de composant Astro** :
```astro
---
// apps/web/src/components/SiteHeader.astro
import type { SectionConfig } from '@opendata-vda/shared';

type Props = {
  sections: SectionConfig[];
  currentSlug?: string;
};

const { sections, currentSlug } = Astro.props;
---

<header>
  <nav>
    {sections.map(section => (
      <a href={`/${section.slug}`}>
        {section.titre}
      </a>
    ))}
  </nav>
</header>
```

---

## 6. Conventions Svelte

### 6.1 Composants

- **Nom** : `PascalCase.svelte`
- **Emplacement** : `apps/web/src/islands/` (pour les composants interactifs)
- **Props** : Utiliser `export let` avec typage TypeScript
- **Événements** : Utiliser `createEventDispatcher` pour les événements customs

**Exemple** :
```svelte
<script lang="ts">
  // apps/web/src/islands/RechercheLieux.svelte
  import { createEventDispatcher } from 'svelte';
  
  export let query: string = '';
  export let placeholder: string = 'Rechercher...';
  
  const dispatch = createEventDispatcher();
  
  function handleSelect(item: SearchResult) {
    dispatch('selection', item);
  }
</script>

<input
  type="text"
  bind:value={query}
  {placeholder}
/>

{#if results.length > 0}
  <ul>
    {#each results as result}
      <li on:click={() => handleSelect(result)}>
        {result.label}
      </li>
    {/each}
  </ul>
{/if}
```

### 6.2 Réactivité

- ✅ **Préférer** `$:` pour la réactivité simple
- ✅ **Éviter** `on:change` si `bind:value` suffit
- ✅ **Grouper** les déclarations réactives en haut du script

---

## 7. Conventions SQL

### 7.1 Migrations

- **Nom** : `NNN_description_en_minuscules.sql`
- **Ordre** : Numérotation séquentielle sans trou
- **Contenu** : Chaque migration doit être **idempotente** (peut être rejouée)
- **Préfixe** : Utiliser `CREATE TABLE IF NOT EXISTS` et `DO $$` pour la vérification

**Exemple** :
```sql
-- db/migrations/001_init.sql

-- Vérification que la migration n'a pas déjà été appliquée
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM meta.migrations WHERE filename = '001_init.sql') THEN
    RETURN;
  END IF;
END $$;

-- Création des schémas
CREATE SCHEMA IF NOT EXISTS territoire;
CREATE SCHEMA IF NOT EXISTS couches;
CREATE SCHEMA IF NOT EXISTS series;
CREATE SCHEMA IF NOT EXISTS meta;

-- Tables...
```

### 7.2 Requêtes

- ✅ **Utiliser** `snake_case` pour les alias de colonnes
- ✅ **Indenter** les requêtes de manière lisible
- ✅ **Éviter** `SELECT *` → toujours lister les colonnes
- ✅ **Utiliser** `ILIKE` pour les recherches insensibles à la casse
- ✅ **Utiliser** `to_jsonb()` plutôt que `row_to_json()`

**Exemple** :
```sql
-- ✅ Bien
SELECT
    code_insee as code,
    nom,
    ST_AsGeoJSON(geom) as geometry
FROM territoire.communes
WHERE code_insee = $1;

-- ❌ Mal
SELECT * FROM territoire.communes WHERE code_insee = $1;
```

---

## 8. Conventions de commit

### 8.1 Format des messages

**Format** : `<type>(<scope>): <description>`

**Types** :
- `feat` : Nouvelle fonctionnalité
- `fix` : Correction de bug
- `docs` : Documentation
- `style` : Changements de style (espace, formatage)
- `refactor` : Refactoring (pas de changement fonctionnel)
- `perf` : Optimisation de performance
- `test` : Ajout/modification de tests
- `chore` : Tâches de maintenance
- `revert` : Annulation d'un commit
- `config` : Changement de configuration
- `migration` : Migration de données ou schéma

**Scopes** (optionnels mais recommandés) :
- `worker` : apps/worker
- `api` : apps/api
- `web` : apps/web
- `shared` : packages/shared
- `db` : base de données
- `doc` : documentation

**Exemples** :
```
feat(worker): ajouter source adresses BAN
fix(api): corriger erreur CORS sur /api/recherche
style(web): formater composant RechercheLieux
refactor(shared): extraire logique commune dans geo.ts
docs: ajouter ADR pour choix MapLibre
migration(db): ajouter index sur couches.objets.geom
```

### 8.2 Règles des commits

- ✅ **Un commit = une seule modification logique**
- ✅ **Le message explique le "quoi" et le "pourquoi"**
- ✅ **Le commit est atomique** (pas de parties non fonctionnelles)
- ✅ **Aucun fichier non lié** dans le commit
- ✅ **Le code compile** avant le commit
- ❌ **Ne pas** commiter du code commenté
- ❌ **Ne pas** commiter des `console.log` de debug

---

## 9. Conventions de commentaires

### 9.1 Quand commenter

- ✅ **Expliquer le "pourquoi"** : Pourquoi une décision a été prise
- ✅ **Expliquer les cas limites** : Comportement inattendu
- ✅ **Expliquer les invariants** : Ce qui ne doit jamais changer
- ❌ **Ne pas** commenter le "comment" : Le code doit être auto-documenté

**Exemples** :
```typescript
// ✅ Bien - explique le pourquoi
// On utilise RUN_ONCE=true pour permettre une ingestion complète
// sans lancer le scheduler en continu (utile pour le dev/test)
if (process.env.RUN_ONCE === 'true') { ... }

// ❌ Mal - commente le comment
// Incrémente le compteur
count++;

// ✅ Bien - explique le cas limite
// Note: L'API Géorisques pagine les résultats par 20.
// On doit donc faire plusieurs appels pour récupérer toutes les cavités.
for (let page = 1; page <= totalPages; page++) { ... }
```

### 9.2 Format des commentaires

- **Commentaires de ligne** : `// ` avec un espace après
- **Commentaires de bloc** : `/** ... */` pour la documentation
- **TODO** : `// TODO: <description>` (à éviter si possible)
- **FIXME** : `// FIXME: <problème>` (priorité haute)

---

## 10. Conventions de tests (futur)

*Cette section sera complétée quand les tests seront configurés.*

---

## 11. Outils et configuration

### 11.1 Éditeur

**Configuration recommandée** :
- **Indentation** : 2 espaces (pas de tabulations)
- **Longueur de ligne** : 100-120 caractères (pas de limite stricte)
- **Guillemets** : Double quotes (`"`) pour TypeScript, simple quotes (`'`) pour SQL
- **Virgules finales** : Toujours (trailing commas)
- **Points-virgules** : Toujours en TypeScript/JavaScript

### 11.2 ESLint/Prettier

*À configurer :* Aucun linter n'est actuellement configuré dans le projet (voir CLAUDE.md).

**Recommandation** : Configurer ESLint + Prettier avec :
- `eslint-config-airbnb-typescript`
- `prettier` avec 2 espaces
- `eslint-plugin-svelte` pour les fichiers .svelte

---

## 12. Checklist avant commit

- [ ] Le code respecte les conventions de nommage (Section 2)
- [ ] Le code est bien organisé (Section 3)
- [ ] Les types TypeScript sont complets (Section 4)
- [ ] Les imports sont bien ordonnés (Section 4.2)
- [ ] Le message de commit suit la convention (Section 8)
- [ ] Le commit est atomique
- [ ] Le code compile sans erreur
- [ ] Aucune régression introduite
- [ ] La documentation est mise à jour si nécessaire

---

## 13. Exemples complets

### 13.1 Fichier TypeScript bien formaté

```typescript
// apps/worker/src/sources/adresses.ts

// 1. Imports - Node.js built-ins
import fs from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

// 2. Imports - Externes
import pg from 'pg';

// 3. Imports - Internes
import { COMMUNES_EPCI, TERRITOIRE } from '@opendata-vda/shared';
import { upsertObjetsEnLot, logFetchStart, logFetchEnd } from '../db.js';

// 4. Types
interface BanAdresse {
  numero: string;
  voie: string;
  code_postal: string;
  code_insee: string;
  lon: string;
  lat: string;
}

// 5. Constantes
const DEPARTEMENT = TERRITOIRE.codeDepartement; // '30' pour le Gard
const BAN_URL = `https://adresse.data.gouv.fr/data/ban/adresses/latest/csv/adresses-${DEPARTEMENT}.csv.gz`;
const BATCH_SIZE = 1000;

/**
 * Récupère et ingère les adresses de la BAN pour le territoire.
 * 
 * Note: On filtre sur les codes INSEE de l'EPCI pour ne garder que
 * les adresses du territoire. On utilise un stream pour éviter de
 * charger tout le fichier en mémoire (le CSV du Gard fait ~50 Mo).
 */
export async function run(pool: pg.Pool): Promise<number> {
  const startId = await logFetchStart('adresses');
  
  try {
    // Téléchargement et décompression en streaming
    const response = await fetch(BAN_URL);
    const stream = createReadStream(response.body?.pipe(createGunzip()));
    
    const interfaceStream = createInterface({
      input: stream,
      crlfDelay: Infinity,
    });

    let count = 0;
    const addresses: BanAdresse[] = [];

    for await (const line of interfaceStream) {
      const addr = parseBanLine(line);
      
      // Filtre sur les communes de l'EPCI
      if (COMMUNES_EPCI.includes(addr.code_insee)) {
        addresses.push(addr);
        count++;
        
        // Insertion par lots
        if (addresses.length >= BATCH_SIZE) {
          await upsertObjetsEnLot(pool, 'adresse', addresses);
          addresses.length = 0;
        }
      }
    }

    // Dernier lot
    if (addresses.length > 0) {
      await upsertObjetsEnLot(pool, 'adresse', addresses);
    }

    await logFetchEnd(startId, 'success', count);
    return count;
    
  } catch (error) {
    await logFetchEnd(startId, 'error', 0, error instanceof Error ? error.message : 'Unknown');
    throw error;
  }
}

// 6. Helper - Parse une ligne CSV BAN
function parseBanLine(line: string): BanAdresse {
  // ... implémentation
}
```

### 13.2 Migration SQL bien formatée

```sql
-- db/migrations/002_recherche.sql

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM meta.migrations WHERE filename = '002_recherche.sql') THEN
    RETURN;
  END IF;
END $$;

-- Activation des extensions nécessaires pour la recherche
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Vue pour la recherche tolérante aux fautes
CREATE OR REPLACE VIEW couches.lieux_recherche AS
SELECT
    code_insee as id,
    nom as label,
    'commune' as type,
    ST_X(centre) as lon,
    ST_Y(centre) as lat
FROM territoire.communes

UNION ALL

SELECT
    couche || ':' || external_id as id,
    props->>'nom' as label,
    props->>'type' as type,
    ST_X(geom) as lon,
    ST_Y(geom) as lat
FROM couches.objets
WHERE props ? 'nom' AND geom IS NOT NULL;

-- Index pour accélérer la recherche
CREATE INDEX IF NOT EXISTS idx_lieux_recherche_label 
  ON couches.lieux_recherche USING GIN (label gin_trgm_ops);
```

---

## 14. References

- [AGENT_OPERATING_MANUAL.md](./AGENT_OPERATING_MANUAL.md) — Document maître
- [ARCHITECTURE.md](./ARCHITECTURE.md) — Architecture technique
- [CLAUDE.md](../CLAUDE.md) — Guide technique complet

---

> **Dernière mise à jour** : 2026-07-10
> **Responsable** : Architecte (vous)
> **Statut** : Document contraignant — Tout code non conforme doit être corrigé
