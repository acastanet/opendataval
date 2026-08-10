# climate-overview-service

Quatrième microservice scientifique natif P6/P7 du domaine climat OpenDataVal.

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

Pour le cas point / petite zone OpenDataVal, la V1 utilise le point de grille ERA5-Land 0,1° représentatif et conserve explicitement le point demandé, le point de grille représenté, la résolution 0,1° et l'absence de downscaling artificiel.

## ClimateSnapshot

Le service réutilise deux actifs ERA5-Land déjà acquis dans la chaîne climat et ne télécharge rien au runtime :

```text
era5-land.csv
era5-land-precipitation.csv
```

Les actifs couvrent 1991–2025 ; le calcul overview consomme uniquement 1991–2020. Le snapshot conserve leur couverture complète et vérifie leurs SHA-256 avant calcul.

Le manifeste dédié s'appelle `climate-overview-snapshot.json` afin de ne pas écraser un autre snapshot présent dans le même dossier `raw`.

## Validation P6 — PASS

Le replay réel a utilisé la copie déjà validée située sous :

```text
poc/climat/saisons/output/raw
```

Résultat :

```text
PASS — climate-overview P6 reproduit le golden master V1 à tolérance nulle.
```

Le golden master fixe notamment `11.1 °C`, `1327.3 mm/an`, juillet comme mois le plus chaud et le plus sec, janvier comme mois le plus froid, octobre comme mois le plus humide, 12 mois climatologiques et 7 signaux canoniques.

Attestation : `doc/climat/validations/climate-overview-v1-p6.md`.

## Renderer P7

Le renderer natif transforme uniquement `ClimateResult.data` en SVG ; il ne recalcule aucune donnée scientifique.

Chaîne :

```text
ClimateResult
      ↓
renderer P7
      ↓
climate-overview-v1-neutral.svg
```

Commande locale :

```bash
python apps/climate-overview-service/scripts/render_climate_result.py /chemin/vers/climate-result.json
```

Le test `test_renderer.py` exécute le renderer POC historique et le renderer natif sur le même document de référence et exige une égalité textuelle complète du SVG.

Le replay réel produit désormais automatiquement `climate-overview-v1-neutral.svg` dans son dossier de travail.

## Tests

```bash
python -m pip install -r apps/climate-overview-service/requirements-test.txt
python -m unittest discover -s apps/climate-overview-service/tests -p "test_*.py" -v
```

## Replay réel local

```bash
python apps/climate-overview-service/scripts/verify_golden_replay.py \
  "poc/climat/saisons/output/raw"
```

Les fichiers bruts et les artefacts de replay restent volontairement hors Git.

## Hors périmètre

- tendance climatique ;
- downscaling ;
- compteurs gel/chaleur sans vraies Tmin/Tmax ;
- commentaire IA ;
- API HTTP.
