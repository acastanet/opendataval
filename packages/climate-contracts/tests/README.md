# P5 — Golden masters climat

Ce répertoire contient les preuves contractuelles qui figent les sorties des quatre POC climatiques avant leur migration en microservices.

## Statut

**P5 : quatre golden masters en place et validés par CI.**

| Méthode | Source figée | Blob Git | Signaux |
|---|---|---|---:|
| `climate-fingerprint@4.0.0` | sortie exemple V4 | `2d96777b3065e55965f46bc1cb00551ca002253f` | 6 |
| `thermal-seasons@1.0.0` | fixture de non-régression existante | `b9f1dd341a388cc9c06d42fd208a643bc9c81ccb` | 5 |
| `water-through-year@1.0.0` | sortie POC suivie dans Git | `4aca3589dc3e5e133e37ec710d3b9ac793a15b56` | 3 |
| `climate-overview@1.0.0` | sortie POC suivie dans Git | `b4e3be645085471708eafdfa0b36ef79f9f952ac` | 7 |

Les manifests sont dans :

```text
packages/climate-contracts/tests/golden-masters/
├── climate-fingerprint/v4/manifest.json
├── thermal-seasons/v1/manifest.json
├── water-through-year/v1/manifest.json
└── climate-overview/v1/manifest.json
```

## Règle P5

P5 n'est pas l'étape où l'on améliore la science.

Pour chaque méthode :

```text
sortie POC figée
      ↓
identité Git vérifiée
      ↓
adaptateur legacy → ClimateResult
      ↓
ClimateSignal[]
      ↓
JSON Schema + invariants + evidence
```

Le payload historique est conservé tel quel dans `ClimateResult.data`. L'adaptateur ajoute uniquement l'enveloppe contractuelle et les signaux interprétables ; il ne recalcule pas les séries climatiques.

Toute correction scientifique doit être traitée dans une nouvelle version de méthode, après établissement de l'équivalence avec le comportement historique.

## 1. Empreinte climatique V4

Source :

```text
poc/climat/empreinte-climatique/example/climate-fingerprint-v4.json
```

Une copie exacte du même blob Git est conservée sous :

```text
golden-masters/climate-fingerprint/v4/poc-output.json
```

Signaux : température, UTCI, précipitations, fréquence des pluies intenses, fréquence des mois SPEI-3 secs, fréquence du vent fort.

Le résumé éditorial legacy n'est jamais utilisé comme preuve scientifique.

## 2. Saisons thermiques V1

Source :

```text
poc/climat/saisons/tests/fixtures/thermal-seasons-fixture.json
```

Le POC utilise déjà ce fichier comme fixture de non-régression de ses résultats scientifiques. P5 le pince par son blob Git au lieu de produire une nouvelle sortie.

Valeurs clés figées :

```text
T25 = 4.896 °C
T75 = 16.38 °C
summer_start_shift_days = -17.69
summer_length_change_days = +28.66
annual_ok = 29 / 30
```

Le `ClimateResult` est donc `partial`, tandis que les cinq comparaisons présentes dans le POC émettent des signaux `valid`.

## 3. Eau au fil de l'année V1

Source :

```text
poc/climat/bilan eau/output/water-through-year.json
```

Les quatre métriques principales possèdent 420 mois valides sur 420.

Signaux figés :

```text
annual_precip_change_pct = -9.19
summer_soil_water_change_mm = -11.78
dry_months_change = -1.0
```

L'adaptateur maintient les garde-fous : stock de sol modélisé ≠ réserve utile, SPEI-3 ≠ sécheresse hydrologique, précipitations ≠ ressource en eau disponible.

## 4. Climat général V1

Source :

```text
poc/climat/general/climate/overview/outputs/zone_test_utilisateur_climate-overview.json
```

Le golden master fige le noyau canonique :

- climatologie mensuelle température/précipitations ;
- température moyenne annuelle ;
- précipitations annuelles ;
- mois le plus chaud/froid/humide/sec ;
- représentativité de la maille.

Les valeurs legacy suivantes sont conservées dans `ClimateResult.data` mais **interdites de `ClimateSignal` en V1** :

```text
frost_days_mean
hot_days_30c_mean
tropical_nights_20c_mean
```

Elles restent non canoniques tant qu'elles ne sont pas recalculées à partir de vrais Tmin/Tmax quotidiens.

## Tests communs

Chaque test vérifie au minimum :

1. l'identité du blob Git source ;
2. les valeurs de référence attendues ;
3. la conservation du payload legacy ;
4. les `ClimateSignal` attendus ;
5. leurs unités, directions et niveaux de preuve ;
6. la résolution de `evidence.result_pointer` ;
7. les invariants méthode / provenance / snapshot ;
8. les schémas Draft 2020-12 `ClimateSignal` et `ClimateResult`.

## Exécution locale

Depuis la racine du dépôt :

```bash
python -m pip install -r packages/climate-contracts/requirements-test.txt
python -m unittest discover -s packages/climate-contracts/tests -p "test_*_golden.py" -v
```

## CI

Le workflow :

```text
.github/workflows/climate-contracts.yml
```

exécute automatiquement tous les golden masters lors des changements dans `packages/climate-contracts/`.

## Suite : P6

P5 ne prouve pas encore qu'un **nouveau microservice** reproduit les POC ; il fournit la cible vérifiable que ce service devra atteindre.

La migration P6 doit donc suivre, méthode par méthode :

```text
golden master P5
      ↓
service natif P6
      ↓
ClimateResult natif
      ↓
comparaison au golden master
      ↓
PASS
      ↓
remplacement progressif du POC
```
