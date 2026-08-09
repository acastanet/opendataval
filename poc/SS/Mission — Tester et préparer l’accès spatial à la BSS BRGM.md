# Mission — Tester et préparer l’accès spatial à la BSS BRGM

## Objectif

Mettre au point une méthode fiable permettant, à partir de :

- latitude ;
- longitude ;
- rayon en mètres ;

de récupérer la liste des ouvrages de la **Banque du Sous-Sol (BSS) du BRGM** situés à moins de cette distance.

Cas de test obligatoire :

```text
latitude  = 44.06455556
longitude = 3.68302778
```

Nous voulons notamment pouvoir identifier :

- sondages ;
- forages ;
- puits ;
- sources ;
- autres ouvrages BSS ;
- profondeur lorsqu’elle est disponible ;
- identifiant BSS moderne ;
- ancien code BSS ;
- nature de l’ouvrage ;
- coordonnées ;
- distance au point demandé ;
- présence éventuelle d’une coupe/log/document géologique ;
- lien vers la fiche InfoTerre.

L’objectif final sera une route du type :

```text
GET /api/v2/geologie/bss/proches
    ?lat=44.06455556
    &lon=3.68302778
    &rayon=5000
    &limit=20
```

Ne pas implémenter cette route en production avant d’avoir terminé et documenté les tests ci-dessous.

---

# 1. Contraintes

## Ne pas scraper le visualiseur InfoTerre

Utiliser en priorité les services OGC/WFS officiels du BRGM.

Le service à tester est :

```text
https:// + mapsref.brgm.fr/wxs/infoterre/catalogue
```

Service attendu :

```text
WFS 1.1.0
```

Couche attendue :

```text
BSS_TOTAL
```

Mais **ne pas considérer ces valeurs comme définitivement valides avant contrôle du GetCapabilities**.

Le serveur lui-même doit être considéré comme source de vérité.

---

# 2. Ne modifier aucun code applicatif au départ

Commencer par une investigation reproductible.

Créer :

```text
/tmp/brgm-bss-test/
```

Y conserver :

```text
capabilities.xml
describe-bss-total.xml
sample-5km.xml
sample-10km.xml
results.json
README.md
```

Aucune modification de `master` pendant cette phase.

---

# 3. Tester GetCapabilities

Faire une requête WFS :

```text
SERVICE=WFS
VERSION=1.1.0
REQUEST=GetCapabilities
```

Exemple avec curl :

```bash
BRGM_WFS="https://mapsref.brgm.fr/wxs/infoterre/catalogue"

curl -fsSLG "$BRGM_WFS" \
  --data-urlencode "SERVICE=WFS" \
  --data-urlencode "VERSION=1.1.0" \
  --data-urlencode "REQUEST=GetCapabilities" \
  -o /tmp/brgm-bss-test/capabilities.xml
```

Vérifier :

1. HTTP 200 ;
2. XML valide ;
3. présence de `BSS_TOTAL` ;
4. systèmes de coordonnées annoncés ;
5. formats de sortie disponibles ;
6. opérations WFS réellement proposées.

Relever précisément le `Name` complet de la couche.

Il peut éventuellement comporter un namespace.

Ne pas supposer que le typename est exactement `BSS_TOTAL` si le serveur annonce autre chose.

---

# 4. Interroger DescribeFeatureType

À partir du typename réellement trouvé :

```text
SERVICE=WFS
VERSION=1.1.0
REQUEST=DescribeFeatureType
TYPENAME=<typename réel>
```

Sauvegarder la réponse.

Exemple :

```bash
curl -fsSLG "$BRGM_WFS" \
  --data-urlencode "SERVICE=WFS" \
  --data-urlencode "VERSION=1.1.0" \
  --data-urlencode "REQUEST=DescribeFeatureType" \
  --data-urlencode "TYPENAME=BSS_TOTAL" \
  -o /tmp/brgm-bss-test/describe-bss-total.xml
```

Analyser le XSD et dresser la liste complète des attributs.

Identifier notamment, sans deviner les noms :

```text
géométrie
identifiant BSS
ancien identifiant BSS
nature
type d'ouvrage
profondeur
commune
lieu-dit
altitude
coordonnées
état
usage
date
```

Chercher également tout attribut susceptible d’indiquer :

```text
coupe géologique
log géologique
documents disponibles
carottage
mode d'exécution
profondeur atteinte
```

Produire dans le rapport un tableau :

```text
Nom WFS | Type | Signification supposée | Exemple
```

Ne pas renommer les champs avant d’avoir observé des valeurs réelles.

---

# 5. Transformer le point en Lambert-93

Point de test :

```text
EPSG:4326
lon = 3.68302778
lat = 44.06455556
```

Utiliser une bibliothèque SIG fiable, de préférence :

```text
PROJ
pyproj
```

ou la bibliothèque déjà utilisée par OpenDataVal si elle existe.

Valeur approximative attendue :

```text
EPSG:2154

X ≈ 754720 m
Y ≈ 6329743 m
```

Mais recalculer ces valeurs localement : ne pas utiliser les valeurs approximatives comme résultat de référence.

Test Python possible :

```python
from pyproj import Transformer

transformer = Transformer.from_crs(
    "EPSG:4326",
    "EPSG:2154",
    always_xy=True,
)

x, y = transformer.transform(
    3.68302778,
    44.06455556,
)

print(x, y)
```

Documenter la valeur obtenue.

---

# 6. Faire une première recherche dans une BBOX de 5 km

Pour un rayon `r` :

```text
xmin = x - r
ymin = y - r
xmax = x + r
ymax = y + r
```

Pour :

```text
r = 5000 m
```

faire un `GetFeature` WFS sur cette BBOX.

Important :

- utiliser EPSG:2154 ;
- vérifier l’ordre des axes réellement attendu par ce serveur ;
- ne pas supposer le comportement à partir de WFS 1.1.0 ;
- faire un test simple permettant de confirmer que les objets retournés sont bien autour de Val-d'Aigoual.

Requête conceptuelle :

```text
SERVICE=WFS
VERSION=1.1.0
REQUEST=GetFeature
TYPENAME=<typename réel>
SRSNAME=EPSG:2154
BBOX=<xmin>,<ymin>,<xmax>,<ymax>,EPSG:2154
```

Limiter initialement :

```text
MAXFEATURES=500
```

Sauvegarder la réponse brute.

Ne pas exiger GeoJSON si le serveur ne l’annonce pas.

Utiliser le GML natif si nécessaire.

---

# 7. Vérifier manuellement la cohérence spatiale

Sur quelques objets retournés :

1. récupérer leurs coordonnées ;
2. les convertir éventuellement en WGS84 ;
3. vérifier qu’ils se trouvent réellement autour de Val-d'Aigoual ;
4. détecter immédiatement une éventuelle inversion X/Y ou lat/lon.

Cette vérification est obligatoire avant toute poursuite.

---

# 8. Passer de la BBOX au véritable rayon

La BBOX ne donne qu’un carré.

Pour chaque ouvrage retourné, calculer la distance entre :

```text
centre = (x, y)
ouvrage = (x2, y2)
```

avec :

```text
distance_m = sqrt(
    (x2 - x)² +
    (y2 - y)²
)
```

Comme EPSG:2154 est métrique, cette méthode convient pour cette recherche locale.

Ensuite :

```text
garder uniquement distance_m <= rayon_m
```

Puis :

```text
sort distance_m ASC
```

---

# 9. Faire une recherche progressive

Tester successivement :

```text
1 km
2 km
5 km
10 km
20 km
```

Pour chaque rayon enregistrer :

```text
nombre brut dans BBOX
nombre réel dans cercle
distance du plus proche
nature du plus proche
```

Produire par exemple :

```text
rayon   BBOX   cercle   plus proche
1 km      ?       ?       ?
2 km      ?       ?       ?
5 km      ?       ?       ?
10 km     ?       ?       ?
20 km     ?       ?       ?
```

---

# 10. Produire les 20 ouvrages les plus proches

Pour le premier rayon permettant d’obtenir suffisamment de données, sortir les 20 ouvrages les plus proches.

Format demandé :

```json
{
  "centre": {
    "lat": 44.06455556,
    "lon": 3.68302778
  },
  "rayon_m": 10000,
  "count": 0,
  "ouvrages": [
    {
      "rang": 1,
      "distance_m": 0,
      "bss_id": "",
      "ancien_code_bss": "",
      "nature": "",
      "profondeur_m": null,
      "commune": "",
      "x_l93": null,
      "y_l93": null,
      "lon": null,
      "lat": null,
      "raw": {}
    }
  ]
}
```

Conserver temporairement :

```text
raw
```

afin que nous puissions inspecter tous les attributs BRGM avant de définir notre modèle définitif.

---

# 11. Identifier les sondages et carottages

Ne pas considérer :

```text
FORAGE
```

comme synonyme de :

```text
SONDAGE
```

et ne pas considérer :

```text
SONDAGE
```

comme preuve qu’un carottage a été réalisé.

Chercher dans les champs réellement fournis par la BSS les indices concernant :

```text
nature
mode d'exécution
carotté
carottage
coupe
log
documents
profondeur
```

Produire trois sélections séparées :

```text
A. tous les ouvrages les plus proches
B. sondages les plus proches
C. ouvrages possédant le plus d'informations géologiques
```

Si aucun attribut du WFS ne permet d’établir qu’un ouvrage possède une coupe ou un carottage :

```text
NE PAS L'INVENTER.
```

Le signaler explicitement.

---

# 12. Tester la fiche InfoTerre

À partir d’un véritable `bss_id` récupéré dans le WFS, tester l’accès à sa fiche InfoTerre.

Le mécanisme attendu est une fiche basée sur :

```text
ficheinfoterre.brgm.fr
/InfoterreFiche/ficheBss.action
?id=<BSS_ID>
```

Faire le test sur au moins trois ouvrages différents.

Vérifier dans la fiche :

- identifiant ;
- nature ;
- profondeur ;
- localisation ;
- coupe ;
- log géologique ;
- lithologie ;
- stratigraphie ;
- documents associés.

Déterminer également si certaines données sont récupérables de manière structurée ou si elles ne sont visibles que dans la fiche HTML/PDF.

Ne pas mettre en place de scraping massif.

Pour le MVP, le lien vers la fiche officielle peut suffire.

---

# 13. Tester les erreurs et limites du service

Tester :

### Coordonnées invalides

```text
lat=500
lon=500
```

### Rayon nul

```text
rayon=0
```

### Rayon très important

Par exemple :

```text
100 km
```

### Aucun résultat

Trouver un exemple ou simuler le comportement.

### Serveur BRGM indisponible

Vérifier :

- timeout ;
- HTTP 4xx ;
- HTTP 5xx ;
- XML d'erreur OGC ;
- réponse vide.

Ne jamais transformer une panne du BRGM en :

```text
0 ouvrage trouvé
```

Ces deux états doivent rester distincts.

---

# 14. Proposition d'API OpenDataVal

Seulement après validation des tests, proposer :

```text
GET /api/v2/geologie/bss/proches
```

Paramètres :

```text
lat      obligatoire
lon      obligatoire
rayon    optionnel, défaut 5000 m
limit    optionnel, défaut 20
nature   optionnel
```

Exemples conceptuels :

```text
?lat=44.06455556
&lon=3.68302778
&rayon=5000
```

et :

```text
?lat=44.06455556
&lon=3.68302778
&rayon=20000
&nature=SONDAGE
```

---

# 15. Format de réponse cible

```json
{
  "status": "ok",
  "source": "BRGM_BSS",
  "centre": {
    "lat": 44.06455556,
    "lon": 3.68302778
  },
  "rayon_m": 5000,
  "count": 3,
  "ouvrages": [
    {
      "bss_id": "BSS...",
      "ancien_code_bss": "...",
      "distance_m": 481.6,
      "nature": "SONDAGE",
      "profondeur_m": 42.5,
      "commune": "Val-d'Aigoual",
      "position": {
        "lat": 0,
        "lon": 0
      },
      "fiche_infoterre": true
    }
  ]
}
```

Ne pas créer artificiellement de valeurs inexistantes.

Utiliser `null` lorsque le BRGM ne fournit pas l'information.

---

# 16. Architecture

Ne pas mettre cette logique dans le service cartographique.

Il s'agit d'un accès à une donnée métier géologique.

Organisation proposée :

```text
BRGM WFS BSS
      ↓
client BRGM
      ↓
normalisation BSS
      ↓
recherche spatiale
      ↓
API OpenDataVal
      ↓
map-service pour affichage uniquement
```

Le `map-service` reste responsable de la représentation.

Le service géologie/eau reste responsable de l'interrogation et de l'interprétation des données.

---

# 17. Cache

Ne pas introduire de base de données pour le MVP.

Prévoir éventuellement un petit cache HTTP ou mémoire :

```text
clé =
lat arrondie
+ lon arrondie
+ rayon
+ filtre
```

TTL raisonnable :

```text
24 h
```

La BSS n'est pas une donnée temps réel.

Mais ne pas implémenter le cache avant validation du connecteur.

---

# 18. Tests minimaux

Créer des tests pour :

1. transformation EPSG:4326 → EPSG:2154 ;
2. calcul BBOX ;
3. calcul distance ;
4. filtrage cercle ;
5. tri par distance ;
6. parsing de la réponse WFS ;
7. normalisation des champs BSS ;
8. réponse vide ;
9. erreur BRGM ;
10. timeout.

Ajouter un fixture WFS enregistré localement afin que les tests unitaires ne dépendent pas du BRGM.

---

# 19. Ne pas commencer par une intégration UI

Pour cette mission :

```text
PAS de nouvelle page
PAS de nouveau composant MapLibre
PAS de design
PAS de modification du frontend
```

On valide d'abord la donnée.

---

# 20. Livrable attendu avant implémentation

Me fournir un rapport court contenant exactement :

## A. Service

```text
URL WFS réellement fonctionnelle :
version :
typename :
CRS :
formats :
```

## B. Schéma BSS_TOTAL

Tableau des champs importants.

## C. Test Val-d'Aigoual

```text
Point :
44.06455556, 3.68302778
```

Résultats pour :

```text
1 km
2 km
5 km
10 km
20 km
```

## D. Les 10 ouvrages les plus proches

Tableau :

```text
distance
BSS ID
ancien code
nature
profondeur
commune
coupe/log disponible si déterminable
```

## E. Sondage géologique pertinent

Identifier :

```text
le sondage le plus proche
```

et séparément :

```text
l'ouvrage le plus proche possédant une coupe/log géologique exploitable
```

Ne pas confondre ces deux critères.

## F. Fiche InfoTerre

Donner un exemple de fiche réelle et indiquer précisément ce qu'elle apporte en plus du WFS.

## G. Problèmes rencontrés

Notamment :

```text
axis order
namespace WFS
limitation MAXFEATURES
format GML
champ absent
erreur serveur
```

## H. Recommandation

Conclure par une seule décision :

```text
GO
```

ou :

```text
NO-GO
```

pour l'implémentation du connecteur.

---

# Critères de réussite

La mission est réussie uniquement si nous pouvons démontrer avec des réponses BRGM réelles que :

1. `BSS_TOTAL` est effectivement interrogeable ;
2. une BBOX autour d'un GPS retourne les ouvrages locaux ;
3. les coordonnées sont correctement interprétées ;
4. les distances sont calculées correctement ;
5. les ouvrages sont triables par proximité ;
6. un identifiant BSS permet de retrouver sa fiche InfoTerre ;
7. nous savons quels champs sont réellement disponibles ;
8. nous savons si la présence d'une coupe ou d'un carottage peut être déterminée automatiquement.

Ne pas implémenter de contournement fondé sur des données inventées.

Ne pas scraper massivement InfoTerre.

Ne pas intégrer ADES/Hub'Eau dans cette mission : nous testons ici exclusivement **la Banque du Sous-Sol BRGM**.