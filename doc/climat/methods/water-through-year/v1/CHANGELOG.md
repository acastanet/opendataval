# Changelog — Water Through Year V1

## 1.0.0 — extraction canonique P2

Statut : `draft`.

Cette version formalise la méthode actuellement implémentée dans `poc/climat/bilan eau/` sans modifier les calculs.

### Figé

- ERA5-Land monthly averaged reanalysis pour précipitations, humidité du sol et évaporation ;
- ERA5-Drought SPEI-3 ;
- référence 1991–2020 ;
- étude 1996–2025 ;
- profils mensuels P25 / médiane / P75 ;
- stock modélisé 0–100 cm dérivé des trois premières couches ERA5-Land ;
- trois comparaisons : précipitations annuelles, stock JJA, nombre de mois SPEI-3 < -1.

### Décisions P2 résolues

- la conversion des accumulations `monthly_averaged_reanalysis` est confirmée : valeur en m/jour × 1000 × nombre de jours ;
- `total_evaporation` est affiché avec signe opposé pour représenter positivement l'évapotranspiration sortante ;
- le stock 0–100 cm reste explicitement une grandeur dérivée du modèle et ne peut pas être nommé réserve utile ;
- la métrique sécheresse de cette infographie reste distincte de celle de l'empreinte.

### À résoudre avant `validated`

- règles d'interprétation P3 ;
- contrat commun P4 ;
- golden master et tests de conversion P5 ;
- décision sur les métriques secondaires ruissellement/neige dans le produit final.
