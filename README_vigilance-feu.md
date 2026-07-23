# Vigilance feu — page `/vigilance-feu`

Page dédiée qui, sans action de l'utilisateur, affiche déjà la situation à la mairie de Val-d'Aigoual (massif, niveau d'alerte, point chaud le plus proche), et qui peut recalculer la même chose pour sa position réelle sur simple clic. Elle réutilise les données déjà collectées pour la mini-app `/incendies` (voir [doc/EXPLOITATION-INCENDIES.md](doc/EXPLOITATION-INCENDIES.md)), mais élargies du seul massif de l'Aigoual (3 massifs, 15 km) à l'ensemble du département (8 massifs officiels, bbox départementale).

Design éditorial brutaliste, repris à l'identique du système déjà établi par `/meteo/essentiel` (voir `brutalist_interpretabilite.md`) : fond papier `#fcfcfa`, noir mat `#1a1a1a`, bleu `#0047ab`, Inter/sans-serif, chiffres géants en 800, bordures fines sans arrondi ni ombre. La signature de la page : le niveau de risque du massif détecté devient un mot géant coloré à bordure gauche épaisse — l'information la plus importante domine visuellement.

---

## 1. Pour l'utilisateur

### Ce que fait la page

1. **Au chargement, sans rien demander** : la page affiche la situation à la **mairie de Val-d'Aigoual** (position par défaut) — son massif, le niveau d'alerte du jour, le point chaud le plus proche. Aucune permission GPS n'est sollicitée d'office.
2. **Deux boutons carrés** en haut à droite, avec infobulle au survol/focus :
   - *Mairie de Val-d'Aigoual* (icône bâtiment à colonnes) : revient à la position par défaut.
   - *Ma position* (icône cible) : demande la géolocalisation du navigateur et recalcule tout pour cette position.
   Si la géolocalisation a déjà été autorisée lors d'une visite précédente, elle se relance automatiquement et silencieusement au chargement (aucune popup répétée).
3. **Couleur du massif** : la page détermine dans quel massif officiel du Gard se trouve la position courante (par défaut ou GPS) et affiche son niveau de vigilance incendie du jour en très grand, coloré.
4. **Carte départementale** : contour du département, 8 massifs colorés par niveau, anomalies thermiques satellite détectées dans les dernières 24 h, position courante repérée par un point bleu.
5. **Point chaud le plus proche** : distance (calcul Haversine), horodatage, satellite, puissance radiative et confiance de la détection la plus proche de la position courante, avec un bouton pour la recentrer sur la carte. La recherche porte sur les **72 dernières heures** (et non 24h) pour éviter un faux « aucun point chaud » dès que la dernière détection dépasse 24h : si elle date de plus de 24h, une mention « Pas de détection dans les dernières 24 h — dernière détection connue : » l'indique clairement, avec son âge réel (« il y a 26 h »). La carte, elle, n'affiche que les points de moins de 24h (jamais un point vieux de plusieurs jours comme s'il était actuel).

### Lecture des niveaux

Couleurs et libellés repris à l'identique de la carte officielle du Gard (aucune couleur ni libellé inventé) : les pastilles de légende (`static/30/img/legende_*.png`) donnent le code couleur exact, les popups de massif (`massifs_prev.js`) donnent le libellé d'accès — le site officiel ne publie aucun nom de niveau en texte.

| Niveau | Couleur (pastille officielle) | Accès (popup officielle) |
| --- | --- | --- |
| Blanc | `#ffffff` | Accès autorisé |
| Jaune | `#ffff80` | Accès autorisé |
| Orange | `#ff854a` | Accès déconseillé |
| Rouge | `#ff3e3e` | Accès interdit |
| Inconnu | `#808285` | Information en attente ou position hors massif suivi |

### Limites à connaître

- **Périmètre** : seuls les 8 massifs forestiers officiels du Gard sont suivis (ils ne couvrent pas 100 % de la surface du département — zones urbaines, agricoles ou hors massif classé n'ont pas de niveau). Si la position détectée tombe hors de tout massif, la page l'indique explicitement (« Pas de niveau ici ») plutôt que d'afficher une fausse couleur.
- **« Anomalie thermique » ≠ incendie confirmé** : un point sur la carte est une détection satellite (chaleur au sol), pas une confirmation qu'un feu est en cours. L'absence de point ne garantit pas non plus l'absence de feu (passage satellite, nébulosité, résolution du capteur). Rappelé explicitement sous la fiche « point chaud le plus proche ».
- **Ce n'est pas une alerte officielle** : en cas de feu ou de fumée, contacter le 112 ou le 18 (bandeau permanent en bas de page). La référence réglementaire reste la [carte officielle du Gard](https://www.risque-prevention-incendie.fr/gard/).
- Pour une expérience plus détaillée et déjà éprouvée (règles complètes par niveau, historique des détections, focus Aigoual/Cévennes), voir `/incendies` et `/incendies/temps-reel`.

---

## 2. Pour le programmeur

### Fichiers

| Rôle | Fichier |
| --- | --- |
| Page Astro | `apps/web/src/pages/vigilance-feu.astro` |
| Île Svelte | `apps/web/src/islands/VigilanceFeu.svelte` |
| Couleurs partagées | `apps/web/src/lib/vigilanceCouleurs.ts` |
| Point par défaut (mairie) | `packages/shared/src/localisationsMeteo.ts` (`POINT_METEO_PAR_DEFAUT`, déjà utilisé par `/meteo/essentiel`) |
| Routes API (partagées avec `/incendies`) | `apps/api/src/routes/incendies.ts` |
| Jobs worker (partagés avec `/incendies`) | `apps/worker/src/sources/fireZones.ts`, `fireRiskGard.ts`, `firms.ts` |
| Schéma SQL | `db/migrations/006_incendies.sql` → `012_niveau_blanc.sql` |

### Flux de données

```
fireZones.ts (mensuel)      fireRiskGard.ts (quotidien 18h10)     firms.ts (toutes les 30 min)
   │ geo.api.gouv.fr             │ risque-prevention-incendie.fr       │ firms.modaps.eosdis.nasa.gov
   │ apicarto.ign.fr             │ (JSON quotidien, 8 massifs)         │ (CSV VIIRS, bbox département)
   ▼                             ▼                                     ▼
incendies.zones              incendies.risques_officiels           incendies.detections_firms
(coeur, proche_5km,          (niveau par massif officiel,          (position: coeur/proche/
 veille_15km, departement)    date_validite, mode_collecte)         veille/departement)
   └───────────────┬──────────────────┴──────────────────┬──────────────┘
                    ▼                                     ▼
        apps/api/src/routes/incendies.ts  (GET /api/incendies/massifs-officiels·situation·detections·zones)
                    ▼
        VigilanceFeu.svelte  (lieu par défaut ou géoloc → point-in-polygon → niveau + carte + point chaud proche)
```

### Ce qui a changé par rapport à `/incendies` (héritage, pas de duplication)

`/incendies` et `/vigilance-feu` partagent le même worker et les mêmes routes API — seul le **périmètre géographique** diffère, piloté par un paramètre `?perimetre=departement` (absent = comportement historique inchangé, donc **aucune régression sur `/incendies`**) :

| Élément | Avant (`/incendies`, toujours le défaut) | Après, avec `?perimetre=departement` |
| --- | --- | --- |
| Massifs suivis (`fireRiskGard.ts`) | 3 (Causse Aigoual, Sud Cévennes, Nord Cévennes) | 8 (tous les massifs officiels du Gard, IDs 301-308) |
| Bbox de collecte FIRMS (`firms.ts`) | zone `veille_15km` (15 km autour de l'EPCI) | zone `departement_30` |
| `GET /api/incendies/massifs-officiels` | 3 contours (filtre `IDS_MASSIFS_AIGOUAL`) | 8 contours |
| `GET /api/incendies/situation` | complétude vérifiée sur 3 massifs | complétude vérifiée sur 8 massifs |
| `GET /api/incendies/detections` | jointure `ST_Covers(veille_15km, point)` | pas de jointure, tout le département |

### Détection du massif (point-in-polygon)

Aucune dépendance turf/JTS n'existe dans le repo. `VigilanceFeu.svelte` implémente un ray-casting pair/impair classique (`pointDansAnneau` → `pointDansPolygone` → `pointDansMassif`, gère `Polygon` et `MultiPolygon`, trous inclus) contre les contours renvoyés par `/api/incendies/massifs-officiels?perimetre=departement`. Le niveau est ensuite lu dans `properties.niveau`, injecté côté client en croisant `NOM_MASSIF` (propriété du FGB officiel) avec `zone_officielle` (colonne de `incendies.risques_officiels`) — ces deux chaînes doivent rester identiques (ex. `"CAUSSE AIGOUAL"`).

### Géolocalisation, lieu par défaut et point chaud le plus proche

Le pattern de géolocalisation repris est celui, le plus robuste du repo, de `MeteoEssentiel.svelte` (corrigé pour mobile, commit `e5084b1`) : vérification `window.isSecureContext`, distinction des codes d'erreur (`PERMISSION_DENIED` / `TIMEOUT` / autre), compteur anti race-condition, `enableHighAccuracy: false` + `timeout: 20 000 ms`. Pas de `watchPosition` : localisation ponctuelle sur clic bouton.

- **Lieu par défaut** : `LIEU_MAIRIE`, construit depuis `POINT_METEO_PAR_DEFAUT` (`packages/shared/src/localisationsMeteo.ts`, slug `val-aigoual`, label « Mairie de Val-d'Aigoual · Rue de la Mairie, Valleraugue », `lat 44.081192 / lon 3.641467`) — le même point que celui utilisé par défaut sur `/meteo/essentiel`, pour rester cohérent site-wide plutôt que de réutiliser `TERRITOIRE.commune.centre` (qui désigne un autre point, le centroïde administratif de la commune).
- **Géolocalisation silencieuse** : au montage, une fois les données chargées, `navigator.permissions.query({ name: "geolocation" })` est interrogée ; si `state === "granted"`, `meLocaliser(true)` se déclenche sans passer par le bouton (aucune popup, puisque déjà accordée) et sans afficher de message en cas d'échec (mode `silencieux`, on garde alors le lieu par défaut). Si l'API Permissions est absente (vieux Safari), rien ne se passe automatiquement — le bouton reste la seule voie d'entrée.
- **Deux boutons carrés** (`.action-carree`, 2.75 rem, icône SVG en ligne, tooltip `.infobulle` affiché au survol/focus — repris tel quel du composant `.action-entete` de `MeteoEssentiel.svelte`) : « Mairie de Val-d'Aigoual » (`revenirMairie()`, réinitialise `lieu` à `LIEU_MAIRIE`) et « Ma position » (`meLocaliser(false)`). Le bouton actif est visuellement distingué (`class:actif`).
- **Point chaud le plus proche** : recalculé par une fonction Haversine locale (~6 lignes, aucune dépendance) à chaque changement de `lieu`, contre le GeoJSON `detectionsGeojson` déjà chargé — aucun appel réseau supplémentaire. Les valeurs `satellite` (`N`/`N20`/`N21`) et `confiance` (`l`/`n`/`h`) sont mappées vers des libellés lisibles (`LIBELLE_SATELLITE`, `LIBELLE_CONFIANCE`), vérifiés contre les données réellement présentes en base (`select distinct satellite, confiance from incendies.detections_firms`) plutôt que devinés depuis la documentation FIRMS.
- **Fenêtre 72h vs 24h (fix post-lancement)** : `charger()` interroge `/api/incendies/detections?hours=72&perimetre=departement` (`FENETRE_RECHERCHE_HEURES`, 72 = borne max acceptée par `parseHours` côté API) au lieu de `hours=24`. `pointChaudProche` cherche sur l'ensemble des 72h ; un booléen dérivé `pointChaudRecent` (`estRecent()`, seuil `SEUIL_RECENT_MS` = 24h) distingue une détection fraîche d'une détection ancienne encore affichée par honnêteté. La **carte**, elle, ne reçoit qu'un sous-ensemble filtré à <24h (`detectionsRecentes`, calculé côté client dans `initialiserCarte`) : jamais de point vieux de plusieurs jours affiché comme actif sur la carte, seule la fiche texte peut remonter plus loin dans le temps. Motivé par un signalement utilisateur : une fenêtre stricte de 24h donnait l'impression d'une panne dès que la dernière détection dépassait tout juste 24h, alors que NASA FIRMS confirmait indépendamment l'absence de nouvelle détection (vérifié en interrogeant l'API FIRMS directement, hors app, pendant le diagnostic).

### Schéma SQL (`011_incendies_departement.sql`)

Étend deux contraintes CHECK existantes plutôt que de créer de nouvelles tables :

```sql
alter table incendies.zones ... check (type_zone in (..., 'departement', ...));
alter table incendies.detections_firms ... check (position in (..., 'departement'));
```

`incendies.zones.slug = 'departement_30'` : contour du département reconstitué par **union des ~350 communes du Gard** (`ST_UnaryUnion` + `ST_CollectionExtract(..., 3)`), car `geo.api.gouv.fr/departements/{code}` **ne fournit pas de géométrie de contour** contrairement à `/communes` et `/epcis` (vérifié en direct pendant l'implémentation — `?geometry=contour&format=geojson` est silencieusement ignoré sur cette ressource). Même stratégie que la zone `coeur` déjà existante (union EPCI + ZNIEFF).

### Schéma SQL (`012_niveau_blanc.sql`)

Renomme la valeur `'vert'` en `'blanc'` dans `incendies.risques_officiels.niveau` : le niveau 1 du Gard est publié en **blanc** sur la carte officielle (`static/30/js/massifs_prev.js`, `styleMassifs` — aucun remplissage, contour noir épaissi), jamais en vert. Étend la contrainte CHECK `risques_officiels_niveau_check` existante plutôt que d'en créer une nouvelle, avec un `update` intermédiaire pour convertir les lignes déjà en base (ordre : drop → update → add, sinon le `add constraint` échoue sur les lignes `'vert'` existantes).

### Relancer un job manuellement

```bash
docker compose build worker   # nécessaire : le worker tourne sur une image, pas un volume monté
docker compose run --rm -e RUN_ONCE=true -e RUN_ONLY=fire_zones worker
docker compose run --rm -e RUN_ONCE=true -e RUN_ONLY=fire_risk_gard worker
docker compose run --rm -e RUN_ONCE=true -e RUN_ONLY=firms worker
```

La migration s'applique automatiquement au démarrage (`runMigrations`), pas de commande séparée. Pour republier l'API et le site statique après un changement :

```bash
docker compose build api caddy
docker compose up -d --no-deps api worker caddy
```

Vérification rapide en base :

```sql
select slug, type_zone, ST_IsValid(geom) from incendies.zones order by type_zone;
select position, count(*) from incendies.detections_firms group by position;
select zone_officielle, niveau, date_validite from incendies.risques_officiels
  where departement = 'Gard' order by date_validite desc limit 16;
```

### Limites connues / suivi

- **Pas de purge dédiée** pour `incendies.detections_firms` à l'échelle département : le volume ingéré est mécaniquement plus élevé qu'avec la zone de veille de 15 km. À surveiller ; ajouter une purge si le volume devient gênant.
- **Couleurs dérivées d'assets tiers non versionnés** : les valeurs de `apps/web/src/lib/vigilanceCouleurs.ts` (pastilles, remplissage carte, opacités, épaisseur de contour) ont été extraites à la main des pastilles PNG (`static/30/img/legende_*.png`) et du script `static/30/js/massifs_prev.js` de risque-prevention-incendie.fr/gard/ — aucune couleur n'est documentée dans une API ou un fichier de config public. Si la préfecture refond sa carte (nouvelle palette, nouveau nombre de niveaux), ce fichier doit être revérifié manuellement, y compris la contrainte SQL `risques_officiels_niveau_check` (migration `012_niveau_blanc.sql`).
- **Pas de test en navigateur réel** : la vérification a porté sur le typecheck (`tsc --noEmit`, `@astrojs/check` — 0 erreur introduite), le build Astro, et les appels API/DB via `curl`/`psql` sur la stack Docker locale. Le rendu MapLibre, la demande de permission GPS, le comportement de la géolocalisation silencieuse et l'affichage effectif des boutons/tooltips n'ont pas été vérifiés visuellement.
- **Nom de massif comme clé de jointure** : `NOM_MASSIF` (FGB) et `zone_officielle` (DB) sont rapprochés par égalité de chaîne, sans identifiant numérique partagé côté DB. Un changement de libellé côté source officielle casserait silencieusement l'association niveau ↔ contour (la page afficherait alors « inconnu » pour ce massif, sans erreur bruyante).

---

## 3. Détail des sources de données

Aucune nouvelle source externe n'a été introduite : le MVP réutilise et élargit les flux déjà en place pour `/incendies`.

| Source | URL | Licence | Fréquence de collecte | Fichier worker | Table DB | Ce qu'elle apporte à `/vigilance-feu` |
| --- | --- | --- | --- | --- | --- | --- |
| Prévention incendie Gard | `risque-prevention-incendie.fr/static/30/import_data/{date}.json` | Information publique — Préfecture du Gard | Quotidienne (~18 h 10, `Europe/Paris`) | `apps/worker/src/sources/fireRiskGard.ts` | `incendies.risques_officiels` | Niveau de risque du jour (blanc/jaune/orange/rouge) pour les 8 massifs officiels |
| Contours des massifs (FlatGeobuf) | `risque-prevention-incendie.fr/static/30/massifs_30.fgb` | Information publique — Préfecture du Gard | Cache 6 h côté API (pas de job worker dédié : lu à la volée par la route) | `apps/api/src/routes/incendies.ts` (`chargerMassifsGardOfficiels`) | — (servi en GeoJSON, non persisté) | Géométries des 8 massifs + `NOM_MASSIF`, utilisées pour le point-in-polygon et le remplissage coloré de la carte |
| NASA FIRMS (VIIRS SNPP / NOAA-20 / NOAA-21) | `firms.modaps.eosdis.nasa.gov/api/area/csv` | NASA Open Data / FIRMS Terms of Use | Toutes les 30 minutes | `apps/worker/src/sources/firms.ts` | `incendies.detections_firms` | Points d'anomalie thermique satellite affichés sur la carte départementale |
| geo.api.gouv.fr — EPCI/communes | `geo.api.gouv.fr/epcis/{code}/communes`, `geo.api.gouv.fr/communes?codeDepartement=30` | Licence Ouverte 2.0 | Mensuelle | `apps/worker/src/sources/fireZones.ts` | `incendies.zones` (`coeur`, `departement_30`) | Contour EPCI (zone cœur) et union des ~350 communes du Gard (contour département, faute de contour direct sur `/departements/{code}`) |
| IGN APICarto — ZNIEFF II | `apicarto.ign.fr/api/nature/znieff2` | Licence Ouverte 2.0 | Mensuelle | `apps/worker/src/sources/fireZones.ts` | `incendies.zones` (`coeur`) | Extension de la zone cœur au massif ZNIEFF de l'Aigoual (id `910011858`) |

Catalogue déclaratif (licence/fréquence affichées sur `/sources`) : `packages/shared/src/catalogue.ts`, entrées `fire_risk_gard`, `firms`, `geoapi`, `georisques` (thème `risques`). Aucune entrée de catalogue n'a été ajoutée ou modifiée pour ce MVP : l'élargissement est un changement de périmètre géographique des jobs existants, pas une nouvelle source.
