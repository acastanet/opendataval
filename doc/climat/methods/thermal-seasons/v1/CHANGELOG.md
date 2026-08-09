# Changelog — Thermal Seasons V1

## 1.0.0 — extraction canonique P2

Statut : `draft`.

Cette version formalise sans modifier le code la méthode actuellement implémentée dans `poc/climat/saisons/`.

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

### À résoudre avant `validated`

- règles d'interprétation P3 ;
- contrat `ClimateResult` / `ClimateSignal` P4 ;
- golden master P5 ;
- choix d'un actif ERA5-Land de production stable et test d'équivalence ;
- statut final de la saison de croissance secondaire.
