# climate-water-service

Troisième microservice scientifique natif P6 du domaine climat OpenDataVal.

Méthode : `water-through-year@1.0.0` — **draft / validation P6 en cours**.

## Responsabilité

Le service transforme deux actifs Copernicus mensuels vérifiés en :

```text
ClimateResult
├── data
│   ├── cycle mensuel des précipitations
│   ├── stock d'eau modélisé 0–100 cm
│   ├── évapotranspiration réelle modélisée
│   ├── SPEI-3
│   └── comparaison 1996–2005 / 2016–2025
└── signals
    └── 3 ClimateSignal descriptifs
```

Il ne télécharge pas les données CDS et ne produit pas encore de SVG/HTML.

## Entrées canoniques

Deux fichiers uniquement :

```text
era5-land-monthly.nc
era5-drought-spei3.nc
```

Le premier provient de `reanalysis-era5-land-monthly-means` avec :

- `total_precipitation` ;
- `volumetric_soil_water_layer_1` ;
- `volumetric_soil_water_layer_2` ;
- `volumetric_soil_water_layer_3` ;
- `total_evaporation`.

Le second provient de `derived-drought-historical-monthly`, SPEI-3.

## Règles scientifiques figées

- référence 1991–2020 ; étude 1996–2025 ;
- produit ERA5-Land `monthly_averaged_reanalysis` ;
- accumulation mensuelle pluie/ETa : `valeur * 1000 * jours_du_mois` ;
- évapotranspiration affichée positive : `-total_evaporation` ;
- stock modélisé 0–100 cm : `1000 × (0.07 θ1 + 0.21 θ2 + 0.72 θ3)` ;
- statistiques mensuelles P25/médiane/P75, méthode `linear` ;
- position du stock par rapport au même mois de la référence ;
- pluie annuelle : médiane décennale tardive vs précoce en % ;
- stock estival : médiane de la moyenne JJA, tardif moins précoce en mm ;
- mois secs : `SPEI-3 < -1`, nombre annuel seulement si les 12 mois sont valides ;
- comparaison descriptive, sans test de tendance.

Le stock 0–100 cm n'est ni une réserve utile, ni une observation locale, ni une mesure d'eau disponible pour les plantes.

## ClimateSnapshot P6

Le snapshot contient exactement deux actifs. Pour chacun il conserve : dataset, variables, période, point demandé, maille représentée, paramètres CDS, horodatage de récupération, URI relative et SHA-256.

Le replay vérifie les deux hashes **avant** de charger les NetCDF.

## Validation P6

Trois niveaux :

1. parité algorithmique POC ↔ natif sur les mêmes séries mensuelles ;
2. replay d'un `ClimateSnapshot` sérialisé + contrôle SHA-256 ;
3. replay réel des deux actifs Copernicus contre le golden master P5 à tolérance `0.0`.

Le golden master fixe notamment :

```text
annual_precip_change_pct       = -9.19
summer_soil_water_change_mm    = -11.78
dry_months_change              = -1.0
valid_months                   = 420 / 420
signal_count                   = 3
```

## Tests

```bash
python -m pip install -r apps/climate-water-service/requirements-test.txt
python -m unittest discover -s apps/climate-water-service/tests -p "test_*.py" -v
```

## Replay réel local

Depuis la racine du dépôt :

```bash
python apps/climate-water-service/scripts/verify_golden_replay.py \
  "poc/climat/bilan eau/output/raw"
```

Le dossier doit contenir :

```text
era5-land-monthly.nc
era5-drought-spei3.nc
```

Résultat attendu :

```text
PASS — water-through-year P6 reproduit le golden master V1 à tolérance nulle.
```

## Hors périmètre de cette tranche

- téléchargement CDS ;
- API HTTP ;
- rendu SVG/HTML ;
- commentaire IA ;
- recharge de nappe, débit de rivière ou réserve utile.
