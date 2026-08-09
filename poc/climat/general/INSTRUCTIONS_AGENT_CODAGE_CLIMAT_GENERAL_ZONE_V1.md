# Instructions agent de codage — « Le climat de la zone » V1

## 0. Objet

Implémenter le **bloc de présentation générale du climat d’une zone** dans OpenDataVal.

Ce bloc est la **porte d’entrée** de la page climat. Il doit répondre à la question :

> **À quoi ressemble normalement une année climatique dans cette zone ?**

Il précède les infographies d’analyse du changement climatique :

1. **Le climat de la zone** — fonctionnement climatique habituel ;
2. **L’empreinte climatique du lieu** — changements sur 1996–2025 ;
3. **Les saisons se déplacent** — déplacement du calendrier thermique ;
4. **L’eau au fil de l’année** — cycle hydroclimatique ;
5. **Le climat ressenti** — UTCI détaillé, hors de ce chantier.

La V1 demandée ici concerne uniquement **la présentation climatique classique**.

---

# 1. Principe produit

Le composant doit produire un **portrait climatique synthétique d’une zone géographique de taille variable**.

Il ne faut faire **aucune hypothèse fixe sur la taille de la zone**.

La zone peut être :

- un point ;
- une petite emprise ;
- un polygone ;
- un multipolygone ;
- une bbox transformée en polygone.

Le composant doit fonctionner de manière cohérente quelle que soit l’emprise.

Le climat présenté est un **contexte climatique sur grille de réanalyse**.

Ne jamais affirmer que les données sont des mesures réalisées exactement à l’échelle de la zone.

---

# 2. Question éditoriale

La V1 doit permettre de répondre rapidement à :

- quand fait-il le plus froid ?
- quand fait-il le plus chaud ?
- quand pleut-il le plus ?
- la zone possède-t-elle une saison sèche ?
- quelle est la variabilité habituelle d’un mois à l’autre ?
- le gel est-il fréquent ?
- les fortes chaleurs sont-elles fréquentes ?
- la neige joue-t-elle un rôle climatique notable ?
- le climat est-il plutôt humide, sec, venteux ou ensoleillé ?

Le lecteur doit comprendre le **rythme annuel** avant de découvrir les changements récents.

---

# 3. Référence climatologique

Utiliser comme référence principale :

```text
1991–2020
```

Cette période est la normale climatologique standard récente retenue pour toute la page climat OpenDataVal.

La V1 est un **portrait de référence**, pas une analyse de tendance.

Ne pas mélanger dans le même graphique :

```text
1991–2020
```

et :

```text
1996–2005 / 2016–2025
```

Les comparaisons de décennies appartiennent aux autres infographies.

---

# 4. Sources de données

## 4.1 Source principale — ERA5-Land

Utiliser en priorité le pipeline / cache Copernicus déjà présent dans le dépôt.

Variables minimales nécessaires :

```text
2m_temperature
total_precipitation
```

Variables complémentaires recommandées si déjà disponibles ou simples à ajouter :

```text
2m_dewpoint_temperature
surface_solar_radiation_downwards
snowfall
snow_depth
snow_cover
```

Ne pas supposer qu’un nom de variable existe dans le pipeline : vérifier les variables réellement disponibles avant de coder.

## 4.2 Vent

Pour le vent, utiliser les composantes disponibles dans le pipeline :

```text
u10
v10
```

Source selon l’architecture existante :

- ERA5 ;
- ou ERA5-Land si les composantes 10 m y sont déjà récupérées.

Calcul :

```text
wind_speed = sqrt(u10² + v10²)
```

Ne pas ajouter un nouveau téléchargement si le projet possède déjà une source fiable pour ces composantes.

## 4.3 Humidité relative

Si température et point de rosée sont disponibles, dériver l’humidité relative.

Ne pas inventer une humidité si les données nécessaires n’existent pas.

Le calcul doit être isolé dans une fonction testée.

---

# 5. Architecture de traitement

Le navigateur ne doit **jamais interroger directement le CDS**.

Chaîne attendue :

```text
zone
  ↓
résolution de la géométrie
  ↓
sélection des mailles climatiques
  ↓
job / cache Copernicus serveur
  ↓
séries 1991–2020
  ↓
agrégations climatiques
  ↓
climate-overview.json
climate-overview.svg
  ↓
snapshot / page HTML
```

Le calcul climatique est effectué une fois côté serveur puis réutilisé.

---

# 6. Gestion d’une zone de taille variable

C’est une exigence centrale.

## 6.1 Entrée canonique

Le moteur doit accepter conceptuellement :

```json
{
  "geometry": {
    "type": "Polygon",
    "coordinates": []
  }
}
```

ou :

```json
{
  "geometry": {
    "type": "MultiPolygon",
    "coordinates": []
  }
}
```

Un point peut être traité comme cas particulier :

```json
{
  "type": "Point",
  "coordinates": [lon, lat]
}
```

## 6.2 Cas d’un point

Pour un point :

- utiliser le point de grille pertinent selon le comportement du dataset / pipeline ;
- conserver ses coordonnées ;
- conserver la distance entre le point demandé et le point de grille.

## 6.3 Cas d’un polygone

Pour une zone couvrant plusieurs cellules :

1. construire ou récupérer les polygones des cellules intersectées ;
2. calculer leur intersection avec la zone ;
3. calculer le poids spatial de chaque cellule ;
4. agréger les valeurs avec ces poids.

Formule conceptuelle :

```text
w_i = aire(intersection(zone, cellule_i))
      / somme des aires d’intersection
```

Puis pour une variable intensive :

```text
X_zone(t) = Σ w_i × X_i(t)
```

Utiliser des **aires géodésiques ou projetées correctement**, pas des surfaces naïves en degrés.

---

# 7. Règle d’agrégation spatiale selon la variable

## 7.1 Température

Utiliser :

```text
moyenne spatiale pondérée par l’aire
```

## 7.2 Précipitations

La précipitation ERA5-Land est une **hauteur d’eau**, pas un volume.

Pour décrire le climat de la zone :

```text
précipitation_zone = moyenne spatiale pondérée des hauteurs
```

Ne pas sommer les millimètres de plusieurs cellules.

### Option future

Si un volume total reçu sur la zone est souhaité :

```text
volume = hauteur moyenne × aire de la zone
```

mais ce n’est pas nécessaire à la V1.

## 7.3 Vent

Agrégation recommandée :

- agréger `u10` et `v10` spatialement ;
- puis calculer la vitesse résultante ;

ou conserver également la moyenne spatiale des vitesses si besoin.

La méthode choisie doit être explicitement documentée.

## 7.4 Humidité, rayonnement

Moyenne spatiale pondérée par l’aire.

## 7.5 Neige

Traiter selon la nature de la variable :

- couverture : moyenne / fraction surfacique ;
- hauteur / équivalent eau : moyenne pondérée ;
- snowfall : hauteur équivalente moyenne.

---

# 8. Représentativité spatiale

Le JSON doit conserver suffisamment d’information pour répondre à :

> **Sur quelle partie de la grille ce portrait climatique repose-t-il ?**

Conserver :

```text
geometry de la zone
aire de la zone
nombre de cellules utilisées
liste / résumé des cellules
résolution des datasets
surface couverte par chaque cellule
poids spatial de chaque cellule
coordonnées des centres
altitude de la zone si disponible
orographie modèle si disponible
date de récupération
version des datasets
```

## 8.1 Petite zone

Si la zone est nettement plus petite qu’une cellule climatique :

ne pas créer une fausse précision.

Afficher par exemple :

> **La zone est plus petite que la maille climatique utilisée ; les valeurs décrivent son contexte climatique régional.**

## 8.2 Grande zone

Si la zone couvre de nombreuses cellules :

indiquer :

```text
N mailles climatiques agrégées
```

et conserver un indicateur de dispersion spatiale.

---

# 9. Relief et altitude

Dans une zone montagneuse, la moyenne climatique peut masquer des contrastes importants.

Si un MNT ou une altitude de zone existe déjà dans OpenDataVal, conserver :

```text
altitude_min
altitude_mean
altitude_max
```

et comparer si possible avec l’orographie du modèle.

Ne pas appliquer automatiquement un gradient altitudinal pour “corriger” toute la climatologie.

Une éventuelle descente d’échelle doit être un chantier séparé et validé.

---

# 10. Climatogramme principal

Le cœur de la V1 est un **climatogramme annuel enrichi**.

## 10.1 Axe horizontal

Afficher :

```text
JAN FÉV MAR AVR MAI JUN JUL AOÛ SEP OCT NOV DÉC
```

## 10.2 Température

Afficher une courbe de :

```text
température moyenne mensuelle climatologique
```

Calcul :

1. calculer la moyenne mensuelle de chaque année ;
2. faire la moyenne des valeurs mensuelles sur 1991–2020.

Unité :

```text
°C
```

## 10.3 Variabilité de température

Autour de la courbe, afficher une enveloppe légère :

```text
P10–P90
```

calculée à partir des **30 valeurs mensuelles annuelles** de chaque mois.

---

# 11. Précipitations du climatogramme

Afficher des barres mensuelles de :

```text
précipitations moyennes mensuelles 1991–2020
```

Pour chaque année :

```text
cumul du mois
```

puis :

```text
moyenne des 30 cumuls mensuels
```

Unité :

```text
mm/mois
```

Conserver aussi :

```text
P10
P50
P90
```

dans le JSON / tooltip.

---

# 12. Axes du climatogramme

Utiliser deux échelles clairement identifiées :

```text
gauche : température °C
droite : précipitations mm
```

Ne pas utiliser une relation graphique arbitraire de type :

```text
1 °C = 2 mm
```

sauf si une méthode ombrothermique reconnue est explicitement implémentée.

---

# 13. Bloc de valeurs synthétiques

Afficher peu de chiffres.

V1 recommandée :

```text
Température moyenne annuelle
XX.X °C

Précipitations annuelles
XXXX mm

Mois le plus chaud
Août · XX.X °C

Mois le plus froid
Janvier · X.X °C

Mois le plus humide
Novembre · XXX mm

Mois le plus sec
Juillet · XX mm
```

Aucune valeur fictive.

---

# 14. Indicateurs thermiques classiques

Créer des indicateurs annuels à partir des séries quotidiennes.

## 14.1 Jours de gel

Définition V1 :

```text
daily_min_2m_temperature < 0 °C
```

Indicateur :

```text
nombre moyen de jours de gel par an
```

## 14.2 Jours chauds

Définition :

```text
daily_max_2m_temperature >= 30 °C
```

Nom affiché :

> **Jours ≥ 30 °C**

Ne pas utiliser le terme “canicule”.

## 14.3 Nuits tropicales

Définition :

```text
daily_min_2m_temperature >= 20 °C
```

Nom affiché :

> **Nuits ≥ 20 °C**

---

# 15. Indicateurs adaptatifs

Tous les indicateurs ne sont pas utiles partout.

## 15.1 Neige

Si le climat de référence montre un signal neigeux significatif, afficher :

- jours avec neige / couverture neigeuse ;
- ou durée moyenne d’enneigement.

Sinon ne rien afficher.

## 15.2 Fortes chaleurs

Dans les zones où les jours ≥30 °C sont quasiment absents, le bloc peut être masqué.

## 15.3 Gel

Dans une zone sans gel climatologique, ne pas survaloriser un indicateur constamment nul.

L’interface doit être **adaptative au climat**.

---

# 16. Humidité relative

Si l’humidité relative est calculable de façon robuste :

afficher uniquement un résumé simple :

```text
humidité relative moyenne
```

ou un petit profil mensuel.

Ne pas surcharger le climatogramme principal.

---

# 17. Vent

Calculer :

```text
speed = sqrt(u10² + v10²)
```

Indicateurs V1 :

```text
vitesse moyenne annuelle
```

et éventuellement :

```text
mois le plus venteux
```

Pour la direction dominante, ne pas moyenner naïvement les angles.

Si une direction dominante est affichée, utiliser une statistique circulaire basée sur `u/v`.

---

# 18. Rayonnement / ensoleillement

Si `surface_solar_radiation_downwards` est disponible :

calculer un indicateur climatique mensuel ou annuel.

Pour la V1, préférer :

```text
énergie solaire reçue
```

dans l’unité correctement convertie, plutôt que :

```text
heures d’ensoleillement
```

sauf si les heures d’ensoleillement sont calculées selon une méthode documentée.

---

# 19. Structure produit recommandée

Le SVG principal doit contenir :

```text
titre
sous-titre
référence
climatogramme température + précipitations
bloc de 4 à 6 valeurs clés
```

Les indicateurs secondaires peuvent être sous le graphique dans l’HTML.

Le SVG doit rester compact.

---

# 20. Titre et sous-titre

## Titre

```text
Le climat de la zone
```

Si le produit dispose d’un nom de lieu fiable :

```text
Le climat de [nom du lieu]
```

## Sous-titre

> **Le rythme habituel de la température et des précipitations au fil de l’année.**

## Méta

```text
Référence 1991–2020 · données de réanalyse Copernicus
```

---

# 21. Style graphique

Le rendu doit appartenir à la même série que :

- L’empreinte climatique du lieu ;
- Les saisons se déplacent ;
- L’eau au fil de l’année.

## Fond général

```text
#C5C4C1
```

## Texte principal

```text
#24313A
```

## Texte secondaire

```text
#52616A
```

## Blanc chaud

```text
#FBFAF7
```

## Bleu

```text
#2166AC
```

## Rouge chaud

```text
#B2182B
```

## Ombre

```text
#1C2529
```

à faible opacité.

## Police

```text
system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
```

---

# 22. Couleurs du climatogramme

## Température

Utiliser :

```text
#B2182B
```

pour la ligne centrale.

Enveloppe P10–P90 :

- même famille ;
- opacité faible.

## Précipitations

Utiliser :

```text
#2166AC
```

pour les barres.

La première lecture doit être immédiatement :

```text
rouge = température
bleu = précipitations
```

---

# 23. Accessibilité

Le SVG doit contenir :

```xml
role="img"
aria-labelledby="climate-overview-title climate-overview-desc"
<title>
<desc>
```

Le `<desc>` doit être généré à partir des vraies données.

Il doit expliquer au minimum :

- référence 1991–2020 ;
- courbe de température ;
- barres de précipitations ;
- principales valeurs climatiques.

Ne jamais dépendre uniquement de la couleur.

---

# 24. Tooltips

Le tooltip mensuel doit pouvoir afficher :

```text
Juillet · référence 1991–2020

Température moyenne
XX.X °C
P10–P90 : XX.X → XX.X °C

Précipitations
XX mm
P10–P90 : XX → XX mm
```

Si d’autres données sont disponibles :

```text
humidité
vent
rayonnement
```

mais ne pas surcharger.

---

# 25. JSON de sortie

Créer :

```text
climate-overview.json
```

Structure recommandée :

```json
{
  "schema_version": "1.0",
  "zone": {
    "geometry_type": "Polygon",
    "area_m2": null,
    "centroid": {
      "lat": null,
      "lon": null
    }
  },
  "reference": {
    "start": 1991,
    "end": 2020
  },
  "representativity": {
    "datasets": [],
    "grid_cell_count": null,
    "spatial_weighting": "area_weighted",
    "cells": []
  },
  "monthly": [
    {
      "month": 1,
      "temperature_c": {
        "mean": null,
        "p10": null,
        "p50": null,
        "p90": null
      },
      "precipitation_mm": {
        "mean": null,
        "p10": null,
        "p50": null,
        "p90": null
      },
      "relative_humidity_pct": null,
      "wind_speed_ms": null,
      "solar_radiation": null
    }
  ],
  "annual": {
    "mean_temperature_c": null,
    "precipitation_mm": null,
    "warmest_month": null,
    "coldest_month": null,
    "wettest_month": null,
    "driest_month": null,
    "frost_days_mean": null,
    "hot_days_30c_mean": null,
    "tropical_nights_20c_mean": null,
    "snow_indicator": null,
    "wind_speed_mean_ms": null
  },
  "quality": {},
  "provenance": {}
}
```

Utiliser `null` pour une donnée non calculable.

Ne jamais remplacer une donnée absente par `0`.

---

# 26. Provenance

Pour chaque variable, conserver :

```text
dataset
variable source
version
retrieved_at
spatial_resolution
temporal_resolution
aggregation_method
unit_source
unit_output
```

La coexistence de plusieurs datasets est acceptable si elle est explicite.

---

# 27. Qualité des données

Pour chaque année et variable :

- contrôler les timestamps disponibles ;
- détecter les mois incomplets ;
- journaliser les lacunes ;
- ne pas interpoler de longues périodes sans justification.

Pour la normale 1991–2020, documenter combien d’années ont réellement contribué à chaque indicateur.

Le JSON peut contenir :

```text
valid_years
missing_years
completeness_ratio
```

---

# 28. Tests scientifiques

Créer au minimum :

## Test 1 — agrégation spatiale

Avec deux cellules synthétiques :

```text
cell A weight = 0.25
cell B weight = 0.75
```

vérifier la moyenne pondérée.

## Test 2 — précipitations

Vérifier que les millimètres de cellules ne sont pas sommés entre cellules.

## Test 3 — température annuelle

Vérifier le calcul temporel.

## Test 4 — P10/P50/P90

Fixture connue sur 30 années.

## Test 5 — jours de gel

Série quotidienne synthétique.

## Test 6 — jours ≥30 °C

Série synthétique.

## Test 7 — nuits ≥20 °C

Série synthétique.

## Test 8 — vent

Vérifier :

```text
sqrt(u² + v²)
```

## Test 9 — données manquantes

Une donnée absente doit produire :

```text
null
```

et non `0`.

---

# 29. Tests spatiaux

## Point

Vérifier :

- cellule sélectionnée ;
- coordonnées ;
- distance au centre.

## Petite zone

Vérifier :

- intersection correcte ;
- absence de faux downscaling.

## Zone couvrant plusieurs cellules

Vérifier :

- somme des poids ≈ 1 ;
- couverture correcte ;
- agrégation reproductible.

## MultiPolygon

Vérifier que les différentes parties contribuent correctement.

---

# 30. Tests visuels

Créer les captures :

```text
1920 px
1440 px
1280 px
768 px
390 px
```

Vérifier :

- climatogramme immédiatement compréhensible ;
- température et précipitations non ambiguës ;
- labels des mois ;
- axes et unités ;
- valeurs clés ;
- cohérence avec les autres infographies ;
- pas de scroll horizontal desktop ;
- aucun texte tronqué.

---

# 31. Fichiers attendus

Produire au minimum :

```text
climate-overview.json
climate-overview.svg
climate-overview-preview.html
CLIMATE_OVERVIEW_METHOD.md
```

Tests :

```text
test_climate_overview_spatial.py
test_climate_overview_temperature.py
test_climate_overview_precipitation.py
test_climate_overview_indicators.py
test_climate_overview_schema.py
test_climate_overview_render.py
```

Captures :

```text
captures/
  climate-overview-1920.png
  climate-overview-1440.png
  climate-overview-1280.png
  climate-overview-768.png
  climate-overview-390.png
```

---

# 32. Structure de code recommandée

Adapter à l’architecture existante du dépôt.

Structure conceptuelle :

```text
climate/
  overview/
    geometry.py
    data.py
    spatial.py
    daily.py
    monthly.py
    indicators.py
    schema.py
    render_svg.py
    render_html.py
    validate.py
    tests/
```

Le renderer SVG ne doit contenir aucune logique scientifique.

---

# 33. HTML « Comment lire »

Texte court proposé :

> **La courbe rouge montre la température moyenne au fil de l’année ; son halo représente la variabilité habituelle entre 1991 et 2020. Les barres bleues montrent les précipitations mensuelles moyennes. Les valeurs décrivent le contexte climatique de la zone à partir de données de réanalyse sur grille.**

---

# 34. HTML « Représentativité »

Le bloc doit être généré dynamiquement.

Exemple pour une petite zone :

> **Cette zone est plus petite que la maille climatique utilisée ; les valeurs décrivent donc son contexte climatique régional et non une mesure à la résolution exacte de la zone.**

Exemple pour une grande zone :

> **Le portrait climatique agrège N mailles climatiques intersectant la zone, pondérées par leur surface d’intersection.**

---

# 35. HTML « Sources »

Présenter uniquement les sources réellement utilisées.

Exemple :

```text
Température / précipitations : ERA5-Land
Vent : ERA5
Référence climatologique : 1991–2020
Méthode spatiale : moyenne pondérée par surface
```

---

# 36. Adaptation au climat

Le composant ne doit pas remplir une grille fixe d’indicateurs inutiles.

Exemple :

```text
neige absente
→ ne pas afficher une grosse carte “Neige : 0”
```

Même principe pour :

- gel ;
- jours ≥30 °C ;
- nuits tropicales.

Le but est de **caractériser le climat**, pas de remplir des cases.

---

# 37. Ce que la V1 ne doit pas faire

Ne pas intégrer ici :

- l’empreinte 1996–2025 ;
- la comparaison 1996–2005 / 2016–2025 ;
- les saisons T25/T75 ;
- le stock hydrique détaillé ;
- SPEI ;
- UTCI détaillé ;
- projections futures ;
- prévision météo ;
- vigilance météo ;
- événements exceptionnels ;
- données live.

Ces informations appartiennent à d’autres composants.

---

# 38. Critères d’acceptation

La V1 est validée si :

- [ ] une zone de taille variable est acceptée ;
- [ ] Point, Polygon et MultiPolygon sont gérés ou normalisés ;
- [ ] plusieurs cellules sont agrégées par pondération spatiale ;
- [ ] les précipitations ne sont pas additionnées entre cellules ;
- [ ] la référence est exactement 1991–2020 ;
- [ ] le climatogramme contient température et précipitations ;
- [ ] la variabilité P10–P90 est calculée ;
- [ ] les valeurs annuelles principales sont calculées ;
- [ ] les jours de gel sont calculés ;
- [ ] les jours ≥30 °C sont calculés ;
- [ ] les nuits ≥20 °C sont calculées ;
- [ ] les indicateurs adaptatifs ne surchargent pas le rendu ;
- [ ] la représentativité spatiale est documentée ;
- [ ] les sources sont traçables ;
- [ ] le JSON est versionné ;
- [ ] le SVG est autonome et accessible ;
- [ ] la preview HTML est produite ;
- [ ] aucun appel CDS n’a lieu dans le navigateur ;
- [ ] aucune valeur climatique fictive ;
- [ ] aucune taille fixe de zone n’est supposée.

---

# 39. Ordre d’exécution

1. **Auditer le pipeline climatique existant**
2. **Identifier les variables déjà présentes dans le cache**
3. **Normaliser la géométrie de zone**
4. **Implémenter l’intersection avec les cellules**
5. **Implémenter la pondération spatiale**
6. **Construire les séries 1991–2020**
7. **Calculer les normales mensuelles**
8. **Calculer P10/P50/P90**
9. **Calculer les indicateurs annuels**
10. **Produire le JSON**
11. **Créer le climatogramme SVG**
12. **Créer la preview HTML**
13. **Ajouter provenance et représentativité**
14. **Tester sur plusieurs tailles de zones**
15. **Produire captures et rapport de tests**

---

# 40. Cas de recette obligatoires

Tester au minimum trois géométries.

## Cas A — zone très petite

Objectif :

- vérifier le message de représentativité ;
- vérifier qu’aucun downscaling fictif n’est produit.

## Cas B — zone couvrant plusieurs mailles

Objectif :

- vérifier les pondérations ;
- vérifier la moyenne climatique spatiale.

## Cas C — zone montagneuse / hétérogène

Objectif :

- vérifier la provenance ;
- vérifier la dispersion spatiale ;
- vérifier que la moyenne n’est pas présentée comme une mesure uniforme partout.

Le même code doit traiter les trois cas.

---

# 41. Résultat produit attendu

Le lecteur doit comprendre en quelques secondes :

> **quand il fait chaud ou froid, quand il pleut, quelle est la variabilité habituelle et quels phénomènes saisonniers caractérisent le climat de cette zone.**

Cette première infographie établit le **climat de référence**.

Les autres infographies montreront ensuite :

> **ce qui change, quand cela change, comment l’eau réagit et comment le climat est ressenti.**

---

# 42. Références de méthode à conserver dans la documentation

Le travail doit rester cohérent avec les choix documentés dans les recherches et spécifications OpenDataVal :

- référence climatologique 1991–2020 ;
- ERA5-Land pour le climat de surface ;
- séparation claire entre données de réanalyse et observations locales ;
- conservation de la provenance et de la résolution ;
- absence de fausse précision spatiale ;
- distinction entre climat de référence et analyse du changement climatique.

Références externes à mentionner dans `CLIMATE_OVERVIEW_METHOD.md` :

- WMO — Climatological Normals  
  https://wmo.int/wmo-climatological-normals

- Copernicus CDS — ERA5-Land time series  
  https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land-timeseries

- Copernicus CDS — ERA5 single levels, si utilisé pour le vent  
  https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels
