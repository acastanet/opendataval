# Référentiel climat OpenDataVal

Statut : **P0 + P1 + P2 + P3 + P4 réalisés ; méthodes en `draft` jusqu'à P5**.

Ce répertoire est la documentation canonique du domaine climat d'OpenDataVal. Il décrit la production d'une **fiche climat d'un lieu** à partir de données traçables, de méthodes scientifiques versionnées, de contrats communs, de rendus reproductibles et de commentaires IA contrôlés.

`poc/climat/` reste le corpus de référence pendant la migration. Les POC ne sont pas supprimés avant les golden masters et tests d'équivalence de P5.

## Les quatre analyses

1. **Le climat de la zone** — À quoi ressemble normalement une année climatique dans cette zone ?
2. **L'empreinte climatique du lieu** — Qu'est-ce qui a changé au cours des trente dernières années ?
3. **Les saisons se déplacent** — Comment le calendrier thermique s'est-il déplacé ?
4. **L'eau au fil de l'année** — Comment le cycle hydroclimatique se répartit-il et a-t-il évolué ?

## Chaîne de confiance

```text
source scientifique / dataset
        ↓
ClimateSnapshot
        ↓
méthode OpenDataVal versionnée
        ↓
calcul déterministe
        ↓
ClimateResult
        ↓
ClimateSignal[]
        ↓
├── SVG / HTML
└── ClimateCommentary
        ↓
ClimateSheet
```

Ni le renderer ni le modèle de langage ne recalculent silencieusement un indicateur scientifique.

## Documentation canonique

- [`01-ARCHITECTURE.md`](01-ARCHITECTURE.md) — composants et chaîne de production ;
- [`02-DATA-SOURCES.md`](02-DATA-SOURCES.md) — sources, variables et décisions P1/P2 ;
- [`03-COMMON-CONTRACT.md`](03-COMMON-CONTRACT.md) — contrats P4 et invariants inter-documents ;
- [`04-SCIENTIFIC-GOVERNANCE.md`](04-SCIENTIFIC-GOVERNANCE.md) — versionnement, preuve, qualité et autorité documentaire ;
- [`06-AI-INTERPRETATION.md`](06-AI-INTERPRETATION.md) — règles communes du futur service IA ;
- [`sources/datasets.yaml`](sources/datasets.yaml) — registre machine des datasets ;
- [`sources/bibliography.yaml`](sources/bibliography.yaml) — références scientifiques et techniques ;
- [`signals/catalogue.yaml`](signals/catalogue.yaml) — registre sémantique des `ClimateSignal` ;
- [`methods/README.md`](methods/README.md) — index des quatre méthodes.

Les contrats exécutables sont dans :

```text
packages/climate-contracts/
```

avec cinq JSON Schema et cinq exemples contractuels.

## Méthodes P2 + P3

```text
methods/
├── climate-overview/v1/
├── climate-fingerprint/v4/
├── thermal-seasons/v1/
└── water-through-year/v1/
```

Chaque méthode possède :

```text
method.yaml
science.md
technical.md
interpretation.md
CHANGELOG.md
```

Toutes restent `draft` jusqu'aux golden masters et tests d'équivalence P5.

## Architecture cible

`apps/copernicus` conserve la responsabilité d'acquisition, cache, provenance et contrôle des actifs Copernicus. Les quatre futurs services scientifiques consommeront un `ClimateSnapshot` partagé :

| Service | Méthode |
|---|---|
| `climate-overview-service` | `climate-overview@1.0.0` |
| `climate-fingerprint-service` | `climate-fingerprint@4.0.0` |
| `climate-seasons-service` | `thermal-seasons@1.0.0` |
| `climate-water-service` | `water-through-year@1.0.0` |

Les méthodes référencent la famille scientifique et les variables. Le `ClimateSnapshot` conserve l'actif concret, son édition/version disponible, les paramètres de requête, la date de récupération et la représentativité.

## Décisions majeures P2

### Climate overview

Le noyau V1 comprend température, précipitations et représentativité spatiale. Il n'applique aucun downscaling. Les compteurs de gel, jours ≥30 °C et nuits ≥20 °C du POC sont exclus du noyau canonique tant qu'ils reposent sur une approximation par température moyenne quotidienne.

### Climate fingerprint

La V4 conserve six lignes. Le vent utilise ERA5-Land `u10/v10`. La pluie intense est un compte annuel de jours dépassant le P95 des jours humides de référence et n'est pas appelée R95p/R95pTOT. La transformation robuste utilisée pour la couleur est une convention éditoriale OpenDataVal.

### Thermal seasons

La méthode T25/T75 fixe les règles de complétude, le calendrier sans 29 février, le lissage polynomial degré 3, les franchissements et les comparaisons décennales. Elle décrit des saisons thermiques locales, pas DJF/MAM/JJA/SON.

### Water through year

La conversion des accumulations ERA5-Land mensuelles et la convention de signe de `total_evaporation` ont été vérifiées dans la documentation ECMWF. Le stock 0–100 cm est une grandeur dérivée du modèle et ne peut pas être appelé réserve utile, eau disponible pour les plantes ou observation de nappe.

## P3 — interprétation IA

P3 fixe le passage :

```text
ClimateResult
      ↓
ClimateSignal calculé
      ↓
formulation autorisée
      ↓
caveats obligatoires
      ↓
ClimateCommentary
```

Chaque constat important doit être traçable :

```text
phrase
 ↓
signal_id
 ↓
ClimateSignal
 ↓
evidence
 ↓
ClimateResult
```

Les quatre méthodes actuelles n'émettent que des constats de niveau `descriptive`. Les niveaux `statistical_trend` et `causal_attribution` sont réservés à de futures méthodes qui les calculeront explicitement.

## P4 — contrats communs

P4 formalise cinq contrats :

```text
ClimateSnapshot
ClimateResult
ClimateSignal
ClimateCommentary
ClimateSheet
```

Les schémas sont dans :

```text
packages/climate-contracts/schemas/
```

Les exemples sont dans :

```text
packages/climate-contracts/examples/
```

Le contrat commun impose notamment :

- méthode et version ;
- snapshot et provenance ;
- représentativité ;
- qualité ;
- signaux et preuves ;
- caveats ;
- rattachement de chaque finding IA à au moins un `signal_id`.

Les relations entre plusieurs documents — résolution des JSON Pointer, existence réelle d'un signal, cohérence des snapshot, interdiction d'escalade du niveau de preuve — seront contrôlées par un validateur applicatif en plus de JSON Schema.

## Migration

```text
POC
 ↓
méthode canonique
 ↓
golden master
 ↓
nouveau service
 ↓
test d'équivalence
 ↓
validation
 ↓
archivage du POC
```

## Feuille de route

- **P0 — réalisé** : architecture et gouvernance ;
- **P1 — réalisé** : sources et bibliographie ;
- **P2 — réalisé** : quatre méthodes canoniques en statut `draft` ;
- **P3 — réalisé** : règles d'interprétation et catalogue sémantique `ClimateSignal` ;
- **P4 — réalisé** : contrats communs JSON Schema + exemples ;
- **P5 — prochain** : golden masters, sous-schémas de résultats si nécessaire et tests d'équivalence ;
- **P6+** : migration progressive des microservices, orchestrateur et commentaire IA.

## Définition de `validated`

Une méthode n'est `validated` que lorsque ses sources, variables, formules, périodes, qualité, représentativité, limites, règles d'interprétation et contrats sont explicites, et qu'un golden master démontre que le code produit le résultat attendu dans les tolérances définies.
