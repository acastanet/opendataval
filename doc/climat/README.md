# Référentiel climat OpenDataVal

Statut : **socle d'architecture P0 + registre des sources P1 + méthodes P2**.

Ce répertoire est la documentation canonique du domaine climat d'OpenDataVal. Il décrit comment produire une **fiche climat d'un lieu** à partir de données climatiques traçables, de méthodes scientifiques versionnées et de rendus reproductibles.

Le dossier `poc/climat/` reste, pendant la migration, le corpus de référence des prototypes existants. Il ne constitue plus à terme la documentation normative du produit.

## Objectif produit

Une fiche climat répond à quatre questions complémentaires, dans cet ordre :

1. **Le climat de la zone** — À quoi ressemble normalement une année climatique dans cette zone ?
2. **L'empreinte climatique du lieu** — Qu'est-ce qui a changé au cours des trente dernières années ?
3. **Les saisons se déplacent** — Comment le calendrier thermique s'est-il déplacé ?
4. **L'eau au fil de l'année** — Comment le cycle hydroclimatique se répartit-il et a-t-il évolué ?

Les quatre analyses partagent des règles communes de provenance, de qualité, de représentativité et de versionnement. Une infographie n'est jamais la source scientifique : elle est le rendu d'un résultat structuré.

## Chaîne de confiance

```text
source scientifique / dataset
        ↓
donnée acquise et tracée
        ↓
méthode OpenDataVal versionnée
        ↓
calcul déterministe
        ↓
ClimateResult
        ↓
ClimateSignal[]
        ↓
├── rendu SVG / HTML
└── commentaire IA contrôlé
        ↓
ClimateSheet
```

Aucun renderer et aucun modèle de langage ne doit recalculer silencieusement un indicateur scientifique.

## Documentation canonique

### Architecture et gouvernance

- [`01-ARCHITECTURE.md`](01-ARCHITECTURE.md) — frontières des composants et chaîne de production ;
- [`02-DATA-SOURCES.md`](02-DATA-SOURCES.md) — sources, variables, représentativité et décisions P1/P2 ;
- [`04-SCIENTIFIC-GOVERNANCE.md`](04-SCIENTIFIC-GOVERNANCE.md) — versionnement, preuve, qualité et autorité documentaire.

### Registres structurés

- [`sources/datasets.yaml`](sources/datasets.yaml) — jeux de données, variables, usages et statut de vérification ;
- [`sources/bibliography.yaml`](sources/bibliography.yaml) — standards, documentation officielle et publications scientifiques.

### Méthodes P2

Voir [`methods/README.md`](methods/README.md).

```text
methods/
├── climate-overview/v1/
├── climate-fingerprint/v4/
├── thermal-seasons/v1/
└── water-through-year/v1/
```

Chaque version contient :

```text
method.yaml
science.md
technical.md
CHANGELOG.md
```

`interpretation.md` sera ajouté en P3.

## Acquisition et cache

`apps/copernicus` reste le composant chargé des accès distants, du cache et de la préparation des données Copernicus. Une visite du site ne doit jamais déclencher une requête vers le Climate Data Store.

Le futur contrat entre acquisition et calcul sera `ClimateSnapshot`.

Une distinction est désormais obligatoire :

```text
méthode scientifique = famille de données + variable + calcul
```

et :

```text
ClimateSnapshot = actif concret + version/édition + paramètres + provenance
```

Cette séparation permet de changer une interface d'acquisition sans modifier silencieusement la méthode, à condition de démontrer l'équivalence numérique.

## Quatre services scientifiques cibles

| Service cible | POC | Méthode | Responsabilité |
|---|---|---|---|
| `climate-overview-service` | `poc/climat/general/` | `climate-overview@1.0.0` | climat habituel |
| `climate-fingerprint-service` | `poc/climat/empreinte-climatique/` | `climate-fingerprint@4.0.0` | évolution multidimensionnelle |
| `climate-seasons-service` | `poc/climat/saisons/` | `thermal-seasons@1.0.0` | saisons thermiques |
| `climate-water-service` | `poc/climat/bilan eau/` | `water-through-year@1.0.0` | cycle hydroclimatique |

Chaque service produira à terme :

- un `ClimateResult` conforme au contrat commun ;
- des `ClimateSignal` déterministes ;
- qualité et représentativité ;
- provenance ;
- un rendu graphique dérivé du résultat sans nouveau calcul scientifique.

## Décisions scientifiques stabilisées par P2

### Climate overview

Le noyau canonique V1 est limité à :

- climatologie mensuelle de température ;
- climatologie mensuelle de précipitations ;
- représentativité spatiale Point/Polygon/MultiPolygon.

Aucun downscaling n'est appliqué. Les compteurs de gel, jours ≥30 °C et nuits ≥20 °C restent hors noyau tant qu'ils ne sont pas calculés à partir de vrais minima/maxima quotidiens.

### Climate fingerprint

La V4 conserve six lignes. Le vent utilise canoniquement ERA5-Land `u10/v10`. La pluie intense est un compte annuel de jours au-dessus du P95 des jours humides de référence ; elle n'est pas appelée R95p/R95pTOT. La transformation robuste pilotant la couleur est un choix éditorial OpenDataVal, pas un indice climatique universel.

### Thermal seasons

La méthode T25/T75 est figée avec :

- 18 valeurs horaires minimum par jour ;
- 98 % de jours valides par année avant interpolation ;
- suppression du 29 février ;
- interpolation limitée aux lacunes ≤2 jours ;
- percentile `linear` ;
- lissage polynomial degré 3 ;
- quatre franchissements ordonnés ;
- comparaison des médianes 1996–2005 / 2016–2025.

Il s'agit de saisons thermiques locales, pas des saisons météorologiques fixes.

### Water through year

La conversion des accumulations ERA5-Land `monthly_averaged_reanalysis` et la convention de signe de `total_evaporation` ont été vérifiées dans la documentation ECMWF. Le stock 0–100 cm est une grandeur dérivée du modèle et ne doit jamais être présenté comme réserve utile, eau disponible pour les plantes ou observation de nappe.

## Service de commentaire IA

Le futur `climate-commentary-service` ne doit pas interpréter le SVG comme source principale. Il recevra :

```text
ClimateResult
+ ClimateSignal[]
+ method.id / method.version
+ interpretation.md de cette version
```

Le modèle transforme des résultats déjà calculés en explication. Il ne peut pas :

- inventer une valeur ;
- recalculer une tendance à partir d'un graphique ;
- revendiquer une significativité sans test fourni ;
- inventer une causalité ;
- transformer une maille de réanalyse en mesure de parcelle ;
- dépasser les formulations autorisées par la méthode.

## Orchestration

Le futur `climate-sheet-service` coordonne sans introduire de nouvelle logique scientifique :

```text
lieu
 ↓
ClimateSnapshot
 ↓
4 ClimateResult
 ↓
ClimateSignal[]
 ↓
rendus + commentaires
 ↓
ClimateSheet
```

## Migration depuis les POC

Les POC ne sont pas supprimés pendant P0–P5.

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

Une divergence entre documentation et code doit être consignée et résolue explicitement.

## Feuille de route

- **P0 — réalisé** : architecture et gouvernance scientifique ;
- **P1 — réalisé** : registre des sources et bibliographie ;
- **P2 — réalisé** : extraction et décisions des quatre méthodes canoniques, conservées en statut `draft` ;
- **P3 — prochain** : `interpretation.md` et définition des `ClimateSignal` attendus pour chaque méthode ;
- **P4** : contrats `ClimateSnapshot`, `ClimateResult`, `ClimateSignal`, `ClimateCommentary`, `ClimateSheet` ;
- **P5** : golden masters et tests d'équivalence ;
- **P6+** : migration des quatre services, orchestrateur et commentaire IA.

## Définition de `validated`

Une méthode n'est `validated` que si :

1. ses sources et variables sont identifiées ;
2. ses formules et périodes sont explicites ;
3. sa représentativité est documentée ;
4. ses règles de qualité sont testables ;
5. ses limites sont écrites ;
6. son interprétation autorisée est définie ;
7. un golden master permet de détecter les régressions ;
8. le résultat publié conserve `method.id` et `method.version` ;
9. le code reproduit le résultat de référence dans les tolérances définies.
