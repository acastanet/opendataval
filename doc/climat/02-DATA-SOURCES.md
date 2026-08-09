# Sources de données du domaine climat

Statut : **registre P1 — draft**.

Ce document relie les sources climatiques actuellement utilisées ou proposées dans les POC
aux quatre analyses de la future fiche climat. Il ne définit pas encore les méthodes complètes :
les calculs, seuils et choix méthodologiques seront figés en P2 dans
`doc/climat/methods/<method>/<version>/`.

Les métadonnées structurées correspondantes sont dans :

- `sources/datasets.yaml` — jeux de données, variables, usages et questions ouvertes ;
- `sources/bibliography.yaml` — documentation officielle, standards et articles scientifiques.

## 1. Règle de lecture

Le domaine climat distingue quatre niveaux :

1. **source** — dataset ou publication externe ;
2. **variable source** — grandeur effectivement extraite ;
3. **méthode OpenDataVal** — calcul déterministe appliqué à cette grandeur ;
4. **restitution** — infographie et commentaire produits à partir du résultat.

Un choix OpenDataVal ne doit jamais être présenté comme une propriété imposée par le dataset.
Inversement, une propriété du dataset ne doit pas être modifiée silencieusement par un service.

Exemple : ERA5-Land fournit une température de l'air à 2 m. La définition de saisons locales
par T25/T75 est une méthode OpenDataVal inspirée d'une publication scientifique ; elle n'est pas
une variable ERA5-Land.

## 2. Source de vérité et statut P1

P1 est construit à partir :

- du code réellement présent dans `poc/climat/` ;
- de la documentation méthodologique des POC ;
- de `apps/copernicus` et de sa documentation d'exploitation ;
- des références externes déjà citées dans ces documents ;
- de quelques références fondatrices ajoutées au registre bibliographique et marquées comme
  devant être revérifiées avant validation finale.

Au moment de cette passe, la consultation externe des catalogues était indisponible. Les champs
susceptibles d'évoluer sont donc marqués `pending_external_recheck` dans les fichiers YAML.
Aucune contradiction n'est résolue par hypothèse dans P1.

## 3. Principes communs d'acquisition

### 3.1 Acquisition serveur uniquement

Les données Copernicus doivent être acquises côté serveur. Le navigateur ne doit ni porter la
clé CDS ni déclencher un téléchargement distant lors de l'ouverture d'une fiche.

Le composant existant `apps/copernicus` reste le point de départ pour :

- les secrets CDS ;
- les téléchargements ;
- le cache ;
- la validation de complétude ;
- la provenance ;
- les relances idempotentes.

Les futurs services d'analyse doivent consommer un `ClimateSnapshot` ou des actifs déjà
acquis, pas créer chacun leur propre client CDS autonome.

### 3.2 Reproductibilité

Pour toute source utilisée dans une fiche, le snapshot devra conserver au minimum :

- l'identifiant du dataset CDS ;
- les variables demandées ;
- la période ;
- l'emprise ou le point de grille ;
- les paramètres de requête déterminants ;
- la date de récupération ;
- la version/édition du dataset lorsqu'elle est disponible ;
- l'identité ou l'empreinte des actifs bruts/normalisés ;
- les contrôles de qualité appliqués.

### 3.3 Représentativité spatiale

Une réanalyse maillée n'est pas une mesure locale de parcelle.

Le registre conserve donc séparément :

- la coordonnée ou géométrie demandée ;
- le ou les points/mailles représentatifs ;
- la résolution du produit ;
- la règle de sélection ou de pondération utilisée par la méthode.

Le choix spatial appartient à la méthode, pas au dataset seul. Le POC `general` utilise par
exemple une pondération surfacique des cellules intersectant une zone, alors que les POC
`empreinte`, `saisons` et `eau` travaillent principalement sur un point de grille associé au
lieu. Cette différence devra rester supportée par le futur `ClimateSnapshot`.

## 4. Périodes communes

Les quatre POC convergent actuellement vers :

```text
référence climatologique : 1991–2020
période étudiée          : 1996–2025
première décennie        : 1996–2005
décennie intermédiaire   : 2006–2015
dernière décennie        : 2016–2025
```

La justification normative de la normale 1991–2020 est enregistrée sous
`wmo-climatological-normals` dans `bibliography.yaml`.

P2 devra vérifier, méthode par méthode, que chaque usage de ces périodes correspond bien à la
question scientifique posée. Le registre de sources ne doit pas imposer à lui seul une période
de calcul.

# 5. Infographie 1 — Le climat de la zone

## Question

> À quoi ressemble normalement une année climatique dans cette zone ?

## Source primaire actuelle

**ERA5-Land hourly time-series** :

```text
reanalysis-era5-land-timeseries
```

Variables actuellement documentées :

```text
2m_temperature
total_precipitation
```

Le POC utilise une référence 1991–2020 et décrit la grille ERA5-Land comme 0,1° avec une
résolution native d'environ 9 km.

## Usage actuel

### Température

Le POC construit une climatologie mensuelle et conserve notamment médiane, P10 et P90.

### Précipitations

Les précipitations sont cumulées par mois puis résumées sur les trente années de référence.

### Spatialisation

La méthode actuelle accepte point, polygone ou multipolygone et peut pondérer plusieurs cellules
par leur surface d'intersection.

## Dette scientifique P2

Le POC indique explicitement que les jours de gel, jours chauds et nuits tropicales peuvent être
**approximés à partir de la moyenne quotidienne** lorsque les extrema ne sont pas téléchargés.
Cette approximation n'est pas acceptable comme règle de production silencieuse.

P2 devra décider pour chaque indicateur extrême :

- variable source exacte ;
- agrégation quotidienne exacte ;
- seuil ;
- règle de complétude ;
- référence scientifique ou normative ;
- maintien ou suppression de l'indicateur.

Statut source : **utilisable pour climatologie température/précipitations ; extrêmes à clarifier**.

# 6. Infographie 2 — L'empreinte climatique du lieu

## Question

> Qu'est-ce qui a changé au cours des trente dernières années ?

L'empreinte V4 combine plusieurs familles de données. Le code actuel télécharge les actifs
suivants pour 1991–2025.

## 6.1 Température

Dataset :

```text
reanalysis-era5-land-timeseries
```

Variable :

```text
2m_temperature
```

Usage : moyenne annuelle, anomalie et position dans la distribution de référence.

## 6.2 Précipitations et pluies intenses

Dataset :

```text
reanalysis-era5-land-timeseries
```

Variable :

```text
total_precipitation
```

La même série alimente :

- le cumul annuel ;
- les indicateurs de fortes précipitations dérivés des valeurs quotidiennes.

La spécification propose un seuil P95 des jours humides et `R95pTOT`. La référence scientifique
exacte de cette définition doit être ajoutée et vérifiée en P2 avant validation de la méthode.

## 6.3 Stress thermique UTCI

Dataset actuel :

```text
derived-utci-historical-timeseries
```

Variable :

```text
universal_thermal_climate_index
```

La spécification retient pour la ligne principale le P95 annuel des maxima quotidiens UTCI,
avec des métriques complémentaires de dépassement de seuils.

La documentation du dataset est enregistrée en P1. La référence scientifique fondatrice de
l'UTCI doit encore être ajoutée/vérifiée en P2.

## 6.4 Sécheresse

Dataset :

```text
derived-drought-historical-monthly
```

Variable :

```text
standardised_precipitation_evapotranspiration_index
```

Paramètre actuellement utilisé :

```text
accumulation_period = 3 mois
```

soit `SPEI-3`.

Le même dataset est partagé avec l'infographie « L'eau au fil de l'année ».

## 6.5 Vent fort — contradiction à résoudre

La spécification de conception recommande :

```text
ERA5 hourly data on single levels
10m u-component of wind
10m v-component of wind
```

mais le fetch V4 réellement présent dans le POC demande actuellement :

```text
reanalysis-era5-land-timeseries
10m_u_component_of_wind
10m_v_component_of_wind
```

P1 ne tranche pas cette contradiction.

P2 devra comparer :

- disponibilité et définition des variables ;
- résolution et cohérence avec les autres lignes ;
- pertinence pour les maxima quotidiens et les seuils P98 ;
- coûts de stockage/acquisition ;
- impact sur les résultats V4 existants.

Un changement de source qui modifie les valeurs de l'empreinte devra entraîner une décision de
version de méthode, pas un simple refactor technique.

# 7. Infographie 3 — Les saisons se déplacent

## Question

> Comment les régimes thermiques de l'année se sont-ils déplacés ?

## Source primaire

Dataset :

```text
reanalysis-era5-land-timeseries
```

Variable :

```text
2m_temperature
```

Le POC documente :

```text
source : ERA5-Land
résolution de grille : 0,1°
résolution native : ~9 km
temporalité : horaire
unité source : K
```

La série horaire est convertie en température moyenne quotidienne UTC avant calcul saisonnier.

## Référence scientifique de méthode

La méthode T25/T75 est reliée à :

```text
Wang et al. (2021)
Changing Lengths of the Four Seasons by Global Warming
DOI 10.1029/2020GL091753
```

OpenDataVal en reprend le principe de seuils thermiques locaux et l'adapte notamment à la
référence 1991–2020 et aux comparaisons 1996–2005 / 2016–2025.

## Source secondaire de contrôle

Le POC mentionne :

```text
sis-ecde-climate-indicators
```

pour comparer une logique de saison de croissance. Cette source n'est pas la source normative
des saisons thermiques OpenDataVal.

# 8. Infographie 4 — L'eau au fil de l'année

## Question

> Comment le cycle hydroclimatique se répartit-il et a-t-il évolué ?

Cette infographie combine deux produits distincts.

## 8.1 ERA5-Land monthly averaged reanalysis

Dataset réellement demandé par le fetch actuel :

```text
reanalysis-era5-land-monthly-means
```

Produit :

```text
monthly_averaged_reanalysis
```

Variables principales :

```text
total_precipitation
volumetric_soil_water_layer_1
volumetric_soil_water_layer_2
volumetric_soil_water_layer_3
total_evaporation
```

### Stock d'eau modélisé 0–100 cm

Le stock :

```text
1000 × (0,07 × θ1 + 0,21 × θ2 + 0,72 × θ3)
```

est une **grandeur dérivée OpenDataVal** à partir des trois premières couches de sol utilisées
par le POC. Ce n'est pas une variable native du CDS.

Elle ne doit pas être assimilée à :

- la réserve utile ;
- l'eau réellement disponible pour les plantes ;
- une observation locale ;
- une mesure de nappe.

### Evaporation / évapotranspiration affichée

Le POC applique la convention de signe ECMWF et affiche :

```text
actual_evapotranspiration_mm = -total_evaporation × 1000
```

Pour le chemin `monthly_averaged_reanalysis`, le code multiplie en outre les variables
accumulées par le nombre de jours du mois.

**Cette conversion est un point critique à vérifier directement dans la documentation ECMWF/CDS
actuelle avant que `water-through-year` puisse passer au statut `validated`.**

P1 conserve donc la règle réellement implémentée mais ne la certifie pas encore scientifiquement.

## 8.2 ERA5-Drought

Dataset :

```text
derived-drought-historical-monthly
```

Variable :

```text
standardised_precipitation_evapotranspiration_index
```

Accumulation :

```text
3 mois
```

La valeur reste mensuelle ; le pipeline ne la somme ni ne la moyenne quotidiennement.

## 8.3 Limites interprétatives déjà acquises

La méthode actuelle interdit notamment les équivalences suivantes :

```text
ruissellement ERA5        ≠ débit observé de rivière
stock de sol 0–100 cm     ≠ réserve utile
P − ET                    ≠ recharge de nappe
SPEI                      ≠ observation directe d'un manque d'eau local
```

Ces distinctions devront être reprises dans `interpretation.md` en P3.

# 9. Matrice source → infographie

| Source | Climat zone | Empreinte | Saisons | Eau |
|---|---:|---:|---:|---:|
| ERA5-Land time-series | primaire | primaire | primaire | — |
| ERA5-Land monthly means | — | — | — | primaire |
| ERA5-HEAT UTCI time-series | — | primaire | — | — |
| ERA5-Drought SPEI | — | primaire | — | primaire |
| ERA5 single levels | — | candidat vent | — | — |
| ECDE climate indicators | — | — | contrôle secondaire | — |
| WMO climatological normals | cadre | cadre | cadre | cadre |
| Wang et al. 2021 | — | — | méthode | — |

# 10. Sources partagées et optimisation future

P1 montre que les quatre infographies ne nécessitent pas quatre chaînes d'acquisition
indépendantes.

Les sources réellement partagées sont notamment :

```text
ERA5-Land time-series
    ├── climat de la zone
    ├── empreinte
    └── saisons

ERA5-Drought SPEI-3
    ├── empreinte
    └── eau
```

Le futur `apps/copernicus` / `ClimateSnapshot` doit donc favoriser la réutilisation d'actifs
communs. La mutualisation ne doit toutefois pas modifier la règle scientifique propre à chaque
méthode : une même série de température peut être agrégée différemment selon la question.

# 11. Questions ouvertes à transmettre à P2

## Q1 — Vent de l'empreinte

**Niveau : élevé**

Résoudre la divergence ERA5-Land / ERA5 single levels et décider la source canonique.

## Q2 — Unités des variables accumulées ERA5-Land monthly means

**Niveau : critique**

Vérifier la sémantique des valeurs de `total_precipitation`, `total_evaporation` et autres
accumulations pour `monthly_averaged_reanalysis`, puis valider ou corriger la conversion
mensuelle du POC eau.

## Q3 — Extrêmes du climat général

**Niveau : élevé**

Remplacer les approximations à partir de moyenne quotidienne par des variables et calculs
scientifiquement définis, ou retirer les indicateurs concernés de V1 production.

## Q4 — Référence des pluies intenses

**Niveau : élevé**

Ajouter la référence scientifique/normative exacte pour P95 jours humides / R95pTOT.

## Q5 — Référence UTCI

**Niveau : élevé**

Ajouter la publication fondatrice ou documentation scientifique normative de l'UTCI, en plus de
la documentation du produit ERA5-HEAT.

## Q6 — Tests de tendance de l'empreinte

**Niveau : moyen**

La spécification propose Theil–Sen et Mann–Kendall comme garde-fous éditoriaux. P2 doit décider
s'ils font réellement partie de la méthode V4/V5 avant de leur attribuer des références et des
sorties contractuelles.

# 12. Critère de sortie de P1

P1 est considéré structurellement terminé lorsque :

- chaque dataset actuellement utilisé possède un identifiant canonique ;
- chaque variable importante est reliée à au moins une infographie ;
- les références externes connues sont centralisées ;
- les contradictions source/code sont explicites ;
- les points nécessitant une vérification externe sont marqués ;
- aucun POC n'a été modifié pour faire artificiellement correspondre le registre au code.

Le passage de `draft` à `validated` nécessite ensuite la vérification externe des métadonnées
critiques, puis P2 pour figer les quatre méthodes scientifiques.