# Implémentation technique — Climate Overview V1

Statut : **P2 — description canonique du noyau actuel**.

## 1. Pipeline cible dérivé du POC

```text
géométrie demandée
        ↓
cellules ERA5-Land intersectées
        ↓
poids spatiaux
        ↓
séries 1991–2020
        ↓
agrégations temporelles
        ↓
statistiques mensuelles
        ↓
résumé annuel
        ↓
ClimateResult
        ↓
renderer
```

## 2. Géométrie

Le moteur accepte conceptuellement :

```text
Point
Polygon
MultiPolygon
```

Pour un point, une seule maille représentative peut être utilisée avec poids 1.

Pour un polygone, chaque maille intersectée reçoit :

```text
weight_i = intersection_area_i / total_intersection_area
```

Le POC documente EPSG:6933 comme projection utilisée pour les surfaces.

## 3. Agrégation spatiale

Pour la température :

```text
T_zone(t) = Σ weight_i × T_i(t)
```

Pour les précipitations :

```text
P_zone(t) = Σ weight_i × P_i(t)
```

Les précipitations sont des hauteurs d'eau : les millimètres ne sont jamais additionnés entre cellules pour produire une hauteur de zone.

## 4. Température

Variable source :

```text
2m_temperature
```

Conversion :

```text
T_degC = T_K - 273.15
```

Pour chaque année de référence et chaque mois : moyenne mensuelle.

Pour chacun des douze mois, le JSON actuel conserve :

```text
mean
p10
p50
p90
```

## 5. Précipitations

Variable source :

```text
total_precipitation
```

La série doit être normalisée en cumul quotidien/mensuel cohérent selon l'actif ERA5-Land retenu par `apps/copernicus`.

Pour chaque année et chaque mois : cumul mensuel.

Pour chacun des douze mois sur 1991–2020 :

```text
mean
p10
p50
p90
```

## 6. Sortie mensuelle actuelle

Chaque entrée mensuelle suit la forme :

```json
{
  "month": 1,
  "temperature_c": {
    "mean": null,
    "p10": null,
    "p50": null,
    "p90": null
  },
  "precipitation_mm": {
    "mean": null,
    "p10": null,
    "p50": null,
    "p90": null
  }
}
```

La méthode exacte de percentile devra être figée explicitement lors de la migration si le code du POC ne la déclare pas déjà.

## 7. Résumé annuel actuel

Le JSON du POC contient :

```text
mean_temperature_c
precipitation_mm
warmest_month
coldest_month
wettest_month
driest_month
```

P5 devra capturer le calcul exact de `mean_temperature_c` et `precipitation_mm` dans un golden master avant refactorisation. La future implémentation ne devra pas choisir silencieusement entre plusieurs agrégations mathématiquement proches.

Les mois extrêmes doivent être déterminés à partir de la série centrale climatologique utilisée par le produit.

## 8. Indicateurs extrêmes legacy

Le JSON actuel contient aussi :

```text
frost_days_mean
hot_days_30c_mean
tropical_nights_20c_mean
```

Ils ne sont pas canoniques dans P2 parce que le POC peut les approximer à partir de moyennes quotidiennes.

Le futur service doit :

```text
soit récupérer/calculer de vrais daily_min / daily_max
soit laisser ces champs absents/null
```

Il est interdit de conserver l'approximation sous le même nom d'indicateur.

Le produit ERA5-Land daily statistics peut fournir des agrégations quotidiennes de température, mais le choix exact d'acquisition et les tests seront un chantier de migration séparé.

## 9. Représentativité JSON

Le POC publie déjà :

```text
geometry_type
area_m2
centroid
reference.start/end
representativity.datasets
grid_cell_count
spatial_weighting
cells[].lat/lon/weight
```

Le contrat commun P4 devra enrichir cette enveloppe avec :

- requested geometry ;
- represented geometry/grid ;
- résolution ;
- provenance d'acquisition ;
- altitude/orographie lorsque disponible ;
- qualité et complétude.

## 10. Aucun downscaling en V1

La V1 n'applique :

- ni gradient altitudinal automatique ;
- ni interpolation fine pour fabriquer une valeur à 100 m ;
- ni correction empirique de précipitation locale.

Si une telle méthode est ajoutée, elle devra être versionnée séparément.

## 11. Séparation calcul / rendu

Le futur `climate-overview-service` devra produire le JSON scientifique avant le SVG.

Le renderer peut :

- dessiner la courbe ;
- dessiner P10–P90 ;
- dessiner les barres ;
- choisir la mise en page.

Il ne peut pas recalculer :

- les moyennes ;
- les quantiles ;
- les poids spatiaux ;
- les mois extrêmes.

## 12. Acquisition de production

Le POC emploie l'interface `reanalysis-era5-land-timeseries`. ECMWF indique que cette interface ARCO de séries longues est conçue pour l'accès rapide à un point et n'est pas recommandée comme dépendance de production stable.

Pour les zones multi-cellules, le futur `apps/copernicus` devra de toute façon utiliser un actif compatible avec une acquisition spatiale cohérente.

Le contrat scientifique doit donc référencer **ERA5-Land et les variables**, tandis que `ClimateSnapshot` documentera le produit concret utilisé pour une exécution.

## 13. Conditions avant validation

- P3 : règles d'interprétation ;
- P4 : contrat commun ;
- P5 : golden master ;
- test explicite de la pondération spatiale multi-cellules ;
- test de l'agrégation annuelle ;
- choix d'une méthode réelle pour Tmin/Tmax avant réintroduction des indicateurs extrêmes.
