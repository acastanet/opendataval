Oui. Je ferais les trois POC **cumulatifs**, dans un même petit dossier : le POC 2 réutilise intégralement le POC 1, puis le POC 3 ajoute seulement la couche incendie.

EUMETView est bien adapté : son API repose sur les standards OGC WMS/WCS/WFS, et EUMETSAT documente explicitement le téléchargement d'une image récente d'une zone arbitraire par URL WMS. ([EUMETSAT User Portal][1]) Le FCI de Meteosat-12 effectue un balayage du disque complet toutes les 10 minutes, ce qui en fait le bon socle européen pour ce test. ([EUMETSAT User Portal][2])

# Vue d'ensemble

```text
POC 1
GPS
 ↓
EUMETView
 ↓
image satellite récente
 ↓
latest.png


POC 2
GPS
 ↓
image + géoréférencement
 ↓
position du GPS matérialisée
 ↓
located.png + metadata.json


POC 3
GPS
 ↓
image Meteosat-12
 +
Active Fire Monitoring FCI
 ↓
superposition des détections
 ↓
fire-check.png + diagnostic.json
```

L'objectif n'est pas encore de construire un microservice OpenDataVal propre. Il faut d'abord répondre expérimentalement à trois questions.

---

# POC 1 — GPS → image satellite européenne récente

## Question

> **À partir de coordonnées GPS, peut-on obtenir automatiquement une image satellite européenne récente de la zone ?**

C'est le test fondamental.

## Entrée

Une commande :

```bash
python poc1.py 44.0646 3.6830
```

Avec éventuellement :

```bash
python poc1.py 44.0646 3.6830 --radius 50
```

Je prendrais par défaut un rayon de **50 km**, donc environ 100 × 100 km.

À la résolution de Meteosat, cela donne davantage de contexte qu'une image de 5 × 5 km, notamment pour observer ultérieurement un panache.

## Source

Uniquement :

```text
EUMETSAT
    ↓
EUMETView
    ↓
Meteosat-12
    ↓
FCI
```

EUMETView permet via WMS de demander une zone définie par l'utilisateur, d'accéder aux images récentes ou archivées et de choisir le format de sortie. ([EUMETSAT User Portal][3])

## Étape 1 — interroger `GetCapabilities`

Ne pas commencer en codant en dur un identifiant de couche trouvé dans un exemple.

Le premier script doit interroger :

```text
WMS GetCapabilities
```

et rechercher les couches contenant par exemple :

```text
MTG
FCI
RGB
Natural
Colour / Color
```

Créer :

```text
discover_layers.py
```

qui affiche quelque chose comme :

```text
Available FCI image layers:

...
...
...
```

Puis choisir une couche RGB appropriée et conserver son identifiant dans :

```text
config.json
```

Cela évite que le POC dépende d'un nom de couche supposé.

EUMETSAT fournit précisément des notebooks 2026 pour interroger les capacités de l'API et identifier les couches WMS disponibles. ([EUMETSAT User Portal][4])

## Étape 2 — calculer la zone

Créer :

```python
bbox.py
```

Fonction :

```python
bbox_from_point(lat, lon, radius_km)
```

Retour :

```json
{
  "west": 3.05,
  "south": 43.61,
  "east": 4.31,
  "north": 44.51
}
```

Pour le POC, une approximation géographique suffit.

## Étape 3 — récupérer l'image

Créer :

```python
eumetview.py
```

Fonction :

```python
get_image(
    layer,
    bbox,
    width=1024,
    height=1024
)
```

Elle effectue un `GetMap`.

Le serveur doit produire directement :

```text
PNG/JPEG
```

Pas de NetCDF, pas de traitement satellite lourd.

## Étape 4 — prendre l'image la plus récente

Ne pas simplement demander « maintenant ».

Il faut identifier le dernier timestamp effectivement disponible.

Logique :

```text
maintenant
 ↓
chercher dernière observation disponible
 ↓
GetMap(time=T)
 ↓
image
```

Conserver deux temps distincts :

```json
{
  "observation_time": "...",
  "retrieved_at": "..."
}
```

et calculer :

```text
latency_minutes
```

Cette métrique sera importante pour décider ensuite si la solution convient vraiment au suivi des feux.

## Sortie

```text
output/poc1/
├── latest.png
└── metadata.json
```

Exemple :

```json
{
  "source": "EUMETSAT",
  "satellite": "Meteosat-12",
  "instrument": "FCI",
  "lat": 44.0646,
  "lon": 3.6830,
  "radius_km": 50,
  "observation_time": "...",
  "retrieved_at": "...",
  "latency_minutes": 0,
  "layer": "...",
  "bbox": [...]
}
```

## Validation

Le POC 1 est réussi si :

```bash
python poc1.py 44.0646 3.6830
```

produit automatiquement une image sans intervention dans le navigateur.

Tester trois endroits :

```text
Val-d'Aigoual
Marseille
Bordeaux
```

### Ce qu'on mesure

Pour chaque test :

```text
image obtenue        OUI/NON
temps d'observation
temps de récupération
âge de l'image
taille du fichier
erreur éventuelle
```

---

# POC 2 — GPS → image + position exacte du lieu

## Question

> **L'image obtenue peut-elle devenir un véritable objet cartographique rattaché au GPS demandé ?**

C'est beaucoup plus important qu'il n'y paraît.

Une jolie image satellite n'est pas suffisante pour OpenDataVal : il faut savoir **où se trouve exactement le point demandé dans l'image**.

## Réutilisation

On conserve entièrement :

```text
bbox.py
eumetview.py
config.json
```

du POC 1.

On ajoute seulement :

```text
georef.py
render_location.py
poc2.py
```

## Étape 1 — géoréférencer l'image

On connaît :

```text
BBOX
WIDTH
HEIGHT
CRS
```

Il devient donc possible de transformer :

```text
latitude / longitude
```

en :

```text
pixel X / pixel Y
```

dans l'image.

Pour simplifier le premier POC, privilégier une projection WMS permettant une transformation simple, telle qu'EPSG:4326 si la couche sélectionnée la supporte.

Sinon utiliser :

```text
pyproj
```

et effectuer correctement la transformation.

## Étape 2 — matérialiser le GPS

Sur l'image :

```text
        │
        │
────────●────────
        │
        │
```

Ajouter simplement :

* cercle ;
* croix ;
* éventuellement label `GPS`.

Pas besoin de design.

Le centre ne doit pas être « approximativement là ».

Il doit être calculé à partir du géoréférencement.

## Étape 3 — produire deux images

Je conserverais :

```text
raw.png
```

image originale EUMETSAT,

et :

```text
located.png
```

image annotée.

Ainsi, on ne détruit jamais la source originale.

## Étape 4 — petite page HTML

Créer :

```text
viewer.html
```

avec :

```text
Coordonnées
44.0646, 3.6830

Observation satellite
14/08/2026 — XX:XX UTC

Âge
XX minutes

[ IMAGE ]

        ⊕ position demandée
```

Cela suffit pour juger immédiatement l'intérêt du système.

## Sorties

```text
output/poc2/
├── raw.png
├── located.png
├── metadata.json
└── viewer.html
```

Le `metadata.json` ajoute :

```json
{
  "requested_location": {
    "lat": 44.0646,
    "lon": 3.6830
  },
  "image_position": {
    "x": 512,
    "y": 512
  },
  "crs": "...",
  "bbox": [...]
}
```

## Test supplémentaire intéressant

Décaler volontairement la BBOX.

Le GPS ne sera alors plus au centre.

Par exemple :

```text
GPS = Val-d'Aigoual

image :
       ┌─────────────────┐
       │                 │
       │       ●         │
       │                 │
       └─────────────────┘
```

Cela permet de vérifier que l'on effectue réellement une transformation géographique et qu'on ne dessine pas simplement un point au centre de l'image.

## Validation

Le POC 2 est réussi lorsque :

```bash
python poc2.py 44.0646 3.6830
```

donne une image :

* récente ;
* géoréférencée ;
* avec le GPS correctement positionné ;
* avec la date d'observation visible.

---

# POC 3 — GPS → image + détection EUMETSAT d'un feu

C'est là que le projet devient réellement intéressant.

## Question

> **Autour d'un point GPS, EUMETSAT détecte-t-il également une signature compatible avec un feu actif ?**

On ne cherche toujours **pas à faire notre propre IA de reconnaissance d'image**.

On utilise le produit scientifique européen existant.

## Source feu

EUMETSAT dispose d'un produit **FCI Active Fire Monitoring — FIR**. Le produit indique la présence d'un feu dans un pixel et s'appuie notamment sur le canal FCI **IR 3,8 µm**, particulièrement sensible aux points chauds provoqués par les incendies. Le catalogue EUMETSAT expose actuellement les produits FIR en CAP et NetCDF pour MTG. ([EUMETSAT User Portal][5])

Le guide EUMETSAT consacré aux incendies présente également pour MTG des paramètres tels que **Fire Probability**, **Fire Results** et des produits de puissance radiative du feu. ([EUMETSAT User Portal][6])

## Architecture

```text
               GPS
                │
         ┌──────┴──────┐
         ↓             ↓
     FCI IMAGE       FCI FIR
     Meteosat       fire data
         │             │
         └──────┬──────┘
                ↓
        association espace
             + temps
                ↓
          fire-check.png
```

C'est essentiel : les deux informations doivent correspondre approximativement au **même moment**.

---

## Étape 1 — récupérer l'image

Exactement le POC 2.

On obtient :

```text
image time = T
```

par exemple :

```text
08:30 UTC
```

---

## Étape 2 — chercher les détections FIR

Chercher les observations :

```text
bbox du POC
+
intervalle temporel autour de T
```

Par exemple :

```text
T - 10 min
→
T + 10 min
```

### Priorité d'implémentation

Essayer d'abord :

```text
EUMETView WMS/WFS
```

si FIR est directement exposé par les capacités actuelles du service.

Sinon :

```text
EUMETSAT Data Store
        ↓
FCI Active Fire Monitoring
        ↓
CAP ou NetCDF
```

Le produit FIR officiel est bien fourni dans ces deux formats. ([EUMETSAT User Portal][7])

Pour ce POC, **CAP serait à examiner avant NetCDF**, car l'objectif est uniquement d'obtenir des détections localisées, pas de traiter toute une grille scientifique.

---

# Étape 3 — filtrage spatial

Pour chaque détection :

```text
latitude feu
longitude feu
probabilité / résultat
heure
```

calculer :

```text
distance au GPS
```

Puis retenir celles à moins de :

```text
50 km
```

par exemple.

---

# Étape 4 — superposition

Convertir chaque détection en coordonnées pixel.

Afficher :

```text
○ GPS

■ feu détecté
```

Résultat :

```text
┌────────────────────────────────┐
│                                │
│             fumée              │
│          ~~~~~~~~~             │
│                                │
│              ■ FIR             │
│                                │
│          ○ GPS                 │
│                                │
└────────────────────────────────┘
```

À ce stade, **aucune IA**.

C'est simplement la fusion de deux produits EUMETSAT.

---

# Étape 5 — diagnostic machine

Créer :

```json
{
  "status": "fire_detected",
  "location": {
    "lat": 44.0646,
    "lon": 3.683
  },
  "image": {
    "satellite": "Meteosat-12",
    "instrument": "FCI",
    "time": "..."
  },
  "fire": {
    "detected": true,
    "distance_km": 7.4,
    "time": "...",
    "source": "FCI Active Fire Monitoring"
  }
}
```

Prévoir exactement trois états :

```text
FIRE_DETECTED

NO_FIRE_DETECTED

DATA_UNAVAILABLE
```

**Ne jamais confondre les deux derniers.**

`NO_FIRE_DETECTED` signifie :

> le produit n'a pas détecté de feu.

Cela ne signifie pas :

> il n'y a aucun feu.

C'est important compte tenu de la résolution, des nuages, de la taille du feu et des limites intrinsèques de la télédétection.

---

# Étape 6 — tester avec un vrai incendie

Pour le POC 3, attendre qu'un feu survienne près du lieu de développement serait une mauvaise méthode.

Il faut prendre :

### Cas A — feu connu

Un incendie historique récent pour lequel :

```text
date
heure
coordonnées
```

sont connues.

Puis demander l'image EUMETSAT archivée correspondante.

### Cas B — contrôle

Même région :

```text
jour sans incendie
```

### Cas C — feu éloigné

Feu présent dans la BBOX mais loin du GPS.

Cela valide le calcul des distances.

---

# Arborescence finale

Je garderais les trois expériences dans une seule petite base :

```text
poc/eumetsat-image/
│
├── README.md
├── requirements.txt
├── config.json
│
├── src/
│   ├── bbox.py
│   ├── eumetview.py
│   ├── latest.py
│   ├── georef.py
│   ├── fire.py
│   └── render.py
│
├── poc1.py
├── poc2.py
├── poc3.py
│
└── output/
```

Dépendances initiales volontairement limitées :

```text
requests
Pillow
pyproj
```

N'ajouter `xarray/netCDF4` **que si le POC 3 oblige réellement à lire le produit FIR NetCDF**.

---

# Les trois critères GO / NO-GO

| POC   | Question                                                       | GO                                        |
| ----- | -------------------------------------------------------------- | ----------------------------------------- |
| **1** | Peut-on obtenir l'image ?                                      | GPS → PNG automatique                     |
| **2** | Sait-on précisément où elle se trouve ?                        | GPS correctement géoréférencé sur l'image |
| **3** | Peut-on confronter l'image à une détection de feu européenne ? | image + FIR + temps + distance            |

Et je m'arrêterais réellement à chaque étape.

Le **POC 1 ne doit contenir aucun code incendie**.
Le **POC 2 ne doit contenir aucune détection**.
Le **POC 3 ne doit contenir aucune IA de vision**.

Si le POC 3 fonctionne, nous aurons déjà démontré une chaîne européenne particulièrement intéressante :

**coordonnées GPS → observation Meteosat-12 récente → image → géolocalisation → détection FCI Active Fire Monitoring → représentation visuelle.**

C'est seulement ensuite que je passerais au POC 4 : **série des 6 dernières images, soit environ une heure d'observation, pour voir si le signal/panache évolue dans le temps**. Le FCI produit un balayage complet toutes les 10 minutes, ce qui rend précisément ce type de suivi temporel intéressant. ([EUMETSAT User Portal][2])

[1]: https://user.eumetsat.int/resources/user-guides/eumet-view-user-guide?utm_source=chatgpt.com "EUMETView user guide"
[2]: https://user.eumetsat.int/resources/user-guides/mtg-fci-level-1c-data-guide?utm_source=chatgpt.com "MTG FCI level 1c data guide"
[3]: https://user.eumetsat.int/resources/user-guides/eumetview-image-download-by-using-fixed-urls-guide?utm_source=chatgpt.com "EUMETView image download by using fixed URLs guide"
[4]: https://user.eumetsat.int/data-access/eumetview/resources?utm_source=chatgpt.com "EUMETView"
[5]: https://user.eumetsat.int/catalogue/EO%3AEUM%3ADAT%3A0801?utm_source=chatgpt.com "Active Fire Monitoring (CAP) - MTG - 0 degree"
[6]: https://user.eumetsat.int/resources/user-guides/satellite-data-for-fire-management?utm_source=chatgpt.com "Satellite data for fire management"
[7]: https://user.eumetsat.int/resources/user-guides/mtg-fci-l2-fir-data-guide?utm_source=chatgpt.com "MTG FCI L2 FIR data guide"
