# Méthode — L’eau au fil de l’année

## Objet

Cette infographie décrit le contexte hydroclimatique de la maille de réanalyse associée à un lieu. Elle compare les profils mensuels 1996–2005 et 2016–2025, sur une période étudiée de 1996 à 2025. La climatologie de référence est 1991–2020.

## Sources et représentativité

Les précipitations, l’humidité volumique du sol et l’évaporation proviennent d’ERA5-Land ; SPEI-3 provient d’ERA5-Drought. Le JSON publie le point demandé, le point de grille, la résolution, les altitudes disponibles, la version et la date de récupération. Une maille de réanalyse n’est pas une mesure sur le terrain, notamment en relief complexe.

## Agrégations

Les précipitations sont converties de mètres en millimètres puis sommées par mois. L’évaporation ERA5-Land suit la convention ECMWF : le flux sortant est négatif ; la variable publique `actual_evapotranspiration_mm` est donc `-total_evaporation × 1000` et est sommée par mois. SPEI-3 reste une valeur mensuelle, sans somme ni moyenne quotidienne.

Pour chaque mois de calendrier et chaque décennie, le pipeline conserve P25, médiane et P75. Un mois ERA5-Land est null lorsqu’il contient moins de 90 % de jours valides. Les valeurs SPEI mensuelles absentes ou dupliquées sont nulles.

## Stock de sol dérivé

Le **stock d’eau modélisé 0–100 cm** est un indicateur dérivé OpenDataVdA :

`1000 × (0,07 × θ1 + 0,21 × θ2 + 0,72 × θ3)`

avec les couches ERA5-Land 0–7 cm, 7–28 cm et 28–100 cm. Il est moyenné dans le mois. Il ne représente ni la réserve utile, ni l’eau effectivement disponible pour les plantes, ni une observation locale de l’humidité du sol. Sa couleur est la position du stock dans la distribution du même mois de la référence 1991–2020.

## Indicateurs comparatifs

Le bloc de droite présente : le changement relatif de médiane des cumuls annuels de précipitation ; le changement de médiane du stock moyen JJA ; et le changement du nombre médian de mois annuels avec SPEI-3 inférieur à −1. Les comparaisons sont toujours « 2016–2025 moins 1996–2005 ».

## Limites

Le ruissellement est une variable secondaire et n’est jamais appelé débit de rivière. L’infographie ne calcule ni recharge de nappe, ni débit observé, ni disponibilité en eau potable, ni besoins d’irrigation. En particulier, `P − ET` n’est pas assimilé à une recharge de nappe.
