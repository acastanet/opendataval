# Replay local du golden master V4

Ce guide sert lorsque les six fichiers Copernicus ont déjà été téléchargés localement.

## Préparer la branche

```bash
git fetch origin
git switch feat/climat-p6-fingerprint-service
git pull --ff-only origin feat/climat-p6-fingerprint-service
python -m pip install -r apps/climate-fingerprint-service/requirements-test.txt
```

## Dossier attendu

Le dossier passé à la commande doit contenir exactement :

```text
era5-land.csv
era5-land-precipitation.csv
era5-land-u10.csv
era5-land-v10.csv
utci.csv
spei3.nc
```

Les fichiers bruts restent locaux. Ne pas les ajouter au dépôt.

## Vérification en une commande

Depuis la racine du dépôt :

```bash
python apps/climate-fingerprint-service/scripts/verify_golden_replay.py \
  /chemin/vers/output/raw \
  --retrieved-at 2026-08-10T03:20:00Z
```

Remplacer `--retrieved-at` par l'heure réelle de fin/récupération de la requête CDS, en UTC.

La commande :

1. vérifie la présence des six fichiers ;
2. génère les métadonnées avec les paramètres CDS historiques verrouillés ;
3. calcule les SHA-256 ;
4. crée `climate-snapshot.json` ;
5. rejoue `climate-fingerprint-service` ;
6. compare le payload scientifique au golden master P5 avec une tolérance numérique de `0.0` ;
7. écrit `p6-replay/golden-replay-report.json`.

Résultat attendu :

```text
PASS — le recalcul P6 reproduit le golden master V4 à tolérance nulle.
```

En cas de `FAIL`, conserver `p6-replay/golden-replay-report.json` et `p6-replay/climate-result.json` : ils permettent d'identifier précisément la divergence sans versionner les fichiers climatiques bruts.
