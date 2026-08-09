# P5 — Golden masters climat

Ce répertoire contient les preuves d'équivalence entre les POC climatiques historiques et les contrats communs introduits en P4.

## Premier lot : climate-fingerprint V4

Source figée :

```text
poc/climat/empreinte-climatique/example/climate-fingerprint-v4.json
```

La copie sous `golden-masters/climate-fingerprint/v4/poc-output.json` référence exactement le même blob Git que la sortie POC au moment de la fusion P0–P4.

Le test P5 vérifie :

1. identité du blob Git ;
2. structure et valeurs de comparaison de la sortie POC ;
3. adaptation sans réécriture numérique vers `ClimateResult` ;
4. production des six `ClimateSignal` de comparaison ;
5. résolution des `evidence.result_pointer` ;
6. invariants méthode / provenance / snapshot ;
7. validation JSON Schema de `ClimateSignal` et `ClimateResult`.

## Règle P5

P5 n'est pas l'étape où l'on améliore la science.

Le payload POC est conservé tel quel dans `ClimateResult.data`. L'adaptateur ajoute l'enveloppe contractuelle et les signaux interprétables sans recalculer les séries climatiques.

Toute correction scientifique doit être traitée dans une nouvelle version de méthode après établissement de l'équivalence.

## Exécution

Depuis la racine du dépôt :

```bash
python -m pip install -r packages/climate-contracts/requirements-test.txt
python -m unittest packages/climate-contracts/tests/test_fingerprint_v4_golden.py
```

## Suite

Après validation du lot empreinte, reproduire le même patron pour :

1. `thermal-seasons@1.0.0` ;
2. `water-through-year@1.0.0` ;
3. `climate-overview@1.0.0`.
