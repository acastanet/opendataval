# climate-fingerprint-service

Premier microservice scientifique natif de la phase P6 du domaine climat OpenDataVal.

Méthode : `climate-fingerprint@4.0.0`.

## Responsabilité

Le service transforme un `ClimateSnapshot` vérifié, ou directement des séries climatiques normalisées, en :

```text
ClimateResult
├── data
│   ├── 6 indicateurs annuels
│   ├── événements candidats
│   └── comparaison 1996-2005 / 2016-2025
└── signals
    └── 6 ClimateSignal descriptifs
```

Il ne télécharge pas de données Copernicus, ne produit pas de SVG et n'appelle aucun modèle de langage.

L'acquisition reste la responsabilité de `apps/copernicus`. Le service vérifie et rejoue les actifs déjà acquis via `ClimateSnapshot`.

## Entrées scientifiques

`FingerprintSeriesInput` reçoit :

- température 2 m en °C ;
- UTCI en °C UTCI ;
- précipitations en mètres par pas de temps ;
- SPEI-3 mensuel ;
- composantes du vent `u10` et `v10` en m/s.

Le service calcule lui-même la norme du vent `sqrt(u10² + v10²)`.

## ClimateSnapshot P6

`snapshot.py` implémente le contrat P4 `ClimateSnapshot` pour l'empreinte.

Un snapshot rejouable contient exactement six actifs :

```text
era5-land.csv
era5-land-precipitation.csv
era5-land-u10.csv
era5-land-v10.csv
utci.csv
spei3.nc
```

Pour chaque actif le manifest conserve notamment :

- `dataset_registry_id` et `dataset_id` ;
- variables ;
- période ;
- position demandée et position représentée ;
- date réelle de récupération ;
- version du dataset lorsqu'elle est disponible ;
- paramètres de requête ;
- URI relative ;
- SHA-256 ;
- état qualité.

Le replay refuse :

- un actif manquant ;
- un SHA-256 différent ;
- une URI sortant du répertoire du snapshot ;
- une métadonnée d'acquisition obligatoire manquante.

Le builder **ne fabrique pas** de date de récupération ou de requête CDS pour les anciens fichiers : ces informations doivent venir de la couche d'acquisition.

### Construire un snapshot depuis des actifs déjà acquis

Le fichier de métadonnées est un objet JSON indexé par les six `asset_id` :

```json
{
  "era5-land-temperature": {
    "retrieved_at": "2026-08-09T20:00:00Z",
    "dataset_version": null,
    "period_start": "1991-01-01",
    "period_end": "2025-12-31",
    "request_parameters": {},
    "represented_spatial": {
      "lat": 44.1,
      "lon": 3.7,
      "resolution_degrees": 0.1
    },
    "quality_status": "valid"
  }
}
```

Le même bloc doit être fourni pour :

```text
era5-land-temperature
era5-land-precipitation
era5-land-u10
era5-land-v10
era5-heat-utci
era5-drought-spei3
```

Commande depuis la racine du dépôt :

```bash
PYTHONPATH=apps/climate-fingerprint-service/src \
python -m climate_fingerprint_service.snapshot_cli build \
  /chemin/vers/les-six-actifs \
  --metadata /chemin/acquisition-metadata.json \
  --snapshot-id SNAPSHOT-FINGERPRINT-001 \
  --tile-id GPD-44.064654-3.682935 \
  --latitude 44.064654 \
  --longitude 3.682935 \
  --created-at 2026-08-09T20:05:00Z
```

Le manifest `climate-snapshot.json` est écrit dans le même répertoire que les actifs afin que les URI restent relatives et portables.

### Rejouer un snapshot

```bash
PYTHONPATH=apps/climate-fingerprint-service/src \
python -m climate_fingerprint_service.snapshot_cli replay \
  /chemin/climate-snapshot.json \
  /chemin/climate-result.json
```

Le service vérifie tous les hashes **avant** de charger les séries et de lancer le calcul.

## Sortie

`build_climate_result()` produit directement le contrat P4 `ClimateResult`. Aucun adaptateur `legacy_*` n'est utilisé au runtime.

Les `ClimateSignal` pointent vers les valeurs natives via `evidence.result_pointer`.

## Équivalence P6

Trois niveaux sont maintenant distingués.

### 1. Équivalence algorithmique — PASS

`test_compute_equivalence.py` exécute le calcul du POC et le calcul natif sur exactement les mêmes séries synthétiques puis compare le payload scientifique.

Sont comparés :

- périodes et point ;
- six lignes ;
- références ;
- trente années ;
- anomalies, percentiles, classes et rangs ;
- détails par indicateur ;
- événements ;
- comparaison décennale.

La palette V4, le résumé éditorial et la provenance de publication ne font pas partie de l'équivalence scientifique.

### 2. Replay ClimateSnapshot — PASS sur fixture sérialisée

`test_snapshot_replay.py` écrit réellement les six actifs de test en CSV/NetCDF, construit un `ClimateSnapshot`, valide son JSON Schema, vérifie les SHA-256, recharge les séries et compare le résultat rejoué au calcul direct.

Le test vérifie aussi qu'une modification d'un seul fichier après création du manifest bloque le replay.

### 3. Replay du golden master P5 réel — bloqué par les actifs historiques

Le golden master P5 réel est :

```text
packages/climate-contracts/tests/golden-masters/climate-fingerprint/v4/poc-output.json
```

Le dépôt ne versionne pas les six actifs ERA5-Land / ERA5-HEAT / ERA5-Drought qui ont produit ce JSON, ni un manifest d'acquisition complet associé. Le résultat P5 ne permet pas de reconstruire ces entrées.

`test_golden_target.py` fixe donc la cible et vérifie qu'une dérive numérique est détectée. Le dernier verrou de validation consiste à retrouver/régénérer les six actifs du cas `44.064654, 3.682935`, produire leur `ClimateSnapshot`, puis exécuter le replay natif contre le golden master à tolérance nulle.

## Tests

Depuis la racine du dépôt :

```bash
python -m pip install -r apps/climate-fingerprint-service/requirements-test.txt
python -m unittest discover \
  -s apps/climate-fingerprint-service/tests \
  -p "test_*.py" \
  -v
```

Le workflow `.github/workflows/climate-fingerprint-service.yml` exécute ces tests sur chaque PR modifiant le service, les contrats climat ou le POC de référence.

## Structure

```text
apps/climate-fingerprint-service/
├── README.md
├── requirements.txt
├── requirements-test.txt
├── src/climate_fingerprint_service/
│   ├── __init__.py
│   ├── compute.py
│   ├── equivalence.py
│   ├── result.py
│   ├── signals.py
│   ├── snapshot.py
│   ├── snapshot_cli.py
│   └── validate.py
└── tests/
    ├── test_compute_equivalence.py
    ├── test_contract.py
    ├── test_golden_target.py
    └── test_snapshot_replay.py
```

## Hors périmètre de cette tranche

- téléchargement CDS ;
- API HTTP ;
- cache distribué ;
- rendu SVG/HTML ;
- commentaire IA ;
- orchestration de fiche climat.

La priorité reste la reproductibilité scientifique avant l'exposition HTTP.
