# Sources de données du domaine climat

Statut : **registre P1 consolidé par les décisions P2 — `draft`**.

Ce document relie les sources climatiques aux quatre analyses de la future fiche climat. Les
métadonnées structurées se trouvent dans :

- `sources/datasets.yaml` — jeux de données, variables, usages et statut de vérification ;
- `sources/bibliography.yaml` — documentation officielle, standards et articles scientifiques.

Les calculs complets sont désormais figés en P2 sous `doc/climat/methods/`.

## 1. Règle de lecture

Le domaine climat distingue quatre niveaux :

1. **source** — dataset ou publication externe ;
2. **variable source** — grandeur effectivement extraite ;
3. **méthode OpenDataVal** — calcul déterministe appliqué à cette grandeur ;
4. **restitution** — infographie et commentaire produits à partir du résultat.

Un choix OpenDataVal ne doit jamais être présenté comme une propriété imposée par le dataset.
Inversement, une propriété du dataset ne doit pas être modifiée silencieusement par un service.

## 2. Acquisition : une responsabilité centralisée

Les données Copernicus doivent être acquises côté serveur. Le navigateur ne porte ni clé CDS
ni logique de téléchargement.

`apps/copernicus` reste le point de départ pour :

- secrets CDS ;
- téléchargements ;
- cache ;
- validation de complétude ;
- provenance ;
- relances idempotentes.

Les futurs services scientifiques consommeront un `ClimateSnapshot` ou des actifs déjà acquis.
Ils ne devront pas embarquer quatre clients CDS indépendants.

## 3. Méthode scientifique vs interface d'acquisition

Une décision importante de P2 est de dissocier :

```text
source scientifique : ERA5-Land + variable
```

et :

```text
interface concrète d'acquisition CDS
```

Le produit `reanalysis-era5-land-timeseries` est très pratique pour les POC ponctuels et reste
la source de leurs golden masters. La documentation ECMWF indique toutefois que cette interface
de séries ponctuelles n'est pas recommandée comme dépendance de production stable.

Le futur `apps/copernicus` pourra donc sélectionner un actif ERA5-Land de production différent,
à condition que :

- la variable scientifique soit équivalente ;
- l'agrégation et les unités soient documentées ;
- P5 démontre l'équivalence avec les résultats de référence avant migration.

## 4. Représentativité spatiale

Une réanalyse maillée n'est pas une mesure locale de parcelle.

Le registre conserve séparément :

- coordonnée ou géométrie demandée ;
- point(s) ou maille(s) représentatifs ;
- résolution du produit ;
- règle de sélection ou de pondération.

Les méthodes n'utilisent pas toutes le même modèle spatial :

- `climate-overview` supporte une zone et une pondération surfacique de plusieurs cellules ;
- `climate-fingerprint`, `thermal-seasons` et `water-through-year` sont actuellement fondés
  principalement sur des points de grille associés au lieu.

Le futur `ClimateSnapshot` devra supporter ces deux cas sans fabriquer une précision spatiale
plus fine que les données sources.

## 5. Périodes communes actuelles

Les POC convergent vers :

```text
référence climatologique : 1991–2020
période étudiée          : 1996–2025
première décennie        : 1996–2005
décennie intermédiaire   : 2006–2015
dernière décennie        : 2016–2025
```

`climate-overview` utilise uniquement la référence 1991–2020 car il s'agit d'un portrait du
climat habituel, pas d'une analyse de changement.

## 6. ERA5-Land — température et précipitations

Dataset de référence des POC ponctuels :

```text
reanalysis-era5-land-timeseries
```

Variables :

```text
2m_temperature
total_precipitation
```

Usages :

| Variable | Climate overview | Fingerprint | Thermal seasons |
|---|---|---|---|
| `2m_temperature` | climatologie mensuelle | moyenne annuelle | saisons thermiques |
| `total_precipitation` | climatologie mensuelle | cumul annuel + pluie intense | — |

Les méthodes exactes sont documentées dans leurs dossiers P2.

## 7. Vent de l'empreinte — question P1 résolue

La spécification historique de l'empreinte proposait ERA5 single levels, alors que le fetch V4
utilisait ERA5-Land.

P2 retient :

```text
ERA5-Land time-series
10m_u_component_of_wind
10m_v_component_of_wind
```

La vitesse est dérivée par :

```text
sqrt(u10² + v10²)
```

Le catalogue ERA5-Land expose ces composantes et ce choix correspond au comportement final du
POC V4. Il évite d'introduire une quatrième famille de réanalyse sans nécessité scientifique.

Le vent reste très sensible au relief et aux obstacles ; la valeur de grille ne représente pas
une rafale mesurée localement.

## 8. ERA5-HEAT — UTCI

Dataset de l'empreinte :

```text
derived-utci-historical-timeseries
```

Variable :

```text
universal_thermal_climate_index
```

Usage canonique V4 :

```text
maximum quotidien UTCI
→ P95 annuel
```

Les seuils complémentaires 32 °C et 38 °C sont conservés comme informations descriptives.
Le choix du P95 annuel est une décision OpenDataVal et non une variable pré-calculée par le
catalogue.

## 9. ERA5-Drought — SPEI-3

Dataset :

```text
derived-drought-historical-monthly
```

Variable :

```text
standardised_precipitation_evapotranspiration_index
```

Fenêtre retenue :

```text
3 mois
```

Le dataset est déjà standardisé avec une référence 1991–2020. Les deux infographies qui
l'utilisent construisent ensuite deux métriques différentes :

### Fingerprint

Pour chaque mois de calendrier, calcul d'un P10 sur 1991–2020, puis nombre annuel de mois sous
ce seuil relatif.

### Water through year

Conservation du SPEI-3 mensuel ; pour le résumé décennal, nombre annuel de mois avec :

```text
SPEI-3 < -1
```

Il est volontaire que les deux produits ne donnent pas le même sens au même indicateur dérivé.
Le `method.id/version` devra toujours accompagner le résultat.

## 10. Pluies intenses — question P1 résolue

L'empreinte V4 utilise :

```text
jour humide = précipitation >= 1 mm
seuil = P95 des jours humides 1991–2020
métrique annuelle = nombre de jours strictement au-dessus du seuil
```

Cette logique est inspirée du cadre ETCCDI/Climdex, mais la grandeur principale OpenDataVal
est un **compte de jours**.

Elle ne doit donc pas être appelée :

```text
R95p
R95pTOT
```

qui désignent des indices standards fondés sur la quantité de précipitation au-dessus du seuil.

## 11. ERA5-Land monthly means — eau

Dataset :

```text
reanalysis-era5-land-monthly-means
product_type = monthly_averaged_reanalysis
```

Variables principales :

```text
total_precipitation
volumetric_soil_water_layer_1
volumetric_soil_water_layer_2
volumetric_soil_water_layer_3
total_evaporation
```

### Conversion des accumulations — question P1 résolue

La documentation ECMWF confirme que, dans le flux de moyennes mensuelles de moyennes
quotidiennes (`moda`), les variables hydrologiques accumulées sont exprimées en mètres d'eau
équivalente **par jour**.

Le cumul mensuel est donc :

```text
value × 1000 × days_in_month
```

La logique du POC `water-through-year` est conservée.

### Évaporation — convention de signe

ECMWF utilise le flux vertical descendant positif. L'évaporation sortante est généralement
négative. Le produit OpenDataVal affiche donc positivement :

```text
actual_evapotranspiration = -total_evaporation
```

### Stock 0–100 cm

Les trois premières couches ERA5-Land correspondent aux profondeurs :

```text
0–7 cm
7–28 cm
28–100 cm
```

OpenDataVal construit :

```text
1000 × (0,07×θ1 + 0,21×θ2 + 0,72×θ3)
```

Cette grandeur est un stock d'eau **modélisé et dérivé**. Elle n'est ni réserve utile, ni eau
disponible pour les plantes, ni mesure d'une nappe.

## 12. Climate overview — extrêmes thermiques P1 résolus par exclusion

La définition souhaitée était :

```text
jour de gel       : Tmin < 0 °C
jour >= 30 °C     : Tmax >= 30 °C
nuit >= 20 °C     : Tmin >= 20 °C
```

Le POC peut cependant approximer ces indicateurs à partir de températures moyennes quotidiennes.
Cela ne respecte pas leur définition physique.

Décision P2 :

> ces trois compteurs ne font pas partie du noyau canonique de `climate-overview@1.0.0` tant
> qu'ils ne sont pas calculés à partir de vrais minima/maxima quotidiens.

Le noyau V1 reste donc température mensuelle, précipitations mensuelles et représentativité
spatiale.

## 13. Tableau source → infographie

| Source | Overview | Fingerprint | Seasons | Water |
|---|:---:|:---:|:---:|:---:|
| ERA5-Land température | ✓ | ✓ | ✓ | — |
| ERA5-Land précipitations | ✓ | ✓ | — | ✓ |
| ERA5-Land vent u/v | — | ✓ | — | — |
| ERA5-Land humidité du sol | — | — | — | ✓ |
| ERA5-Land évaporation | — | — | — | ✓ |
| ERA5-HEAT UTCI | — | ✓ | — | — |
| ERA5-Drought SPEI-3 | — | ✓ | — | ✓ |

## 14. Source secondaire ECDE

Le dataset Copernicus `sis-ecde-climate-indicators` reste référencé uniquement comme source de
contrôle secondaire pour certains indicateurs de saison de croissance. Il ne définit pas les
saisons thermiques principales T25/T75.

## 15. Questions encore ouvertes après P2

Les principales questions restantes ne portent plus sur la définition des quatre méthodes,
mais sur leur industrialisation :

1. **P4 — spatialisation du ClimateSnapshot** : supporter proprement point de grille et
   agrégation multi-cellules ;
2. **P5/P6 — actif ERA5-Land de production** : choisir une interface stable et démontrer
   l'équivalence avec les golden masters des POC ;
3. **Climate overview** : si les trois indicateurs thermiques extrêmes sont réintroduits,
   définir et tester l'acquisition réelle des minima/maxima quotidiens ;
4. **P3** : définir ce que le commentaire IA peut ou ne peut pas conclure de chaque résultat.

Aucune de ces questions n'autorise à modifier silencieusement les méthodes P2 déjà extraites.
