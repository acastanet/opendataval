# Validation P6 — climate-fingerprint@4.0.0

Date de validation : 2026-08-10

## Statut

**PASS — validation P6 achevée.**

Le service natif `apps/climate-fingerprint-service` a été validé sur une copie locale synchronisée de la branche `feat/climat-p6-fingerprint-service`.

## Résultats confirmés

- branche locale synchronisée avec la branche P6 ;
- arbre Git propre au moment de la validation ;
- 14 tests du service passés ;
- six actifs Copernicus vérifiés par SHA-256 avant calcul ;
- replay `ClimateSnapshot` réel exécuté ;
- comparaison au golden master P5 : **PASS** ;
- tolérance numérique : **0.0** ;
- aucune modification scientifique manuelle appliquée entre acquisition, snapshot et replay.

## Chaîne validée

```text
6 actifs Copernicus réels
        ↓
contrôle SHA-256
        ↓
ClimateSnapshot
        ↓
climate-fingerprint-service P6
        ↓
ClimateResult + ClimateSignal[]
        ↓
comparaison au golden master V4
        ↓
PASS — tolérance 0.0
```

## Portée de la preuve

Cette validation clôt le bloqueur d'équivalence du service natif pour `climate-fingerprint@4.0.0` : le service P6 rejoue les données réelles et reproduit le payload scientifique comparable du golden master P5 sans tolérance numérique.

Les fichiers climatiques bruts restent hors Git. Ils sont volumineux et leur répertoire de travail est volontairement local. Le dépôt conserve le code de replay, les règles de provenance, le contrôle d'intégrité et cette attestation de validation ; il ne duplique pas les actifs Copernicus.

Les anciens travaux locaux du POC restent hors de cette validation et sont conservés de manière réversible dans un stash local ; ils n'ont pas été intégrés au service natif.

## Conséquence de gouvernance

Le bloqueur `native_service_equivalence_pending_p6` peut être retiré de la méthode. `climate-fingerprint@4.0.0` peut passer de `draft` à `validated` pour son cœur scientifique natif.

Cette validation ne couvre pas encore les couches ultérieures : API HTTP, orchestration de fiche climat, rendu, commentaire IA ou déploiement du service.
