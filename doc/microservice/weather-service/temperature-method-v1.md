# Méthode température Météo V2 — v1

1. Valider latitude, longitude et précision facultative.
2. Obtenir les coordonnées normalisées et l'altitude éventuelle depuis geography-service.
3. Rechercher les stations dans un rayon de 50 km et leur dernière température.
4. Appliquer la politique de sélection v1.
5. Consulter le modèle en parallèle avec les observations.
6. Retourner l'observation sélectionnée (`station_observation`) ou, à défaut, la température de modèle (`model_at_point`).

Une observation directe n'est jamais une estimation calculée. Sans les deux sources, le service retourne `WEATHER_NOT_AVAILABLE` (503).
