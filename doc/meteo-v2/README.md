# Météo essentielle V2 — Documentation

## Références principales

- [Feuille de route](./ROADMAP.md)
- [Géolocalisation V1 — référence fonctionnelle](./GEOLOCALISATION-V1.md)
- [Audit de géolocalisation V1 / V2](./GEOLOCALISATION-AUDIT.md)
- [Audit de la couverture nationale des observations](./OBSERVATIONS-NATIONALES-AUDIT.md)
- [Contrat OpenAPI](./openapi.yaml)
- [Schéma public de provenance](./provenance.schema.json)

## Décisions actives

- la géolocalisation V1 est la référence à reproduire dans la V2 ;
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

### Observations

La cause racine de la couverture insuffisante est confirmée : l’API et le worker utilisent encore un catalogue local statique centré sur les Cévennes. La prochaine étape est la création d’un catalogue national persistant, suivie d’une recherche spatiale et d’une ingestion adaptée aux quotas du fournisseur.
