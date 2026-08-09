# Interprétation — L'empreinte climatique du lieu V4

Statut : **P3 — règles d'interprétation**.

Méthode : `climate-fingerprint@4.0.0`.

Question : **Qu'est-ce qui a changé au cours des trente dernières années ?**

## 1. Principe

Le commentaire doit expliquer les différences descriptives visibles sur 1996–2025 relativement à la référence 1991–2020 et à la comparaison `1996–2005` / `2016–2025`.

Il ne doit jamais transformer cette comparaison en test de tendance ou en attribution causale.

## 2. Signaux autorisés

### `fingerprint-temperature-decadal-change`

Source : comparaison de `annual_mean_2m_temperature`.

Émission si les deux décennies disposent du nombre minimal d'années valides prévu par la méthode.

Champs attendus :

```text
value = late_mean - early_mean
unit = degC
direction = higher | lower | stable
claim_level = descriptive
```

Formulation autorisée :

> « La température moyenne annuelle est plus élevée de X °C en 2016–2025 qu'en 1996–2005. »

Formulations interdites :

> « La température augmente de X °C par décennie. »

> « Le réchauffement est statistiquement significatif. »

### `fingerprint-utci-decadal-change`

Source : comparaison du P95 annuel des maxima quotidiens UTCI.

Formulation autorisée :

> « Le niveau caractéristique des journées les plus chaudes selon l'UTCI est plus élevé dans la décennie récente. »

Préciser si nécessaire qu'il s'agit du P95 annuel des maxima UTCI quotidiens, pas de la température de l'air.

Interdit : assimiler directement UTCI à la température ressentie par chaque individu ou à un diagnostic sanitaire local.

### `fingerprint-precipitation-decadal-change`

Source : comparaison des cumuls annuels de précipitations.

Valeur principale : différence relative entre moyennes décennales telle que définie par la méthode V4.

Formulation autorisée :

> « Les cumuls annuels moyens de précipitations sont X % plus élevés / plus faibles dans la décennie récente. »

Si l'amplitude est faible ou si la variabilité interannuelle domine visuellement, préférer une formulation prudente :

> « Les cumuls annuels restent très variables ; la comparaison des deux décennies montre un écart de X %. »

Interdit :

> « Les précipitations suivent une tendance nette à la baisse. »

sans méthode de tendance dédiée.

### `fingerprint-heavy-rain-frequency-change`

Source : nombre annuel de jours dépassant le P95 des jours humides 1991–2020.

Formulation autorisée :

> « La décennie récente compte en moyenne X jours de plus / de moins par an au-dessus du seuil local de pluies intenses de référence. »

Toujours parler de **jours dépassant le seuil P95 des jours humides dans la réanalyse**.

Interdit :

- appeler la métrique `R95p` ou `R95pTOT` ;
- conclure à une augmentation des crues ;
- déduire l'intensité d'un épisode cévenol local à l'échelle d'une parcelle.

### `fingerprint-drought-frequency-change`

Source : nombre annuel de mois dont SPEI-3 est inférieur au P10 du même mois de calendrier sur 1991–2020.

Formulation autorisée :

> « La période récente présente en moyenne davantage de mois classés parmi les situations SPEI-3 les plus sèches de la référence locale. »

Interdit :

- parler directement d'humidité du sol ;
- parler de nappe, de débit ou de disponibilité en eau ;
- employer « sécheresse agricole » ou « hydrologique » sans donnée dédiée.

Le signal décrit une sécheresse météorologique standardisée fondée sur SPEI-3.

### `fingerprint-strong-wind-frequency-change`

Source : nombre annuel de jours dont le maximum quotidien du vent à 10 m dépasse le P98 1991–2020.

Formulation autorisée :

> « La décennie récente compte X jours de plus / de moins par an au-dessus du seuil de vent fort défini par la réanalyse. »

Interdit :

- « les tempêtes augmentent » ;
- nommer une tempête sans source externe ;
- présenter le vent ERA5-Land comme une mesure à l'abri, sur une crête ou dans une rue donnée.

## 3. Signaux annuels de position relative

Le service scientifique peut émettre un signal lorsqu'une année se situe dans une classe extrême de la distribution de référence :

```text
very_low
very_high
```

ou lorsqu'elle dépasse le niveau d'exceptionnalité graphique défini par V4.

L'IA doit conserver la distinction :

- **classe scientifique relative** : fondée sur les quantiles de référence ;
- **intensité de couleur** : convention éditoriale OpenDataVal fondée sur l'écart standardisé robuste.

Une cellule rouge ne signifie ni « danger », ni « mauvaise année ».

Exemple autorisé :

> « 2023 se situe très haut dans la distribution de référence pour cet indicateur. »

Interdit :

> « 2023 est une année climatiquement dangereuse. »

## 4. Événements candidats

Les annotations automatiques `heat`, `heavy_rain`, `drought` et `wind` restent des **candidats détectés dans la réanalyse**.

Formulations autorisées :

- « épisode de stress thermique exceptionnel dans la réanalyse » ;
- « épisode de pluie extrême dans la réanalyse » ;
- « séquence SPEI-3 exceptionnellement sèche » ;
- « épisode de vent exceptionnel dans la réanalyse ».

Sans source d'observation ou d'impact complémentaire, interdiction d'écrire :

- crue ;
- inondation ;
- tempête nommée ;
- incendie ;
- catastrophe ;
- dégâts.

## 5. Signal de synthèse

Le futur service peut calculer des signaux de synthèse à partir des six métriques, mais **l'indice graphique `Empreinte bilan` V4 n'est pas un indice scientifique universel**.

L'IA ne doit pas dire :

> « L'indice climatique du lieu est de 72 %. »

Elle peut dire :

> « Plusieurs indicateurs se situent simultanément au-dessus de leur référence cette année. »

uniquement si un `ClimateSignal` structuré fournit explicitement les indicateurs concernés.

## 6. Hiérarchie du commentaire

Ordre recommandé :

1. température / UTCI si un déplacement thermique clair est calculé ;
2. eau : précipitations, pluie intense, SPEI-3 ;
3. vent ;
4. une phrase sur la variabilité lorsque les indicateurs ne vont pas tous dans le même sens.

Ne jamais chercher à produire artificiellement un récit cohérent lorsque les signaux sont mixtes.

## 7. Caveats obligatoires

### `gridded-reanalysis`

À inclure lorsque le commentaire peut être lu comme une mesure locale :

> « Ces résultats décrivent le contexte climatique des mailles de réanalyse associées au lieu, pas une mesure à l'échelle de la parcelle. »

### `descriptive-not-trend`

À inclure lorsqu'une comparaison de décennies est interprétée :

> « La comparaison est descriptive ; aucun test de tendance statistique n'est utilisé dans cette méthode. »

### `mixed-spatial-resolution`

Lorsque plusieurs métriques sont rapprochées, rappeler si pertinent que ERA5-Land et les indices dérivés n'ont pas la même résolution de grille.

## 8. Conditions d'abstention

Ne pas produire de constat sur une métrique si :

- le nombre minimal d'années de référence n'est pas atteint ;
- une décennie possède moins de huit années valides ;
- la valeur ou la comparaison est `null` ;
- la provenance ou le point représenté manque ;
- le service scientifique n'émet pas le `ClimateSignal` correspondant.

## 9. Assertions explicitement interdites

Sans méthode ou source supplémentaire :

- attribution au changement climatique ;
- significativité statistique ;
- prédiction future ;
- impact sur la santé ;
- impact agricole ;
- risque de crue ;
- risque incendie ;
- dégâts liés au vent ;
- précision à l'échelle de la dalle OpenDataVal.

## 10. Exemple de commentaire conforme

> « Le signal principal est thermique : la température moyenne annuelle de 2016–2025 est plus élevée que celle de 1996–2005. Le P95 annuel des maxima UTCI quotidiens se déplace dans le même sens. Les précipitations annuelles restent en revanche très variables d'une année à l'autre, et la comparaison entre décennies doit être lue comme descriptive. Ces résultats décrivent les mailles de réanalyse associées au lieu, non des mesures effectuées sur la parcelle. »

Chaque phrase quantitative devra, dans le futur `ClimateCommentary`, référencer les `signal_id` qui la supportent.
