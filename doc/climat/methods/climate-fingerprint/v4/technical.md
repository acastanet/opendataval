# Implémentation technique — Climate Fingerprint V4

Statut : **P2 — description canonique de l'implémentation actuelle**.

Ce document décrit ce que le POC V4 calcule réellement. Il ne doit pas être remplacé par une lecture approximative de l'infographie.

## 1. Code de référence actuel

Les fichiers principaux du POC sont :

```text
poc/climat/empreinte-climatique/
├── src/empreinte_climatique/
│   ├── fetch.py
│   ├── assets.py
│   ├── fingerprint.py
│   └── build.py
└── example/
    └── climate-fingerprint-v4.json
```

Le téléchargement est séparé du calcul. `fingerprint.py` ne réalise aucun appel réseau.

## 2. Acquisition

Le POC télécharge pour 1991-01-01 à 2025-12-31 :

### ERA5-Land time-series

```text
2m_temperature
10m_u_component_of_wind
10m_v_component_of_wind
total_precipitation
```

Point de grille actuel : arrondi à 0,1°.

### ERA5-HEAT time-series

```text
universal_thermal_climate_index
```

Point dérivé actuel : arrondi à 0,25°.

### ERA5-Drought monthly

```text
standardised_precipitation_evapotranspiration_index
accumulation_period = 3
version = 1_0
product_type = reanalysis
dataset_type = consolidated_dataset
```

Point dérivé actuel : arrondi à 0,25°.

Le futur service devra récupérer ces actifs via `apps/copernicus`/`ClimateSnapshot` et non reproduire ce client CDS dans chaque service.

## 3. Normalisation des actifs

### Séries temporelles

Les timestamps sont convertis en UTC, triés et dédupliqués. En cas de timestamp dupliqué, la dernière valeur est actuellement conservée.

### Kelvin vers Celsius

Le POC applique une conversion conditionnelle : si la médiane de la série est supérieure à 100, il soustrait 273,15.

Cette heuristique appartient au lecteur d'actifs du POC. Le futur `ClimateSnapshot` devra fournir des unités explicites et éviter de déduire une unité à partir de la valeur numérique.

### Précipitations

Les valeurs négatives lues sont ramenées à zéro avant le calcul. Les accumulations horaires en mètres sont ensuite sommées quotidiennement et converties en millimètres.

### Vent

```text
wind_speed = sqrt(u10² + v10²)
```

Le maximum journalier de cette vitesse est utilisé pour les seuils et statistiques annuels.

## 4. Agrégations quotidiennes

Les opérations actuelles sont :

```text
temperature_hourly → daily mean
UTCI_hourly        → daily max
precipitation      → daily sum
wind_speed         → daily max
```

SPEI-3 est ramené à une fréquence mensuelle `MS` par moyenne après normalisation de la série.

## 5. Complétude annuelle

Pour les métriques fondées sur des valeurs quotidiennes :

```text
minimum = ceil(nombre_de_jours_attendus × 0,90)
```

Une année bissextile attend 366 jours, les autres 365.

Si la couverture est inférieure à 90 %, la métrique annuelle vaut `null`.

## 6. Référence minimale

Une distribution annuelle de référence est exploitable si au moins :

```text
24 années valides sur 1991–2020
```

sont disponibles.

Sinon les quantiles de classification restent `null`.

## 7. Température

Pipeline :

```text
ERA5-Land 2m_temperature
→ °C
→ moyenne quotidienne
→ contrôle 90 %
→ moyenne annuelle
```

Sortie annuelle :

```text
annual_mean_2m_temperature
```

## 8. UTCI

Pipeline :

```text
ERA5-HEAT UTCI
→ °C UTCI
→ maximum quotidien
→ contrôle 90 %
→ percentile 95 annuel
```

Sortie principale :

```text
annual_p95_daily_max_utci
```

Détails :

```text
jours_ge_32_c_utci
jours_ge_38_c_utci
maximum_c_utci
```

Le comptage des détails ne constitue pas la grandeur de couleur principale.

## 9. Précipitations annuelles

Pipeline :

```text
ERA5-Land total_precipitation
→ clip minimum 0
→ somme quotidienne
→ m × 1000
→ contrôle 90 %
→ somme annuelle
```

Sortie :

```text
annual_total_precipitation
```

## 10. Pluies intenses

### Seuil

Sur toutes les valeurs quotidiennes de 1991–2020 :

```text
jours humides = précipitation >= 1 mm
rain_threshold = quantile(jours_humides, 0.95)
```

### Valeur annuelle

```text
count(precipitation_daily > rain_threshold)
```

Le dépassement est donc **strictement supérieur** au seuil.

### Détail annuel

```text
sum(precipitation_daily[precipitation_daily > rain_threshold])
```

### Nommage

La future API doit employer un nom explicite du type :

```text
heavy_rain_days_above_reference_wet_day_p95
```

et ne pas publier cette valeur sous `R95p` ou `R95pTOT`.

## 11. Sécheresse

Série : SPEI-3 mensuel.

Pour chaque mois `m = 1..12` :

```text
threshold[m]
  = P10(SPEI3 du mois m pendant 1991–2020)
```

Pour chaque année :

```text
nombre de mois où SPEI3 < threshold[mois]
```

Une année n'est calculée que si les douze mois sont présents.

Détail : minimum annuel SPEI-3.

## 12. Vent

Source canonique P2 : ERA5-Land time-series.

Seuil :

```text
wind_threshold
  = P98(maximum quotidien du vent 10 m, 1991–2020)
```

Valeur annuelle :

```text
count(daily_max_wind > wind_threshold)
```

Détail : maximum quotidien le plus élevé de l'année.

### Divergence historique résolue

La constante `METRICS` de `fingerprint.py` porte encore un ancien libellé `ERA5`, résolution `0,25°` pour la ligne vent. `build.py` le remplace déjà dans le résultat final par :

```text
source = ERA5-Land
resolution = 0,1°
```

La méthode canonique retient ERA5-Land. Lors de la migration du service, l'ancien libellé interne devra être supprimé.

## 13. Distribution de référence de chaque métrique

Pour les valeurs annuelles valides 1991–2020 :

```text
P10   = quantile 0.10
P33.3 = quantile 0.333
P50   = quantile 0.50
P66.6 = quantile 0.666
P90   = quantile 0.90
mean  = moyenne arithmétique
```

Le code NumPy actuel n'explicite pas l'argument `method` de `np.quantile` dans ce module. La migration devra figer explicitement la méthode de quantile dans le contrat technique commun pour éviter une dépendance implicite à la version de NumPy.

## 14. Classification annuelle

Pour une valeur `x` :

```text
x <= P10    → classe 0
x <= P33.3  → classe 1
x <= P66.6  → classe 2
x <= P90    → classe 3
sinon       → classe 4
```

Le percentile empirique stocké est :

```text
100 × mean(reference <= x)
```

L'anomalie est :

```text
x - mean(reference)
```

Le rang est calculé parmi les 30 années visibles 1996–2025, par ordre décroissant de la valeur.

## 15. Comparaison décennale

Périodes :

```text
early = 1996–2005
late  = 2016–2025
```

Une moyenne décennale est calculée si au moins huit valeurs annuelles valides sont disponibles.

```text
delta = late_mean - early_mean
```

Pour les précipitations, le pourcentage relatif est aussi calculé si la moyenne précoce est non nulle.

Les chaînes `qualifier` présentes dans le POC (`variabilité élevée`, `comparaison des décennies`, etc.) relèvent de la restitution actuelle. Elles ne devront pas devenir des conclusions scientifiques implicites du futur contrat sans règle explicite en P3.

## 16. Couleur V4

### Position robuste

Lorsque P10, P50 et P90 sont disponibles et P90 > P10 :

```text
spread = (P90 - P10) / 2.563
z = (value - P50) / spread
position = clip(0.5 + z / 6, 0, 1)
```

Le facteur 2,563 correspond à l'écart P10–P90 exprimé en écarts-types sous hypothèse normale. Son usage ici sert uniquement à établir une échelle graphique robuste.

### Repli

Si la distribution est dégénérée, la position retombe sur le percentile empirique, avec garde-fou lorsque les ex æquo produisent un percentile incohérent avec la classe.

### Accentuation

```text
offset = position - 0.5
final = 0.5 + sign(offset) × (abs(offset)/0.5)^2 / 2
```

Cette position alimente la palette commune.

Aucun calcul scientifique de `ClimateResult` ne devra dépendre de cette transformation de rendu.

## 17. Empreinte bilan

Le POC calcule actuellement une ligne de synthèse graphique à partir de la moyenne signée des positions accentuées des six métriques.

Cette ligne :

- autorise des compensations entre excès et déficits ;
- est explicitement présentée comme une synthèse visuelle ;
- ne doit pas devenir un score climatique universel ;
- ne doit pas être utilisée seule par le service IA comme preuve d'une conclusion.

Le futur `ClimateResult` devra conserver les six signaux séparément. L'empreinte bilan appartient au renderer.

## 18. Détection d'événements candidats

### Chaleur

```text
P99 des maxima UTCI quotidiens de référence
```

### Pluie

```text
P99 des précipitations quotidiennes des jours humides de référence
```

### Vent

```text
P99 des maxima quotidiens du vent de référence
```

### Sécheresse

```text
P01 de l'ensemble des valeurs SPEI-3 1991–2020
```

Les dépassements sont regroupés ; pour SPEI, un intervalle allant jusqu'à 35 jours permet de regrouper des mois successifs.

Sélection finale :

```text
maximum 2 événements / famille
maximum 8 événements
tri final chronologique
```

## 19. Résumé déterministe actuel

Le POC génère encore une courte phrase déterministe à partir de trois comparaisons : température, précipitations et sécheresse.

Cette fonction doit être considérée comme **legacy de restitution**.

Dans l'architecture cible :

```text
ClimateResult + ClimateSignal[]
        ↓
climate-commentary-service
```

remplacera cette logique. Le service scientifique ne doit plus produire une interprétation libre.

## 20. Sorties actuelles

Le POC écrit :

```text
climate-fingerprint-v4.json
climate-fingerprint-v4.svg
climate-fingerprint-v4-neutral.svg
climate-fingerprint-events-v4.svg
index.html
```

Le futur service doit d'abord produire un `ClimateResult`. Les SVG/HTML sont des dérivés de ce résultat.

## 21. Points de migration à tester

Avant de déclarer la méthode `validated` :

1. figer explicitement la méthode des quantiles NumPy ;
2. supprimer le libellé interne ERA5/0,25° obsolète du vent ;
3. remplacer l'heuristique d'unité Kelvin/Celsius par une unité déclarée dans `ClimateSnapshot` ;
4. vérifier la complétude des séries horaires avant agrégation quotidienne, pas seulement la présence des jours ;
5. produire des `ClimateSignal` séparés des données et du renderer ;
6. valider l'équivalence sur le golden master V4 en P5.
