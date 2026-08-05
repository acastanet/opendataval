# ADR 009 — Valhalla et enrichissement post-traitement pour l’itinéraire poids lourd

Date : 2026-08-04 · Statut : accepté

## Décision

Le POC d’itinéraire poids lourd utilise Valhalla avec le costing `truck` et l’extrait OSM Languedoc-Roussillon. Valhalla reste un service interne : seul `itineraire-service` l’appelle.

Le tracé est calculé sur OSM, puis audité en post-traitement. Après le calcul camion, `trace_attributes` fournit les `way_id` OSM empruntés ; ces identifiants sont joints à l’index local des restrictions OSM. Un second calcul `auto` sert de référence pour identifier les restrictions incompatibles contournées.

## Raisons

- Valhalla interprète directement les tags `maxheight`, `maxweight`, `maxwidth`, `maxlength`, `maxaxleload`, `hgv` et `hazmat` du costing camion.
- BD TOPO et DiaLog ne peuvent pas être injectés directement dans un `.osm.pbf`. Cela nécessiterait une conflation géométrique, une réécriture du graphe et un nouveau build de tuiles.
- La jointure par `way_id` est instantanée, exacte et auditable. Elle laisse une place nette à BD TOPO et aux arrêtés dans les lots ultérieurs.

## Conséquences

Le lot 1 ne prétend pas connaître la praticabilité de tout le réseau. La confiance est calculée uniquement à partir de la part du linéaire portant une restriction OSM explicite : `élevée` à partir de 80 %, `moyenne` à partir de 40 %, sinon `faible`. L’absence de restriction est rendue comme inconnue, jamais comme compatible.

Le premier build Valhalla télécharge et prépare un volume persistant conséquent. Avant un déploiement de production, mesurer sa durée, son pic mémoire et la taille de `valhalla_tiles`.
