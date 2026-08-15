# ADR-004 : Choix de MapLibre GL JS + PMTiles

## Statut
✅ Accepté

## Contexte

Le projet nécessite une solution cartographique capable de :
- Afficher des fonds de carte IGN (PLANIGNV2, ORTHOPHOTOS)
- Superposer des couches GeoJSON (contours, risques, Natura 2000, etc.)
- Être performante et fluide
- Fonctionner sur mobile et desktop
- Supporter les interactions (zoom, pan, clic sur les objets)
- Être compatible avec les données PostGIS

**Problème à résoudre** : Quelle stack cartographique choisir pour un projet avec :
1. Besoin de fonds de carte professionnels (IGN)
2. Données vectorielles locales et distantes
3. Visualisation 2D et potentiellement 3D (relief)
4. Intégration avec Svelte/Astro

**Contraintes** :
- Budget limité (pas de solutions payantes comme ArcGIS)
- Compatibilité avec les standards open source
- Performance sur mobile
- Accès aux tuiles WMTS IGN

## Décision

**Utiliser MapLibre GL JS comme librairie de rendu cartographique, avec PMTiles pour le fond de carte.**

### Architecture retenue :
```
Carte /
├── MapLibre GL JS      - Rendu WebGL des tuiles et couches vectorielles
├── PMTiles             - Format de stockage des tuiles vectorielles (relief)
├── WMTS IGN            - Fond de carte (PLANIGNV2, ORTHOPHOTOS)
└── GeoJSON             - Couches vectorielles dynamiques (PostGIS → API → Frontend)
```

### Choix spécifiques :
- **MapLibre GL JS v3+** : Fork open source de Mapbox GL JS
- **PMTiles** : Format moderne pour les tuiles vectorielles
- **Projection EPSG:3857** : Standard pour les tuiles web (Web Mercator)
- **SRID 4326 → 3857** : Transformation automatique pour l'affichage

## Conséquences

### Positives
- ✅ **Open Source** : MapLibre est 100% open source (vs Mapbox payant)
- ✅ **Performances** : Rendu WebGL ultra-rapide
- ✅ **Flexibilité** : Supporte de multiples sources de tuiles
- ✅ **Standards** : Compatible avec WMTS, GeoJSON, Vector Tiles
- ✅ **Écosystème** : Grande communauté, beaucoup de plugins
- ✅ **3D Ready** : Support natif du terrain 3D (pour le relief du Mont Aigoual)
- ✅ **Mobile-friendly** : Optimisé pour les écrans tactiles
- ✅ **TypeScript** : Définitions de types disponibles
- ✅ **PMTiles** : Format compact et performant pour le relief

### Négatives
- ❌ **Taille du bundle** : MapLibre pèse ~1MB (mais acceptable)
- ❌ **Complexité** : Courbe d'apprentissage pour les débutants
- ❌ **Gestion de la mémoire** : Peut consommer beaucoup de mémoire avec beaucoup de couches
- ❌ **PMTiles expérimental** : Moins mature que les solutions traditionnelles

## Alternatives considérées

### 1. Leaflet
- ✅ Léger (~40KB)
- ✅ Simple à utiliser
- ✅ Grande communauté
- ✅ Bonnes performances
- ❌ **Pas de 3D** : Impossible de faire du terrain 3D
- ❌ **Rendu raster uniquement** : Moins performant pour les vector tiles
- ❌ **Style moins flexible** : Difficile à personnaliser
- ❌ **Pas de WebGL** : Moins fluide pour les grandes quantités de données
- 📌 **Pourquoi rejetée** : Manque de 3D et de performance pour les vector tiles

### 2. OpenLayers
- ✅ Très complet
- ✅ Supporte tous les standards OGC
- ✅ Bonne communauté
- ✅ Open Source
- ❌ **Complexité** : Très difficile à apprendre
- ❌ **Bundle lourd** : ~2MB
- ❌ **Moins moderne** : Interface moins intuitive
- ❌ **3D complexe** : Support 3D mais difficile à configurer
- 📌 **Pourquoi rejetée** : Trop complexe pour nos besoins

### 3. Mapbox GL JS
- ✅ Excellente documentation
- ✅ Très performant
- ✅ Bon support 3D
- ❌ **Licence** : Payant à partir d'un certain niveau de trafic
- ❌ **Vendor lock-in** : Dépendance à Mapbox
- ❌ **Pas 100% open source** : Certains composants propriétaires
- 📌 **Pourquoi rejetée** : MapLibre offre les mêmes fonctionnalités en open source

### 4. Deck.gl (Uber)
- ✅ Excellent pour la visualisation de données
- ✅ Très performant
- ✅ Bon support 3D
- ❌ **Pas adapté pour les fonds de carte** : Nécessite une base de tuiles
- ❌ **Complexité** : Courbe d'apprentissage raide
- ❌ **Intégration** : Moins adapté à une carte complète
- 📌 **Pourquoi rejetée** : Complémentaire plutôt que substitut à MapLibre

### 5. Cesium
- ✅ Excellent pour la 3D globale
- ✅ Bon pour les visualisations terrestres
- ❌ **Trop lourd** : Bundle énorme
- ❌ **Complexité** : Très difficile à configurer
- ❌ **Surdimensionné** : Pour des cartes 2D avec un peu de 3D
- 📌 **Pourquoi rejetée** : Trop complexe et lourd pour nos besoins

## Notes supplémentaires

### Configuration de MapLibre

```typescript
// apps/web/src/islands/MapTerritoire.svelte
import { onMount } from 'svelte';
import { Map, NavigationControl, ScaleControl } from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';

let map: MapLibreMap | null = null;

onMount(() => {
  // Initialisation de la carte
  map = new Map({
    container: 'map-container',
    style: {
      version: 8,
      sources: {
        // Fond de carte WMTS IGN
        'ign-plan': {
          type: 'raster',
          tiles: [
            'https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&' +
            'LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&' +
            'TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image%2Fpng'
          ],
          tileSize: 256,
          attribution: '© IGN'
        },
        // Couches vectorielles (PMTiles)
        'pmtiles-relief': {
          type: 'vector',
          url: 'pmtiles:///data/relief.pmtiles'
        }
      },
      layers: [
        {
          id: 'ign-plan',
          type: 'raster',
          source: 'ign-plan',
          minzoom: 0,
          maxzoom: 20
        },
        {
          id: 'contour-commune',
          type: 'line',
          source: 'geojson',
          source-layer: 'contour',
          paint: {
            'line-color': '#ff0000',
            'line-width': 3
          }
        }
      ]
    },
    center: [3.5814, 44.1216],  // Mont Aigoual
    zoom: 12,
    pitch: 0,
    bearing: 0
  });

  // Ajout des contrôles
  map.addControl(new NavigationControl());
  map.addControl(new ScaleControl());

  // Chargement des données GeoJSON
  loadGeoJSONLayers(map);
});

onDestroy(() => {
  if (map) {
    map.remove();
  }
});
```

### PMTiles pour le relief

**Pourquoi PMTiles ?**
- Format moderne pour les tuiles vectorielles
- Compact (compression efficace)
- Support natif dans MapLibre via le protocole `pmtiles://`
- Permet de stocker le relief du Mont Aigoual localement

**Génération des PMTiles** :
```bash
# Utiliser tippecanoe ou pmtiles pour convertir les données
pmtiles create relief.pmtiles data.geojson
```

Pour le relief, cette conversion se fait en deux étapes, la première scriptée dans le dépôt :

1. `apps/map-service/scripts/generer-region-relief.ts` (`pnpm --filter map-service generer:relief -- --id <région> --sortie <dossier>`)
   interroge le WMS altimétrique RGE ALTI de l'IGN, tuile par tuile, et écrit une arborescence
   `z/x/y` de PNG terrarium sur la bbox de la région (voir `REGIONS_RELIEF` dans
   `packages/shared/src/carto.ts`, et `doc/microservice/map-service/README.md` pour la liste des
   régions déclarées). Cette étape est longue — plusieurs dizaines de milliers de requêtes pour une
   emprise de 100 km de rayon — et reste une tâche d'exploitation séparée du développement courant.
2. Conversion de chaque PNG en WebP sans perte (`cwebp -lossless`), puis empaquetage de
   l'arborescence avec la CLI `pmtiles` (`pmtiles convert <dossier> <région>.pmtiles`), comme pour
   `aigoual.pmtiles`. L'archive obtenue est déposée dans `apps/web/public/relief/`.

**Avantages pour le relief** :
- Stockage local dans le conteneur Docker
- Pas de dépendance externe pour le relief
- Meilleure performance que les appels API répétés
- Support du terrain 3D dans MapLibre

### Configuration du terrain 3D

```typescript
// Activation du terrain 3D
map.addSource('terrain', {
  type: 'raster-dem',
  url: 'pmtiles:///data/relief.pmtiles',
  encoding: 'terrarium'
});

map.setTerrain({ source: 'terrain', exaggeration: 1.5 });
```

### Gestion des couches GeoJSON

```typescript
// Chargement des couches depuis l'API
async function loadGeoJSONLayers(map: Map) {
  const response = await fetch('/api/couches/risques/geojson');
  const geojson = await response.json();

  map.addSource('risques', {
    type: 'geojson',
    data: geojson
  });

  map.addLayer({
    id: 'risques-fill',
    type: 'fill',
    source: 'risques',
    paint: {
      'fill-color': ['get', 'color'],
      'fill-opacity': 0.7
    }
  });

  // Gestion des clics
  map.on('click', 'risques-fill', (e) => {
    if (e.features && e.features.length > 0) {
      showPopup(e.features[0].properties);
    }
  });
}
```

### Fonds de carte disponibles (IGN)

| Layer | Description | URL Pattern |
|-------|-------------|-------------|
| PLANIGNV2 | Fond de plan standard | `GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2` |
| ORTHOPHOTOS | Photos aériennes | `ORTHOIMAGERY.ORTHOPHOTOS` |
| ELEVATION.SLOPES | Pentes | `ELEVATION.SLOPES` |
| CADASTRE | Cadastre | `CADASTRALPARCELS.PARCELS` |

**TILEMATRIXSET** : Toujours `PM` (EPSG:3857)

### Performances

**Optimisations mises en place** :
- Chargement paresseux des couches GeoJSON
- Simplification des géométries complexes
- Cache des tuiles dans le navigateur
- Limitation du nombre de couches actives

## Liens
- [MapLibre GL JS Documentation](https://maplibre.org/maplibre-gl-js-docs/API/)
- [PMTiles Specification](https://github.com/protomaps/PMTiles)
- [IGN WMTS Documentation](https://geoservices.ign.fr/)
- [MapLibre Demo](https://maplibre.org/maplibre-gl-js-docs/example/)
- [PMTiles Tools](https://github.com/protomaps/PMTiles)

---

## Historique
| Date | Auteur | Action |
|------|--------|--------|
| 2026-07-08 | Architecte | Décision initiale (MapLibre prévu dans la vision globale) |
| 2026-07-09 | Architecte | Ajout de PMTiles pour le relief dans la Brique 1 |
| 2026-07-10 | Agent | Documentation ADR |
