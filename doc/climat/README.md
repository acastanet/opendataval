# Référentiel climat OpenDataVal

Statut : **socle d'architecture P0 + registre de sources P1**.

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

## Documentation disponible

### P0 — architecture et gouvernance

- [`01-ARCHITECTURE.md`](01-ARCHITECTURE.md) — responsabilités des composants et chaîne de production ;
- [`04-SCIENTIFIC-GOVERNANCE.md`](04-SCIENTIFIC-GOVERNANCE.md) — autorité documentaire, versionnement, validation et règles d'interprétation.

### P1 — sources scientifiques et techniques

- [`02-DATA-SOURCES.md`](02-DATA-SOURCES.md) — carte source → variable → infographie et questions ouvertes ;
- [`sources/datasets.yaml`](sources/datasets.yaml) — registre structuré des datasets et de leurs usages ;
- [`sources/bibliography.yaml`](sources/bibliography.yaml) — références normatives, documentation officielle et articles scientifiques.

Les entrées P1 restent au statut `draft` lorsque la documentation externe actuelle doit encore
être revérifiée. Une contradiction entre le code, une ancienne spécification et une source
scientifique ne doit jamais être résolue silencieusement.

## Composants cibles

### Acquisition et cache

`apps/copernicus` reste le composant chargé de l'acquisition distante, du cache et de la
préparation des données Copernicus. Le principe existant est conservé : une visite du site ne
doit jamais déclencher une requête vers le Climate Data Store.

Le futur contrat partagé entre acquisition et analyses sera un **ClimateSnapshot** : un
ensemble versionné de données, de métadonnées, de provenance et d'informations de qualité
nécessaires à une fiche donnée.

### Quatre services scientifiques

Les POC actuels doivent progressivement donner naissance à quatre services :

| Service cible | POC de référence | Responsabilité |
|---|---|---|
| `climate-overview-service` | `poc/climat/general/` | décrire le climat habituel |
| `climate-fingerprint-service` | `poc/climat/empreinte-climatique/` | caractériser l'évolution multidimensionnelle récente |
| `climate-seasons-service` | `poc/climat/saisons/` | calculer le déplacement des saisons thermiques |
| `climate-water-service` | `poc/climat/bilan eau/` | décrire et comparer le cycle hydroclimatique |

Chaque service scientifique devra produire au minimum :

- un résultat JSON conforme au contrat commun ;
- des signaux interprétables calculés, jamais inventés par l'IA ;
- des informations de qualité et de représentativité ;
- une provenance complète ;
- un rendu graphique dérivé du JSON, sans nouveau calcul scientifique.

### Service de commentaire

`climate-commentary-service` n'est pas un moteur de calcul climatique. Il transforme des
résultats déjà calculés en explications contrôlées.

Il devra recevoir :

- le résultat JSON ;
- les `ClimateSignal` ;
- l'identifiant et la version de la méthode ;
- les règles d'interprétation de cette méthode ;
- les limites et informations de qualité nécessaires.

Une affirmation interprétative importante devra être reliée à un ou plusieurs signaux calculés.

### Orchestration

`climate-sheet-service` assemblera une fiche complète. Il demandera ou réutilisera un
`ClimateSnapshot`, déclenchera les quatre analyses, validera leurs contrats, lancera les
commentaires autorisés puis produira le manifeste de fiche.

Il ne portera pas lui-même les formules scientifiques.

## Contrats cibles

Les futurs contrats partagés seront regroupés sous :

```text
packages/climate-contracts/
```

Ils couvriront au minimum :

- `ClimateSnapshot` — données et provenance communes ;
- `ClimateResult` — enveloppe scientifique commune ;
- `ClimateSignal` — fait dérivé explicitement interprétable ;
- `ClimateCommentary` — commentaire lié aux preuves ;
- `ClimateSheet` — manifeste de fiche complète.

Le JSON Schema sera la référence interlangage. Les types Python ou TypeScript devront être
dérivés de ce contrat ou testés contre lui.

## Méthodes scientifiques versionnées

Les méthodes seront progressivement extraites sous :

```text
doc/climat/methods/
├── climate-overview/
├── climate-fingerprint/
├── thermal-seasons/
└── water-through-year/
```

Chaque version comprendra à terme :

```text
method.yaml
science.md
technical.md
interpretation.md
CHANGELOG.md
```

Le rôle de ces fichiers est détaillé dans `04-SCIENTIFIC-GOVERNANCE.md`.

## Place des POC pendant la migration

`poc/climat/` est gelé comme **corpus de référence de migration**.

Cela signifie :

- ne pas le nettoyer massivement avant extraction des méthodes ;
- ne pas remplacer les sorties de référence sans justification ;
- conserver les fixtures utiles à la comparaison ;
- identifier les contradictions documentaires au lieu de les réconcilier silencieusement ;
- ne déplacer un POC vers l'archive qu'après validation du service qui le remplace.

Une migration est terminée lorsque le nouveau service reproduit les résultats scientifiques de
référence dans les tolérances documentées, ou lorsque toute différence volontaire est associée à
une nouvelle version de méthode.

## Règles non négociables

1. **Pas de calcul scientifique dans le navigateur.**
2. **Pas d'appel CDS déclenché par l'ouverture d'une page.**
3. **Pas de calcul scientifique caché dans le renderer.**
4. **Pas d'interprétation IA sans résultat structuré.**
5. **Pas d'affirmation de causalité si la méthode ne produit pas une analyse d'attribution.**
6. **Pas d'affirmation de tendance statistique si le service n'a pas produit le test correspondant.**
7. **Pas de fausse précision spatiale : une réanalyse maillée reste une réanalyse maillée.**
8. **Pas de changement silencieux de période, seuil, dataset ou formule.**
9. **Toute fiche conserve les versions exactes des méthodes et des données utilisées.**
10. **Toute méthode validée possède des résultats de référence et des tests de non-régression.**

## Feuille de route

### P0 — socle documentaire

**État : réalisé sur la branche de travail.**

Créer le présent README, l'architecture et la gouvernance scientifique.

### P1 — registre des sources

**État : structure réalisée ; vérification externe finale encore requise pour les champs marqués.**

Créer :

```text
02-DATA-SOURCES.md
sources/datasets.yaml
sources/bibliography.yaml
```

Le registre P1 fait déjà remonter notamment :

- une divergence à résoudre sur la source du vent de l'empreinte ;
- un contrôle critique des unités/sémantiques du produit ERA5-Land monthly means pour l'eau ;
- la nécessité de remplacer ou retirer les approximations d'extrêmes du climat général ;
- des références scientifiques complémentaires à confirmer pour UTCI et pluies intenses.

### P2 — méthodes canoniques

Extraire et figer les quatre méthodes réellement implémentées, en résolvant explicitement les
questions ouvertes de P1.

### P3 — interprétation

Créer les règles `allowed claims`, `forbidden claims`, caveats et signaux interprétables.

### P4 — contrats

Créer les JSON Schema et types partagés.

### P5 — golden masters

Transformer les sorties/fixtures POC pertinentes en tests d'équivalence documentés.

### P6+ — migration

Migrer successivement :

1. empreinte ;
2. saisons ;
3. eau ;
4. climat général.

Le service de commentaire puis l'orchestrateur de fiche seront branchés seulement après la
stabilisation des contrats et signaux.

## Critère de réussite global

Une fiche climat doit permettre de répondre à la question :

> « D'où vient cette phrase, cette valeur ou cette couleur ? »

La réponse doit pouvoir remonter jusqu'au dataset, à la méthode versionnée, au résultat calculé
et, lorsqu'il s'agit d'un commentaire IA, aux signaux précis qui supportent l'affirmation.
