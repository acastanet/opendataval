# Plan d’implémentation — Observations nationales

## Objectif du premier lot technique

Créer une base de catalogue national persistante et une fonction de recherche spatiale indépendante de l’ingestion des observations.

Ce lot ne modifie pas encore le contrat public de Météo V2. Il prépare la substitution progressive du catalogue statique local.

## Périmètre

1. ajouter une table dédiée aux stations météo ou formaliser leur stockage dans la couche objet existante ;
2. stocker identifiant, nom, coordonnées, altitude, réseau, pack, licence, statut et date de mise à jour ;
3. ajouter une lecture des stations proches d’un point ;
4. tester explicitement Paris, Marseille et Val-d’Aigoual ;
5. conserver temporairement `STATIONS_METEO` comme repli de compatibilité ;
6. ne pas déclencher encore d’appels nationaux fréquents à DPObs.

## Choix recommandé

Le projet dispose déjà d’une couche objet `station_meteo`, alimentée par `upsertStationsObjets`. Le premier lot doit réutiliser cette structure plutôt que créer un second stockage concurrent, à condition que la table permette :

- une géométrie `Point` indexée ;
- une recherche par distance ;
- la lecture des propriétés de station ;
- une mise à jour atomique du catalogue.

Si ces garanties ne sont pas présentes, une migration dédiée devra être proposée avant l’implémentation.

## Interface interne cible

```ts
interface StationCatalogueRepository {
  upsert(stations: readonly StationMeteo[]): Promise<number>;
  nearest(target: { latitude: number; longitude: number }, radiusKm: number): Promise<StationMeteo[]>;
}
```

## Tests obligatoires

- une station parisienne est trouvée autour de Paris ;
- une station marseillaise est trouvée autour de Marseille ;
- les stations cévenoles restent trouvées autour de Val-d’Aigoual ;
- aucune station hors rayon n’est retournée ;
- l’ordre est déterministe par distance puis identifiant ;
- les coordonnées invalides sont refusées ;
- la recherche fonctionne avec la Corse et les départements ultramarins si le catalogue les contient.

## Étape suivante

Après validation du dépôt national et de la recherche spatiale :

1. sélectionner les stations proches avant de charger les observations ;
2. définir une stratégie d’ingestion compatible avec les quotas ;
3. ajouter l’observabilité des tâches ;
4. basculer l’API vers le catalogue persistant ;
5. retirer le catalogue local comme source exhaustive.
