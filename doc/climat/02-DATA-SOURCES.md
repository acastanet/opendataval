# Sources de données du domaine climat

Statut : **registre P1 consolidé par P2 — `draft`**.

Ce document relie les sources climatiques aux quatre analyses de la future fiche climat. Les calculs complets sont définis sous `doc/climat/methods/`.

Les métadonnées structurées se trouvent dans :

- `sources/datasets.yaml` — jeux de données, variables, usages et statut de vérification ;
- `sources/bibliography.yaml` — documentation officielle, standards et publications scientifiques.

## Principes

Le domaine climat distingue :

```text
source / variable
        ↓
méthode OpenDataVal
        ↓
ClimateResult
        ↓
ClimateSignal
        ↓
restitution / commentaire
```

Les données Copernicus sont acquises côté serveur par `apps/copernicus`. Les futurs services scientifiques ne doivent pas embarquer chacun leur propre client CDS.

Une réanalyse maillée n'est pas une mesure locale de parcelle. Le futur `ClimateSnapshot` conservera séparément le lieu demandé et la ou les mailles réellement représentées.

## Périodes

```text
référence climatologique : 1991–2020
période étudiée          : 1996–2025
première décennie        : 1996–2005
décennie intermédiaire   : 2006–2015
dernière décennie        : 2016–2025
```

`climate-overview` utilise uniquement 1991–2020 puisqu'il décrit le climat habituel et non une évolution.

## ERA5-Land

Variables utilisées :

```text
2m_temperature
total_precipitation
10m_u_component_of_wind
10m_v_component_of_wind
volumetric_soil_water_layer_1
volumetric_soil_water_layer_2
volumetric_soil_water_layer_3
total_evaporation
```

Usages :

| Variable | Overview | Fingerprint | Seasons | Water |
|---|:---:|:---:|:---:|:---:|
| température 2 m | ✓ | ✓ | ✓ | — |
| précipitations | ✓ | ✓ | — | ✓ |
| vent u/v 10 m | — | ✓ | — | — |
| humidité du sol | — | — | — | ✓ |
| évaporation | — | — | — | ✓ |

### Interface d'acquisition

Les POC ponctuels utilisent `reanalysis-era5-land-timeseries`. Cette interface reste la référence des golden masters, mais la méthode scientifique dépend d'ERA5-Land et des variables, pas obligatoirement de cette interface particulière. `apps/copernicus` choisira l'actif de production stable et P5 devra démontrer l'équivalence numérique.

## ERA5-HEAT

Dataset :

```text
derived-utci-historical-timeseries
```

Variable :

```text
universal_thermal_climate_index
```

Usage V4 : maximum quotidien UTCI puis P95 annuel. Les seuils 32 °C et 38 °C restent des détails descriptifs.

## ERA5-Drought

Dataset :

```text
derived-drought-historical-monthly
```

Variable : SPEI, accumulation 3 mois.

Deux méthodes distinctes l'utilisent :

- empreinte : nombre annuel de mois sous le P10 du même mois de calendrier sur 1991–2020 ;
- eau : nombre annuel de mois `SPEI-3 < -1` pour le résumé décennal.

Ces définitions ne doivent pas être fusionnées.

## Décisions P2

### Vent de l'empreinte

**Résolu** : ERA5-Land `u10/v10`, cohérent avec le fetch V4 et disponible dans le produit ERA5-Land actuel.

```text
wind_speed = sqrt(u10² + v10²)
```

ERA5 single levels n'est donc pas requis par `climate-fingerprint@4.0.0`.

### Pluies intenses

**Résolu** :

```text
jour humide = précipitation >= 1 mm
seuil = P95 des jours humides 1991–2020
métrique = nombre annuel de jours > seuil
```

Le seuil s'inspire du cadre ETCCDI/Climdex, mais la grandeur principale OpenDataVal est un compte de jours et ne doit pas être appelée R95p/R95pTOT.

### Eau — accumulations mensuelles

**Résolu et vérifié ECMWF** : pour `monthly_averaged_reanalysis` (`moda`), les variables hydrologiques accumulées sont exprimées en m d'eau équivalente par jour.

```text
monthly_total_mm = value × 1000 × days_in_month
```

La logique du POC eau est conservée.

### Eau — évaporation

**Résolu et vérifié ECMWF** : la convention verticale est descendante positive ; l'évaporation sortante est généralement négative.

```text
actual_evapotranspiration = -total_evaporation
```

### Eau — couches 0–100 cm

Les trois premières couches ERA5-Land correspondent à 0–7, 7–28 et 28–100 cm. OpenDataVal dérive :

```text
1000 × (0,07×θ1 + 0,21×θ2 + 0,72×θ3)
```

Cette grandeur n'est ni une réserve utile, ni l'eau disponible pour les plantes, ni une mesure de nappe.

### Climate overview — extrêmes thermiques

**Résolu par exclusion du noyau V1** : les compteurs de gel, jours ≥30 °C et nuits ≥20 °C ne sont pas canoniques tant qu'ils reposent sur des approximations à partir de températures moyennes quotidiennes.

Ils pourront être réintroduits uniquement à partir de vrais minima/maxima quotidiens avec méthode et tests explicites.

## Spatialisation

`climate-overview` est particulier : il supporte Point, Polygon et MultiPolygon et peut agréger plusieurs cellules par pondération surfacique.

Les autres POC travaillent principalement sur un point de grille associé au lieu.

P4 devra donc permettre aux `ClimateSnapshot` de décrire les deux cas sans imposer une fausse uniformité.

## Source secondaire ECDE

`sis-ecde-climate-indicators` reste une référence secondaire de contrôle pour certains indicateurs de saison de croissance. Il ne définit pas les saisons thermiques principales T25/T75.

## Questions restantes après P2

Elles concernent désormais l'industrialisation, pas la définition des quatre méthodes :

1. **P3** — formaliser les signaux et les règles d'interprétation IA ;
2. **P4** — contrat spatial commun du `ClimateSnapshot` ;
3. **P5/P6** — choisir l'actif ERA5-Land de production et démontrer son équivalence avec les POC ;
4. **climate-overview** — définir une méthode Tmin/Tmax si les trois compteurs d'extrêmes sont réintroduits.
