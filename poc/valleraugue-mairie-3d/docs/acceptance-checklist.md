# Grille d'acceptation du POC

## Données

- [ ] La mairie est incluse dans le carré configuré (200 × 200 m par défaut).
- [ ] Les bâtiments BD TOPO sont récupérés sans erreur.
- [ ] Au moins une dalle LiDAR HD intersecte la zone tamponnée.
- [ ] Le nuage extrait contient des points de sol et de bâtiment.
- [ ] L'orthophotographie confirme l'alignement général des emprises.

## Reconstruction

- [ ] Roofer produit au moins un bâtiment LoD2.2.
- [ ] La mairie est identifiable dans la sortie.
- [ ] Le faîtage principal est orienté correctement.
- [ ] Aucun bâtiment majeur ne flotte ou ne s'enfonce visiblement.
- [ ] Aucun artefact géométrique bloquant n'est observé.

## Terrain et orthophotographie

- [ ] `terrain.tif` contient un relief continu sur l'emprise.
- [ ] Les bâtiments reposent sur le terrain sans flottement majeur.
- [ ] `orthophoto.jpg` couvre exactement la bbox Lambert-93.
- [ ] L'orthophotographie est correctement orientée sur le terrain.

## Diffusion web

- [ ] `render/scene.glb` s'ouvre sans erreur.
- [ ] Les murs et les toitures utilisent des matériaux distincts.
- [ ] Le terrain et les bâtiments peuvent être masqués séparément.
- [ ] Le visualiseur fonctionne via `python poc.py serve`.
- [ ] Le visualiseur reste utilisable sur un écran mobile.

## Reproductibilité

- [ ] `python poc.py check` réussit avec Python Windows, sans Docker ni WSL.
- [ ] `python poc.py all` fonctionne à partir d’un `lidar_subset.laz` et d’une
  sortie CityJSONSeq Roofer existants.
- [ ] Les entrées amont utilisées sont identifiées dans le rapport de validation.
- [ ] `python poc.py validate` produit un rapport exploitable.
- [ ] `python -m unittest discover -s test -v` réussit.
- [ ] Les données générées restent hors Git.

## Décision

- **GO** : reconstruction correcte et reproductible, sans correction manuelle essentielle.
- **GO LoD1 seulement** : données disponibles mais reconstruction LoD2 insuffisante.
- **NO-GO** : couverture, alignement ou reproductibilité insuffisants.
