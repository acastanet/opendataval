# Fondements scientifiques — Water Through Year V1

Statut : **P2 — méthode extraite, encore `draft`**.

## 1. Question

> **Comment le cycle hydroclimatique se répartit-il au fil de l'année et comment a-t-il évolué entre les décennies récentes ?**

L'infographie ne cherche pas à reconstituer toute l'hydrologie locale. Elle décrit quatre dimensions climatiques complémentaires :

- précipitations ;
- eau modélisée dans les couches de sol 0–100 cm ;
- évapotranspiration réelle modélisée ;
- sécheresse météorologique via SPEI-3.

## 2. Nature des données

Les trois premières grandeurs proviennent d'ERA5-Land. SPEI-3 provient d'ERA5-Drought.

Il s'agit de réanalyses maillées. Elles décrivent le contexte hydroclimatique de la maille associée au lieu, et non une observation directe sur la parcelle, dans un captage, une rivière ou une nappe.

## 3. Précipitations

La source est `total_precipitation` d'ERA5-Land.

Pour le produit mensuel `monthly_averaged_reanalysis`, les accumulations hydrologiques sont exprimées comme une moyenne journalière mensuelle en mètres d'eau équivalente par jour. Le cumul mensuel est donc obtenu en multipliant par le nombre de jours du mois et par 1000 pour obtenir des millimètres.

Cette règle est documentée par ECMWF et correspond au calcul actuel du POC.

## 4. Stock d'eau modélisé 0–100 cm

ERA5-Land décrit l'humidité volumique du sol dans plusieurs couches. La méthode utilise :

```text
0–7 cm
7–28 cm
28–100 cm
```

Pour chaque instant ou agrégation mensuelle, OpenDataVal calcule :

```text
stock_0_100_mm
= 1000 × (0,07 × θ1 + 0,21 × θ2 + 0,72 × θ3)
```

où `θ` est l'humidité volumique en m³/m³.

Cette conversion exprime une hauteur d'eau équivalente dans le premier mètre de sol modélisé.

### Limite sémantique

Cet indicateur est une **grandeur dérivée OpenDataVal à partir du modèle**. Il ne représente pas :

- la réserve utile agronomique ;
- l'eau réellement accessible aux plantes ;
- une mesure locale d'humidité ;
- la quantité d'eau d'une nappe.

Ces distinctions devront être reprises explicitement par le service IA.

## 5. Évapotranspiration réelle

ERA5-Land appelle `total_evaporation` la somme des composantes d'évaporation/transpiration représentées par le modèle.

La convention ECMWF des flux verticaux considère le sens descendant comme positif. Une évaporation vers l'atmosphère apparaît donc généralement avec un signe négatif.

OpenDataVal affiche une grandeur positive :

```text
actual_evapotranspiration = -total_evaporation
```

Puis la même conversion mensuelle des accumulations est appliquée :

```text
m/jour × 1000 × nombre de jours
```

La grandeur ne doit pas être confondue avec l'évapotranspiration potentielle.

## 6. SPEI-3

La sécheresse est décrite à partir de l'indice SPEI fourni par ERA5-Drought avec une fenêtre d'accumulation de trois mois.

SPEI est un indice standardisé qui tient compte à la fois des précipitations et de la demande évaporative. Des valeurs négatives correspondent à des conditions plus sèches que la référence du produit ; des valeurs positives à des conditions plus humides.

ERA5-Drought utilise 1991–2020 comme période de référence et fournit différentes fenêtres d'accumulation. OpenDataVal retient ici **3 mois** pour représenter un déficit à l'échelle saisonnière.

## 7. Profils mensuels

Pour chacun des douze mois et pour chacune des trois décennies :

```text
1996–2005
2006–2015
2016–2025
```

la méthode calcule :

- P25 ;
- médiane ;
- P75.

La même statistique est calculée sur 1991–2020 pour la référence mensuelle.

Cette organisation est importante : janvier est comparé à des janvier, juillet à des juillet. Elle préserve la forte saisonnalité de l'eau.

## 8. Position relative du stock de sol

La méthode calcule aussi, pour chaque valeur de stock 0–100 cm, sa position empirique dans la distribution du même mois de calendrier pendant 1991–2020.

Cette position sert à la restitution et ne transforme pas l'indicateur en mesure agronomique.

## 9. Comparaison 1996–2005 / 2016–2025

Trois grandeurs synthétiques sont retenues.

### Précipitations annuelles

1. somme des douze mois pour chaque année ;
2. médiane des années de chaque décennie ;
3. variation relative entre décennie tardive et précoce.

### Eau modélisée du sol en été

1. moyenne JJA du stock 0–100 cm pour chaque année ;
2. médiane par décennie ;
3. différence tardive moins précoce en millimètres.

### Mois secs

Une année est complète pour cette métrique si ses douze valeurs SPEI-3 sont présentes.

Un mois est compté comme sec lorsque :

```text
SPEI-3 < -1
```

Le nombre annuel de mois secs est calculé, puis la médiane de chaque décennie. Le résultat final est la différence entre les deux médianes.

Cette métrique n'est pas la même que celle utilisée par l'empreinte climatique, qui emploie un P10 mensuel relatif pour construire sa ligne annuelle de sécheresse.

## 10. Ce que l'infographie permet de décrire

Elle peut soutenir des formulations telles que :

- le cycle annuel des précipitations est concentré sur certaines saisons ;
- le stock modélisé 0–100 cm atteint ses niveaux les plus bas à telle période de l'année ;
- la médiane estivale du stock modélisé diffère entre les deux décennies ;
- le nombre médian de mois avec SPEI-3 < -1 a changé ;
- l'évapotranspiration modélisée suit un cycle saisonnier distinct de celui des précipitations.

## 11. Ce qu'elle ne permet pas de conclure

Sans données ou modèle supplémentaires, l'infographie ne permet pas d'affirmer :

- qu'une nappe se recharge davantage ou moins ;
- qu'un cours d'eau a un débit donné ;
- qu'une ressource en eau potable est suffisante ;
- qu'une plante dispose de telle quantité d'eau ;
- que `P - ET` correspond à la recharge de nappe ;
- qu'une valeur de ruissellement ERA5-Land correspond au débit observé d'une rivière ;
- qu'un changement descriptif entre deux décennies constitue une tendance statistiquement significative.

## 12. Références principales

- WMO — Climatological Normals : https://wmo.int/wmo-climatological-normals
- Copernicus CDS — ERA5-Land monthly averaged data : https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land-monthly-means
- ECMWF — ERA5-Land data documentation : https://confluence.ecmwf.int/pages/viewpage.action?pageId=402639006
- ECMWF — conversion des variables accumulées : https://confluence.ecmwf.int/pages/viewpage.action?pageId=272324919
- Copernicus CDS — ERA5-Drought : https://cds.climate.copernicus.eu/datasets/derived-drought-historical-monthly
- Vicente-Serrano, S. M., Beguería, S. & López-Moreno, J. I. (2010), *A Multiscalar Drought Index Sensitive to Global Warming: The Standardized Precipitation Evapotranspiration Index*, Journal of Climate, DOI 10.1175/2009JCLI2909.1.
