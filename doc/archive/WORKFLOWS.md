# WORKFLOWS — Procédures Standardisées

> **Document Opérationnel** — Version 1.0 — 2026-07-10
> **Rôle** : Définir les procédures pas-à-pas pour toutes les opérations de développement.
> **Règle** : **Toute opération doit suivre un workflow documenté ici.** Si aucun workflow ne correspond, créer un plan selon le [Protocole 10 étapes](#protocole-10-étapes) et le faire valider.

---

## 📖 TABLE DES MATIÈRES

### Workflows Principaux
- [1. Nouvelle source de données](#1-nouvelle-source-de-données)
- [2. Nouvelle page thématique](#2-nouvelle-page-thématique)
- [3. Nouvelle route API](#3-nouvelle-route-api)
- [4. Nouvelle migration SQL](#4-nouvelle-migration-sql)
- [5. Nouveau composant Svelte](#5-nouveau-composant-svelte)
- [6. Correction de bug](#6-correction-de-bug)

### Checklists
- [7. Checklist : Nouvelle source OpenData](#7-checklist--nouvelle-source-opendata)
- [8. Checklist : Déploiement en production](#8-checklist--déploiement-en-production)

### Annexes
- [Protocole 10 étapes](#protocole-10-étapes)
- [Templates](#templates)

---

## 🎯 PRINCIPES GÉNÉRAUX

### Avant toute opération
1. **Lire** le code existant
2. **Rechercher** un composant/fonction similaire (`grep`, `find`)
3. **Comprendre** le flux de données concerné
4. **Identifier** les invariants impactés (voir [ARCHITECTURE.md](ARCHITECTURE.md))
5. **Vérifier** que l'opération respecte les [Décisions Immuables](AGENT_OPERATING_MANUAL.md#10-décisions-immuables)

### Après toute opération
1. **Tester** manuellement
2. **Vérifier** les logs
3. **Mettre à jour** la documentation si nécessaire
4. **Documenter** dans le commit message : "workflow: X, files: Y, impact: Z"

---

## 📋 WORKFLOWS PRINCIPAUX

---

### 1. Nouvelle source de données

**Objectif** : Ajouter une nouvelle source OpenData au système d'ingestion.

**Contexte** : Les sources OpenData sont ingérées par le Worker via des scripts dans `apps/worker/src/sources/`. Chaque source suit le pattern : fetch → transform → filter → upsert.

**Pré-requis** :
- Source validée (licence compatible : Licence Ouverte 2.0, ODbL, CC-BY, etc.)
- Format compréhensible (JSON, CSV, GeoJSON préférés)
- Accès possible (sans clé ou clé disponible)
- Fréquence de mise à jour connue

**Étapes détaillées** :

#### Étape 1 : Analyse préalable
- [ ] Vérifier la licence de la source (compatible avec le projet)
- [ ] Identifier le format des données (JSON, CSV, GeoJSON, GML, etc.)
- [ ] Déterminer la fréquence de mise à jour (quotidienne, hebdomadaire, mensuelle, annuelle)
- [ ] Tester manuellement l'API avec `curl` ou navigateur
- [ ] Identifier les champs pertinents pour le territoire (code INSEE 30339, EPCI 200034601)
- [ ] Vérifier si une source similaire existe déjà (grep dans `apps/worker/src/sources/`)

#### Étape 2 : Développement du script source
**Emplacement** : `apps/worker/src/sources/<slug>.ts`

**Template à suivre** :
```typescript
import type pg from "pg";
import { 
  upsertObjetsEnLot, 
  logFetchStart, 
  logFetchEnd 
} from "@opendata-vda/shared";

export async function run(pool: pg.Pool): Promise<number> {
  const logId = await logFetchStart(pool, "<slug>");
  try {
    // 1. Fetch données depuis API
    const response = await fetch('<url>', {
      headers: { 'User-Agent': 'OpenDataVdA Worker' }
    });
    const data = await response.json();
    
    // 2. Transformer en format attendu
    const objets = data.map(item => ({
      id: item.id,
      nom: item.nom,
      geometrie: item.geom, // GeoJSON
      props: {
        // Propriétés spécifiques
        ...item.props,
        source: '<slug>',
        source_url: '<url>',
        licence: 'Licence Ouverte 2.0' // ou ODbL, etc.
      },
      couche: '<nom_couche>'
    }));
    
    // 3. Filtrer sur le territoire
    const filtered = objets.filter(obj => 
      obj.props?.code_insee === '30339' || 
      obj.props?.code_epci === '200034601'
    );
    
    // 4. Upsert dans Postgres
    const nbLignes = await upsertObjetsEnLot(pool, "<nom_couche>", filtered);
    
    await logFetchEnd(pool, logId, "ok", nbLignes);
    return nbLignes;
  } catch (err) {
    await logFetchEnd(pool, logId, "erreur", undefined, (err as Error).message);
    throw err;
  }
}
```

**Règles pour le slug** :
- Tout en minuscules
- Sans espaces (utiliser `-` comme séparateur)
- Courte et descriptive (ex: `ofgl`, `georisques`, `hubeau-stations`, `insee-population`)

#### Étape 3 : Intégration au scheduler
**Fichier** : `apps/worker/src/scheduler.ts`

- Ajouter l'import : `import * as <slug> from "./sources/<slug>.js";`
- Ajouter le job dans le tableau `JOBS` :
```typescript
{
  slug: "<slug>",
  nom: "Nom de la source",
  cron: "<expression_cron>", // Ex: "0 3 * * *" pour 3h du matin quotidien
  run: <slug>.run,
  enabled: true
}
```

**Fréquence recommandée** :
- Données temps réel (météo, qualité air) : `"*/30 * * * *"` (toutes les 30 min)
- Données quotidiennes : `"0 3 * * *"` (3h du matin)
- Données hebdomadaires : `"0 3 * * 1"` (lundi 3h)
- Données mensuelles : `"0 3 1 * *"` (1er du mois 3h)
- Données annuelles : `"0 3 1 1 *"` (1er janvier 3h)

#### Étape 4 : Déclaration dans le catalogue
**Fichier** : `packages/shared/src/territoire.ts`

Ajouter une entrée dans `CATALOGUE_SOURCES` :
```typescript
{
  slug: "<slug>",
  nom: "Nom de la source",
  description: "Description courte de la source",
  licence: "Licence Ouverte 2.0", // ou "ODbL", "CC-BY-4.0"
  lien: "https://...",
  frequence: "quotidienne", // ou "hebdomadaire", "mensuelle", "annuelle", "temps-reel"
  couche: "<nom_couche>",
 couleur: "#rrggbb", // Couleur pour l'affichage
  icone: "icon-name" // Icone pour l'UI
}
```

#### Étape 5 : Test
- [ ] Exécuter en mode test : `RUN_ONCE=true RUN_ONLY=<slug> pnpm dev:worker`
- [ ] Vérifier que les données apparaissent dans l'API : `/api/couches/<nom_couche>/geojson`
- [ ] Vérifier visuellement sur la carte (si applicable)
- [ ] Vérifier le nombre d'objets retournés est cohérent

#### Étape 6 : Documentation
- [ ] Mettre à jour `WORKFLOWS.md` si nouveau pattern identifié
- [ ] Créer un ADR si décision architecturale majeure
- [ ] La page `sources.astro` sera automatiquement mise à jour via `CATALOGUE_SOURCES`

**✅ Workflow terminé**

---

### 2. Nouvelle page thématique

**Objectif** : Ajouter une nouvelle page dans le frontend (ex: `finances.astro`).

**Contexte** : Les pages thématiques sont des fichiers Astro dans `apps/web/src/pages/`. Elles utilisent le layout `SectionLayout.astro` et sont automatiquement intégrées dans la navigation via `SECTIONS`.

**Étapes détaillées** :

#### Étape 1 : Créer la page
**Emplacement** : `apps/web/src/pages/<slug>.astro`

**Template de base** :
```astro
---
// Frontmatter
import SectionLayout from "@opendata-vda/web/layouts/SectionLayout.astro";

// Titre de la page (utilisé dans la navigation)
const title = "Titre de la page";
const description = "Description courte de la page";

// Récupération des données (si nécessaire)
const response = await fetch('/api/...');
const data = await response.json();

// METADONNEES POUR LA NAVIGATION
// NE PAS MODIFIER CE BLOC
const sectionId = "<slug>";
---

<SectionLayout title={title} description={description}>
  <!-- Contenu de la page -->
  
  <section class="section">
    <h2>Sous-section</h2>
    <p>Contenu...</p>
    
    <!-- Exemple d'utilisation d'un composant Svelte -->
    <!-- <MaCarte client:load /> -->
  </section>
</SectionLayout>
```

**Règles pour le slug** :
- Tout en minuscules
- Sans espaces (utiliser `-` comme séparateur)
- Doit correspondre à l'`id` dans `SECTIONS`

#### Étape 2 : Ajouter à la navigation
**Fichier** : `packages/shared/src/sections.ts`

Vérifier que le slug existe dans `SECTIONS`. Si non, ajouter :
```typescript
{
  id: "<slug>",
  title: "Titre de la page",
  description: "Description courte",
  icon: "icon-name",
  color: "#rrggbb",
  order: X, // Numéro d'ordre dans le menu
  enabled: true
}
```

#### Étape 3 : Ajouter des données si nécessaire
- Si la page a besoin de **nouvelles sources** : suivre [Workflow 1 : Nouvelle source de données](#1-nouvelle-source-de-données)
- Si la page utilise des **sources existantes** : les appeler via `/api/couches/<couche>/geojson` ou `/api/<endpoint>`

#### Étape 4 : Créer des composants si nécessaire
- Si besoin de **visualisation spécifique** (carte, graphique, tableau) :
  - Créer un composant dans `apps/web/src/islands/`
  - Suivre [Workflow 5 : Nouveau composant Svelte](#5-nouveau-composant-svelte)

#### Étape 5 : Vérification
- [ ] Lancer le frontend : `pnpm dev:web`
- [ ] Vérifier que la page est accessible à `/<slug>`
- [ ] Pas d'erreur console (F12)
- [ ] Intégration correcte dans la navigation
- [ ] Données affichées correctement
- [ ] Responsive design (mobile, tablette, desktop)

**✅ Workflow terminé**

---

### 3. Nouvelle route API

**Objectif** : Ajouter un nouvel endpoint dans l'API Fastify.

**Contexte** : Les routes API sont définies dans `apps/api/src/routes/` et enregistrées dans `apps/api/src/index.ts`. Elles fournissent des endpoints RESTful pour accéder aux données.

**Étapes détaillées** :

#### Étape 1 : Créer le fichier de route
**Emplacement** : `apps/api/src/routes/<nom>.ts`

**Template de base** :
```typescript
import type { FastifyInstance } from "fastify";
import { getPool } from "@opendata-vda/shared";

export default async function (fastify: FastifyInstance) {
  // GET /api/<path>
  fastify.get("/api/<path>", async (request, reply) => {
    const pool = getPool();
    
    // Exemple : récupérer des objets d'une couche
    const { rows } = await pool.query(`
      SELECT * FROM couches.objets 
      WHERE couche = $1
    `, ["<couche>"]);
    
    return {
      success: true,
      data: rows,
      count: rows.length
    };
  });

  // POST /api/<path> (si nécessaire)
  fastify.post("/api/<path>", async (request, reply) => {
    // Logique de création
  });
}
```

**Bonnes pratiques** :
- Préfixer tous les endpoints par `/api/`
- Utiliser des noms de routes clairs et RESTful
- Retourner toujours un objet avec `success: boolean`
- Gérer les erreurs avec des codes HTTP appropriés

#### Étape 2 : Enregistrer la route
**Fichier** : `apps/api/src/index.ts`

- Ajouter l'import : `import <nom>Route from "./routes/<nom>.js";`
- Enregistrer la route après l'initialisation de Fastify :
```typescript
// ... après await fastify.register(...)
await <nom>Route(fastify);
```

#### Étape 3 : Validation
- [ ] Démarrer l'API : `pnpm dev:api`
- [ ] Tester avec curl : `curl http://localhost:3000/api/<path>`
- [ ] Vérifier le format de la réponse JSON
- [ ] Tester les cas d'erreur (paramètres manquants, données non trouvées)

#### Étape 4 : Documentation
- [ ] Ajouter la route à la documentation API dans [ARCHITECTURE.md](ARCHITECTURE.md)
- [ ] Si endpoint public, documenter dans le swagger/redoc (à implémenter)

**✅ Workflow terminé**

---

### 4. Nouvelle migration SQL

**Objectif** : Modifier le schéma de la base de données PostgreSQL/PostGIS.

**Contexte** : Les migrations sont gérées automatiquement au démarrage du Worker. Elles sont stockées dans `db/migrations/` et appliquées séquentiellement.

**⚠️ ATTENTION** : Les migrations sont **exécutées automatiquement** en production. Une erreur peut rendre le système inutilisable.

**Étapes détaillées** :

#### Étape 1 : Créer le fichier de migration
**Emplacement** : `db/migrations/NNN_description.sql`

**Format du nom** :
- `NNN` = numéro séquentiel (3 chiffres, ex: 001, 002, ...)
- `description` = description courte en minuscules avec `-` comme séparateur

**Template** :
```sql
-- Migration NNN : description de la migration
-- Date : YYYY-MM-DD
-- Auteur : Agent / Architecte
-- Motif : Expliquer pourquoi cette migration est nécessaire
-- Impact : Liste des tables modifiées

BEGIN;

-- Up: appliquer les changements (doit être idempotent)

-- Exemple 1 : Créer une nouvelle table
CREATE TABLE IF NOT EXISTS nouvelles_donnees (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(255) NOT NULL,
    geometrie GEOMETRY(Point, 4326),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Exemple 2 : Ajouter une colonne
ALTER TABLE couches.objets ADD COLUMN IF NOT EXISTS nouvelle_colonne VARCHAR(255);

-- Exemple 3 : Créer un index
CREATE INDEX IF NOT EXISTS idx_nouvelles_donnees_nom ON nouvelles_donnees(nom);

-- Exemple 4 : Modifier une colonne (ATTENTION : nécessite une migration de données)
-- ALTER TABLE ... ALTER COLUMN ... TYPE ...;

COMMIT;
```

**Règles importantes** :
- **Idempotence** : La migration doit pouvoir être exécutée plusieurs fois sans erreur
- **Transaction** : Toujours dans un bloc BEGIN/COMMIT
- **Rollback** : Ne pas inclure de ROLLBACK (la migration doit réussir ou échouer complètement)
- **Noms** : Toujours utiliser `IF NOT EXISTS` pour les CREATE, `IF EXISTS` pour les DROP

#### Étape 2 : Tester la migration
- [ ] Lancer localement : `docker-compose run --rm worker sh -c "tsx src/index.ts"`
- [ ] Vérifier que la migration s'applique sans erreur
- [ ] Vérifier que l'application fonctionne toujours
- [ ] Tester spécifiquement les fonctionnalités impactées

#### Étape 3 : Ne pas oublier
- Les migrations sont **exécutées automatiquement** au démarrage du Worker
- La table `meta.migrations` trace les migrations appliquées
- **Ne jamais modifier** une migration déjà déployée en production
- Si erreur en production : créer une nouvelle migration pour corriger

**✅ Workflow terminé**

---

### 5. Nouveau composant Svelte

**Objectif** : Créer un nouveau composant interactif pour le frontend.

**Contexte** : Les composants Svelte sont utilisés pour les éléments interactifs (cartes, graphiques, filtres). Ils sont placés dans `apps/web/src/islands/` et utilisés dans les pages Astro.

**Étapes détaillées** :

#### Étape 1 : Créer le fichier
**Emplacement** : `apps/web/src/islands/<Nom>.svelte`

**Règles de nommage** :
- **PascalCase** (ex: `MapTerritoire.svelte`, `ChartDemographie.svelte`)
- Nom descriptif de la fonctionnalité

**Template de base** :
```svelte
<script lang="ts">
  // ============================================
  // IMPORTS
  // ============================================
  import { onMount, onDestroy } from 'svelte';
  import type { SomeType } from '@opendata-vda/shared';

  // ============================================
  // PROPS (toujours typer)
  // ============================================
  export let prop1: string;
  export let prop2: number = 0; // Valeur par défaut
  export let data: SomeType[];

  // ============================================
  // ÉTAT LOCAL
  // ============================================
  let state: string = '';
  let isLoading: boolean = false;
  let error: string | null = null;

  // ============================================
  // LIFECYCLE
  // ============================================
  onMount(() => {
    // Initialisation
    loadData();
    
    return () => {
      // Nettoyage (si nécessaire)
    };
  });

  // ============================================
  // FONCTIONS
  // ============================================
  async function loadData() {
    isLoading = true;
    error = null;
    try {
      // Chargement des données
    } catch (err) {
      error = 'Erreur de chargement';
    } finally {
      isLoading = false;
    }
  }

  // ============================================
  // DERIVED STATE (calculé)
  // ============================================
  $: derivedValue = prop1 + prop2;
</script>

<!-- ============================================
     TEMPLATE
     ============================================ -->
<div class="component-container">
  {#if isLoading}
    <p>Chargement...</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else}
    <!-- Contenu principal -->
    <div class="content">
      {prop1}
    </div>
  {/if}
</div>

<!-- ============================================
     STYLES (scopés au composant)
     ============================================ -->
<style>
  .component-container {
    /* Styles ici */
  }
  
  .error {
    color: var(--color-error);
  }
</style>
```

#### Étape 2 : Utiliser le composant
Dans une page Astro (`apps/web/src/pages/*.astro`) :

```astro
---
import MonComposant from "@opendata-vda/web/islands/MonComposant.svelte";

const data = await fetchData();
---

<MonComposant 
  client:load 
  prop1="valeur" 
  prop2={123} 
  data={data}
/>
```

**Directives client disponibles** :
- `client:load` : Hydrate côté client après le chargement initial
- `client:only="svelte"` : Toujours hydrater côté client
- `client:idle` : Hydrate quand le navigateur est idle
- `client:visible` : Hydrate quand le composant est visible

#### Étape 3 : Vérification
- [ ] Le composant s'affiche correctement
- [ ] Pas d'erreur console
- [ ] Interactivité fonctionnelle (clics, survol, etc.)
- [ ] Styles appliqués correctement
- [ ] Comportement correct en responsive

**✅ Workflow terminé**

---

### 6. Correction de bug

**Objectif** : Corriger un bug identifié dans le système.

**Contexte** : Les bugs doivent être corrigés de manière minimale et ciblée, sans refactorisation complète.

**Étapes détaillées** :

#### Étape 1 : Reproduire le bug
- [ ] Documenter les étapes pour reproduire le bug
- [ ] Identifier le composant/fonction concerné
- [ ] Capturer les erreurs console/logs
- [ ] Noter l'environnement (navigateur, version, etc.)

#### Étape 2 : Analyser la cause racine
- [ ] Lire le code concerné en détail
- [ ] Comprendre le flux de données
- [ ] Identifier pourquoi le bug se produit
- [ ] Vérifier si c'est un problème de :
  - Logique métier
  - Gestion des erreurs
  - Typage
  - Concurence/race condition
  - Données manquantes/invalides
  - Dépendance externe

#### Étape 3 : Proposer une solution
- [ ] Solution **minimale** (ne corriger que le bug, ne pas refactorer tout)
- [ ] Respecter les **invariants architecturaux**
- [ ] Vérifier qu'il n'y a pas de **side effects**
- [ ] Évaluer le **risque** de la correction
- [ ] **Valider avec l'Architecte** si impact important

#### Étape 4 : Implémenter
- [ ] Écrire un **test de reproduction** si possible (fichier dans `apps/*/tests/`)
- [ ] Appliquer la correction
- [ ] Tester que le bug est corrigé
- [ ] Vérifier qu'aucune nouvelle régression n'est introduite

#### Étape 5 : Valider
- [ ] Le bug est-il **vraiment corrigé** ?
- [ ] Pas de **nouvelle régression** introduite ?
- [ ] Tous les tests passent ?
- [ ] La documentation est-elle à jour ?

**✅ Workflow terminé**

---

## ✅ CHECKLISTS

---

### 7. Checklist : Nouvelle source OpenData

**À cocher pour chaque nouvelle source — AUCUNE ÉTAPE NE DOIT ÊTRE OUBLIÉE**

#### ✅ Validation source
- [ ] Licence compatible (Licence Ouverte 2.0, ODbL, CC-BY, etc.)
- [ ] Accès sans clé API (ou clé disponible et sécurisée)
- [ ] Format compréhensible (JSON, CSV, GeoJSON)
- [ ] Fréquence de mise à jour connue
- [ ] Test manuel de l'API réussi

#### ✅ Développement
- [ ] Fichier créé dans `apps/worker/src/sources/<slug>.ts`
- [ ] Import ajouté dans `scheduler.ts`
- [ ] Job ajouté dans tableau `JOBS` avec cron approprié
- [ ] Entrée ajoutée dans `CATALOGUE_SOURCES` (`territoire.ts`)
- [ ] Filtrage sur le territoire (codes INSEE 30339 / EPCI 200034601)
- [ ] Gestion des erreurs implémentée (`try/catch`)
- [ ] Logging via `logFetchStart`/`logFetchEnd`

#### ✅ Données
- [ ] Upsert dans la bonne couche (`upsertObjet` ou `upsertObjetsEnLot`)
- [ ] Propriétés pertinentes stockées dans `props`
- [ ] Géométrie correcte (SRID 4326)
- [ ] `source_url` défini
- [ ] `licence` défini

#### ✅ Tests
- [ ] Test manuel avec `RUN_ONCE=true RUN_ONLY=<slug>`
- [ ] Vérification dans `/api/couches/<slug>/geojson`
- [ ] Vérification visuelle sur la carte (si applicable)
- [ ] Nombre d'objets cohérent avec les attentes

#### ✅ Documentation
- [ ] ADR créé si décision architecturale
- [ ] Workflow mis à jour si nouveau pattern
- [ ] Page `sources.astro` automatiquement mise à jour (via `CATALOGUE_SOURCES`)

---

### 8. Checklist : Déploiement en production

**À exécuter avant chaque déploiement — PAS DE DÉPLOIEMENT SANS VÉRIFICATION COMPLÈTE**

#### ✅ Pré-requis VPS
- [ ] Docker installé et fonctionnel
- [ ] Docker Compose installé (version compatible)
- [ ] Ports 80/443 ouverts sur le firewall
- [ ] Domaine DNS configuré et pointant vers l'IP du VPS
- [ ] Certificats SSL valides (Let's Encrypt ou autres)
- [ ] Espace disque suffisant (> 10 Go libre)
- [ ] Mémoire suffisante (> 2 Go)

#### ✅ Configuration
- [ ] Fichier `.env` complet sur le VPS
- [ ] Variables `POSTGRES_*` correctes (user, password, db)
- [ ] `SITE_DOMAIN` correct
- [ ] `DATABASE_URL` correct
- [ ] Clés API externes présentes (Météo-France, DATAtourisme si applicable)
- [ ] PMTiles générées (si la zone a changé)

#### ✅ Build
- [ ] `pnpm install` exécuté (pas d'erreurs)
- [ ] `docker-compose build` réussi (pas d'erreurs)
- [ ] Aucune erreur de compilation TypeScript
- [ ] Toutes les dépendances résolues

#### ✅ Initialisation
- [ ] Conteneurs lancés : `docker-compose up -d`
- [ ] Base de données migrée (vérifier avec `docker-compose logs worker`)
- [ ] Données initiales chargées (`RUN_ONCE=true` exécuté)
- [ ] Toutes les sources exécutées avec succès

#### ✅ Vérification fonctionnelle
- [ ] `http://<domain>` accessible (pas de timeout, pas d'erreur 5xx)
- [ ] `https://<domain>` accessible avec SSL valide (🔒 dans la barre d'adresse)
- [ ] Page d'accueil s'affiche sans erreur
- [ ] Carte fonctionne et affiche les couches
- [ ] Recherche fonctionne
- [ ] Toutes les pages thématiques accessibles
- [ ] API fonctionne : `/api/couches` retourne des données
- [ ] Worker fonctionne : logs dans `docker-compose logs worker`

#### ✅ Monitoring
- [ ] Logs Docker accessibles (`docker-compose logs`)
- [ ] Healthchecks configurés et fonctionnels
- [ ] Sauvegardes base de données en place et testées
- [ ] Surveillance des performances (optionnel : Prometheus/Grafana)

#### ✅ Post-déploiement
- [ ] Vérifier les logs après 1h de production
- [ ] Tester les fonctionnalités critiques
- [ ] Notifier l'Architecte du déploiement réussi

---

## 📝 PROTOCOLE 10 ÉTAPES

**À suivre pour toute opération non couverte par un workflow existant**

### Étape 1 : Comprendre le besoin
- Relire la demande initiale
- Clarifier les ambiguïtés avec l'Architecte
- Identifier l'objectif précis

### Étape 2 : Identifier les composants concernés
- Lister tous les fichiers/composants impactés
- Identifier les dépendances
- Comprendre les flux de données

### Étape 3 : Vérifier si une solution existe déjà
- Rechercher dans le codebase (`grep`, `find`)
- Vérifier la documentation existante
- Consulter les ADR

### Étape 4 : Décrire le plan avant de coder
- Rédiger un plan détaillé (comme dans l'exemple ci-dessous)
- Identifier les risques
- Estimer l'effort
- **SOUMETTRE À VALIDATION** si impact important

**Exemple de plan** :
```markdown
## Plan : Ajouter source INSEE Population Légale

### Objectif
Intégrer les données de population légale INSEE via l'API Melodi.

### Analyse existante
- Source similaire : geoapi.ts (appel API publique)
- Pattern : fetch → transform → upsert via upsertObjetsEnLot
- Modèle : couche "population" dans couches.objets

### Fichiers à créer/modifier
1. apps/worker/src/sources/insee.ts (NOUVEAU)
2. apps/worker/src/scheduler.ts (MODIFIER : ajouter job)
3. packages/shared/src/territoire.ts (MODIFIER : ajouter à CATALOGUE_SOURCES)

### Changements détaillés
- insee.ts : appel API Melodi, filtrage code_insee=30339, transformation en objets
- scheduler.ts : ajouter { slug: "insee", cron: "0 3 7 * *", run: insee.run }
- territoire.ts : ajouter entrée dans CATALOGUE_SOURCES

### Impact
- 3 fichiers modifiés
- Nouvelle couche en base : "population" (~10 objets)
- Pas de breaking change

### Risques
- Faible : API Melodi sans clé, déjà testée
- À vérifier : format des données à parser

### Validation requise ?
Non (3 fichiers, risque faible) → Je peux implémenter directement
```

### Étape 5 : Attendre validation si l'impact est important
- **Toujours valider** si :
  - Modification d'architecture
  - Changement d'API publique
  - Plus de 5 fichiers modifiés
  - Risque élevé
- Attendre le feu vert de l'Architecte

### Étape 6 : Implémenter par petites étapes
- Commiter après chaque changement cohérent
- Tester après chaque étape
- Ne pas tout faire en un seul commit

### Étape 7 : Vérifier la cohérence globale
- Le code compile-t-il ?
- Les tests passent-ils ?
- Y a-t-il des erreurs console ?
- La documentation est-elle à jour ?

### Étape 8 : Mettre à jour la documentation
- Mettre à jour le workflow concerné
- Créer un ADR si décision architecturale
- Mettre à jour la documentation technique

### Étape 9 : Proposer les tests à exécuter
- Lister les tests manuels à effectuer
- Lister les commandes à exécuter
- Identifier les cas limites à tester

### Étape 10 : Résumer les changements et les impacts
- Fichiers modifiés
- Décisions prises
- Dette technique introduite (si applicable)
- Risques résiduels
- Prochaines étapes

---

## 🎨 TEMPLATES RÉUTILISABLES

### Template : Fichier source worker

```typescript
// apps/worker/src/sources/<slug>.ts
import type pg from "pg";
import { 
  upsertObjetsEnLot, 
  logFetchStart, 
  logFetchEnd,
  type ObjetGeo 
} from "@opendata-vda/shared";

// Configuration spécifique à la source
const API_URL = "https://api.example.com/data";
const LICENCE = "Licence Ouverte 2.0";

export async function run(pool: pg.Pool): Promise<number> {
  const logId = await logFetchStart(pool, "<slug>", { 
    url: API_URL,
    licence: LICENCE 
  });
  
  try {
    // 1. Fetch
    const response = await fetch(API_URL, {
      headers: { 'User-Agent': 'OpenDataVdA Worker' }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const rawData = await response.json();
    
    // 2. Transform
    const objets: ObjetGeo[] = rawData
      .filter((item: any) => 
        item.code_insee === '30339' || 
        item.code_epci === '200034601'
      )
      .map((item: any) => ({
        id: String(item.id),
        nom: item.nom,
        geometrie: item.geometry || null,
        props: {
          ...transformProps(item),
          source: "<slug>",
          source_url: API_URL,
          licence: LICENCE
        },
        couche: "<couche>"
      }));
    
    // 3. Upsert
    const nbLignes = await upsertObjetsEnLot(pool, "<couche>", objets);
    
    await logFetchEnd(pool, logId, "ok", nbLignes);
    return nbLignes;
    
  } catch (err) {
    await logFetchEnd(pool, logId, "erreur", undefined, (err as Error).message);
    throw err;
  }
}

function transformProps(item: any): Record<string, any> {
  // Transformation spécifique des propriétés
  return {
    // Exemple
    population: item.population,
    annee: item.annee
  };
}
```

### Template : Migration SQL

```sql
-- Migration NNN : description précise de ce que fait cette migration
-- Date : YYYY-MM-DD
-- Auteur : Agent
-- Motif : [Expliquer pourquoi cette migration est nécessaire]
-- Impact : [Liste des tables/colonnes modifiées]
-- Liens : [Liens vers la documentation ou tickets associés]

BEGIN;

-- Toujours vérifier si l'objet existe avant de le créer
CREATE TABLE IF NOT EXISTS nouvelle_table (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(255) NOT NULL,
    geometrie GEOMETRY(Point, 4326),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ajouter des commentaires pour expliquer la logique
ALTER TABLE nouvelle_table ADD COLUMN IF NOT EXISTS description TEXT;

-- Créer des index pour les performances
CREATE INDEX IF NOT EXISTS idx_nouvelle_table_nom ON nouvelle_table(nom);

-- Créer un index spatial si géométrie
CREATE INDEX IF NOT EXISTS idx_nouvelle_table_geom ON nouvelle_table USING GIST(geometrie);

COMMIT;
```

### Template : Route API Fastify

```typescript
// apps/api/src/routes/<nom>.ts
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getPool } from "@opendata-vda/shared";
import { z } from "zod";

// Schéma de validation des requêtes (optionnel mais recommandé)
const QuerySchema = z.object({
  limit: z.number().default(100),
  offset: z.number().default(0)
});

export default async function (fastify: FastifyInstance) {
  
  // GET /api/<path>
  fastify.get("/api/<path>", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const pool = getPool();
      
      // Valider les paramètres de requête
      const query = QuerySchema.parse(request.query);
      
      // Exécuter la requête
      const { rows, rowCount } = await pool.query(`
        SELECT * FROM couches.objets 
        WHERE couche = $1
        LIMIT $2 OFFSET $3
      `, ["<couche>", query.limit, query.offset]);
      
      // Retourner une réponse standardisée
      return {
        success: true,
        data: rows,
        pagination: {
          total: rowCount,
          limit: query.limit,
          offset: query.offset
        }
      };
      
    } catch (err) {
      // Gestion centralisée des erreurs
      if (err instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: "Invalid request",
          details: err.errors
        });
      }
      
      fastify.log.error(err);
      return reply.status(500).send({
        success: false,
        error: "Internal server error"
      });
    }
  });
  
  // POST /api/<path> (si nécessaire)
  fastify.post("/api/<path>", {
    schema: {
      body: z.object({
        // Schéma du body
      })
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    // Logique de création
  });
}
```

### Template : Page Astro

```astro
---
// apps/web/src/pages/<slug>.astro
import SectionLayout from "@opendata-vda/web/layouts/SectionLayout.astro";
import type { SectionConfig } from "@opendata-vda/shared";

// Configuration de la section
const config: SectionConfig = {
  id: "<slug>",
  title: "Titre de la page",
  description: "Description courte pour la navigation",
  icon: "icon-name",
  color: "#rrggbb"
};

// Récupération des données
const response = await fetch('/api/couches/<couche>/geojson');
const data = await response.json();

// METADONNEES POUR LA NAVIGATION - NE PAS MODIFIER
const sectionId = "<slug>";
---

<SectionLayout {config}>
  
  <!-- Introduction -->
  <section class="intro">
    <h1>{config.title}</h1>
    <p class="lead">{config.description}</p>
  </section>
  
  <!-- Contenu principal -->
  <section class="section">
    <h2>Sous-section</h2>
    <p>Contenu explicatif...</p>
    
    {#if data.data.length > 0}
      <!-- Affichage des données -->
      <div class="data-container">
        <!-- Utilisation d'un composant Svelte -->
        <!-- <MaCarte client:load data={data.data} /> -->
      </div>
    {:else}
      <p class="info">Aucune donnée disponible pour le moment.</p>
    {/if}
  </section>
  
  <!-- Section attribution -->
  <section class="attribution">
    <h2>Sources</h2>
    <p>Données provenants de : <a href="#">Nom de la source</a> (Licence Ouverte 2.0)</p>
  </section>
  
</SectionLayout>
```

---

## 📚 RÉFÉRENCES

- **[ARCHITECTURE.md](ARCHITECTURE.md)** : Description technique complète
- **[STYLEGUIDE.md](STYLEGUIDE.md)** : Conventions de code et d'organisation
- **[AGENT.md](AGENT.md)** : Règles de comportement de l'agent
- **[AGENT_OPERATING_MANUAL.md](AGENT_OPERATING_MANUAL.md)** : Document maître complet
- **[VISION.md](VISION.md)** : Vision et mission du projet

---

## 📝 HISTORIQUE

| Version | Date | Auteur | Changements |
|---------|------|--------|-------------|
| 1.0 | 2026-07-10 | Agent | Création initiale |
