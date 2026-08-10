# Validation réelle — thermal-seasons@4.0.0

## Résumé

Décision : **A — V4 apte à passer en validation scientifique.**

Le candidat V4 a été rejoué sur le ClimateSnapshot ERA5-Land réel P6, sans nouvelle acquisition de données. Les seuils thermiques communs 1991–2020, les deux climatologies décennales, le contrôle harmonic_2 / MA31 et les 1 000 réplications bootstrap appariées sont tous reproductibles. Les deux décennies passent la QA de sensibilité, les cinq signaux descriptifs sont produits, et aucune réplication bootstrap n'est invalide.

Cette décision autorise une revue scientifique ; elle ne change pas `thermal-seasons@4.0.0` de `candidate` à `validated` et n'autorise aucune publication publique.

## Snapshot et intégrité

Le replay utilise `poc/climat/saisons/output/raw/climate-snapshot.json` :

- `snapshot_id` : `SNAPSHOT-THERMAL-SEASONS-V1-20260810T040002Z` ;
- actif : `poc/climat/saisons/output/raw/era5-land.csv` ;
- SHA-256 recalculé : `e483a2de1c5cab29a95b4b0e1b69b8f53610a1e316fb120eeda8e9eff91d1a06`, conforme au manifeste ;
- source : Copernicus Climate Data Store / ECMWF, `reanalysis-era5-land-timeseries`, variable `2m_temperature` ;
- période : 1991-01-01 à 2025-12-31 ; `dataset_version` absent du manifeste ;
- point demandé : 44.06465392551458, 3.6829349237761435 ; point représenté : 44.1, 3.7 ; résolution 0.1° ;
- récupération : 2026-08-09T13:36:40.045020+00:00.

`verify_snapshot_asset` s'exécute avant le calcul. Les 31 tests du service passent avant replay.

Les preuves générées sont conservées sans réécriture scientifique dans [thermal-seasons-v4-replay.json](data/thermal-seasons-v4/thermal-seasons-v4-replay.json), [thermal-seasons-v1-v4-comparison.json](data/thermal-seasons-v4/thermal-seasons-v1-v4-comparison.json) et [thermal-seasons-v4-bootstrap.json](data/thermal-seasons-v4/thermal-seasons-v4-bootstrap.json). L'actif ERA5-Land brut n'est pas versionné.

## Définition scientifique V4

V4 mesure le déplacement entre deux climatologies quotidiennes de dix ans, 1996–2005 et 2016–2025. Chaque courbe est lissée par `harmonic_2` (canonique) et contrôlée par `circular_moving_average_31d`. Les frontières T25/T75 sont les bornes de l'intervalle thermique principal contenant le maximum annuel de la courbe lissée.

La durée d'été est calculée directement sur chaque courbe comme `autumn_start − summer_start`. Le bootstrap rééchantillonne les années entières avec remise, pas les jours ; il constitue un diagnostic d'incertitude descriptive.

## Seuils fixes 1991–2020

La climatologie de référence 1991–2020 donne `T25_ref = 4.896 °C` et `T75_ref = 16.380 °C`. Ces mêmes valeurs sont appliquées aux deux calculs centraux et à toutes les réplications bootstrap. Le résultat déclare explicitement :

```text
scope = common_fixed_reference
recomputed_per_decade = false
recomputed_per_bootstrap = false
```

Les tests vérifient que `compute_thresholds` n'est appelé qu'une fois lors du calcul V4. Le bootstrap est déterministe avec la graine `20260810`, l'unité `year`, 1 000 réplications et `replacement = true`.

## Résultats centraux V4

| Frontière / durée | 1996–2005 | 2016–2025 | Déplacement V4 |
|---|---:|---:|---:|
| Début printemps | 59.00 | 40.59 | -18.41 j |
| Début été | 156.83 | 150.61 | -6.22 j |
| Début automne | 255.57 | 264.85 | +9.28 j |
| Début hiver | 332.09 | 346.54 | +14.45 j |
| Durée été | 98.75 | 114.24 | +15.49 j |

Les deux statuts centraux sont `ok` et les cinq signaux ont `claim_level = descriptive`.

## Sensibilité harmonic_2 / MA31

| Décennie | Écart maximal | Frontière | Seuil robuste | Statut |
|---|---:|---|---:|---|
| 1996–2005 | 4.93 j | début automne | <= 5 j | `ok` |
| 2016–2025 | 4.86 j | début automne | <= 5 j | `ok` |

Les seuils V4 restent ceux définis avant replay : <=5 j robuste, >5 à <=10 j partiel/documenté, >10 j rejeté. Aucun seuil n'a été modifié après observation des résultats.

## Bootstrap early

1996–2005 : 1 000 réplications au total, 1 000 valides, 0 invalide, taux d'invalidité 0.000. Aucune cause d'invalidité n'est observée.

| Métrique | P05 | P25 | Médiane | P75 | P95 |
|---|---:|---:|---:|---:|---:|
| `spring_start_doy` | 48.57 | 54.90 | 58.93 | 62.78 | 67.56 |
| `summer_start_doy` | 152.59 | 155.18 | 156.90 | 158.97 | 161.23 |
| `autumn_start_doy` | 251.42 | 254.13 | 255.69 | 257.07 | 258.94 |
| `winter_start_doy` | 328.75 | 330.75 | 332.16 | 333.78 | 336.47 |
| `summer_length_days` | 92.58 | 95.98 | 98.50 | 100.99 | 104.54 |

## Bootstrap late

2016–2025 : 1 000 réplications au total, 1 000 valides, 0 invalide, taux d'invalidité 0.000. Aucune cause d'invalidité n'est observée.

| Métrique | P05 | P25 | Médiane | P75 | P95 |
|---|---:|---:|---:|---:|---:|
| `spring_start_doy` | 30.09 | 36.41 | 40.38 | 44.06 | 49.66 |
| `summer_start_doy` | 146.39 | 148.89 | 150.66 | 152.43 | 154.85 |
| `autumn_start_doy` | 262.63 | 263.91 | 264.84 | 265.81 | 267.21 |
| `winter_start_doy` | 339.69 | 343.52 | 346.52 | 349.71 | 353.93 |
| `summer_length_days` | 108.86 | 111.90 | 114.10 | 116.44 | 119.59 |

## Distribution bootstrap des différences

Les différences sont calculées directement, paire par paire, comme `late_i − early_i`. Les 1 000 paires sont valides ; 0 paire est invalide ; `valid_pair_rate = 1.000`.

| Signal | Central | P05 | P25 | Médiane | P75 | P95 | négatif | zéro | positif |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Printemps | -18.41 | -32.00 | -24.37 | -18.73 | -12.75 | -5.09 | 0.991 | 0.000 | 0.009 |
| Été | -6.22 | -12.51 | -8.89 | -6.39 | -3.73 | -0.20 | 0.958 | 0.001 | 0.041 |
| Automne | +9.28 | +5.22 | +7.59 | +9.21 | +11.06 | +14.17 | 0.000 | 0.000 | 1.000 |
| Hiver | +14.45 | +6.41 | +10.95 | +14.39 | +17.82 | +22.27 | 0.001 | 0.000 | 0.999 |
| Durée été | +15.49 | +7.62 | +12.20 | +15.72 | +18.94 | +23.77 | 0.001 | 0.000 | 0.999 |

Ces proportions décrivent les réplications bootstrap ; elles ne sont ni des p-values ni une déclaration de significativité.

## Taux de réplications invalides

| Diagnostic | Valeur |
|---|---:|
| `invalid_rate_early` | 0.000 |
| `invalid_rate_late` | 0.000 |
| `valid_pair_rate` | 1.000 |
| Causes early / late / paires | aucune |

Les causes possibles sont toutefois enregistrées explicitement par le code (`invalid_no_daily_coverage`, `invalid_smoothing`, `invalid_no_principal_regime`, `invalid_boundary_detection`, `invalid_crossing_order`) afin qu'un échec futur ne soit pas silencieusement exclu.

## Stabilité du signe

Le signe est conservé dans 99.1 % des réplications pour le printemps, 95.8 % pour l'été, 100 % pour l'automne, 99.9 % pour l'hiver et 99.9 % pour la durée d'été. Descriptivement, le printemps, l'automne, l'hiver et la durée d'été présentent un signe quasi uniforme ; l'été est majoritairement plus précoce, avec 4.1 % de réplications de signe opposé. Ces qualificatifs décrivent les proportions observées et ne constituent pas une règle de validation statistique cachée.

Les estimations centrales sont toutes proches des médianes bootstrap et à l'intérieur des intervalles P25–P75. Elles ne sont donc pas des valeurs isolées par rapport aux rééchantillonnages.

## Cohérence de la durée estivale

Les durées centrales satisfont exactement, avant arrondi :

```text
été early = 255.57 − 156.83 = 98.75 j
été late  = 264.85 − 150.61 = 114.24 j
changement de durée = 15.49 j
```

La même géométrie donne `autumn_shift − summer_shift = 9.28 − (-6.22) = 15.50 j`, soit 15.49 j à l'arrondi des valeurs affichées. Chaque réplication valide calcule sa durée d'été par cette même différence de frontières.

## Comparaison V1 / V4

| Signal | V1 | V4 | V4 − V1 |
|---|---:|---:|---:|
| Printemps | -1.66 | -18.41 | -16.75 |
| Été | -17.69 | -6.22 | +11.47 |
| Automne | +15.27 | +9.28 | -5.99 |
| Hiver | +5.59 | +14.45 | +8.86 |
| Durée été | +28.66 | +15.49 | -13.17 |

Ces méthodes n'estiment pas exactement le même objet. V1 calcule des frontières annuelles puis en agrège les médianes ; V4 calcule directement les frontières de chaque climatologie décennale à seuils fixes. Une différence V1/V4 n'est donc pas en elle-même un bug. Les deux résultats restent descriptifs, sans conclusion causale ni test de tendance.

## Limites

La validation porte sur ce seul snapshot ERA5-Land réel, à une résolution de 0.1°, et ne représente pas une mesure sur parcelle. Les distributions bootstrap décrivent la variabilité induite par le rééchantillonnage des dix années ; elles ne constituent pas des intervalles de confiance ou une preuve de significativité. Les couches publiques, le rendu SVG et le commentaire IA ne sont pas modifiés.

## Conclusion

**A — V4 apte à passer en validation scientifique.** Le replay P6 réel satisfait les invariants préenregistrés : seuils communs fixes 1991–2020, deux décennies centrales `ok`, écarts harmonic_2 / MA31 inférieurs ou égaux à 5 jours, cinq signaux descriptifs, bootstrap reproductible, zéro réplication invalide, paires bootstrap complètes, géométrie de la durée estivale cohérente et provenance complète disponible dans le résultat. Le statut de méthode reste néanmoins `candidate` et sa publication demeure interdite jusqu'à la décision de gouvernance distincte.
