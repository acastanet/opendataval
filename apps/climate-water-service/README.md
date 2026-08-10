# climate-water-service

Troisième microservice scientifique natif P6/P7 du domaine climat OpenDataVal.

Méthode : `water-through-year@1.0.0` — **validated**.

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
├── signals
│   └── 3 ClimateSignal descriptifs
└── renderer P7
    └── water-through-year-v1-neutral.svg
```

Le renderer lit uniquement `ClimateResult.data` : il ne recalcule ni agrégation, ni percentile, ni comparaison hydroclimatique.

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

Le lecteur SPEI préserve explicitement la dimension temporelle des fichiers mensuels unitaires après sélection spatiale. Un test de régression couvre ce cas réel détecté pendant le replay P6.

## Validation P6 — PASS

Les trois niveaux principaux sont passés :

1. parité algorithmique POC ↔ natif sur les mêmes séries mensuelles — **PASS** ;
2. replay d'un `ClimateSnapshot` sérialisé + contrôle SHA-256 — **PASS** ;
3. replay réel des deux actifs Copernicus contre le golden master P5 — **PASS à tolérance `0.0`**.

Le golden master fixe notamment :

```text
annual_precip_change_pct       = -9.19
summer_soil_water_change_mm    = -11.78
dry_months_change              = -1.0
valid_months                   = 420 / 420
signal_count                   = 3
```

Le replay réel a utilisé un `era5-land-monthly.nc` reconstitué à partir des trois fragments mensuels 1991–2025 sans modifier les originaux.

L'attestation complète est conservée dans :

```text
doc/climat/validations/water-through-year-v1-p6.md
```

## Renderer P7

Le rendu canonique est le thème neutre :

```text
water-through-year-v1-neutral.svg
```

Le renderer natif reprend la composition V1 du POC et n'accède qu'aux valeurs déjà sérialisées dans le résultat scientifique.

La CI compare le renderer historique et le renderer natif sur :

```text
poc/climat/bilan eau/output/water-through-year.json
```

et exige une **égalité textuelle complète du SVG**.

Pour rendre un `ClimateResult` existant :

```bash
python apps/climate-water-service/scripts/render_climate_result.py \
  "poc/climat/bilan eau/output/p6-water-replay/climate-result.json"
```

La sortie par défaut est créée à côté du JSON :

```text
water-through-year-v1-neutral.svg
```

Le replay complet P6 génère également ce SVG automatiquement.

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

Résultat validé :

```text
PASS — water-through-year P6 reproduit le golden master V1 à tolérance nulle.
```

## Hors périmètre

- téléchargement CDS ;
- API HTTP ;
- commentaire IA ;
- recharge de nappe, débit de rivière ou réserve utile.
