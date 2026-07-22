# Audit — Couverture nationale des observations météo

## Décision produit

Les observations doivent couvrir la France métropolitaine, au minimum pour les trois lieux rapides de l’interface :

- Val-d’Aigoual ;
- Paris ;
- Marseille.

Le modèle reste le repli normal lorsqu’aucune station récente et représentative n’est admissible.

## Cause racine confirmée

La couverture actuelle n’est pas nationale.

Le catalogue utilisé par l’API est la constante `STATIONS_METEO` définie dans :

```text
packages/shared/src/stationsMeteo.ts
```

Ce fichier décrit explicitement un réseau autour de Val-d’Aigoual, figé manuellement. Il contient des stations du Gard, de la Lozère et de l’Hérault ainsi que quelques stations Infoclimat locales.

La sélection de station charge uniquement les observations dont l’identifiant appartient à cette liste :

```sql
where num_poste = any($1::text[])
```

La valeur de `$1` provient directement des identifiants de `STATIONS_METEO`.

Conséquence :

- Paris ne peut examiner aucune station francilienne ;
- Marseille ne peut examiner aucune station des Bouches-du-Rhône ;
- la station la plus proche affichée est seulement la moins éloignée du petit catalogue cévenol ;
- le nombre de mesures reçues est borné par ce catalogue local.

## Chaîne actuelle

```text
STATIONS_METEO, liste locale statique
→ worker meteo_obs / meteo_radome / meteo_infoclimat
→ table series.meteo_horaire
→ loadLatestStationMeasurements
→ évaluation de toutes les mesures du catalogue local
→ observation sélectionnée ou repli modèle
```

## Fraîcheur

Les tâches sont correctement planifiées dans le code :

- `meteo_radome` toutes les six minutes ;
- `meteo_infoclimat` chaque heure à H+10 ;
- `meteo_obs` chaque heure à H+20.

Le contrôle de production a néanmoins trouvé toutes les observations trop anciennes. Le statut `running` du worker ne suffit donc pas à établir que les tâches réussissent.

Les journaux d’ingestion sont déjà enregistrés par `logFetchStart` et `logFetchEnd`. Le diagnostic d’exploitation doit vérifier, pour chaque tâche :

- la dernière tentative ;
- le dernier succès ;
- le nombre de lignes insérées ;
- le dernier avertissement ou message d’erreur ;
- la présence effective des jetons Météo-France et Infoclimat.

## Architecture cible

Le catalogue des stations ne doit plus être une constante locale utilisée comme source exhaustive.

```text
catalogue national de stations
→ stockage normalisé en base
→ recherche spatiale autour du point demandé
→ observations récentes des stations proches
→ critères de distance, altitude, fraîcheur et score
→ meilleure observation admissible
→ repli modèle si aucune station n’est représentative
```

## Séparation des responsabilités

### Catalogue

Données relativement stables :

```text
station_id
nom
latitude
longitude
altitude_m
réseau
pack
licence
active
updated_at
```

### Observations

Données renouvelées :

```text
station_id
observed_at
temperature_c
retrieved_at
qualité
```

### Sélection

La sélection ne doit charger que les stations dans un périmètre spatial raisonnable avant d’évaluer les critères détaillés.

## Stratégie de mise en œuvre

### Lot 1 — Catalogue national Météo-France

1. ajouter une ingestion périodique du catalogue national officiel ;
2. normaliser les identifiants, coordonnées, altitude et type de pack ;
3. stocker les stations en base ;
4. conserver les métadonnées de licence et de provenance ;
5. ajouter des tests pour Paris, Marseille et Val-d’Aigoual.

### Lot 2 — Recherche spatiale

1. sélectionner en base les stations situées autour du point demandé ;
2. associer leur dernière observation ;
3. ne plus charger toutes les stations nationales à chaque requête ;
4. conserver le diagnostic de rejet pour les candidats examinés.

### Lot 3 — Ingestion des observations

Une interrogation individuelle de toutes les stations françaises toutes les six minutes ne serait pas acceptable sans validation des quotas et du coût fournisseur.

La stratégie doit privilégier :

- les flux ou lots nationaux lorsqu’ils sont disponibles ;
- à défaut, un sous-ensemble dynamique de stations utiles ;
- une fréquence adaptée au pack ;
- une reprise après erreur et des limites de concurrence explicites.

### Lot 4 — Observabilité

Exposer au minimum :

```text
catalogueStationCount
receivedMeasurementCount
freshMeasurementCount
lastFetchAttemptAt
lastFetchSuccessAt
latestObservationAt
providerStatus
cacheAgeMinutes
```

## Critères d’acceptation

### Paris

- des stations franciliennes sont candidates ;
- aucune station cévenole n’est présentée comme candidat principal ;
- une observation récente est sélectionnable lorsqu’elle respecte les critères.

### Marseille

- des stations des Bouches-du-Rhône ou immédiatement voisines sont candidates ;
- Générargues n’est plus le candidat principal ;
- la vigilance reste rattachée au département 13.

### Val-d’Aigoual

- les stations du massif et des vallées restent disponibles ;
- Mont Aigoual peut être rejetée pour Valleraugue en raison de l’altitude ;
- une station de vallée récente peut être sélectionnée.

## Non-objectifs

- ne pas augmenter le seuil maximal d’ancienneté pour masquer une ingestion défaillante ;
- ne pas sélectionner automatiquement la station géographiquement la plus proche sans considérer l’altitude et la fraîcheur ;
- ne pas maintenir durablement deux catalogues concurrents ;
- ne pas coder uniquement trois exceptions pour les lieux rapides.

## Étape suivante

Créer le catalogue national persistant et une requête spatiale testable, puis adapter progressivement l’ingestion des observations sans modifier le contrat public tant que le comportement reste compatible.
