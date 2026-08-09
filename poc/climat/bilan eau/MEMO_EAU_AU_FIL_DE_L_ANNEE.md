# Mémo — « L’eau au fil de l’année »

## Objet

Ce mémo définit la manière de présenter **le cycle climatique de l’eau autour d’un lieu** dans OpenDataVal.

Il complète les trois premières lectures déjà retenues pour la page climat :

1. **Le climat du lieu** — à quoi ressemble une année habituelle ?
2. **L’empreinte climatique du lieu** — qu’est-ce qui a changé au cours des trente dernières années ?
3. **Les saisons se déplacent** — comment le calendrier thermique s’est-il déplacé ?

La quatrième lecture devient :

> # **L’eau au fil de l’année**
>
> **Quand l’eau arrive-t-elle, combien le sol en conserve-t-il, quand repart-elle vers l’atmosphère et quand le déficit s’installe-t-il ?**

L’objectif n’est pas de produire un bilan hydrologique exhaustif, ni de décrire directement le débit d’un cours d’eau ou le niveau d’une nappe. Il s’agit de montrer **la composante hydroclimatique du lieu**, à partir de réanalyses climatiques cohérentes sur plusieurs décennies.

La question éditoriale centrale est :

> **Une quantité annuelle de pluie comparable signifie-t-elle encore la même disponibilité saisonnière en eau ?**

---

# 1. Introduction indispensable — représentativité du lieu

Avant toute visualisation de l’eau, la page doit expliciter ce que représentent réellement les données.

## 1.1 Les données climatiques sont des données de grille

La source principale proposée est **ERA5-Land**, produite par ECMWF dans le cadre de Copernicus Climate Change Service.

ERA5-Land possède une résolution native d’environ **9 km** et est distribuée dans le CDS sur une grille régulière de **0,1° × 0,1°**.

Le produit « time-series » du CDS sélectionne automatiquement **le point de grille le plus proche** lorsque la coordonnée demandée ne correspond pas exactement à un nœud de la grille.

Références :

- Copernicus CDS — ERA5-Land  
  https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land-timeseries
- Copernicus Knowledge Base — Product User Guide ERA5-Land time series  
  https://confluence.ecmwf.int/pages/viewpage.action?navigatingVersions=true&pageId=536226587
- Muñoz-Sabater et al. (2021), *ERA5-Land: a state-of-the-art global reanalysis dataset for land applications*  
  https://doi.org/10.5194/essd-13-4349-2021

La visualisation doit donc parler de :

> **contexte hydroclimatique du lieu**

ou :

> **conditions hydroclimatiques de la maille de réanalyse associée au lieu**

et non de :

> « quantité d’eau mesurée exactement sur la parcelle »  
> « humidité réelle du sol de ce terrain »  
> « ruissellement observé à cet endroit précis ».

---

## 1.2 ERA5-Land est une réanalyse et un modèle de surface

ERA5-Land repose sur le modèle de surface terrestre H-TESSEL et utilise le forçage atmosphérique ERA5.

Le papier de référence précise qu’ERA5-Land **n’assimile pas directement des observations du sol** : les observations influencent le produit au travers du forçage atmosphérique ERA5.

Cela signifie que :

- les précipitations sont issues du système de réanalyse ;
- l’humidité du sol est un état modélisé ;
- l’évapotranspiration est modélisée ;
- le ruissellement est modélisé ;
- la neige et la fonte sont modélisées.

Ces variables sont cohérentes physiquement entre elles, mais elles ne doivent jamais être confondues avec des mesures locales.

Référence :

- Muñoz-Sabater et al. (2021)  
  https://doi.org/10.5194/essd-13-4349-2021

---

## 1.3 Le relief est un point de vigilance majeur

La représentativité est particulièrement importante dans les régions :

- montagneuses ;
- à forte exposition ;
- présentant de grandes différences d’altitude sur quelques kilomètres ;
- littorales ;
- présentant des contrastes vallée / versant / crête.

Le papier ERA5-Land montre que les sites de montagne peuvent présenter des biais liés au **lissage de l’orographie** à la résolution de la réanalyse. La résolution plus fine d’ERA5-Land améliore généralement la représentation par rapport à ERA5, mais elle ne supprime pas ce problème.

La documentation ECMWF signale également que certaines différences locales liées à l’orographie ou aux zones côtières peuvent apparaître dans les champs.

Références :

- Muñoz-Sabater et al. (2021)  
  https://doi.org/10.5194/essd-13-4349-2021
- ERA5-Land data documentation  
  https://confluence.ecmwf.int/pages/viewpage.action?pageId=462894807

### Conséquence pour OpenDataVal

Ne pas appliquer de correction altitudinale naïve aux variables d’eau.

Une correction de température par gradient vertical peut parfois être discutée ; elle ne peut pas être transposée automatiquement à :

- la pluie ;
- l’humidité du sol ;
- l’évapotranspiration ;
- le ruissellement.

---

## 1.4 Diagnostic de représentativité à conserver

Pour chaque résultat, OpenDataVal devrait conserver au minimum :

```text
coordonnées du lieu
coordonnées du point ERA5-Land effectivement utilisé
résolution de la grille
version du dataset
date de récupération
altitude du lieu si disponible
orographie / altitude représentative du modèle si disponible
écart altitudinal
```

Pour les terrains complexes, une amélioration importante consiste à récupérer également les **points de grille voisins** afin de calculer une sensibilité spatiale.

Il ne s’agit pas de les moyenner automatiquement.

L’objectif est de savoir si :

> **le résultat dépend fortement de la maille choisie.**

Un diagnostic possible :

```text
maille principale
+ 4 ou 8 mailles voisines
→ dispersion des valeurs mensuelles
→ indicateur de sensibilité spatiale
```

Le papier ERA5-Land utilise lui-même la dispersion entre plusieurs points proches dans l’analyse de certains sites montagneux. Cette approche constitue donc une bonne base de contrôle.

---

## 1.5 Comparaison avec les observations locales

Lorsqu’une station météorologique pertinente existe, une comparaison peut être réalisée sur :

- précipitations mensuelles ;
- éventuellement température et neige.

Cette comparaison doit être utilisée comme :

> **contrôle de représentativité**

et non comme mécanisme automatique de « correction » de la réanalyse.

Les données de :

- cours d’eau ;
- nappes ;
- piézomètres ;
- ONDE ;
- Vigicrues ;
- ADES ;

appartiennent à la partie **Hydrosphère** du jumeau numérique.

Elles peuvent compléter la lecture mais ne doivent pas être fusionnées silencieusement avec le graphique climatique.

---

# 2. Pourquoi l’eau doit avoir sa propre infographie

La pluie seule ne décrit pas l’état hydrique d’un lieu.

Le cycle terrestre de l’eau comprend notamment :

- précipitation ;
- infiltration ;
- stockage dans le sol ;
- évaporation ;
- transpiration ;
- ruissellement ;
- stockage neigeux ;
- fonte ;
- transferts vers les eaux de surface et souterraines.

La WMO définit le cycle hydrologique comme une succession d’échanges entre atmosphère, sol, eaux de surface et réservoirs terrestres.

Référence :

- WMO — Water cycle  
  https://community.wmo.int/site/knowledge-hub/programmes-and-initiatives/water-resources-assessment/water-cycle

Le GCOS considère notamment comme **Essential Climate Variables** :

- précipitations ;
- humidité du sol ;
- évaporation terrestre ;
- débit des cours d’eau ;
- stockage terrestre de l’eau ;
- neige.

Références :

- GCOS — Soil Moisture  
  https://gcos.wmo.int/site/global-climate-observing-system-gcos/essential-climate-variables/soil-moisture
- GCOS — Evaporation from Land  
  https://gcos.wmo.int/site/global-climate-observing-system-gcos/essential-climate-variables/evaporation-from-land
- GCOS — Terrestrial Water Storage  
  https://gcos.wmo.int/site/global-climate-observing-system-gcos/essential-climate-variables/terrestrial-water-storage-tws

Le GCOS souligne que l’humidité du sol joue un rôle central dans la séparation de la pluie entre :

- infiltration ;
- ruissellement ;
- flux souterrains ;

et qu’elle contrôle fortement les échanges d’eau et d’énergie entre surface et atmosphère.

La conséquence éditoriale est claire :

> **« Combien a-t-il plu ? » est seulement la première partie de l’histoire.**

---

# 3. Ce que les travaux Copernicus montrent déjà

Copernicus ne traite pas les variables hydrologiques comme une seule variable.

Dans ses Climate Bulletins et dans l’European State of the Climate, C3S juxtapose régulièrement :

- précipitations ;
- humidité du sol ;
- parfois débit des cours d’eau ;
- anomalies et percentiles par rapport à 1991–2020.

Exemple récent :

- Copernicus — *Precipitation, relative humidity, and soil moisture for May 2025*  
  https://climate.copernicus.eu/precipitation-relative-humidity-and-soil-moisture-may-2025

La figure de printemps 2025 compare explicitement :

```text
précipitations
→ humidité du sol
→ débit des cours d’eau
```

avec des catégories fondées sur les distributions de référence.

L’ESOTC 2025 consacre également une section entière à l’humidité du sol et rappelle son rôle dans :

- le cycle de l’eau ;
- les échanges surface-atmosphère ;
- l’absorption de nouvelles précipitations ;
- le ruissellement ;
- la sécheresse ;
- le risque de feu.

Référence :

- Copernicus — ESOTC 2025, Soil moisture  
  https://climate.copernicus.eu/esotc/2025/soil-moisture

Cette approche valide le principe OpenDataVal :

> **présenter ensemble l’arrivée d’eau et l’état du stock dans le sol, au lieu de commenter uniquement le cumul de pluie.**

---

# 4. Source principale : ERA5-Land

ERA5-Land fournit directement les variables nécessaires à cette infographie.

## 4.1 Précipitations

Variable :

```text
total_precipitation
```

Unité source :

```text
m d’eau
```

Pour l’affichage :

```text
mm
```

Conversion :

```text
mm = m × 1000
```

---

## 4.2 Humidité du sol

ERA5-Land fournit quatre couches de teneur volumique en eau :

```text
layer 1 :   0–7 cm
layer 2 :   7–28 cm
layer 3 :  28–100 cm
layer 4 : 100–289 cm
```

Variables :

```text
volumetric_soil_water_layer_1
volumetric_soil_water_layer_2
volumetric_soil_water_layer_3
volumetric_soil_water_layer_4
```

Unité :

```text
m³ d’eau / m³ de sol
```

Référence :

- ERA5-Land data documentation  
  https://confluence.ecmwf.int/pages/viewpage.action?pageId=462894807

### Décision proposée pour OpenDataVal

Ne pas utiliser uniquement la couche 0–7 cm pour représenter « la réserve du sol ».

La couche superficielle répond très rapidement :

- aux averses ;
- à l’évaporation ;
- au dessèchement quotidien.

Pour raconter la **mémoire hydrique saisonnière**, une variable plus intéressante est le stock modélisé dans les **0–100 cm**.

Il peut être dérivé des trois premières couches.

---

# 5. Indicateur dérivé — stock d’eau modélisé dans les 0–100 cm

Soient :

```text
θ1 = humidité volumique 0–7 cm
θ2 = humidité volumique 7–28 cm
θ3 = humidité volumique 28–100 cm
```

Les épaisseurs sont :

```text
0,07 m
0,21 m
0,72 m
```

Le stock d’eau équivalent du premier mètre peut être estimé par :

```text
S0-100 =
1000 × (
    0,07 × θ1
  + 0,21 × θ2
  + 0,72 × θ3
)
```

Résultat :

```text
mm d’eau dans le premier mètre de sol modélisé
```

### Formulation à afficher

Préférer :

> **Stock d’eau modélisé dans les 0–100 cm**

ou :

> **Réserve hydrique modélisée du premier mètre**

Ne pas écrire :

> « eau disponible pour les plantes »

car l’eau réellement disponible dépend notamment :

- du type de sol ;
- du point de flétrissement ;
- de la capacité au champ ;
- des racines ;
- des espèces végétales.

Le calcul 0–100 cm est une **construction OpenDataVal**, dérivée des couches ERA5-Land.

Il doit donc être documenté comme tel.

---

# 6. Humidité superficielle : indicateur secondaire

La couche :

```text
0–7 cm
```

reste très utile.

Copernicus l’utilise régulièrement dans ses Climate Bulletins et dans l’ESOTC.

Elle répond plutôt à :

> **« La surface du sol est-elle actuellement humide ou sèche ? »**

Le profil 0–100 cm répond plutôt à :

> **« Le sol conserve-t-il encore de l’eau en profondeur ? »**

La V1 peut utiliser le 0–100 cm dans la figure principale et conserver le 0–7 cm :

- dans le tooltip ;
- dans les données détaillées ;
- comme contrôle complémentaire.

---

# 7. Évapotranspiration réelle

ERA5-Land fournit :

```text
total_evaporation
```

La documentation indique que cette variable correspond à l’évapotranspiration réelle totale, constituée de :

- évaporation du sol nu ;
- évaporation des surfaces d’eau continentales ;
- interception par la canopée ;
- transpiration de la végétation.

Référence :

- ERA5-Land data documentation  
  https://confluence.ecmwf.int/pages/viewpage.action?pageId=462894807

## Convention de signe

La convention ECMWF considère les flux vers le bas comme positifs.

Par conséquent :

```text
évaporation vers l’atmosphère = valeur négative
condensation vers la surface = valeur positive
```

Référence :

- ECMWF Parameter Database — Evaporation, paramètre 182  
  https://codes.ecmwf.int/grib/param-db/182

Pour un affichage public compréhensible, OpenDataVal peut construire :

```text
ETa_display = - total_evaporation
```

puis convertir en millimètres.

Ainsi :

```text
valeur positive = eau renvoyée vers l’atmosphère
```

Ne pas supprimer les rares valeurs correspondant à une condensation nette : elles doivent être conservées dans les données.

---

# 8. Pourquoi ne pas utiliser directement la « potential evaporation » ERA5-Land

ERA5-Land fournit également :

```text
potential_evaporation
```

Mais la documentation ECMWF précise un point important :

> dans ERA5-Land, cette variable correspond à une évaporation potentielle calculée comme une évaporation d’eau libre de type *pan evaporation*.

Elle n’a pas exactement la même définition que dans ERA5 et ne doit pas être assimilée sans précaution à une ET0 agronomique de référence.

ECMWF recommande explicitement de vérifier si sa définition convient à l’application considérée.

Référence :

- ERA5-Land data documentation — Actual and potential evapotranspiration  
  https://confluence.ecmwf.int/pages/viewpage.action?pageId=462894807

### Décision recommandée

**Ne pas mettre la potential evaporation ERA5-Land au centre du graphique public V1.**

Pour représenter le déséquilibre entre apport d’eau et demande atmosphérique, utiliser plutôt **SPEI**.

---

# 9. SPEI — le déficit climatique

Le produit **ERA5-Drought** fournit :

- SPI ;
- SPEI ;

pour des fenêtres de :

```text
1 / 3 / 6 / 12 / 24 / 36 / 48 mois
```

avec une référence :

```text
1991–2020
```

et une grille :

```text
0,25° × 0,25°
```

Le SPEI compare :

```text
apport atmosphérique en eau
P
```

et :

```text
demande atmosphérique potentielle
PET
```

selon la logique :

```text
P − PET
```

Les valeurs sont standardisées :

```text
SPEI > 0 → plus humide que la référence
SPEI < 0 → plus sec que la référence
```

Références :

- Copernicus CDS — ERA5-Drought  
  https://cds.climate.copernicus.eu/datasets/derived-drought-historical-monthly
- Keune et al. (2025), *ERA5–Drought: Global drought indices based on ECMWF reanalysis*  
  https://doi.org/10.1038/s41597-025-04896-y

ERA5-Drought contient également des critères de qualité permettant de vérifier la fiabilité de la standardisation.

---

# 10. SPEI-3 comme indicateur recommandé

Pour « L’eau au fil de l’année », je recommande :

```text
SPEI-3
```

Le SPEI sur trois mois est assez court pour raconter :

- l’installation d’un déficit saisonnier ;
- sa persistance ;
- sa récupération ;

tout en étant moins bruité qu’un indice strictement mensuel.

Il est déjà retenu dans la logique de l’empreinte climatique.

### Dans l’infographie eau

Le SPEI-3 ne doit pas devenir le graphique principal.

Il doit fonctionner comme une **fine bande de déficit climatique** sous les autres variables.

Il répond à :

> **« À ce moment de l’année, les apports d’eau compensent-ils encore la demande climatique ? »**

---

# 11. Ruissellement

ERA5-Land fournit :

```text
surface_runoff
sub_surface_runoff
runoff
```

Ces variables peuvent être utiles pour comprendre la répartition de l’eau.

Mais elles représentent le **ruissellement modélisé de la maille**, pas le débit observé d’un cours d’eau particulier.

La V1 ne doit donc pas transformer :

```text
ERA5-Land runoff
```

en :

> « débit de la rivière ».

### Recommandation

Conserver le ruissellement :

- dans le JSON ;
- dans le tooltip ;
- dans une section détaillée éventuelle.

Ne pas en faire un canal visuel dominant du graphique V1.

Les données de débit observé ou modélisé dans les cours d’eau appartiennent à la partie Hydrosphère, avec des sources adaptées comme les stations hydrométriques ou EFAS selon le niveau de contexte.

---

# 12. Neige et fonte — module adaptatif

ERA5-Land fournit notamment :

```text
snowfall
snowmelt
snow_depth_water_equivalent
snow_cover
```

Dans les zones où la neige joue un rôle hydrologique significatif, ne pas l’ignorer.

Une partie de la précipitation hivernale peut être temporairement stockée sous forme solide puis libérée plus tard lors de la fonte.

Le JRC European Drought Observatory rappelle d’ailleurs que le manteau neigeux et son équivalent en eau sont importants pour la disponibilité saisonnière de l’eau dans les régions concernées.

Référence :

- European Drought Observatory — Drought Indicators  
  https://joint-research-centre.ec.europa.eu/european-and-global-drought-observatories/drought-indicators_en

### Proposition

Le module neige apparaît seulement lorsque le signal est significatif.

Dans ce cas :

- la barre de précipitation peut distinguer pluie et neige ;
- la fonte peut apparaître sous forme d’une petite contribution différée ;
- le tooltip affiche le stock neigeux en équivalent eau.

Ne pas imposer cette complexité aux lieux où la neige est marginale.

---

# 13. Architecture scientifique recommandée de la figure

La figure doit raconter quatre étapes :

```text
ARRIVÉE
   ↓
STOCKAGE DANS LE SOL
   ↓
RETOUR VERS L’ATMOSPHÈRE
   ↓
ÉTAT DE DÉFICIT OU D’EXCÉDENT
```

Les variables associées sont :

| Rôle | Variable principale |
|---|---|
| Arrivée | précipitations |
| Stock | humidité 0–100 cm dérivée |
| Retour atmosphérique | évapotranspiration réelle |
| Déficit climatique | SPEI-3 |
| Complément | ruissellement |
| Adaptatif | neige / fonte |

Ce n’est pas un bilan hydrologique fermé.

Il faut éviter d’écrire visuellement :

```text
P = ET + runoff + stockage
```

comme si toutes les composantes locales observées étaient connues exactement.

La figure montre des **composantes cohérentes du système ERA5/ERA5-Land**, pas une comptabilité locale parfaite de chaque litre d’eau.

---

# 14. Périodes de comparaison

Pour conserver la cohérence avec les autres infographies OpenDataVal :

```text
référence : 1991–2020
période étudiée : 1996–2025
```

Comparaison principale :

```text
1996–2005
vs
2016–2025
```

La période :

```text
2006–2015
```

reste disponible dans les données, même si elle n’est pas nécessairement affichée.

---

# 15. Agrégations mensuelles

L’axe principal est :

```text
JAN → DÉC
```

## Pour chaque année et chaque mois

Calculer :

### Précipitation

```text
P_month = somme des précipitations du mois
```

unité :

```text
mm/mois
```

### Évapotranspiration réelle

```text
ETa_month = somme de l’évapotranspiration nette du mois
```

après correction de la convention de signe.

Unité :

```text
mm/mois
```

### Stock d’eau 0–100 cm

Calculer le stock quotidien ou horaire dérivé, puis :

```text
S_month = moyenne mensuelle
```

unité :

```text
mm
```

### SPEI

Utiliser :

```text
SPEI-3 du mois
```

---

# 16. Agrégation décennale

Pour chaque mois de calendrier et pour chacune des périodes :

```text
1996–2005
2006–2015
2016–2025
```

conserver :

```text
P25
médiane
P75
```

pour :

- précipitations ;
- stock d’eau 0–100 cm ;
- évapotranspiration réelle.

Pour SPEI-3, conserver également :

```text
P25
médiane
P75
```

et les mois / années dépassant les classes sèches retenues.

La figure V1 peut n’afficher que les médianes avec une dispersion discrète.

---

# 17. Comparaison à la climatologie 1991–2020

Une valeur brute est utile, mais une anomalie est souvent plus informative.

Pour chaque mois :

```text
janvier comparé aux janvier 1991–2020
février comparé aux février 1991–2020
...
```

Il ne faut surtout pas comparer un mois d’août à la distribution annuelle complète.

## Pour le stock d’eau

Conserver :

```text
valeur absolue en mm
```

et :

```text
anomalie ou percentile mensuel par rapport à 1991–2020
```

La valeur absolue raconte le cycle saisonnier.

Le percentile raconte si ce mois est devenu :

- plus sec ;
- normal ;
- plus humide ;

par rapport aux mêmes mois de la référence.

Les deux informations sont complémentaires.

---

# 18. Infographie proposée — « Le profil hydrique annuel »

## Principe

Créer **deux bandes synchronisées**, sur le même axe janvier–décembre :

```text
1996–2005
2016–2025
```

Chacune raconte le même système.

### Étage 1 — « Ce qui arrive »

Petites barres mensuelles de précipitations :

```text
mm/mois
```

Orientation graphique possible :

```text
pluie tombant vers le sol
```

Couleur :

```text
bleu
```

La neige, lorsqu’elle est activée, peut apparaître comme une part claire de la barre.

---

## Étage 2 — « Ce que le sol garde »

C’est le cœur de la figure.

Une bande continue représente :

```text
stock d’eau modélisé 0–100 cm
```

La hauteur ou l’épaisseur de la bande représente la valeur absolue.

Une légère couleur peut représenter sa position relative par rapport à la climatologie du mois :

```text
plus humide → bleu
normal → clair
plus sec → ocre / brun
```

Ainsi, le lecteur voit à la fois :

- le remplissage hivernal ;
- la diminution printanière ;
- le minimum estival ;
- la recharge automnale ;
- le déplacement éventuel de ces phases entre les deux décennies.

---

## Étage 3 — « Ce qui repart »

Sous la réserve du sol :

```text
évapotranspiration réelle
```

en mm/mois.

L’objectif n’est pas de présenter l’évapotranspiration comme un « mauvais » phénomène.

Elle est une composante normale du cycle de l’eau.

Couleur recommandée :

```text
gris chaud / ocre doux
```

éviter le rouge de danger.

---

## Étage 4 — « Déficit climatique »

Une bande très fine représente :

```text
SPEI-3
```

Lecture :

```text
bleu = humide
clair = normal
brun = sec
```

Cette bande permet de voir immédiatement si le dessèchement du sol coïncide avec :

- un déficit de pluie ;
- une forte demande atmosphérique ;
- une séquence de plusieurs mois défavorables.

---

# 19. Ce que le lecteur doit comprendre sans lire le texte

Une bonne figure doit permettre de voir immédiatement un scénario comme :

```text
pluies hivernales proches de la normale
        ↓
réserve du sol correcte en début d’année
        ↓
évapotranspiration plus forte au printemps
        ↓
réserve qui diminue plus tôt
        ↓
SPEI négatif plus longtemps
        ↓
recharge automnale plus tardive
```

ou, à l’inverse :

```text
moins de pluie
mais sol pas nécessairement plus sec toute l’année
```

si la distribution saisonnière ou l’évapotranspiration racontent autre chose.

La figure ne doit jamais forcer un récit de sécheresse si les données ne le montrent pas.

---

# 20. Indicateurs synthétiques à droite du graphique

Ne pas multiplier les chiffres.

Conserver au maximum **trois indicateurs** issus des données réelles.

Exemples possibles :

```text
Début du déficit du sol
XX jours plus tôt

Minimum estival du stock
−XX mm

Durée SPEI-3 < seuil sec
+XX mois / décennie
```

Une autre possibilité :

```text
Recharge automnale
XX jours plus tard
```

Ces métriques nécessitent toutefois une définition algorithmique robuste avant affichage.

La V1 peut commencer avec des comparaisons plus simples :

```text
stock médian JJA
précipitations JJA
SPEI-3 minimum saisonnier
```

---

# 21. Définir éventuellement la « saison sèche du sol »

Une extension intéressante consiste à définir une période annuelle où le stock d’eau du sol se situe sous un seuil climatologique.

Exemple conceptuel :

```text
seuil sec du mois = P20 de la distribution 1991–2020
```

Puis pour chaque année :

```text
premier franchissement durable
dernier franchissement durable
durée
```

Cette méthode pourrait produire :

> **Le sol entre en déficit X jours plus tôt et en sort Y jours plus tard.**

Mais cette métrique doit être considérée comme une **extension V2**.

Elle demande une validation méthodologique spécifique et ne doit pas être improvisée dans le MVP.

---

# 22. Pourquoi ne pas utiliser uniquement SPEI

SPEI est très utile, mais il ne remplace pas l’humidité du sol.

Le European Drought Observatory distingue explicitement plusieurs étapes du phénomène :

- déficit de précipitation ;
- anomalie d’humidité du sol ;
- stress de la végétation ;
- faible débit.

Référence :

- JRC / European Drought Observatory — Drought Indicators  
  https://joint-research-centre.ec.europa.eu/european-and-global-drought-observatories/drought-indicators_en

Le **Combined Drought Indicator** combine même plusieurs de ces dimensions parce qu’elles ne décrivent pas exactement le même phénomène.

La page climat doit donc éviter de faire de SPEI « la quantité d’eau disponible ».

---

# 23. Pourquoi ne pas utiliser uniquement l’humidité du sol

À l’inverse, l’humidité du sol seule ne dit pas :

- pourquoi le sol est sec ;
- si le déficit vient d’un manque de pluie ;
- si la demande atmosphérique a augmenté ;
- si l’eau a davantage ruisselé ;
- si la saison de recharge s’est déplacée.

D’où la structure :

> **apport → réserve → retour atmosphérique → déficit**

---

# 24. Surface du sol et réserve profonde : ne pas les confondre

Copernicus utilise fréquemment la couche :

```text
0–7 cm
```

dans ses bulletins.

Cette couche est excellente pour observer la réponse rapide du sol.

Mais une infographie intitulée « L’eau au fil de l’année » doit éviter de faire croire que ces sept premiers centimètres constituent toute la réserve hydrique.

Pour OpenDataVal :

### Figure principale

```text
0–100 cm dérivé
```

### Détail / tooltip

```text
0–7 cm
```

Cela constitue un compromis entre :

- lisibilité ;
- mémoire saisonnière ;
- cohérence avec Copernicus.

---

# 25. Le ruissellement ne doit pas être assimilé au débit

Règle éditoriale impérative :

```text
runoff ERA5-Land ≠ débit observé d’un cours d’eau
```

Pour parler du cours d’eau :

- utiliser une station hydrométrique ;
- utiliser une donnée hydrologique dédiée ;
- afficher sa distance et sa relation au bassin.

L’infographie climat peut dire :

> **ruissellement modélisé**

mais pas :

> **débit de la rivière**

sans source hydrologique adaptée.

---

# 26. La recharge de nappe ne doit pas être déduite naïvement

De la même façon :

```text
précipitation − évapotranspiration
```

n’est pas automatiquement :

```text
recharge de nappe
```

La recharge dépend notamment :

- du sol ;
- de la géologie ;
- de la pente ;
- de la couverture ;
- du ruissellement ;
- de la profondeur de la nappe ;
- des transferts souterrains.

OpenDataVal dispose par ailleurs de données BRGM / ADES / BDLISA qui peuvent enrichir la partie Hydrosphère ou Lithosphère.

Il faut garder ces objets séparés.

---

# 27. Calendrier civil ou année hydrologique

Pour la V1, conserver :

```text
janvier → décembre
```

afin que cette infographie partage le même axe que :

- le climatogramme ;
- les saisons thermiques ;
- l’UTCI.

Une représentation en année hydrologique peut devenir une option avancée.

Elle ne doit pas remplacer l’axe civil dans la présentation générale car le début d’une année hydrologique pertinente varie selon le contexte climatique et hydrologique.

---

# 28. Narration HTML recommandée

## Titre

> **L’eau au fil de l’année**

## Accroche

> **La pluie n’est qu’une partie de l’histoire : l’eau doit encore être stockée dans le sol avant de repartir par évapotranspiration, ruissellement ou transfert vers d’autres réservoirs.**

## Deuxième phrase

> **La figure compare le rythme mensuel de l’eau entre 1996–2005 et 2016–2025 à partir des réanalyses ERA5-Land et de l’indice SPEI d’ERA5-Drought.**

## Encadré « Comment lire »

> Les barres supérieures représentent les précipitations. La bande centrale représente le stock d’eau modélisé dans le premier mètre du sol. La partie inférieure montre l’évapotranspiration réelle. La bande fine indique le déficit ou l’excédent climatique SPEI-3. Les valeurs décrivent une maille de réanalyse et non une mesure directe du sol du lieu.

---

# 29. Provenance à afficher systématiquement

Sous l’infographie :

```text
Source principale : ERA5-Land
Référence climatologique : 1991–2020
Comparaison : 1996–2005 / 2016–2025
Grille : 0,1°
Résolution native ERA5-Land : ~9 km
Point de grille utilisé : lat / lon
SPEI : ERA5-Drought, grille 0,25°
Date de récupération
Version des datasets
```

Si disponible :

```text
altitude du lieu
orographie du modèle
écart altitudinal
sensibilité aux mailles voisines
station de contrôle
```

---

# 30. Données JSON recommandées

Structure conceptuelle :

```json
{
  "schema_version": "1.0",
  "periods": {
    "reference": "1991-2020",
    "early": "1996-2005",
    "middle": "2006-2015",
    "late": "2016-2025"
  },
  "representativity": {
    "requested_lat": null,
    "requested_lon": null,
    "grid_lat": null,
    "grid_lon": null,
    "grid_resolution_deg": 0.1,
    "native_resolution_km": 9,
    "site_altitude_m": null,
    "model_orography_m": null,
    "altitude_difference_m": null,
    "neighbour_spread": null
  },
  "months": {
    "1996-2005": [],
    "2006-2015": [],
    "2016-2025": []
  },
  "sources": {
    "precipitation": "ERA5-Land",
    "soil_water": "ERA5-Land",
    "actual_evapotranspiration": "ERA5-Land",
    "spei3": "ERA5-Drought"
  }
}
```

Pour chaque mois conserver :

```text
precipitation_mm
soil_water_0_100_mm
soil_water_0_7_m3m3
actual_evapotranspiration_mm
runoff_mm
spei3
snowfall_mm_we
snowmelt_mm_we
```

avec :

```text
P25
median
P75
```

lorsque pertinent.

---

# 31. Qualité des données

La chaîne de traitement doit conserver :

- jours disponibles ;
- valeurs manquantes ;
- mois incomplets ;
- qualité SPEI fournie par ERA5-Drought ;
- version de dataset ;
- changement éventuel de produit source.

Copernicus rappelle que les variables hydrologiques de surface sont plus difficiles à observer et à analyser que la température de l’air, et que l’humidité du sol doit être interprétée avec précaution.

Référence :

- Copernicus Climate Bulletin — hydrological variables  
  https://climate.copernicus.eu/precipitation-relative-humidity-and-soil-moisture-january-2025

---

# 32. Palette graphique proposée

Le graphique doit être plus proche de l’eau et du sol que de l’empreinte climatique.

## Arrivée d’eau

```text
bleu : #2166AC
```

## Stock du sol

Échelle humide → sèche :

```text
bleu soutenu
→ bleu pâle
→ blanc chaud
→ beige
→ brun
```

## Évapotranspiration

```text
ocre doux / gris chaud
```

## SPEI

```text
humide : bleu
normal : blanc chaud
sec : brun
```

Éviter de faire du rouge une couleur générale de danger.

---

# 33. Ce qu’il ne faut pas faire

Ne pas écrire :

> « eau disponible sur le terrain »

si l’indicateur est une humidité ERA5-Land.

Ne pas écrire :

> « recharge de la nappe »

à partir de `P − ET`.

Ne pas écrire :

> « débit de la rivière »

à partir du runoff ERA5-Land.

Ne pas considérer :

```text
potential_evaporation ERA5-Land
```

comme une ET0 agronomique sans discussion.

Ne pas masquer :

- la résolution ;
- le point de grille ;
- la différence d’altitude ;
- le caractère modélisé.

Ne pas combiner silencieusement :

- réanalyse climatique ;
- station météo ;
- station hydrologique ;
- piézomètre.

Chaque source décrit un objet différent.

---

# 34. Recherche complémentaire effectuée pour ce mémo

## ERA5-Land : hydrologie et validation

**Muñoz-Sabater, J. et al. (2021)**  
*ERA5-Land: a state-of-the-art global reanalysis dataset for land applications.*  
Earth System Science Data, 13, 4349–4383.  
https://doi.org/10.5194/essd-13-4349-2021

Points importants :

- résolution native ~9 km ;
- amélioration du cycle hydrologique par rapport à ERA5 ;
- amélioration notamment de l’humidité du sol ;
- limites persistantes en terrain montagneux ;
- importance de la représentation de l’orographie.

---

## Documentation ERA5-Land

**ECMWF / Copernicus Knowledge Base**  
https://confluence.ecmwf.int/pages/viewpage.action?pageId=462894807

Points importants :

- quatre couches de sol ;
- précipitation ;
- évaporation réelle ;
- évaporation potentielle ;
- ruissellement ;
- neige ;
- fonte ;
- conventions des accumulations ;
- définition particulière de la potential evaporation ERA5-Land.

---

## ERA5-Land time series

**Copernicus CDS**  
https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land-timeseries

Points importants :

- sélection d’un point ;
- grille 0,1° ;
- point voisin le plus proche ;
- séries horaires longues.

---

## État des sols européens

**Copernicus ESOTC 2025 — Soil moisture**  
https://climate.copernicus.eu/esotc/2025/soil-moisture

Points importants :

- rôle climatique et hydrologique de l’humidité du sol ;
- anomalies par rapport à 1991–2020 ;
- utilisation ERA5-Land ;
- distinction surface / root zone.

---

## Bulletins hydrologiques Copernicus

**Precipitation, relative humidity, and soil moisture for May 2025**  
https://climate.copernicus.eu/precipitation-relative-humidity-and-soil-moisture-may-2025

Point important :

Copernicus juxtapose précipitations, humidité du sol et débit pour montrer que ces variables décrivent des étapes différentes du cycle de l’eau.

---

## ERA5-Drought

**Copernicus CDS — Monthly drought indices**  
https://cds.climate.copernicus.eu/datasets/derived-drought-historical-monthly

Points importants :

- SPI ;
- SPEI ;
- référence 1991–2020 ;
- fenêtres 1 à 48 mois ;
- qualité de la standardisation ;
- grille 0,25°.

---

## Publication ERA5-Drought

**Keune, J. et al. (2025)**  
*ERA5–Drought: Global drought indices based on ECMWF reanalysis.*  
Scientific Data, 12, 616.  
https://doi.org/10.1038/s41597-025-04896-y

Point important :

SPEI combine la disponibilité atmosphérique en eau et la demande atmosphérique potentielle et permet d’analyser sécheresse, durée et intensité à plusieurs échelles temporelles.

---

## European Drought Observatory

**JRC — Drought Indicators**  
https://joint-research-centre.ec.europa.eu/european-and-global-drought-observatories/drought-indicators_en

Points importants :

- la sécheresse n’est pas un phénomène mono-variable ;
- distinction déficit de précipitation, humidité du sol, végétation, faible débit ;
- utilisation conjointe de plusieurs indicateurs ;
- neige importante dans les régions concernées.

---

## GCOS / WMO

**GCOS — Soil Moisture**  
https://gcos.wmo.int/site/global-climate-observing-system-gcos/essential-climate-variables/soil-moisture

**GCOS — Evaporation from Land**  
https://gcos.wmo.int/site/global-climate-observing-system-gcos/essential-climate-variables/evaporation-from-land

**GCOS — Terrestrial Water Storage**  
https://gcos.wmo.int/site/global-climate-observing-system-gcos/essential-climate-variables/terrestrial-water-storage-tws

**WMO — Water cycle**  
https://community.wmo.int/site/knowledge-hub/programmes-and-initiatives/water-resources-assessment/water-cycle

Ces références confirment que, pour parler du climat de l’eau, il faut raisonner en termes de :

```text
flux
+
stockage
+
échanges
```

et non à partir de la seule pluie.

---

# 35. Décision recommandée pour OpenDataVal

La V1 de **« L’eau au fil de l’année »** doit utiliser quatre signaux principaux :

```text
1. précipitations mensuelles
2. stock d’eau modélisé dans les 0–100 cm
3. évapotranspiration réelle
4. SPEI-3
```

Compléments :

```text
runoff → détail / tooltip
0–7 cm → détail / validation
neige / fonte → module adaptatif
```

Comparaison :

```text
1996–2005
vs
2016–2025
```

Référence :

```text
1991–2020
```

La figure ne cherche pas à répondre :

> « combien d’eau exploitable existe exactement sur ce terrain ? »

Elle répond à une question climatique beaucoup plus robuste :

> **« Comment le rythme annuel des apports, du stockage dans le sol et du déficit hydrique a-t-il changé autour de ce lieu ? »**

C’est cette formulation qui doit guider à la fois le calcul scientifique, le design de l’infographie et le texte de présentation.
