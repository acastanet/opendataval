# Comportement historique audité

`apps/api/src/routes/meteo-v1.ts` implémente `/api/v1/meteo/essential`. La route résout la géographie, charge les observations, appelle Open-Meteo/Météo-France, puis construit conditions courantes, jour, heures et vigilance.

Pour la température, une observation éligible est prioritaire ; sinon `current.temperature_2m` du modèle est utilisée ; lorsque les deux manquent, la route répond 503. La vigilance est une dépendance séparée et ne fait pas partie du contrat weather-service.

Les fonctions de référence sont `loadNearbyStations`, `loadLatestStationMeasurements`, `evaluateStationObservations` et `selectStationObservation` dans `apps/api/src/lib/station-observations.ts`, ainsi que `meteoFranceUrl` et `normaliserEssential` dans la route historique.
