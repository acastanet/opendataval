# Prochaine étape technique

La prochaine modification de code doit introduire une lecture spatiale du catalogue `couches.objets` pour les objets `station_meteo`, sans basculer encore l’ingestion nationale.

Cette étape est volontairement intermédiaire : elle découple l’API de la constante `STATIONS_METEO` et rend possible l’ajout progressif de stations nationales en base.

## Résultat attendu

```text
point demandé
→ stations `station_meteo` dans un rayon configurable
→ dernière observation de ces stations
→ sélection représentative existante
```

Le catalogue statique local reste temporairement un repli si la base ne contient aucun objet station.
