# climate-fingerprint-service

Premier microservice scientifique natif de la phase P6 du domaine climat OpenDataVal.

Méthode : `climate-fingerprint@4.0.0` — **validated**.

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

Le builder **ne fabrique pas** de date de récupération. Pour les anciens actifs du POC, `legacy_metadata.py` reproduit les paramètres de requête du code historique, mais `retrieved_at` doit provenir de l'acquisition réelle.

### Générer les métadonnées correspondant au fetch POC historique

Pour le cas golden master :

```bash
PYTHONPATH=apps/climate-fingerprint-service/src \
python -m climate_fingerprint_service.snapshot_cli metadata-template \
  --latitude 44.06465392551458 \
  --longitude 3.6829349237761435 \
  --retrieved-at 2026-08-10T03:20:00Z \
  --output /chemin/acquisition-metadata.json
```

La valeur `--retrieved-at` ci-dessus est un exemple de format : elle doit être remplacée par la date réelle de récupération des actifs utilisés.

Le générateur verrouille les paramètres historiques :

- ERA5-Land : grille 0,1°, `2m_temperature`, `total_precipitation`, `u10`, `v10`, CSV, 1991-01-01/2025-12-31 ;
- ERA5-HEAT : grille 0,25°, UTCI, CSV, même période ;
- ERA5-Drought : grille 0,25°, SPEI-3, version `1_0`, produit `reanalysis`, dataset `consolidated_dataset`, années 1991–2025 et 12 mois.

### Vérifier un téléchargement réel en une commande

Le script :

```text
apps/climate-fingerprint-service/scripts/verify_golden_replay.py
```

prend un dossier contenant les six actifs, génère les métadonnées, construit le snapshot, vérifie les SHA-256, rejoue le service et compare le résultat au golden master P5.

Voir `LOCAL-REPLAY.md` pour la commande complète.

### Construire manuellement un snapshot

```bash
PYTHONPATH=apps/climate-fingerprint-service/src \
python -m climate_fingerprint_service.snapshot_cli build \
  /chemin/vers/les-six-actifs \
  --metadata /chemin/acquisition-metadata.json \
  --snapshot-id SNAPSHOT-FINGERPRINT-001 \
  --tile-id GPD-44.064654-3.682935 \
  --latitude 44.064654 \
  --longitude 3.682935 \
  --created-at 2026-08-10T03:25:00Z
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

Les trois niveaux de validation sont désormais passés.

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

### 2. Replay ClimateSnapshot — PASS

`test_snapshot_replay.py` écrit réellement les six actifs de test en CSV/NetCDF, construit un `ClimateSnapshot`, valide son JSON Schema, vérifie les SHA-256, recharge les séries et compare le résultat rejoué au calcul direct.

Le test vérifie aussi qu'une modification d'un seul fichier après création du manifest bloque le replay.

`test_legacy_metadata.py` verrouille en plus les requêtes CDS historiques qui ont produit le cas POC.

### 3. Replay du golden master P5 réel — PASS

Un replay local a été exécuté sur six actifs Copernicus réels pour le cas golden master :

- 14 tests du service : PASS ;
- six actifs vérifiés par SHA-256 ;
- `ClimateSnapshot` réel rejoué ;
- comparaison au golden master P5 : PASS ;
- tolérance numérique : `0.0`.

Le détail de gouvernance est consigné dans :

```text
doc/climat/validations/climate-fingerprint-v4-p6.md
```

Les fichiers climatiques bruts restent hors Git. Leur intégrité et leur provenance sont prises en charge par le snapshot ; le dépôt ne les duplique pas.

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
├── LOCAL-REPLAY.md
├── requirements.txt
├── requirements-test.txt
├── scripts/
│   └── verify_golden_replay.py
├── src/climate_fingerprint_service/
│   ├── __init__.py
│   ├── compute.py
│   ├── equivalence.py
│   ├── legacy_metadata.py
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
    └── test_snapshot_replay.py
```

## Hors périmètre de cette tranche

- téléchargement CDS dans le service scientifique ;
- API HTTP ;
- cache distribué ;
- rendu SVG/HTML ;
- commentaire IA ;
- orchestration de fiche climat.

Le cœur scientifique natif de `climate-fingerprint@4.0.0` est maintenant validé. La suite peut porter sur son exposition et son intégration dans l'architecture de fiche climat.
