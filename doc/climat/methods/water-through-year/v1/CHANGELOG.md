# Changelog — Water Through Year V1

## 1.0.0 — service natif P6 validé

Statut : `validated`.

### Figé

- ERA5-Land `monthly_averaged_reanalysis` pour précipitations, humidité du sol et évaporation ;
- ERA5-Drought SPEI-3 ;
- référence 1991–2020 ;
- étude 1996–2025 ;
- profils mensuels P25 / médiane / P75 ;
- stock modélisé 0–100 cm : `1000 × (0.07 θ1 + 0.21 θ2 + 0.72 θ3)` ;
- conversion pluie/ETa : valeur mensuelle moyenne quotidienne × 1000 × jours du mois ;
- trois comparaisons : précipitations annuelles, stock JJA, nombre de mois SPEI-3 < -1.

### P3 / P4 / P5 — PASS

- règles d'interprétation et caveats documentés ;
- contrats `ClimateSnapshot`, `ClimateResult` et `ClimateSignal` définis ;
- golden master P5 versionné ;
- cible P5 : `-9.19 %`, `-11.78 mm`, `-1.0 mois/an` ;
- 420/420 mois valides pour les quatre variables principales.

### P6 — PASS

- `climate-water-service` natif créé ;
- parité algorithmique POC ↔ natif : PASS en CI ;
- `ClimateResult` natif et trois signaux : PASS ;
- snapshot deux actifs NetCDF + SHA-256 : PASS ;
- replay snapshot sérialisé : PASS ;
- replay des actifs Copernicus réels contre le golden master : **PASS à tolérance `0.0`** ;
- `era5-land-monthly.nc` reconstitué à partir des trois fragments mensuels 1991–2025 sans altérer les originaux ;
- cas réel SPEI mensuel unitaire corrigé : la dimension temporelle est désormais préservée après sélection spatiale ;
- test de régression dédié ajouté ;
- suite locale après correctif SPEI : **9 tests PASS**.

Attestation : `doc/climat/validations/water-through-year-v1-p6.md`.

### Hors V1

Les métriques secondaires ruissellement/neige restent hors du produit interprétable tant qu'elles ne disposent pas de `ClimateSignal` dédié.
