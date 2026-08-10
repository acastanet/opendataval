# Conception de l’infographie — Water Through Year V1

## But

Donner en quelques minutes une lecture simple du cycle hydroclimatique local et de ses changements, sans transformer une comparaison descriptive en récit de tendance générale.

## Message visuel principal

Le **cycle saisonnier** est la structure dominante. Les différences entre 1996–2005 et 2016–2025 sont secondaires : elles doivent être montrées seulement là où elles existent réellement.

## Organisation

Quatre bandes blanches, une par phénomène :

1. **Précipitations** — quand tombe l’eau ?
2. **Stock d’eau du sol modélisé 0–100 cm** — quand le premier mètre de sol modélisé contient-il le plus ou le moins d’eau ?
3. **Évapotranspiration réelle modélisée** — quand l’eau repart-elle le plus vers l’atmosphère ?
4. **Indice SPEI-3** — quand le contexte climatique est-il relativement plus sec ou plus humide ?

L’ordre est pédagogique, pas causal.

## Dans chaque bande

Priorité de lecture :

```text
cycle mensuel
↓
proximité ou écart entre les deux périodes
↓
éventuel écart mensuel explicite
↓
chiffre de synthèse validé
```

- médiane mensuelle au premier plan ;
- P25–P75 visible mais discret ;
- périodes identifiables par couleur **et** type de trait ;
- légende locale si nécessaire ;
- les mois restent alignés de janvier à décembre.

## Comparaison des décennies

Ne pas chercher à faire paraître les périodes plus différentes qu’elles ne le sont.

Si les profils se superposent largement, ce chevauchement doit rester visible. Si les écarts sont localisés, une petite représentation de :

```text
2016–2025 − 1996–2005
```

peut être ajoutée sous le profil, avec zéro clairement indiqué et la même position mensuelle.

Le renderer peut calculer cet écart à partir des médianes déjà présentes dans `ClimateResult`, mais ne doit effectuer aucune nouvelle agrégation scientifique.

## Synthèse

N’afficher que les comparaisons déjà validées par la méthode, par exemple :

- variation des précipitations annuelles ;
- différence du stock estival modélisé ;
- différence du nombre de mois secs SPEI-3.

Ne pas inventer de synthèse pour l’évapotranspiration si `ClimateResult` n’en fournit pas.

## Interdits graphiques

Ne pas suggérer :

- une tendance statistiquement significative ;
- un assèchement général si les quatre indicateurs ne le montrent pas ;
- une causalité entre les quatre bandes ;
- que le stock d’eau modélisé est une réserve utile ;
- que SPEI-3 mesure directement nappes ou cours d’eau.

## Critère d’acceptation

Sans explication extérieure, le lecteur doit comprendre rapidement :

1. le rythme annuel des quatre phénomènes ;
2. si les deux décennies sont proches ou différentes ;
3. où se situent les écarts principaux ;
4. qu’un faible changement ou une stabilité est aussi une information.
