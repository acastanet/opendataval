# ADR-003 : Choix de PostgreSQL + PostGIS

## Statut
✅ Accepté

## Contexte

Le projet nécessite une base de données capable de :
- Stocker des données géospatiales (points, polygones, etc.)
- Supporter des requêtes géométriques complexes
- Être performante pour les opérations de filtrage spatial
- Être fiable et mature
- S'intégrer avec Docker

**Problème à résoudre** : Quelle base de données utiliser pour un projet avec :
1. Données géospatiales importantes (contours, couches SIG, etc.)
2. Besoin de requêtes spatiales (intersections, distances, etc.)
3. Persistance à long terme
4. Intégration avec TypeScript/Node.js

**Contraintes** :
- Budget limité
- Équipe réduite
- Besoin de stabilité
- Compatibilité avec les outils open source

## Décision

**Utiliser PostgreSQL avec l'extension PostGIS comme base de données géospatiale.**

### Architecture retenue :
```
Base de données : PostgreSQL 16 + PostGIS 3.4
├── Schéma public : Données non-géométriques
├── Schéma couches : Données géospatiales
│   ├── tableaux.objets : Table générique pour toutes les couches
│   └── meta.migrations : Suivi des migrations
└── Index spatiaux : GIST sur les colonnes géométriques
```

### Modèle de données principal

```sql
-- Table générique pour toutes les données géospatiales
CREATE TABLE couches.objets (
    id SERIAL PRIMARY KEY,
    couche VARCHAR(100) NOT NULL,        -- Nom de la couche (ex: "risques", "natura2000")
    source VARCHAR(100) NOT NULL,        -- Source des données (ex: "georisques")
    source_id VARCHAR(255) NOT NULL,      -- ID dans la source originale
    nom VARCHAR(500),                     -- Nom de l'objet
    geometrie GEOMETRY(Geometry, 4326),  -- Géométrie (SRID 4326 = WGS84)
    props JSONB NOT NULL,                 -- Propriétés supplémentaires
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT unique_couche_source_id UNIQUE (couche, source_id)
);

-- Index pour les requêtes fréquentes
CREATE INDEX idx_objets_couche ON couches.objets(couche);
CREATE INDEX idx_objets_source ON couches.objets(source);
CREATE INDEX idx_objets_geom ON couches.objets USING GIST(geometrie);

-- Index pour la recherche full-text si nécessaire
CREATE INDEX idx_objets_nom_trgm ON couches.objets USING gin (nom gin_trgm_ops);
```

### Choix spécifiques :
- **PostgreSQL 16** : Version LTS avec bonnes performances
- **PostGIS 3.4** : Dernière version stable avec toutes les fonctionnalités nécessaires
- **SRID 4326** : Standard pour les coordonnées géographiques (WGS84)
- **JSONB** : Pour les propriétés flexibles sans schéma rigide

## Conséquences

### Positives
- ✅ **Standard de l'industrie** : PostgreSQL/PostGIS est LA référence pour les SIG
- ✅ **Performances spatiales** : Index GIST optimisés pour les requêtes géométriques
- ✅ **Flexibilité** : Modèle générique supportant toutes les couches
- ✅ **Fiabilité** : PostgreSQL est extrêmement stable et mature
- ✅ **Écosystème** : Beaucoup d'outils, bibliothèques, et documentation
- ✅ **Docker-friendly** : Image officielle `postgis/postgis` bien maintenue
- ✅ **SQL standard** : Compatible avec tous les clients SQL
- ✅ **Extensions** : Possibilité d'ajouter d'autres extensions (pg_trgm, etc.)
- ✅ **Open Source** : Pas de coût de licence

### Négatives
- ❌ **Courbe d'apprentissage** : PostGIS a des concepts spécifiques (SRID, projections, etc.)
- ❌ **Ressources** : PostgreSQL nécessite plus de mémoire que SQLite
- ❌ **Complexité** : Configuration initiale plus complexe que Firebase ou MongoDB
- ❌ **Maintenance** : Nécessite des sauvegardes régulières

## Alternatives considérées

### 1. MongoDB + GeoJSON
- ✅ Flexibilité du schéma
- ✅ Bonnes performances pour les lectures
- ✅ Intégration facile avec Node.js
- ❌ **Requêtes spatiales limitées** : Pas aussi puissant que PostGIS
- ❌ **Pas de transactions** : Moins adapté pour la cohérence des données
- ❌ **Consommation mémoire** : Peut être très gourmand
- ❌ **Pas de SRID natif** : Gestion des projections plus complexe
- 📌 **Pourquoi rejetée** : Moins adapté pour les SIG complexes

### 2. SQLite + SpatiaLite
- ✅ Légère et portable
- ✅ Pas de serveur nécessaire
- ✅ Bonne pour les petits projets
- ❌ **Performances limitées** : Pas adapté pour de gros volumes
- ❌ **Pas de concurence** : Problèmes avec plusieurs writers
- ❌ **Moins mature** : SpatiaLite moins testé que PostGIS
- ❌ **Pas de Docker natif** : Plus complexe à conteneuriser
- 📌 **Pourquoi rejetée** : Pas adapté à l'échelle du projet

### 3. MySQL + Spatial Extension
- ✅ Familier pour beaucoup de développeurs
- ✅ Bonnes performances
- ❌ **Extensions spatiales moins matures** que PostGIS
- ❌ **Licence** : MySQL a des restrictions ( Oracles)
- ❌ **Moins de fonctionnalités géospatiales**
- 📌 **Pourquoi rejetée** : PostGIS est supérieur pour les SIG

### 4. Firebase / Firestore
- ✅ Pas de gestion de serveur
- ✅ Scaling automatique
- ✅ Intégration facile avec le frontend
- ❌ **Pas adapté pour les données géospatiales** : Support limité
- ❌ **Coûts** : Peut devenir cher à l'échelle
- ❌ **Vendor lock-in** : Difficile à migrer
- ❌ **Pas de SQL** : Requêtes complexes difficiles
- 📌 **Pourquoi rejetée** : Pas adapté à nos besoins SIG

### 5. Neo4j (Base de données graphe)
- ✅ Excellent pour les relations complexes
- ✅ Bon pour les réseaux (transport, etc.)
- ❌ **Pas adapté pour les données géospatiales** : Pas de support natif
- ❌ **Courbe d'apprentissage** : Modèle de données très différent
- 📌 **Pourquoi rejetée** : Pas le bon outil pour notre cas d'usage

## Notes supplémentaires

### Avantages du modèle générique

Le modèle `couches.objets` permet de :
1. **Stocker toutes les données** dans une seule table
2. **Ajouter de nouvelles couches** sans migration
3. **Requêter toutes les couches** avec la même syntaxe
4. **Créer des index spécifiques** par couche si nécessaire
5. **Éviter la duplication** de code pour les opérations CRUD

### Exemples de requêtes PostGIS

```sql
-- Trouver tous les objets d'une couche
SELECT * FROM couches.objets WHERE couche = 'risques';

-- Trouver les objets dans un bounding box
SELECT * FROM couches.objets 
WHERE couche = 'etablissements'
AND geometrie && ST_MakeEnvelope(minX, minY, maxX, maxY, 4326);

-- Calculer la distance entre deux points
SELECT ST_Distance(
    ST_GeomFromText('POINT(lon1 lat1)', 4326),
    ST_GeomFromText('POINT(lon2 lat2)', 4326)
) AS distance_metres;

-- Trouver les objets à moins de 1km d'un point
SELECT * FROM couches.objets 
WHERE ST_DWithin(
    geometrie,
    ST_GeomFromText('POINT(lon lat)', 4326),
    1000  -- 1000 mètres
);

-- Calculer le centroïde d'une géométrie
SELECT ST_Centroid(geometrie) FROM couches.objets WHERE id = 123;

-- Transformer une géométrie en GeoJSON
SELECT ST_AsGeoJSON(geometrie) FROM couches.objets WHERE id = 123;
```

### Configuration PostgreSQL/PostGIS

```sql
-- Activer les extensions nécessaires
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Vérifier les versions
SELECT PostGIS_Version();
SELECT PostGIS_Full_Version();
```

### Gestion des migrations

Les migrations sont stockées dans `db/migrations/` et appliquées automatiquement au démarrage du Worker.

```bash
# Structure des migrations
DB /
└── migrations /
    ├── 001-init-couchés-objets.sql
    ├── 002-add-index-geom.sql
    └── 003-add-table-meta.sql
```

## Liens
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [PostGIS Documentation](https://postgis.net/docs/)
- [PostGIS Tutorial](https://postgis.net/workshops/postgis-intro/)
- [pgMustard](https://www.pgmustard.com/) - Visualisation des requêtes

---

## Historique
| Date | Auteur | Action |
|------|--------|--------|
| 2026-07-08 | Architecte | Décision initiale |
| 2026-07-10 | Agent | Documentation ADR |
