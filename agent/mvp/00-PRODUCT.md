# 00 — Contrat produit MVP

## Définition

Une dalle OpenDataVdA est un **jumeau numérique supervisé d’un carré de 200 × 200 m centré sur des coordonnées GPS**.

Elle représente physiquement le lieu et rassemble les informations publiques pertinentes nécessaires à sa compréhension, y compris lorsque celles-ci proviennent de son voisinage ou d’un contexte territorial plus large.

Une dalle est une **instance persistante**. Elle n’est pas recalculée intégralement à chaque consultation.

## Entrée minimale

```text
latitude
longitude
titre facultatif
```

## Sorties attendues à terme du MVP

- URL du jumeau ;
- scène 3D ;
- dossier d’information ;
- provenance ;
- rapport ;
- données exportables.

## Trois échelles spatiales

### 1. Local — la dalle

Emprise exacte : 200 × 200 m.

Exemples : terrain, bâtiment, végétation, eau, parcelle, routes, géologie intersectante, OLD.

### 2. Proximité

Information pertinente absente de la dalle et recherchée dans un rayon adapté.

Exemples : BSS, station hydrologique, station météo, ONDE, ADES.

La distance doit être conservée.

### 3. Contexte

Information dont l’échelle naturelle est plus large.

Exemples : vigilance, feu, bassin versant, INSEE communal, Copernicus, risques réglementaires.

Ces trois échelles ne forment **pas** un second regroupement dans le manifeste,
à côté des six sphères ci-dessous : une donnée locale, de proximité ou de
contexte appartient toujours à une seule sphère, et son échelle spatiale se lit
dans `spatial_relation` et `distance_m` (voir
[`03-DATA-CONTRACT.md`](03-DATA-CONTRACT.md)). Une station météo à 800 m est de
l'atmosphère en relation `nearest`, pas une entrée dupliquée dans un seau
« proximité ».

## Six dimensions de restitution

- Atmosphère
- Hydrosphère
- Biosphère
- Anthroposphère
- Lithosphère
- Risques

Ces dimensions organisent l’information côté produit. Elles ne doivent pas imposer une refonte artificielle des microservices existants.

## Supervision humaine

La fabrication peut proposer automatiquement des sélections et interprétations.

Avant publication, un humain doit pouvoir :

- vérifier ;
- remplacer une sélection ;
- justifier une correction ;
- valider ;
- publier.

Le système doit conserver la sélection automatique et la sélection humaine.

## Hors MVP

Ne pas lancer sans décision explicite :

- paiement ;
- comptes clients complexes ;
- marketplace ;
- génération publique totalement autonome ;
- BIM complet ;
- éditeur 3D ;
- simulations physiques ;
- inventaire exhaustif de toutes les données IGN ;
- inventaire exhaustif de toutes les données BRGM ;
- toutes les API eau ;
- biodiversité exhaustive ;
- produit mairie ;
- qualité de l’air avancée ;
- prévision incendie avancée.

## Principe directeur

**Finir une chaîne verticale utilisable avant d’élargir la couverture des données.**
