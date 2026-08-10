# Science — thermal-seasons@2.0.0

Statut : **candidat**, non publiable tant que le replay réel V1/V2 n'est pas terminé.

## Question

Le calendrier thermique local se déplace-t-il entre 1996–2005 et 2016–2025 ?

## Ce qui change par rapport à la V1

La V1 lisse chaque année par un polynôme de degré 3. L'audit P9 a montré qu'un tel polynôme, non circulaire, peut déplacer fortement les franchissements près des bords du calendrier. Sur un cycle annuel synthétique propre, l'écart maximal avec les deux lissages circulaires dépasse 10 jours.

La V2 remplace donc ce lissage par un ajustement harmonique circulaire à deux harmoniques :

```text
T(t) = c0
     + a1 sin(2πt/365) + b1 cos(2πt/365)
     + a2 sin(4πt/365) + b2 cos(4πt/365)
```

Le premier terme harmonique représente le cycle annuel ; le second permet une composante semi-annuelle. L'utilisation de composantes annuelle et semi-annuelle pour décrire le cycle thermique saisonnier est classique en climatologie, notamment aux latitudes tempérées.

Références de méthode : Cvitan (1995), DOI `10.1002/joc.3370151007` ; Yettella & England (2018), DOI `10.1029/2018JD029066` ; Song et al. (2021), DOI `10.1002/qj.3944`.

## Contrôle indépendant

La V2 ne considère pas l'ajustement harmonique comme vrai par construction. Chaque année est aussi lissée par une moyenne mobile circulaire centrée de 31 jours.

Pour chacune des quatre frontières T25/T75, on calcule l'écart absolu entre les deux lissages. La valeur QA annuelle est le maximum de ces quatre écarts.

```text
<= 3 j      : accord satisfaisant
> 3 et <=10 : année partial
> 10 j      : année rejetée des comparaisons
```

Ces seuils reprennent le barème P9. Ils sont explicitement versionnés dans la méthode V2.

## RMSE du lissage

Pour chaque année de référence 1991–2020, on calcule :

```text
RMSE(température quotidienne, ajustement harmonique)
```

Le seuil QA est le P95 des trente RMSE de référence. Une année d'étude au-dessus de ce seuil passe en `partial` et n'entre pas dans les médianes décennales.

Ce contrôle ne signifie pas qu'une forte variabilité météo est une erreur. Il sert uniquement à identifier les années dont le cycle annuel est exceptionnellement mal résumé par le modèle harmonique relativement à la référence du même lieu.

La sortie conserve la distribution complète des RMSE annuels afin que cette règle reste auditable.

## Frontière N+1

La durée d'hiver de l'année N a besoin du début du printemps N+1. En V2, cette frontière n'est utilisée que si l'année N+1 possède des franchissements harmoniques `status=ok` après ses propres contrôles.

Si N+1 est absent, `partial` ou rejeté :

```text
winter_length_days = null
```

Les autres frontières et durées de N restent utilisables si leur propre QA est correcte. La V2 évite ainsi la fuite silencieuse de QA identifiée en P9 sans invalider inutilement l'année N.

## Comparaisons décennales

Les comparaisons utilisent uniquement les années `status=ok`.

Chaque décennie doit disposer d'au moins huit années valides. La statistique est explicitement la médiane :

```text
comparison = median(2016–2025) - median(1996–2005)
```

La durée d'été est toujours calculée année par année avant agrégation décennale.

## Ce que la V2 ne prétend pas mesurer

- saisons météorologiques fixes DJF/MAM/JJA/SON ;
- phénologie observée ;
- durée des canicules ;
- tendance statistiquement significative ;
- causalité du changement observé.

Les résultats restent des comparaisons descriptives issues d'une réanalyse maillée ERA5-Land.

## Condition de validation

La méthode ne passe de `candidate` à `validated` qu'après replay du même `ClimateSnapshot` Copernicus que la V1 et inspection de :

1. toutes les frontières annuelles V1/V2 ;
2. les trente RMSE ;
3. les trente écarts harmonic/31j ;
4. le nombre d'années `ok/partial/rejected` ;
5. les cinq comparaisons décennales ;
6. la disponibilité d'au moins huit années `ok` dans 1996–2005 et 2016–2025.
