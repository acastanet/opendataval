# valfeu — application de terrain

> Application mobile-first servie sur `/valfeu/` : carte, position et suspicions satellitaires de feu autour d’un point actif.
> Dernière mise à jour : 2026-07-27 · Dernière vérification : 2026-07-27
> Code : `apps/gateway-service/src/pages/app-terrain.ts` · Routes : `apps/gateway-service/src/app.ts:163-175`

## Rôle

valfeu répond à une question de terrain, sur téléphone, avec du réseau incertain : **y a-t-il une suspicion de feu près d’ici, et quand a-t-elle été observée ?**

Elle compose trois services v2 autour d’un point actif : Map pour le fond, Fire Detection pour les suspicions, Geography pour l’adresse du point. Elle ne contient aucune logique métier : tout est calculé en amont, la page ne fait que présenter.

Toute détection affichée est une **suspicion satellitaire non confirmée** ; l’absence de point n’est jamais une garantie d’absence de feu. Ce cadrage est repris littéralement dans l’interface (HUD, listes, fiche de détail).

## Accès

| URL | Contenu |
|---|---|
| `http://localhost:8080/valfeu/` | L’application (les deux formes, avec et sans barre finale, sont servies) |
| `/valfeu/manifest.webmanifest` | Manifeste PWA installable (`display: standalone`, portrait) |
| `/valfeu/icone.svg` | Icône SVG |

Aucun service worker n’est enregistré : les données satellite doivent rester fraîches, on préfère l’échec visible au cache silencieux. Sur iOS, l’ajout à l’écran d’accueil fonctionne mais Safari ignore l’icône SVG faute d’`apple-touch-icon` PNG (hors périmètre).

## Écran

Quatre zones superposées à une carte plein écran :

- **HUD (haut)** — identité `valfeu`, libellé du point actif, état lisible des sources et accès direct au **112** et au **18** ;
- **Carte** — MapLibre, style `plan` servi par map-service ;
- **Feuille de résultats (bas)** — deux états au clic sur la poignée : repliée ou dépliée, avec cartes tactiles pour chaque suspicion ;
- **Console de recherche (bas)** — rayon 5/50 km et recherche feu mis en avant, puis Mairie · Ma position · Historique 7 j en actions secondaires. Cibles tactiles de 48 px minimum, marges `env(safe-area-inset-*)` respectées.

## Interactions

| Action | Effet |
|---|---|
| **Mairie** | Repositionne le point actif sur la mairie de Val-d’Aigoual, efface les détections |
| **Ma position** | `navigator.geolocation` (haute précision, délai 10 s), affiche le cercle de précision, puis interroge `/api/v2/geography/resolve` pour l’adresse, la commune, le département et l’altitude |
| **Feux** | `/api/v2/fire/nearby` sur 24 h, rayon 5 ou 50 km selon le segment sélectionné |
| **Historique 7 j** | Même route, forcée à 50 km sur 7 jours, résultats regroupés par jour |
| **Appui long / clic droit sur la carte** | Choisit un point libre ; sur écran tactile, l’appui est reconnu après 650 ms et annulé si le doigt se déplace |
| **Clic sur une détection** (carte ou liste) | Fiche de détail : distance, date d’observation, satellite, instrument, confiance, puissance radiative |

Après une recherche, la vue s’ajuste sur l’ensemble « point actif + détections » (`fitBounds`) ; sans détection, elle recentre simplement sur le point. Les animations sont supprimées si `prefers-reduced-motion` est actif.

Les observations amont sont horodatées en UTC. L’interface les convertit en
heure locale de Val-d’Aigoual (`Europe/Paris`) et affiche explicitement le
décalage `UTC+1` ou `UTC+2` selon la date.

## Couches cartographiques

| Couche | Rendu |
|---|---|
| `search-radius` | Disque du rayon interrogé, orange, contour tireté |
| `accuracy` | Cercle de précision de la géolocalisation, bleu |
| `active-point` | Point actif, pastille bleue cerclée de blanc |
| `detections` | Suspicions : **rouge** si observée il y a moins de 3 h, **orange** moins de 24 h, **jaune** au-delà ; rayon interpolé selon la puissance radiative (FRP) de 6 à 13 px |

## Dépendances

| Ressource | Chemin | Servi par |
|---|---|---|
| MapLibre GL JS + CSS | `/api/v2/map/vendor/maplibre-gl.{js,css}` | map-service, **directement via Caddy** |
| Style et tuiles | `/api/v2/map/styles/carte.json?fond=plan&ombrage=aucun`, `/api/v2/map/tiles/plan/{z}/{x}/{y}.png` | map-service |
| Suspicions de feu | `/api/v2/fire/nearby?lat&lon&radius_km&history_days` | gateway → fire-detection-service |
| Contexte du point | `/api/v2/geography/resolve?lat&lon&horizontalAccuracyMeters&positionSource` | gateway → geography-service |

**Aucune ressource externe** : ni CDN, ni tuiles OpenStreetMap, contrairement aux pages de démo. Un test le vérifie explicitement. La page reste donc compatible avec le CSP `default-src 'self'` du `Caddyfile`, et fonctionne sur un réseau sans sortie Internet dès lors que map-service est joignable.

Conséquence de routage à connaître : `/api/v2/map/*` **ne passe pas par le gateway** (cf. [ADR 008](../../ADR/008-map-service-representation-cartographique.md)). Ouvrir l’application directement sur le port du gateway (`http://localhost:3000/valfeu`) au lieu de Caddy (`:8080`) renvoie donc 404 sur toutes les ressources carte, et la carte n’apparaît pas.

## Chargement de la carte

MapLibre est chargé en `defer`. Un script inline classique s’exécute **pendant** l’analyse du document, donc **avant** les scripts `defer` : initialiser la carte de façon synchrone garantit un `window.maplibregl` indéfini. L’application attend donc l’événement `load` avant d’appeler `initMap()`, comme la démo carte (`src/pages/demo.ts`).

C’est exactement le défaut corrigé le 2026-07-27 : la carte n’apparaissait jamais et, `state.mapReady` restant faux, les détections ne se traçaient pas non plus. **Toute réécriture de l’initialisation doit conserver cette attente** — deux tests la verrouillent.

En cas d’indisponibilité réelle de MapLibre, l’élément `#map` **est conservé** (classe de repli + contenu, jamais `outerHTML`) et un bouton **Réessayer** réinjecte le script et la feuille de style vendor : la carte peut réapparaître sans recharger la page.

## Exploitation

| Symptôme | Cause probable | Action |
|---|---|---|
| « Carte indisponible » avec bouton Réessayer | map-service arrêté, ou page ouverte sur le port du gateway au lieu de Caddy | `docker compose up -d map-service` ; utiliser `http://localhost:8080/…` |
| Carte grise, HUD « Fond de carte indisponible » | Style ou tuiles en erreur, MapLibre chargé | Vérifier `/api/v2/map/styles/carte.json` et une tuile `…/tiles/plan/12/2076/1478.png` |
| « Sources satellite : incomplètes » | `data_status` dégradé ou une source amont muette | Comportement nominal : le bandeau prévient que l’absence de point ne vaut pas absence de feu |
| « Données feu indisponibles » | fire-detection-service injoignable ou en erreur | Le message reprend le code d’erreur et la référence de support (`requestId`) ; bouton Réessayer |
| Bouton « Ma position » sans effet | Contexte non sécurisé ou autorisation refusée | La géolocalisation exige HTTPS ou `localhost` ; le message précise la cause (refus, indisponible, délai dépassé) |

Contrôle rapide de bout en bout :

```powershell
docker compose up -d --build gateway
curl.exe -sI http://localhost:8080/valfeu/
curl.exe -s  http://localhost:8080/api/v2/map/styles/carte.json
curl.exe -sI http://localhost:8080/api/v2/map/vendor/maplibre-gl.js
```

## Tests

```powershell
pnpm --filter gateway-service run test       # 43 tests, dont 8 pour valfeu
pnpm --filter gateway-service run typecheck
```

`apps/gateway-service/test/app-terrain.test.ts` couvre le rendu des routes et du manifeste, l’absence de tout hôte externe, la validité syntaxique des scripts inline, puis — via un DOM factice, sans dépendance supplémentaire — **le comportement au chargement** : aucune carte construite avant l’événement `load`, carte construite ensuite sur le bon style, et repli qui préserve le conteneur en offrant un réessai.

## Limites connues

- La liste des détections lit toujours `history.suspicions` de la réponse fire ; le mode « Feux » repose donc sur `history_days=1` plutôt que sur le bloc temps réel du contrat amont.
- Le rayon de recherche est dessiné comme un polygone à 72 côtés calculé en degrés : suffisant à l’échelle communale, ce n’est pas une géodésique exacte.
- Pas de mode hors ligne, pas de persistance du point actif entre deux visites.
- La page d’accueil générale du portail conserve ses propres libellés ; l’application de terrain et son manifeste utilisent désormais l’identité **valfeu**.

## Documentation liée

- Gateway (routage, CSP, pages) : [`../../microservice/gateway-service/README.md`](../../microservice/gateway-service/README.md)
- Détection de feu : [`../../microservice/fire-detection/README.md`](../../microservice/fire-detection/README.md)
- Cartographie : [`../../microservice/map-service/README.md`](../../microservice/map-service/README.md)
- Décision de routage carte : [`../../ADR/008-map-service-representation-cartographique.md`](../../ADR/008-map-service-representation-cartographique.md)
