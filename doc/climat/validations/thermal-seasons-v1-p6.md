# Validation P6 — thermal-seasons@1.0.0

Date de validation : 2026-08-10

## Statut

**PASS — validation P6 achevée.**

Le service natif `apps/climate-seasons-service` a été validé sur une copie locale synchronisée de la branche `feat/climat-p6-seasons-service`.

## Résultats confirmés

- actif réel `era5-land.csv` vérifié par SHA-256 avant calcul ;
- replay `ClimateSnapshot` réel exécuté ;
- comparaison au golden master P5 / fixture V1 : **PASS** ;
- tolérance numérique : **0.0** ;
- résultat natif écrit dans `p6-seasons-replay/climate-result.json` ;
- snapshot réel écrit dans `output/raw/climate-snapshot.json` ;
- dépendances du service installées localement ;
- aucune modification scientifique manuelle appliquée entre l'actif, le snapshot et le replay.

## Chaîne validée

```text
era5-land.csv réel
        ↓
contrôle SHA-256
        ↓
ClimateSnapshot mono-actif
        ↓
climate-seasons-service P6
        ↓
ClimateResult + 5 ClimateSignal
        ↓
comparaison au golden master V1
        ↓
PASS — tolérance 0.0
```

## Portée de la preuve

Cette validation clôt le bloqueur d'équivalence du service natif pour `thermal-seasons@1.0.0`. Le service P6 rejoue l'actif ERA5-Land réel et reproduit le payload scientifique comparable du golden master P5 sans tolérance numérique.

Le golden master conserve 29 années valides sur 30 ; cette qualité `partial` est une propriété attendue du jeu de référence et ne remet pas en cause les cinq signaux de comparaison validés.

L'actif climatique brut reste hors Git. Le dépôt conserve le code de replay, les règles de provenance, le contrôle d'intégrité et cette attestation de validation ; il ne duplique pas l'actif ERA5-Land.

## Conséquence de gouvernance

Le bloqueur `native_real_golden_replay_pending_p6` peut être retiré. `thermal-seasons@1.0.0` peut passer de `draft` à `validated` pour son cœur scientifique natif.

Cette validation ne couvre pas les couches ultérieures : API HTTP, orchestration de fiche climat, rendu, commentaire IA ou déploiement du service.
