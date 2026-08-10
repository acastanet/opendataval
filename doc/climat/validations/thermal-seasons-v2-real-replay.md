# Validation réelle — thermal-seasons@2.0.0

Date de replay : 2026-08-10
Conclusion : **C — V2 rejetée dans son état actuel.**

Cette validation compare le candidat `thermal-seasons@2.0.0` à `thermal-seasons@1.0.0`, sans modifier ni la méthode V1, ni les données ERA5-Land, ni le statut de publication de V2.

## Snapshot utilisé

Le replay utilise `poc/climat/saisons/output/raw/climate-snapshot.json`, soit le snapshot réel de la validation P6 V1 :

- `snapshot_id` : `SNAPSHOT-THERMAL-SEASONS-V1-20260810T040002Z` ;
- actif : `poc/climat/saisons/output/raw/era5-land.csv` ;
- source : Copernicus Climate Data Store / ECMWF, `reanalysis-era5-land-timeseries`, variable `2m_temperature` ;
- période : 1991-01-01 à 2025-12-31 ;
- point demandé : 44.06465392551458, 3.6829349237761435 ; point de grille : 44.1, 3.7 (0.1°).

## Intégrité et provenance

Le SHA-256 calculé de l'actif est `e483a2de1c5cab29a95b4b0e1b69b8f53610a1e316fb120eeda8e9eff91d1a06`. Il correspond exactement à la valeur du manifeste P6. `verify_snapshot_asset` a de nouveau contrôlé cette valeur avant le replay.

Les sorties V1 et V2 portent le même `snapshot_id`, la même source, le même point de grille, les mêmes périodes 1991–2020 (référence) et 1996–2025 (comparaison), les mêmes seuils calculés (`T25 = 4.896 °C`, `T75 = 16.380 °C`) et la même série de températures journalières UTC sans jour bissextile. La seule divergence voulue est le lissage : V1 `polynomial_degree_3`; V2 `harmonic_2`, contrôlé par `circular_moving_average_31d`, avec QA RMSE, sensibilité et N+1.

Les preuves générées sans édition manuelle sont conservées dans [thermal-seasons-v1-v2-comparison.json](data/thermal-seasons-v2/thermal-seasons-v1-v2-comparison.json). Les trois sorties originales de la commande de replay restent dans `output/thermal-seasons-v2-validation/`; l'actif CSV brut n'est pas versionné.

La suite `python -m unittest discover -s apps/climate-seasons-service/tests -p "test_*.py" -v` a passé **20 tests sur 20** avant le replay.

## Résultats V1

V1 est `partial` au niveau global, avec 29 années `ok` sur 30 (1996 a `invalid_crossings`), et produit les cinq signaux de comparaison :

| Indicateur | V1 (jours) |
|---|---:|
| `spring_start_shift_days` | -1.66 |
| `summer_start_shift_days` | -17.69 |
| `autumn_start_shift_days` | +15.27 |
| `winter_start_shift_days` | +5.59 |
| `summer_length_change_days` | +28.66 |

## Résultats V2

V2 est `insufficient` : 1 année `ok` (2008), 15 `partial` et 14 rejetées (`smoother_sensitivity_rejected` ou `invalid_crossings`). Ses cinq signaux et ses médianes décennales sont donc tous `null`.

## Comparaison V1 / V2

| Indicateur | V1 | V2 | V2 − V1 |
|---|---:|---:|---:|
| `spring_start_shift_days` | -1.66 | — | — |
| `summer_start_shift_days` | -17.69 | — | — |
| `autumn_start_shift_days` | +15.27 | — | — |
| `winter_start_shift_days` | +5.59 | — | — |
| `summer_length_change_days` | +28.66 | — | — |

L'écart V2 − V1 ne peut pas être calculé : V2 n'a aucune décennie éligible, pas parce qu'une valeur aurait été masquée. Il n'existe donc aucun changement de signe scientifiquement interprétable entre V1 et V2 sur ce replay.

## Distribution RMSE

Le seuil V2 est le P95 linéaire des RMSE harmoniques annuels 1991–2020 : **2.877 °C**. Sur les 30 années d'étude : minimum 2.191 °C, P25 2.437 °C, médiane 2.482 °C, P75 2.638 °C, P95 2.877 °C et maximum 3.121 °C.

Les seules années au-dessus du seuil sont 2001 (2.944 °C) et 2012 (3.121 °C) ; elles sont `partial` avec `fit_rmse_above_reference_p95` et ne participent à aucune médiane. Plus largement, la sélection décennale V2 ne retient que `status = ok`; les deux comparaisons sont nulles faute de huit années admissibles.

## Sensibilité harmonic / moving-average

La distribution ne contient que les 21 années où les franchissements du contrôle existent : 1 année à <= 3 j, 8 à > 3 et <= 10 j, 12 à > 10 j. Médiane 11.44 j, P95 21.16 j, maximum 104.22 j.

Le maximum est l'année 1997, frontière de début d'automne : `harmonic_2 = 266.29` et moyenne mobile 31 j = `162.07`, soit 104.22 j. Les autres écarts 1997 sont 2.99 j (printemps), 17.78 j (été) et 4.89 j (hiver). Cette divergence dépasse très largement le seuil de rejet de 10 jours.

Sept années sont `partial` car les franchissements du contrôle sont indisponibles (1996, 2007, 2014, 2016, 2018, 2022, 2023). Deux sont `partial` pour RMSE et sensibilité (2001, 2012), huit pour sensibilité >3 j et <=10 j, douze sont rejetées pour sensibilité >10 j, et 2015/2025 ont des franchissements canoniques invalides.

## QA annuelle

Les différences ci-dessous sont **V2 − V1**, en jours, pour les frontières et la durée d'été. `—` indique qu'une des deux frontières n'est pas disponible.

| année | V1 | V2 | RMSE V2 (°C) | écart H2/MA31 (j) | Δ printemps | Δ été | Δ automne | Δ hiver | Δ durée été | raison QA V2 |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 1996 | invalid_crossings | partial | 2.48 | — | — | — | — | — | — | control_crossings_unavailable |
| 1997 | ok | smoother_sensitivity_rejected | 2.45 | 104.22 | -6.01 | +6.25 | +8.03 | -11.24 | +1.78 | smoother_sensitivity_gt_10d |
| 1998 | ok | partial | 2.48 | 5.92 | +0.33 | -18.67 | +2.22 | -13.74 | +20.88 | smoother_sensitivity_gt_3d |
| 1999 | ok | partial | 2.47 | 8.49 | +9.88 | -11.27 | -3.43 | -7.20 | +7.84 | smoother_sensitivity_gt_3d |
| 2000 | ok | smoother_sensitivity_rejected | 2.29 | 14.21 | +6.03 | -20.17 | +2.78 | -0.81 | +22.95 | smoother_sensitivity_gt_10d |
| 2001 | ok | partial | 2.94 | 9.35 | +9.97 | -10.98 | -5.26 | -4.03 | +5.73 | smoother_sensitivity_gt_3d; fit_rmse_above_reference_p95 |
| 2002 | ok | smoother_sensitivity_rejected | 2.33 | 11.93 | -2.35 | -20.54 | +4.94 | +4.58 | +25.47 | smoother_sensitivity_gt_10d |
| 2003 | ok | smoother_sensitivity_rejected | 2.71 | 13.89 | +19.01 | -3.87 | -13.87 | -8.22 | -10.00 | smoother_sensitivity_gt_10d |
| 2004 | ok | smoother_sensitivity_rejected | 2.50 | 12.52 | +18.62 | -17.63 | -10.18 | -1.01 | +7.45 | smoother_sensitivity_gt_10d |
| 2005 | ok | partial | 2.68 | 6.61 | +17.48 | -16.58 | -12.73 | -1.93 | +3.84 | smoother_sensitivity_gt_3d |
| 2006 | ok | smoother_sensitivity_rejected | 2.47 | 11.67 | +18.78 | -13.49 | -14.20 | +3.21 | -0.71 | smoother_sensitivity_gt_10d |
| 2007 | ok | partial | 2.74 | — | +10.52 | -18.47 | +5.36 | -3.98 | +23.83 | control_crossings_unavailable |
| 2008 | ok | ok | 2.33 | 2.67 | +11.21 | -23.77 | +0.76 | -7.84 | +24.52 | — |
| 2009 | ok | partial | 2.48 | 4.86 | +10.74 | -5.46 | -7.26 | -5.32 | -1.80 | smoother_sensitivity_gt_3d |
| 2010 | ok | partial | 2.80 | 7.35 | +13.48 | -13.19 | -2.03 | -11.74 | +11.16 | smoother_sensitivity_gt_3d |
| 2011 | ok | partial | 2.36 | 9.76 | +9.60 | -6.70 | -2.10 | +0.64 | +4.59 | smoother_sensitivity_gt_3d |
| 2012 | ok | partial | 3.12 | 7.97 | +10.80 | -10.10 | -7.31 | -4.89 | +2.79 | smoother_sensitivity_gt_3d; fit_rmse_above_reference_p95 |
| 2013 | ok | smoother_sensitivity_rejected | 2.67 | 11.80 | +13.40 | -16.81 | -7.29 | -3.90 | +9.52 | smoother_sensitivity_gt_10d |
| 2014 | ok | partial | 2.19 | — | +11.45 | -12.21 | -5.92 | +11.92 | +6.30 | control_crossings_unavailable |
| 2015 | ok | invalid_crossings | 2.47 | — | — | — | — | — | — | invalid_crossings |
| 2016 | ok | partial | 2.22 | — | -8.48 | -12.94 | -11.34 | +6.24 | +1.61 | control_crossings_unavailable |
| 2017 | ok | smoother_sensitivity_rejected | 2.70 | 11.06 | +1.64 | +1.98 | -2.62 | -9.71 | -4.61 | smoother_sensitivity_gt_10d |
| 2018 | ok | partial | 2.56 | — | +22.90 | -13.36 | -18.55 | +16.26 | -5.18 | control_crossings_unavailable |
| 2019 | ok | smoother_sensitivity_rejected | 2.44 | 21.16 | -6.69 | -2.06 | -11.86 | -1.74 | -9.80 | smoother_sensitivity_gt_10d |
| 2020 | ok | smoother_sensitivity_rejected | 2.37 | 11.44 | -15.04 | -2.05 | -9.19 | +3.30 | -7.14 | smoother_sensitivity_gt_10d |
| 2021 | ok | smoother_sensitivity_rejected | 2.44 | 13.25 | -6.59 | -7.36 | -1.10 | -9.70 | +6.27 | smoother_sensitivity_gt_10d |
| 2022 | ok | partial | 2.51 | — | +16.11 | -2.88 | -18.29 | +14.63 | -15.41 | control_crossings_unavailable |
| 2023 | ok | partial | 2.52 | — | +8.50 | -3.50 | -13.65 | +5.13 | -10.16 | control_crossings_unavailable |
| 2024 | ok | smoother_sensitivity_rejected | 2.55 | 14.82 | -23.42 | -1.29 | -10.79 | +11.65 | -9.50 | smoother_sensitivity_gt_10d |
| 2025 | ok | invalid_crossings | 2.50 | — | — | — | — | — | — | invalid_crossings |

## Contrôle N+1

La règle est bien appliquée dans le replay : une durée d'hiver n'est définie que si le printemps canonique N+1 est `ok`. Le cas explicite 1996 → 1997 le démontre : 1997 est `smoother_sensitivity_rejected`, donc `winter_length_days(1996) = null` avec `winter_length_status = next_year_spring_not_qa_validated`. Inversement, l'unique durée hivernale renseignée est 2007 (89.98 j), car 2008 est l'unique année `ok`.

Aucune frontière N+1 `partial`, rejetée ou à franchissements invalides n'est réinjectée silencieusement.

## Comparaisons décennales

| Fenêtre | Années V2 `ok` | Minimum requis | Résultat |
|---|---:|---:|---|
| 1996–2005 | 0 | 8 | échec — aucune médiane ni signal |
| 2016–2025 | 0 | 8 | échec — aucune médiane ni signal |

Les conditions `early_ok >= 8` et `late_ok >= 8` sont toutes deux fausses. Le gate de publication échoue et les cinq résultats V2 sont indisponibles.

## Changements d'interprétation

V1 décrit respectivement un printemps légèrement plus tôt, un été plus tôt, un automne plus tard, un hiver plus tard et un été plus long. V2 ne produit aucune direction, car les exigences QA éliminent les deux décennies. Il serait donc incorrect de conclure à une conservation ou à une inversion de signe ; l'absence de résultats V2 empêche précisément cette comparaison scientifique.

## Limites

Ce rapport évalue ce candidat sur un seul snapshot réel P6 et n'ajoute aucune conclusion statistique ou causale. Il ne modifie ni `thermal-seasons@1.0.0`, ni le statut `candidate` et l'interdiction de publication de V2, ni le rendu ou le commentaire IA.

## Conclusion

**C — V2 rejetée dans son état actuel.** Sur le snapshot ERA5-Land réel P6, les deux lissages circulaires ne sont pas suffisamment cohérents : 12 années excèdent 10 jours et l'écart maximal atteint 104.22 jours. Avec seulement une année `ok` et zéro année `ok` dans chacune des fenêtres décennales critiques, V2 ne peut ni produire les cinq signaux ni remplacer scientifiquement V1. Toute évolution demanderait une nouvelle investigation méthodologique et une nouvelle validation, sans requalifier ce replay a posteriori.
