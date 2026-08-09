# Implémentation technique — Thermal Seasons V1

Statut : **P2 — description canonique de l'implémentation actuelle**.

## 1. Pipeline de référence

```text
ERA5-Land hourly 2m_temperature
        ↓
normalisation UTC / °C
        ↓
moyenne quotidienne
        ↓
contrôle de complétude
        ↓
suppression du 29 février
        ↓
interpolation petites lacunes
        ↓
climatologie 1991–2020
        ↓
T25 / T75
        ↓
lissage annuel degré 3
        ↓
4 franchissements
        ↓
durées annuelles
        ↓
P25 / médiane / P75 par décennie
        ↓
déplacements en jours
```

## 2. Conversion horaire → quotidien

Un jour est valide si :

```text
nombre de valeurs horaires valides >= 18
```

La température quotidienne est la moyenne arithmétique des valeurs horaires UTC valides.

Les jours ne satisfaisant pas la règle deviennent `NaN`.

## 3. Couverture annuelle

Avant interpolation, une année doit contenir au moins :

```text
365 × 0,98 = 357,7 jours valides
```

Le code accepte donc une année lorsque :

```text
valid_days >= 365 * 0.98
```

Le nombre de jours valides est enregistré avant interpolation.

## 4. Années bissextiles

Le 29 février est supprimé. Toutes les années sont ramenées à 365 jours avec une fonction unique de conversion date ↔ DOY sans année bissextile.

## 5. Interpolation

Les lacunes sont interpolées linéairement uniquement si :

```text
gap <= 2 jours consécutifs
```

et si les deux bornes de la lacune existent.

Le nombre de jours interpolés est conservé dans les diagnostics.

L'interpolation sert au lissage et ne doit jamais augmenter artificiellement la couverture déclarée.

## 6. Climatologie 1991–2020

Pour chacun des 365 DOY :

```text
climatology[doy]
  = nanmean(température quotidienne de ce DOY sur les années de référence)
```

Les années disponibles de taille 365 dans la période sont empilées.

## 7. Seuils T25 / T75

Sur le vecteur de 365 valeurs de climatologie :

```python
np.percentile(climatology, 25, method="linear")
np.percentile(climatology, 75, method="linear")
```

La méthode `linear` est explicitement figée dans le code.

## 8. Lissage annuel

Pour chaque année exploitable :

```text
x = 1..365
y = température quotidienne °C
```

Ajustement :

```python
coeffs = np.polyfit(x[valid], y[valid], 3)
smoothed = np.polyval(coeffs, x)
```

Le lissage échoue si moins de quatre valeurs sont disponibles, cas théorique incompatible avec la règle de couverture annuelle mais conservé comme garde-fou.

Un RMSE est calculé entre série lissée et série quotidienne originale sur les jours communs valides.

## 9. Détection des franchissements

### Ascendant

Pour un seuil `T` :

```text
S[d-1] < T <= S[d]
```

### Descendant

```text
S[d-1] >= T > S[d]
```

Le premier franchissement correspondant est retenu.

La date est interpolée linéairement entre les deux jours encadrant le seuil.

## 10. Frontières

```text
spring_start = ascending(T25)
summer_start = ascending(T75)
autumn_start = descending(T75)
winter_start = descending(T25)
```

La méthode exige :

```text
1 <= spring < summer < autumn < winter <= 365
```

Sinon le résultat de franchissement de l'année est `None` / `invalid_crossings`.

## 11. Durées annuelles

```text
spring_length = summer - spring
summer_length = autumn - summer
autumn_length = winter - autumn
```

Pour l'hiver :

```text
winter_length = (365 - winter) + next_spring
```

La dernière année de la série peut donc ne pas avoir de durée d'hiver si le printemps de l'année suivante n'est pas disponible.

## 12. Agrégation décennale

Pour les valeurs annuelles de chaque période :

```python
P25    = np.percentile(values, 25, method="linear")
median = np.percentile(values, 50, method="linear")
P75    = np.percentile(values, 75, method="linear")
```

## 13. Déplacement

Pour une frontière ou une durée :

```text
shift = median(late) - median(early)
```

Pour une date de début :

```text
shift < 0 → plus tôt
shift > 0 → plus tard
```

## 14. Contrat actuel

Le JSON conserve notamment :

- `thresholds.reference_period` ;
- `t25_c`, `t75_c` ;
- `percentile_method` ;
- `method.daily_aggregation` ;
- `method.leap_day` ;
- `method.smoothing` ;
- `method.crossing_interpolation` ;
- les quatre frontières annuelles ;
- les quatre durées ;
- `fit_rmse_c` ;
- `interpolated_days` ;
- les statistiques des trois décennies ;
- les déplacements entre première et dernière décennie ;
- les diagnostics de validation et de qualité.

## 15. Growing season

Le schéma actuel contient aussi des champs de saison de croissance et la spécification cite un indicateur Copernicus secondaire fondé sur un seuil absolu autour de 5 °C.

Cette grandeur ne définit pas les quatre saisons thermiques T25/T75. Elle doit rester clairement séparée de la méthode principale et, si elle est conservée dans le futur contrat, être déclarée comme indicateur secondaire avec sa propre méthode.

## 16. Migration vers le microservice

Le futur service doit séparer :

```text
compute.py    → frontières, durées, statistiques
signals.py    → constats déterministes dérivés
render.py     → SVG uniquement
validate.py   → schéma + contrôles scientifiques
```

Le renderer ne doit pas recalculer T25/T75 ni les dates.

## 17. Acquisition de production

Le POC utilise actuellement `reanalysis-era5-land-timeseries`. La documentation ECMWF indique que l'interface time-series est optimisée pour l'accès rapide à un point mais n'est pas recommandée comme interface de production stable.

La méthode scientifique dépend de **ERA5-Land / 2m_temperature**, pas de ce format d'accès particulier. `apps/copernicus` devra sélectionner un produit stable et P5 devra vérifier l'équivalence numérique.

## 18. Conditions avant validation

La méthode reste `draft` jusqu'à :

- P3 : règles d'interprétation ;
- P4 : conversion au contrat commun ;
- P5 : golden master et test d'équivalence ;
- décision explicite sur le statut de l'indicateur secondaire `growing_season` dans le futur service.
