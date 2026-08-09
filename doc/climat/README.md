# Référentiel climat OpenDataVal

Statut : **socle d'architecture P0**.

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

### Orchestration

Le futur `climate-sheet-service` assemblera une fiche complète à partir d'un même contexte de
données et déclenchera les quatre analyses. Il ne devra pas contenir de logique scientifique
propre aux indicateurs.

### Interprétation IA

Le futur `climate-commentary-service` expliquera les résultats déjà calculés. Il ne devra pas
analyser directement les fichiers climatiques bruts ni utiliser l'infographie comme source de
vérité.

Son contexte sera construit à partir de :

- la version exacte de la méthode ;
- les signaux calculés ;
- les règles d'interprétation autorisées ;
- les limites et réserves de la méthode ;
- les informations de qualité et de représentativité.

Une affirmation importante produite par l'IA devra pouvoir être reliée à un ou plusieurs
signaux ou résultats calculés.

## Documentation canonique

Le domaine climat suivra progressivement cette organisation :

```text
doc/climat/
├── README.md
├── 01-ARCHITECTURE.md
├── 02-DATA-SOURCES.md                 # P1
├── 03-COMMON-CONTRACT.md              # étape contrats
├── 04-SCIENTIFIC-GOVERNANCE.md
├── 05-QUALITY-AND-REPRESENTATIVITY.md # étape qualité
├── 06-AI-INTERPRETATION.md            # étape IA
├── sources/                            # P1
├── glossary/
└── methods/
    ├── climate-overview/
    ├── climate-fingerprint/
    ├── thermal-seasons/
    └── water-through-year/
```

Pour chaque méthode versionnée, la cible est :

```text
methods/<method>/vN/
├── method.yaml
├── science.md
├── technical.md
├── interpretation.md
└── CHANGELOG.md
```

- `science.md` justifie la méthode et ses limites ;
- `technical.md` décrit exactement son implémentation ;
- `method.yaml` expose les paramètres normatifs lisibles par machine ;
- `interpretation.md` fixe ce qui peut et ne peut pas être dit à partir du résultat ;
- `CHANGELOG.md` documente toute modification méthodologique.

## Sources de vérité

En cas de divergence pendant la migration, l'ordre d'autorité est :

1. méthode canonique versionnée sous `doc/climat/methods/` une fois validée ;
2. contrat JSON versionné de la méthode ;
3. tests et fixtures de référence ;
4. implémentation du service ;
5. rendu SVG / HTML ;
6. commentaire IA.

Pendant P0–P2, tant qu'une méthode canonique n'a pas encore été extraite et validée, le POC
correspondant et sa documentation actuelle restent la référence à analyser. Une contradiction
entre documents doit être signalée et résolue explicitement ; elle ne doit jamais être
corrigée silencieusement.

## Règles de migration des POC

Les POC sont gelés comme références fonctionnelles pendant l'extraction des méthodes.

Une migration suit l'ordre :

```text
POC
 ↓
méthode documentée
 ↓
fixture / résultat de référence
 ↓
nouveau service
 ↓
comparaison POC ↔ service
 ↓
validation
 ↓
archivage éventuel du POC
```

Un POC ne doit pas être supprimé avant que le service de remplacement reproduise ses résultats
de référence dans les tolérances explicitement définies.

Ordre de migration recommandé :

1. empreinte climatique ;
2. saisons thermiques ;
3. eau au fil de l'année ;
4. climat général.

L'ordre reflète la maturité actuelle des prototypes, pas l'importance scientifique des quatre
infographies.

## Documents existants utilisés comme matériaux de migration

Les principaux matériaux actuellement identifiés sont :

- `poc/climat/general/INSTRUCTIONS_AGENT_CODAGE_CLIMAT_GENERAL_ZONE_V1.md` ;
- `poc/climat/general/climate/overview/CLIMATE_OVERVIEW_METHOD.md` ;
- `poc/climat/empreinte-climatique/README.md` ;
- `poc/climat/empreinte-climatique/docs/specification.md` ;
- `poc/climat/saisons/INSTRUCTIONS_AGENT_SAISONS_SE_DEPLACENT_V1.md` ;
- `poc/climat/bilan eau/WATER_THROUGH_YEAR_METHOD.md` ;
- `poc/climat/PRESENTATION_CLIMAT_EMPREINTE_SAISONS_REFERENCES.md`.

Ces fichiers ne sont pas tous de même statut ni forcément cohérents entre eux. Ils seront
réconciliés méthode par méthode dans P2.

## Étapes de construction

- **P0 — Socle documentaire** : ce README, architecture et gouvernance scientifique.
- **P1 — Registre des sources** : datasets, variables, résolutions, licences, bibliographie.
- **P2 — Méthodes canoniques** : extraction des quatre méthodes réellement implémentées.
- **P3 — Règles d'interprétation** : claims autorisés/interdits et limites par méthode.
- **P4 — Contrats communs** : `ClimateSnapshot`, `ClimateResult`, `ClimateSignal`, commentaire et fiche.
- **P5 — Tests de conformité** : golden masters issus des POC.
- **P6+ — Migration des services** : un service à la fois, sans modifier la science au passage.

## Critère de réussite de P0

Après lecture de ce répertoire, un agent doit pouvoir répondre sans ambiguïté aux questions :

- qu'est-ce qu'une fiche climat ?
- quelles sont ses quatre analyses principales ?
- qui acquiert les données ?
- où les méthodes scientifiques sont-elles définies ?
- quelle couche calcule les indicateurs ?
- quelle couche produit les dessins ?
- que reçoit le service IA ?
- que lui est-il interdit d'inférer seul ?
- quand un POC peut-il être retiré ?

Les détails des datasets et références scientifiques seront centralisés lors de P1.