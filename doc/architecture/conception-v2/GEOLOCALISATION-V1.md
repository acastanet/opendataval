# Géolocalisation de la V1

## Finalité

La page V1 `/meteo/essentiel/` permet de remplacer le lieu rapide courant par la position du navigateur, puis de charger immédiatement la météo correspondante.

Cette implémentation constitue la référence fonctionnelle pour la V2.

## Code de référence

```text
apps/web/src/islands/MeteoEssentiel.svelte
```

La correction mobile de référence est le commit :

```text
e5084b1c3071678adbc81c332f30eca668987882
```

## Parcours utilisateur

1. La page charge un lieu rapide initial, par défaut la mairie de Val-d’Aigoual.
2. L’utilisateur appuie sur « Me localiser ».
3. L’interface vérifie que la page est servie dans un contexte sécurisé.
4. Le navigateur demande ou réutilise l’autorisation de localisation.
5. Les coordonnées sont transmises à la chaîne météo.
6. La météo est chargée immédiatement à partir des coordonnées.
7. Un libellé géographique est recherché séparément.
8. Le libellé GPS provisoire est remplacé par le libellé résolu lorsqu’il est disponible.

## Appel au navigateur

La V1 utilise :

```js
navigator.geolocation.getCurrentPosition(success, error, {
  enableHighAccuracy: false,
  timeout: 20_000,
  maximumAge: 120_000,
});
```

### Justification des options

- `enableHighAccuracy: false` : la prévision météo est maillée à une échelle kilométrique ; une précision GPS maximale ralentit ou fait expirer inutilement certains téléphones.
- `timeout: 20_000` : laisse au téléphone le temps d’obtenir une position en mobilité ou en intérieur.
- `maximumAge: 120_000` : accepte une position récente de moins de deux minutes.

## Sécurité et compatibilité

Avant l’appel GPS, la V1 vérifie :

```js
window.isSecureContext
navigator.geolocation
```

### Page non sécurisée

Message affiché :

> La localisation GPS est bloquée sur une page non sécurisée. Ouvrez ce site en HTTPS puis réessayez.

### API de géolocalisation absente

Message affiché :

> La géolocalisation n’est pas disponible. La météo du lieu choisi reste affichée.

## Protection contre les réponses concurrentes

La V1 maintient un compteur :

```js
let requeteCourante = 0;
```

Chaque nouvelle opération incrémente ce compteur.

Lors du démarrage de la localisation :

```js
const numeroLocalisation = ++requeteCourante;
```

Les callbacks GPS vérifient ensuite que la localisation reste l’opération courante.

Cette règle empêche notamment la réponse tardive du chargement initial d’interrompre l’état « localisation » ou de réafficher le lieu par défaut après l’obtention de la position GPS.

## Chargement de la météo

La météo est chargée avec :

```text
GET /api/meteo/point?lat=…&lon=…
```

La fonction `chargerPoint` :

- incrémente le numéro de requête ;
- place l’interface en état `localisation` ou `chargement` ;
- charge la météo ;
- ignore toute réponse devenue obsolète ;
- mémorise les coordonnées courantes ;
- affiche la précision GPS ;
- retire l’état actif du lieu rapide précédent ;
- charge ensuite les données climatiques associées.

## Géocodage inverse non bloquant

Le libellé géographique est obtenu avec :

```text
GET /api/meteo/localisation?lat=…&lon=…
```

La règle essentielle est la suivante : le géocodage inverse ne doit pas retarder l’affichage de la météo.

La V1 lance donc le géocodage, puis attend d’abord la réponse météo.

Un libellé provisoire est immédiatement affiché :

```text
Position GPS · latitude, longitude
```

Lorsque le géocodage aboutit, ce libellé est remplacé par le nom résolu.

Si le géocodage échoue, la météo reste disponible et le libellé GPS provisoire est conservé.

## Gestion des erreurs GPS

### Autorisation refusée

> La localisation est refusée pour ce site. Autorisez-la dans les réglages du navigateur puis réessayez.

### Délai dépassé

> Le téléphone n’a pas obtenu votre position à temps. Vérifiez que la localisation est activée puis réessayez.

### Échec indéterminé

> Le téléphone n’a pas réussi à déterminer votre position. Vérifiez que la localisation est activée puis réessayez.

Dans tous les cas, la dernière météo disponible reste affichée lorsqu’elle existe.

## Gestion des erreurs météo

Si le chargement de la nouvelle position échoue :

- la réponse devenue obsolète est ignorée ;
- la météo précédente n’est pas supprimée ;
- le message suivant est affiché lorsqu’une météo existe déjà :

> La nouvelle position n’a pas pu être chargée. La dernière météo reste affichée.

## Lieux rapides

Un clic sur un lieu rapide :

- est ignoré pendant un chargement ou une localisation en cours ;
- lance une nouvelle requête ;
- remplace la position GPS ;
- désactive l’état GPS ;
- efface la précision GPS ;
- active le lieu rapide correspondant.

## Rafraîchissement

La météo courante est rafraîchie toutes les quinze minutes avec les dernières coordonnées validées.

Un échec de rafraîchissement est silencieux : la dernière météo affichée est conservée.

## Données climatiques associées

Après validation de la météo, la V1 charge en parallèle :

```text
/api/meteo/contexte-climatique
/api/meteo/bilan-thermique
```

Une relocalisation intervenue entre-temps invalide ces réponses secondaires.

## Points forts de l’implémentation

- fonctionnement au premier appui sur mobile ;
- options GPS adaptées à la météo ;
- protection explicite contre les courses de requêtes ;
- météo indépendante du géocodage inverse ;
- maintien du dernier état valide ;
- messages différenciés ;
- repli propre vers les lieux rapides ;
- rafraîchissement sans perte d’affichage.

## Limites

- la logique est directement intégrée dans un composant Svelte ;
- elle n’est pas partagée avec la V2 React ;
- les tests automatisés ne décrivent pas encore tous les scénarios de concurrence ;
- le stockage et la journalisation éventuelle des coordonnées doivent être documentés séparément côté serveur et exploitation.

## Exigence pour la V2

La V2 doit conserver les propriétés suivantes :

1. localisation au premier appui ;
2. même configuration GPS ;
3. invalidation des requêtes concurrentes ;
4. météo affichée avant la résolution du libellé ;
5. conservation de la météo précédente en cas d’échec ;
6. messages différenciés ;
7. possibilité immédiate de revenir à un lieu rapide.
