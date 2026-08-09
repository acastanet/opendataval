# Implémentation technique — Water Through Year V1

Statut : **P2 — description canonique de l'implémentation actuelle**.

## 1. Pipeline de référence

```text
ERA5-Land monthly means + ERA5-Drought SPEI-3
        ↓
normalisation des unités
        ↓
variables mensuelles
        ↓
référence mensuelle 1991–2020
        ↓
P25 / médiane / P75 par décennie
        ↓
3 comparaisons synthétiques
        ↓
JSON scientifique
        ↓
renderer SVG/HTML
```

## 2. Acquisition ERA5-Land

Le fetch courant demande :

```text
dataset = reanalysis-era5-land-monthly-means
product_type = monthly_averaged_reanalysis
variables =
  total_precipitation
  volumetric_soil_water_layer_1
  volumetric_soil_water_layer_2
  volumetric_soil_water_layer_3
  total_evaporation
```

La période couvre 1991–2025.

Le point de grille ERA5-Land est actuellement arrondi à 0,1°.

## 3. Acquisition ERA5-Drought

```text
dataset = derived-drought-historical-monthly
variable = standardised_precipitation_evapotranspiration_index
accumulation_period = 3
version = 1_0
product_type = reanalysis
dataset_type = consolidated_dataset
```

Le point de grille est actuellement arrondi à 0,25°.

## 4. Sémantique ERA5-Land monthly averaged

Le produit `monthly_averaged_reanalysis` correspond au flux `moda`, c'est-à-dire aux moyennes mensuelles de moyennes quotidiennes.

Pour les variables hydrologiques accumulées, ECMWF documente des unités de type :

```text
m d'eau équivalente / jour
```

Le cumul mensuel est donc :

```text
monthly_mm = value_m_per_day × 1000 × days_in_month
```

Cette règle confirme l'implémentation actuelle de `prepare_land_monthly_mean()`.

## 5. Précipitations

```text
precipitation_mm
= total_precipitation × 1000 × days_in_month
```

Pour un flux quotidien utilisé en alternative, la conversion est simplement `m × 1000` puis somme mensuelle sous réserve de couverture suffisante.

## 6. Évapotranspiration réelle

La convention ECMWF est : flux vertical descendant positif. L'évaporation vers l'atmosphère est donc généralement négative.

La valeur publique positive est :

```text
actual_evapotranspiration_mm
= -total_evaporation × 1000 × days_in_month
```

## 7. Stock d'eau modélisé 0–100 cm

Les profondeurs utilisées sont :

```text
layer 1 = 0,07 m
layer 2 = 0,21 m
layer 3 = 0,72 m
```

Calcul :

```text
soil_water_0_100_mm
= 1000 × (0,07×theta1 + 0,21×theta2 + 0,72×theta3)
```

Pour la source mensuelle, il s'agit directement d'une grandeur mensuelle dérivée des humidités volumiques mensuelles.

## 8. SPEI-3

Le lecteur conserve une valeur mensuelle unique.

Si plusieurs valeurs valides existent pour le même mois, le mois devient `NaN` au lieu d'en choisir une arbitrairement.

## 9. Statistiques mensuelles

Pour chaque mois de calendrier et chaque décennie :

```python
P25 = np.percentile(values, 25, method="linear")
P50 = np.percentile(values, 50, method="linear")
P75 = np.percentile(values, 75, method="linear")
```

Les mêmes statistiques sont calculées pour la référence 1991–2020.

## 10. Position du stock dans la référence

Pour une valeur mensuelle `x` :

```text
100 × mean(reference_month_values <= x)
```

La distribution de référence est spécifique au mois de calendrier.

## 11. Comparaison des précipitations annuelles

Pour chaque année :

```text
annual_precip = somme des 12 mois
```

La somme annuelle n'est produite que si les douze mois sont présents (`min_count=12`).

Puis :

```text
early = médiane(1996–2005)
late  = médiane(2016–2025)
change_pct = 100 × (late - early) / early
```

## 12. Comparaison du stock d'été

Pour chaque année :

```text
summer_soil = mean(June, July, August)
```

Puis :

```text
change_mm = median(late) - median(early)
```

## 13. Comparaison des mois secs

Une année est utilisable uniquement si les 12 mois SPEI-3 sont valides.

```text
dry_months(year) = count(SPEI3 < -1.0)
```

Puis :

```text
change = median(late) - median(early)
```

Cette définition doit rester distincte de l'indicateur sécheresse de l'empreinte.

## 14. Complétude

Pour une entrée journalière, un mois devient nul si moins de 90 % de ses jours sont valides.

Pour la source mensuelle CDS, la donnée est déjà agrégée ; le contrôle qualité porte sur la présence des 420 mois attendus entre 1991 et 2025.

Le JSON conserve, variable par variable :

```text
valid_months
expected_months
status
```

## 15. Variables secondaires

Le pipeline sait transporter des métriques optionnelles :

```text
runoff
surface_runoff
sub_surface_runoff
snowfall
snowmelt
snow_depth_water_equivalent
```

Elles ne font pas partie des quatre métriques scientifiques principales de V1.

En particulier, `runoff` ne doit jamais être renommé « débit de rivière ».

## 16. Renderer

Le renderer reçoit le document calculé et ne doit effectuer ni agrégation ni calcul scientifique.

Cette propriété doit être conservée lors de la migration vers `climate-water-service`.

## 17. Migration

Le futur service devra être organisé autour de :

```text
compute.py
signals.py
render.py
validate.py
```

Le `ClimateSnapshot` devra porter les unités et la sémantique du produit CDS pour éviter que le service redéduise les conventions d'accumulation.

## 18. Conditions avant validation

- P3 : règles d'interprétation ;
- P4 : enveloppe `ClimateResult` commune ;
- P5 : comparaison au golden master ;
- test explicite des conversions `moda` avec une fixture dont le cumul attendu est connu ;
- test du signe de l'évapotranspiration ;
- conservation de la distinction entre les mailles ERA5-Land et ERA5-Drought.
