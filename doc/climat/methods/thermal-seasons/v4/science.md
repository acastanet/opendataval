# Science — thermal-seasons@4.0.0

Statut : **candidate**. Cette méthode n'est pas publiable tant que son replay ERA5-Land réel n'a pas été revu.

## Question et échelle de calcul

V4 répond au déplacement du calendrier thermique entre 1996–2005 et 2016–2025. Elle ne demande plus que chacune des trente années fournisse, seule, quatre frontières compatibles entre deux lissages.

Pour chaque décennie, V4 construit une climatologie quotidienne puis détermine les quatre frontières sur cette courbe unique. Les seuils T25/T75 restent communs : ils proviennent exclusivement de la climatologie de référence 1991–2020. Ainsi, l'écart entre décennies ne mélange pas un changement de courbe et un changement de seuil.

## Frontières et durée d'été

V4 conserve le détecteur V3 : pour chaque seuil, elle retient l'intervalle chaud continu contenant le maximum annuel de la courbe lissée. Les frontières sont :

- T25 : début du printemps et début de l'hiver ;
- T75 : début de l'été et début de l'automne.

La durée d'été est toujours `début automne − début été`, sur la même courbe décennale. Les déplacements des frontières et l'évolution de durée sont donc géométriquement cohérents.

## Lissages et QA

L'harmonique à deux composantes est le lissage canonique. La moyenne mobile circulaire centrée de 31 jours est un contrôle indépendant. Leur comparaison porte sur quatre frontières de chaque climatologie décennale :

```text
écart <= 5 jours       robuste
5 < écart <= 10 jours  partiel, à documenter
écart > 10 jours       décennie rejetée
```

Ces seuils sont propres à l'échelle décennale V4. Ils ne relâchent ni ne réécrivent les seuils annuels de V2/V3, dont les résultats historiques restent inchangés. Leur adéquation doit être examinée sur le replay réel, et non supposée parce qu'elle produirait un résultat calculable.

## Incertitude interannuelle

V4 rééchantillonne avec remise les dix années entières de chaque décennie, 1 000 fois, avec une graine déclarée. À chaque réplication, elle reconstruit la climatologie et les frontières canoniques avec les mêmes T25/T75 de référence ; elle restitue P05, P25, médiane, P75 et P95 de chaque frontière et de la durée d'été.

Les réplications early et late sont appariées par leur indice de tirage. Chaque différence bootstrap est calculée directement comme `late_i − early_i`; ses quantiles et ses proportions de signe décrivent la stabilité observée, sans être transformés en p-value, seuil de significativité ou validation automatique.

Le bootstrap est un diagnostic de variabilité. Un rééchantillonnage sans couverture no-leap complète ou sans régime principal valide est compté avec une raison explicite et n'est pas interprété. Les taux d'invalidité early/late et le taux de paires valides font partie de la QA ; ils ne remplacent pas la QA de la courbe décennale observée.

## Portée

V4 fournit une comparaison descriptive de deux périodes. Elle n'ajoute ni test de tendance, ni significativité statistique, ni attribution causale. V1 est une référence historique, V2 est rejetée et V3 reste la preuve que le détecteur de régime principal corrige le faux franchissement identifié en 1997.
