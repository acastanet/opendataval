# Audit de géolocalisation — V1 / V2

## Objet

Comparer le comportement de la géolocalisation V1, jugée fiable en usage réel, avec l’implémentation actuelle de Météo V2.

## Périmètre inspecté

### V1

```text
apps/web/src/islands/MeteoEssentiel.svelte
```

### V2

```text
apps/meteo-web/src/App.tsx
apps/meteo-web/src/components/LocationSelector.tsx
apps/meteo-web/src/api/queries.ts
apps/meteo-web/src/api/weather-client.ts
```

## Conclusion

L’acquisition GPS de la V2 utilise les mêmes options principales que la V1 :

```js
{
  enableHighAccuracy: false,
  timeout: 20_000,
  maximumAge: 120_000,
}
```

Le problème n’est donc probablement pas le choix des options GPS.

Les écarts les plus importants se trouvent dans l’orchestration après le clic :

1. la V2 ne protège pas les callbacks GPS contre une action ultérieure ;
2. un lieu rapide choisi pendant une localisation peut être remplacé plus tard par une réponse GPS devenue obsolète ;
3. la V2 couple l’affichage de la météo à la réponse complète de `/api/v1/meteo/essential`, qui inclut la résolution géographique IGN ;
4. la V2 ne présente pas immédiatement un libellé GPS provisoire ;
5. la V2 ne garantit pas la conservation visible de la dernière météo pendant le chargement de la nouvelle position ;
6. la V2 ne distingue pas explicitement un timeout GPS d’un autre échec ;
7. les tests actuels vérifient principalement le composant d’interface, pas le parcours réel de géolocalisation.

## Matrice de comparaison

| Fonction | V1 | V2 actuelle | Écart |
|---|---|---|---|
| Contexte HTTPS vérifié | Oui | Oui | Aucun |
| API `navigator.geolocation` vérifiée | Oui | Oui | Aucun |
| `enableHighAccuracy` | `false` | `false` | Aucun |
| `timeout` | 20 s | 20 s | Aucun |
| `maximumAge` | 120 s | 120 s | Aucun |
| Numéro d’opération | Oui | Non | Important |
| Callback GPS obsolète ignoré | Oui | Non | Important |
| Lieu rapide pendant GPS | Bloqué ou invalidé | Possible | Important |
| Météo avant géocodage | Oui | Non garanti | Important |
| Libellé GPS provisoire | Oui | Non | Important |
| Géocodage séparé | Oui | Non | Important |
| Dernière météo conservée | Oui | Non garanti visuellement | Important |
| Refus distingué | Oui | Oui | Aucun |
| Timeout distingué | Oui | Non | Moyen |
| Échec indéterminé distingué | Oui | Message générique | Moyen |
| Tests de callback GPS réel | Partiels côté E2E | Absents | Important |

---

# Analyse détaillée

## 1. Acquisition GPS

La V2 appelle correctement :

```js
navigator.geolocation.getCurrentPosition(...)
```

avec les mêmes paramètres que la V1.

Aucun retour à `enableHighAccuracy: true` n’est recommandé.

## 2. Absence d’invalidation des callbacks

La V1 utilise un compteur de requêtes. Chaque action rend les callbacks précédents obsolètes.

La V2 ne possède pas de mécanisme équivalent.

Scénario problématique :

1. l’utilisateur appuie sur « Me localiser » ;
2. la recherche GPS commence ;
3. l’utilisateur choisit Marseille ;
4. Marseille est chargée ;
5. le callback GPS initial arrive ;
6. la position GPS remplace Marseille.

Ce comportement peut donner l’impression que les boutons ou la localisation ne répondent pas de manière fiable.

### Correction attendue

Introduire un identifiant d’opération conservé dans un `useRef`.

Chaque localisation et chaque sélection de lieu rapide doit incrémenter cet identifiant.

Les callbacks GPS ne doivent agir que si leur identifiant est toujours courant.

## 3. État `locating` lors d’un changement de lieu

La fonction actuelle de sélection d’un lieu rapide modifie les coordonnées mais ne termine pas explicitement une localisation en cours.

### Correction attendue

Lors d’un clic sur un lieu rapide :

- invalider l’opération GPS ;
- placer `locating` à `false` ;
- effacer l’erreur ;
- charger le lieu choisi.

## 4. Couplage à la résolution IGN

La V1 sépare :

```text
/api/meteo/point
/api/meteo/localisation
```

La météo est affichée dès que `/api/meteo/point` répond. Le libellé géographique arrive ensuite.

La V2 utilise :

```text
/api/v1/meteo/essential
```

Cette réponse comprend la géographie résolue côté API. Le résolveur IGN dispose de délais propres et peut ralentir la réponse complète.

Même lorsque le GPS du navigateur fonctionne, l’utilisateur peut donc rester plus longtemps devant un état de chargement.

### Décision recommandée

Conserver le contrat V2, mais restituer le comportement V1 :

- afficher immédiatement la dernière météo pendant la nouvelle requête ;
- afficher un libellé GPS provisoire dès l’obtention des coordonnées ;
- éviter que la résolution IGN bloque toute la perception de réussite ;
- étudier ensuite une séparation explicite entre météo et enrichissement géographique si le délai serveur reste sensible.

## 5. Conservation de la météo précédente

La V1 conserve explicitement `donnees` en cas d’échec ou pendant une nouvelle localisation.

Dans la V2, la donnée affichée dépend directement de la requête React Query associée aux nouvelles coordonnées.

Sans stratégie `placeholderData` ou état d’affichage séparé, le changement de clé peut remplacer la vue météo par un squelette jusqu’à la nouvelle réponse.

### Correction attendue

Utiliser une stratégie de conservation de la dernière réponse validée, par exemple :

- `placeholderData: keepPreviousData` ;
- ou un état `displayedWeather` mis à jour uniquement après succès.

L’interface doit signaler la recherche sans supprimer la dernière météo.

## 6. Messages d’erreur

La V2 distingue actuellement :

- refus d’autorisation ;
- autre erreur.

La V1 distingue :

- refus ;
- timeout ;
- erreur indéterminée.

### Correction attendue

Reprendre les messages V1, adaptés à la terminologie V2.

## 7. Libellé et précision

La V1 affiche immédiatement :

```text
Position GPS · latitude, longitude
```

puis remplace ce texte par le libellé résolu.

La V2 stocke `accuracyM` dans les coordonnées et l’envoie à l’API, mais ne possède pas de libellé provisoire indépendant de la réponse météo.

### Correction attendue

Introduire un état de sélection utilisateur distinct du contenu météo :

```ts
interface SelectedLocationState {
  coordinates: WeatherCoordinates;
  kind: "quick" | "gps";
  provisionalLabel?: string;
}
```

La précision GPS doit pouvoir être affichée dès le succès navigateur.

---

# Tests manquants

## Tests unitaires / composants

Ajouter les scénarios suivants :

1. succès GPS : les coordonnées et la précision sont utilisées ;
2. refus : la météo courante reste affichée ;
3. timeout : message spécifique ;
4. lieu rapide choisi pendant GPS : le callback GPS tardif est ignoré ;
5. deux localisations successives : seule la dernière réponse agit ;
6. échec météo après succès GPS : la météo précédente reste visible ;
7. réponse IGN lente : la page conserve un état utile.

## Tests navigateur

Tester au minimum :

- Chrome Android, largeur 360 px ;
- Chrome desktop ;
- Firefox desktop ;
- autorisation accordée ;
- autorisation refusée ;
- délai dépassé simulé ;
- coordonnées GPS proches d’un lieu rapide ;
- retour à un lieu rapide après localisation.

---

# Plan de correction proposé

## Lot A — Orchestration client

- ajouter un identifiant d’opération ;
- invalider les callbacks obsolètes ;
- terminer `locating` lors d’une sélection rapide ;
- différencier refus, timeout et erreur ;
- conserver la météo précédente ;
- ajouter les tests de concurrence.

## Lot B — Perception de rapidité

- afficher les coordonnées ou un libellé GPS provisoire ;
- afficher la précision dès le succès navigateur ;
- conserver la météo pendant la résolution ;
- mesurer le temps de `/api/v1/meteo/essential` avec et sans cache IGN.

## Lot C — Architecture partagée

Après validation du correctif, extraire les règles communes V1/V2 :

- options GPS ;
- classification des erreurs ;
- politique d’invalidation ;
- format du libellé provisoire.

L’extraction ne doit intervenir qu’après rétablissement du comportement fonctionnel.

# Critères de sortie de l’audit

L’audit est considéré terminé lorsque :

- la feuille de route est enregistrée ;
- la V1 est documentée ;
- les écarts V2 sont explicités ;
- un lot de correction client limité est défini ;
- les tests nécessaires sont listés.

La prochaine étape est l’implémentation du **Lot A — Orchestration client**.
