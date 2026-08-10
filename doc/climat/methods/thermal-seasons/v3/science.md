# Science — thermal-seasons@3.0.0

Statut : **candidate**. Cette méthode n'est pas publiable tant que le replay réel V1/V2/V3 n'a pas été revu.

## Pourquoi une V3

Le candidat V2 a été rejeté sur le snapshot P6 réel : une seule année sur trente était `ok`, avec un écart harmonic_2 / moyenne mobile 31 jours atteignant 104,22 jours. L'analyse du cas 1997 montre que la moyenne mobile peut franchir plusieurs fois T75 ; le détecteur chronologique V2 retenait alors le premier franchissement descendant, même lorsqu'il précédait le maximum thermique annuel et ne pouvait donc pas représenter le début de l'automne thermique.

V3 ne relâche aucun seuil QA. Elle change la définition géométrique des frontières.

## Principe

Pour chaque courbe annuelle lissée :

1. identifier le maximum thermique annuel ;
2. pour T75, sélectionner l'intervalle continu `température >= T75` qui contient ce maximum ;
3. la borne d'entrée de cet intervalle est le début d'été ;
4. sa borne de sortie est le début d'automne ;
5. appliquer la même règle à T25 pour le début du printemps et le début de l'hiver ;
6. interpoler linéairement chaque passage de seuil entre les deux jours qui l'encadrent.

La règle impose :

```text
printemps < été < automne < hiver
```

Un intervalle chaud principal qui touche le 1er janvier ou le 31 décembre est considéré ambigu dans cette V3 et n'est pas interprété.

## Lissages

V3 conserve volontairement les deux lissages V2 afin d'isoler la cause du rejet :

- canonique : ajustement harmonique circulaire à deux harmoniques ;
- contrôle : moyenne mobile circulaire centrée 31 jours.

La comparaison de sensibilité porte désormais sur les frontières de **régime principal**, pas sur le premier franchissement chronologique.

## QA

Les seuils V2 sont conservés sans assouplissement :

- RMSE harmonique supérieur au P95 des RMSE 1991–2020 : `partial` ;
- écart maximal entre les quatre frontières harmonic_2 et MA31 supérieur à 3 jours : `partial` ;
- écart supérieur à 10 jours : rejet annuel ;
- seules les années `ok` entrent dans les médianes décennales ;
- minimum 8 années `ok` dans 1996–2005 et 2016–2025 ;
- le printemps N+1 ne peut alimenter la durée d'hiver N que si N+1 est `ok` en V3.

## Ce que V3 cherche à tester

Le replay réel doit répondre à une question ciblée :

> L'écart extrême observé en V2 venait-il principalement de la logique de premier franchissement, ou d'une divergence irréductible entre les deux lissages ?

Si les écarts de sensibilité chutent fortement et que les deux décennies retrouvent au moins huit années `ok`, la V3 pourra passer en revue scientifique.

Si les écarts restent élevés, il faudra remettre en cause le couple de lissages ou la définition T25/T75 elle-même plutôt que relâcher la QA.

## Niveau de preuve

Les sorties restent des comparaisons descriptives de périodes. Aucun test de tendance, aucune significativité et aucune attribution causale ne sont ajoutés par V3.
