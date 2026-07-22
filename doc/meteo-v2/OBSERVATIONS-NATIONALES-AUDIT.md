# Audit — Couverture nationale des observations météo

## Décision produit

Les observations doivent couvrir la France métropolitaine et permettre une sélection cohérente au minimum pour les trois lieux rapides :

- Val-d’Aigoual ;
- Paris ;
- Marseille.

Le repli vers le modèle reste obligatoire lorsqu’aucune station récente et représentative ne respecte les critères de sélection.

## Conclusion de l’audit

La cause principale de la mauvaise couverture est confirmée dans le code : l’application ne dispose pas actuellement d’un catalogue national.

Le catalogue utilisé par l’API est une liste manuelle et figée de **21 stations situées autour de Val-d’Aigoual et des Cévennes**.

Cela explique directement :

- Florac présenté comme candidat le plus proche pour Paris ;
- Générargues présenté comme candidat le plus proche pour Marseille ;
- le nombre constant de 21 mesures reçues par l’API ;
- l’impossibilité de sélectionner une station francilienne ou marseillaise.

La fraîcheur insuffisante constatée en production constitue un second problème. Le code prévoit des exécutions régulières, mais un conteneur worker actif ne garantit ni la présence des jetons, ni la réussite des jobs, ni la fraîcheur effective des mesures.

---

# 1. Catalogue actuellement utilisé

## Fichier source

```text
packages/shared/src/stationsMeteo.ts
```

Le commentaire du fichier décrit explicitement la situation :

> Liste figée manuellement (pas de découverte dynamique) — à revérifier périodiquement.

Le tableau `STATIONS_METEO` contient :

- des stations Météo-France RADOME autour du massif de l’Aigoual ;
- des stations Météo-France ETENDU du Gard, de la Lozère et de l’Hérault ;
- quelques stations Infoclimat du même périmètre.

Le catalogue est adapté au prototype territorial initial, mais pas à la localisation libre ni aux lieux rapides Paris et Marseille.

## Conséquence dans l’API

```text
apps/api/src/lib/station-observations.ts
```

La fonction :

```ts
loadLatestStationMeasurements(pool, stations = STATIONS_METEO)
```

construit la requête SQL à partir des identifiants du tableau statique :

```sql
where num_poste = any($1::text[])
```

L’API ne peut donc jamais charger une station absente de cette liste, même si ses observations sont déjà présentes dans PostgreSQL.

---

# 2. Ingestion actuellement utilisée

## Observations horaires Météo-France

```text
apps/worker/src/sources/meteo_obs.ts
```

Le job parcourt :

```ts
stationsMeteoFrance()
```

Cette fonction ne renvoie que les stations Météo-France du catalogue local.

Le worker effectue ensuite un appel ciblé par station vers :

```text
/public/DPObs/v2/station/horaire
```

Cette stratégie fonctionne pour quelques stations, mais ne doit pas être étendue à plus de 2 000 stations sous la forme d’un appel HTTP par station et par heure.

## Observations RADOME à six minutes

```text
apps/worker/src/sources/meteo_radome.ts
```

Le job parcourt uniquement les stations RADOME locales et interroge chaque station séparément.

Ce flux peut rester un enrichissement local haute fréquence autour de Val-d’Aigoual. Il ne doit pas devenir le mécanisme national principal.

## Observations Infoclimat

```text
apps/worker/src/sources/meteo_infoclimat.ts
```

Le job reste limité à quelques stations amateurs locales. Il constitue un complément utile pour les vallées cévenoles, mais pas une source nationale principale.

---

# 3. Planification et fraîcheur

## Planification déclarée

```text
apps/worker/src/scheduler.ts
```

Les fréquences prévues sont :

| Job | Fréquence |
|---|---|
| `meteo_obs` | toutes les heures à `hh:20` |
| `meteo_radome` | toutes les six minutes |
| `meteo_infoclimat` | toutes les heures à `hh:10` |
| `meteo_purge` | quotidien |

Les jobs Météo-France ne sont actifs que lorsque `METEOFRANCE_API_TOKEN` est défini. Le job Infoclimat dépend de `INFOCLIMAT_API_TOKEN`.

## Limite actuelle

Lors du contrôle de production du 22 juillet 2026 :

- 21 mesures étaient reçues ;
- les 21 étaient trop anciennes ;
- la dernière observation du Mont Aigoual avait environ 958 minutes ;
- les conteneurs étaient pourtant actifs et sans redémarrage.

L’état `running` du worker ne permet donc pas de conclure à la réussite des jobs météo.

## Causes possibles restant à vérifier sur le VPS

- variable d’environnement absente ;
- jeton expiré ou invalide ;
- réponse HTTP fournisseur en erreur ;
- modification de version ou de nomenclature de l’API ;
- job exécuté mais ne recevant aucune ligne ;
- erreur partielle masquée par la réussite d’autres stations ;
- lot de données ancien conservé en base sans alerte métier.

Ces hypothèses doivent être vérifiées dans `meta.fetch_log` et les logs du worker. Elles ne sont pas tranchées par le seul audit du dépôt.

---

# 4. Capacités officielles disponibles

La documentation Météo-France indique que l’API d’observation ciblée donne accès à plus de 2 000 stations françaises, en métropole et outre-mer.

Le service de liste des stations permet de télécharger le catalogue des stations actives :

```text
/public/DPObs/v2/liste-stations
```

La documentation de l’API Paquet Observations prévoit une granularité couvrant une station, un département ou toutes les stations.

Pour les observations nationales à une date donnée, le mécanisme adapté est le paquet de toutes les stations :

```text
/public/DPPaquetObs/paquet/stations/horaire
```

Ce mécanisme évite plusieurs milliers d’appels ciblés par heure.

## Références officielles

- Documentation API ciblée : https://confluence-meteofrance.atlassian.net/wiki/spaces/OpenDataMeteoFrance/pages/853639294/
- Documentation API paquet : https://confluence-meteofrance.atlassian.net/wiki/spaces/OpenDataMeteoFrance/pages/854851588/
- Évolution DPObs v2 : https://confluence-meteofrance.atlassian.net/wiki/spaces/OpenDataMeteoFrance/pages/1688633417/

---

# 5. Architecture cible

## Catalogue national

Créer un job dédié :

```text
meteo_stations
```

Responsabilités :

1. télécharger la liste officielle des stations actives ;
2. parser le CSV en conservant les identifiants à huit chiffres ;
3. normaliser nom, latitude, longitude, altitude et pack ;
4. enregistrer les stations dans `couches.objets` avec la couche `station_meteo` ;
5. conserver le réseau et la licence ;
6. signaler le nombre de stations valides et rejetées ;
7. ne pas supprimer brutalement une station lors d’un échec de fournisseur.

Fréquence recommandée : quotidienne. La liste officielle est annoncée comme actualisée toutes les heures, mais une synchronisation quotidienne suffit pour le catalogue applicatif.

## Observations nationales

Créer ou remplacer le job horaire par un flux paquet :

```text
meteo_obs_national
```

Responsabilités :

1. calculer la dernière heure ronde raisonnablement publiée ;
2. télécharger en un appel le paquet horaire de toutes les stations ;
3. si le paquet est vide, essayer l’heure précédente dans une limite stricte ;
4. parser les entités GeoJSON ;
5. convertir les températures Kelvin en Celsius ;
6. insérer les observations dans `series.meteo_horaire` ;
7. enregistrer le nombre de stations et l’horodatage le plus récent ;
8. retourner un statut `partiel` lorsque le paquet est incomplet ou ancien.

## Enrichissement local

Conserver séparément :

- le job RADOME six minutes pour les stations utiles autour de Val-d’Aigoual ;
- les stations Infoclimat locales, notamment Valleraugue ;
- la politique de préférence fondée sur distance, altitude, fraîcheur et score.

Le flux national fournit la couverture générale. Les flux locaux améliorent la finesse territoriale.

---

# 6. Chargement côté API

L’API ne doit plus importer un catalogue national complet depuis un fichier TypeScript.

## Requête cible

À partir de la position demandée :

1. rechercher dans `couches.objets` les stations situées dans le rayon maximal ;
2. joindre ou charger leur dernière observation ;
3. reconstruire les objets `StationMeasurement` ;
4. appliquer la politique de sélection existante ;
5. conserver la provenance et les motifs de rejet.

## Principe spatial

Le rayon de présélection doit reprendre :

```text
STATION_SELECTION_POLICY.maxDistanceKm = 50 km
```

La requête PostGIS doit utiliser la géométrie des stations et éviter de charger toutes les stations nationales à chaque appel.

## Compatibilité transitoire

Pendant le déploiement séquentiel :

- les stations en base deviennent la source principale ;
- le tableau statique local peut servir de repli temporaire si le catalogue national n’est pas encore disponible ;
- la provenance doit distinguer un fournisseur indisponible d’un catalogue vide ;
- aucune station située à plusieurs centaines de kilomètres ne doit être présentée comme candidat pertinent.

---

# 7. Observabilité requise

## Indicateurs catalogue

```text
catalogueStationCount
catalogueMeteoFranceCount
catalogueInfoclimatCount
lastCatalogueFetchAttemptAt
lastCatalogueFetchSuccessAt
```

## Indicateurs observations

```text
receivedMeasurementCount
validMeasurementCount
freshMeasurementCount
latestObservationAt
oldestObservationAt
lastObservationFetchAttemptAt
lastObservationFetchSuccessAt
providerStatus
```

## États

- `healthy` : catalogue national présent et mesures récentes ;
- `degraded` : catalogue présent mais mesures anciennes ou partielles ;
- `unavailable` : catalogue ou observations indisponibles.

---

# 8. Critères d’acceptation

## Catalogue

- plus de 1 000 stations Météo-France actives sont importées ;
- les identifiants à zéro initial sont conservés ;
- chaque station dispose de coordonnées valides ;
- les stations sans altitude ne font pas échouer le lot ;
- les stations locales Infoclimat restent disponibles.

## Paris

- des stations franciliennes sont évaluées ;
- Florac n’est plus le candidat le plus proche ;
- une station récente peut être sélectionnée si elle respecte les critères.

## Marseille

- des stations des Bouches-du-Rhône ou proches sont évaluées ;
- Générargues n’est plus le candidat le plus proche ;
- la vigilance reste associée au département 13.

## Val-d’Aigoual

- les stations nationales voisines et les stations locales complémentaires sont évaluées ;
- Mont Aigoual peut être rejetée pour un point de vallée ;
- Valleraugue ou une autre station de vallée peut être sélectionnée lorsqu’elle est récente.

## Fraîcheur

- une observation âgée de plus de 90 minutes n’est jamais sélectionnée ;
- un lot entièrement ancien déclenche un état dégradé observable ;
- la dernière réussite d’ingestion est consultable ;
- l’absence de jeton est visible dans le diagnostic d’exploitation.

---

# 9. Découpage d’implémentation

## Lot 2A — Catalogue national

- parseur de liste des stations ;
- job `meteo_stations` ;
- tests du parseur ;
- stockage dans `couches.objets` ;
- compte rendu du nombre de stations.

## Lot 2B — Paquet national horaire

- client DPPaquetObs ;
- parseur GeoJSON ;
- insertion en lot ;
- stratégie d’heure courante et de repli ;
- métriques de fraîcheur.

## Lot 2C — Sélection spatiale côté API

- chargement des stations proches depuis PostgreSQL ;
- association à la dernière observation ;
- repli transitoire vers le catalogue local ;
- tests Paris, Marseille et Val-d’Aigoual.

## Lot 2D — Observabilité et exploitation

- synthèse de santé ;
- requêtes sur `meta.fetch_log` ;
- documentation des variables et des procédures ;
- contrôle en production.

La prochaine étape est le **Lot 2A — Catalogue national**.
