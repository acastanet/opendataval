# Politique de sélection de station — v1

La station candidate au score le plus faible est retenue, avec départage déterministe : réseau Météo-France, distance, puis identifiant.

| Règle | Valeur |
| --- | ---: |
| Rayon maximal | 50 km |
| Sans altitude | 5 km |
| Écart d'altitude maximal | 500 m |
| Âge maximal | 90 min |
| Ancienne après | 60 min |
| Tolérance future | 15 min |
| Score maximal | 60 |

Le score combine distance (50), altitude (30, ou pénalité 8 sans altitude), fraîcheur (20) et une pénalité de 5 pour Infoclimat. Aucune correction altimétrique de la température n'est appliquée.
