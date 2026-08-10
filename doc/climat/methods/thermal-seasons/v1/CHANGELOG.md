# Changelog — Thermal Seasons V1

## 1.0.0 — méthode validée P6

Statut : `validated`.

Cette version formalise la méthode canonique des saisons thermiques locales et son équivalence avec le service scientifique natif P6.

### Figé

- ERA5-Land `2m_temperature` ;
- référence 1991–2020 ;
- étude 1996–2025 ;
- T25/T75 calculés sur la climatologie quotidienne ;
- méthode de percentile `linear` ;
- suppression du 29 février ;
- minimum 18 valeurs horaires par jour ;
- minimum 98 % de jours valides par année ;
- interpolation des lacunes de deux jours maximum ;
- lissage polynomial de degré 3 ;
- quatre franchissements interpolés ;
- P25 / médiane / P75 par décennie ;
- déplacement = médiane tardive moins médiane précoce.

### Décisions P2

- l'appellation canonique est **saisons thermiques locales** ;
- elles ne doivent jamais être confondues avec DJF/MAM/JJA/SON ;
- le lissage sert exclusivement à détecter les franchissements ;
- la comparaison entre décennies reste descriptive tant qu'aucun test de tendance n'est ajouté ;
- l'indicateur de saison de croissance reste secondaire et séparé de la méthode T25/T75.

### Validation P3–P6

- règles d'interprétation P3 définies ;
- contrats `ClimateResult` / `ClimateSignal` P4 définis ;
- golden master P5 figé ;
- service natif `apps/climate-seasons-service` implémenté ;
- parité algorithmique POC ↔ natif validée ;
- `ClimateSnapshot` mono-actif `era5-land.csv` avec contrôle SHA-256 validé ;
- replay réel contre le golden master V1 validé le 2026-08-10 ;
- tolérance numérique du replay réel : `0.0` ;
- attestation : `doc/climat/validations/thermal-seasons-v1-p6.md`.

La qualité de référence reste `29/30` années valides ; les cinq signaux de comparaison demeurent valides et descriptifs.
