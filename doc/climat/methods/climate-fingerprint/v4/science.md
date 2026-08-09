# Fondements scientifiques — Climate Fingerprint V4

Statut : **P2 — méthode extraite, encore `draft`**.

Ce document explique le sens scientifique de l'empreinte climatique. Les détails d'implémentation exacts sont décrits dans `technical.md` et les paramètres structurés dans `method.yaml`.

## 1. Question scientifique

L'infographie répond à la question :

> **Qu'est-ce qui a changé au cours des trente dernières années ?**

Elle ne cherche pas à fabriquer un score global du changement climatique. Elle juxtapose six dimensions climatiques afin de rendre visibles leurs évolutions, leurs contrastes et leur variabilité interannuelle.

La période affichée est **1996–2025**. Les valeurs sont qualifiées par rapport à une période de référence **1991–2020**.

## 2. Nature des données

L'empreinte repose sur des **réanalyses climatiques maillées**, pas sur des mesures effectuées à l'échelle de la dalle OpenDataVal.

Trois familles sont utilisées :

- **ERA5-Land** pour température, précipitations et vent à 10 m ;
- **ERA5-HEAT** pour l'Universal Thermal Climate Index (UTCI) ;
- **ERA5-Drought** pour SPEI-3.

La coordonnée demandée et le point de grille effectivement représenté doivent rester distincts dans la provenance.

## 3. Référence 1991–2020

La période 1991–2020 est utilisée comme climatologie de référence commune. Elle sert à :

- calculer les distributions de référence ;
- situer chaque année par percentile ;
- calculer les anomalies ;
- définir certains seuils relatifs comme P95, P98 ou P10.

Cette période ne signifie pas que les années 1991–2020 sont « normales » au sens de souhaitables ou sans changement climatique. Il s'agit d'un étalon climatologique contemporain.

## 4. Température

### Source

ERA5-Land, température de l'air à 2 m.

### Indicateur

Pour chaque année : moyenne des températures moyennes quotidiennes.

L'indicateur répond à :

> L'année a-t-elle été globalement plus froide ou plus chaude relativement à la distribution 1991–2020 ?

Il ne décrit pas à lui seul les extrêmes thermiques ni le stress humain.

## 5. Stress thermique UTCI

### Source

ERA5-HEAT, Universal Thermal Climate Index.

L'UTCI est une température équivalente destinée à représenter la réponse thermophysiologique du corps humain à l'environnement extérieur. Le produit Copernicus utilisé fournit une série horaire sur une grille de 0,25°.

### Indicateur OpenDataVal

Pour chaque jour : maximum UTCI.

Pour chaque année : **P95 des maxima UTCI quotidiens**.

Ce choix vise la partie chaude de la distribution annuelle sans dépendre d'un seuil absolu qui pourrait être rarement atteint dans un climat montagnard.

Des informations complémentaires sont conservées :

- nombre de jours avec UTCI ≥ 32 °C ;
- nombre de jours avec UTCI ≥ 38 °C ;
- maximum UTCI annuel.

Le P95 annuel est un choix méthodologique OpenDataVal. Il ne constitue pas un indicateur imposé par ERA5-HEAT.

## 6. Précipitations annuelles

### Source

ERA5-Land, `total_precipitation`.

### Indicateur

Somme annuelle des précipitations quotidiennes, exprimée en millimètres.

L'indicateur répond à :

> L'année a-t-elle reçu globalement moins ou plus de précipitations que les années de la référence ?

Il ne permet pas de conclure seul sur la sécheresse, car une année peut présenter un cumul proche de la normale avec une mauvaise répartition saisonnière ou des déficits persistants.

## 7. Pluies intenses

### Principe scientifique de référence

Les indices ETCCDI/Climdex utilisent notamment un seuil relatif construit à partir du **95e percentile des précipitations des jours humides**, un jour humide étant défini par une précipitation quotidienne ≥ 1 mm.

### Adaptation OpenDataVal

OpenDataVal reprend le principe du seuil P95 des jours humides sur 1991–2020 mais utilise comme grandeur principale :

> **le nombre annuel de jours dépassant ce seuil**.

Le cumul de précipitations tombé pendant ces jours est conservé comme détail.

Cette métrique principale ne doit pas être appelée `R95p` ou `R95pTOT`, car les indices ETCCDI standards portent sur des cumuls/contributions de précipitation et non sur ce simple comptage annuel.

Cette distinction est normative pour le futur commentaire IA.

## 8. Sécheresse

### Source

ERA5-Drought, SPEI avec une fenêtre d'accumulation de trois mois.

SPEI combine précipitation et demande évaporative et permet une lecture multiscalaire des déficits climatiques. Le produit ERA5-Drought fournit un SPEI standardisé et utilise 1991–2020 comme période de référence du dataset.

### Adaptation OpenDataVal

L'empreinte ne prend pas directement un seuil absolu SPEI unique pour sa couleur annuelle.

Pour chaque mois de calendrier :

1. calculer le P10 du SPEI-3 de ce mois sur 1991–2020 ;
2. qualifier comme mois exceptionnellement sec un mois situé sous ce P10 ;
3. compter le nombre de ces mois dans chaque année.

Cette seconde normalisation par mois de calendrier est un choix OpenDataVal destiné à produire un indicateur annuel comparable aux autres lignes de l'empreinte.

Elle ne doit pas être présentée comme la définition générale du SPEI.

## 9. Vent fort

### Source retenue en P2

ERA5-Land time-series, composantes du vent à 10 m :

- `10m_u_component_of_wind` ;
- `10m_v_component_of_wind`.

La vitesse est reconstruite par :

```text
v = sqrt(u10² + v10²)
```

Le catalogue ERA5-Land expose officiellement ces deux composantes. Le choix P2 est donc de conserver ERA5-Land, déjà utilisé par le POC V4, plutôt que d'introduire ERA5 single-levels uniquement pour le vent.

### Indicateur

Pour chaque jour : maximum de la vitesse reconstruite.

Sur 1991–2020 : P98 de ces maxima quotidiens.

Pour chaque année : nombre de jours au-dessus de ce P98.

### Limite essentielle

Le vent est particulièrement sensible au relief, à la végétation et aux bâtiments. Une valeur de réanalyse de maille ne doit pas être assimilée à une mesure locale de rafale sur une parcelle ou dans une rue.

## 10. Classes relatives à la référence

Pour chaque métrique annuelle, les valeurs 1991–2020 alimentent :

- P10 ;
- P33,3 ;
- P50 ;
- P66,6 ;
- P90 ;
- moyenne.

Les cinq classes suivent la logique relative utilisée dans les bulletins Copernicus : valeurs très basses, basses, proches de la normale, hautes et très hautes relativement à la distribution de référence.

Les libellés sont adaptés à chaque variable : froid/chaud, sec/humide, peu/fréquent, etc.

OpenDataVal reprend cette logique de position relative ; il ne reproduit pas exactement les cartes ou la sémiologie graphique Copernicus.

## 11. Couleur V4 : décision éditoriale, pas nouvel indicateur climatique

La V4 ne colore pas directement le percentile empirique. Le percentile sature lorsque plusieurs années dépassent le maximum de référence et teinte mécaniquement une grande partie des années ordinaires.

La V4 calcule donc pour le **rendu seulement** un écart standardisé robuste à partir de P10, P50 et P90 :

```text
sigma = (P90 - P10) / 2,563
z = (valeur - P50) / sigma
position = 0,5 + z / 6
```

La position est bornée à l'intervalle 0–1 puis accentuée par une fonction quadratique afin de rapprocher les valeurs courantes du blanc et de réserver les couleurs fortes aux queues de distribution.

Cette transformation :

- ne change pas la valeur physique ;
- ne change pas la classe P10/P33,3/P66,6/P90 ;
- ne constitue pas un score de risque ;
- n'est pas une méthode Copernicus ;
- est un **choix éditorial OpenDataVal V4**.

## 12. Comparaison entre décennies

Chaque ligne compare :

```text
1996–2005 → 2016–2025
```

La V4 calcule la moyenne de chaque décennie puis la différence tardive moins précoce, sous réserve d'au moins huit années valides dans chacune.

Il s'agit d'une **comparaison descriptive**.

Aucun test de tendance n'est actuellement intégré à cette méthode. Le système ne doit donc pas transformer automatiquement une différence entre décennies en :

- tendance statistiquement significative ;
- accélération ;
- causalité climatique locale.

## 13. Événements exceptionnels

Le POC détecte automatiquement des candidats d'événements par des seuils extrêmes relatifs à 1991–2020 :

- chaleur : P99 des maxima UTCI quotidiens ;
- pluie : P99 des jours humides ;
- vent : P99 des maxima quotidiens ;
- sécheresse : P01 de SPEI-3.

La sélection limite à deux événements par famille et huit au total.

Ces candidats ne prouvent pas qu'une crue, une tempête nommée, un incendie ou une catastrophe a eu lieu. Un tel libellé nécessite une source événementielle externe.

## 14. Ce que l'empreinte permet de dire

Elle permet notamment de décrire :

- la position relative d'une année par rapport à 1991–2020 ;
- la différence descriptive entre les décennies 1996–2005 et 2016–2025 ;
- la coïncidence de plusieurs indicateurs exceptionnellement hauts ou bas ;
- la variabilité interannuelle ;
- des candidats d'événements extrêmes dans les réanalyses.

Les règles précises de formulation seront figées en P3.

## 15. Ce qu'elle ne permet pas de dire seule

Elle ne permet pas, sans méthode ou source supplémentaire, d'affirmer :

- qu'une tendance est statistiquement significative ;
- qu'un changement observé localement est attribuable causalement au changement climatique ;
- qu'une valeur correspond exactement à la dalle ou à une station locale ;
- qu'un épisode de pluie a produit une crue ;
- qu'un épisode de vent correspond à une tempête identifiée ;
- qu'un épisode chaud a causé un impact sanitaire ;
- qu'un indicateur rouge est « mauvais » ou qu'un bleu est « bon ».

## 16. Références principales

- WMO — Climatological Normals : https://wmo.int/wmo-climatological-normals
- Copernicus CDS — ERA5-Land hourly time-series : https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land-timeseries
- Copernicus CDS — Thermal comfort indices time-series derived from ERA5 : https://cds.climate.copernicus.eu/datasets/derived-utci-historical-timeseries
- Copernicus CDS — Monthly drought indices derived from ERA5 : https://cds.climate.copernicus.eu/datasets/derived-drought-historical-monthly
- Copernicus — Climate Bulletin, About the data and analysis : https://climate.copernicus.eu/climate-bulletin-about-data-and-analysis
- ETCCDI/Climdex — precipitation indices : https://www.climdex.org/learn/indices/
- Vicente-Serrano, S. M., Beguería, S. & López-Moreno, J. I. (2010), *A Multiscalar Drought Index Sensitive to Global Warming: The Standardized Precipitation Evapotranspiration Index*, Journal of Climate, DOI 10.1175/2009JCLI2909.1.
