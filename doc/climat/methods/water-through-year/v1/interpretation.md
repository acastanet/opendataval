# Interprétation — L'eau au fil de l'année V1

Statut : **P3 — règles d'interprétation**.

Méthode : `water-through-year@1.0.0`.

Question : **Comment le cycle hydroclimatique se répartit-il et a-t-il évolué ?**

## 1. Principe

Cette méthode décrit quatre composantes hydroclimatiques :

- précipitations ;
- évapotranspiration réelle issue d'ERA5-Land ;
- stock d'eau modélisé 0–100 cm dérivé des trois premières couches de sol ERA5-Land ;
- SPEI-3.

Elle ne mesure ni la recharge des nappes, ni le débit des cours d'eau, ni la réserve utile agricole.

## 2. Signaux autorisés

### `water-annual-precipitation-change`

Source : `annual_precip_change_pct`.

Formulation autorisée :

> « La médiane des cumuls annuels de précipitations est X % plus élevée / plus faible en 2016–2025 qu'en 1996–2005. »

Toujours parler de **comparaison entre périodes**.

Interdit :

- « les précipitations diminuent de X % par décennie » ;
- « la ressource en eau diminue de X % ».

### `water-summer-soil-water-change`

Source : `summer_soil_water_change_mm`.

Formulation autorisée :

> « Le stock d'eau modélisé 0–100 cm est inférieur / supérieur de X mm en été dans la décennie récente. »

Le mot **modélisé** est obligatoire dans toute phrase isolée.

Interdit :

- « réserve utile » ;
- « eau disponible pour les plantes » ;
- « humidité mesurée sur la parcelle » ;
- « niveau de nappe ».

### `water-dry-months-change`

Source : `dry_months_change` avec définition `SPEI-3 < -1`.

Formulation autorisée :

> « La décennie récente présente une médiane de X mois secs SPEI-3 de plus / de moins par an. »

Ou :

> « Les mois de déficit météorologique définis par SPEI-3 < -1 sont plus / moins fréquents dans la période récente. »

Interdit :

- « X mois de sécheresse des sols » ;
- « X mois de pénurie d'eau » ;
- « X mois de sécheresse hydrologique ».

### `water-monthly-precipitation-shift`

Un signal peut être émis pour un mois de calendrier si la comparaison des médianes décennales est calculée explicitement.

Formulation autorisée :

> « En octobre, la médiane des précipitations mensuelles est plus élevée dans la décennie récente. »

Ne pas généraliser automatiquement un mois à toute la saison ou à l'année.

### `water-monthly-soil-water-position`

Source : position du stock 0–100 cm dans la distribution du même mois de la référence 1991–2020.

Formulation autorisée :

> « Pour ce mois, le stock modélisé se situe dans la partie basse / haute de sa distribution de référence. »

Interdit : transformer le percentile en probabilité de sécheresse ou en niveau de risque.

### `water-evapotranspiration-cycle`

Le service peut décrire les mois où l'évapotranspiration réelle modélisée est habituellement la plus forte.

Formulation autorisée :

> « L'évapotranspiration réelle modélisée atteint ses valeurs les plus élevées au cours de ... »

Interdit : assimiler directement cette variable à l'évapotranspiration potentielle ou aux besoins d'irrigation.

## 3. Lecture combinée

L'IA peut rapprocher des signaux de précipitation, de stock de sol et de SPEI-3, mais seulement en décrivant leur coïncidence.

Exemple autorisé :

> « La décennie récente combine un stock d'eau modélisé estival plus faible et davantage de mois sous le seuil SPEI-3 retenu. »

Interdit :

> « La baisse des précipitations provoque l'assèchement des sols. »

sans méthode causale dédiée.

## 4. Caveats obligatoires

### `modelled-soil-water-not-reserve-utile`

> « Le stock 0–100 cm est une grandeur dérivée des couches de sol ERA5-Land ; il ne correspond ni à une réserve utile agricole ni à une mesure locale de l'eau disponible pour les plantes. »

### `spei3-meteorological-drought`

> « SPEI-3 décrit un déficit climatique sur trois mois ; il ne mesure pas directement l'état des nappes ou des cours d'eau. »

### `gridded-reanalysis`

> « Les valeurs décrivent les mailles de réanalyse associées au lieu et non des mesures effectuées sur la parcelle. »

### `descriptive-not-trend`

> « Les écarts comparent deux périodes ; aucun test de tendance statistique n'est appliqué dans cette méthode. »

## 5. Variables secondaires

Les variables optionnelles `runoff`, `surface_runoff`, `sub_surface_runoff`, `snowfall`, `snowmelt` et `snow_depth_water_equivalent` ne deviennent interprétables que si un `ClimateSignal` spécifique est défini.

En particulier :

- `runoff` ne doit jamais être nommé débit de rivière ;
- `surface_runoff` ne prouve pas une crue ;
- `snowfall` de réanalyse n'est pas une hauteur de neige observée au sol.

## 6. Expressions interdites

Sans données complémentaires :

- recharge de nappe ;
- niveau de nappe ;
- débit de rivière ;
- risque de crue ;
- eau potable disponible ;
- besoin d'irrigation ;
- réserve utile ;
- humidité réelle de la parcelle ;
- sécheresse agricole ou hydrologique ;
- causalité climatique locale.

## 7. Qualité et abstention

L'IA doit s'abstenir pour un mois ou une métrique lorsque :

- le résultat est `null` ;
- la règle de complétude n'est pas satisfaite ;
- SPEI-3 comporte une valeur mensuelle absente ou invalide ;
- la comparaison annuelle ne dispose pas d'années complètes ;
- le signal scientifique n'a pas été émis.

Un mois incomplet n'est jamais interprété comme sec, humide ou sans événement.

## 8. Hiérarchie recommandée

Pour un commentaire court :

1. rythme annuel des précipitations ;
2. évolution éventuelle du stock d'eau modélisé en été ;
3. fréquence des mois SPEI-3 secs ;
4. évapotranspiration comme contexte explicatif descriptif, sans causalité.

## 9. Exemple conforme

> « Le cycle annuel reste marqué par de fortes différences saisonnières. Entre 1996–2005 et 2016–2025, le stock d'eau modélisé 0–100 cm en été est inférieur de X mm et la médiane du nombre de mois avec SPEI-3 < -1 évolue de Y mois par an. Ces indicateurs décrivent un contexte hydroclimatique de réanalyse : ils ne mesurent ni la réserve utile, ni les nappes, ni le débit des rivières. »

Les valeurs X et Y doivent être directement fournies par des `ClimateSignal` validés.
