# POC bâtiments 3D — mairie de Valleraugue

Ce dossier initialise une preuve de concept autonome avant toute intégration au microservice cartographique OpenDataVal.

## Périmètre

- Centre : mairie de Val-d'Aigoual, bureau de Valleraugue.
- Adresse : 1 place Francis Cavalier-Bénézet, 30570 Val-d'Aigoual.
- Point de départ : longitude `3.641219`, latitude `44.081089`.
- Emprise de calcul : carré de `100 × 100 m`, soit `10 000 m²`.
- Bbox Lambert-93 : `751306 6331501 751406 6331601`.
- Tampon de reconstruction : `15 m` autour de l'étendue réelle des bâtiments.

Le point central est une référence de démarrage. L'alignement exact avec le bâtiment de la mairie doit être vérifié visuellement sur l'orthophotographie IGN avant l'extension du POC.

## Choix d'implémentation

Le POC encapsule le pipeline Docker officiel `ignfab/roofer-with-ignf-datasets`, épinglé au commit :

```text
0c4fb086586fac3b01a5974ff0b79937e51c9315
```

Ce pipeline :

1. télécharge les bâtiments `BDTOPO_V3:batiment` par WFS ;
2. calcule leur étendue réelle et ajoute le tampon ;
3. interroge les dalles `IGNF_NUAGES-DE-POINTS-LIDAR-HD:dalle` ;
4. extrait uniquement les points COPC nécessaires avec PDAL ;
5. remappe la classe IGN `67` vers la classe bâtiment ASPRS `6` ;
6. complète les attributs altimétriques ;
7. lance Roofer et produit du CityJSONSeq LoD2.2.

Aucun code du microservice cartographique n'est modifié à ce stade.

## Prérequis

- Linux ou macOS ;
- Docker fonctionnel ;
- Git ;
- Python 3 ;
- accès réseau à `data.geopf.fr`, aux fichiers COPC et à Docker Hub.

## Démarrage

```bash
cd poc/valleraugue-mairie-3d
cp config/poc.env.example config/poc.env
make check
make run
make validate
```

Le premier lancement clone le pipeline officiel dans `.work/`, télécharge les données nécessaires et écrit les résultats dans `output/run-*`.

Pour repartir d'une exécution nettoyée :

```bash
make run-clean
```

## Résultats attendus

Dans le dernier répertoire `output/run-*` :

- `buildings.gpkg` ;
- `building_bbox.json` ;
- `buffered_bbox.json` ;
- `lidar_tiles.gpkg` ;
- `pdal_pipeline.json` ;
- `lidar_subset.laz` ;
- `buildings_cleaned.gpkg` ;
- `roofer_output/` avec les fichiers CityJSONSeq ;
- `poc-validation.md` après `make validate`.

## Limites de cette première implantation

- La couverture LiDAR et la présence effective de la mairie dans la sortie ne sont pas encore validées par une exécution réelle.
- Aucun visualiseur web n'est ajouté dans ce lot initial.
- Aucun fichier 3D généré n'est versionné dans Git.
- La conversion vers GLB ou 3D Tiles sera décidée après validation du CityJSONSeq natif.

## Étape suivante

Exécuter le POC sur une machine Docker, contrôler la mairie dans `ninja.cityjson.org`, puis renseigner la grille `docs/acceptance-checklist.md` avant d'envisager l'intégration.
