# climate-fingerprint-service

Service scientifique natif du domaine climat OpenDataVal.

Méthode : `climate-fingerprint@4.0.0` — **validated**.

## Responsabilité

Le service transforme un `ClimateSnapshot` vérifié, ou directement des séries climatiques normalisées, en :

```text
ClimateResult
├── data
│   ├── 6 indicateurs annuels
│   ├── événements candidats
│   └── comparaison 1996-2005 / 2016-2025
├── signals
│   └── 6 ClimateSignal descriptifs
└── rendu optionnel
    └── SVG V4 déterministe
```

Le calcul scientifique et le rendu restent strictement séparés :

```text
ClimateSnapshot
      ↓
calcul scientifique P6
      ↓
ClimateResult
      ↓
renderer P7
      ↓
SVG
```

Le renderer ne recalcule aucun indicateur, seuil, percentile, événement ou comparaison. Il lit uniquement `ClimateResult.data`.

L'acquisition reste la responsabilité de `apps/copernicus`. Aucun appel CDS n'est effectué pendant le calcul ou le rendu.

## Entrées scientifiques

`FingerprintSeriesInput` reçoit :

- température 2 m en °C ;
- UTCI en °C UTCI ;
- précipitations en mètres par pas de temps ;
- SPEI-3 mensuel ;
- composantes du vent `u10` et `v10` en m/s.

Le service calcule lui-même la norme du vent `sqrt(u10² + v10²)`.

## ClimateSnapshot P6

Un snapshot rejouable contient exactement six actifs :

```text
era5-land.csv
era5-land-precipitation.csv
era5-land-u10.csv
era5-land-v10.csv
utci.csv
spei3.nc
```

Pour chaque actif le manifest conserve dataset, variables, période, position demandée/représentée, date de récupération, paramètres de requête, URI relative, SHA-256 et état qualité.

Le replay refuse notamment un actif manquant, un SHA-256 différent ou une URI sortant du répertoire du snapshot.

### Vérifier le golden master réel

```bash
python apps/climate-fingerprint-service/scripts/verify_golden_replay.py \
  /chemin/vers/output/raw \
  --retrieved-at 2026-08-10T00:00:00Z
```

Voir `LOCAL-REPLAY.md` pour le détail.

## Sortie scientifique

`build_climate_result()` produit directement le contrat P4 `ClimateResult`. Aucun adaptateur `legacy_*` n'est utilisé au runtime.

Les `ClimateSignal` pointent vers les valeurs natives via `evidence.result_pointer`.

## Validation P6

Les trois niveaux sont passés :

1. **équivalence algorithmique POC ↔ natif** ;
2. **replay ClimateSnapshot + SHA-256** ;
3. **replay du golden master réel à tolérance `0.0`**.

L'attestation est conservée dans :

```text
doc/climat/validations/climate-fingerprint-v4-p6.md
```

## Renderer SVG V4 — P7

`renderer.py` reconnecte l'infographie historique au `ClimateResult` natif.

Deux thèmes sont disponibles :

- `light` — rendu V4 de référence ;
- `neutral` — même information, fond neutre et bandes en relief.

Le renderer exige :

```text
product.id = climate-fingerprint
method.id = climate-fingerprint
method.version = 4.0.0
```

Il utilise uniquement :

```text
ClimateResult.data.rows
ClimateResult.data.comparison
```

Les champs de présentation historiques absents du payload P6 (`palette`, `classes` au niveau de la ligne, `summary`, provenance POC) ne sont pas requis.

### Produire le SVG depuis un replay P6

Depuis la racine du dépôt :

```bash
python apps/climate-fingerprint-service/scripts/render_climate_result.py \
  poc/climat/empreinte-climatique/output/p6-replay/climate-result.json
```

Le fichier est écrit par défaut à côté du JSON :

```text
climate-fingerprint-v4.svg
```

Pour choisir explicitement la sortie :

```bash
python apps/climate-fingerprint-service/scripts/render_climate_result.py \
  /chemin/climate-result.json \
  --output /chemin/climate-fingerprint-v4.svg
```

### Non-régression visuelle

`test_renderer.py` prend le golden master V4, lui retire les champs qui ne font pas partie du payload scientifique natif, l'encapsule comme `ClimateResult`, puis exige une égalité textuelle du SVG généré avec :

```text
poc/climat/empreinte-climatique/example/climate-fingerprint-v4.svg
```

Le renderer ne peut donc pas dériver visuellement du rendu V4 de référence sans faire échouer la CI.

## Tests

```bash
python -m pip install -r apps/climate-fingerprint-service/requirements-test.txt
python -m unittest discover \
  -s apps/climate-fingerprint-service/tests \
  -p "test_*.py" \
  -v
```

Le workflow `.github/workflows/climate-fingerprint-service.yml` exécute ces tests sur chaque PR concernée.

## Structure

```text
apps/climate-fingerprint-service/
├── README.md
├── LOCAL-REPLAY.md
├── requirements.txt
├── requirements-test.txt
├── scripts/
│   ├── render_climate_result.py
│   └── verify_golden_replay.py
├── src/climate_fingerprint_service/
│   ├── __init__.py
│   ├── compute.py
│   ├── equivalence.py
│   ├── legacy_metadata.py
│   ├── renderer.py
│   ├── result.py
│   ├── signals.py
│   ├── snapshot.py
│   ├── snapshot_cli.py
│   └── validate.py
└── tests/
    ├── test_compute_equivalence.py
    ├── test_contract.py
    ├── test_golden_target.py
    ├── test_legacy_metadata.py
    ├── test_renderer.py
    └── test_snapshot_replay.py
```

## Hors périmètre

- téléchargement CDS dans le service scientifique ;
- API HTTP ;
- cache distribué ;
- commentaire IA ;
- orchestration de fiche climat.

Le cœur scientifique P6 reste inchangé ; cette tranche ajoute uniquement une projection SVG déterministe de son `ClimateResult`.
