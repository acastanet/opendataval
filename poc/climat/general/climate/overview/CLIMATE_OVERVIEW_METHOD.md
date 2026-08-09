# Méthodologie : Le climat de la zone

Ce document décrit les choix méthodologiques pour l'infographie "Le climat de la zone" (V1).

## 1. Référence climatologique
La période de référence utilisée est **1991–2020**. Conformément aux recommandations de l'OMM, cette normale climatologique décrit le climat contemporain.
- Source externe : [WMO — Climatological Normals](https://wmo.int/wmo-climatological-normals)

## 2. Données sources
Nous utilisons la base de données de réanalyse **ERA5-Land**, qui propose des estimations continues sur une grille globale de 0.1° (~9 km).
- Source externe : [Copernicus CDS — ERA5-Land time series](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land-timeseries)
- **Température** : Température de l'air à 2 mètres (`2m_temperature`).
- **Précipitations** : Hauteur totale de précipitation (`total_precipitation`).

*Note : Pour le POC, les données sont téléchargées dynamiquement depuis le CDS et cachées localement.*

## 3. Représentativité et agrégation spatiale
La V1 accepte des géométries de taille variable (Point, Polygon, MultiPolygon) :
- Les cellules climatiques ERA5-Land (0.1°) intersectant la zone demandée sont identifiées.
- **Pondération** : Le poids spatial ($w_i$) de chaque cellule est calculé au pro-rata de la surface d'intersection (projetée en surface géodésique égale via EPSG:6933).
- **Avertissement** : Il n'y a pas de "descente d'échelle" (downscaling) artificielle. Si la zone est plus petite qu'une maille (~9km), l'infographie prévient que les valeurs reflètent le contexte climatologique de la maille, et non une mesure hyper-locale.

## 4. Calcul des indicateurs
- **Température** : Les données journalières sont moyennées par mois. La médiane, P10 et P90 sont calculés sur les 30 occurrences de chaque mois.
- **Précipitations** : Les précipitations journalières (hauteur d'eau en mm) sont cumulées mensuellement. Les statistiques sont ensuite calculées sur la distribution des cumuls sur 30 ans.
- **Indicateurs extrêmes** : Les jours de gel (Tmin < 0°C), jours chauds (Tmax ≥ 30°C) et nuits tropicales (Tmin ≥ 20°C) sont estimés via les distributions de référence. *(Dans ce script de POC, ces valeurs sont des approximations basées sur la moyenne journalière si les extremums ne sont pas téléchargés pour optimiser le temps d'exécution).*

## 5. Distinction avec l'observation
Ce produit est un modèle (réanalyse). Il complète, mais ne remplace pas, les données des stations météorologiques locales de référence. Son but est d'offrir une vision continue et spatialisée du régime climatique habituel.
