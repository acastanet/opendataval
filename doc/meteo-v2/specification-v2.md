# Météo essentielle V2 — spécification de travail

## 1. Objectif

La V2 doit permettre une lecture locale immédiate de la météo, même lorsque les
données sont complexes. Elle sépare entièrement l’interface des collectes, des
calculs et de la base de données afin que le design puisse évoluer et être testé
sans relancer l’ensemble de la plateforme.

Le premier écran mobile répond dans cet ordre à quatre questions :

1. où la météo est-elle estimée ?
2. que se passe-t-il maintenant ?
3. quel est le prochain changement utile ?
4. existe-t-il un danger officiel ?

Les comparaisons de révisions, le bilan thermique Copernicus et les explications
méthodologiques restent accessibles dans un second niveau intitulé « Analyse ».

## 2. Architecture retenue

- `apps/worker` conserve la collecte des sources ;
- `apps/copernicus` conserve les calculs ERA5-Land et ERA5-HEAT ;
- PostgreSQL/PostGIS conserve l’historique et les agrégats ;
- Fastify expose une API versionnée `/api/v1/meteo` ;
- `apps/meteo-web` est une application React, Vite et TypeScript autonome ;
- OpenAPI constitue le seul contrat partagé entre l’API et l’interface ;
- MSW fournit les scénarios visuels sans backend.

L’interface ne doit importer aucun module de `apps/api`, `apps/worker`,
`apps/copernicus` ou `packages/shared`.

## 3. Premier incrément

Le premier incrément est publié sous `/meteo-v2/` sans modifier les routes météo
actuelles. Il comprend :

- le choix des trois lieux rapides ;
- la géolocalisation du navigateur et sa précision ;
- la température et sa nature — mesure ou estimation ;
- le minimum et le maximum du jour ;
- le prochain changement notable ;
- la vigilance officielle ;
- les prochaines heures ;
- les états de chargement, d’erreur et de données partielles.

## 4. Règles d’interface

- mobile d’abord, sans dépendre d’un survol ;
- pas de pictogrammes météorologiques ambigus : les conditions sont écrites ;
- température lisible sans masquer le lieu, la source ou la qualité de la donnée ;
- vigilance verte compacte, vigilance jaune à rouge nettement visible ;
- boutons tactiles d’au moins 44 px ;
- animations supprimées si `prefers-reduced-motion` est actif ;
- couleurs jamais utilisées comme unique moyen de transmettre une information.

## 5. Migration

1. Valider le premier écran sur données simulées.
2. Implémenter les adaptateurs Fastify conformes à OpenAPI.
3. Tester l’API avec les scénarios normal, partiel et indisponible.
4. Connecter la V2 à l’API réelle sous `/meteo-v2/`.
5. Migrer ensuite comparaison, bilan thermique et informations.
6. Basculer les anciennes URL uniquement après validation mobile, accessibilité et
   comparaison fonctionnelle avec la production.
