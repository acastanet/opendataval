# Référentiel climat OpenDataVal

Statut : **socle d'architecture P0 + registre des sources P1 + méthodes P2**.

Ce répertoire devient la documentation canonique du domaine climat d'OpenDataVal.
Il décrit comment produire une **fiche climat d'un lieu** à partir de données climatiques
traçables, de méthodes scientifiques versionnées et de rendus reproductibles.

Le dossier `poc/climat/` reste, pendant la migration, le corpus de référence des prototypes
existants. Il ne constitue plus à terme la documentation normative du produit.

## Objectif produit

Une fiche climat doit répondre à quatre questions complémentaires, dans cet ordre :

1. **Le climat de la zone** — À quoi ressemble normalement une année climatique dans cette zone ?
2. **L'empreinte climatique du lieu** — Qu'est-ce qui a changé au cours des trente dernières années ?
3. **Les saisons se déplacent** — Comment le calendrier thermique s'est-il déplacé ?
4. **L'eau au fil de l'année** — Comment le cycle hydroclimatique se répartit-il et a-t-il évolué ?

Ces quatre analyses sont différentes mais doivent partager :

- les mêmes règles de provenance ;
- des périodes explicitement versionnées ;
- un vocabulaire commun de qualité et de représentativité ;
- une enveloppe JSON commune ;
- des règles explicites d'interprétation ;
- une chaîne de production reproductible.

La fiche climat n'est donc pas une collection de quatre SVG indépendants. Chaque infographie
est le rendu d'un **résultat scientifique structuré** qui peut être vérifié, réutilisé et
commenté sans dépendre du dessin lui-même.

## Principe directeur

La chaîne de confiance est :

```text
source scientifique / dataset
        ↓
donnée acquise et tracée
        ↓
méthode OpenDataVal versionnée
        ↓
calcul déterministe
        ↓
résultat JSON validé
        ↓
signaux interprétables
        ↓
├── rendu SVG / HTML
└── commentaire IA contrôlé
        ↓
fiche climat
```

Aucun renderer et aucun modèle de langage ne doit recalculer silencieusement un indicateur
scientifique.

## Documents canoniques

### Architecture et gouvernance

- [`01-ARCHITECTURE.md`](01-ARCHITECTURE.md) — frontières des composants et chaîne de production ;
- [`02-DATA-SOURCES.md`](02-DATA-SOURCES.md) — sources, variables, représentativité et questions scientifiques ;
- [`04-SCIENTIFIC-GOVERNANCE.md`](04-SCIENTIFIC-GOVERNANCE.md) — versionnement, preuve, qualité et autorité documentaire.

### Registres structurés

- [`sources/datasets.yaml`](sources/datasets.yaml) — jeux de données et variables ;
- [`sources/bibliography.yaml`](sources/bibliography.yaml) — standards, documentation officielle et références scientifiques.

### Méthodes P2

Le registre des méthodes est décrit dans [`methods/README.md`](methods/README.md).

```text
methods/
├── climate-overview/v1/
├── climate-fingerprint/v4/
├── thermal-seasons/v1/
└── water-through-year/v1/
```

Chaque version contient actuellement :

```text
method.yaml
science.md
technical.md
CHANGELOG.md
```

`interpretation.md` sera ajouté en P3.

## Composants cibles

### Acquisition et cache

`apps/copernicus` reste le composant chargé de l'acquisition distante, du cache et de la
préparation des données Copernicus. Le principe existant est conservé : une visite du site ne
doit jamais déclencher une requête vers le Climate Data Store.

Le futur contrat partagé entre acquisition et analyses sera un **ClimateSnapshot** : un
ensemble versionné de données, de métadonnées, de provenance et d'informations de qualité
nécessaires à une fiche donnée.

La méthode scientifique doit référencer une famille de données et des variables. Le
`ClimateSnapshot` conservera le produit d'acquisition exact utilisé pour une exécution. Cette
séparation permet de remplacer une interface de téléchargement par une autre équivalente sans
changer silencieusement la méthode scientifique.

### Quatre services scientifiques

Les POC actuels doivent progressivement donner naissance à quatre services :

| Service cible | POC de référence | Méthode canonique | Responsabilité |
|---|---|---|---|
| `climate-overview-service` | `poc/climat/general/` | `climate-overview@1.0.0` | décrire le climat habituel |
| `climate-fingerprint-service` | `poc/climat/empreinte-climatique/` | `climate-fingerprint@4.0.0` | caractériser l'évolution multidimensionnelle récente |
| `climate-seasons-service` | `poc/climat/saisons/` | `thermal-seasons@1.0.0` | calculer le déplacement des saisons thermiques |
| `climate-water-service` | `poc/climat/bilan eau/` | `water-through-year@1.0.0` | décrire et comparer le cycle hydroclimatique |

Chaque service scientifique devra produire au minimum :

- un résultat JSON conforme au contrat commun ;
- des signaux interprétables calculés, jamais inventés par l'IA ;
- des informations de qualité et de représentativité ;
- une provenance complète ;
- un rendu graphique dérivé du JSON, sans nouveau calcul scientifique.

## État des quatre méthodes après P2

### Climate overview

Le noyau canonique V1 est limité à la climatologie température/précipitations et à la
représentativité spatiale. Les compteurs de gel, de jours ≥30 °C et de nuits ≥20 °C ne sont pas
canoniques tant qu'ils reposent sur l'approximation du POC à partir de températures moyennes
quotidiennes.

### Climate fingerprint

La V4 conserve six lignes. Le vent utilise canoniquement ERA5-Land `u10/v10`. La pluie intense
est un compte annuel de jours dépassant le P95 des jours humides de référence ; elle n'est pas
nommée R95p/R95pTOT. La transformation robuste utilisée pour la couleur est un choix éditorial
OpenDataVal et ne constitue pas une nouvelle grandeur climatique.

### Thermal seasons

La méthode T25/T75, la complétude, le calendrier sans 29 février, le lissage polynomial degré 3,
les quatre franchissements et les comparaisons décennales sont figés. Les résultats décrivent
des saisons thermiques locales, pas les saisons météorologiques fixes.

### Water through year

La conversion des accumulations ERA5-Land mensuelles et le signe de `total_evaporation` sont
explicitement documentés. Le stock 0–100 cm est une grandeur dérivée du modèle et ne doit jamais
être présenté comme réserve utile, eau disponible pour les plantes ou observation de nappe.

## Service de commentaire IA

Le futur `climate-commentary-service` ne doit pas interpréter un SVG comme source principale.
Il reçoit :

```text
ClimateResult
+ ClimateSignal[]
+ method.id / method.version
+ règles d'interprétation de cette version
```

Le modèle de langage transforme des résultats déjà calculés en explication. Il ne doit pas :

- inventer une valeur ;
- recalculer une tendance à partir d'un graphique ;
- qualifier une différence de statistiquement significative sans résultat de test ;
- attribuer causalement un phénomène sans méthode d'attribution ;
- transformer une réanalyse de grille en mesure de parcelle ;
- dépasser les formulations autorisées par la méthode versionnée.

## Orchestration

Le futur `climate-sheet-service` coordonne la production mais n'introduit pas de logique
scientifique propre :

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

Une même fiche doit, autant que possible, référencer un même snapshot cohérent de données et
conserver l'identité exacte des datasets et méthodes employés.

## Hiérarchie des preuves

Le domaine distingue :

```text
source / observation ou réanalyse
        ↓
valeur normalisée
        ↓
valeur dérivée par une méthode versionnée
        ↓
ClimateSignal
        ↓
interprétation
```

Une phrase interprétative doit pouvoir être reliée à un ou plusieurs signaux. Un signal doit
pouvoir être relié au résultat qui l'a produit. Le résultat doit être relié à une méthode et à
un snapshot de données.

## Migration depuis les POC

Les POC ne sont pas supprimés pendant P0–P5.

La règle de migration est :

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

Une divergence observée entre documentation et code doit être consignée et résolue
explicitement. Elle ne doit jamais être corrigée silencieusement pendant une migration.

## Feuille de route

- **P0 — réalisé** : architecture et gouvernance scientifique ;
- **P1 — réalisé** : registre initial des sources et bibliographie ;
- **P2 — réalisé en `draft`** : extraction des quatre méthodes canoniques ;
- **P3 — suivant** : règles d'interprétation propres à chaque méthode ;
- **P4** : contrats `ClimateSnapshot`, `ClimateResult`, `ClimateSignal`, `ClimateCommentary`, `ClimateSheet` ;
- **P5** : golden masters et tests d'équivalence ;
- **P6+** : migration progressive des quatre services, puis orchestrateur et commentaire IA.

## Définition de terminé pour le référentiel

Une méthode ne peut être déclarée `validated` que si :

1. ses sources et variables sont identifiées ;
2. ses formules et périodes sont explicites ;
3. sa représentativité est documentée ;
4. ses règles de qualité sont testables ;
5. ses limites sont écrites ;
6. son interprétation autorisée est définie ;
7. un golden master ou un résultat de référence permet de détecter les régressions ;
8. le résultat publié conserve `method.id` et `method.version`.
