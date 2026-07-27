# Fire Detection Service

Microservice v2 stateless de localisation des **suspicions de feu** autour d'une position en France.

## Objectif

- restituer sans filtrage local toutes les suspicions reçues des sources configurées ;
- privilégier les données géostationnaires EUMETSAT MTG pour la proximité du temps réel ;
- utiliser exclusivement l'API Area de NASA FIRMS pour la fonction « dernière suspicion dans un rayon de 50 km » ;
- fonctionner sans PostgreSQL, sans volume et sans historique local ;
- distinguer une source disponible sans résultat d'une source indisponible.

Le service ne confirme jamais un incendie. Une anomalie thermique peut provenir d'un feu de végétation, d'un brûlage, d'une installation industrielle ou d'un faux positif. Une absence de détection ne prouve pas une absence de feu.

## Endpoints

```http
GET /v1/fire/nearby?lat=44.0812&lon=3.6415&accuracy=25&radius_km=50&history_days=7
GET /healthz
GET /readyz
```

Le gateway expose un contrat public fixe :

```http
GET /api/v2/fire/nearby?lat=44.0812&lon=3.6415&accuracy=25
```

Le gateway impose `radius_km=50` et `history_days=7`.

La réponse distingue :

- `realtime.suspicions` : les suspicions de la fenêtre temps réel ;
- `history.suspicions` : toutes les suspicions valides des sources configurées
  sur la période demandée, destinées notamment à la représentation
  cartographique complète ;
- `last_detection_50km` : la dernière suspicion provenant exclusivement de
  NASA FIRMS.

## Sources

### NASA FIRMS Area API

Quatre produits NRT sont interrogés séparément : `VIIRS_SNPP_NRT`, `VIIRS_NOAA20_NRT`, `VIIRS_NOAA21_NRT` et `MODIS_NRT`.

L'historique de sept jours est découpé en une requête de cinq jours et une requête historique de deux jours. Les deux fenêtres sont interrogées en parallèle. La boîte englobante sert uniquement à la requête distante ; chaque point est ensuite contrôlé par distance de Haversine et supprimé seulement s'il dépasse réellement 50 km.

### EUMETSAT CAP

- MTG : collection `EO:EUM:DAT:0801`.

La collection MSG historique (`EO:EUM:DAT:MSG:FIRC`) a été retirée : Meteosat Seconde Génération est en fin de vie et EUMETSAT ne publie plus cette collection (réponse `404 Collection not found`).

La recherche catalogue est publique. Le téléchargement nécessite un compte gratuit EUMETSAT et un couple consumer key / consumer secret. Les résultats OpenSearch sont parcourus page par page ; une pagination bloquée ou tronquée rend la source indisponible au lieu de perdre silencieusement des produits. Les téléchargements sont bornés à huit connexions concurrentes, puis les produits CAP sont lus en mémoire et oubliés après la réponse.

## États

- `available` : toutes les sources configurées ont répondu ;
- `partial` : au moins une source a répondu, mais une autre est indisponible ou non configurée ;
- `unavailable` : aucune source configurée n'a fourni un état exploitable.

Une liste `suspicions: []` avec une source `available` signifie qu'aucune détection n'a été trouvée. Une source `unavailable` signifie que le service ne peut rien conclure.

## Configuration

Copier `.env.example`. Secrets requis :

```text
NASA_FIRMS_MAP_KEY
EUMETSAT_CONSUMER_KEY
EUMETSAT_CONSUMER_SECRET
```

Les secrets restent côté serveur et ne sont jamais transmis au navigateur.

## Développement

```bash
npm install --prefix services/fire-detection
npm run check:fire-detection
```

## Conteneur

```bash
docker build -f services/fire-detection/Dockerfile -t opendataval-fire-detection:test .
docker compose config --quiet
docker compose up -d --build fire-detection-service gateway
```

## Limite garantie

Aucune architecture satellitaire ne peut garantir qu'aucun feu réel ne sera manqué. Le contrat garanti par ce service est plus précis : **aucune suspicion reçue et valide n'est écartée silencieusement par OpenDataVal**. Les niveaux de confiance faibles sont conservés et exposés au client.
