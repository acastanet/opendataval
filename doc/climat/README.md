# Référentiel climat OpenDataVal

Statut : **P0 à P5 réalisés ; golden masters validés en CI ; méthodes en `draft` jusqu'à la migration native P6**.

Ce répertoire est la documentation canonique du domaine climat d'OpenDataVal. Il décrit la production d'une **fiche climat d'un lieu** à partir de données traçables, de méthodes scientifiques versionnées, de contrats communs, de rendus reproductibles et de commentaires IA contrôlés.

`poc/climat/` reste le corpus de référence pendant la migration. Les POC ne seront archivés qu'après reproduction de leurs golden masters par les nouveaux services P6.

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
- [`02-DATA-SOURCES.md`](02-DATA-SOURCES.md) — sources et variables ;
- [`03-COMMON-CONTRACT.md`](03-COMMON-CONTRACT.md) — contrats et invariants inter-documents ;
- [`04-SCIENTIFIC-GOVERNANCE.md`](04-SCIENTIFIC-GOVERNANCE.md) — versionnement, preuve, qualité et autorité documentaire ;
- [`06-AI-INTERPRETATION.md`](06-AI-INTERPRETATION.md) — règles communes du service IA ;
- [`sources/datasets.yaml`](sources/datasets.yaml) — registre machine des datasets ;
- [`sources/bibliography.yaml`](sources/bibliography.yaml) — références scientifiques et techniques ;
- [`signals/catalogue.yaml`](signals/catalogue.yaml) — registre sémantique des `ClimateSignal` ;
- [`methods/README.md`](methods/README.md) — index des quatre méthodes.

Les contrats exécutables et les golden masters sont dans :

```text
packages/climate-contracts/
```

## Les quatre méthodes

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

## Architecture cible

`apps/copernicus` conserve la responsabilité d'acquisition, cache, provenance et contrôle des actifs Copernicus. Les quatre futurs services scientifiques consommeront un `ClimateSnapshot` partagé :

| Service | Méthode |
|---|---|
| `climate-overview-service` | `climate-overview@1.0.0` |
| `climate-fingerprint-service` | `climate-fingerprint@4.0.0` |
| `climate-seasons-service` | `thermal-seasons@1.0.0` |
| `climate-water-service` | `water-through-year@1.0.0` |

Les méthodes référencent la famille scientifique et les variables. Le `ClimateSnapshot` conserve l'actif concret, son édition/version disponible, les paramètres de requête, la date de récupération et la représentativité.

## Décisions scientifiques majeures

### Climate overview

Le noyau V1 comprend température, précipitations et représentativité spatiale. Il n'applique aucun downscaling. Les compteurs de gel, jours ≥30 °C et nuits ≥20 °C du POC sont conservés dans le golden master pour traçabilité mais **n'émettent aucun `ClimateSignal`** tant qu'ils reposent sur une approximation par température moyenne quotidienne.

### Climate fingerprint

La V4 conserve six lignes. Le vent utilise ERA5-Land `u10/v10`. La pluie intense est un compte annuel de jours dépassant le P95 des jours humides de référence et n'est pas appelée R95p/R95pTOT. La transformation robuste utilisée pour la couleur est une convention éditoriale OpenDataVal.

### Thermal seasons

La méthode T25/T75 fixe les règles de complétude, le calendrier sans 29 février, le lissage polynomial degré 3, les franchissements et les comparaisons décennales. Elle décrit des saisons thermiques locales, pas DJF/MAM/JJA/SON.

### Water through year

La conversion des accumulations ERA5-Land mensuelles et la convention de signe de `total_evaporation` sont documentées. Le stock 0–100 cm est une grandeur dérivée du modèle et ne peut pas être appelé réserve utile, eau disponible pour les plantes ou observation de nappe.

## P3 — interprétation IA

Chaque constat important doit être traçable :

```text
phrase
 ↓
signal_id
 ↓
ClimateSignal
 ↓
evidence.result_pointer
 ↓
ClimateResult
```

Les quatre méthodes actuelles n'émettent que des constats de niveau `descriptive`. `statistical_trend` et `causal_attribution` sont réservés à de futures méthodes qui calculeront explicitement ces niveaux de preuve.

## P4 — contrats communs

P4 formalise :

```text
ClimateSnapshot
ClimateResult
ClimateSignal
ClimateCommentary
ClimateSheet
```

Schémas :

```text
packages/climate-contracts/schemas/
```

Les relations entre documents — JSON Pointer, existence réelle d'un signal, cohérence des snapshots, niveau de preuve — sont complétées par des tests applicatifs.

## P5 — golden masters

P5 fige les quatre sorties historiques qui serviront de cibles de migration :

| Méthode | Blob Git source | Signaux P5 | Qualité du résultat adapté |
|---|---|---:|---|
| `climate-fingerprint@4.0.0` | `2d96777b…` | 6 | `valid` |
| `thermal-seasons@1.0.0` | `b9f1dd34…` | 5 | `partial` — 29 années `ok` / 30 |
| `water-through-year@1.0.0` | `4aca3589…` | 3 | `valid` — 420/420 mois |
| `climate-overview@1.0.0` | `b4e3be64…` | 7 | `partial` — extrêmes legacy exclus |

Index détaillé :

```text
packages/climate-contracts/tests/README.md
```

Le workflow :

```text
.github/workflows/climate-contracts.yml
```

vérifie automatiquement :

- identité du blob source ;
- valeurs figées ;
- conservation du payload POC dans `ClimateResult.data` ;
- `ClimateSignal` attendus ;
- `evidence.result_pointer` ;
- invariants méthode / snapshot / provenance ;
- conformité aux JSON Schema Draft 2020-12.

P5 **ne recalcule pas la science** : il fixe la cible que les nouveaux services devront reproduire.

## Migration

```text
POC
 ↓
méthode canonique
 ↓
golden master P5
 ↓
nouveau service P6
 ↓
ClimateResult natif
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
- **P2 — réalisé** : quatre méthodes canoniques ;
- **P3 — réalisé** : règles d'interprétation et catalogue `ClimateSignal` ;
- **P4 — réalisé** : contrats communs JSON Schema ;
- **P5 — réalisé** : quatre golden masters + adaptateurs + CI ;
- **P6 — prochain** : migration native des services scientifiques, un par un ;
- **P7+** : orchestrateur `climate-sheet-service`, render kit commun et `climate-commentary-service`.

## Définition de `validated`

Une méthode ne passe en `validated` qu'après :

1. documentation scientifique et technique complète ;
2. règles d'interprétation explicites ;
3. contrat commun valide ;
4. golden master P5 ;
5. reproduction native du golden master par le service P6 dans les tolérances définies.

Jusqu'à P6, les méthodes restent donc `draft` même si leurs golden masters sont validés.
