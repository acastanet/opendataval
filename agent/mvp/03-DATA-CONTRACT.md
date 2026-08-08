# 03 — Contrat commun des données

## But

Toute information intégrée à une dalle doit être traçable spatialement, temporellement et méthodologiquement.

Éviter les objets opaques comme :

```json
{ "temperature": 22.7 }
```

## Structure minimale conceptuelle

```json
{
  "key": "temperature_air",
  "value": 22.7,
  "unit": "°C",
  "sphere": "atmosphere",
  "spatial_relation": "model_at_point",
  "distance_m": 0,
  "source": {
    "producer": "Meteo-France",
    "dataset": "...",
    "url": "...",
    "license": "..."
  },
  "time": {
    "observed_at": "...",
    "retrieved_at": "...",
    "reference_period": null
  },
  "resolution": {
    "spatial_m": 1300
  },
  "selection": {
    "method": "...",
    "automatic_choice": "...",
    "human_choice": null,
    "review_reason": null
  },
  "status": {
    "availability": "available",
    "freshness": "fresh",
    "review": "pending"
  }
}
```

## Relations spatiales autorisées au départ

- `intersects`
- `contains`
- `nearest`
- `hydrologically_related`
- `administrative`
- `model_at_point`
- `derived`
- `remote_detection`

Ne pas ajouter une nouvelle valeur sans besoin concret.

## Pas de confiance arbitraire

Éviter un champ saisi manuellement comme :

```text
confidence = high
```

Préférer des faits mesurables :

- distance ;
- résolution ;
- fraîcheur ;
- méthode de sélection ;
- couverture ;
- qualité de la source ;
- statut de revue.

Un score synthétique pourra être calculé plus tard.

## Absence de donnée

L’absence est une information.

Le contrat doit distinguer :

- `available`
- `not_found`
- `not_applicable`
- `source_unavailable`
- `error`

Ne jamais transformer silencieusement une absence en valeur par défaut.

## Provenance

Toute valeur affichée publiquement doit pouvoir être reliée à :

- un producteur ;
- un jeu de données ;
- une date de récupération ;
- une méthode de sélection ou de transformation.

## Sélection humaine

Si l’opérateur remplace une donnée proposée automatiquement, conserver :

```text
automatic_choice
human_choice
review_reason
reviewed_at
reviewed_by
```

## Données et actifs de scène

Une donnée thématique reste classée dans `data.<sphere>` et conserve sa
provenance. Elle ne doit pas être déplacée dans `scene` pour les besoins du
viewer : la géologie, par exemple, relève de `data.lithosphere` et peut être
prise en charge par un module de domaine.

Le bloc `scene` ne décrit que les actifs de représentation : GLB principal,
terrain et orthophoto éventuels, métadonnées du pipeline, nuage LiDAR source et
calage mesuré de l'orthophoto. Le détail des champs est défini dans
[`02-TILE-CONTRACT.md`](02-TILE-CONTRACT.md) et dans le schéma JSON canonique.
