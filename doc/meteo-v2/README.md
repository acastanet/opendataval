# Météo essentielle V2 — Documentation

## Références principales

- [Feuille de route](./ROADMAP.md)
- [Géolocalisation V1 — référence fonctionnelle](./GEOLOCALISATION-V1.md)
- [Audit de géolocalisation V1 / V2](./GEOLOCALISATION-AUDIT.md)
- [Contrat OpenAPI](./openapi.yaml)
- [Schéma public de provenance](./provenance.schema.json)

## Décisions actives

- la géolocalisation V1 est la référence à reproduire dans la V2 ;
- les observations doivent couvrir la France, au minimum pour Val-d’Aigoual, Paris et Marseille ;
- le repli vers le modèle reste obligatoire lorsqu’aucune station n’est représentative ;
- la V1 reste disponible jusqu’à validation de la parité fonctionnelle de la V2.

## Prochaine étape

Implémenter le lot d’orchestration client décrit dans [l’audit de géolocalisation](./GEOLOCALISATION-AUDIT.md) :

- invalider les callbacks GPS obsolètes ;
- conserver la dernière météo pendant une relocalisation ;
- terminer proprement une localisation lors du choix d’un lieu rapide ;
- distinguer refus, timeout et échec indéterminé ;
- ajouter les tests de concurrence et de maintien de l’affichage.
