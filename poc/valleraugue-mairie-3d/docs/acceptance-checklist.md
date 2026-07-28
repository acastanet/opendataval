# Grille d'acceptation du POC

## Données

- [ ] La mairie est incluse dans le carré de 100 × 100 m.
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

## Reproductibilité

- [ ] `make check` réussit sur une machine disposant de Docker.
- [ ] `make run` fonctionne depuis un dossier sans données générées.
- [ ] Le commit du pipeline amont est épinglé.
- [ ] `make validate` produit un rapport exploitable.
- [ ] Les données générées restent hors Git.

## Décision

- **GO** : reconstruction correcte et reproductible, sans correction manuelle essentielle.
- **GO LoD1 seulement** : données disponibles mais reconstruction LoD2 insuffisante.
- **NO-GO** : couverture, alignement ou reproductibilité insuffisants.
