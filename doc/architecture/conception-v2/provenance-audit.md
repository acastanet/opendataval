# Audit de provenance des données météo

> **Lot 1 — état des lieux**  
> Référence de code auditée : `c9538af1766503b765cb4e99dbf29dea752dc152`  
> Date de l’audit : 22 juillet 2026  
> Périmètre : page météo essentielle actuelle, application Météo V2 et contrats API associés.

## 1. Objectif de l’audit

Cet audit prépare le chantier d’explicabilité de la provenance des données météo.
Il décrit, sans modifier la logique métier :

- les chaînes applicatives actuellement coexistantes ;
- les données visibles et leur source réelle ;
- les fournisseurs, calculs et transformations intermédiaires ;
- les champs déjà disponibles dans les réponses API ;
- les composants qui affichent ces informations ;
- les ambiguïtés et manques à traiter dans le contrat de provenance.

Le terme **provenance** désigne ici l’ensemble des informations nécessaires pour
répondre à quatre questions : d’où vient une valeur, à quel instant se rapporte-t-elle,
quelle transformation a été appliquée et pourquoi cette source a été retenue.

## 2. Résumé exécutif

Deux chaînes météo essentielle coexistent encore.

1. La page publique historique `/meteo/essentiel/` est une page Astro/Svelte qui
   interroge principalement `GET /api/meteo/point`.
2. L’application autonome `/meteo-v2/` est une application React/TypeScript qui
   interroge `GET /api/v1/meteo/essential` selon le contrat OpenAPI 1.2.0.

Le déploiement `c9538af` améliore uniquement la seconde chaîne : la température
courante peut y provenir d’une station locale représentative, sinon du modèle.
La page publique historique continue d’afficher la température du modèle, même si
`/api/meteo/point` retourne séparément une observation de station.

Dans la V2, la provenance est partiellement exposée pour la température courante
avec `nature`, `sourceLabel`, `observedAt`, `stale` et `station`. Elle n’est pas
structurée pour les autres valeurs. Le même bloc `current` peut mélanger :

- une température observée en station ;
- un ressenti estimé par le modèle ;
- un état du ciel estimé par le modèle ;
- un horodatage qui change de signification selon la source de la température.

L’absence de station admissible est correctement traitée comme un choix normal du
modèle et non comme une panne. En revanche, l’API ne conserve pas les stations
rejetées ni leurs motifs de rejet. Il est donc impossible d’expliquer précisément
au client pourquoi aucune station n’a été choisie.

## 3. Architecture observée

### 3.1 Chaîne publique historique

```text
/meteo/essentiel/
  └─ apps/web/src/pages/meteo/essentiel.astro
      └─ apps/web/src/islands/MeteoEssentiel.svelte
          ├─ GET /api/meteo/point
          ├─ GET /api/meteo/localisation
          ├─ GET /api/meteo/contexte-climatique
          └─ GET /api/meteo/bilan-thermique
```

La page affiche la météo de court terme à partir de `courtTerme.current`,
`courtTerme.hourly` et `courtTerme.daily`. Ces blocs proviennent du modèle
Météo-France diffusé par Open-Meteo. La réponse `/api/meteo/point` contient aussi
un objet `observation`, mais cet objet n’est pas utilisé pour la température
principale de la page historique.

### 3.2 Chaîne autonome Météo V2

```text
/meteo-v2/
  └─ apps/meteo-web/src/App.tsx
      ├─ GET /api/v1/meteo/locations
      └─ GET /api/v1/meteo/essential
          ├─ résolution géographique IGN
          ├─ modèle Météo-France via Open-Meteo
          ├─ mesures locales en PostgreSQL
          └─ vigilance officielle Météo-France
```

L’API normalise les données avant de les transmettre au frontend. Le frontend ne
connaît pas la structure des fournisseurs bruts et consomme uniquement le schéma
OpenAPI généré.

### 3.3 Écrans connexes

| Écran | Route publique | Rôle dans le chantier de provenance |
|---|---|---|
| Météo essentielle historique | `/meteo/essentiel/` | Production publique actuelle ; chaîne à comparer avant bascule. |
| Météo essentielle V2 | `/meteo-v2/` | Cible du nouveau contrat de provenance. |
| Comparaison des révisions | `/meteo/comparaison/` | Provenance propre aux archives de prévisions J−1/J ; hors premier incrément. |
| Bilan thermique | `/meteo/bilan-thermique/` | Provenance Copernicus distincte ; hors premier incrément. |
| Sources et limites | `/meteo/informations/` | Niveau documentaire ; ne remplace pas l’explication au voisinage de la valeur. |

## 4. Inventaire des fournisseurs et stockages

| Domaine | Fournisseur ou origine | Accès dans le code audité | Données concernées |
|---|---|---|---|
| Localisation administrative | Géoplateforme IGN, géocodage inverse | `data.geopf.fr/geocodage/reverse` | libellé, commune, code INSEE, département |
| Altitude du point | Géoplateforme IGN, RGE ALTI | `data.geopf.fr/altimetrie/.../elevation.json` | altitude du lieu demandé |
| Prévision court terme | Modèles Météo-France diffusés par Open-Meteo | `api.open-meteo.com/v1/meteofrance` | température, ressenti, état du ciel, prévision horaire, min/max, pluie, rafales |
| Observations locales | Catalogue local Météo-France et Infoclimat, mesures stockées en PostgreSQL | table `series.meteo_horaire` | température de station la plus récente |
| Vigilance officielle | Météo-France DPVigilance | `public-api.meteofrance.fr/public/DPVigilance/v1/cartevigilance/encours` | niveau départemental, phénomènes, date de mise à jour |
| Coordonnées utilisateur | Navigateur ou lieu préconfiguré | Geolocation API ou catalogue partagé | latitude, longitude, précision GPS |
| Horodatage de réponse | Serveur API | horloge du serveur | `generatedAt` |

### 4.1 Catalogue des stations

Le catalogue `STATIONS_METEO` est figé dans `packages/shared/src/stationsMeteo.ts`.
Il contient :

- des stations Météo-France RADOME ;
- des stations Météo-France ETENDU ;
- des stations amateurs Infoclimat StatIC ;
- leurs coordonnées, altitude, réseau et licence.

La découverte des stations n’est pas dynamique. Le commentaire du catalogue
indique qu’il doit être revérifié périodiquement.

### 4.2 Mesures locales

`loadLatestStationMeasurements` lit une seule ligne récente par identifiant de
station dans `series.meteo_horaire`. Pour le contrat V2 actuel, seule la
**température** `t` est chargée avec `heure_utc`.

Les autres grandeurs éventuellement présentes en base — humidité, vent, rafales,
pluie ou pression — ne participent pas au choix de la valeur courante V2.

## 5. Règle actuelle de sélection d’une station V2

La fonction `selectStationObservation` applique les garde-fous suivants :

| Critère | Règle actuelle |
|---|---|
| Âge maximal | 90 minutes |
| Tolérance d’horodatage futur | 15 minutes |
| Distance maximale | 50 km |
| Distance maximale sans altitude IGN | 5 km |
| Écart d’altitude maximal | 500 m |
| Score maximal | 60 |
| Donnée acceptée | température comprise entre −60 °C et +60 °C |

Le score combine :

- distance : 50 points au maximum ;
- écart d’altitude : 30 points au maximum ;
- fraîcheur : 20 points au maximum ;
- réseau Infoclimat : pénalité fixe de 5 points.

Une valeur basse est préférable. Les candidats admissibles sont départagés par le
score, puis par le réseau, la distance, l’âge et l’identifiant de station.

### Limite d’explicabilité

La fonction retourne uniquement la meilleure station ou `null`. Elle ne retourne
pas :

- le nombre de candidats examinés ;
- les candidats rejetés ;
- le ou les critères responsables du rejet ;
- le meilleur candidat non admissible ;
- la distinction entre « aucune mesure trouvée » et « toutes les mesures rejetées ».

Cette perte d’information constitue le principal blocage du prochain contrat de
provenance.

## 6. Inventaire des données affichées par Météo V2

### 6.1 Localisation

| Valeur affichée | Champ API | Source réelle | Transformation |
|---|---|---|---|
| Nom du lieu | `location.label` | lieu préconfiguré ou commune IGN | priorité au libellé du point préconfiguré |
| Commune | `location.municipality.name` | IGN | normalisation Paris, Lyon et Marseille |
| Département | `location.department` | code INSEE et contexte IGN | extraction du code départemental |
| Altitude | `location.altitudeM` | RGE ALTI IGN | arrondi au mètre |
| Coordonnées | `location.latitude`, `longitude` | lieu rapide ou navigateur | coordonnées demandées, non le point modèle |
| Précision GPS | `location.accuracyM` | navigateur | reprise de la valeur Geolocation API |
| Type de position | `location.source` | application | `preset` ou `gps` |

### 6.2 Bloc « maintenant »

| Valeur affichée | Champ API | Source réelle | Observation |
|---|---|---|---|
| Température | `current.temperatureC` | station sélectionnée ou modèle Open-Meteo/Météo-France | seule valeur actuellement substituable par une station |
| Nature | `current.nature` | décision de sélection | décrit la température, pas tout le bloc `current` |
| Ressenti | `current.apparentTemperatureC` | modèle | reste modélisé même si la température est observée |
| État du ciel | `current.weatherLabel` | code WMO du modèle | reste modélisé même si la température est observée |
| Heure | `current.observedAt` | heure station ou heure du modèle | sémantique variable selon `nature` |
| Fraîcheur | `current.stale` | âge de l’observation | toujours `false` pour le modèle dans le contrat actuel |
| Libellé source | `current.sourceLabel` | texte construit par l’API | texte libre, non exploitable comme contrat stable |
| Station | `current.station` | sélection métier | `null` quand le modèle est utilisé |

Lorsque la station est retenue, `sourceLabel` précise que seule la température est
mesurée et que le reste est estimé par AROME. Cette précision est utile mais reste
encodée dans une phrase française et non dans des champs structurés.

### 6.3 Minimum et maximum du jour

| Valeur | Champ API | Source | Transformation |
|---|---|---|---|
| Minimum | `today.minimumC` | minimum quotidien du modèle | borné avec la température courante pour éviter un minimum supérieur au présent |
| Maximum | `today.maximumC` | maximum quotidien du modèle | borné avec la température courante pour éviter un maximum inférieur au présent |

En cas de température observée, le minimum ou maximum final peut donc intégrer
indirectement cette observation. Le contrat ne signale pas cette transformation.

### 6.4 Prochain changement

| Valeur | Champ API | Source | Transformation |
|---|---|---|---|
| Type | `nextChange.type` | série horaire du modèle | seule la pluie est effectivement détectée dans l’implémentation actuelle ; sinon `stable` |
| Début | `nextChange.startsAt` | heure du modèle | première probabilité de pluie supérieure ou égale à 30 % |
| Résumé | `nextChange.summary` | code WMO et règle applicative | phrase générée par l’API |
| Probabilité | `nextChange.probabilityPercent` | modèle | arrondi et borné entre 0 et 100 |

Le type prévoit `wind` et `temperature`, mais ces deux décisions ne sont pas encore
produites par l’algorithme audité.

### 6.5 Prochaines heures

| Valeur | Champ API | Source | Transformation |
|---|---|---|---|
| Heure | `nextHours[].at` | série horaire du modèle | six premières échéances futures |
| Température | `nextHours[].temperatureC` | modèle | arrondi au dixième |
| Probabilité de pluie | `nextHours[].rainProbabilityPercent` | modèle | arrondie et bornée |
| Rafale | `nextHours[].windGustKmh` | modèle | arrondie au dixième |

Si la série horaire est vide, l’API fabrique une échéance de repli à `generatedAt +
1 h` avec la température courante, 0 % de pluie et 0 km/h de rafale. Cette valeur de
repli n’est pas distinguée d’une vraie prévision dans le contrat.

### 6.6 Vigilance

| Valeur | Champ API | Source | Transformation |
|---|---|---|---|
| Niveau | `alert.level` | Météo-France DPVigilance | maximum identifié pour le département |
| Titre | `alert.title` | règle applicative | phrase française générée |
| Phénomènes | `alert.phenomena` | Météo-France | traduction des identifiants officiels |
| Département | `alert.departmentCode` | IGN puis code INSEE | aucun département de repli inventé |
| URL | `alert.sourceUrl` | lien public Météo-France | lien générique actuel |
| Indisponibilité | `alert.indisponible` | décision applicative | vrai si département ou produit introuvable |
| Fin de validité | `alert.validUntil` | serveur | actuellement `generatedAt + 24 h`, pas la fin officielle du produit |

## 7. Champs actuels de `GET /api/v1/meteo/essential`

```text
EssentialWeather
├─ location
│  ├─ id
│  ├─ label
│  ├─ latitude / longitude
│  ├─ municipality
│  ├─ department
│  ├─ altitudeM
│  ├─ accuracyM
│  └─ source
├─ current
│  ├─ temperatureC
│  ├─ apparentTemperatureC
│  ├─ weatherLabel
│  ├─ observedAt
│  ├─ nature
│  ├─ sourceLabel
│  ├─ stale
│  └─ station
│     ├─ id / name / network / altitudeM
│     ├─ distanceKm
│     ├─ altitudeDifferenceM
│     ├─ ageMinutes
│     └─ selectionScore
├─ today
│  ├─ minimumC
│  └─ maximumC
├─ nextChange
├─ nextHours[]
├─ alert
├─ unavailableSources[]
└─ generatedAt
```

## 8. Sémantique actuelle de `unavailableSources`

La liste reçoit actuellement les valeurs suivantes :

| Valeur | Condition |
|---|---|
| `Géocodage IGN` | commune ou département non résolu |
| `Altimétrie IGN` | altitude non résolue |
| `Modèles Météo-France (AROME/ARPEGE)` | appel Open-Meteo en échec |
| `Observations locales` | erreur de lecture des mesures en base |
| `Vigilance Météo-France` | département ou produit officiel indisponible |

Une absence normale de station admissible n’ajoute pas `Observations locales` à la
liste. Ce comportement est correct : il distingue l’indisponibilité technique du
choix métier de préférer le modèle.

La liste reste toutefois globale. Elle ne permet pas de relier une indisponibilité
à une valeur précise ni de distinguer l’échec total d’une source d’une donnée
partielle ou trop ancienne.

## 9. Composants d’interface concernés

### Application V2

| Composant | Responsabilité actuelle | Besoin futur |
|---|---|---|
| `App.tsx` | charge les lieux et `/essential`, affiche les données partielles | rattacher les indisponibilités aux groupes de données |
| `WeatherHero.tsx` | affiche lieu, température, nature, ressenti, min/max et `sourceLabel` | accueillir le résumé de provenance et le panneau détaillé |
| `presentation.ts` | produit `Mesure locale`, `Estimation locale` ou `Dernière donnée connue` | utiliser un vocabulaire dérivé de codes stables |
| `AlertBanner.tsx` | affiche la vigilance | exposer heure officielle, département et état de disponibilité |
| `NextChangeCard.tsx` | affiche le prochain changement | signaler explicitement son origine modélisée |
| `HourlyStrip.tsx` | affiche les six prochaines heures | signaler la source commune de la série |
| `LocationSelector.tsx` | choisit un lieu ou la position GPS | conserver l’origine et la précision de la position |

### Page historique

`MeteoEssentiel.svelte` affiche explicitement « estimation locale » pour la
température. Avant la bascule des anciennes URL, la recette devra vérifier que la
nouvelle page ne donne pas l’impression que toutes les grandeurs du bloc sont des
observations lorsqu’une station fournit uniquement la température.

## 10. Écarts et risques identifiés

### 10.1 Provenance portée par un bloc trop large

`current.nature` semble qualifier tout le bloc `current`, alors qu’il ne qualifie
que `temperatureC`. Le ressenti et l’état du ciel restent issus du modèle.

### 10.2 Texte libre utilisé comme contrat

`sourceLabel` contient une information utile mais mélange fournisseur, type de
donnée, réseau, nom de station, distance et part modélisée. Toute évolution de la
phrase peut casser des tests ou des usages clients.

### 10.3 Horodatages ambigus

- `current.observedAt` signifie heure d’observation pour une station et heure de
  validité du modèle dans l’autre cas ;
- `generatedAt` signifie heure de génération de la réponse ;
- l’heure de production du modèle n’est pas exposée ;
- `alert.validUntil` est calculé localement et ne correspond pas nécessairement à
  la validité officielle.

### 10.4 Absence de diagnostic de sélection

La station retenue est détaillée, mais aucune justification structurée n’existe
lorsque `station` vaut `null`.

### 10.5 Provenance absente des prévisions dérivées

`today`, `nextChange` et `nextHours` n’ont aucun objet source associé. Le client
doit déduire qu’ils proviennent du modèle.

### 10.6 Valeurs de repli non signalées

L’échéance horaire de secours avec pluie et rafale à zéro ressemble à une vraie
prévision. Une provenance explicite devra distinguer une valeur fournisseur, une
valeur dérivée et une valeur de repli.

### 10.7 Divergence entre production historique et V2

Les deux pages peuvent donner des températures différentes au même instant :

- la page historique utilise le modèle ;
- la V2 peut utiliser une station locale.

Cette divergence est attendue pendant la migration, mais elle doit être connue et
couverte par la recette avant redirection des anciennes URL.

### 10.8 Exposition insuffisante du modèle

Le contrat V2 nomme AROME dans `sourceLabel`, mais ne fournit pas séparément :

- le diffuseur Open-Meteo ;
- le producteur Météo-France ;
- le modèle ou assemblage effectivement servi ;
- le point et l’altitude du modèle ;
- l’heure de production et l’heure de validité.

## 11. Décisions à prendre dans le lot 2

Le futur contrat de provenance devra trancher les points suivants.

1. **Granularité** : provenance par champ, par groupe homogène ou combinaison des
   deux. Une provenance unique pour tout `current` n’est pas suffisante.
2. **Codes stables** : modèle, observation, hybride, dérivé, repli et indisponible.
3. **Horodatages** : distinguer observation, production, validité, récupération et
   génération de réponse.
4. **Décision de station** : exposer au minimum le statut, le code de raison et le
   nombre de candidats évalués.
5. **Motifs de rejet** : âge, distance, altitude, score, valeur invalide, date future
   ou absence de mesure.
6. **Métadonnées de modèle** : producteur, diffuseur, jeu de données ou modèle,
   point de grille et altitude du point modèle.
7. **Valeurs dérivées** : documenter les min/max corrigés par la température
   courante et le calcul du prochain changement.
8. **Compatibilité** : conserver temporairement `nature`, `station`, `sourceLabel`
   et `unavailableSources` pendant la migration.
9. **Vie privée** : ne pas ajouter les coordonnées GPS précises dans les logs de
   diagnostic.
10. **Bascule publique** : décider si le chantier cible d’abord `/meteo-v2/` ou si
    la page historique doit consommer le nouveau contrat avant redirection.

## 12. Proposition de groupes de provenance

Sans figer encore le schéma du lot 2, l’audit fait apparaître six groupes cohérents :

| Groupe | Champs concernés |
|---|---|
| `location` | libellé, commune, département, altitude, précision GPS |
| `currentTemperature` | température courante et éventuelle station |
| `currentModelContext` | ressenti et état du ciel |
| `dailyForecast` | minimum, maximum et prochaines heures |
| `nextChange` | résultat dérivé des séries horaires |
| `alert` | vigilance officielle départementale |

Cette séparation permettrait d’expliquer un bloc hybride sans dupliquer un objet de
provenance sur chaque valeur numérique.

## 13. Critères de sortie du lot 1

Le lot 1 est considéré comme réalisé car :

- les deux chaînes applicatives sont identifiées ;
- les écrans et composants concernés sont recensés ;
- chaque donnée visible de la V2 possède une source ou une transformation connue ;
- les fournisseurs et stockages sont inventoriés ;
- les champs actuels de `/api/v1/meteo/essential` sont cartographiés ;
- les ambiguïtés de provenance et les décisions nécessaires au lot 2 sont listées ;
- aucune règle de sélection, route API ou interface n’a été modifiée.

## 14. Fichiers de référence audités

- `apps/api/src/routes/meteo-v1.ts`
- `apps/api/src/lib/station-observations.ts`
- `apps/api/src/lib/geography.ts`
- `apps/api/src/routes/meteo.ts`
- `packages/shared/src/stationsMeteo.ts`
- `apps/meteo-web/src/App.tsx`
- `apps/meteo-web/src/components/WeatherHero.tsx`
- `apps/meteo-web/src/domain/presentation.ts`
- `apps/meteo-web/src/api/contracts.ts`
- `apps/web/src/pages/meteo/essentiel.astro`
- `apps/web/src/islands/MeteoEssentiel.svelte`
- `doc/architecture/conception-v2/openapi.yaml`
- `doc/architecture/conception-v2/specification-v2.md`
