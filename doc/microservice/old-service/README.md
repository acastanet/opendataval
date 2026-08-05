# OLD Service

> Calcul indicatif d’un périmètre soumis aux obligations légales de débroussaillement.
> Dernière mise à jour et vérification : 2026-08-02
> Code : `apps/old-service/`

## Périmètre fonctionnel

Le service répond à deux questions distinctes :

1. le point est-il couvert par le zonage informatif national OLD (massif ou bande périphérique de 200 m) ;
2. quelle surface de travail obtient-on en appliquant un tampon à l’emprise du bâtiment, puis en tenant compte de la partie cadastrale classée en zone U lorsqu’elle est connue.

Le résultat est une **aide indicative**. Il ne remplace ni l’arrêté préfectoral, ni l’examen des constructions et installations réelles, ni la matérialisation sur le terrain. La voie privée n’est pas inventée à partir d’une route publique : elle est annoncée comme non incluse tant que sa géométrie et la profondeur réglementaire locale ne sont pas fournies.

## Routes

| Route | Exposition | Rôle |
|---|---|---|
| `GET /api/v2/old/perimetre` | publique via gateway | Calcul à partir d’un point |
| `GET /internal/v1/old/perimetre` | réseau interne | Cible du gateway |
| `GET /health` | interne | Vie du processus |
| `GET /ready` | interne | Processus prêt à accepter un calcul dégradé |

Paramètres :

| Paramètre | Règle |
|---|---|
| `lon` | longitude obligatoire entre -180 et 180 |
| `lat` | latitude obligatoire entre -90 et 90 |
| `distance_m` | facultatif, `50` par défaut, entre 1 et 200 m |

Exemple local :

```bash
curl -fsS "http://localhost:8080/api/v2/old/perimetre?lon=3.68302778&lat=44.06455556&distance_m=50"
```

Après déploiement sous le préfixe public actuel :

```text
https://euporie.cloud/val-daigoual/api/v2/old/perimetre?lon=3.68302778&lat=44.06455556&distance_m=50
```

L’application cartographique est construite dans `apps/web/src/pages/old.astro` et sera disponible sous `/old/` (donc `/val-daigoual/old/` avec le préfixe public).

## Sources et calcul

| Besoin | Source | Appel |
|---|---|---|
| Bâtiment | IGN BD TOPO | WFS `BDTOPO_V3:batiment` |
| Parcelle | API Carto, Parcellaire Express | `/api/cadastre/parcelle?geom=Point` |
| Document d’urbanisme | API Carto, GPU | `/api/gpu/zone-urba?geom=parcelle` |
| Applicabilité OLD | IGN DÉBROUSSAILLEMENT | WFS `DEBROUSSAILLEMENT:debroussaillement` |

Le WFS est appelé avec un CRS de boîte englobante et un CRS de sortie explicitement fixés à EPSG:4326. Pour l’applicabilité, `PROPERTYNAME` limite la réponse aux attributs utiles : les très grands polygones nationaux ne sont pas transférés.

Algorithme :

```text
charger en parallèle bâtiment, parcelle et zonage OLD
charger le zonage GPU sur la parcelle (ou sur le point en repli)

si un bâtiment contient le point ou est suffisamment proche :
    base = tampon du polygone du bâtiment
sinon :
    base = cercle provisoire autour du point

pour chaque zone U intersectant la parcelle :
    partie_U = intersection(parcelle, zone_U)

périmètre = union(base, parties_U)
surface = aire géodésique du périmètre
```

Une panne isolée de Cadastre, GPU ou DÉBROUSSAILLEMENT ne supprime pas le calcul géométrique disponible. Chaque source possède son propre état `available` ou `unavailable`; `applicable` vaut `null` lorsque le zonage OLD n’a pas pu être vérifié.

## Vérification réelle du point fourni

Contrôle effectué le 2 août 2026 contre les services officiels :

| Élément | Résultat |
|---|---|
| Bâtiment | `batiment.23376646`, usage résidentiel |
| Parcelle | `303390000E2151`, contenance cadastrale 280 m² |
| Urbanisme | zone `A`, « Ensemble des vallées agricoles de Valleraugue » |
| Applicabilité OLD | oui, objets de zones 1 et 2 |
| Méthode | `buffer_batiment` |
| Tampon | 50 m |
| Surface calculée | 10 428 m² |
| Accès privé | non inclus, à relever et vérifier |

Le cercle de 50 m autour d’un point vaut environ 7 854 m². La surface de 10 428 m² est plus grande parce que la profondeur est appliquée tout autour du polygone réel du bâtiment.

## Audit du plan initial

Les choix structurants du plan sont conservés : séparation entre applicabilité et périmètre calculé, service métier distinct de `map-service`, trois couches cartographiques et export du GeoJSON.

Corrections apportées :

- la couche nationale de référence est `DEBROUSSAILLEMENT:debroussaillement`; la requête doit déclarer le CRS, car sa sortie par défaut est en Lambert-93 (EPSG:2154) ;
- une largeur libre de 4 m et une hauteur libre de 4 m décrivent un gabarit opérationnel d’accès, pas à elles seules la profondeur OLD à cartographier autour de la voie ; l’article L134-6 prévoit une profondeur fixée par le préfet, dans la limite de 10 m de part et d’autre ;
- l’application ne présente jamais le cercle ponctuel comme un résultat équivalent au tampon du bâtiment ;
- la géométrie d’accès, les dépendances non reconnues en BD TOPO et une éventuelle décision du maire portant 50 m à 100 m restent à vérifier ;
- la donnée nationale informe sur l’applicabilité mais ne définit pas les modalités techniques départementales.

## Application

La page `/old/` fournit :

- sélection d’un point par coordonnées, clic ou géolocalisation ;
- orthophotographie et Plan IGN via `map-service` ;
- couches séparées périmètre, bâtiment et parcelle ;
- surface, zonage OLD, zone d’urbanisme et identifiants sources ;
- exports GeoJSON et KML ;
- impression / PDF depuis le navigateur ;
- fonctionnement du calcul et des exports même si WebGL est indisponible.

La prochaine extension fonctionnelle est un relevé explicite de la voie privée et des dépendances. Elle doit passer par un contrat d’entrée dédié ; elle ne doit pas être déduite silencieusement des données routières.

## Configuration

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `3000` | port HTTP interne |
| `OLD_API_CARTO_URL` | `https://apicarto.ign.fr/api` | base API Carto |
| `OLD_WFS_URL` | `https://data.geopf.fr/wfs/ows` | WFS Géoplateforme |
| `OLD_UPSTREAM_TIMEOUT_MS` | `10000` | délai de chaque appel amont |
| `OLD_BUILDING_SEARCH_RADIUS_METERS` | `75` | rayon de la requête WFS bâtiment ; le repli sélectionne au plus à 30 m |
| `APP_VERSION` | `dev` | version exposée par la santé |

## Développement et validation

```bash
pnpm dev:old
pnpm check:old
pnpm check:gateway
pnpm build:web
docker compose up --build old-service gateway map-service web caddy
```

Les tests couvrent le bâtiment trouvé, le cercle de repli, la zone U, la dégradation du zonage OLD, la validation d’entrée et le proxy gateway.

## Références

- [Code forestier, article L134-6](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000047810678)
- [IGN — jeu de données DÉBROUSSAILLEMENT](https://www.data.gouv.fr/datasets/debroussaillement)
- [API Carto — Cadastre](https://apicarto.ign.fr/api/doc/cadastre)
- [API Carto — Géoportail de l’urbanisme](https://apicarto.ign.fr/api/doc/gpu)
- [Préfecture du Gard — OLD](https://www.gard.gouv.fr/Actions-de-l-Etat/Securite-et-protection-de-la-population/Risques/Gestion-du-risque-feu-de-foret/OLD-Obligation-legale-de-debroussaillement)
