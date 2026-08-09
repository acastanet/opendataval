# Gouvernance scientifique du domaine climat

Statut : **règles P0 applicables à la migration et aux futurs services**.

Ce document définit comment OpenDataVal distingue une source scientifique, un choix
méthodologique, une implémentation technique, un rendu éditorial et une interprétation. Il
établit aussi les conditions minimales permettant de faire évoluer une méthode sans perdre la
traçabilité de la fiche climat.

## 1. Principe de séparation

Chaque résultat climatique doit pouvoir être expliqué selon cinq couches distinctes :

1. **source scientifique** — dataset, publication, standard ou documentation de référence ;
2. **méthode OpenDataVal** — choix exact retenu pour répondre à une question donnée ;
3. **implémentation technique** — code qui exécute cette méthode ;
4. **restitution éditoriale** — choix de représentation SVG/HTML ;
5. **interprétation** — commentaire destiné au lecteur, éventuellement produit par une IA.

Une décision appartenant à une couche ne doit pas être présentée comme si elle provenait d'une
autre.

Exemple : une palette rouge/bleu peut être un choix éditorial OpenDataVal ; elle ne doit pas
être présentée comme une convention imposée par Copernicus si aucune source ne l'établit.

## 2. Autorité documentaire

Lorsqu'une méthode a été extraite et validée sous `doc/climat/methods/`, son dossier versionné
est la source normative de cette méthode.

Ordre d'autorité cible :

1. `doc/climat/methods/<method>/<version>/method.yaml` ;
2. `science.md` et `technical.md` de la même version ;
3. contrat JSON de sortie ;
4. fixtures / golden masters validés ;
5. code du service ;
6. rendu graphique ;
7. commentaire IA.

`interpretation.md` fait autorité sur ce que le système de commentaire peut affirmer à partir
de la méthode, mais ne peut modifier la méthode elle-même.

Pendant la phase de migration P0–P2, les POC existants restent des matériaux de référence. Si
deux documents existants se contredisent, l'agent doit :

1. identifier explicitement la contradiction ;
2. vérifier ce que le code actuel calcule réellement ;
3. rechercher la justification scientifique nécessaire si la résolution l'exige ;
4. proposer la résolution ;
5. consigner la décision dans la méthode canonique.

Il est interdit de réconcilier silencieusement deux versions incompatibles.

## 3. Statut d'une méthode

Chaque `method.yaml` devra porter un statut explicite parmi au minimum :

- `draft` — méthode en cours d'extraction ou de conception ;
- `validated` — méthode approuvée pour produire des fiches ;
- `deprecated` — encore reproductible mais à ne plus utiliser pour de nouvelles fiches ;
- `archived` — conservée uniquement pour reproduire ou comprendre des sorties historiques.

Une fiche publiée doit conserver l'identifiant et la version exacte de chaque méthode utilisée.

## 4. Versionnement des méthodes

Les méthodes suivent un versionnement sémantique adapté au calcul scientifique :

```text
MAJOR.MINOR.PATCH
```

### Changement MAJOR

Nécessaire lorsqu'une modification peut changer l'interprétation scientifique ou les valeurs de
manière structurelle, par exemple :

- changement d'indicateur ;
- changement de période de référence ;
- modification des seuils scientifiques ;
- changement de définition d'une saison ;
- changement du principe de normalisation d'une empreinte ;
- substitution d'un dataset par un autre non équivalent.

### Changement MINOR

Utilisé pour une extension compatible, par exemple :

- ajout d'un signal dérivé qui ne modifie pas les résultats existants ;
- ajout d'une information de qualité ;
- ajout d'une variable optionnelle sans changement de la méthode principale.

### Changement PATCH

Utilisé pour une correction sans modification intentionnelle du résultat scientifique, par
exemple :

- correction documentaire ;
- correction d'un libellé ;
- correction de sérialisation ;
- correction de renderer sans changement de `ClimateResult`.

Si un correctif de code change les résultats de référence, son statut de PATCH doit être
réévalué et la différence documentée.

## 5. Une méthode doit être reproductible

Pour être `validated`, une méthode doit documenter au minimum :

- la question à laquelle elle répond ;
- les datasets et variables nécessaires ;
- les unités sources et unités de sortie ;
- les périodes de référence et d'étude ;
- la sélection spatiale ;
- les agrégations temporelles ;
- les formules et seuils ;
- le traitement des années bissextiles lorsque pertinent ;
- le traitement des valeurs manquantes ;
- les critères de complétude ;
- les principales limites ;
- les tests ou résultats de référence permettant de détecter une régression.

Une méthode qui dépend d'un comportement implicite du code sans le documenter reste `draft`.

## 6. Distinguer observation, réanalyse et grandeur dérivée

Chaque résultat doit conserver la nature de sa donnée.

Exemples de catégories à supporter :

- `observation` — mesure instrumentale ou observation de terrain ;
- `reanalysis` — valeur issue d'une réanalyse maillée ;
- `derived_reanalysis_index` — indice calculé à partir d'une réanalyse ;
- `derived_opendataval` — grandeur calculée par OpenDataVal à partir de données sources.

Le commentaire ne doit pas transformer une réanalyse en observation locale.

Une grandeur `derived_opendataval` doit documenter la formule qui la produit et conserver les
variables dont elle dépend.

## 7. Source scientifique et interface d'acquisition

À partir de P2, le domaine distingue explicitement :

```text
famille scientifique + variable
```

et :

```text
produit / interface / format utilisé pour acquérir la donnée lors d'une exécution
```

Un changement d'interface d'acquisition n'impose pas automatiquement une nouvelle version
MAJOR de la méthode si la grandeur scientifique, la représentativité, les unités et le résultat
restent équivalents. Cette équivalence doit toutefois être démontrée par un test de référence.

Le `ClimateSnapshot` doit conserver le produit concret, sa version ou édition disponible, ses
paramètres de requête et la date de récupération. La méthode canonique conserve la famille de
données et les variables dont son calcul dépend.

Si le changement d'actif modifie les valeurs ou la représentativité au-delà des tolérances
validées, il devient une évolution méthodologique et doit être versionné en conséquence.

## 8. Représentativité spatiale

La précision géométrique d'une demande utilisateur ne doit jamais être confondue avec la
résolution de la source climatique.

Chaque résultat devra distinguer au minimum :

```text
requested
represented
```

Le premier décrit le lieu ou la zone demandée. Le second décrit le point de grille, les cellules
ou l'agrégation spatiale réellement utilisés.

Une donnée maillée de plusieurs kilomètres ne doit pas être décrite comme une mesure à 100 m,
même lorsque la fiche appartient à une dalle de 100 × 100 m du jumeau numérique.

Toute descente d'échelle constitue une méthode supplémentaire qui doit être documentée et
versionnée.

## 9. Qualité et valeurs manquantes

Une valeur manquante ou insuffisamment complète reste inconnue.

Il est interdit de :

- remplacer une donnée absente par zéro sans justification scientifique ;
- extrapoler silencieusement une année incomplète ;
- masquer une lacune par le renderer ;
- demander au modèle de langage de deviner une valeur manquante.

Les règles de complétude et les interpolations autorisées appartiennent à chaque méthode et
doivent être explicitement documentées.

## 10. Observé, dérivé, signal, interprétation

Le domaine applique la hiérarchie suivante :

```text
donnée source
   ↓
valeur normalisée
   ↓
valeur dérivée
   ↓
ClimateSignal
   ↓
interprétation
```

Un `ClimateSignal` est une assertion structurée produite par un calcul déterministe. Exemple :

```text
summer_start_shift_days = -9
```

avec la sémantique :

```text
negative = earlier
```

Le modèle de langage ne doit pas recalculer ce déplacement depuis le graphique.

## 11. Statistiques descriptives et tendance

Une différence entre deux périodes n'est pas automatiquement une tendance statistiquement
significative.

Les termes tels que :

- `tendance` ;
- `significatif` ;
- `augmentation robuste` ;
- `accélération` ;

doivent être liés à une méthode qui calcule effectivement le test ou l'indicateur nécessaire.

Si le service ne calcule qu'une différence de moyennes ou de médianes entre deux décennies,
le commentaire doit parler de **comparaison descriptive entre périodes**.

## 12. Causalité et attribution

Les quatre infographies décrivent des états, distributions, écarts et évolutions climatiques.
Elles ne constituent pas en elles-mêmes une étude d'attribution.

Sans méthode d'attribution dédiée, le système ne doit pas conclure automatiquement :

```text
« cet événement a été causé par le changement climatique »
```

ou attribuer un phénomène à une cause locale particulière.

## 13. Événements et impacts

Une anomalie climatique n'est pas automatiquement un impact territorial.

Par exemple :

- précipitation extrême ≠ crue observée ;
- vent extrême ≠ tempête nommée ;
- sécheresse climatique ≠ restriction d'eau ;
- chaleur ≠ impact sanitaire observé ;
- danger de feu ≠ incendie réel.

Les noms d'événements et les impacts nécessitent des sources événementielles adaptées.

## 14. Séparation calcul / rendu

Le renderer peut transformer un résultat en SVG ou HTML, mais ne doit pas produire de nouvelle
information scientifique.

Il peut :

- positionner des éléments ;
- choisir une palette documentée ;
- construire une légende ;
- afficher une valeur déjà calculée ;
- produire une infobulle.

Il ne peut pas :

- calculer une moyenne scientifique ;
- recalculer un percentile ;
- modifier un seuil ;
- décider qu'une valeur est significative ;
- générer un signal absent du `ClimateResult`.

Une transformation exclusivement visuelle doit être identifiée comme telle dans la méthode.

## 15. Gouvernance du commentaire IA

Le service de commentaire doit recevoir une version de méthode résolue explicitement.

Il ne doit pas chercher librement parmi plusieurs documents pour décider quelle méthode est
applicable.

Entrée conceptuelle :

```text
ClimateResult
ClimateSignal[]
method.id
method.version
interpretation.md correspondant
```

Chaque affirmation factuelle importante du commentaire doit pouvoir être reliée à un ou
plusieurs `signal_ids`.

Le LLM peut :

- reformuler ;
- hiérarchiser ;
- rapprocher plusieurs signaux compatibles ;
- expliquer une limite déjà documentée.

Il ne peut pas :

- créer une nouvelle valeur ;
- inventer une significativité ;
- inventer une causalité ;
- masquer une qualité insuffisante ;
- augmenter artificiellement la précision spatiale ;
- interpréter une catégorie visuelle comme un danger lorsqu'elle signifie seulement « plus de
  la variable ».

## 16. Conditions de non-interprétation

Le futur `interpretation.md` de chaque méthode devra préciser les situations dans lesquelles le
service IA doit s'abstenir ou limiter son commentaire, par exemple :

- données insuffisantes ;
- métrique `null` ;
- période trop incomplète ;
- représentativité trop faible pour l'affirmation envisagée ;
- contradiction entre deux signaux ;
- absence du test nécessaire à un mot comme « tendance ».

L'abstention explicite est préférable à une conclusion spéculative.

## 17. Golden masters

Avant de remplacer un POC par un microservice, des sorties de référence doivent être figées.

Le test d'équivalence compare le nouveau service au résultat validé du POC. Les tolérances
doivent être documentées variable par variable.

Une migration ne doit pas devenir une occasion de changer simultanément :

- la source ;
- la méthode ;
- le format ;
- le rendu ;
- l'interprétation.

Si un changement scientifique est souhaité, il doit être réalisé dans une version de méthode
explicite après que l'équivalence a été établie.

## 18. Cycle de validation

Cycle recommandé :

```text
POC
 ↓
extraction de la méthode
 ↓
statut draft
 ↓
revue scientifique / technique
 ↓
contrat et fixture
 ↓
test de reproductibilité
 ↓
statut validated
 ↓
production
```

Une méthode `deprecated` reste reproductible afin de comprendre les anciennes fiches.

## 19. Revue des références

Le registre `doc/climat/sources/bibliography.yaml` distingue la documentation de dataset, les
standards et les publications scientifiques.

Lorsqu'une information externe susceptible d'évoluer est nécessaire à la production, sa version
ou sa date de consultation doit être conservée autant que possible dans la documentation ou la
provenance d'exécution.

Une URL seule n'est pas une justification scientifique suffisante pour un choix méthodologique :
le dossier de méthode doit expliquer **quel élément de la source est repris** et **quelle partie
relève d'une adaptation OpenDataVal**.

## 20. Définition de `validated`

Une méthode ne peut être marquée `validated` que lorsque :

1. ses sources sont identifiées ;
2. les variables et unités sont explicites ;
3. les périodes sont figées ;
4. les calculs sont décrits sans dépendance implicite au code ;
5. la représentativité spatiale est explicite ;
6. les règles de qualité sont testées ;
7. les limites scientifiques sont documentées ;
8. les règles d'interprétation sont écrites ;
9. un résultat de référence ou golden master existe ;
10. le code reproduit ce résultat dans les tolérances définies.
