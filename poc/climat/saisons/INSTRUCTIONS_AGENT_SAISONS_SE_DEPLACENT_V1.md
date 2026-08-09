# Instructions agent de codage — « Les saisons se déplacent » V1

## 0. Statut et objectif

Cette spécification est **validée pour une première implémentation**.

L’objectif est de produire une nouvelle infographie climatique OpenDataVal répondant à la question :

> **Comment les régimes thermiques de l’année se sont-ils déplacés entre le début et la fin des trente dernières années ?**

L’infographie ne représente **pas les saisons météorologiques fixes** (`DJF`, `MAM`, `JJA`, `SON`). Elle représente des **saisons thermiques locales**, calculées à partir de la température du lieu et de seuils relatifs au climat local de référence.

Méthode principale retenue :

- source principale : **ERA5-Land** ;
- variable : **température de l’air à 2 m** ;
- période de référence : **1991–2020** ;
- période étudiée : **1996–2025** ;
- seuil froid local : **T25** ;
- seuil chaud local : **T75** ;
- comparaison principale : **1996–2005** vs **2016–2025** ;
- calcul de quatre transitions thermiques annuelles ;
- médiane décennale + dispersion `P25–P75` ;
- calcul du déplacement en jours ;
- calcul de la durée de l’été thermique ;
- sortie : JSON complet + SVG minimaliste + HTML d’aperçu/documentation.

---

# 1. Principe scientifique

## 1.1 Définition des saisons thermiques locales

La logique reprend les méthodes publiées qui utilisent des seuils thermiques locaux définis par les 25e et 75e percentiles du cycle annuel de température.

```text
HIVER
T < T25

PRINTEMPS
transition ascendante entre T25 et T75

ÉTÉ
T > T75

AUTOMNE
transition descendante entre T75 et T25
```

Les quatre frontières annuelles sont :

```text
spring_start
summer_start
autumn_start
winter_start
```

avec obligatoirement l’ordre :

```text
spring_start < summer_start < autumn_start < winter_start
```

pour le contexte français / hémisphère Nord visé par le projet.

## 1.2 Référence scientifique

Référence principale :

```text
Wang et al. (2021)
Changing Lengths of the Four Seasons by Global Warming
Geophysical Research Letters
DOI: 10.1029/2020GL091753
```

Principe repris :

- seuil local d’été : percentile 75 ;
- seuil local d’hiver : percentile 25 ;
- printemps et automne = périodes de transition ;
- seuils fixes calculés sur une climatologie de référence ;
- lissage du cycle annuel pour limiter les franchissements parasites.

Pour OpenDataVal, la référence est **1991–2020**.

---

# 2. Sources Copernicus

## 2.1 ERA5-Land — source principale

Dataset recommandé :

**ERA5 Land hourly time-series data from 1950 to present**

```text
https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land-timeseries
```

Variable :

```text
2m_temperature
```

Caractéristiques utiles :

```text
couverture : globale
résolution de grille : 0,1° × 0,1°
résolution native : ~9 km
résolution temporelle : horaire
unité source : K
```

Conversion :

```text
T_°C = T_K - 273.15
```

## 2.2 Validation secondaire Copernicus

Dataset :

```text
Climate indicators for Europe from 1940 to 2100
derived from reanalysis and climate projections
```

```text
https://cds.climate.copernicus.eu/datasets/sis-ecde-climate-indicators
```

Ce dataset fournit notamment une logique de saison de croissance basée sur :

```text
5 jours consécutifs avec température moyenne > 5 °C
```

et un retour durable sous 5 °C.

Cette méthode doit servir **uniquement de contrôle secondaire**. Elle ne remplace pas les saisons thermiques T25/T75 dans le visuel principal.

---

# 3. Contraintes OpenDataVal

## 3.1 Climat = contexte, pas résolution de la dalle

La dalle OpenDataVal fait :

```text
100 × 100 m
```

ERA5-Land est beaucoup plus grossier.

Ne jamais afficher :

```text
« température de la dalle 100 × 100 m »
```

Préférer :

```text
« contexte climatique du lieu »
```

ou :

```text
« réanalyse climatique au point de grille associé au lieu »
```

## 3.2 Pas d’appel CDS au chargement de la page

Le traitement doit rester côté serveur :

```text
création / mise à jour de la dalle
        ↓
job climatique serveur
        ↓
cache / stockage des données source
        ↓
calcul Python
        ↓
JSON + SVG
        ↓
snapshot de la dalle
        ↓
page HTML
```

Le navigateur ne doit jamais interroger directement le CDS.

## 3.3 Réutiliser l’existant

Avant tout nouveau téléchargement :

1. inspecter le pipeline Copernicus existant ;
2. vérifier si `2m_temperature` ERA5-Land est déjà stocké ;
3. réutiliser le cache / stockage existant ;
4. créer un nouveau job CDS uniquement si nécessaire.

---

# 4. Périodes

## Référence

```text
1991-01-01 → 2020-12-31
```

Elle sert exclusivement à définir :

```text
climatologie quotidienne
T25
T75
```

Les seuils doivent rester **fixes** pendant toute l’analyse 1996–2025.

Ne jamais recalculer T25/T75 séparément pour chaque décennie.

## Étude

```text
1996 → 2025
```

Uniquement des années civiles complètes.

## Décennies

```text
EARLY  = 1996–2005
MIDDLE = 2006–2015
LATE   = 2016–2025
```

La comparaison visuelle principale porte sur :

```text
EARLY vs LATE
```

La décennie intermédiaire doit être calculée et conservée dans le JSON pour contrôle et extensions futures.

---

# 5. Préparation de la série ERA5-Land

## 5.1 Entrée horaire

Pour chaque timestamp :

```text
time
2m_temperature
```

Conserver aussi :

```text
source_dataset
dataset_version
retrieved_at
grid_lat
grid_lon
tile_lat
tile_lon
distance_to_grid_point
spatial_resolution
```

## 5.2 Température quotidienne

Calcul :

```text
daily_mean = moyenne arithmétique des valeurs horaires du jour UTC
```

Ne pas utiliser le minimum ou le maximum quotidien.

## 5.3 Complétude

Une journée est valide si elle possède :

```text
>= 18 valeurs horaires valides sur 24
```

Sinon :

```text
daily_mean = missing
```

Une année est exploitable si :

```text
>= 98 % des jours attendus sont valides
```

Sinon :

```text
status = insufficient_data
```

Interpolation autorisée uniquement pour de petites lacunes isolées utilisées par le lissage :

```text
gap <= 2 jours consécutifs
```

Toute valeur interpolée doit être signalée dans les diagnostics.

---

# 6. Années bissextiles

Supprimer le :

```text
29 février
```

pour les calculs saisonniers.

Toutes les années deviennent :

```text
365 jours
```

Créer des fonctions uniques et testées :

```python
date_to_noleap_doy(date) -> int       # 1..365
noleap_doy_to_month_day(doy) -> str   # MM-DD
```

Ne pas disperser cette logique.

---

# 7. Construction du climat local de référence

## 7.1 Climatologie quotidienne 1991–2020

Pour chaque jour du calendrier sans 29 février :

```text
DOY = 1..365
```

calculer :

```text
climatology[doy]
= moyenne de la température quotidienne
  de ce même jour sur 1991–2020
```

Résultat :

```text
365 valeurs
```

## 7.2 T25 et T75

Calculer sur les **365 valeurs de cette climatologie quotidienne** :

```text
T25 = percentile 25(climatology)
T75 = percentile 75(climatology)
```

Fixer explicitement la méthode NumPy :

```python
np.percentile(values, 25, method="linear")
np.percentile(values, 75, method="linear")
```

Ne pas laisser le choix implicite.

## 7.3 Stockage

Le JSON final doit conserver :

```json
{
  "thresholds": {
    "reference_period": "1991-2020",
    "t25_c": null,
    "t75_c": null,
    "percentile_method": "linear"
  }
}
```

Les valeurs réelles doivent venir du pipeline.

---

# 8. Lissage de chaque année

## 8.1 Objectif

Éviter que des fluctuations synoptiques de quelques jours créent artificiellement plusieurs changements de saison.

## 8.2 Méthode V1

Pour rester proche de la méthode publiée, utiliser un :

```text
polynôme de degré 3
```

sur la séquence annuelle quotidienne.

Entrée :

```text
x = 1..365
y = daily_mean_temperature
```

Calcul conceptuel :

```python
coefficients = np.polyfit(x, y, deg=3)
smoothed = np.polyval(coefficients, x)
```

Le polynôme sert uniquement à déterminer les **dates de franchissement**.

Il ne remplace jamais les données physiques sources dans les autres parties du produit.

## 8.3 Diagnostics

Conserver pour chaque année :

```text
fit_rmse_c
nombre de jours valides
nombre de jours interpolés
coefficients du polynôme
```

---

# 9. Détection des quatre transitions

Soit :

```text
S[d] = température lissée du jour d
```

## Croisement ascendant

Pour un seuil `T` :

```text
S[d-1] < T
S[d] >= T
```

## Croisement descendant

```text
S[d-1] >= T
S[d] < T
```

## Frontières

```text
spring_start = franchissement ascendant de T25
summer_start = franchissement ascendant de T75
autumn_start = franchissement descendant de T75
winter_start = franchissement descendant de T25
```

## Ordre obligatoire

```text
1 <= spring_start
spring_start < summer_start
summer_start < autumn_start
autumn_start < winter_start
winter_start <= 365
```

Sinon :

```text
status = invalid_crossings
```

Ne jamais inventer une frontière.

---

# 10. Interpolation précise du crossing

Interpoler entre les deux jours encadrant le seuil :

```text
fraction = (T - S[d-1]) / (S[d] - S[d-1])
crossing = (d - 1) + fraction
```

Conserver :

```text
crossing_doy_float
```

pour les calculs.

Pour l’affichage seulement :

```text
arrondi au jour le plus proche
```

Toutes les statistiques décennales doivent être calculées avant arrondi.

---

# 11. Durées annuelles

Utiliser des intervalles semi-ouverts.

## Printemps

```text
spring_length = summer_start - spring_start
```

## Été

```text
summer_length = autumn_start - summer_start
```

## Automne

```text
autumn_length = winter_start - autumn_start
```

## Hiver

L’hiver traverse le 31 décembre :

```text
winter_length
= (365 - winter_start) + spring_start_next_year
```

Donc, pour la dernière année dont le printemps suivant n’est pas disponible :

```text
winter_length = null
```

Ne jamais fabriquer la durée.

---

# 12. Agrégation décennale

Pour chaque décennie :

```text
1996–2005
2006–2015
2016–2025
```

et pour chaque frontière :

```text
spring_start
summer_start
autumn_start
winter_start
```

calculer :

```text
P25
médiane
P75
```

avec la même méthode percentile explicite.

Même chose pour :

```text
spring_length
summer_length
autumn_length
winter_length
```

lorsque disponible.

---

# 13. Déplacement entre les deux décennies principales

Définir :

```text
shift_days
= median_doy_2016_2025
- median_doy_1996_2005
```

Interprétation constante :

```text
shift < 0 → plus tôt
shift > 0 → plus tard
```

Ne jamais inverser le signe selon la saison.

La couche éditoriale transforme :

```text
−12 → 12 jours plus tôt
+17 → 17 jours plus tard
```

---

# 14. Durée de l’été thermique

Pour chaque année :

```text
summer_length = autumn_start - summer_start
```

Pour chaque décennie :

```text
median_summer_length
P25_summer_length
P75_summer_length
```

Comparaison principale :

```text
summer_length_change
= median(2016–2025)
- median(1996–2005)
```

Cette valeur devient l’indicateur signature :

```text
Été thermique
+XX jours
```

ou :

```text
Été thermique
−XX jours
```

---

# 15. Variabilité à représenter

Pour chaque frontière décennale :

```text
P25 ─── médiane ─── P75
```

La zone `P25–P75` représente la **dispersion interannuelle**.

Ne jamais écrire :

```text
intervalle de confiance
```

Préférer :

```text
intervalle interquartile
```

ou :

```text
variabilité d’une année à l’autre
```

---

# 16. SVG principal — contenu

Le titre de section est porté par l’HTML :

```text
Les saisons se déplacent
```

Phrase HTML :

```text
Le rythme thermique de l’année n’est plus le même.
```

Le SVG doit rester minimaliste.

Il doit montrer :

```text
JAN FÉV MAR AVR MAI JUN JUL AOÛ SEP OCT NOV DÉC

1996–2005  [HIVER][PRINTEMPS][ÉTÉ][AUTOMNE][HIVER]
2016–2025  [HIVER][PRINTEMPS][ÉTÉ][AUTOMNE][HIVER]
```

avec :

- frontières médianes ;
- zones P25–P75 ;
- déplacements en jours ;
- indicateur `Été thermique ±XX jours` à droite.

---

# 17. Axe temporel

Axe horizontal réel :

```text
1 janvier → 31 décembre
```

Afficher :

```text
JAN FÉV MAR AVR MAI JUN JUL AOÛ SEP OCT NOV DÉC
```

Les positions doivent être proportionnelles aux jours de l’année.

Ne pas utiliser douze blocs artificiellement égaux si le renderer dispose d’un axe en DOY.

---

# 18. Bandes saisonnières

Deux bandes :

```text
1996–2005
2016–2025
```

Hauteur desktop recommandée :

```text
32–40 px
```

Aucun arrondi :

```text
rx = 0
ry = 0
```

Aucun espace entre saisons d’une même bande.

Couleurs V1 :

```text
hiver       #527FA0
printemps   #A8C29A
été         #D66A4A
automne     #C79B57
```

Les mêmes couleurs doivent être utilisées dans les deux décennies.

Elles codent une **catégorie saisonnière**, pas une intensité.

---

# 19. Frontières et P25–P75

Pour chaque transition :

- rectangle semi-transparent entre P25 et P75 ;
- ligne verticale de médiane.

Style recommandé :

```text
IQR opacity : 0.18–0.25
median line : 1.5–2 px
```

La zone doit rester lisible sans masquer la couleur de saison.

---

# 20. Annotations de déplacement

Afficher les quatre décalages sous ou entre les bandes.

Deux formats à tester :

```text
−12 j
−14 j
+13 j
+12 j
```

ou :

```text
12 j plus tôt
14 j plus tôt
13 j plus tard
12 j plus tard
```

Retenir la variante la plus lisible après comparaison visuelle.

Ne pas ajouter de longues phrases dans le SVG.

---

# 21. Bloc signature à droite

Afficher uniquement :

```text
Été thermique
+XX jours
```

Puis en petit :

```text
1996–2005 → 2016–2025
```

Ne pas surcharger ce bloc avec d’autres métriques.

---

# 22. HTML explicatif

## Bloc « Comment lire »

Texte recommandé :

> Les saisons représentées ici sont thermiques, et non les saisons calendaires fixes. Les seuils froid et chaud sont propres au climat du lieu et sont calculés à partir des 25e et 75e percentiles du cycle thermique de référence 1991–2020.

Puis :

> La ligne centrale de chaque transition représente la date médiane de la décennie ; la zone autour indique l’intervalle interquartile P25–P75, c’est-à-dire la variabilité d’une année à l’autre.

## Bloc « Données »

Afficher :

```text
Source : ERA5-Land
Variable : température de l’air à 2 m
Référence : 1991–2020
Période étudiée : 1996–2025
Résolution : grille 0,1° ; résolution native ~9 km
```

## Limite spatiale

Afficher :

> La dalle 3D localise le lieu ; les données climatiques proviennent d’une maille de réanalyse plus large et ne décrivent pas le climat à 100 m de résolution.

---

# 23. JSON de sortie

Créer :

```text
thermal-seasons.json
```

Schéma recommandé :

```json
{
  "schema_version": "1.0",
  "tile": {
    "tile_id": "...",
    "lat": null,
    "lon": null
  },
  "source": {
    "dataset": "ERA5-Land",
    "variable": "2m_temperature",
    "grid_lat": null,
    "grid_lon": null,
    "grid_resolution_deg": 0.1,
    "native_resolution_km": 9,
    "retrieved_at": null
  },
  "periods": {
    "reference": [1991, 2020],
    "study": [1996, 2025],
    "early": [1996, 2005],
    "middle": [2006, 2015],
    "late": [2016, 2025]
  },
  "thresholds": {
    "t25_c": null,
    "t75_c": null,
    "percentile_method": "linear"
  },
  "method": {
    "daily_aggregation": "hourly_mean_utc",
    "leap_day": "removed",
    "smoothing": "polynomial_degree_3",
    "crossing_interpolation": "linear"
  },
  "annual": [
    {
      "year": 1996,
      "status": "ok",
      "spring_start_doy": null,
      "summer_start_doy": null,
      "autumn_start_doy": null,
      "winter_start_doy": null,
      "spring_length_days": null,
      "summer_length_days": null,
      "autumn_length_days": null,
      "winter_length_days": null,
      "fit_rmse_c": null
    }
  ],
  "decades": {
    "1996-2005": {},
    "2006-2015": {},
    "2016-2025": {}
  },
  "comparison": {
    "spring_start_shift_days": null,
    "summer_start_shift_days": null,
    "autumn_start_shift_days": null,
    "winter_start_shift_days": null,
    "summer_length_change_days": null
  },
  "validation": {},
  "quality": {}
}
```

Ne jamais remplir un champ impossible à calculer avec `0`.

Utiliser :

```text
null
```

avec un statut explicite.

---

# 24. Validation secondaire « saison >5 °C »

Calculer séparément un indicateur QA inspiré de Copernicus.

## Début

Premier épisode de :

```text
5 jours consécutifs
```

avec :

```text
température moyenne quotidienne > 5 °C
```

## Fin

Premier épisode ultérieur de :

```text
5 jours consécutifs
```

avec :

```text
température moyenne quotidienne < 5 °C
```

Conserver :

```text
growing_season_start
growing_season_end
growing_season_length
```

sous :

```json
"validation": {}
```

Ne pas les afficher dans le SVG V1.

---

# 25. QA scientifique

Pour chaque année valide :

```text
spring < summer < autumn < winter
```

obligatoire.

Vérifier :

```text
T25 < T75
```

et :

```text
spring_length > 0
summer_length > 0
autumn_length > 0
```

Le lissage doit permettre de retrouver un ensemble cohérent de franchissements.

Sinon :

```text
invalid_crossings
```

Une année atypique ne doit pas être supprimée parce qu’elle est inhabituelle.

Elle doit être rejetée uniquement si :

- données insuffisantes ;
- calcul impossible ;
- ordre saisonnier invalide.

---

# 26. Tests unitaires obligatoires

## Test 1 — cycle annuel parfait

Entrée :

```text
sinusoïde annuelle
```

Attendu :

- 4 frontières cohérentes ;
- ordre correct ;
- durées positives.

## Test 2 — cycle réchauffé

Ajouter :

```text
+2 °C
```

avec les mêmes seuils fixes.

Attendu :

- début été plus tôt ;
- fin été plus tard ;
- durée été supérieure.

## Test 3 — bruit quotidien

Ajouter du bruit court terme.

Attendu :

- pas de croisements parasites ;
- transitions stables.

## Test 4 — année bissextile

Inclure le 29 février.

Attendu :

```text
365 jours après normalisation
```

## Test 5 — données manquantes

Créer :

- 1 jour manquant ;
- 2 jours consécutifs ;
- 10 jours consécutifs.

Vérifier la politique d’interpolation / rejet.

## Test 6 — T25/T75

Fixture connue.

Vérifier exactement :

```text
T25
T75
```

## Test 7 — statistiques décennales

Fixture de 10 dates connues.

Vérifier :

```text
P25
médiane
P75
shift
```

---

# 27. Tests de non-régression

Une fois le premier résultat réel validé, figer :

```text
thermal-seasons-fixture.json
```

Les futures modifications de rendu ne doivent pas modifier les résultats scientifiques.

Séparer strictement :

```text
calcul
```

et :

```text
rendu
```

---

# 28. Tests visuels

Produire :

```text
1920 px
1440 px
1280 px
768 px
390 px
```

Vérifier :

- deux bandes clairement comparables ;
- axe des mois aligné ;
- aucun arrondi ;
- aucune coupure entre saisons d’une même bande ;
- zones P25–P75 lisibles ;
- médianes visibles ;
- aucune collision d’annotation ;
- `Été thermique ±XX jours` lisible ;
- aucun scroll horizontal desktop.

---

# 29. Accessibilité SVG

Ajouter :

```xml
role="img"
aria-labelledby="thermal-seasons-title thermal-seasons-desc"
```

avec :

```xml
<title id="thermal-seasons-title">
Les saisons thermiques se déplacent
</title>
```

Le `<desc>` doit résumer les résultats réels.

Gabarit :

```text
Comparaison des saisons thermiques médianes de 1996–2005
et de 2016–2025. Les bandes montrent hiver, printemps,
été et automne ; les zones autour des frontières représentent
la dispersion interquartile des dates de transition.
```

Ne pas injecter de valeurs fictives dans le `<desc>`.

---

# 30. Séparation calcul / rendu

Structure logique recommandée :

```text
climate/
  thermal_seasons/
    data.py
    reference.py
    smoothing.py
    crossings.py
    aggregate.py
    validate.py
    schema.py
    render_svg.py
    render_html.py
    tests/
```

Adapter à l’architecture existante du repo si une structure équivalente existe déjà.

Responsabilités :

## `data.py`

- lecture cache ERA5-Land ;
- température quotidienne ;
- métadonnées source.

## `reference.py`

- climatologie 1991–2020 ;
- T25 ;
- T75.

## `smoothing.py`

- polynomial fit degré 3 ;
- RMSE.

## `crossings.py`

- franchissements ;
- interpolation ;
- validation ordre.

## `aggregate.py`

- durées ;
- P25 / médiane / P75 ;
- shifts.

## `validate.py`

- QA ;
- contrôle secondaire >5 °C.

## `schema.py`

- JSON ;
- version du schéma.

## `render_svg.py`

- aucune logique scientifique.

## `render_html.py`

- preview ;
- explications ;
- provenance.

---

# 31. Dépendances Python

Privilégier les dépendances déjà présentes.

Si disponibles :

```text
numpy
pandas
xarray
matplotlib
```

Ne pas ajouter une bibliothèque lourde uniquement pour ce calcul.

---

# 32. Livrables attendus

Au minimum :

```text
thermal-seasons.json
thermal-seasons.svg
thermal-seasons-preview.html
THERMAL_SEASONS_METHOD.md
```

Tests :

```text
test_thermal_seasons_reference.py
test_thermal_seasons_crossings.py
test_thermal_seasons_aggregate.py
test_thermal_seasons_schema.py
test_thermal_seasons_render.py
```

Captures :

```text
captures/
  thermal-seasons-1920.png
  thermal-seasons-1440.png
  thermal-seasons-1280.png
  thermal-seasons-768.png
  thermal-seasons-390.png
```

---

# 33. Documentation `THERMAL_SEASONS_METHOD.md`

Documenter précisément :

1. objectif ;
2. source ERA5-Land ;
3. résolution ;
4. période de référence ;
5. température quotidienne ;
6. suppression du 29 février ;
7. climatologie quotidienne ;
8. calcul T25/T75 ;
9. lissage polynomial ;
10. détection des frontières ;
11. interpolation des crossings ;
12. durées ;
13. P25 / médiane / P75 ;
14. comparaison décennale ;
15. validation >5 °C ;
16. limites scientifiques ;
17. provenance ;
18. versions du dataset et du pipeline.

---

# 34. Limites scientifiques à afficher

## Réanalyse

ERA5-Land est une réanalyse, pas une station installée sur la dalle.

## Relief local

En montagne, notamment :

- altitude ;
- exposition ;
- topographie ;
- inversions ;
- couvert végétal

peuvent créer un microclimat différent de celui de la maille ERA5-Land.

## Saisons thermiques

Les saisons T25/T75 sont une **construction analytique climatique**.

Elles ne sont :

- ni astronomiques ;
- ni les saisons météorologiques fixes ;
- ni une mesure phénologique directe.

Employer explicitement :

```text
saisons thermiques
```

## P25–P75 décennal

La bande P25–P75 représente la dispersion des années de la décennie.

Elle ne mesure pas l’incertitude du modèle ERA5-Land.

---

# 35. Critères d’acceptation V1

La fonctionnalité est validée si :

- [ ] données ERA5-Land réelles ;
- [ ] aucune valeur fictive ;
- [ ] référence exactement 1991–2020 ;
- [ ] période 1996–2025 ;
- [ ] T25/T75 calculés une seule fois sur la référence ;
- [ ] 29 février retiré ;
- [ ] température quotidienne = moyenne horaire ;
- [ ] lissage polynomial degré 3 ;
- [ ] quatre frontières annuelles ;
- [ ] ordre `spring < summer < autumn < winter` validé ;
- [ ] crossing interpolé ;
- [ ] durées annuelles calculées ;
- [ ] P25 / médiane / P75 par décennie ;
- [ ] comparaison 1996–2005 vs 2016–2025 ;
- [ ] changement de durée de l’été calculé ;
- [ ] 2006–2015 présent dans le JSON ;
- [ ] validation secondaire >5 °C ;
- [ ] SVG sans logique scientifique ;
- [ ] HTML porte les explications ;
- [ ] résolution spatiale présentée comme contexte ;
- [ ] aucune requête CDS dans le navigateur ;
- [ ] tests scientifiques réussis ;
- [ ] tests responsive réussis ;
- [ ] schéma JSON versionné ;
- [ ] documentation méthodologique produite.

---

# 36. Ordre d’exécution demandé

## Étape 1 — audit

Inspecter :

- pipeline Copernicus existant ;
- cache ERA5-Land ;
- structures JSON existantes ;
- renderer climatique actuel.

Ne pas coder avant d’identifier les briques réutilisables.

## Étape 2 — fixture réelle

Utiliser une dalle déjà traitée par le pipeline climatique.

## Étape 3 — température quotidienne

Implémenter et tester :

```text
hourly → daily_mean
```

## Étape 4 — référence

Implémenter :

```text
climatology
T25
T75
```

## Étape 5 — saisons annuelles

Implémenter :

```text
polynomial smoothing
crossings
interpolation
durations
quality checks
```

## Étape 6 — agrégation décennale

Implémenter :

```text
P25
median
P75
shifts
summer_length_change
```

## Étape 7 — validation secondaire

Implémenter :

```text
growing season >5 °C
```

## Étape 8 — JSON

Produire :

```text
thermal-seasons.json
```

## Étape 9 — SVG

Créer le visuel minimal.

## Étape 10 — HTML

Créer :

- titre ;
- phrase de synthèse ;
- SVG ;
- « Comment lire » ;
- données ;
- méthode ;
- résolution.

## Étape 11 — tests

Exécuter :

- tests unitaires ;
- QA ;
- non-régression ;
- responsive ;
- validation SVG.

## Étape 12 — livraison

Fournir :

- résultats ;
- fichiers ;
- captures ;
- logs de tests ;
- note courte des limites / problèmes rencontrés.

---

# 37. Non-objectifs V1

Ne pas ajouter dans cette passe :

- UTCI dans le calcul principal ;
- précipitations ;
- humidité du sol ;
- neige ;
- phénologie ;
- événements exceptionnels ;
- projections futures ;
- CMIP ;
- comparaison multi-lieux ;
- refonte générale du pipeline Copernicus.

La V1 doit répondre proprement à une seule question :

> **Le rythme thermique annuel du lieu s’est-il déplacé entre 1996–2005 et 2016–2025, et de combien de jours ?**

---

# 38. Références

## Copernicus ERA5-Land

```text
https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land-timeseries
```

## Copernicus — indicateurs climatiques européens

```text
https://cds.climate.copernicus.eu/datasets/sis-ecde-climate-indicators
```

## Méthode des saisons thermiques locales

```text
Wang et al. (2021)
Changing Lengths of the Four Seasons by Global Warming
Geophysical Research Letters
DOI: 10.1029/2020GL091753
```
