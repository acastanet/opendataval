# ADR 008 — `map-service` comme serveur de représentation cartographique

- Statut : accepté
- Date : 2026-07-25

## Contexte

Le rendu cartographique d’OpenDataVal reposait sur plusieurs configurations MapLibre dupliquées, un moteur Leaflet distinct dans certaines démonstrations, des appels navigateur directs aux fournisseurs de tuiles et la lecture cliente de deux archives PMTiles volumineuses.

Le premier cadrage du chantier prévoyait également de déplacer dans `map-service` les données GeoJSON du monolithe. Cette option aurait fait du service un agrégateur géospatial transversal et aurait mélangé représentation, recherche et domaines métier.

## Décision

`apps/map-service` est un **serveur de représentation cartographique**.

Il est responsable de :

- la production des styles MapLibre ;
- la diffusion et le cache des tuiles IGN et BRGM ;
- le proxy raster du radar RainViewer ;
- la lecture serveur des archives PMTiles de relief ;
- les glyphes et les actifs MapLibre nécessaires aux clients non bundlés ;
- les légendes et constantes exclusivement visuelles ;
- les métriques techniques de diffusion.

Il ne lit aucune base de données et ne contient aucune règle métier météo, incendie, hydrologie ou territoire.

Les routes `/api/couches`, `/api/territoire`, `/api/incendies/*` et `/api/recherche` restent dans `apps/api` pour ce lot. Leur redistribution devra être réalisée **par domaine métier**, avant le 31 décembre 2026. La création d’un `features-service` générique n’est pas retenue.

## Routage

Caddy route directement `/api/v2/map/*` vers `map-service`. Cette exception à la règle « les API v2 passent par le gateway » est motivée par la nature binaire et volumineuse des réponses. Le gateway ne doit pas bufferiser les tuiles ; il conserve uniquement la supervision du service lorsqu’un catalogue de services est disponible.

## Choix complémentaires

- MapLibre reste l’unique moteur cartographique cible.
- Les tuiles OSM publiques ne sont pas reproxifiées ; le Plan IGN assure le fond plan territorial.
- Les archives PMTiles restent montées en lecture seule mais sont lues côté serveur.
- Une tuile HD absente renvoie 404 ; les octets d’une tuile parente ne sont jamais renvoyés sous une coordonnée enfant.
- Les couleurs et représentations vivent dans `packages/shared/src/carto.ts`.
- Les actifs MapLibre et le glyphe Noto Sans sont générés pendant le build de l’image, puis servis localement sans dépendance d’exécution à un CDN.
- La bibliothèque cliente historique `apps/web/src/lib/carte.ts` conserve provisoirement son API afin de migrer les îlots sans régression massive. Ses sources sont remplacées par les routes du service.

## Conséquences

### Positives

- CSP limité à l’origine OpenDataVal pour les ressources cartographiques ;
- suppression de PMTiles du bundle navigateur ;
- cache, délais et erreurs centralisés ;
- styles et légendes partageables ;
- service sans secret ni dépendance PostgreSQL ;
- correction du repli DEM géométriquement incorrect.

### Négatives

- `map-service` devient un point de passage commun aux cartes ;
- le proxy IGN concentre le trafic sur l’adresse du serveur ;
- les données géographiques historiques restent temporairement dans le monolithe ;
- la migration complète des styles inline vers les quatre styles nommés reste progressive.

## Exploitation et retour arrière

Le service expose `/health`, `/ready` et `/internal/v1/map/metrics`. L’absence des archives de relief ou des actifs statiques produit un état `degraded`, sans empêcher le démarrage.

Le retour arrière consiste à restaurer conjointement l’ancienne image Caddy, l’ancien bundle web et la version précédente de l’API météo. Les routes historiques de données restent disponibles pendant tout le lot.
