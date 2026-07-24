# Comportement historique audité

`apps/api/src/routes/meteo-v1.ts` implémente `/api/v1/meteo/essential`. La route résout la géographie, charge les observations, appelle Open-Meteo/Météo-France, puis construit conditions courantes, jour, heures et vigilance.

La route historique auditée privilégie une observation éligible, sinon `current.temperature_2m` du modèle. Le weather-service v2 applique désormais la méthode v2 documentée séparément : une observation sélectionnée est ajustée par le delta du modèle entre la station et le point, si les créneaux sont compatibles. La vigilance est une dépendance séparée et ne fait pas partie du contrat weather-service.

Les fonctions de référence sont `loadNearbyStations`, `loadLatestStationMeasurements`, `evaluateStationObservations` et `selectStationObservation` dans `apps/api/src/lib/station-observations.ts`, ainsi que `meteoFranceUrl` et `normaliserEssential` dans la route historique.
