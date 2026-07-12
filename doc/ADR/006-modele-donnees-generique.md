# ADR-006 : Modèle de données générique (couches.objets)

## Statut
✅ Accepté

## Contexte

Le projet doit stocker des données géospatiales provenants de multiples sources différentes :
- Géorisques (risques naturels)
- INSEE (population, démographie)
- OFGL (finances publiques)
- Hub'Eau (hydrométrie)
- API Carto (cadastre, Natura 2000)
- Et bien d'autres...

**Problème à résoudre** : Comment structurer la base de données pour :
1. Accueillir des données hétérogènes (schémas différents)
2. Permettre des requêtes spatiales efficaces
3. Faciliter l'ajout de nouvelles sources
4. Maintenir la performance avec beaucoup de données
5. Supporter les métadonnées (source, licence, date de mise à jour)

**Contraintes** :
- PostGIS comme base de données
- Besoin de flexibilité (schéma évolutif)
- Performance pour les requêtes spatiales
- Simplicité de développement

## Décision

**Utiliser un modèle de données générique avec une seule table `couches.objets` pour toutes les données géospatiales.**

### Architecture retenue :
```
Table : couches.objets
├── id (SERIAL)              - Clé primaire
├── couche (VARCHAR)        - Nom de la couche (ex: "risques", "etablissements")
├── source (VARCHAR)        - Source des données (ex: "georisques", "insee")
├── source_id (VARCHAR)     - ID dans la source originale
├── nom (VARCHAR)           - Nom de l'objet (optionnel)
├── geometrie (GEOMETRY)    - Géométrie PostGIS (SRID 4326)
├── props (JSONB)           - Propriétés spécifiques (flexible)
├── created_at (TIMESTAMP)  - Date de création
└── updated_at (TIMESTAMP)  - Date de mise à jour

Index :
├── idx_objets_couche       - Recherche par couche
├── idx_objets_source      - Recherche par source
├── idx_objets_geom        - Index spatial GIST
└── idx_objets_source_id   - Unicité source_id par source
```

### Choix spécifiques :
- **Une table pour toutes les couches** : Au lieu d'une table par source
- **JSONB pour les propriétés** : Schéma flexible sans migration
- **SRID 4326** : Standard WGS84 pour toutes les géométries
- **source + source_id** : Clé composite pour l'unicité

## Conséquences

### Positives
- ✅ **Flexibilité maximale** : Ajout de nouvelles sources sans migration
- ✅ **Schéma évolutif** : Les propriétés spécifiques vont dans JSONB
- ✅ **Requêtes uniformes** : Même syntaxe pour toutes les couches
- ✅ **Index spatial unique** : Une seule table à indexer pour les requêtes spatiales
- ✅ **Simplicité** : Un seul modèle à comprendre et maintenir
- ✅ **Performance** : Les index permettent des requêtes rapides
- ✅ **Maintenabilité** : Moins de code dupliqué (un seul CRUD)
- ✅ **Extensions futures** : Facile d'ajouter des colonnes si besoin

### Négatives
- ❌ **Moins de typage fort** : Les propriétés dans JSONB ne sont pas typées en SQL
- ❌ **Requêtes complexes** : Peut nécessiter des fonctions JSON en SQL
- ❌ **Validation** : La validation des données doit être faite en amont (dans le Worker)
- ❌ **Migration des données** : Difficile si besoin de changer de schéma
- ❌ **Stockage** : JSONB peut consommer plus d'espace que des colonnes typées

## Alternatives considérées

### 1. Une table par source
```sql
-- Exemple pour Géorisques
CREATE TABLE georisques_risques (
    id SERIAL PRIMARY KEY,
    type VARCHAR NOT NULL,
    nom VARCHAR NOT NULL,
    geometrie GEOMETRY,
    niveau VARCHAR,
    -- ... autres champs spécifiques
);
```
- ✅ Typage fort pour chaque source
- ✅ Schéma explicite
- ✅ Validation en base
- ❌ **Beaucoup de tables** : Une table par source = maintenance complexe
- ❌ **Code dupliqué** : CRUD à réimplémenter pour chaque table
- ❌ **Requêtes cross-source difficiles** : UNION nécessaire
- ❌ **Migrations fréquentes** : À chaque nouvelle source
- 📌 **Pourquoi rejetée** : Complexité de maintenance trop élevée

### 2. Schéma par source avec table générique
```sql
-- Table générique
CREATE TABLE objets (
    id SERIAL PRIMARY KEY,
    geometrie GEOMETRY,
    props JSONB
);

-- Tables spécifiques pour les métadonnées
CREATE TABLE sources (
    id SERIAL PRIMARY KEY,
    nom VARCHAR UNIQUE
);

CREATE TABLE couches (
    id SERIAL PRIMARY KEY,
    source_id INTEGER REFERENCES sources(id),
    nom VARCHAR
);
```
- ✅ Meilleure organisation
- ✅ Typage partiel
- ❌ **Complexité accrue** : Jointures nécessaires pour les requêtes
- ❌ **Moins flexible** que le modèle choisi
- 📌 **Pourquoi rejetée** : Le modèle générique pur est plus simple

### 3. Base de données document (MongoDB)
```javascript
// Chaque document = un objet géospatial
{
    _id: ObjectId,
    couche: "risques",
    source: "georisques",
    source_id: "123",
    nom: "Inondation",
    type: "Polygon",
    coordinates: [...],
    properties: { niveau: "moyen", ... }
}
```
- ✅ Flexibilité maximale
- ✅ Schéma dynamique
- ❌ **Requêtes spatiales limitées** : Moins performant que PostGIS
- ❌ **Pas de transactions** : Problèmes de cohérence
- ❌ **Moins adapté pour les SIG** : PostGIS est supérieur
- 📌 **Pourquoi rejetée** : Moins adapté à nos besoins géospatiaux

### 4. Modèle EAV (Entity-Attribute-Value)
```sql
CREATE TABLE objets (
    id SERIAL PRIMARY KEY,
    couche VARCHAR NOT NULL,
    geometrie GEOMETRY
);

CREATE TABLE attributes (
    objet_id INTEGER REFERENCES objets(id),
    nom VARCHAR NOT NULL,
    valeur TEXT NOT NULL
);
```
- ✅ Flexibilité totale
- ❌ **Performances catastrophiques** : Jointures massives
- ❌ **Complexité des requêtes** : Très difficile à interroger
- ❌ **Maintenance complexe** : Schéma peu intuitif
- 📌 **Pourquoi rejetée** : Trop inefficace pour les requêtes spatiales

## Notes supplémentaires

### Avantages du modèle générique

#### 1. Ajout de nouvelles sources
**Avant** (modèle spécifique) :
```typescript
// Pour chaque nouvelle source :
// 1. Créer une nouvelle table SQL
// 2. Créer un nouveau modèle TypeScript
// 3. Écrire un nouveau CRUD
// 4. Migrer la base de données
```

**Après** (modèle générique) :
```typescript
// Pour chaque nouvelle source :
// 1. Ajouter une entrée dans CATALOGUE_SOURCES
// 2. Créer un script Worker (fetch → transform → upsert)
// C'est tout !
```

#### 2. Requêtes uniformes
```sql
-- Toutes les couches utilisent la même syntaxe
SELECT * FROM couches.objets WHERE couche = 'risques';
SELECT * FROM couches.objets WHERE couche = 'etablissements';
SELECT * FROM couches.objets WHERE couche = 'natura2000';
```

#### 3. Requêtes cross-source
```sql
-- Trouver tous les objets dans un bounding box, quelle que soit la couche
SELECT * FROM couches.objets 
WHERE geometrie && ST_MakeEnvelope(minX, minY, maxX, maxY, 4326);

-- Compter le nombre d'objets par couche
SELECT couche, COUNT(*) FROM couches.objets GROUP BY couche;
```

#### 4. Index spatial unique
```sql
-- Un seul index GIST pour toutes les données
CREATE INDEX idx_objets_geom ON couches.objets USING GIST(geometrie);

-- Optimisation possible : index partiel par couche si nécessaire
CREATE INDEX idx_risques_geom ON couches.objets USING GIST(geometrie) 
WHERE couche = 'risques';
```

### Exemples de données

#### Objet de la couche "risques" (Géorisques)
```json
{
  "id": 1,
  "couche": "risques",
  "source": "georisques",
  "source_id": "INONDATION_30339_001",
  "nom": "Zone inondable - Hérault",
  "geometrie": {
    "type": "MultiPolygon",
    "coordinates": [[[...]]]
  },
  "props": {
    "type_risque": "inondation",
    "niveau": "moyen",
    "source_url": "https://georisques.gouv.fr/...",
    "licence": "Licence Ouverte 2.0",
    "date_mise_a_jour": "2024-01-15",
    "description": "Zone inondable du siècle..."
  },
  "created_at": "2026-07-10T10:00:00Z",
  "updated_at": "2026-07-10T10:00:00Z"
}
```

#### Objet de la couche "etablissements" (SIRENE)
```json
{
  "id": 2,
  "couche": "etablissements",
  "source": "sirene",
  "source_id": "20008272500010",
  "nom": "Mairie de Val-d'Aigoual",
  "geometrie": {
    "type": "Point",
    "coordinates": [3.6414, 44.081]
  },
  "props": {
    "siren": "200082725",
    "nature": "Commune",
    "adresse": "Place de la Mairie",
    "code_postal": "30570",
    "source_url": "https://recherche-entreprises.api.gouv.fr/...",
    "licence": "Licence Ouverte 2.0",
    "date_mise_a_jour": "2026-07-01"
  },
  "created_at": "2026-07-10T10:05:00Z",
  "updated_at": "2026-07-10T10:05:00Z"
}
```

### Requêtes SQL typiques

#### Récupérer tous les objets d'une couche en GeoJSON
```sql
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
LIMIT $2;
```

#### Récupérer un objet par son ID source
```sql
SELECT * 
FROM couches.objets 
WHERE source = $1 AND source_id = $2;
```

#### Compter le nombre d'objets par couche
```sql
SELECT 
  couche,
  source,
  COUNT(*) as count,
  MAX(updated_at) as last_updated
FROM couches.objets
GROUP BY couche, source
ORDER BY count DESC;
```

#### Trouver les objets à moins de 1km d'un point
```sql
SELECT *
FROM couches.objets
WHERE ST_DWithin(
  geometrie,
  ST_GeomFromText('POINT(lon lat)', 4326),
  1000  -- 1000 mètres
)
AND couche IN ('etablissements', 'risques', 'natura2000');
```

### Validation des données

La validation est faite dans le Worker avant l'insertion :

```typescript
// apps/worker/src/sources/georisques.ts
import { z } from 'zod';

const RisqueSchema = z.object({
  id: z.string(),
  type: z.string(),
  nom: z.string(),
  niveau: z.enum(['faible', 'moyen', 'eleve', 'tres eleve']),
  geometry: z.object({
    type: z.enum(['Polygon', 'MultiPolygon']),
    coordinates: z.array(z.any()),
  }),
  // ... autres champs
});

// Validation avant upsert
const validatedData = RisqueSchema.parse(rawData);
```

### Migration possible vers des colonnes typées

Si certaines propriétés sont utilisées très fréquemment, on peut ajouter des colonnes dédiées :

```sql
-- Ajouter une colonne pour le niveau de risque
ALTER TABLE couches.objets ADD COLUMN IF NOT EXISTS niveau_risque VARCHAR;

-- Index sur cette colonne
CREATE INDEX IF NOT EXISTS idx_objets_niveau_risque ON couches.objets(niveau_risque);

-- Mettre à jour les données existantes
UPDATE couches.objets 
SET niveau_risque = props->>'niveau'
WHERE couche = 'risques' AND props ? 'niveau';

-- Modifier le Worker pour peupler cette colonne
```

### Sauvegarde et restauration

```bash
# Sauvegarde complète
pg_dump -U postgres opendata_vda > backup.sql

# Restauration
psql -U postgres opendata_vda < backup.sql

# Export GeoJSON d'une couche spécifique
ogr2ogr -f GeoJSON risque.geojson \
  PG:"dbname=opendata_vda user=postgres" \
  -sql "SELECT * FROM couches.objets WHERE couche = 'risques'"
```

## Liens
- [PostgreSQL JSONB Documentation](https://www.postgresql.org/docs/current/datatype-json.html)
- [PostGIS Geometry Types](https://postgis.net/docs/using_postgis_dbmanagement.html#PostGIS_Geometry)
- [GeoJSON Specification](https://datatracker.ietf.org/doc/html/rfc7946)

---

## Historique
| Date | Auteur | Action |
|------|--------|--------|
| 2026-07-08 | Architecte | Décision initiale (modèle générique prévu) |
| 2026-07-10 | Agent | Documentation ADR |
