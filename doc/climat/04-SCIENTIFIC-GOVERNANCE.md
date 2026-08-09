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

- observation instrumentale ;
- réanalyse ;
- produit dérivé ;
- statistique OpenDataVal calculée à partir d'un dataset ;
- estimation ou correction explicitement modélisée.

Le vocabulaire de restitution doit respecter cette nature.

Une valeur de réanalyse sur une maille ne devient pas une « mesure sur place » parce qu'une
fiche a été demandée pour une coordonnée précise.

Une grandeur dérivée ne devient pas un phénomène directement observé parce qu'elle est
présentée dans une infographie.

## 7. Représentativité spatiale

La qualité scientifique d'une fiche ne se limite pas à la présence d'une valeur.

Chaque analyse doit exposer suffisamment d'informations pour distinguer :

- le lieu demandé ;
- le point ou la maille réellement utilisé ;
- la résolution du produit ;
- le nombre de mailles utilisées lorsque la méthode réalise une agrégation spatiale ;
- la méthode de pondération éventuelle ;
- les écarts pertinents entre site et représentation du modèle, par exemple l'altitude
  lorsqu'elle est disponible et méthodologiquement utile.

Le commentaire IA doit recevoir cette information et adapter sa formulation.

## 8. Qualité et complétude

Les quatre méthodes devront adopter un vocabulaire commun pour les états de données. Le détail
sera fixé dans le contrat commun, mais les principes sont déjà obligatoires :

- une absence de donnée reste une absence de donnée ;
- une série incomplète ne doit pas être rendue complète par invention ;
- les seuils minimaux de complétude appartiennent à la méthode et doivent être documentés ;
- un résultat dégradé doit porter un statut explicite ;
- une dernière valeur valide réutilisée doit conserver sa date et son statut de fraîcheur.

## 9. Résultats descriptifs et inférence statistique

Le système doit distinguer une **comparaison descriptive** d'une **inférence statistique**.

Exemple descriptif :

> la médiane 2016–2025 est supérieure à la médiane 1996–2005 de X unité(s).

Cette phrase peut être produite si X est calculé par la méthode.

En revanche, les formulations suivantes nécessitent une méthode statistique explicitement
implémentée et documentée :

- « tendance statistiquement significative » ;
- « augmentation significative » au sens statistique ;
- intervalle de confiance ;
- probabilité qu'une tendance soit réelle.

L'absence de test statistique doit rester visible dans le résultat ou dans ses métadonnées.
L'IA ne peut pas déduire une significativité à l'œil à partir d'une infographie.

## 10. Causalité et attribution

Les quatre infographies principales décrivent un climat, son évolution ou des changements de
régime. Elles ne constituent pas, par elles-mêmes, une étude d'attribution causale.

Sauf méthode d'attribution ajoutée et documentée ultérieurement, le service IA ne doit pas
transformer automatiquement :

> « la période récente est plus chaude »

en :

> « le changement climatique anthropique a causé cette hausse locale ».

Une relation avec le changement climatique global peut être contextualisée seulement selon des
règles et sources explicitement prévues par la couche d'interprétation.

## 11. Gouvernance des `ClimateSignal`

Un `ClimateSignal` est produit par le calcul, pas par le LLM.

Pour être utilisable dans un commentaire, un signal devra préciser au minimum :

- un identifiant stable ;
- la métrique concernée ;
- la comparaison effectuée ;
- la valeur et l'unité lorsque pertinentes ;
- la direction ;
- la ou les références vers les valeurs qui le justifient ;
- le statut de qualité ;
- le statut statistique lorsqu'il existe.

Un signal doit rester descriptif lorsqu'aucune méthode ne justifie un niveau d'interprétation
plus fort.

## 12. Gouvernance de l'IA

Le service de commentaire est une couche de formulation et de synthèse. Il n'a pas autorité
pour modifier le résultat scientifique.

### L'IA peut

- reformuler un signal en langage accessible ;
- hiérarchiser plusieurs signaux selon des règles explicites ;
- rapprocher des signaux de plusieurs infographies lorsque leurs méthodes autorisent cette
  mise en relation ;
- rappeler les réserves de représentativité ;
- produire une synthèse de fiche à partir de signaux validés.

### L'IA ne peut pas, seule

- calculer un indicateur absent du résultat ;
- modifier un seuil ;
- imputer une valeur manquante ;
- conclure à une significativité statistique non calculée ;
- transformer une corrélation ou concomitance en causalité ;
- présenter une maille de réanalyse comme une mesure ponctuelle locale ;
- assimiler une humidité de sol modélisée à une nappe phréatique ;
- assimiler un ruissellement de modèle à un débit observé ;
- inventer une source ou une référence ;
- choisir arbitrairement entre deux versions contradictoires de documentation.

## 13. `interpretation.md` par méthode

Chaque méthode validée devra fournir un fichier `interpretation.md` contenant au minimum :

```text
# Signaux interprétables
# Formulations autorisées
# Formulations interdites ou à éviter
# Réserves obligatoires
# Cas ambigus
# Conditions de non-interprétation
```

Ce fichier doit être suffisamment précis pour construire le contexte d'un modèle sans lui
fournir l'intégralité du corpus documentaire.

## 14. Traçabilité d'un commentaire

Une affirmation substantielle du commentaire doit être reliée à la preuve qui la soutient.

Le futur contrat de commentaire devra permettre une structure du type :

```json
{
  "text": "L'été thermique commence plus tôt dans la période récente.",
  "signal_ids": ["summer-start-shift"],
  "confidence": "supported"
}
```

Un commentaire qui contient une affirmation factuelle importante sans signal ou valeur de
preuve doit pouvoir être refusé ou marqué comme non supporté.

## 15. Rendu éditorial et vérité scientifique

Le choix d'une forme graphique appartient à la restitution éditoriale, sauf lorsque la forme
encode directement une définition méthodologique documentée.

Le renderer peut améliorer la lisibilité mais ne doit pas :

- exagérer un écart en changeant silencieusement l'échelle ;
- cacher une absence de donnée ;
- utiliser une palette dont le sens contredit la légende ;
- modifier une classification calculée ;
- introduire un seuil visuel qui serait interprété comme un seuil scientifique sans le
  documenter.

Toute transformation visuelle non triviale qui porte du sens doit être décrite dans la méthode
ou la documentation éditoriale correspondante.

## 16. Changement de méthode

Toute proposition modifiant une méthode validée doit contenir :

1. le problème identifié ;
2. la version affectée ;
3. la nouvelle règle proposée ;
4. la justification scientifique ou méthodologique ;
5. l'impact attendu sur les résultats historiques ;
6. les fixtures concernées ;
7. le niveau de version proposé ;
8. une entrée de changelog.

Le changement de méthode et la migration technique doivent autant que possible être réalisés
dans des travaux séparés afin de rendre les écarts auditables.

## 17. Critères de validation d'une méthode

Avant de passer de `draft` à `validated`, vérifier :

- [ ] question scientifique claire ;
- [ ] dataset et variables identifiés ;
- [ ] période de référence explicitée ;
- [ ] sélection spatiale explicitée ;
- [ ] formules et agrégations documentées ;
- [ ] valeurs manquantes traitées explicitement ;
- [ ] qualité et représentativité exposées ;
- [ ] limites scientifiques écrites ;
- [ ] règles d'interprétation disponibles ;
- [ ] au moins un résultat de référence reproductible ;
- [ ] contrat de sortie validé ;
- [ ] tests de non-régression disponibles ;
- [ ] changelog initialisé.

## 18. Règle de gel des POC pendant la migration

Pendant P0–P5, les quatre POC sont conservés comme références de migration.

Le ménage dans `poc/climat/` peut supprimer ultérieurement les caches, sorties générées,
captures redondantes et artefacts d'outils, mais il ne doit pas faire disparaître une
implémentation ou une fixture nécessaire pour établir l'équivalence avec le futur service.

Un POC peut être archivé lorsque :

1. sa méthode canonique est `validated` ;
2. un golden master existe ;
3. le nouveau service passe les tests d'équivalence ;
4. les écarts éventuels sont documentés ;
5. la documentation pointe vers le service maintenu.

## 19. Prochaine étape après P0

P1 doit construire le registre commun des sources :

- `doc/climat/02-DATA-SOURCES.md` ;
- `doc/climat/sources/datasets.yaml` ;
- `doc/climat/sources/bibliography.yaml`.

P1 devra vérifier les sources officielles et fixer pour chaque dataset son identifiant,
producteur, type, résolution, temporalité, variables utilisées, conditions d'accès, licence et
limites utiles aux quatre méthodes.