# Contrat de provenance des données météo

> **Lot 2 — spécification du contrat public**  
> Statut : proposition à implémenter  
> Base fonctionnelle : `c9538af1766503b765cb4e99dbf29dea752dc152`  
> Version OpenAPI cible : `1.3.0`  
> Version du sous-contrat de provenance : `1.0`

## 1. Objet

Ce document définit le futur objet `provenance` de la réponse
`GET /api/v1/meteo/essential`.

L’objectif est de permettre à l’interface, aux tests et aux outils de diagnostic
de répondre sans interpréter un texte libre aux questions suivantes :

1. quelle source fournit chaque valeur affichée ;
2. à quel instant la valeur se rapporte ;
3. si la valeur est observée, modélisée, officielle, dérivée ou fabriquée par un
   mécanisme de repli ;
4. si une station locale a été évaluée et pourquoi elle a été retenue ou non ;
5. si une absence de donnée correspond à une situation normale ou à une panne de
   fournisseur.

Le contrat complète l’audit décrit dans `provenance-audit.md`. Il ne modifie pas
les seuils de sélection des stations ni les fournisseurs actuels.

## 2. Périmètre

### 2.1 Inclus

Le contrat couvre la provenance de :

- la commune et le département ;
- l’altitude du lieu ;
- la température courante ;
- la température ressentie ;
- l’état du ciel ;
- les minimum et maximum du jour ;
- le prochain changement ;
- les six prochaines heures ;
- la vigilance officielle ;
- la décision de sélection d’une station locale.

### 2.2 Hors périmètre

Cette version ne définit pas encore :

- un historique public de toutes les stations candidates ;
- une fusion statistique entre station et modèle ;
- la provenance détaillée de chaque point horaire individuel ;
- une preuve cryptographique d’intégrité ;
- la provenance des pages comparaison et bilan thermique ;
- une modification des anciennes routes `/api/meteo/*`.

Les motifs détaillés de rejet par station restent prévus pour les logs et le
diagnostic interne. Le contrat public expose uniquement le résultat synthétique
de la décision.

## 3. Principes normatifs

### 3.1 Une provenance par valeur fonctionnelle

Une réponse ne doit pas attribuer une seule source à un bloc qui mélange des
valeurs de natures différentes.

Exemple : lorsque la température est mesurée en station mais que le ressenti et
l’état du ciel proviennent d’AROME, ces trois valeurs possèdent trois entrées de
provenance distinctes.

### 3.2 Aucun horodatage surchargé

Chaque date possède une signification unique :

- `observedAt` : instant d’une mesure physique ;
- `validAt` : échéance à laquelle une prévision ou un produit officiel s’applique ;
- `generatedAt` : instant de production annoncé par le fournisseur ;
- `retrievedAt` : instant auquel OpenDataVal a récupéré ou assemblé la donnée.

Une prévision ne doit jamais utiliser `observedAt`.

### 3.3 Texte et données structurées séparés

Les libellés destinés au public restent présents pour faciliter l’affichage, mais
les décisions de l’interface doivent reposer sur des codes et des champs
structurés.

`sourceLabel` ne doit plus être la seule manière de déterminer la source.

### 3.4 L’absence de station n’est pas nécessairement une indisponibilité

Aucune station admissible peut constituer un résultat normal. Dans ce cas :

- la température peut être fournie par le modèle ;
- `stationSelection.status` vaut `no_eligible_station` ou `no_measurements` ;
- `unavailableSources` ne contient pas `Observations locales` ;
- aucune alerte de panne n’est affichée.

`Observations locales` n’est ajouté à `unavailableSources` que si la lecture de la
source ou de la base échoue techniquement.

### 3.5 Compatibilité ascendante

L’ajout de `provenance` est compatible avec les clients du contrat 1.2.0. Les
champs existants restent temporairement présents.

Le nouvel objet devient cependant la référence normative. Les champs historiques
sont des vues de compatibilité.

## 4. Forme générale

```json
{
  "provenance": {
    "schemaVersion": "1.0",
    "weatherMode": "hybrid",
    "summary": "Température mesurée localement ; autres conditions et prévisions modélisées.",
    "values": {
      "municipality": {},
      "department": {},
      "altitude": {},
      "currentTemperature": {},
      "apparentTemperature": {},
      "weatherCondition": {},
      "todayRange": {},
      "nextChange": {},
      "nextHours": {},
      "alert": {}
    },
    "stationSelection": {}
  }
}
```

`provenance` est obligatoire dans la version OpenAPI 1.3.0 cible.

## 5. Mode météo global

Le champ `weatherMode` décrit la composition des valeurs météorologiques
courantes, et non la localisation ou la vigilance.

| Valeur | Définition |
|---|---|
| `model` | La température, le ressenti et l’état du ciel sont fournis par un modèle. |
| `observation` | Toutes les conditions courantes affichées sont issues d’observations ou de calculs directement dérivés de ces observations. |
| `hybrid` | Les conditions courantes combinent observation, modèle ou valeur dérivée de natures différentes. |
| `unavailable` | Aucune condition courante exploitable n’est disponible. |

Avec l’architecture de `c9538af`, une température issue d’une station et un
ressenti issu d’AROME produisent donc obligatoirement `hybrid`.

## 6. Dictionnaire `values`

Les clés sont stables et obligatoires. Une donnée absente conserve son entrée avec
`status: unavailable`.

| Clé | Valeur fonctionnelle décrite |
|---|---|
| `municipality` | Commune affichée et code INSEE. |
| `department` | Département affiché et code utilisé pour la vigilance. |
| `altitude` | Altitude du lieu demandé. |
| `currentTemperature` | Température principale actuelle. |
| `apparentTemperature` | Température ressentie. |
| `weatherCondition` | Libellé de condition météorologique. |
| `todayRange` | Minimum et maximum du jour. |
| `nextChange` | Prochain changement détecté. |
| `nextHours` | Série horaire affichée. |
| `alert` | Vigilance officielle départementale. |

## 7. Structure d’une provenance de valeur

Chaque entrée de `values` respecte la structure suivante :

```json
{
  "status": "available",
  "nature": "model",
  "label": "Prévision modélisée",
  "source": {
    "id": "open-meteo-meteofrance",
    "name": "Open-Meteo",
    "provider": "Open-Meteo",
    "product": "Météo-France seamless",
    "model": "AROME / ARPEGE",
    "url": "https://open-meteo.com/",
    "license": null
  },
  "time": {
    "observedAt": null,
    "validAt": "2026-07-22T14:00:00.000Z",
    "generatedAt": null,
    "retrievedAt": "2026-07-22T14:02:10.000Z"
  },
  "quality": {
    "stale": false,
    "ageMinutes": null,
    "spatialResolution": "1,5 à 2,5 km",
    "modelPoint": {
      "latitude": 44.08,
      "longitude": 3.64,
      "altitudeM": 351
    }
  },
  "station": null,
  "derivedFrom": [],
  "notes": []
}
```

### 7.1 `status`

| Code | Signification |
|---|---|
| `available` | La valeur est utilisable dans les conditions normales. |
| `partial` | La valeur est utilisable, mais sa provenance ou certains composants sont incomplets. |
| `unavailable` | La valeur n’est pas disponible. |

`partial` ne doit pas servir à signaler une simple absence de station si un modèle
fournit normalement la valeur.

### 7.2 `nature`

| Code | Signification |
|---|---|
| `observation` | Mesure physique issue d’une station ou d’un capteur. |
| `model` | Valeur issue d’un modèle de prévision ou d’analyse. |
| `official` | Produit réglementaire ou institutionnel officiel, notamment la vigilance. |
| `geographic` | Résolution géographique ou altimétrique. |
| `derived` | Valeur calculée par OpenDataVal à partir d’autres données. |
| `fallback` | Valeur fabriquée pour conserver une réponse exploitable en l’absence d’une donnée attendue. |
| `unavailable` | Aucune provenance exploitable. |

Une valeur arrondie reste de la nature de sa source. L’arrondi seul ne justifie pas
`derived`.

### 7.3 `label`

`label` est une phrase courte directement affichable. Exemples :

- `Mesure locale` ;
- `Prévision modélisée` ;
- `Vigilance officielle Météo-France` ;
- `Altitude issue de l’IGN` ;
- `Valeur de repli`.

Le libellé ne constitue pas un identifiant stable.

### 7.4 `source`

`source` vaut `null` seulement si la donnée est indisponible ou si une valeur de
repli ne correspond à aucun fournisseur extérieur.

Les identifiants initiaux sont :

| `source.id` | Source |
|---|---|
| `ign-geocodage` | Géocodage inverse de la Géoplateforme IGN. |
| `ign-altimetrie` | Service altimétrique de la Géoplateforme IGN. |
| `open-meteo-meteofrance` | Modèles Météo-France diffusés par Open-Meteo. |
| `meteofrance-dpobs` | Observations Météo-France collectées dans PostgreSQL. |
| `infoclimat-static` | Observations du réseau StatIC collectées dans PostgreSQL. |
| `meteofrance-vigilance` | API publique DPVigilance de Météo-France. |
| `opendataval-derived` | Calcul ou synthèse produit par OpenDataVal. |

Les identifiants ne contiennent pas de numéro de version de modèle. Le modèle et
le produit sont décrits par les champs dédiés.

### 7.5 `time`

Tous les champs sont présents et valent une chaîne ISO 8601 UTC ou `null`.

| Champ | Utilisation |
|---|---|
| `observedAt` | Mesures de station uniquement. |
| `validAt` | Heure du modèle, période de vigilance ou échéance calculée. |
| `generatedAt` | Heure de production fournie explicitement par la source. |
| `retrievedAt` | Heure de récupération ou d’assemblage côté OpenDataVal. |

Règles :

- une observation possède `observedAt` et pas `validAt` ;
- une prévision possède `validAt` et pas `observedAt` ;
- une vigilance peut posséder `generatedAt` et `validAt` ;
- l’absence d’horodatage fournisseur reste `null` et n’est pas remplacée par
  l’heure courante ;
- `retrievedAt` ne doit pas être présenté comme l’heure de la donnée.

### 7.6 `quality`

`quality` décrit les éléments utiles à l’interprétation sans reproduire tous les
détails internes.

- `stale` est obligatoire ;
- `ageMinutes` est réservé aux observations ;
- `spatialResolution` est un libellé informatif pour les modèles ;
- `modelPoint` décrit le point de grille annoncé par le fournisseur ;
- les valeurs inconnues sont `null`, jamais inventées.

### 7.7 `station`

`station` est renseigné uniquement pour une provenance d’observation.

```json
{
  "id": "000UB",
  "name": "Valleraugue",
  "network": "infoclimat",
  "altitudeM": 400,
  "distanceKm": 2.4,
  "altitudeDifferenceM": 46,
  "ageMinutes": 12,
  "selectionScore": 10.7,
  "license": "CC BY-NC 4.0"
}
```

Les coordonnées précises de la station ne sont pas nécessaires au contrat
essentiel. Elles restent disponibles dans le catalogue technique si une future
carte doit les utiliser.

### 7.8 `derivedFrom`

`derivedFrom` contient les clés de `values` utilisées pour calculer la valeur.

Exemples :

- un prochain changement calculé à partir de la série horaire : `["nextHours"]` ;
- un ressenti calculé à partir d’observations :
  `["currentTemperature", "currentHumidity", "currentWind"]` dans un futur
  contrat étendu.

Une valeur directement extraite d’une source utilise un tableau vide.

### 7.9 `notes`

`notes` contient des avertissements courts et non structurants. Les codes de
décision ne doivent jamais être remplacés par ce champ.

## 8. Décision de sélection d’une station

```json
{
  "policyVersion": "1",
  "status": "no_eligible_station",
  "reasonCode": "NO_ELIGIBLE_STATION",
  "evaluatedCandidates": 22,
  "eligibleCandidates": 0,
  "selectedStationId": null
}
```

### 8.1 `status`

| Code | Signification |
|---|---|
| `selected` | Une station admissible a été retenue. |
| `no_measurements` | Le catalogue existe, mais aucune mesure valide n’a été chargée. |
| `no_eligible_station` | Des mesures ont été évaluées, mais aucune ne respecte la politique. |
| `provider_unavailable` | La lecture des observations a échoué techniquement. |
| `not_evaluated` | La sélection n’a pas été exécutée. |

### 8.2 `reasonCode`

| Code | `status` associé | Signification |
|---|---|---|
| `BEST_ELIGIBLE_STATION` | `selected` | La station ayant le meilleur score admissible a été retenue. |
| `NO_VALID_MEASUREMENTS` | `no_measurements` | Aucune mesure valide et horodatée n’était exploitable. |
| `NO_ELIGIBLE_STATION` | `no_eligible_station` | Toutes les candidates ont été rejetées par au moins une règle. |
| `STATION_DATA_UNAVAILABLE` | `provider_unavailable` | Erreur technique de base ou de fournisseur. |
| `SELECTION_NOT_RUN` | `not_evaluated` | La sélection n’a pas été demandée ou a été court-circuitée. |

### 8.3 Compteurs

- `evaluatedCandidates` compte les mesures valides soumises aux règles de
  représentativité ;
- `eligibleCandidates` compte les candidates ayant franchi tous les garde-fous ;
- les compteurs valent `null` lorsque la source est techniquement indisponible ;
- `selectedStationId` est non nul uniquement pour `selected`.

### 8.4 Motifs internes de rejet

Les codes suivants sont réservés au diagnostic interne et aux tests. Ils ne sont
pas exigés dans la réponse publique 1.0 :

- `INVALID_TEMPERATURE` ;
- `INVALID_TIMESTAMP` ;
- `FUTURE_TIMESTAMP` ;
- `TOO_OLD` ;
- `TOO_FAR` ;
- `ALTITUDE_UNKNOWN_TOO_FAR` ;
- `ALTITUDE_MISMATCH` ;
- `SCORE_TOO_HIGH` ;
- `ELIGIBLE_NOT_SELECTED`.

Une candidate peut cumuler plusieurs motifs.

## 9. Politique de sélection version 1

Le contrat référence la politique existante sans la modifier :

| Paramètre | Valeur |
|---|---:|
| Distance maximale | 50 km |
| Distance maximale sans altitude IGN | 5 km |
| Écart d’altitude maximal | 500 m |
| Âge maximal | 90 min |
| Donnée marquée ancienne après | 60 min |
| Tolérance d’horodatage futur | 15 min |
| Score maximal | 60 |

Composition du score :

- distance : 50 points au maximum ;
- altitude : 30 points au maximum ;
- fraîcheur : 20 points au maximum ;
- réseau Infoclimat : pénalité de 5 points ;
- un score bas est préférable.

Toute modification de ces valeurs impose une nouvelle `policyVersion`.

## 10. Règles par valeur

### 10.1 Commune et département

- `nature: geographic` ;
- source `ign-geocodage` lorsque l’IGN répond ;
- `status: unavailable` en cas d’échec ;
- aucun département de repli n’est inventé ;
- le département de la vigilance doit être identique au département résolu.

### 10.2 Altitude

- `nature: geographic` ;
- source `ign-altimetrie` ;
- `status: unavailable` si l’altitude n’est pas résolue ;
- l’altitude du point modèle ne remplace pas l’altitude du lieu.

### 10.3 Température courante

- `nature: observation` si une station est sélectionnée ;
- sinon `nature: model` si le modèle fournit une température ;
- `station` est renseigné uniquement dans le premier cas ;
- `observedAt` est utilisé pour la station ;
- `validAt` est utilisé pour le modèle.

### 10.4 Ressenti et état du ciel

Dans l’architecture actuelle :

- `nature: model` ;
- source `open-meteo-meteofrance` ;
- ces valeurs ne deviennent pas des observations lorsque seule la température est
  remplacée par une mesure de station.

### 10.5 Minimum et maximum du jour

- `nature: model` ;
- source `open-meteo-meteofrance` ;
- si la température courante observée élargit artificiellement l’intervalle par
  `min()` ou `max()`, l’entrée passe à `nature: derived` et indique
  `derivedFrom: ["currentTemperature"]` avec une note explicite ;
- à terme, il est préférable de ne pas altérer la plage quotidienne modélisée sans
  règle métier distincte.

### 10.6 Prochain changement

- `nature: derived` ;
- source `opendataval-derived` ;
- `derivedFrom: ["nextHours"]` ;
- les seuils utilisés doivent être documentés ;
- une échéance fabriquée faute d’heure source doit être signalée comme repli et non
  comme heure du modèle.

### 10.7 Prochaines heures

- `nature: model` dans l’architecture actuelle ;
- source `open-meteo-meteofrance` ;
- `validAt` correspond à la première échéance du tableau ;
- un tableau synthétique fabriqué parce que la série est vide utilise
  `nature: fallback`.

### 10.8 Vigilance

- `nature: official` ;
- source `meteofrance-vigilance` ;
- `status: unavailable` si le département n’est pas résolu ou si l’API ne permet
  pas d’établir le niveau ;
- le niveau `green` n’est jamais utilisé pour masquer une indisponibilité ;
- `generatedAt` correspond à l’heure `update_time` du produit ;
- `validAt` doit provenir de la période officielle lorsque disponible ;
- une échéance `generatedAt + 24 h` n’est pas considérée comme une validité
  officielle.

## 11. Compatibilité avec le contrat 1.2.0

| Champ existant | Règle de compatibilité |
|---|---|
| `current.nature` | Reflète uniquement `provenance.values.currentTemperature.nature` avec les valeurs `observation` ou `model`. |
| `current.sourceLabel` | Généré à partir de la provenance ; conservé temporairement pour l’affichage. |
| `current.observedAt` | Reflète `observedAt` pour une mesure et `validAt` pour un modèle ; le champ reste donc historiquement surchargé. |
| `current.stale` | Reflète `provenance.values.currentTemperature.quality.stale`. |
| `current.station` | Reflète `provenance.values.currentTemperature.station`. |
| `unavailableSources` | Signale uniquement des indisponibilités techniques réelles. |
| `generatedAt` | Heure d’assemblage de la réponse par OpenDataVal. |

Les clients nouveaux doivent lire `provenance`. La suppression des champs de
compatibilité nécessitera une version majeure ultérieure.

## 12. Réponses dégradées et erreurs HTTP

### 12.1 Modèle disponible, observations indisponibles

- réponse HTTP `200` ;
- `weatherMode: model` ;
- température issue du modèle ;
- `stationSelection.status: provider_unavailable` ;
- `Observations locales` présent dans `unavailableSources`.

### 12.2 Aucune station admissible, modèle disponible

- réponse HTTP `200` ;
- `weatherMode: model` ;
- `stationSelection.status: no_eligible_station` ;
- `Observations locales` absent de `unavailableSources`.

### 12.3 Modèle indisponible, observation disponible

- réponse HTTP `200` si les valeurs essentielles peuvent être constituées ;
- `weatherMode: observation` ou `hybrid` selon les valeurs réellement disponibles ;
- les provenances manquantes utilisent `status: unavailable` ;
- `Modèles Météo-France (AROME/ARPEGE)` est présent dans
  `unavailableSources`.

### 12.4 Aucune température exploitable

- réponse HTTP `503` ;
- le corps d’erreur conserve `generatedAt` et `unavailableSources` ;
- le sous-contrat `provenance` n’est pas obligatoire dans la première version de
  l’erreur, mais son ajout est recommandé pour harmoniser le diagnostic.

## 13. Confidentialité et journalisation

Le contrat public peut renvoyer les coordonnées demandées, car elles sont déjà
nécessaires à l’affichage. Il ne doit pas ajouter d’identifiant persistant de
l’utilisateur.

Pour les positions GPS :

- aucune coordonnée précise ne doit être inscrite dans les logs de décision ;
- les métriques agrégées utilisent des coordonnées arrondies ou un identifiant de
  zone non réversible ;
- la précision GPS ne doit pas être interprétée comme une précision de la
  prévision ;
- les stations candidates rejetées ne sont pas exposées au public par défaut.

## 14. Règles d’affichage dérivables

L’interface peut déterminer ses libellés sans analyser `sourceLabel` :

| Condition | Libellé principal |
|---|---|
| `currentTemperature.nature = observation` | `Mesure locale` |
| `currentTemperature.nature = model` | `Prévision modélisée` |
| `weatherMode = hybrid` | `Mesure locale complétée par le modèle` |
| `stationSelection.status = no_eligible_station` | `Aucune station suffisamment représentative` dans le détail |
| `stationSelection.status = provider_unavailable` | `Observations locales momentanément indisponibles` |
| `quality.stale = true` | `Dernière donnée connue` |

La couleur ne doit jamais être l’unique vecteur de cette information.

## 15. Critères d’acceptation du contrat

Le contrat est prêt à être implémenté lorsque :

1. chaque clé de `values` possède une sémantique non ambiguë ;
2. observation et prévision n’utilisent plus le même type d’horodatage ;
3. le mode hybride est explicitement représentable ;
4. l’absence normale de station est distinguée d’une panne ;
5. les codes de décision sont stables ;
6. la politique de sélection est versionnée ;
7. les champs historiques possèdent une règle de compatibilité ;
8. les exemples JSON passent la validation du schéma ;
9. aucune modification des seuils métier n’est introduite ;
10. le contrat permet de construire l’interface sans texte métier produit par le
    backend.

## 16. Suite d’implémentation

Après validation de cette spécification :

1. intégrer le schéma de provenance à `openapi.yaml` ;
2. régénérer `apps/meteo-web/src/api/schema.d.ts` ;
3. modifier le moteur de sélection pour retourner une décision structurée ;
4. construire `provenance` dans `normaliserEssential` ;
5. ajouter les tests de contrat et de non-régression ;
6. seulement ensuite créer les composants d’interface de détail.
