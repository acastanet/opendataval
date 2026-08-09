# Interprétation — Les saisons se déplacent V1

Statut : **P3 — règles d'interprétation**.

Méthode : `thermal-seasons@1.0.0`.

Question : **Comment les régimes thermiques de l'année se sont-ils déplacés ?**

## 1. Principe

La méthode compare des **saisons thermiques locales** définies par les seuils T25/T75 du climat de référence 1991–2020.

Elle ne décrit pas les saisons météorologiques fixes DJF/MAM/JJA/SON, ni les saisons astronomiques, ni la phénologie observée.

## 2. Signaux autorisés

### `thermal-spring-start-shift`

Source : `spring_start_shift_days`.

```text
value < 0  -> earlier
value > 0  -> later
unit = days
claim_level = descriptive
```

Formulation autorisée :

> « Le début médian du printemps thermique se situe X jours plus tôt / plus tard en 2016–2025 qu'en 1996–2005. »

Interdit :

> « Le printemps commence X jours plus tôt. »

sans l'adjectif **thermique**.

### `thermal-summer-start-shift`

Source : `summer_start_shift_days`.

Formulation autorisée :

> « Le début médian de l'été thermique se situe X jours plus tôt dans la décennie récente. »

Interdit :

- assimiler le résultat au 21 juin ;
- parler de saison touristique ;
- parler de phénologie végétale.

### `thermal-autumn-start-shift`

Source : `autumn_start_shift_days`.

Formulation autorisée :

> « Le début médian de l'automne thermique se situe X jours plus tard / plus tôt. »

### `thermal-winter-start-shift`

Source : `winter_start_shift_days`.

Formulation autorisée :

> « Le début médian de l'hiver thermique se situe X jours plus tard / plus tôt. »

Ne pas transformer ce signal en nombre de jours de gel.

### `thermal-summer-length-change`

Source : `summer_length_change_days`.

Formulation autorisée :

> « La durée médiane de l'été thermique est plus longue / plus courte de X jours dans la période récente. »

Interdit :

> « Il y a X jours de canicule supplémentaires. »

La durée thermique ne mesure pas les canicules.

### `thermal-season-length-change`

Des signaux analogues peuvent être émis pour printemps, automne et hiver si les deux périodes disposent de données suffisantes.

Pour l'hiver, l'IA doit respecter le fait que la durée dépend du début du printemps de l'année suivante. Une valeur `null` ne doit jamais être convertie en zéro.

## 3. Dispersion

Les statistiques décennales contiennent P25, médiane et P75.

L'IA peut utiliser cette dispersion pour qualifier la variabilité, par exemple :

> « Les dates varient sensiblement d'une année à l'autre autour de cette médiane. »

mais uniquement si un signal ou un champ structuré fournit l'amplitude correspondante.

Elle ne doit pas déduire de significativité statistique de l'absence de chevauchement visuel entre deux intervalles P25–P75.

## 4. Sens des déplacements

La convention doit rester stable :

```text
shift_days = median(late) - median(early)
```

Donc :

- valeur négative = date plus précoce ;
- valeur positive = date plus tardive.

Le service scientifique doit fournir `direction`; le LLM ne doit pas recalculer le signe.

## 5. Caveats obligatoires

### `thermal-not-meteorological-season`

À inclure dans tout commentaire susceptible d'être lu hors contexte :

> « Il s'agit de saisons thermiques locales définies à partir de seuils de température, et non des saisons météorologiques fixes. »

### `gridded-reanalysis`

> « Les dates sont calculées à partir de la réanalyse ERA5-Land associée au lieu, pas à partir d'une station située exactement sur la parcelle. »

### `descriptive-not-trend`

Pour une comparaison entre décennies :

> « Le déplacement décrit ici compare deux périodes ; la méthode ne réalise pas de test de tendance statistique. »

## 6. Qualité et abstention

Ne pas produire un signal annuel si :

- moins de 18 valeurs horaires valides sont disponibles pour trop de jours ;
- l'année n'atteint pas 98 % de jours valides avant interpolation ;
- les franchissements T25/T75 sont manquants ;
- l'ordre `spring < summer < autumn < winter` n'est pas respecté.

Ne pas produire un commentaire comparatif si la médiane d'une des périodes n'est pas calculable.

Les jours interpolés servent uniquement au lissage dans les limites prévues par la méthode ; l'IA n'a pas à les présenter comme des observations.

## 7. Assertions interdites

Sans méthode supplémentaire, interdiction d'affirmer :

- une tendance statistiquement significative ;
- une attribution au changement climatique local ;
- un changement de saison météorologique ou astronomique ;
- un changement de floraison, de migration ou de cycle agricole ;
- une augmentation des canicules ;
- une diminution du gel ;
- une précision à l'échelle de la dalle.

## 8. Combinaisons de signaux

Si `summer_start` est plus précoce et `autumn_start` plus tardif, et si `summer_length_change` confirme l'allongement, l'IA peut écrire :

> « L'été thermique médian s'étend sur une période plus longue dans la décennie récente, avec un début plus précoce et/ou une fin plus tardive. »

Elle ne doit pas construire cette conclusion uniquement à partir de deux valeurs si le signal de durée n'est pas disponible ou si les données qualité sont insuffisantes.

## 9. Exemple conforme

> « Entre 1996–2005 et 2016–2025, le début médian de l'été thermique se décale de X jours vers une date plus précoce, tandis que sa durée médiane augmente de Y jours. Ces saisons sont définies localement par les seuils T25/T75 du cycle thermique 1991–2020 ; elles ne correspondent pas aux saisons météorologiques fixes. La comparaison est descriptive et ne constitue pas à elle seule un test de tendance. »

Les valeurs X et Y doivent provenir exclusivement des `ClimateSignal` émis par le service scientifique.
