# Présentation du climat du lieu — principes, indicateurs et références

## Introduction

La présentation climatique d’un lieu est organisée en trois niveaux complémentaires :

1. **une vision classique du climat**, pour décrire le fonctionnement habituel d’une année ;
2. **L’empreinte climatique du lieu**, pour montrer ce qui a changé au cours des trente dernières années ;
3. **Les saisons se déplacent**, pour montrer comment le rythme thermique annuel s’est modifié.

Cette organisation suit une progression simple :

> **décrire → comparer → montrer le déplacement dans l’année**

Les données climatiques utilisées sont principalement issues de **Copernicus Climate Data Store (CDS)** et des réanalyses **ERA5, ERA5-Land, ERA5-HEAT et ERA5-Drought**.

Le climat est présenté comme un **contexte climatique du lieu issu de données de réanalyse sur grille**. Il ne doit pas être présenté comme une mesure effectuée exactement à l’échelle de l’emprise locale représentée dans OpenDataVal.

---

# 1. Une vision classique du climat du lieu

## Objectif

La première représentation doit répondre à la question la plus immédiate :

> **À quoi ressemble normalement une année climatique ici ?**

Elle sert de point d’entrée à la page climat et fournit la référence nécessaire pour comprendre les deux infographies suivantes.

## Référence climatologique

La période retenue est :

**1991–2020**

Ce choix n’est pas arbitraire. L’Organisation météorologique mondiale définit les normales climatologiques standards comme des périodes consécutives de trente ans. La période **1991–2020** constitue la normale standard récente utilisée pour décrire les conditions climatiques actuelles et calculer des anomalies.

### Référence

- World Meteorological Organization, **WMO Climatological Normals**
- https://wmo.int/wmo-climatological-normals

## Données principales

La source privilégiée est **ERA5-Land**.

ERA5-Land fournit notamment :

- température de l’air à 2 m ;
- précipitations ;
- humidité du sol ;
- neige ;
- variables de surface.

Le produit est disponible à résolution horaire et sur une grille régulière.

### Référence

- Copernicus Climate Data Store, **ERA5-Land hourly time-series data**
- https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land-timeseries

ERA5-Land est une **réanalyse**. Il ne s’agit donc pas d’une station météorologique locale, mais d’une reconstruction cohérente de l’état passé du système terrestre fondée sur la modélisation et les informations issues du système ERA5.

## Représentation proposée

La première infographie prend la forme d’un **climatogramme annuel enrichi**.

L’axe horizontal représente :

**janvier → décembre**

Le graphique montre au minimum :

- température moyenne mensuelle ;
- précipitations mensuelles.

Une enveloppe de variabilité peut compléter la température :

- P10 ;
- médiane ou moyenne ;
- P90.

Cette première visualisation doit rester classique et immédiatement compréhensible.

Elle répond à :

> **Quel est le rythme habituel de la température et de la pluie au cours d’une année ?**

Le choix précis de la composition graphique — courbe, enveloppe percentile, barres de précipitations — est un **choix éditorial OpenDataVal** et non une norme imposée par Copernicus.

---

# 2. L’empreinte climatique du lieu

## Objectif

**L’empreinte climatique du lieu** répond à une deuxième question :

> **Qu’est-ce qui a changé au cours des trente dernières années ?**

Elle vise à donner une représentation synthétique de plusieurs dimensions du changement climatique sans réduire celui-ci à la seule température.

La période visible est :

**1996–2025**

La référence utilisée pour situer les années reste :

**1991–2020**

## Un indice visuel multidimensionnel

L’empreinte n’est pas un score unique.

Elle est plus précisément un **indice visuel multidimensionnel**.

Chaque colonne représente une année.

Chaque ligne représente un phénomène climatique.

Les six indicateurs retenus sont :

1. température ;
2. stress thermique UTCI ;
3. précipitations ;
4. pluies intenses ;
5. sécheresse ;
6. vent fort.

L’intérêt de cette organisation est de conserver l’identité propre de chaque variable.

Une hausse de température n’est pas mathématiquement compensée par une variation de précipitations ou de vent.

---

## Principe de normalisation

Les six variables n’ont ni les mêmes unités ni les mêmes distributions.

Par exemple :

- température : °C ;
- précipitations : mm ;
- sécheresse : indice ou nombre de mois ;
- vent fort : nombre de jours ;
- pluie intense : nombre de jours ;
- UTCI : °C UTCI.

Ces grandeurs ne peuvent donc pas être comparées directement.

Pour chaque indicateur, la valeur d’une année est replacée dans **la distribution de référence 1991–2020 de ce même indicateur**.

Cette logique reprend le principe des classifications par percentiles utilisées dans les Climate Bulletins de Copernicus.

Copernicus utilise notamment des positions comme :

- sous le 10e percentile ;
- entre le 10e et le 33,3e percentile ;
- proche de la normale ;
- entre le 66,6e et le 90e percentile ;
- au-dessus du 90e percentile.

### Référence

- Copernicus Climate Change Service, **Climate Bulletins — About the data and analysis**
- https://climate.copernicus.eu/climate-bulletin-about-data-and-analysis

OpenDataVal reprend le principe de **position relative dans une distribution de référence**, mais utilise sa propre représentation graphique.

---

## Grammaire couleur

La règle visuelle retenue est volontairement unique :

> **bleu = moins · clair = proche de la normale · rouge = plus**

Cette convention reste identique pour toutes les lignes.

Elle signifie :

| Indicateur | Bleu | Rouge |
|---|---|---|
| Température | plus froid | plus chaud |
| Stress UTCI | moins de stress | plus de stress |
| Précipitations | moins de précipitations | plus de précipitations |
| Pluies intenses | moins fréquentes | plus fréquentes |
| Sécheresse | moins de sécheresse | plus de sécheresse |
| Vent fort | moins fréquent | plus fréquent |

Le rouge ne signifie donc pas automatiquement **danger**.

Il signifie :

> **davantage de la grandeur représentée.**

---

# 3. Les six composantes de l’empreinte

## 3.1 Température

La première ligne utilise la **température de l’air à 2 m ERA5-Land**.

Chaque année est caractérisée par sa température moyenne annuelle puis replacée dans la distribution 1991–2020.

### Source

- Copernicus CDS
- ERA5-Land
- variable : `2m_temperature`

### Référence

https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land-timeseries

---

## 3.2 Stress thermique UTCI

La température de l’air ne suffit pas à décrire les conditions thermiques ressenties par un organisme humain.

L’**Universal Thermal Climate Index — UTCI** prend notamment en compte :

- température ;
- humidité ;
- vent ;
- rayonnement.

Le produit **ERA5-HEAT** fournit des séries historiques d’UTCI et de température radiante moyenne.

### Références

- Copernicus CDS, **Thermal comfort indices derived from ERA5 reanalysis**
- https://cds.climate.copernicus.eu/datasets/derived-utci-historical

- Copernicus, **Thermal Trace: decades of heat and cold stress data at your fingertips**
- https://climate.copernicus.eu/thermal-trace-decades-heat-and-cold-stress-data-your-fingertips

Pour l’empreinte OpenDataVal, la métrique retenue est le **P95 annuel du maximum quotidien UTCI**.

Ce choix vise à caractériser la partie chaude de la distribution plutôt qu’une moyenne annuelle qui mélangerait les conditions hivernales et estivales.

Il s’agit d’un **choix méthodologique OpenDataVal**, et non d’un indicateur standard imposé par Copernicus.

---

## 3.3 Précipitations

Cette ligne représente le cumul annuel de précipitations ERA5-Land.

Elle indique si une année est relativement :

- peu arrosée ;
- proche de la normale ;
- très arrosée.

### Source

- Copernicus CDS
- ERA5-Land
- `total_precipitation`

### Référence

https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land-timeseries

---

## 3.4 Pluies intenses

Le cumul annuel ne suffit pas à décrire la manière dont la pluie est répartie.

Deux années peuvent recevoir une quantité totale d’eau comparable alors que :

- l’une reçoit de nombreux épisodes modérés ;
- l’autre concentre une grande partie des précipitations en quelques événements intenses.

L’empreinte distingue donc **Précipitations** et **Pluies intenses**.

La méthode OpenDataVal consiste à définir un seuil élevé sur les précipitations quotidiennes de la période de référence, puis à compter les jours qui dépassent ce seuil chaque année.

Une approche de type percentile P95 est utilisée.

Cette méthode est un **indicateur dérivé OpenDataVal**.

Les résultats doivent être présentés comme des **précipitations extrêmes dans la réanalyse**, car une réanalyse sur grille peut lisser certains phénomènes convectifs très locaux.

---

## 3.5 Sécheresse

La sécheresse n’est pas simplement l’inverse des précipitations.

Elle dépend également de la demande atmosphérique en eau et de l’évapotranspiration.

Le produit **ERA5-Drought** fournit notamment :

- SPI ;
- SPEI.

Le **SPEI** est particulièrement intéressant car il combine le déficit de précipitations avec l’effet de l’évapotranspiration potentielle.

### Référence

- Copernicus CDS, **Drought indices derived from ERA5**
- https://cds.climate.copernicus.eu/datasets/derived-drought-historical-monthly

Le produit utilise lui-même une période de référence **1991–2020**, ce qui le rend particulièrement cohérent avec la méthode générale de la page climat.

---

## 3.6 Vent fort

Le vent peut être dérivé des composantes horizontales :

- `u10` ;
- `v10`.

La vitesse est calculée par :

```text
vent = √(u10² + v10²)
```

Une métrique annuelle de jours de vent fort peut ensuite être construite relativement à un seuil élevé de la distribution 1991–2020.

### Source

- Copernicus CDS
- ERA5 single levels

### Référence

https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels

Le vent étant fortement influencé par le relief, les bâtiments et la végétation, ces données doivent être décrites comme un **contexte venteux de la réanalyse**, et non comme une mesure exacte des mouvements d’air à l’intérieur du site.

---

# 4. Comparaison des décennies

L’empreinte représente trente années :

```text
1996–2005
2006–2015
2016–2025
```

La comparaison synthétique principale oppose :

**1996–2005 → 2016–2025**

Ce découpage est un **choix méthodologique OpenDataVal**.

Il permet de comparer le début et la fin de la période représentée tout en conservant la décennie intermédiaire dans la matrice.

Les écarts sont exprimés dans les unités physiques appropriées :

- °C ;
- °C UTCI ;
- % ;
- jours/an ;
- mois/an.

Il faut parler d’**écart entre deux décennies** tant qu’un test statistique ne permet pas de qualifier formellement une tendance.

---

# 5. Événements exceptionnels

Les événements exceptionnels sont volontairement présentés séparément de l’empreinte.

L’objectif est de distinguer :

- le **changement du climat de fond** ;
- les **événements particuliers**.

Les événements peuvent inclure :

- chaleur exceptionnelle ;
- précipitations extrêmes ;
- sécheresse ;
- vent extrême ;
- froid ou neige lorsque pertinent.

Une qualification automatique doit rester prudente.

Une précipitation extrême ne devient pas automatiquement une **crue**.

Une période chaude n’est pas automatiquement une **canicule officielle**.

Une situation météorologique propice au feu n’est pas un **incendie observé**.

La qualification d’un événement doit donc dépendre de la source réellement utilisée.

---

# 6. Ce que montre l’empreinte

L’empreinte doit permettre de distinguer trois situations :

1. **un signal net** ;
2. **une forte variabilité interannuelle** ;
3. **l’absence d’évolution évidente**.

Elle ne doit pas fabriquer artificiellement une tendance commune à toutes les variables.

Une phrase de synthèse peut être générée à partir des résultats réels, par exemple :

> **Le signal le plus net est thermique ; les précipitations restent très variables, tandis que les autres phénomènes présentent des évolutions plus contrastées.**

Cette phrase ne doit être utilisée que si elle est effectivement supportée par les données du lieu.

---

# 7. Les saisons se déplacent

## Objectif

La troisième infographie répond à :

> **À quel moment de l’année le changement thermique se produit-il ?**

Elle ne représente pas les saisons météorologiques fixes :

- DJF ;
- MAM ;
- JJA ;
- SON.

Elle construit des **saisons thermiques locales**.

---

# 8. Référence scientifique des saisons thermiques

La méthode principale est inspirée de :

**Wang et al. (2021), _Changing Lengths of the Four Seasons by Global Warming_, Geophysical Research Letters.**

DOI :

https://doi.org/10.1029/2020GL091753

Les auteurs utilisent des seuils thermiques locaux fondés sur les percentiles de température :

- **T25** : percentile 25 ;
- **T75** : percentile 75.

L’été est associé aux températures supérieures à T75.

L’hiver est associé aux températures inférieures à T25.

Le printemps et l’automne correspondent aux périodes de transition.

La méthode utilise également un lissage du cycle annuel pour éviter que des fluctuations météorologiques de quelques jours ne génèrent de faux changements de saison.

---

# 9. Adaptation OpenDataVal

OpenDataVal reprend la logique T25/T75, mais l’adapte à sa référence climatologique commune :

**1991–2020**

Cette adaptation est un **choix méthodologique OpenDataVal**.

Les seuils T25 et T75 sont calculés une fois sur la référence puis restent fixes pour analyser la période 1996–2025.

Ils ne sont pas recalculés séparément pour chaque décennie.

Cela permet de mesurer réellement le déplacement des conditions thermiques relativement au même climat de référence.

---

# 10. Quatre transitions thermiques

Après lissage du cycle quotidien, quatre frontières sont identifiées :

### Printemps thermique

Franchissement montant de :

**T25**

### Été thermique

Franchissement montant de :

**T75**

### Automne thermique

Franchissement descendant de :

**T75**

### Hiver thermique

Franchissement descendant de :

**T25**

La séquence attendue est :

```text
HIVER
→ PRINTEMPS
→ ÉTÉ
→ AUTOMNE
→ HIVER
```

---

# 11. Comparaison des deux périodes

La visualisation compare :

**1996–2005**

et

**2016–2025**

Pour chacune des quatre transitions, on calcule :

- P25 ;
- médiane ;
- P75.

La médiane indique la position centrale de la transition dans la décennie.

La zone P25–P75 représente la **dispersion interannuelle**.

Elle ne doit pas être appelée « intervalle de confiance ».

---

# 12. Représentation graphique

La représentation repose sur **deux bandes horizontales distinctes**, une pour chaque période.

Le code couleur retenu est :

- **hiver : bleu**
- **été : rouge**
- **printemps et automne : blanc chaud**

Les deux intersaisons utilisent volontairement la même couleur.

Le lecteur perçoit donc :

```text
froid
→ transition
→ chaud
→ transition
→ froid
```

Un léger dégradé local peut être utilisé autour des frontières pour rappeler qu’une transition thermique n’est pas instantanée.

Les deux bandes restent séparées.

Des connecteurs relient les quatre frontières homologues et rendent visible leur déplacement vers :

- plus tôt dans l’année ;
- plus tard dans l’année.

---

# 13. Indicateur synthétique : durée de l’été thermique

La durée de l’été thermique est calculée entre :

- le franchissement montant de T75 ;
- le franchissement descendant de T75.

La comparaison entre les deux décennies fournit un indicateur synthétique :

> **Été thermique : +XX jours**

ou :

> **Été thermique : −XX jours**

La valeur correspond à l’écart entre les durées médianes des deux décennies.

---

# 14. Validation secondaire par la saison de croissance

Copernicus fournit également des indicateurs de saison de croissance.

Une définition courante repose notamment sur une séquence de plusieurs jours avec température moyenne quotidienne supérieure à **5 °C**, puis un retour durable sous ce seuil.

### Référence

- Copernicus CDS, **Climate indicators for Europe**
- https://cds.climate.copernicus.eu/datasets/sis-ecde-climate-indicators

Cette définition ne remplace pas les saisons thermiques T25/T75 dans OpenDataVal.

Elle est utilisée comme **validation secondaire**.

---

# 15. Ce sur quoi repose l’ensemble

La méthode repose sur quatre niveaux distincts.

## 15.1 Référence climatologique

**Organisation météorologique mondiale — WMO**

Utilisation de 1991–2020 comme normale climatologique standard récente.

Référence :

https://wmo.int/wmo-climatological-normals

---

## 15.2 Sources de données

**Copernicus Climate Data Store / ECMWF**

### ERA5-Land

Température, précipitations et variables terrestres.

https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land-timeseries

### ERA5-HEAT

UTCI et température radiante moyenne.

https://cds.climate.copernicus.eu/datasets/derived-utci-historical

### ERA5-Drought

SPI / SPEI.

https://cds.climate.copernicus.eu/datasets/derived-drought-historical-monthly

### ERA5

Variables atmosphériques telles que le vent.

https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels

---

## 15.3 Référence scientifique

**Wang et al. (2021)**

_Changing Lengths of the Four Seasons by Global Warming_

Geophysical Research Letters.

https://doi.org/10.1029/2020GL091753

Cette publication constitue la référence principale pour :

- la définition locale T25/T75 ;
- la notion de saisons thermiques ;
- le lissage du cycle thermique ;
- l’étude du déplacement des saisons.

---

## 15.4 Choix méthodologiques OpenDataVal

Les éléments suivants sont des choix propres au projet :

- période représentée : 1996–2025 ;
- comparaison 1996–2005 / 2016–2025 ;
- six lignes de l’empreinte ;
- P95 UTCI pour l’empreinte ;
- indicateur de pluies intenses ;
- représentation P25–P75 des transitions saisonnières ;
- palette graphique ;
- séparation des événements exceptionnels ;
- comparaison des durées de l’été thermique ;
- adaptation de la méthode T25/T75 à la référence 1991–2020.

Ces choix doivent rester explicitement distingués des standards Copernicus et des méthodes directement publiées dans la littérature.

---

# 16. Narration générale de la page climat

Les trois représentations forment une narration commune.

## 1. Le climat du lieu

> **À quoi ressemble normalement une année ?**

Référence :

**1991–2020**

---

## 2. L’empreinte climatique du lieu

> **Qu’est-ce qui a changé au cours des trente dernières années ?**

Période :

**1996–2025**

---

## 3. Les saisons se déplacent

> **À quel moment de l’année le changement thermique se manifeste-t-il ?**

Comparaison :

**1996–2005 → 2016–2025**

---

La logique générale devient donc :

> **décrire le climat habituel → montrer ce qui change → montrer comment le calendrier thermique se transforme**

C’est cette progression qui structure la présentation climatique d’un lieu dans OpenDataVal.
