# Fondements scientifiques — Climate Overview V1

Statut : **P2 — méthode extraite, encore `draft`**.

## 1. Question

> **À quoi ressemble normalement une année climatique dans cette zone ?**

Cette première infographie est un portrait climatologique. Elle décrit le rythme annuel habituel avant toute analyse de changement climatique.

Elle ne compare pas les décennies et ne produit pas de tendance.

## 2. Période de référence

La référence est **1991–2020**, période reconnue par la WMO comme normale climatologique standard de trente ans.

Cette référence est utilisée pour décrire le climat contemporain de la zone.

## 3. Source principale

La V1 repose sur ERA5-Land :

- température de l'air à 2 m ;
- précipitations totales.

ERA5-Land est une réanalyse maillée. Elle combine un modèle physique et des informations issues de la réanalyse atmosphérique ERA5. Elle ne constitue pas une station météorologique locale.

## 4. Une zone, pas forcément un point

Cette infographie se distingue des trois autres par son besoin explicite de supporter une géométrie :

- point ;
- polygone ;
- multipolygone.

Lorsqu'une zone intersecte plusieurs cellules ERA5-Land, les grandeurs intensives sont agrégées avec des poids proportionnels aux surfaces d'intersection.

Pour une variable `X` :

```text
X_zone(t) = Σ wi × Xi(t)
```

avec :

```text
wi = aire(zone ∩ cellule_i) / somme des aires d'intersection
```

Les surfaces doivent être calculées dans un système adapté aux aires et non directement en degrés géographiques.

Le POC utilise EPSG:6933 pour cette opération.

## 5. Température mensuelle

Pour chaque année de référence et chaque mois : calculer la température moyenne mensuelle.

Pour chacun des douze mois sur 1991–2020, conserver :

- moyenne ;
- P10 ;
- médiane P50 ;
- P90.

La série centrale du climatogramme est la **moyenne mensuelle climatologique**. P10–P90 représente la variabilité interannuelle habituelle du même mois.

## 6. Précipitations mensuelles

Pour chaque année et chaque mois : calculer le cumul de précipitations.

Pour chacun des douze mois sur 1991–2020, conserver :

- moyenne ;
- P10 ;
- P50 ;
- P90.

La hauteur de précipitation d'une zone couvrant plusieurs cellules doit être **moyennée spatialement**, pas additionnée entre cellules. Les millimètres décrivent une hauteur d'eau sur chaque maille.

## 7. Valeurs synthétiques

Le POC actuel expose :

- température moyenne annuelle ;
- précipitations annuelles ;
- mois le plus chaud ;
- mois le plus froid ;
- mois le plus humide ;
- mois le plus sec.

Ces valeurs sont cohérentes avec l'objectif de portrait annuel. L'agrégation exacte utilisée pour les deux valeurs annuelles devra être couverte par un golden master avant passage en `validated` afin d'éviter toute divergence entre moyenne quotidienne annuelle et combinaison des douze statistiques mensuelles.

## 8. Représentativité spatiale

La méthode doit conserver :

- géométrie demandée ;
- surface ;
- centroïde ;
- nombre de cellules climatiques ;
- coordonnées des cellules ;
- poids spatiaux ;
- résolution des données.

Une petite zone ne devient pas une mesure haute résolution parce qu'elle est dessinée précisément.

Lorsque la zone est plus petite qu'une maille, la formulation correcte est de parler du **contexte climatique du lieu**.

## 9. Relief

En terrain montagneux, une maille de réanalyse peut lisser des contrastes altitudinaux importants.

La V1 ne réalise pas de descente d'échelle ni de correction automatique par gradient altitudinal.

L'altitude locale et l'orographie du modèle peuvent être publiées comme information de représentativité, mais une correction altitudinale constituerait une méthode scientifique distincte à documenter et valider.

## 10. Indicateurs thermiques extrêmes : décision P2

Le POC expose actuellement :

```text
frost_days_mean
hot_days_30c_mean
tropical_nights_20c_mean
```

Les définitions souhaitées sont légitimes :

```text
jour de gel       : Tmin < 0 °C
jour >= 30 °C     : Tmax >= 30 °C
nuit >= 20 °C     : Tmin >= 20 °C
```

Mais la méthodologie actuelle précise que, pour accélérer le POC, ces valeurs peuvent être approximées à partir de la **température moyenne quotidienne** lorsque Tmin/Tmax ne sont pas téléchargées.

Cette approximation change la définition physique de l'indicateur.

Décision P2 :

> **ces trois indicateurs ne font pas partie du noyau scientifique canonique V1 tant qu'ils ne sont pas calculés à partir de vrais minima/maxima quotidiens.**

Ils pourront être réintroduits avec une source et une méthode explicites.

## 11. Neige, vent, humidité, rayonnement

Les instructions initiales envisagent ces variables comme extensions adaptatives.

Elles ne sont pas nécessaires au noyau V1 actuellement implémenté et ne doivent pas être inventées lorsqu'elles ne sont pas disponibles.

Chaque ajout devra être documenté comme extension de méthode ou nouvelle version selon son impact.

## 12. Climatogramme

La restitution recommandée combine :

- une courbe de température moyenne mensuelle ;
- une enveloppe P10–P90 ;
- des barres de précipitations moyennes mensuelles ;
- deux axes explicitement étiquetés.

Il ne faut pas imposer une relation graphique arbitraire entre °C et mm. Une règle ombrothermique éventuelle constituerait une méthode particulière et devrait être citée comme telle.

## 13. Ce que l'infographie permet de dire

Elle permet de décrire :

- les mois habituellement les plus chauds ou froids ;
- les mois habituellement les plus secs ou humides ;
- l'amplitude du cycle annuel ;
- la variabilité interannuelle habituelle d'un mois ;
- le contexte climatologique d'une zone relativement à la grille ERA5-Land.

## 14. Ce qu'elle ne permet pas de dire

Elle ne permet pas à elle seule :

- de conclure à une évolution climatique ;
- d'attribuer une cause à un changement ;
- de transformer la réanalyse en mesure de station ;
- de prétendre à une précision de parcelle ;
- de compter correctement gel, nuits tropicales ou jours ≥30 °C à partir de moyennes quotidiennes.

## 15. Références

- WMO — Climatological Normals : https://wmo.int/wmo-climatological-normals
- Copernicus CDS — ERA5-Land : https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land-timeseries
- Muñoz-Sabater, J. et al. (2021), *ERA5-Land: a state-of-the-art global reanalysis dataset for land applications*, Earth System Science Data, DOI 10.5194/essd-13-4349-2021.
