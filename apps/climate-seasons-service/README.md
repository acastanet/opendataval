# climate-seasons-service

Deuxième microservice scientifique natif P6 du domaine climat OpenDataVal.

Méthode : `thermal-seasons@1.0.0`.

## Responsabilité

Le service transforme une série horaire ERA5-Land `2m_temperature` ou un `ClimateSnapshot` mono-actif vérifié en :

```text
ClimateResult
├── data
│   ├── T25 / T75 de référence 1991–2020
│   ├── 30 années 1996–2025
│   ├── quatre frontières thermiques
│   ├── durées saisonnières
│   ├── agrégations décennales P25/médiane/P75
│   └── cinq comparaisons early/late
└── signals
    └── 5 ClimateSignal descriptifs
```

Les saisons sont **thermiques et locales**. Elles ne doivent pas être présentées comme les saisons météorologiques fixes DJF/MAM/JJA/SON.

## Règles scientifiques figées

- ERA5-Land `2m_temperature`, grille 0,1° ;
- moyenne quotidienne UTC, jour valide avec au moins 18 valeurs horaires ;
- année valide avec au moins 98 % des 365 jours observés avant interpolation ;
- interpolation linéaire uniquement pour les lacunes <= 2 jours ;
- suppression du 29 février ;
- climatologie quotidienne 1991–2020 ;
- T25/T75, percentile `linear` ;
- lissage polynomial degré 3 pour la détection des franchissements seulement ;
- printemps : T25 ascendant ; été : T75 ascendant ; automne : T75 descendant ; hiver : T25 descendant ;
- ordre obligatoire `spring < summer < autumn < winter` ;
- agrégation décennale P25/médiane/P75 ;
- déplacement = médiane 2016–2025 − médiane 1996–2005 ;
- comparaison descriptive sans test de tendance.

## Snapshot P6

Le snapshot saisons contient un seul actif :

```text
era5-land.csv
```

Le service vérifie son SHA-256 avant calcul. Il ne télécharge pas de données CDS au runtime scientifique.

La requête historique correspond à :

```text
dataset  reanalysis-era5-land-timeseries
variable 2m_temperature
format   csv
période  1991-01-01 / 2025-12-31
grille   point ERA5-Land 0,1° le plus proche
```

## Validation

Trois niveaux :

1. **parité algorithmique** POC ↔ service natif sur les mêmes séries horaires ;
2. **replay snapshot** CSV + SHA-256 sur fixture sérialisée ;
3. **replay réel** de `poc/climat/saisons/output/raw/era5-land.csv` contre `tests/fixtures/thermal-seasons-fixture.json`.

Le golden master P5 fixe notamment :

```text
spring_start_shift_days  = -1.66
summer_start_shift_days  = -17.69
autumn_start_shift_days  = +15.27
winter_start_shift_days  = +5.59
summer_length_change_days = +28.66
annual_ok = 29 / 30
```

## Tests

```bash
python -m pip install -r apps/climate-seasons-service/requirements-test.txt
python -m unittest discover -s apps/climate-seasons-service/tests -p "test_*.py" -v
```

## Replay réel local

Depuis la racine du dépôt :

```bash
python apps/climate-seasons-service/scripts/verify_golden_replay.py \
  poc/climat/saisons/output/raw
```

La commande utilise uniquement `era5-land.csv`, construit un snapshot, vérifie le SHA-256, rejoue le calcul natif et compare le payload scientifique au golden master avec une tolérance de `0.0`.

Résultat attendu :

```text
PASS — thermal-seasons P6 reproduit le golden master V1 à tolérance nulle.
```

## Hors périmètre de cette tranche

- téléchargement CDS ;
- API HTTP ;
- rendu SVG/HTML ;
- commentaire IA ;
- orchestration de la fiche climat.
