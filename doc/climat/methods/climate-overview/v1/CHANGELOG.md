# Changelog — Climate Overview V1

## 1.0.0 — extraction canonique P2

Statut : `draft`.

Cette version formalise le noyau scientifique du POC `general` sans modifier son code.

### Figé

- portrait climatologique 1991–2020 sans tendance ;
- ERA5-Land température 2 m et précipitations ;
- support Point / Polygon / MultiPolygon ;
- pondération spatiale par aire d'intersection ;
- moyenne spatiale des hauteurs de précipitation ;
- climatologie mensuelle température et précipitations avec moyenne, P10, P50, P90 ;
- conservation explicite de la représentativité de la grille.

### Décisions P2

- aucun downscaling automatique en V1 ;
- jours de gel, jours ≥30 °C et nuits ≥20 °C sont retirés du noyau canonique tant qu'ils reposent sur une approximation par température moyenne quotidienne ;
- neige, vent, humidité et rayonnement restent des extensions optionnelles et non des valeurs à inventer ;
- l'agrégation annuelle exacte devra être verrouillée par golden master avant refactorisation.

### À résoudre avant `validated`

- méthode exacte Tmin/Tmax si les extrêmes sont réintroduits ;
- agrégation annuelle couverte par P5 ;
- règles d'interprétation P3 ;
- contrat commun P4 ;
- actif ERA5-Land de production et test d'équivalence.
