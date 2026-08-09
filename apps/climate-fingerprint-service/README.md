# climate-fingerprint-service

Premier microservice scientifique natif de la phase P6 du domaine climat OpenDataVal.

Méthode : `climate-fingerprint@4.0.0`.

## Responsabilité

Le service transforme des séries climatiques normalisées en :

```text
ClimateResult
└── data
    ├── 6 indicateurs annuels
    ├── événements candidats
    └── comparaison 1996-2005 / 2016-2025
└── signals
    └── 6 ClimateSignal descriptifs
```

Il ne télécharge pas de données Copernicus, ne produit pas de SVG et n'appelle aucun modèle de langage.

L'acquisition et la provenance des actifs restent la responsabilité de `apps/copernicus` / du futur `ClimateSnapshot`.

## Entrées M1

`FingerprintSeriesInput` reçoit des séries déjà normalisées :

- température 2 m en °C ;
- UTCI en °C UTCI ;
- précipitations en mètres par pas de temps ;
- SPEI-3 mensuel ;
- composantes du vent `u10` et `v10` en m/s.

Le service calcule lui-même la norme du vent `sqrt(u10² + v10²)`.

## Sortie

`build_climate_result()` produit directement le contrat P4 `ClimateResult`. Aucun adaptateur `legacy_*` n'est utilisé au runtime.

Les `ClimateSignal` pointent vers les valeurs natives via `evidence.result_pointer`.

## Équivalence P6

Deux niveaux sont distingués.

### Équivalence algorithmique — active

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

### Replay du golden master réel — encore bloqué par les entrées

Le golden master P5 réel est :

```text
packages/climate-contracts/tests/golden-masters/climate-fingerprint/v4/poc-output.json
```

Le dépôt ne versionne pas les séries ERA5-Land / ERA5-HEAT / ERA5-Drought qui ont produit ce JSON. Il est donc impossible de recalculer honnêtement ce golden master à partir des seules sorties P5.

`test_golden_target.py` fixe le comparateur et vérifie qu'une dérive numérique est détectée. Le passage de la méthode à `validated` exigera ensuite un `ClimateSnapshot` ou une fixture source rejouable correspondant au golden master.

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
│   └── validate.py
└── tests/
    ├── test_compute_equivalence.py
    ├── test_contract.py
    └── test_golden_target.py
```

## Hors périmètre M1

- API HTTP ;
- téléchargement CDS ;
- cache de données ;
- rendu SVG/HTML ;
- commentaire IA ;
- orchestration de fiche climat.

Ces couches seront ajoutées après preuve du cœur de calcul et du contrat.
