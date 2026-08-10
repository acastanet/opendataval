# Changelog — Water Through Year V1

## 1.0.0 — service natif P6 en validation

Statut : `draft` jusqu'au replay réel des deux actifs Copernicus.

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

### P6 — état courant

- `climate-water-service` natif créé ;
- parité algorithmique POC ↔ natif : PASS en CI ;
- `ClimateResult` natif et trois signaux : PASS ;
- snapshot deux actifs NetCDF + SHA-256 : PASS ;
- replay snapshot sérialisé : PASS ;
- replay des actifs Copernicus réels contre le golden master : **à exécuter**.

Le passage à `validated` est conditionné au replay réel à tolérance numérique `0.0`.

### Hors V1

Les métriques secondaires ruissellement/neige restent hors du produit interprétable tant qu'elles ne disposent pas de `ClimateSignal` dédié.
