# 02 — Contrat de dalle

## Géométrie canonique

Une dalle MVP mesure exactement :

```text
200 m × 200 m
40 000 m²
4 hectares
```

Cette taille correspond à l'emprise minimale calibrée du pipeline 3D existant
(`poc/valleraugue-mairie-3d`) : aucune scène de référence n'y descend sous 200 m,
et sa calibration (marge de terrain, résolution d'orthophotographie, segmentation
des houppiers, dalles LiDAR HD) est réglée pour l'intervalle 200–2000 m. Voir
ADR-004 dans [`09-DECISIONS.md`](09-DECISIONS.md), qui remplace l'ADR-001.

La coordonnée d’entrée est le **centre** de la dalle.

## Projection de calcul

Pour la France métropolitaine :

```text
EPSG:2154 — Lambert-93
```

Procédure :

1. recevoir latitude/longitude WGS84 ;
2. projeter le centre en EPSG:2154 ;
3. appliquer `±100 m` sur X et Y ;
4. produire le polygone carré ;
5. conserver également sa version WGS84, obtenue par projection inverse du
   polygone Lambert-93 — jamais par une approximation en degrés.

Le carré métier est défini en coordonnées projetées, pas par une approximation en degrés.

## Identité

Une instance possède au minimum :

```text
tile_id
center
bbox_projected
geometry_projected
geometry_wgs84
width_m
height_m
area_m2
created_at
pipeline_version
```

## Identifiant

Format recommandé pour le MVP :

```text
ODV-YYYY-NNNNNN
```

L’identifiant public n’a pas besoin d’encoder les coordonnées.

## Déterminisme géométrique

Deux créations à partir des mêmes coordonnées doivent produire la même géométrie de dalle.

La politique de duplication d’instance est un sujet différent : le système peut décider de réutiliser ou de recréer une instance, mais la géométrie doit rester identique.

## Cycle de vie minimal

```text
created
collecting
generated
review_required
approved
published
failed
```

Une transition doit être explicite et journalisable.

Ce `status` décrit uniquement l'état de **fabrication** de la dalle. La décision
**humaine** de revue est un champ séparé, `review.status`, décrit dans
[`03-DATA-CONTRACT.md`](03-DATA-CONTRACT.md) et détaillé dans
[`06-TEST-AND-ACCEPTANCE.md`](06-TEST-AND-ACCEPTANCE.md). Une correction demandée
par l'opérateur (`review.status = changes_requested`) fait revenir `status` à
`collecting` : c'est la seule transition de retour autorisée.

## Invariants

- `width_m = 200`
- `height_m = 200`
- `area_m2 ≈ 40000` selon tolérance géométrique définie par les tests
- centre contenu dans le polygone
- manifeste toujours lié à un `tile_id`
- une instance publiée doit avoir été approuvée
