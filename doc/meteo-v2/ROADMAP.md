# Feuille de route — Météo essentielle V2

## Statut du document

Cette feuille de route constitue la référence de travail pour la consolidation de l’application Météo essentielle.

Elle intègre les décisions produit et techniques validées après le déploiement du commit `357f78eba29973021d0354283a8dc49732a5d704` :

- l’URL canonique est `/val-daigoual/meteo-v2/` ;
- l’ancienne URL `/meteo-v2/` redirige vers l’URL canonique ;
- la provenance publique est exposée en version `1.1` ;
- la sélection automatique entre observation locale et modèle est en production ;
- la géolocalisation de la V1 est la référence fonctionnelle ;
- les observations doivent couvrir la France, au minimum pour les trois lieux rapides : Val-d’Aigoual, Paris et Marseille ;
- la V1 ne sera dépréciée qu’après parité fonctionnelle démontrée.

## Principes directeurs

1. Ne pas dégrader ce qui fonctionne déjà dans la V1.
2. Réutiliser ou reproduire fidèlement la géolocalisation V1 dans la V2.
3. Ne pas assouplir les critères de représentativité pour masquer des données anciennes ou une couverture insuffisante.
4. Distinguer clairement catalogue de stations, observations, sélection et provenance.
5. Conserver le repli vers le modèle lorsque aucune station n’est suffisamment représentative.
6. Documenter chaque mécanisme avant ou pendant sa consolidation.
7. Avancer par lots successifs, avec tests, commit dédié et pull request.

---

# Chantier 1 — Géolocalisation V2 à parité avec la V1

## Objectif

Obtenir dans Météo V2 une localisation au moins aussi fiable que dans la V1 sur mobile et ordinateur.

## Référence fonctionnelle

La référence actuelle est l’implémentation V1 dans :

```text
apps/web/src/islands/MeteoEssentiel.svelte
```

La correction mobile de référence a été introduite par le commit :

```text
e5084b1c3071678adbc81c332f30eca668987882
```

## Lot 1.1 — Documenter la V1

Livrable :

```text
doc/meteo-v2/GEOLOCALISATION-V1.md
```

Le document doit décrire :

- l’appel à `navigator.geolocation.getCurrentPosition` ;
- les options GPS ;
- la gestion du contexte HTTPS ;
- les erreurs navigateur ;
- l’invalidation des requêtes concurrentes ;
- le chargement immédiat de la météo ;
- le géocodage inverse asynchrone ;
- le maintien de la dernière météo en cas d’échec ;
- la précision affichée ;
- le comportement des lieux rapides.

## Lot 1.2 — Audit comparatif V1 / V2

Livrable :

```text
doc/meteo-v2/GEOLOCALISATION-AUDIT.md
```

L’audit doit comparer :

- acquisition GPS ;
- concurrence avec le chargement initial ;
- géocodage inverse ;
- altitude ;
- états de chargement ;
- conservation de la dernière météo ;
- messages d’erreur ;
- tests unitaires et tests navigateur.

## Lot 1.3 — Correction de la V2

Ordre de préférence :

1. extraire un mécanisme partagé entre V1 et V2 ;
2. reproduire fidèlement la logique V1 dans la V2 ;
3. conserver temporairement le parcours V1 pour la localisation si la parité ne peut pas être obtenue immédiatement.

Le retour complet à l’ancienne interface n’est pas prévu : la V2 est conservée pour sa provenance, son accessibilité et sa lisibilité.

## Critères d’acceptation

- le bouton fonctionne au premier appui sur mobile ;
- l’état « Localisation… » n’est pas interrompu par le chargement initial ;
- la météo issue des coordonnées GPS est affichée sans attendre le libellé d’adresse ;
- le libellé géographique est mis à jour ensuite s’il est disponible ;
- un refus, un délai dépassé ou une erreur ne supprime pas la météo précédente ;
- le message distingue refus, timeout et échec indéterminé ;
- la position GPS désactive l’état actif des lieux rapides ;
- un nouveau lieu rapide annule proprement la localisation précédente ;
- aucun blocage ou erreur JavaScript n’apparaît ;
- la parité est testée au minimum sous Chrome Android, Chrome desktop et Firefox desktop.

---

# Chantier 2 — Couverture nationale des observations

## Décision produit

Les observations doivent couvrir la France métropolitaine, au minimum pour :

- Val-d’Aigoual ;
- Paris ;
- Marseille.

L’architecture ne doit pas être limitée à ces trois coordonnées : toute localisation française doit pouvoir rechercher des stations pertinentes dans un catalogue national.

## Constat initial

Le contrôle de production a montré :

- `21` mesures reçues ;
- `21` mesures trop anciennes ;
- Florac comme station la plus proche examinée pour Paris ;
- Générargues comme station la plus proche examinée pour Marseille ;
- Mont Aigoual comme station la plus proche examinée pour Val-d’Aigoual, mais rejetée en raison de l’altitude, de l’ancienneté et du score.

Le mécanisme de provenance fonctionne, mais il révèle une couverture et une fraîcheur insuffisantes.

## Lot 2.1 — Diagnostic des 21 mesures

Produire :

- la liste exacte des stations ;
- leur réseau ;
- leur position ;
- leur altitude ;
- la date de dernière observation ;
- la source du catalogue ;
- la source des mesures ;
- le filtre géographique appliqué ;
- le rôle du worker ;
- le rôle du cache ;
- la fréquence de récupération ;
- la dernière récupération réussie ;
- les erreurs silencieuses éventuelles.

## Lot 2.2 — Catalogue national

Séparer les données relativement stables :

```text
stationId
nom
latitude
longitude
altitudeM
réseau
licence
statut
```

des observations renouvelées :

```text
stationId
temperatureC
observedAt
retrievedAt
qualité
```

## Lot 2.3 — Recherche spatiale

Chaîne cible :

```text
catalogue national
→ stations proches du point demandé
→ association avec les observations récentes
→ évaluation des critères
→ sélection de la meilleure station admissible
→ repli modèle si nécessaire
```

Une station située à plusieurs centaines de kilomètres peut être utile comme diagnostic brut, mais ne doit pas être présentée comme un candidat opérationnel pertinent.

## Lot 2.4 — Fraîcheur

Le système doit exposer et surveiller :

- dernière tentative de récupération ;
- dernière réussite ;
- observation la plus récente ;
- nombre total de mesures ;
- nombre de mesures valides ;
- nombre de mesures récentes ;
- âge du cache ;
- état du fournisseur.

Les seuils de fraîcheur ne doivent pas être augmentés pour compenser une ingestion défaillante.

## Critères d’acceptation

### Paris

- des stations franciliennes sont examinées ;
- aucune station cévenole n’est le candidat principal ;
- une observation récente peut être sélectionnée si elle respecte les critères.

### Marseille

- des stations des Bouches-du-Rhône ou proches sont examinées ;
- Générargues n’est plus le candidat principal ;
- la vigilance reste rattachée au département 13.

### Val-d’Aigoual

- les stations du massif et des vallées proches sont examinées ;
- Mont Aigoual peut rester rejetée pour Valleraugue si l’écart d’altitude est excessif ;
- une station de vallée récente doit pouvoir être sélectionnée lorsqu’elle est représentative.

---

# Chantier 3 — Observabilité métier

## Objectif

Ne plus confondre « conteneur actif » et « ingestion fonctionnelle ».

## Indicateurs minimaux

```text
catalogueStationCount
receivedMeasurementCount
validMeasurementCount
freshMeasurementCount
lastFetchAttemptAt
lastFetchSuccessAt
latestObservationAt
oldestObservationAt
providerStatus
cacheAgeMinutes
```

## États recommandés

- `healthy` : données disponibles et récentes ;
- `degraded` : données disponibles mais anciennes ou couverture insuffisante ;
- `unavailable` : fournisseur ou ingestion indisponible.

## Géolocalisation

Les événements techniques doivent rester sobres et ne pas journaliser inutilement une position personnelle précise :

```text
geolocation_requested
geolocation_authorized
geolocation_denied
geolocation_timeout
geolocation_position_received
reverse_geocoding_success
reverse_geocoding_failed
weather_refresh_success
weather_refresh_failed
```

---

# Chantier 4 — Consolidation fonctionnelle de la V2

Ce chantier commence après la parité de localisation et la correction de la chaîne d’observations.

## Lot 4.1 — Vigilance dynamique

- verte : discrète ;
- jaune : remontée et phénomène visible ;
- orange ou rouge : prioritaire en haut de page.

Exemple :

```text
Vigilance jaune — canicule
```

## Lot 4.2 — Prévisions compactes à trois jours

Ajouter une lecture synthétique sans reproduire la densité de la V1.

## Lot 4.3 — Contexte thermique

Ajouter un résumé du bilan thermique avec un lien vers :

```text
/val-daigoual/meteo/bilan-thermique/
```

## Lot 4.4 — Comparaison finale V1 / V2

La V1 ne peut être dépréciée qu’après validation de la matrice suivante :

| Fonction | V1 | V2 attendue |
|---|---|---|
| Géolocalisation | Référence | Identique ou meilleure |
| Lieux rapides | Fonctionnels | Fonctionnels |
| Vigilance | Détaillée | Dynamique et détaillée |
| Température actuelle | Oui | Oui avec provenance |
| Prochaines heures | Oui | Oui avec rafales |
| Prévision à trois jours | Oui | Oui, version compacte |
| Bilan thermique | Oui | Oui, résumé et lien |
| Provenance | Limitée | Complète |
| Accessibilité | Partielle | Renforcée |
| Mobile | Efficace | À parité puis supérieure |

---

# Chantier 5 — Documentation de référence

Mettre à jour ou créer :

```text
doc/meteo-v2/README.md
doc/meteo-v2/GEOLOCALISATION-V1.md
doc/meteo-v2/GEOLOCALISATION-AUDIT.md
doc/meteo-v2/ARCHITECTURE.md
doc/meteo-v2/DONNEES-METHODES-LIMITES.md
doc/meteo-v2/SPECIFICATION-V2.md
```

La documentation doit décrire le code et les comportements réellement validés.

---

# Ordre d’exécution

| Ordre | Lot | Résultat attendu |
|---:|---|---|
| 1 | Documenter la géolocalisation V1 | Référence explicite |
| 2 | Auditer la géolocalisation V2 | Causes et écarts identifiés |
| 3 | Corriger la V2 | Parité fonctionnelle |
| 4 | Tester sur mobile et desktop | Validation réelle |
| 5 | Diagnostiquer les 21 observations | Cause racine documentée |
| 6 | Étendre le catalogue à la France | Couverture nationale |
| 7 | Corriger l’ingestion et la fraîcheur | Mesures récentes |
| 8 | Ajouter l’observabilité métier | Défauts détectables |
| 9 | Améliorer vigilance et prévision à trois jours | V2 enrichie |
| 10 | Ajouter le contexte thermique | Liaison Copernicus |
| 11 | Consolider toute la documentation | Référence produit stable |
| 12 | Étudier la dépréciation de la V1 | Seulement après parité |

## Règle de progression

Chaque lot doit produire :

1. un périmètre explicite ;
2. des critères d’acceptation ;
3. des tests ;
4. un commit dédié ;
5. une pull request ou un ajout clairement traçable ;
6. un compte rendu avant passage au lot suivant.
