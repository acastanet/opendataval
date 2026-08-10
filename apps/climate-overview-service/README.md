# climate-overview-service

Quatrième microservice scientifique natif P6 du domaine climat OpenDataVal.

Méthode : `climate-overview@1.0.0` — **validated**.

## Responsabilité

Le service produit le portrait climatologique de référence **« Le climat de la zone »** à partir de deux séries ERA5-Land :

```text
era5-land.csv                  → température 2 m
era5-land-precipitation.csv    → précipitations
```

Le noyau canonique V1 est limité à :

- cycle mensuel de température 1991–2020 : moyenne, P10, P50, P90 ;
- cycle mensuel de précipitations 1991–2020 : moyenne, P10, P50, P90 ;
- température moyenne annuelle ;
- précipitations annuelles moyennes ;
- mois le plus chaud / froid / humide / sec ;
- représentativité de la maille ERA5-Land.

Le service émet **7 ClimateSignal descriptifs**.

## Ce que P6 exclut volontairement

Les trois champs historiques du POC :

```text
frost_days_mean
hot_days_30c_mean
tropical_nights_20c_mean
```

étaient approximés à partir de la température moyenne journalière. Ils sont **non canoniques** et ne sont ni recalculés ni émis comme signaux P6. Leur éventuelle réintroduction exigera de vraies températures quotidiennes min/max et une méthode dédiée.

Ils ne bloquent pas la validation du noyau canonique V1 actuel.

## Représentativité

Pour le cas point / petite zone OpenDataVal, la V1 utilise le point de grille ERA5-Land 0,1° représentatif et conserve explicitement :

- point demandé ;
- point de grille représenté ;
- résolution 0,1° ;
- absence de downscaling artificiel.

Le support multi-cellules des polygones plus grands reste dans la méthode générale mais n'est pas nécessaire pour valider ce slice P6 point contre le golden master actuel.

## ClimateSnapshot

Le service réutilise deux actifs ERA5-Land déjà acquis dans la chaîne climat et ne télécharge rien au runtime :

```text
era5-land.csv
era5-land-precipitation.csv
```

Les actifs couvrent 1991–2025 ; le calcul overview consomme uniquement 1991–2020. Le snapshot conserve honnêtement la couverture complète des actifs et vérifie leurs SHA-256 avant calcul.

Pour éviter d'écraser un autre snapshot dans un dossier `raw` partagé, son manifeste s'appelle :

```text
climate-overview-snapshot.json
```

## Golden master

La cible P5 fixe notamment :

```text
mean_temperature_c = 11.1
precipitation_mm   = 1327.3
warmest_month      = Juillet
coldest_month      = Janvier
wettest_month      = Octobre
driest_month       = Juillet
monthly_count      = 12
grid_cell_count    = 1
signal_count       = 7
```

Le comparateur P6 ignore explicitement les trois anciens compteurs d'extrêmes non canoniques.

## Validation P6 — PASS

Le replay réel a été exécuté avec la copie déjà validée des deux CSV située sous :

```text
poc/climat/saisons/output/raw
```

Cette copie est identique aux actifs déjà validés dans la chaîne climat.

Résultat :

```text
PASS — climate-overview P6 reproduit le golden master V1 à tolérance nulle.
```

Validation confirmée :

- deux actifs vérifiés par SHA-256 ;
- 12 mois climatologiques ;
- 7 signaux canoniques ;
- équivalence au golden master P5 ;
- tolérance numérique `0.0` ;
- aucun downscaling artificiel.

Attestation :

```text
doc/climat/validations/climate-overview-v1-p6.md
```

## Tests

```bash
python -m pip install -r apps/climate-overview-service/requirements-test.txt
python -m unittest discover -s apps/climate-overview-service/tests -p "test_*.py" -v
```

## Replay réel local

Le script accepte n'importe quel dossier contenant les deux CSV attendus. Dans le replay de validation, le dossier utilisé était :

```bash
python apps/climate-overview-service/scripts/verify_golden_replay.py \
  "poc/climat/saisons/output/raw"
```

Les fichiers bruts et les artefacts de replay restent volontairement hors Git.

## Hors périmètre de cette tranche

- tendance climatique ;
- downscaling ;
- compteurs gel/chaleur sans vraies Tmin/Tmax ;
- renderer SVG P7 ;
- commentaire IA ;
- API HTTP.
