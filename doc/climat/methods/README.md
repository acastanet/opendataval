# Registre des méthodes climatiques

Ce répertoire contient les méthodes scientifiques et techniques canoniques de la future fiche climat OpenDataVal.

## Statut P2

| Méthode | Version | Statut | POC source | Question |
|---|---:|---|---|---|
| `climate-overview` | 1.0.0 | `draft` | `poc/climat/general/` | À quoi ressemble normalement une année climatique dans cette zone ? |
| `climate-fingerprint` | 4.0.0 | `draft` | `poc/climat/empreinte-climatique/` | Qu'est-ce qui a changé au cours des trente dernières années ? |
| `thermal-seasons` | 1.0.0 | `draft` | `poc/climat/saisons/` | Comment les régimes thermiques de l'année se sont-ils déplacés ? |
| `water-through-year` | 1.0.0 | `draft` | `poc/climat/bilan eau/` | Comment le cycle hydroclimatique se répartit-il et a-t-il évolué ? |

Aucune méthode n'est encore `validated`. Le passage à ce statut nécessitera au minimum P3, P4 et P5.

## Structure d'une méthode P2

Chaque version contient :

```text
method.yaml   contrat méthodologique lisible par machine
science.md    question, fondements, portée et limites
technical.md  algorithme et décisions d'implémentation
CHANGELOG.md  décisions de version et points restant à valider
```

`interpretation.md` sera ajouté en **P3** afin de ne pas mélanger extraction de la méthode et règles de commentaire IA.

## Décisions importantes issues de P2

### Climate overview

- noyau V1 : température, précipitations, climatologie mensuelle et représentativité spatiale ;
- aucune descente d'échelle automatique ;
- les jours de gel, jours ≥30 °C et nuits ≥20 °C du POC ne sont pas canoniques tant qu'ils sont approximés à partir de températures moyennes quotidiennes.

### Climate fingerprint

- le vent V4 utilise canoniquement ERA5-Land `u10/v10` ;
- la ligne pluies intenses compte les jours dépassant le P95 des jours humides de référence et ne doit pas être appelée R95p/R95pTOT ;
- la normalisation robuste qui pilote la couleur est une convention éditoriale OpenDataVal, pas un indice scientifique universel.

### Thermal seasons

- saisons thermiques locales T25/T75, pas saisons météorologiques fixes ;
- règles de complétude, calendrier sans 29 février, lissage degré 3 et franchissements sont figés ;
- les comparaisons entre décennies restent descriptives sans test de tendance.

### Water through year

- la conversion des accumulations ERA5-Land `monthly_averaged_reanalysis` est confirmée par la documentation ECMWF ;
- `total_evaporation` est inversé pour afficher positivement l'évapotranspiration sortante ;
- le stock 0–100 cm est un indicateur dérivé du modèle, jamais une réserve utile ou une mesure de nappe.

## Règle de dépendance

Le code futur devra référencer :

```text
method.id
method.version
```

Une fiche climat publiée devra donc rester reproductible même lorsqu'une nouvelle version de méthode est introduite.

## Étapes suivantes

### P3 — interprétation

Ajouter pour chaque méthode :

```text
interpretation.md
```

avec les signaux, formulations autorisées, formulations interdites, conditions de non-interprétation et caveats obligatoires.

### P4 — contrats

Créer les schémas communs :

```text
ClimateSnapshot
ClimateResult
ClimateSignal
ClimateCommentary
ClimateSheet
```

### P5 — équivalence

Transformer les sorties POC existantes en golden masters et démontrer que les futurs services reproduisent les mêmes résultats dans les tolérances documentées.
