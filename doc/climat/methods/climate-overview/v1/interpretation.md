# Interprétation — Le climat de la zone V1

Statut : **P3 — règles d'interprétation**.

Méthode : `climate-overview@1.0.0`.

Question : **À quoi ressemble normalement une année climatique dans cette zone ?**

## 1. Principe

Cette infographie décrit le **climat habituel de référence 1991–2020**.

Elle n'a pas pour fonction de décrire une évolution, une tendance ou un changement récent.

Le commentaire doit présenter le rythme annuel de la température et des précipitations avant toute autre analyse climatique.

## 2. Signaux autorisés

### `overview-annual-mean-temperature`

Source : `mean_temperature_c` une fois son agrégation exacte figée par P5.

Formulation autorisée :

> « La température moyenne annuelle de référence est de X °C dans la réanalyse associée à la zone. »

Interdit :

> « La température de la zone est X °C. »

sans mention du caractère climatologique et de réanalyse lorsque le contexte n'est pas déjà explicite.

### `overview-annual-precipitation`

Source : cumul annuel climatologique.

Formulation autorisée :

> « Le cumul annuel moyen de précipitations sur 1991–2020 est d'environ X mm. »

Interdit : assimiler ce cumul à une ressource en eau disponible.

### `overview-warmest-month`

Source : `warmest_month`.

Formulation autorisée :

> « Juillet est le mois le plus chaud du cycle climatologique, avec une moyenne de X °C. »

Le signal décrit une moyenne mensuelle climatologique, pas un maximum de température.

### `overview-coldest-month`

Source : `coldest_month`.

Formulation autorisée :

> « Janvier est le mois le plus froid du cycle climatologique. »

Ne pas en déduire un nombre de jours de gel.

### `overview-wettest-month`

Source : `wettest_month`.

Formulation autorisée :

> « Octobre présente le cumul mensuel moyen de précipitations le plus élevé. »

Interdit :

> « Octobre est le mois où les inondations sont les plus fréquentes. »

### `overview-driest-month`

Source : `driest_month`.

Formulation autorisée :

> « Juillet présente le cumul mensuel moyen le plus faible. »

Ne pas utiliser automatiquement le terme « saison sèche » à partir du seul mois le plus sec.

### `overview-monthly-temperature-variability`

Source : P10/P50/P90 des valeurs mensuelles 1991–2020.

Formulation autorisée :

> « Les températures de ce mois présentent une variabilité interannuelle marquée / limitée autour de la valeur centrale. »

uniquement si le service scientifique fournit un signal quantifiant cette dispersion.

### `overview-monthly-precipitation-variability`

Même principe pour les cumuls mensuels de précipitations.

La variabilité des précipitations peut être décrite sans la transformer en tendance.

## 3. Signaux spatiaux

### `overview-regional-context`

À émettre lorsque la zone est nettement plus petite que la maille climatique utilisée.

Formulation autorisée :

> « La zone est plus petite que la maille de réanalyse ; les valeurs décrivent donc son contexte climatique régional. »

### `overview-multicell-aggregation`

Lorsque plusieurs mailles sont utilisées :

> « Le portrait climatique résulte d'une moyenne spatiale pondérée de N mailles intersectant la zone. »

Ce signal doit provenir des métadonnées de représentativité et non d'une déduction du LLM.

## 4. Indicateurs non interprétables en V1 canonique

Les sorties POC suivantes ne doivent pas générer de `ClimateSignal` de production tant qu'elles reposent sur une approximation par température moyenne quotidienne :

- `frost_days_mean` ;
- `hot_days_30c_mean` ;
- `tropical_nights_20c_mean`.

L'IA doit les ignorer même si elles existent encore dans une ancienne fixture ou sortie POC.

Pour les réintroduire, le service devra utiliser les vrais minima/maxima quotidiens définis par la méthode correspondante.

Les indicateurs optionnels neige et vent ne sont pas interprétables tant qu'ils ne disposent pas d'une définition canonique et d'un `ClimateSignal` propre.

## 5. Ce que l'IA peut raconter

Le commentaire peut répondre à des questions comme :

- quels sont les mois les plus chauds et les plus froids ?
- quand les précipitations sont-elles habituellement les plus élevées ou les plus faibles ?
- quelle est la forme générale du cycle annuel ?
- quels mois présentent la plus forte variabilité interannuelle, si un signal le mesure ?
- la zone est-elle représentée par une ou plusieurs mailles climatiques ?

## 6. Ce que l'IA ne peut pas raconter

Cette méthode n'autorise pas :

- « le climat se réchauffe » ;
- « les pluies diminuent » ;
- comparaison 1996–2005 / 2016–2025 ;
- attribution au changement climatique ;
- prédiction future ;
- fréquence du gel, de la chaleur ou des nuits tropicales à partir des approximations actuelles ;
- description de canicules ;
- diagnostic hydrologique ;
- précision à l'échelle de la parcelle.

Les changements récents appartiennent à l'empreinte et aux autres infographies.

## 7. Caveats obligatoires

### `reference-climatology`

> « Cette infographie décrit la normale climatologique 1991–2020 ; elle ne constitue pas une analyse d'évolution. »

### `gridded-reanalysis`

> « Les valeurs proviennent d'une réanalyse climatique maillée et non d'une station située exactement sur la zone. »

### `small-zone-regional-context`

À inclure lorsque la zone est plus petite qu'une maille.

### `area-weighted-aggregation`

À inclure ou rendre disponible lorsque plusieurs mailles sont combinées.

## 8. Qualité et abstention

L'IA doit s'abstenir lorsque :

- la statistique mensuelle ou annuelle est `null` ;
- les données de référence sont insuffisantes ;
- la représentativité spatiale est inconnue ;
- un indicateur appartient à `noncanonical_poc_indicators` ;
- aucun `ClimateSignal` correspondant n'a été émis.

## 9. Hiérarchie recommandée

Un commentaire court peut suivre cet ordre :

1. amplitude saisonnière de température ;
2. organisation annuelle des précipitations ;
3. mois le plus chaud/froid et le plus humide/sec ;
4. variabilité interannuelle notable ;
5. caveat spatial si nécessaire.

Le commentaire ne doit pas réciter les douze mois.

## 10. Exemple conforme

> « Le climat de référence 1991–2020 présente un cycle thermique marqué, avec les températures moyennes les plus élevées en juillet et les plus basses en janvier. Les précipitations sont en moyenne maximales en octobre et minimales en juillet, avec une forte variabilité d'une année à l'autre pour certains mois. Ces valeurs proviennent d'une réanalyse maillée et décrivent le contexte climatique de la zone, non des mesures effectuées exactement sur la parcelle. »

Toute valeur numérique éventuelle doit être fournie par un `ClimateSignal` et non recalculée par le modèle de langage.
