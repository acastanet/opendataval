# Architecture du domaine climat

Statut : **architecture cible P0**.

Ce document définit les responsabilités des composants nécessaires à la production d'une
fiche climat. Il ne fige pas encore les contrats JSON détaillés ni le catalogue des datasets ;
ces éléments seront traités dans les étapes suivantes.

## 1. Principe d'architecture

La production climat est organisée autour de trois responsabilités distinctes :

1. **acquérir et tracer les données** ;
2. **calculer des résultats scientifiques déterministes** ;
3. **présenter et interpréter ces résultats sans les recalculer**.

Cette séparation est obligatoire. Elle garantit la reproductibilité, limite les divergences
entre infographies et permet d'auditer les commentaires produits par une IA.

## 2. Vue d'ensemble

```text
Coordonnées / géométrie / identifiant territorial
                         │
                         ▼
               climate-sheet-service
                   orchestration
                         │
            demande un ClimateSnapshot
                         │
                         ▼
                  apps/copernicus
             acquisition / cache / qualité
                         │
                         ▼
                  ClimateSnapshot
                         │
       ┌─────────────────┼─────────────────┐
       │                 │                 │
       ▼                 ▼                 ▼
 climate-overview   climate-fingerprint  climate-seasons
     service             service             service
       │                 │                 │
       └──────────────┬──┴──────────────┬──┘
                      │                 │
                      ▼                 ▼
                 climate-water      résultats
                    service          scientifiques
                      │                 │
                      └────────┬────────┘
                               ▼
                         ClimateResult
                      + ClimateSignal[]
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
                 renderer       climate-commentary-service
                 SVG/HTML          interprétation contrôlée
                    │                     │
                    └──────────┬──────────┘
                               ▼
                           fiche climat
```

Le schéma logique montre les responsabilités ; il ne présume pas encore du nombre final de
conteneurs ni du protocole inter-service. Les frontières scientifiques doivent être stabilisées
avant de choisir des optimisations de déploiement.

## 3. Entrée commune : le lieu

Une fiche climat est demandée pour un lieu ou une zone appartenant au jumeau numérique.
L'entrée doit conserver au minimum :

- l'identifiant territorial ou de dalle lorsqu'il existe ;
- la géométrie demandée ou les coordonnées du point demandé ;
- le système de référence spatial lorsque nécessaire ;
- les métadonnées utiles à la représentativité.

Le lieu demandé et le lieu effectivement représenté par les données climatiques sont deux
notions différentes. Cette distinction doit être conservée jusque dans le résultat final.

Exemple : une coordonnée utilisateur peut être représentée par une maille de réanalyse plus
large. Le résultat doit exposer ce fait ; il ne doit pas transformer une donnée de maille en
mesure locale de parcelle.

## 4. `apps/copernicus` : acquisition et préparation

Le composant existant `apps/copernicus` reste l'unique point de responsabilité pour les accès
au Climate Data Store utilisés par le domaine climat, sauf décision architecturale ultérieure
explicitement documentée.

Il doit :

- gérer les identifiants et secrets CDS côté serveur ;
- télécharger les produits nécessaires ;
- mettre les actifs en cache ;
- détecter les téléchargements incomplets ;
- conserver la provenance ;
- normaliser les métadonnées communes ;
- permettre des relances idempotentes ;
- fournir les données nécessaires aux calculs sans requête distante déclenchée par une visite
  utilisateur.

Il ne doit pas :

- choisir la signification éditoriale d'un indicateur ;
- produire un commentaire climatique ;
- définir seul une nouvelle méthode scientifique ;
- dupliquer dans plusieurs jobs des règles contradictoires de sélection spatiale ou de qualité.

Le fonctionnement actuel de `apps/copernicus` — collecte serveur, cache et publication
d'agrégats validés — constitue le point de départ de cette responsabilité.

## 5. `ClimateSnapshot` : frontière données → calcul

Le futur `ClimateSnapshot` représente l'état des données utilisées pour une fiche ou un
calcul. Son contrat détaillé sera défini en P4.

Il devra permettre de connaître au minimum :

- l'identité du snapshot ;
- le lieu demandé ;
- les mailles ou points de grille effectivement utilisés ;
- les datasets et variables disponibles ;
- les périodes disponibles ;
- la date de récupération ;
- la version ou révision du dataset lorsqu'elle est disponible ;
- l'état de complétude ;
- les références vers les actifs normalisés ;
- les réserves de qualité connues.

Les quatre services scientifiques doivent pouvoir utiliser un snapshot cohérent pour produire
une même fiche. Si plusieurs snapshots sont nécessaires, cette hétérogénéité doit apparaître
dans la provenance de la fiche.

## 6. Quatre services scientifiques

### 6.1 `climate-overview-service`

Question : **À quoi ressemble normalement une année climatique dans cette zone ?**

Responsabilités :

- climatologie annuelle et mensuelle ;
- distribution des variables retenues ;
- indicateurs descriptifs validés ;
- informations de représentativité ;
- signaux utiles à l'explication du climat habituel.

POC de référence : `poc/climat/general/`.

### 6.2 `climate-fingerprint-service`

Question : **Qu'est-ce qui a changé au cours des trente dernières années ?**

Responsabilités :

- calcul des indicateurs de l'empreinte ;
- comparaison de chaque année à sa distribution de référence ;
- classification et intensité visuelle selon la méthode versionnée ;
- conservation des valeurs physiques et des métriques dérivées ;
- signaux de comparaison entre périodes.

POC de référence : `poc/climat/empreinte-climatique/`.

### 6.3 `climate-seasons-service`

Question : **Comment le calendrier thermique s'est-il déplacé ?**

Responsabilités :

- calcul des seuils locaux définis par la méthode ;
- calcul des quatre transitions thermiques ;
- synthèse par période ;
- évolution des dates et durées ;
- contrôles de qualité propres au calcul des transitions.

POC de référence : `poc/climat/saisons/`.

### 6.4 `climate-water-service`

Question : **Comment le cycle hydroclimatique se répartit-il et a-t-il évolué ?**

Responsabilités :

- agrégations hydroclimatiques prévues par la méthode ;
- comparaison entre période de référence et périodes d'étude ;
- conservation explicite du statut modélisé ou dérivé des grandeurs ;
- signaux hydriques interprétables ;
- réserves empêchant la confusion avec nappes, débits observés ou réserve utile lorsque ces
  grandeurs ne sont pas directement mesurées.

POC de référence : `poc/climat/bilan eau/`.

## 7. Contrat commun : `ClimateResult`

Chaque service scientifique devra produire une enveloppe commune dont le détail sera défini
en P4. Les familles de champs attendues sont :

```text
schema_version
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

La section `data` est propre à chaque méthode. Les autres sections doivent employer des
concepts homogènes dans les quatre services.

Cette enveloppe remplace progressivement les schémas hétérogènes des POC actuels.

## 8. `ClimateSignal` : frontière calcul → interprétation

Un `ClimateSignal` est un fait synthétique calculé par un service scientifique afin d'éviter
de demander au modèle de langage de découvrir lui-même la conclusion dans une série brute.

Exemples conceptuels :

```json
{
  "id": "summer-start-shift",
  "direction": "earlier",
  "value": -11,
  "unit": "days",
  "evidence": ["/data/..."],
  "statistical_significance": null
}
```

ou :

```json
{
  "id": "summer-soil-water-change",
  "direction": "lower",
  "value": -18,
  "unit": "mm",
  "evidence": ["/data/..."]
}
```

Un signal ne doit pas masquer l'incertitude. S'il n'existe aucun test statistique, le champ de
significativité doit rester absent ou nul et l'IA ne peut pas utiliser le terme
« statistiquement significatif ».

## 9. Rendu graphique

Le rendu SVG ou HTML est une projection du `ClimateResult`.

Règle stricte :

> **le renderer ne calcule aucun nouvel indicateur scientifique.**

Il peut :

- convertir une valeur déjà calculée en position graphique ;
- appliquer une palette documentée ;
- formater des nombres et dates ;
- construire axes, légendes, annotations et tooltips.

Il ne peut pas :

- recalculer une moyenne climatique ;
- décider qu'un écart constitue une tendance ;
- modifier les seuils scientifiques ;
- remplacer une valeur absente par une estimation non prévue par la méthode.

À terme, une bibliothèque graphique commune pourra harmoniser les quatre infographies sans
mélanger la grammaire visuelle et le calcul scientifique.

## 10. `climate-commentary-service`

Le commentaire IA intervient **après** validation des résultats.

Entrées prévues :

- `ClimateResult` ou une projection contrôlée de celui-ci ;
- `ClimateSignal[]` ;
- `method.id` et `method.version` ;
- les règles correspondantes de `interpretation.md` ;
- les réserves de qualité et de représentativité.

Le service ne doit pas utiliser comme source primaire :

- les fichiers NetCDF/GRIB bruts ;
- une capture de l'infographie ;
- l'ensemble non filtré de la documentation climat ;
- une recherche Web libre pendant l'interprétation d'une fiche.

Le commentaire doit pouvoir associer ses affirmations importantes aux signaux qui les
justifient.

## 11. `climate-sheet-service`

Le service d'orchestration doit :

1. recevoir le lieu demandé ;
2. obtenir ou créer le snapshot nécessaire ;
3. appeler les quatre analyses ;
4. vérifier la conformité de leurs résultats ;
5. déclencher les rendus ;
6. demander les commentaires ;
7. produire un manifeste de fiche ;
8. publier uniquement une fiche complète ou explicitement qualifiée comme partielle.

Il ne doit pas embarquer les équations propres aux quatre méthodes.

## 12. Structure logique d'une fiche produite

Exemple cible :

```text
climate-sheet/
├── manifest.json
├── overview/
│   ├── result.json
│   ├── figure.svg
│   └── commentary.json
├── fingerprint/
│   ├── result.json
│   ├── figure.svg
│   └── commentary.json
├── seasons/
│   ├── result.json
│   ├── figure.svg
│   └── commentary.json
├── water/
│   ├── result.json
│   ├── figure.svg
│   └── commentary.json
└── synthesis-commentary.json
```

Cette structure est informative à ce stade ; le contrat de persistance sera fixé ultérieurement.

## 13. Niveaux de preuve

Le système distingue trois niveaux :

```text
SOURCE VALUE
valeur provenant du dataset ou de la réanalyse
        ↓
DERIVED VALUE / SIGNAL
valeur ou signal calculé de manière déterministe par OpenDataVal
        ↓
INTERPRETATION
formulation destinée au lecteur, éventuellement produite par l'IA
```

Aucune interprétation ne doit modifier rétroactivement la valeur ou le signal.

## 14. Défaillances et données manquantes

Les règles communes sont :

- ne jamais fabriquer une valeur pour compléter une infographie ;
- conserver la dernière donnée valide seulement lorsque la politique du produit l'autorise et
  en exposant sa date ;
- différencier `missing`, `incomplete`, `invalid`, `not_applicable` et autres états nécessaires ;
- permettre une fiche partielle seulement si le manifeste indique précisément quels blocs
  manquent et pourquoi ;
- ne pas demander à l'IA de masquer une absence de donnée par une explication plausible.

## 15. Sécurité et exploitation

Les secrets de collecte restent confinés à la couche d'acquisition. Les services de calcul, de
rendu et d'interprétation ne doivent pas recevoir de clé CDS.

Les calculs d'une fiche ne doivent pas déclencher en cascade des téléchargements non bornés.
La stratégie détaillée de cache, de rétention et de planification sera définie avec le contrat
`ClimateSnapshot`.

## 16. Migration depuis les POC

La migration d'un POC vers son service suit une règle de non-régression :

1. extraire la méthode réellement implémentée ;
2. résoudre les contradictions documentaires ;
3. figer une fixture ou un golden master ;
4. implémenter le nouveau service ;
5. comparer les résultats ;
6. documenter toute différence ;
7. valider ;
8. seulement ensuite archiver le POC.

La migration ne doit pas être l'occasion de changer simultanément la méthode scientifique.
Une évolution méthodologique doit faire l'objet d'une nouvelle version distincte.