# Météo essentielle V2 — Documentation

## Références principales

- [Feuille de route](./ROADMAP.md)
- [Géolocalisation V1 — référence fonctionnelle](./GEOLOCALISATION-V1.md)
- [Audit de géolocalisation V1 / V2](./GEOLOCALISATION-AUDIT.md)
- [Audit de couverture nationale des observations](./OBSERVATIONS-NATIONALES-AUDIT.md)
- [Contrat OpenAPI](./openapi.yaml)
- [Schéma public de provenance](./provenance.schema.json)

## Décisions actives

- la géolocalisation V1 reste la référence fonctionnelle ;
- l’orchestration GPS V2 a été consolidée par la PR nº 12 ;
- les observations doivent couvrir la France, au minimum pour Val-d’Aigoual, Paris et Marseille ;
- le repli vers le modèle reste obligatoire lorsqu’aucune station n’est représentative ;
- la V1 reste disponible jusqu’à validation de la parité fonctionnelle complète de la V2.

## Diagnostic actuel

Le catalogue utilisé par l’API est une liste manuelle de 21 stations cévenoles. Cette limite explique les candidats incohérents observés pour Paris et Marseille.

Le worker prévoit des exécutions régulières, mais la fraîcheur réelle doit être contrôlée séparément par les journaux d’ingestion et `meta.fetch_log`.

## Prochaine étape

Implémenter le **Lot 2A — Catalogue national** décrit dans [l’audit des observations nationales](./OBSERVATIONS-NATIONALES-AUDIT.md) :

- télécharger la liste officielle des stations Météo-France actives ;
- parser et tester le catalogue ;
- conserver les identifiants à huit chiffres ;
- enregistrer les stations dans `couches.objets` ;
- documenter le nombre de stations importées et rejetées.
