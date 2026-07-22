# Application météo — architecture

Dernière vérification : 22 juillet 2026.

## 1. Vue d’ensemble

L’application météo appartient au monorepo OpenDataVal. Elle combine :

- des pages Astro ;
- des composants interactifs Svelte ;
- une API Fastify ;
- PostgreSQL pour les agrégats et les séries ;
- une application Python dédiée aux traitements Copernicus ;
- des services externes interrogés côté serveur ou via l’API interne.

Flux principal :

```text
Open-Meteo / Météo-France / IGN
              |
              v
        API Fastify --------------------+
              |                         |
              v                         |
      réponses météo                    |
                                        v
Copernicus CDS --> service Python --> PostgreSQL
                                        |
                                        v
                                  API Fastify
                                        |
                                        v
                         Astro + îlots Svelte
```

Une visite de page ne déclenche jamais de téléchargement Copernicus.

## 2. Routes internes et routes publiques

### 2.1 Routes du dépôt

| Fonction | Route interne |
| --- | --- |
| Vue essentielle | `/meteo/essentiel/` |
| Comparaison | `/meteo/comparaison/` |
| Bilan thermique | `/meteo/bilan-thermique/` |
| Informations | `/meteo/informations/` |
| Application détaillée | `/meteo/` |

### 2.2 Déploiement public

La suite météo est en production sous le préfixe public :

```text
https://euporie.cloud/val-daigoual/
```

La vue essentielle est accessible à :

```text
https://euporie.cloud/val-daigoual/meteo/essentiel/
```

Les autres pages suivent le même préfixe public :

```text
/val-daigoual/meteo/comparaison/
/val-daigoual/meteo/bilan-thermique/
/val-daigoual/meteo/informations/
```

Le préfixe `/val-daigoual/` relève du déploiement et de la réécriture du proxy de production. Le code applicatif continue d’utiliser les routes internes `/meteo/...` et des appels API relatifs `/api/...`.

Toute modification des liens doit être testée à la fois :

- à la racine en environnement local ;
- sous le préfixe public en production ou dans un environnement de préproduction équivalent.

## 3. Frontend

### 3.1 Pages Astro

| Route | Fichier |
| --- | --- |
| `/meteo/essentiel/` | `apps/web/src/pages/meteo/essentiel.astro` |
| `/meteo/comparaison/` | `apps/web/src/pages/meteo/comparaison.astro` |
| `/meteo/bilan-thermique/` | `apps/web/src/pages/meteo/bilan-thermique.astro` |
| `/meteo/informations/` | `apps/web/src/pages/meteo/informations.astro` |
| `/meteo/` | `apps/web/src/pages/meteo.astro` |

Les pages Astro définissent le document, les métadonnées et chargent les îlots Svelte avec `client:only="svelte"`.

### 3.2 Composants Svelte

Composants principaux :

- `MeteoEssentiel.svelte` ;
- `MeteoComparaison.svelte` ;
- `BilanThermique.svelte` ;
- `MeteoInformations.svelte` ;
- `MeteoPoint.svelte` pour l’application détaillée ;
- `EnteteMeteo.svelte` pour la navigation commune.

La vue essentielle gère :

- le lieu actif ;
- la géolocalisation ;
- le chargement météo ;
- les appels climatiques parallèles ;
- la vigilance ;
- le rafraîchissement périodique ;
- les états d’erreur ;
- les liens entre les quatre pages.

### 3.3 Contrats d’interface à préserver

Les tests utilisent notamment :

- `data-testid="meteo-point"` ;
- `data-testid="temperature-actuelle"` ;
- `data-testid="temperature-plus-trois"`.

Une refonte peut réorganiser les composants, mais tout retrait ou renommage d’un contrat de test doit être volontaire et accompagné d’une mise à jour des scénarios.

## 4. API

### 4.1 Routes météo immédiate

Le module principal est `apps/api/src/routes/meteo.ts`.

Routes utilisées ou associées à la suite :

```text
GET /api/meteo/point?lat=&lon=
GET /api/meteo/localisation?lat=&lon=
GET /api/meteo/lieux?q=
GET /api/meteo/revisions?...
```

La liste exacte des paramètres doit être vérifiée dans le code avant toute modification de contrat.

### 4.2 Routes climatiques

Le module `apps/api/src/routes/meteoClimate.ts` publie :

```text
GET /api/meteo/contexte-climatique?lat=&lon=
GET /api/meteo/bilan-thermique?lat=&lon=
```

Ces routes lisent PostgreSQL. Elles ne contactent pas le CDS.

### 4.3 Résolution des points

`packages/shared/src/localisationsMeteo.ts` contient :

- les trois points préconfigurés ;
- le point par défaut ;
- la normalisation des coordonnées ;
- la résolution entre point préconfiguré et point précis ;
- les clés géographiques stables utilisées pour le cache.

Les coordonnées contractuelles actuelles sont :

| Point | Latitude | Longitude |
| --- | ---: | ---: |
| Val-d’Aigoual | 44.081192 | 3.641467 |
| Paris | 48.8566 | 2.3522 |
| Marseille | 43.2965 | 5.3698 |

## 5. Services externes

| Service | Usage | Mode d’accès |
| --- | --- | --- |
| Open-Meteo | AROME, ARPEGE, anciens runs et données complémentaires | via l’API Fastify |
| Météo-France | vigilance officielle et observations selon la vue | via l’API Fastify |
| Géoplateforme IGN / BAN | géocodage et géocodage inverse | via l’API interne |
| ECMWF | tendance d’ensemble de l’application détaillée | données adaptées via la chaîne météo |
| Copernicus CDS | ERA5-Land et ERA5-HEAT | uniquement par le service Python planifié |

Les clés serveur ne doivent jamais atteindre le navigateur.

## 6. Stockage PostgreSQL

Tables principales liées au climat :

- `series.meteo_points_reference` ;
- `series.meteo_climatologie_jour` ;
- `series.thermal_monthly`.

`series.meteo_climatologie_jour` contient les références quotidiennes 1991–2020 pour chaque point.

`series.thermal_monthly` contient les bilans UTCI mensuels, les nuits tropicales, les références et les dates de dépassement des seuils.

Seules les données complètes et validées doivent être publiées.

## 7. Application Copernicus

L’application se trouve dans `apps/copernicus`.

Jobs disponibles :

| Job | Fonction |
| --- | --- |
| `meteo_climatologie_points` | calcule la climatologie ERA5-Land des points fixes |
| `thermal_monthly` | calcule le dernier bilan mensuel UTCI et sa référence |

Le service appartient à un profil Docker Compose désactivé par défaut.

En mode planifié, il vérifie quotidiennement :

- le bilan du mois précédent le 8 ;
- le renouvellement annuel de la climatologie le 9 janvier.

Les upserts rendent les relances idempotentes.

## 8. Cache et résilience

La chaîne météo utilise plusieurs niveaux de cache :

- cache applicatif pour les points et certaines sources distantes ;
- stockage PostgreSQL pour les agrégats climatiques ;
- cache de fichiers bruts Copernicus dans `data/downloads/` ;
- cache navigateur ou HTTP selon les routes.

Règles de résilience :

- conserver la dernière météo valide lors d’un rafraîchissement silencieux échoué ;
- signaler les données périmées ;
- isoler les erreurs de source afin de garder les sections encore valides ;
- ne pas publier un bilan Copernicus incomplet ;
- ne pas convertir une indisponibilité de vigilance en niveau vert.

## 9. Sécurité

- secrets uniquement dans l’environnement ou un gestionnaire de secrets ;
- aucune clé dans les URL clientes, les journaux, les captures ou Git ;
- géolocalisation autorisée uniquement pour l’origine du site ;
- CSP et `Permissions-Policy` définies par le serveur ;
- fichiers NetCDF, GRIB et téléchargements CDS ignorés par Git ;
- liens externes officiels ouverts avec les protections usuelles.

## 10. Tests

Les tests Playwright se trouvent dans `e2e/` et couvrent les rendus Chromium mobile et bureau.

Commandes de référence :

```powershell
pnpm build:web
pnpm test:e2e
```

Tests Copernicus :

```powershell
docker compose --profile copernicus build copernicus
docker compose --profile copernicus run --rm --no-deps copernicus python -m unittest discover -s /app/tests -v
```

Une refonte de design doit ajouter ou ajuster les tests fonctionnels avant de mettre à jour les captures visuelles.

## 11. Contraintes pour la V2

La prochaine version peut remplacer la composition visuelle et découper davantage les composants. Elle doit cependant préserver ou migrer explicitement :

- les quatre fonctions produit ;
- les routes publiques ;
- la sécurité de la vigilance ;
- la distinction entre données immédiates et climatiques ;
- les états partiels et périmés ;
- la navigation au clavier ;
- les paramètres de lieu ;
- les traitements Copernicus hors requête utilisateur ;
- la compatibilité avec le préfixe public `/val-daigoual/`.