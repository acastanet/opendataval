[![Les Monts - Les Causses et les Cévennes patrimoine mondial de l'UNESCO](https://images.openai.com/static-rsc-4/uB4z61cLYES4BkvnR4_XVP28_nNMcdGstpaeCt9Zyz5_iydUm8ulzb7D4NRzrHcpTFkHN3l0rczDWznG3nwkO-QJwfJvQOQm22mThA9OL-7ZjmaudUiTTU4SpenSUHmNjeYM-vKnk1lZ8ANIKqJOxdWb7Zvx9F8HyTAnsZ6Ghno?purpose=inline)](https://causses-et-cevennes.fr/monts?utm_source=chatgpt.com)

Pour couvrir correctement le secteur, il ne faut plus utiliser uniquement l’étiquette réglementaire **« SUD CÉVENNES »**. Il faut construire une **zone géographique personnalisée**, indépendante des découpages administratifs et des différentes plateformes.

## 1. Définir le périmètre de surveillance

Je recommande de créer deux contours :

```text
ZONE CŒUR =
CC Causses Aigoual Cévennes – Terres Solidaires
+
massif géographique de l’Aigoual et du Lingas

ZONE D’ALERTE =
ZONE CŒUR
+
tampon périphérique de 5 km
```

Le tampon de 5 km permet de détecter un départ de feu situé juste à l’extérieur du territoire, mais susceptible de s’en rapprocher.

### 1.1 Périmètre de la communauté de communes

La **CC Causses Aigoual Cévennes – Terres Solidaires** correspond à l’EPCI portant le code SIREN :

```text
200034601
```

Elle comprend actuellement 15 communes :

> Causse-Bégon, Dourbies, L’Estréchure, Lanuéjols, Lasalle, Les Plantiers, Peyrolles-en-Cévennes, Revens, Saint-André-de-Majencoules, Saint-André-de-Valborgne, Saint-Sauveur-Camprieu, Saumane, Soudorgues, Trèves et Val-d’Aigoual. ([Banatic][1])

Les contours peuvent être récupérés automatiquement avec l’API géographique de l’État :

```text
https://geo.api.gouv.fr/epcis/200034601/communes
```

Pour demander directement les géométries des communes :

```text
https://geo.api.gouv.fr/epcis/200034601/communes?fields=nom,code,contour&format=geojson&geometry=contour
```

L’API permet d’interroger un EPCI à partir de son code et de renvoyer ses communes en JSON ou en GeoJSON. ([geo.api.gouv.fr][2])

### 1.2 Périmètre du massif de l’Aigoual

Le terme « massif de l’Aigoual » n’a pas un contour unique utilisé par tous les organismes. Les limites peuvent différer selon que l’on parle :

* de paysage ;
* d’écologie ;
* de forêt ;
* de prévention des incendies ;
* du cœur du Parc national ;
* du massif forestier utilisé par les services opérationnels.

Pour disposer immédiatement d’un contour téléchargeable et exploitable, le meilleur choix est la **ZNIEFF de type II “Massif de l’Aigoual et du Lingas”**, identifiée par le numéro national :

```text
910011858
```

Ce périmètre a l’avantage de représenter un ensemble naturel cohérent et de couvrir des secteurs du Gard et de la Lozère. Il est plus large que la seule communauté de communes. ([Picto Occitanie][3])

Une variante plus restrictive est le site Natura 2000 :

```text
FR9101371 — Massif de l’Aigoual et du Lingas
```

Mais ce périmètre correspond à des habitats protégés : il ne constitue pas nécessairement la meilleure représentation du massif pour la surveillance incendie. Les couches Natura 2000 sont disponibles en données vectorielles nationales ou par les services de la DREAL Occitanie. ([Occitanie Sustainable Development][4])

### Choix recommandé

Pour un système de surveillance incendie :

```text
Massif = ZNIEFF II 910011858
Territoire administratif = EPCI 200034601
Zone cœur = union des deux contours
Zone d’alerte = zone cœur + tampon de 5 km
```

Ce contour ne sera pas une limite réglementaire officielle. Ce sera un **périmètre opérationnel de collecte et d’alerte**.

---

## 2. Construire les fichiers géographiques dans QGIS

### Étape 1 — Télécharger les communes

Télécharger le GeoJSON des communes de l’EPCI avec l’API Geo :

```text
cc-causses-aigoual-communes.geojson
```

### Étape 2 — Télécharger la ZNIEFF

Télécharger la couche nationale ou régionale des ZNIEFF, puis sélectionner l’entité dont l’identifiant national est :

```text
910011858
```

En fonction du fichier, le champ peut être nommé :

```text
ID_MNHN
ID_NATIONAL
MNHN_ID
```

### Étape 3 — Reprojeter les couches

Dans QGIS, reprojeter les deux couches dans :

```text
EPSG:2154 — RGF93 / Lambert-93
```

Ce système métrique est nécessaire pour calculer correctement un tampon de 5 km.

### Étape 4 — Fusionner les communes

Utiliser :

```text
Vecteur
→ Outils de géotraitement
→ Regrouper / Dissoudre
```

Dissoudre les 15 communes sans choisir de champ. Le résultat est un seul polygone :

```text
cc_causses_aigoual.geojson
```

### Étape 5 — Réunir le massif et la CC

Utiliser l’outil :

```text
Union
```

ou :

```text
Fusionner les couches vectorielles
puis Dissoudre
```

Le résultat devient :

```text
zone_aigoual_coeur
```

### Étape 6 — Ajouter le tampon

Créer un tampon de :

```text
5 000 mètres
```

Dissoudre les zones de recouvrement. Le résultat devient :

```text
zone_aigoual_alerte_5km
```

Pour une veille régionale plus précoce, un second tampon de 15 km peut être conservé :

```text
zone_aigoual_veille_15km
```

### Étape 7 — Exporter pour les API

Exporter les trois fichiers en GeoJSON et en coordonnées GPS :

```text
EPSG:4326 — WGS 84
```

Fichiers finaux :

```text
zone_aigoual_coeur.geojson
zone_aigoual_alerte_5km.geojson
zone_aigoual_veille_15km.geojson
```

---

# 3. Obtenir le niveau officiel de risque incendie

## 3.1 Pour la partie gardoise

La page du Gard fournit chaque jour le niveau de risque par zone météo, pour la journée en cours et le lendemain. Elle annonce une actualisation vers 18 heures. Parmi les zones disponibles figurent notamment :

```text
CAUSSE AIGOUAL
SUD CEVENNES
NORD CEVENNES
```

La page contient également un document de correspondance entre les communes et les zones météo. ([Risque Prévention Incendie][5])

Pour la communauté de communes, il faut donc :

1. récupérer le tableau de correspondance commune-zone ;
2. rechercher les 15 communes de l’EPCI ;
3. identifier toutes les zones météo auxquelles elles appartiennent ;
4. conserver le niveau le plus défavorable parmi ces zones.

Il ne faut pas supposer que toute la communauté de communes appartient à « SUD CÉVENNES ». Compte tenu de son étendue, il est probable que plusieurs zones officielles soient concernées. La correspondance doit être validée commune par commune avec le document officiel.

### Règle d’agrégation proposée

```text
niveau_territoire =
niveau maximal parmi les zones officielles
qui intersectent la zone cœur
```

Exemple :

```text
CAUSSE AIGOUAL : jaune
SUD CEVENNES   : orange
NORD CEVENNES  : jaune

Niveau général du territoire : orange
```

Il reste néanmoins utile de conserver le détail de chaque zone, car une alerte orange limitée au sud du territoire ne doit pas être présentée comme uniforme sur tout le massif.

## 3.2 Automatiser la récupération

Le site ne présente pas d’API publique documentée. La première opération consiste donc à vérifier comment la carte charge ses données.

Dans Chrome ou Firefox :

```text
F12
→ Réseau / Network
→ Fetch/XHR
→ Recharger la page
```

Rechercher ensuite les termes :

```text
json
api
risque
gard
zone
prevision
```

Pour chaque requête intéressante :

1. ouvrir l’onglet « Réponse » ;
2. vérifier si les noms des zones et les couleurs apparaissent ;
3. utiliser « Copier comme cURL » ;
4. tester la requête indépendamment du navigateur.

Si un flux JSON est découvert, il peut être interrogé automatiquement. Comme il ne s’agira probablement pas d’une API contractuelle, il faudra surveiller les changements de structure du site.

### Méthode de secours robuste

Chaque jour vers 18 h 10 :

1. télécharger ou imprimer en PDF la carte du jour ;
2. enregistrer la page HTML ;
3. enregistrer la date de collecte ;
4. extraire les niveaux des zones ;
5. conserver le fichier brut comme preuve.

Structure conseillée :

```text
archive-risque-gard/
└── 2026/
    ├── 2026-07-17/
    │   ├── page.html
    │   ├── carte.pdf
    │   └── niveaux.json
    └── 2026-07-18/
```

Exemple de fichier normalisé :

```json
{
  "date_validite": "2026-07-17",
  "date_collecte": "2026-07-17T18:12:00+02:00",
  "zones": {
    "CAUSSE AIGOUAL": "jaune",
    "SUD CEVENNES": "orange",
    "NORD CEVENNES": "jaune"
  },
  "source": "Prévention incendie Gard"
}
```

## 3.3 Pour la partie lozérienne du massif

Le portail interdépartemental utilisé par le Gard ne propose pas actuellement de page équivalente pour la Lozère. Il faut donc compléter les informations avec :

* la Météo des forêts de Météo-France ;
* les arrêtés et communications de la préfecture de la Lozère ;
* les informations du Parc national des Cévennes ;
* les communications locales et communales.

La Météo des forêts fournit une prévision départementale à quatre niveaux pour le lendemain et le surlendemain, mais elle ne signale pas les incendies en cours. ([Risque Prévention Incendie][6])

---

# 4. Détecter les feux en quasi-temps réel

La principale source ouverte est **NASA FIRMS**. Elle fournit les anomalies thermiques détectées par les satellites VIIRS et MODIS.

Les données sont généralement disponibles quelques heures après le passage du satellite. Une détection est un **point chaud potentiel**, pas nécessairement un incendie de forêt confirmé. Des brûlages agricoles, des installations industrielles ou d’autres sources de chaleur peuvent produire une détection. ([NASA-FIRMS][7])

## 4.1 Obtenir une clé FIRMS

Créer gratuitement une clé appelée :

```text
MAP_KEY
```

La clé sert à utiliser l’API. Le service applique une limite de transactions, actuellement fixée à 5 000 transactions par période de dix minutes. ([NASA-FIRMS][8])

## 4.2 Calculer l’emprise de la zone

À partir du fichier :

```text
zone_aigoual_alerte_5km.geojson
```

calculer :

```text
west  = longitude minimale
south = latitude minimale
east  = longitude maximale
north = latitude maximale
```

L’API FIRMS attend les coordonnées dans cet ordre :

```text
ouest,sud,est,nord
```

## 4.3 Interroger les satellites

Exemples pour les dernières 24 heures :

```text
https://firms.modaps.eosdis.nasa.gov/api/area/csv/<MAP_KEY>/VIIRS_SNPP_NRT/<west>,<south>,<east>,<north>/1
```

```text
https://firms.modaps.eosdis.nasa.gov/api/area/csv/<MAP_KEY>/VIIRS_NOAA20_NRT/<west>,<south>,<east>,<north>/1
```

```text
https://firms.modaps.eosdis.nasa.gov/api/area/csv/<MAP_KEY>/VIIRS_NOAA21_NRT/<west>,<south>,<east>,<north>/1
```

La valeur finale peut aller de `1` à `5` et correspond au nombre de jours demandés. Les sources VIIRS S-NPP, NOAA-20 et NOAA-21 peuvent être interrogées séparément. ([NASA-FIRMS][9])

## 4.4 Filtrer les points

Une requête FIRMS travaille sur un rectangle. Elle renverra donc aussi des points situés hors du contour réel du massif.

Il faut ensuite effectuer une sélection géographique :

```text
point FIRMS dans zone cœur
ou
point FIRMS dans tampon de 5 km
```

Pour chaque point, conserver au minimum :

```text
latitude
longitude
date et heure d’acquisition
satellite
instrument
confiance
FRP — puissance radiative
détection jour/nuit
distance à la zone cœur
```

### Qualification proposée

```text
DÉTECTION INTERNE
Point situé dans la zone cœur

DÉTECTION PROCHE
Point situé entre 0 et 5 km de la zone cœur

DÉTECTION DE VEILLE
Point situé entre 5 et 15 km

HORS SECTEUR
Point situé au-delà de 15 km
```

### Limiter les fausses alertes

Une alerte plus forte peut être déclenchée lorsque :

* plusieurs satellites détectent le même secteur ;
* plusieurs points apparaissent dans un rayon d’un kilomètre ;
* les détections persistent sur plusieurs passages ;
* la puissance radiative augmente ;
* EFFIS publie ensuite un périmètre brûlé ;
* une source officielle confirme l’événement.

---

# 5. Utiliser Copernicus EFFIS

EFFIS complète FIRMS avec :

* les feux actifs ;
* les indices météorologiques de danger ;
* les périmètres de surfaces brûlées ;
* les statistiques européennes.

EFFIS reprend notamment les anomalies thermiques FIRMS. Les couches de feux actifs sont actualisées plusieurs fois par jour, généralement quelques heures après l’acquisition satellitaire. La résolution des détections VIIRS est d’environ 375 mètres. ([Copernicus Emergency Management][10])

Les périmètres de surfaces brûlées peuvent être récupérés sous forme de données géographiques, notamment en Shapefile ou en base SpatiaLite selon les couches disponibles. ([Copernicus Emergency Management][11])

EFFIS doit être utilisé pour :

```text
FIRMS  → détection précoce par points
EFFIS  → confirmation spatiale et périmètre brûlé
BDIFF  → archivage français consolidé
```

---

# 6. Obtenir les archives historiques

## 6.1 Archives satellitaires FIRMS

FIRMS permet de télécharger les données plus anciennes en CSV, JSON ou Shapefile.

Couverture disponible :

* MODIS depuis novembre 2000 ;
* VIIRS S-NPP depuis janvier 2012 ;
* VIIRS NOAA-20 depuis avril 2018 ;
* VIIRS NOAA-21 depuis janvier 2024 ;
* certaines données Landsat à 30 mètres depuis juin 2022.

Les données récentes sont d’abord diffusées en quasi-temps réel, puis remplacées ultérieurement par des données scientifiques consolidées. ([NASA-FIRMS][12])

Procédure :

1. télécharger les archives France ou Europe ;
2. charger les fichiers dans QGIS ;
3. sélectionner les points qui intersectent `zone_aigoual_coeur` ;
4. exporter un CSV annuel ;
5. regrouper les points proches en événements probables.

Attention : plusieurs points peuvent correspondre au même incendie.

## 6.2 Base nationale BDIFF

La BDIFF est la source française de référence pour les incendies de forêt consolidés. Les données nationales sont disponibles depuis 2006, avec des séries plus anciennes dans plusieurs départements méditerranéens. Les recherches peuvent être filtrées par département, commune, dates et surfaces, puis téléchargées en CSV. ([data.gouv.fr][13])

Pour votre périmètre, il faut réaliser deux extractions :

```text
Extraction 1 :
les 15 communes de la communauté de communes

Extraction 2 :
toutes les autres communes intersectant la ZNIEFF 910011858
```

Comme la BDIFF localise souvent l’événement à la commune, elle ne permet pas toujours de savoir si le feu était exactement à l’intérieur du massif. Il faudra donc attribuer un niveau de précision :

```text
précision = commune
précision = coordonnées
précision = périmètre
```

## 6.3 Archives EFFIS

Les périmètres EFFIS sont particulièrement utiles pour reconstituer :

* la surface brûlée ;
* la localisation réelle ;
* la progression spatiale ;
* les feux dépassant les limites communales.

Pour les données non directement proposées au téléchargement, EFFIS prévoit également une procédure de demande de données historiques. ([Copernicus Emergency Management][11])

---

# 7. Fréquence de collecte recommandée

| Information                |                                      Fréquence | Usage                                 |
| -------------------------- | ---------------------------------------------: | ------------------------------------- |
| Risque officiel du Gard    |                       Tous les jours à 18 h 10 | Réglementation et danger du lendemain |
| Météo des forêts           |                                 Tous les jours | Tendance Gard et Lozère               |
| FIRMS VIIRS                |                          Toutes les 30 minutes | Détections thermiques nouvelles       |
| EFFIS feux actifs          |                        Toutes les 2 à 3 heures | Recoupement FIRMS                     |
| EFFIS surfaces brûlées     |                              Une fois par jour | Périmètres des événements             |
| Communications officielles | Toutes les 15 à 30 minutes en période critique | Confirmation humaine                  |
| BDIFF                      |                              Mensuel ou annuel | Historique consolidé                  |

Interroger FIRMS toutes les 30 minutes ne signifie pas qu’une nouvelle image satellitaire est disponible toutes les 30 minutes. Cela permet simplement de récupérer rapidement une nouvelle détection lorsqu’elle est publiée.

---

# 8. Structure de données finale

Je recommande cinq tables.

```text
zones
- zone_id
- nom
- type : commune, EPCI, massif, tampon
- source
- date_version
- geometry
```

```text
risque_officiel
- date_validite
- date_collecte
- département
- zone_officielle
- niveau
- restrictions
- source
- fichier_brut
```

```text
detections_firms
- identifiant
- date_heure_utc
- satellite
- latitude
- longitude
- confiance
- frp
- position : cœur, proche, veille
- distance_zone_coeur
```

```text
surfaces_brulees
- identifiant_effis
- date_observation
- surface_hectares
- source
- geometry
```

```text
incendies_confirmes
- identifiant_bdiff
- commune
- date_depart
- date_extinction
- surface_hectares
- cause
- niveau_precision
- geometry
```

## Résultat recherché

Le tableau de bord peut ensuite afficher séparément :

```text
DANGER PRÉVU
Niveaux officiels Gard et Météo des forêts

DÉTECTION EN COURS
Points FIRMS et EFFIS

INCENDIE CONFIRMÉ
Information SDIS, préfecture ou commune

SURFACE BRÛLÉE
Périmètre EFFIS

HISTORIQUE
BDIFF + archives FIRMS
```

Il est important de ne jamais présenter automatiquement un point FIRMS comme un incendie confirmé.

Souhaitez-vous que je programme un contrôle quotidien du niveau Gard et une veille FIRMS sur cette zone ?

[1]: https://www.banatic.interieur.gouv.fr/intercommunalite/200034601-cc-causses-aigoual-cevennes "CC Causses Aigoual Cévennes<!-- --> | Base nationale sur l'intercommunalité et autres collectivités"
[2]: https://geo.api.gouv.fr/decoupage-administratif/epcis "API Découpage administratif > EPCI | geo.api.gouv.fr"
[3]: https://www.picto-occitanie.fr/DOC/NATURE_PAYSAGE_BIODIVERSITE/ZNIEFF/znieff_3006-0000.pdf?utm_source=chatgpt.com "ZNIEFF de type II n° 3006-0000 Massif de l'Aigoual et du ..."
[4]: https://www.occitanie.developpement-durable.gouv.fr/IMG/pdf/fr9101371_zsc_massif_aigoual_lingas.pdf?utm_source=chatgpt.com "Massif de l'Aigoual et du Lingas » - FR9101371"
[5]: https://www.risque-prevention-incendie.fr/gard/?fbclid=IwY2xjawLjUeJleHRuA2FlbQIxMABicmlkETBqMmtIcjltUTk2bEhKYm9LAR5iKgQXSX6r3jnAvtDQsgF251PfeU5eTenGs0YNJMOJTqjajZpf98JV5p8EPQ_aem_kslzTFJ_tC4OK_mLKqNtBg "Carte du risque incendie du Gard"
[6]: https://www.risque-prevention-incendie.fr/?utm_source=chatgpt.com "Risque‑prevention-incendie.fr"
[7]: https://firms.modaps.eosdis.nasa.gov/?utm_source=chatgpt.com "NASA | LANCE | FIRMS"
[8]: https://firms.modaps.eosdis.nasa.gov/api/map_key/ "API - Map Key - NASA | LANCE | FIRMS"
[9]: https://firms.modaps.eosdis.nasa.gov/api/area/ "API - Area - NASA | LANCE | FIRMS"
[10]: https://forest-fire.emergency.copernicus.eu/about-effis/technical-background/active-fire-detection "EFFIS - Active Fire Detection"
[11]: https://forest-fire.emergency.copernicus.eu/applications/data-and-services "EFFIS - Data and services"
[12]: https://firms.modaps.eosdis.nasa.gov/download/ "Archive Download - NASA | LANCE | FIRMS"
[13]: https://www.data.gouv.fr/api/1/datasets/r/8b0131fb-977d-40c9-aa7e-33a9d4beaa62 "
			BDIFF :
			Accueil		"
