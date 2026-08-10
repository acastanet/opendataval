# Validation P6 — Water Through Year V1

Méthode : `water-through-year@1.0.0`  
Service : `apps/climate-water-service`  
Statut : **PASS — validated**

## Résultat

Le service natif P6 reproduit le golden master V1 à **tolérance numérique `0.0`** à partir des actifs Copernicus réels.

Valeurs de contrôle :

```text
annual_precip_change_pct       = -9.19
summer_soil_water_change_mm    = -11.78
dry_months_change              = -1.0
valid_months                   = 420 / 420
signal_count                   = 3
```

## Actifs rejoués

Le replay utilise exactement deux actifs dans le `ClimateSnapshot` :

```text
era5-land-monthly.nc
era5-drought-spei3.nc
```

Les deux actifs sont contrôlés par SHA-256 avant lecture.

`era5-land-monthly.nc` a été reconstitué localement à partir des trois fragments mensuels couvrant 1991–2025. Les fragments sources n'ont pas été modifiés ; la reconstruction sert uniquement à fournir l'actif canonique attendu par le replay P6.

Les données brutes et les artefacts de replay restent hors Git.

## Incident réel détecté par le replay

Le replay des fichiers ERA5-Drought a révélé un cas non couvert par les fixtures initiales : un fichier SPEI mensuel contenant un seul pas de temps pouvait perdre sa date après sélection spatiale si toutes les dimensions singleton étaient supprimées.

Le lecteur P6 a été corrigé pour :

- préserver systématiquement la dimension temporelle (`time`, `valid_time` ou `date`) ;
- ne supprimer que les dimensions spatiales singleton ;
- conserver la date d'un fichier SPEI mensuel unitaire après sélection du point de grille.

Un test de régression reproduit explicitement un fichier SPEI à un seul mois et vérifie la conservation de son horodatage après sélection latitude/longitude.

## Niveaux de validation

1. parité algorithmique POC ↔ service natif — **PASS** ;
2. contrats `ClimateResult` / `ClimateSignal` P4 — **PASS** ;
3. golden target P5 — **PASS** ;
4. snapshot deux NetCDF + contrôle SHA-256 — **PASS** ;
5. replay sérialisé — **PASS** ;
6. replay des actifs Copernicus réels — **PASS à tolérance `0.0`** ;
7. suite locale après correctif SPEI — **9 tests PASS** ;
8. CI GitHub sur le head contenant le correctif SPEI — **PASS**.

## Artefacts locaux produits

Le replay produit localement :

```text
poc/climat/bilan eau/output/p6-water-replay/
├── climate-result.json
└── golden-replay-report.json
```

Le `climate-snapshot.json` reste avec les actifs bruts. Ces fichiers de travail ne sont pas versionnés.

## Conclusion

Le bloqueur `native_service_equivalence_pending_p6` est levé. `water-through-year@1.0.0` peut être déclaré **validated** et le service natif devient la référence de calcul pour la suite du pipeline.
