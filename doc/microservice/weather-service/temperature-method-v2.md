# Méthode température Météo V2 — v2

1. Valider latitude, longitude et précision facultative.
2. Obtenir les coordonnées normalisées et l'altitude éventuelle depuis geography-service.
3. Rechercher les stations dans un rayon de 50 km et leur dernière température.
4. Appliquer la politique de sélection v1.
5. Consulter le modèle au point, pour le repli, en parallèle avec les observations.
6. Lorsqu'une station est retenue, lire le modèle à l'heure de son observation pour le point demandé et pour la station.
7. Si les deux créneaux modèle sont compatibles (à 45 min de l'observation et à une minute l'un de l'autre), calculer :

   `T_point = T_station_observée + (T_modèle_point − T_modèle_station)`.

8. Retourner cette estimation comme `station_adjusted_by_model`, avec le delta et les deux valeurs de modèle dans `temperature.adjustment`.
9. Si la correction modèle est indisponible, retourner l'observation brute (`station_observation`) et signaler `model_correction` parmi les sources indisponibles. Sans observation exploitable, retourner le modèle au point (`model_at_point`).

La valeur ajustée est une estimation locale, jamais une observation directe. Le point et la station sont comparés au même créneau modèle horaire.
