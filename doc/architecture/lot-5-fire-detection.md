# Lot 5 — Fire Detection Service

## Finalité

Le lot 5 ajoute une fonction distincte du risque incendie et de la vigilance météorologique : localiser les **anomalies thermiques compatibles avec un feu** autour de la position de l'utilisateur.

Le service ne confirme pas un incendie et ne produit aucune consigne de sécurité.

## Décision d'architecture

```text
Application nomade
       │ GPS
       ▼
Gateway /api/v2/fire/nearby
       │ rayon explicite : 1 à 50 km
       │ historique explicite : 1 à 7 jours
       ▼
fire-detection-service (stateless)
       ├── EUMETSAT MTG CAP ── proximité du temps réel
       ├── EUMETSAT MSG CAP ── secours géostationnaire
       └── NASA FIRMS Area API
             ├── VIIRS S-NPP
             ├── VIIRS NOAA-20
             ├── VIIRS NOAA-21
             └── MODIS
```

Aucune base de données ni volume n'est utilisé. Les réponses distantes sont normalisées en mémoire. Un cache mémoire de 45 secondes réduit les appels identiques ; il peut disparaître sans perte fonctionnelle.

## Deux fonctions séparées

### Suspicions récentes

La liste `realtime.suspicions` agrège EUMETSAT et FIRMS dans une fenêtre de 90 minutes. Elle conserve les faibles confiances. L'ordre est chronologique décroissant.

### Dernière suspicion à 50 km

`last_detection_50km` est calculé exclusivement à partir de NASA FIRMS Area API. Cette règle empêche de simuler un historique local ou de dépendre d'une base de données.

## Politique de rappel

Le service optimise le rappel au niveau applicatif :

- quatre sources FIRMS sont appelées séparément ;
- MTG et MSG sont appelés séparément ;
- aucune détection valide n'est rejetée en raison d'une faible confiance ;
- la boîte de recherche est suivie d'un calcul de distance exact ;
- les doublons ne sont supprimés que s'ils possèdent le même identifiant déterministe.

Cette politique ne supprime pas les omissions physiques ou amont : nuages, faible puissance, résolution, géométrie et filtres appliqués par les producteurs.

## Dégradation

| Situation | Réponse |
|---|---|
| Source disponible, aucun point | `available`, `detection_count: 0` |
| Source non configurée | `not_configured` |
| Timeout, HTTP invalide ou produit illisible | `unavailable` |
| Au moins une source disponible | service `available` ou `partial` |
| Aucune source exploitable | service `unavailable` |

L'interface ne doit jamais traduire `unavailable` par « aucun feu ».

## Hors périmètre

- confirmation par les secours ;
- périmètre opérationnel d'un incendie ;
- prédiction du risque ;
- restrictions d'accès aux massifs ;
- notifications push ;
- persistance ou reconstitution d'événements.
