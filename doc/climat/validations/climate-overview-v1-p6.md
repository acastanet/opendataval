# Validation P6 — climate-overview@1.0.0

Date de validation : 2026-08-10

## Statut

**PASS — validation P6 achevée.**

Le service natif `apps/climate-overview-service` a été validé par replay réel des deux actifs ERA5-Land nécessaires au noyau canonique V1.

## Résultats confirmés

- replay réel `ClimateSnapshot` exécuté ;
- `era5-land.csv` vérifié par SHA-256 ;
- `era5-land-precipitation.csv` vérifié par SHA-256 ;
- actifs issus de la copie déjà validée sous `poc/climat/saisons/output/raw` ;
- cette copie est identique aux actifs précédemment validés ;
- comparaison au golden master P5 : **PASS** ;
- tolérance numérique : **0.0** ;
- 12 mois climatologiques produits ;
- 7 `ClimateSignal` canoniques produits ;
- aucune descente d'échelle artificielle appliquée.

## Chaîne validée

```text
era5-land.csv + era5-land-precipitation.csv
        ↓
contrôle SHA-256
        ↓
ClimateSnapshot
        ↓
climate-overview-service P6
        ↓
ClimateResult + 7 ClimateSignal
        ↓
comparaison au golden master V1
        ↓
PASS — tolérance 0.0
```

## Portée scientifique

La validation couvre le noyau canonique `climate-overview@1.0.0` :

- température 2 m ERA5-Land ;
- précipitations ERA5-Land ;
- normale climatologique 1991–2020 ;
- P10, moyenne, P50 et P90 mensuels ;
- température moyenne annuelle ;
- précipitations annuelles ;
- mois le plus chaud, froid, humide et sec ;
- représentativité explicite de la maille ERA5-Land 0,1° pour le cas point/petite zone.

Les actifs sources couvrent 1991–2025 car ils sont réutilisés depuis la chaîne déjà acquise ; le calcul overview ne consomme que 1991–2020.

## Exclusions conservées

Les anciens champs POC `frost_days_mean`, `hot_days_30c_mean` et `tropical_nights_20c_mean` ne font pas partie du noyau canonique validé. Leur réintroduction nécessiterait de vraies Tmin/Tmax quotidiennes et une méthode dédiée.

Ils ne constituent donc pas un bloqueur de validation du noyau V1 actuel.

## Gouvernance

Le bloqueur `native_service_equivalence_pending_p6` peut être retiré. `climate-overview@1.0.0` peut passer de `draft` à `validated` pour son noyau scientifique natif.

Cette validation ne couvre pas encore le renderer P7, l'API HTTP, le commentaire IA ni l'orchestration de la fiche climat.

Les fichiers climatiques bruts et les artefacts de replay restent hors Git ; le dépôt conserve le code de replay, les règles de provenance, les contrôles d'intégrité et cette attestation.
