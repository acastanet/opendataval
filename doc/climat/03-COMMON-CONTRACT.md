# Contrats communs de la fiche climat

Statut : **P4 réalisé — contrats en `draft` jusqu'aux golden masters P5**.

Ce document relie les méthodes scientifiques décrites dans `doc/climat/methods/` aux contrats techniques publiés dans `packages/climate-contracts/`.

## 1. Principe

Les quatre services scientifiques ne doivent pas exposer quatre API incompatibles.

Ils partagent la même chaîne :

```text
ClimateSnapshot
      ↓
méthode scientifique versionnée
      ↓
ClimateResult
      ↓
ClimateSignal[]
      ↓
├── renderer SVG / HTML
└── ClimateCommentary
      ↓
ClimateSheet
```

Le champ scientifique propre à chaque méthode reste dans `ClimateResult.data`.

Toutes les informations de confiance et d'interopérabilité restent dans l'enveloppe commune.

## 2. Source des schémas

Les schémas sont dans :

```text
packages/climate-contracts/schemas/
```

Contrats :

- `climate-snapshot.schema.json`
- `climate-result.schema.json`
- `climate-signal.schema.json`
- `climate-commentary.schema.json`
- `climate-sheet.schema.json`

Ils utilisent JSON Schema Draft 2020-12.

Les exemples associés sont dans :

```text
packages/climate-contracts/examples/
```

Ils sont des fixtures de contrat, pas des valeurs climatiques de référence.

## 3. ClimateSnapshot

`ClimateSnapshot` est produit par la couche d'acquisition, principalement `apps/copernicus`.

Il répond à :

> Quelles données exactes ont servi à cette fiche ?

Il conserve au minimum :

- `snapshot_id`
- localisation demandée
- actifs acquis
- dataset et variables
- période
- représentativité spatiale
- date et paramètres de récupération
- URI de stockage
- SHA-256
- qualité

Un snapshot utilisé par une fiche est considéré immuable.

Une nouvelle acquisition ou un nouvel actif produit un nouveau snapshot ou un nouvel identifiant d'actif ; on ne modifie pas silencieusement la provenance d'une fiche déjà produite.

## 4. ClimateResult

`ClimateResult` est la sortie scientifique canonique d'un service.

Enveloppe commune :

```text
schema_version
result_id
snapshot_id
product
method
location
periods
datasets
representativity
data
signals
quality
caveats
provenance
```

### `data`

`data` contient uniquement les résultats propres à la méthode.

Exemples :

```text
climate-overview
→ climatologie mensuelle température / précipitations

climate-fingerprint
→ lignes annuelles, classes, comparaisons

thermal-seasons
→ seuils T25/T75, transitions, durées, comparaisons

water-through-year
→ cycle mensuel pluie / ET / eau du sol / SPEI-3
```

La V1 du contrat commun ne cherche pas à imposer une structure unique à ces quatre payloads.

Des sous-schémas spécifiques par méthode pourront être ajoutés après P5 lorsque les golden masters auront figé les sorties exactes.

### Règle de rendu

Le renderer consomme `ClimateResult`.

Il ne peut pas recalculer ou corriger un indicateur scientifique.

Un SVG ne constitue pas une preuve scientifique pour le service IA.

## 5. ClimateSignal

`ClimateSignal` est l'interface scientifique entre un résultat et son interprétation.

Il distingue :

- `id` : identifiant de l'occurrence produite ;
- `definition_id` : type sémantique défini dans `doc/climat/signals/catalogue.yaml`.

Exemple :

```text
definition_id = thermal-summer-start-shift

id =
thermal-summer-start-shift:
POINT-44.0646-3.6830:
1996-2005_vs_2016-2025
```

Le signal contient :

- méthode/version
- métrique
- niveau de preuve
- valeur
- unité
- direction éventuelle
- comparaison éventuelle
- `evidence[]`
- caveats

### Evidence

Chaque signal possède au moins un :

```text
evidence.result_pointer
```

Il s'agit d'un JSON Pointer vers la donnée scientifique correspondante du `ClimateResult`.

Exemple :

```text
/data/comparison/summer_start_shift_days
```

Le futur validateur doit vérifier que ce pointeur se résout réellement.

## 6. ClimateCommentary

`ClimateCommentary` est une sortie structurée du microservice IA.

La forme importante est :

```text
summary

findings[]
  ├── text
  ├── signal_ids[]
  └── claim_level

caveats[]
abstentions[]
generation
validation
```

Un `finding` sans `signal_id` est invalide au niveau du contrat.

Cela ne suffit toutefois pas à prouver que le signal existe réellement : cette relation doit être contrôlée par le validateur applicatif.

### Interdiction d'escalade

Un commentaire ne peut pas transformer :

```text
descriptive
```

en :

```text
statistical_trend
```

ou :

```text
causal_attribution
```

sans signal du niveau correspondant.

Les méthodes P0–P4 actuelles n'émettent que `descriptive`.

## 7. ClimateSheet

`ClimateSheet` est le manifest d'assemblage du produit final.

Il référence obligatoirement les quatre emplacements :

```text
climate_overview
climate_fingerprint
thermal_seasons
water_through_year
```

Un bloc peut être :

```text
pending
ready
unavailable
error
```

Un bloc `ready` doit posséder un `result_ref` non vide.

La fiche peut donc être construite progressivement sans prétendre qu'une analyse manquante existe.

## 8. Deux niveaux de validation

### Niveau 1 — JSON Schema

Il valide la forme locale d'un document.

### Niveau 2 — validation applicative

Elle vérifie les relations entre documents.

Invariants P4 obligatoires :

1. méthode de `ClimateResult.provenance` identique à `ClimateResult.method` ;
2. `snapshot_id` de provenance identique à celui du résultat ;
3. méthode de chaque signal identique à celle du résultat ;
4. `definition_id` présent dans le catalogue P3 ;
5. unité, direction et claim level autorisés par cette définition ;
6. JSON Pointer de chaque preuve résolvable ;
7. `result_ids` du commentaire présents dans le contexte fourni ;
8. tous les `signal_ids` des findings résolvables ;
9. aucun finding n'élève le niveau de preuve ;
10. commentaire `valid` sans claim non supporté ;
11. résultats d'une fiche cohérents avec le snapshot attendu ;
12. ressources déclarées `ready` réellement disponibles.

## 9. Versionnement

Deux versionnements indépendants sont maintenus.

### Contrat

```text
schema_version: 1.0
```

Il concerne la structure d'échange.

### Science

```text
method:
  id: thermal-seasons
  version: 1.0.0
```

Il concerne la méthode scientifique.

Une nouvelle formule exige une version de méthode.

Un changement de sérialisation peut exiger une version de contrat sans modifier la science.

## 10. Ce que P4 ne fait pas

P4 ne :

- migre aucun POC ;
- ne modifie aucun calcul ;
- ne choisit pas encore l'implémentation des microservices ;
- ne valide pas encore les sorties réelles des POC ;
- ne transforme pas les exemples P4 en golden masters.

Ces points appartiennent à P5 puis P6+.

## 11. Critère de fin P4

P4 est terminé lorsque :

- les cinq schémas existent ;
- un exemple valide existe pour chacun ;
- les schémas sont valides Draft 2020-12 ;
- les exemples passent la validation structurelle ;
- les invariants inter-documents sont explicitement documentés ;
- P5 peut commencer sans redéfinir les contrats fondamentaux.
