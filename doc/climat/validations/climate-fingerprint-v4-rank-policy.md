# Climate Fingerprint V4 — politique de rang et rendu P9

Date : 2026-08-10  
Méthode : `climate-fingerprint@4.0.0`

## Rang des années

Le champ `rank` classe les années visibles 1996–2025 par valeur décroissante.

Les ex aequo utilisent un **rang de compétition standard** (« 1224 ranking ») :

```text
valeurs : 10, 7, 7, 5
rangs   :  1, 2, 2, 4
```

Deux valeurs identiques reçoivent donc le même rang et le rang suivant peut être sauté. Ce comportement est intentionnel ; `rank` ne constitue pas un identifiant unique ni un ordre total entre années ex aequo.

Le test `test_rank_policy.py` verrouille cette convention sans modifier les valeurs du golden master.

## Couleur du renderer natif P7

Le renderer natif ne doit plus afficher ni reconstruire de `σ` à partir de P10/P50/P90.

Depuis la correction P9 :

- la grandeur scientifique utilisée par la couleur est le `percentile` empirique déjà présent dans le payload ;
- le renderer peut appliquer une accentuation graphique déterministe à cette position pour la palette ;
- cette accentuation reste une transformation de restitution et ne crée ni z-score, ni écart-type, ni nouvelle classe scientifique ;
- la légende publique parle de **position dans la distribution 1991–2020**, pas de `−3 σ / +3 σ`.

La normalisation robuste historique décrite dans le POC V4 est donc considérée **legacy de rendu** et ne fait plus partie du renderer natif validé pour publication.

## Saturation au-delà de la référence

Le percentile empirique plafonne à `100` dès qu'une valeur dépasse toutes les années 1991–2020. Il reste adapté comme information de rang relatif, mais ne permet pas à lui seul de représenter l'intensité au-delà du maximum de référence.

P9 ne change pas la classification V4. Une future représentation d'intensité fondée sur l'anomalie devra être définie explicitement et versionnée sans calcul statistique caché dans le renderer.
