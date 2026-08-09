# Fondements scientifiques — Thermal Seasons V1

Statut : **P2 — méthode extraite, encore `draft`**.

## 1. Question

> **Comment les régimes thermiques de l'année se sont-ils déplacés entre le début et la fin des trente dernières années ?**

Cette infographie ne représente pas les saisons météorologiques conventionnelles. Elle représente quatre **saisons thermiques locales** définies à partir du cycle annuel de température du lieu.

## 2. Source

La source est ERA5-Land, variable `2m_temperature`.

ERA5-Land est une réanalyse maillée. Le résultat représente le contexte climatique du point de grille associé au lieu et non une mesure à l'échelle de la dalle OpenDataVal.

## 3. Référence scientifique

La méthode s'inspire de Wang et al. (2021), *Changing Lengths of the Four Seasons by Global Warming*, Geophysical Research Letters, DOI 10.1029/2020GL091753.

Le principe retenu consiste à définir des seuils thermiques relatifs au cycle annuel local :

```text
Hiver      : régime froid sous T25
Printemps  : transition ascendante T25 → T75
Été        : régime chaud au-dessus de T75
Automne    : transition descendante T75 → T25
```

OpenDataVal adapte cette logique à sa référence 1991–2020 et à sa période d'étude 1996–2025.

## 4. Climatologie de référence

À partir des températures horaires ERA5-Land :

1. calculer une température moyenne quotidienne ;
2. supprimer le 29 février ;
3. construire pour chacun des 365 jours une moyenne sur les années 1991–2020 ;
4. calculer T25 et T75 sur les 365 valeurs de cette climatologie quotidienne.

Les deux seuils restent fixes pour toute l'analyse 1996–2025.

Ils ne sont pas recalculés séparément pour chaque décennie, car cela effacerait précisément le déplacement du cycle thermique que l'infographie cherche à rendre visible.

## 5. Pourquoi des seuils relatifs ?

Des seuils absolus identiques pour tous les territoires décriraient mal des climats très différents. Les percentiles T25/T75 ancrent la définition des saisons dans le cycle thermique propre au lieu représenté.

Cette relativité implique une limite importante :

> les dates obtenues sont des frontières de **régimes thermiques relatifs**, pas des dates universelles de printemps, d'été, d'automne ou d'hiver.

## 6. Pourquoi lisser le cycle annuel ?

Une température quotidienne brute peut franchir plusieurs fois un seuil lors d'un épisode météorologique court. Le POC applique donc un polynôme de degré 3 au cycle annuel de chaque année et repère les franchissements sur cette courbe lissée.

Le lissage sert uniquement à déterminer les dates de transition. Il ne remplace pas les températures physiques dans les autres analyses climatiques.

## 7. Les quatre transitions

Les quatre frontières annuelles sont :

```text
spring_start  = premier franchissement ascendant de T25
summer_start  = premier franchissement ascendant de T75
autumn_start  = premier franchissement descendant de T75
winter_start  = premier franchissement descendant de T25
```

L'ordre doit être :

```text
spring < summer < autumn < winter
```

Si cet ordre n'est pas obtenu, l'année n'est pas forcée artificiellement : elle est déclarée invalide pour cette analyse.

## 8. Durée des saisons

Les durées découlent directement des frontières :

```text
printemps = summer_start - spring_start
été       = autumn_start - summer_start
automne   = winter_start - autumn_start
```

L'hiver traverse le changement d'année :

```text
hiver = (365 - winter_start) + spring_start de l'année suivante
```

Si la frontière de printemps suivante manque, la durée d'hiver reste inconnue.

## 9. Comparaison des décennies

Les années sont regroupées en :

```text
1996–2005
2006–2015
2016–2025
```

Pour chaque date de transition et chaque durée, le produit conserve :

- P25 ;
- médiane ;
- P75.

Le déplacement principal est :

```text
médiane(2016–2025) - médiane(1996–2005)
```

Une valeur négative pour une date de début signifie un début plus précoce ; une valeur positive signifie un début plus tardif.

Cette comparaison est descriptive. Elle ne constitue pas à elle seule un test statistique de tendance.

## 10. Contrôles de qualité

La méthode impose :

- au moins 18 observations horaires valides pour produire la moyenne d'un jour ;
- au moins 98 % de jours valides avant interpolation pour accepter une année ;
- interpolation uniquement des lacunes de deux jours consécutifs maximum ;
- conservation du nombre de jours interpolés ;
- calcul d'un RMSE entre courbe brute et courbe lissée.

Ces règles sont des choix OpenDataVal destinés à rendre la méthode reproductible et auditée.

## 11. Interprétation correcte

La méthode peut soutenir des formulations du type :

- « l'été thermique médian commence plus tôt dans la décennie récente » ;
- « la durée médiane de l'été thermique est plus longue » ;
- « la frontière thermique d'automne est décalée de X jours ».

Elle ne soutient pas automatiquement :

- « l'été météorologique commence plus tôt » ;
- « les plantes démarrent leur saison X jours plus tôt » ;
- « le changement est statistiquement significatif » ;
- « ce déplacement local est causé par telle cause précise ».

Les formulations exactes seront définies en P3.

## 12. Références

- Wang, J. et al. (2021), *Changing Lengths of the Four Seasons by Global Warming*, Geophysical Research Letters, DOI 10.1029/2020GL091753.
- WMO — Climatological Normals : https://wmo.int/wmo-climatological-normals
- Copernicus CDS — ERA5-Land hourly time-series : https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land-timeseries
