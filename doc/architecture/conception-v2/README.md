# Météo essentielle V2 — Documentation

## Références principales

- [Feuille de route](./ROADMAP.md)
- [Géolocalisation V1 — référence fonctionnelle](./GEOLOCALISATION-V1.md)
- [Audit de géolocalisation V1 / V2](./GEOLOCALISATION-AUDIT.md)
- [Audit de la couverture nationale des observations](./OBSERVATIONS-NATIONALES-AUDIT.md)
- [Plan d’implémentation des observations nationales](./OBSERVATIONS-NATIONALES-IMPLEMENTATION.md)
- [Observabilité et contrôles d’exploitation](./OBSERVABILITE.md)
- [Déploiement des observations nationales](./DEPLOIEMENT-OBSERVATIONS-NATIONALES.md)
- [Contrat OpenAPI de l’interface](./openapi.yaml)
- [Schéma public de provenance](./provenance.schema.json)

## Décisions actives

- la géolocalisation V1 est la référence fonctionnelle reproduite dans la V2 ;
- les observations doivent couvrir la France, au minimum pour Val-d’Aigoual, Paris et Marseille ;
- le repli vers le modèle reste obligatoire lorsqu’aucune station n’est représentative ;
- la V1 reste disponible jusqu’à validation de la parité fonctionnelle de la V2.

## État d’avancement

### Géolocalisation

Le premier lot a été intégré par la PR #12 :

- callbacks GPS obsolètes invalidés ;
- choix d’un lieu rapide prioritaire sur une localisation antérieure ;
- messages d’erreur différenciés ;
- dernière météo conservée pendant une relocalisation défaillante ;
- tests de concurrence et de timeout ajoutés.

### Observations nationales

Les lots structurants sont intégrés :

- PR #14 : présélection spatiale des stations depuis PostGIS ;
- PR #15 : ingestion quotidienne du catalogue national Météo-France ;
- PR #16 : ingestion horaire du paquet national d’observations ;
- PR #17 : diagnostic de couverture, fraîcheur et état des ingestions.

Le prochain jalon est le déploiement conjoint de l’API et du worker, suivi de l’exécution contrôlée de `meteo_stations` et `meteo_obs_national`, puis de la vérification automatisée de Paris, Marseille et Val-d’Aigoual.
