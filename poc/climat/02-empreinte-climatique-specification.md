# Spécification de conception — 02 « L’empreinte climatique du lieu »

**Projet : OpenDataVal**
**Objet :** concevoir l’infographie principale répondant à la question **« Qu’est-ce qui a changé en trente ans ? »**
**Période d’étude proposée :** **1996–2025**
**Référence climatologique :** **1991–2020**
**Statut :** document de conception — aucun calcul réel sur une dalle n’est réalisé ici.

---

## 1. Intention

L’« empreinte climatique » doit être l’infographie qui permet de comprendre, en quelques secondes, **comment le contexte climatique d’un lieu s’est transformé pendant les trente dernières années**, sans réduire cette transformation à une simple courbe de température.

Elle doit faire apparaître simultanément :

- le réchauffement ;
- l’évolution du stress thermique ;
- les années sèches et humides ;
- l’évolution des pluies intenses ;
- les épisodes de sécheresse ;
- les années particulièrement venteuses ;
- les événements météorologiques exceptionnels.

Elle n’a pas pour fonction d’expliquer chaque phénomène en détail. Les infographies suivantes — « Les saisons se déplacent », « L’eau au fil de l’année » et « UTCI » — approfondiront certains de ces signaux.

L’empreinte est donc **un résumé visuel de trente ans**, à mi-chemin entre des *climate stripes* et une matrice multi-variable.

---

# 2. Proposition visuelle

## 2.1 Principe général

La matrice comporte :

- **30 colonnes** : une par année, de 1996 à 2025 ;
- **6 lignes** maximum : une par indicateur climatique ;
- une bande supérieure destinée aux **événements exceptionnels** ;
- une petite synthèse à droite comparant la première et la dernière décennie.

Schéma conceptuel :

```text
ÉVÉNEMENTS       ●        ▲              ●             ◆
                2003     2010           2019          2023
                   │        │              │             │
                 1996                              2025
                  │                                  │
Température       ░ ░ ▒ ░ ▒ ▒ ▓ ▒ ▓ ▓ ▓ █ ▓ █ █ ...
Stress UTCI       ░ ░ ░ ▒ ▒ ▒ ▓ ▒ ▒ ▓ █ ▓ █ █ █ ...
Précipitations    ▓ ░ ▒ █ ░ ░ ▓ ▒ ░ █ ▒ ░ ▓ ░ ▒ ...
Pluies intenses   ░ ▒ ░ █ ░ ░ ▒ ▓ ░ █ ░ ▒ █ ░ ▒ ...
Sécheresse        ░ ░ ▒ ░ ▓ ▒ ░ ▓ ▒ ░ █ ▓ █ ▒ █ ...
Vent fort         ░ ▓ ░ ░ █ ░ ▒ ░ ░ ▓ ░ █ ░ ░ ▒ ...

                                      1996–2005 → 2016–2025
                                      Δ température : [...]
                                      Δ stress : [...]
                                      Δ pluie : [...]
                                      ...
```

L’objectif n’est pas qu’un utilisateur lise les 180 cases une par une. Il doit percevoir des **motifs** :

- une bande thermique qui devient progressivement plus chaude ;
- une succession d’années sèches ;
- des années dans lesquelles plusieurs signaux extrêmes coïncident ;
- une augmentation éventuelle de la fréquence d’un phénomène ;
- au contraire, des variables dont l’évolution reste dominée par la variabilité.

---

# 3. Cadre temporel

## 3.1 Période racontée : 1996–2025

En 2026, les trente dernières années civiles complètes sont :

```text
1996 → 2025
```

C’est cette période qui doit être visible sur l’axe horizontal.

Le produit ne doit pas intégrer l’année 2026 tant qu’elle est incomplète.

## 3.2 Référence : 1991–2020

Toutes les notions « au-dessus de la normale », « près de la normale », « exceptionnel », etc. doivent être calculées par rapport à la **référence 1991–2020**.

Cette distinction doit rester explicite dans le graphique :

> **Période représentée : 1996–2025**
> **Référence des anomalies : 1991–2020**

Le chevauchement des deux périodes est normal : la première est la période racontée, la seconde est l’étalon utilisé pour qualifier les valeurs.

---

# 4. Une grammaire visuelle inspirée de Copernicus

Copernicus utilise dans ses produits récents une classification par percentiles pour distinguer les conditions proches de la moyenne, au-dessus ou au-dessous de la moyenne, et les situations situées dans les extrémités de la distribution de référence.

Pour l’empreinte OpenDataVal, je propose d’adapter cette grammaire à chaque indicateur.

Pour une grandeur annuelle \(M\), on calcule sur 1991–2020 :

- `P10`
- `P33.3`
- `P66.6`
- `P90`

Chaque année est ensuite classée en cinq catégories :

| Position dans la distribution 1991–2020 | Classe générique |
|---|---|
| ≤ P10 | très basse |
| P10 → P33.3 | basse |
| P33.3 → P66.6 | proche de la normale |
| P66.6 → P90 | haute |
| ≥ P90 | très haute |

Le vocabulaire affiché dépend ensuite du phénomène :

- température : **beaucoup plus froid → beaucoup plus chaud** ;
- pluie : **beaucoup plus sec → beaucoup plus humide** ;
- sécheresse : **peu de sécheresse → sécheresse très présente** ;
- vent : **peu venteux → très venteux**.

Les valeurs physiques restent accessibles au survol ou dans les données annexes.

### Pourquoi utiliser des percentiles pour la couleur ?

Les six lignes n’ont pas les mêmes unités ni les mêmes distributions. Les transformer en rangs relatifs permet de conserver une **intensité visuelle comparable** sans prétendre que `+1 °C`, `+100 mm` et `+5 jours de vent fort` sont des grandeurs comparables.

La couleur représente donc :

> **« Où cette année se situe-t-elle par rapport au climat de référence de ce même indicateur ? »**

et non un score universel de « bon » ou de « mauvais » climat.

---

# 5. Les six lignes recommandées

## Ligne 1 — Température de l’air

### Question

> **Cette année a-t-elle été globalement chaude ou froide par rapport à 1991–2020 ?**

### Source CDS recommandée

**ERA5-Land hourly time-series data from 1950 to present**

Variable :

```text
2m temperature
```

ERA5-Land fournit des séries horaires sur une grille de 0,1° ; la résolution native du modèle terrestre est annoncée à environ 9 km. Le service de séries temporelles sélectionne le point de grille le plus proche lorsqu’une coordonnée ne correspond pas exactement à un point de grille.

### Calcul annuel

1. convertir K → °C ;
2. calculer la température moyenne annuelle ;
3. calculer la moyenne 1991–2020 ;
4. conserver :
   - valeur annuelle absolue ;
   - anomalie en °C ;
   - percentile annuel dans la distribution 1991–2020.

### Valeur de la cellule

```text
M_temp(year) = température moyenne annuelle
```

### Tooltip envisagé

```text
2019
Température moyenne : XX.X °C
Anomalie vs 1991–2020 : +X.X °C
Classe : beaucoup plus chaud que la normale
Rang : Xᵉ / 30 années de l’empreinte
Source : ERA5-Land
```

### Pourquoi cette ligne est indispensable

Elle constitue le signal climatique le plus immédiatement compréhensible et sert de repère visuel aux autres lignes.

---

# 6. Ligne 2 — Stress thermique / UTCI

## Question

> **La partie chaude de la distribution thermique ressentie s’est-elle déplacée ?**

Il vaut mieux ne pas répéter ici l’infographie UTCI complète.

L’empreinte doit utiliser **un indicateur synthétique unique**, robuste même dans les endroits où les journées de stress chaud fort restent rares.

## Indicateur recommandé

### P95 annuel du maximum quotidien UTCI

Pour chaque journée :

```text
UTCI_daily_max
```

Pour chaque année :

```text
M_utci(year) = percentile 95 des maxima quotidiens UTCI de l’année
```

### Pourquoi P95 plutôt que la moyenne UTCI annuelle ?

La moyenne annuelle mélangerait hiver, été, jours doux et extrêmes.

Le P95 répond à une question plus intéressante :

> **« Quel niveau caractérise les journées appartenant à la partie la plus chaude de l’année ? »**

Il reste calculable dans un site montagnard où le nombre de jours au-dessus de 32 °C UTCI serait éventuellement nul.

### Source

**ERA5-HEAT — Thermal comfort indices derived from ERA5 reanalysis**

Le jeu fournit :

- UTCI ;
- MRT ;
- statistiques quotidiennes, mensuelles, saisonnières et annuelles ;
- compteurs de jours au-dessus ou au-dessous de seuils ;
- nuits tropicales.

Résolution annoncée :

```text
0,25° × 0,25°
```

### Informations complémentaires du tooltip

Même si la couleur repose sur le P95 :

```text
P95 max UTCI : XX.X °C
Jours ≥ 32 °C UTCI : XX
Jours ≥ 38 °C UTCI : XX
Maximum annuel : XX.X °C
```

Ces données seront réutilisées dans l’infographie UTCI dédiée.

---

# 7. Ligne 3 — Précipitations annuelles

## Question

> **L’année a-t-elle été globalement sèche ou humide ?**

### Source

ERA5-Land :

```text
total precipitation
```

### Calcul

À partir des accumulations horaires :

```text
précipitation quotidienne
→ somme annuelle
→ mm/an
```

Puis comparaison de chaque total annuel à la distribution des totaux annuels 1991–2020.

### Valeur de la cellule

```text
M_precip(year) = cumul annuel de précipitations en mm
```

### Sémantique des couleurs

```text
très sec — sec — normal — humide — très humide
```

La palette doit être propre à l’eau :

```text
brun / beige → neutre → bleu
```

et non bleu → rouge comme pour la température.

### Tooltip

```text
Cumul : XXXX mm
Écart à la moyenne 1991–2020 : ±XX %
Jours de pluie : XX
Classe : année très humide
```

---

# 8. Ligne 4 — Pluies intenses

Cette ligne est distincte de la précédente.

Deux années peuvent recevoir le même cumul annuel tout en étant très différentes :

- nombreuses petites pluies ;
- quelques épisodes très intenses ;
- longue période sèche puis événement exceptionnel.

## Question

> **Quelle part de l’année est portée par des pluies exceptionnellement fortes ?**

## Indicateur recommandé pour le MVP

Calculer, sur 1991–2020, le **95e percentile des précipitations journalières des jours humides**.

Puis, pour chaque année :

```text
M_extreme_rain(year)
    = nombre de jours dépassant ce seuil P95
```

Conserver également :

```text
R95pTOT
    = cumul annuel tombé pendant les jours dépassant P95
```

Le premier indicateur est utilisé pour la couleur ; le second est présenté au survol.

### Intérêt

Cette ligne rend visible une évolution éventuelle de la **fréquence des fortes précipitations** même lorsque le cumul annuel ne change pas nettement.

### Limite importante

ERA5/ERA5-Land décrivent des valeurs moyennes de maille. Une pluie convective ou cévenole très locale peut être atténuée par la résolution du modèle.

L’infographie doit donc parler de :

> **« précipitations extrêmes dans la réanalyse »**

et non d’un cumul mesuré exactement sur la dalle 100 × 100 m.

---

# 9. Ligne 5 — Sécheresse

Cette ligne ne doit pas être un simple duplicata inversé de la précipitation.

La sécheresse dépend de la durée du déficit et, dans le cas du SPEI, de la demande évaporative de l’atmosphère.

## Source CDS recommandée

**ERA5–Drought — Monthly drought indices from 1940 to present derived from ERA5 reanalysis**

Ce jeu fournit :

- SPI ;
- SPEI ;
- fenêtres d’accumulation de 1, 3, 6, 12, 24, 36 et 48 mois ;
- référence 1991–2020 ;
- grille 0,25°.

## Indicateur recommandé

### SPEI-3

Le SPEI sur trois mois est un bon compromis pour faire apparaître les déficits saisonniers sans réduire la sécheresse à un seul mois.

Pour éviter de fixer arbitrairement un seuil unique, on peut construire le seuil à partir de la période 1991–2020.

Pour chaque mois de l’année :

1. calculer la distribution du `SPEI-3` sur 1991–2020 ;
2. déterminer son `P10` ;
3. qualifier comme « mois très sec » un mois situé sous ce P10.

Puis :

```text
M_drought(year)
    = nombre de mois très secs dans l’année
```

Plus ce nombre est élevé, plus la cellule est intense dans la direction « sécheresse ».

### Tooltip

```text
Mois très secs : X / 12
SPEI-3 minimum : -X.XX
Plus longue séquence sèche : X mois
```

### Avantage majeur

Le dataset ERA5–Drought utilise déjà **1991–2020 comme référence** et fournit des indices standardisés. Il s’intègre donc particulièrement bien à la logique de l’empreinte.

---

# 10. Ligne 6 — Vent fort

## Question

> **Les épisodes de vent fort sont-ils plus ou moins présents certaines années ?**

Pour le climat local, la moyenne annuelle du vent est moins expressive que la fréquence des journées de vent intense.

## Source

**ERA5 hourly data on single levels**.

Variables robustes à privilégier :

```text
10m u-component of wind
10m v-component of wind
```

Python calcule :

```text
wind_speed = sqrt(u10² + v10²)
```

puis :

```text
maximum quotidien
```

## Indicateur annuel

Le jeu « Climate indicators for Europe » de Copernicus définit notamment les *extreme wind speed days* à partir d’un percentile élevé de la vitesse du vent.

Pour OpenDataVal, je propose :

1. calculer le `P98` des maxima quotidiens de vent sur 1991–2020 ;
2. compter chaque année les journées dépassant ce seuil.

```text
M_wind(year)
    = nombre de jours avec vent max > P98_ref
```

### Tooltip

```text
Jours > P98 : X
Maximum quotidien annuel : XX.X m/s
Écart au nombre moyen 1991–2020 : ±X jours
```

## Précaution technique importante

Le catalogue CDS signale actuellement un problème connu sur certains paramètres du produit **ERA5 post-processed daily statistics**, dont `10m_wind_gust_since_previous_post_processing`.

Pour le MVP, l’empreinte ne doit donc pas dépendre de ce paramètre tant que le problème n’est pas officiellement résolu.

La solution la plus robuste est de calculer la vitesse à partir des composantes horaires `u10` et `v10`.

---

# 11. Ligne optionnelle — Neige

La neige ne doit pas être imposée à toutes les dalles.

Elle peut apparaître automatiquement lorsque le climat de référence montre un enneigement suffisamment régulier.

ERA5-Land expose notamment :

```text
snow cover
snow depth
```

Deux indicateurs possibles :

- nombre de jours avec couverture neigeuse ;
- durée de la saison d’enneigement ;
- maximum annuel d’épaisseur de neige.

Pour une dalle méditerranéenne littorale, cette ligne disparaît.

Pour une dalle de montagne, elle peut remplacer une ligne moins informative ou devenir une septième ligne en mode expert.

---

# 12. Pourquoi ne pas mettre « feu » dans la matrice principale

Un feu réel n’est pas une variable météorologique.

À partir de données climatiques, on peut représenter :

- des conditions favorables au feu ;
- un Fire Weather Index ;
- sécheresse, chaleur, vent.

Mais on ne doit pas conclure qu’un incendie a effectivement eu lieu.

Le CDS contient des jeux de données de danger de feu et des observations de surface brûlée, mais ils n’ont pas nécessairement la même couverture temporelle ou la même nature que les réanalyses retenues ici.

Pour le MVP :

> **le feu réel reste un événement externe éventuellement annoté avec une source dédiée ; il n’est pas une ligne de l’empreinte climatique CDS.**

---

# 13. Les événements exceptionnels : intégrés à l’empreinte

Il n’est pas nécessaire de construire une sixième infographie « événements ».

Les événements doivent devenir des **annotations de l’empreinte**.

## 13.1 Bande supérieure

Au-dessus des trente années :

```text
1996 ───────────────────────────────────────────── 2025
        ▲              ●          ◆         ●
      chaleur        pluie      sécher.    vent
       2003           2014       2019       2023
```

Maximum recommandé :

```text
5 à 8 événements
```

sur trente ans.

## 13.2 Détection automatique des candidats

Python produit d’abord une liste de candidats.

### Chaleur

Candidat si :

- séquence de jours de stress UTCI forte ou très forte ;
- ou valeur UTCI quotidienne située dans les extrêmes de la référence.

### Pluie

Candidat si :

- précipitation journalière > P99 de la référence ;
- et/ou cumul glissant 2–3 jours exceptionnel.

### Sécheresse

Candidat si :

- plusieurs mois consécutifs avec SPEI-3 très bas ;
- durée et intensité combinées élevées.

### Vent

Candidat si :

- maximum quotidien du vent très au-delà du P98/P99 de référence.

### Froid / neige

Candidat seulement si pertinent pour le lieu :

- UTCI froid exceptionnel ;
- neige exceptionnelle dans ERA5-Land.

## 13.3 Sélection finale

Ne pas simplement retenir les huit valeurs numériques les plus extrêmes.

L’algorithme doit favoriser la diversité :

```text
maximum 2 événements par famille
maximum 8 événements au total
```

Puis une **revue humaine** peut confirmer :

- la date ;
- le libellé ;
- l’éventuel nom connu de l’événement ;
- une source locale ou nationale complémentaire.

## 13.4 Vocabulaire prudent

Sans source externe confirmant l’impact :

utiliser :

```text
« épisode de pluie extrême »
« épisode de vent extrême »
« séquence de sécheresse »
« stress thermique exceptionnel »
```

et éviter :

```text
« crue »
« tempête X »
« incendie »
« catastrophe »
```

car ces termes impliquent des phénomènes ou impacts qui ne sont pas déduits directement d’ERA5.

---

# 14. Couleurs : ne pas utiliser une seule palette pour tout

Une palette unique bleu/blanc/rouge serait séduisante mais scientifiquement ambiguë.

Dans une ligne température :

```text
rouge = plus chaud
```

Dans une ligne pluie, le même rouge pourrait être interprété comme :

```text
sec
```

alors qu’un simple score numérique positif signifierait au contraire davantage de pluie.

## Proposition

Toutes les lignes partagent :

- une cellule très claire pour la classe « normale » ;
- cinq niveaux d’intensité ;
- la même saturation relative.

Mais chaque phénomène a ses propres extrêmes :

```text
Température      bleu ─ neutre ─ rouge
UTCI             neutre ─ orange ─ rouge sombre
Précipitations   brun ─ neutre ─ bleu
Pluies intenses  neutre ─ bleu foncé
Sécheresse       neutre ─ ocre ─ brun
Vent fort        neutre ─ violet / graphite
```

La cohérence vient de la **structure**, pas de l’utilisation forcée d’une seule couleur.

---

# 15. Information visible vs information au survol

## Toujours visible

- nom de l’indicateur ;
- années ;
- couleurs ;
- événements majeurs ;
- légende qualitative ;
- comparaison première / dernière décennie.

## Au survol d’une cellule

```text
année
valeur physique
unité
anomalie vs 1991–2020
percentile
classe qualitative
rang dans les 30 années
source
résolution
```

Exemple fictif :

```text
2019 — Température

Moyenne annuelle        XX.X °C
Anomalie                +X.X °C
Percentile réf.         P97
Classe                  Beaucoup plus chaud
Rang 1996–2025          2 / 30

ERA5-Land
grille 0,1° — contexte climatique
```

---

# 16. La comparaison entre première et dernière décennie

La matrice annuelle montre très bien la variabilité, mais l’utilisateur a besoin d’une réponse synthétique.

À droite de chaque ligne :

```text
1996–2005 → 2016–2025
```

et un delta.

Exemples de gabarits :

```text
Température        +X.X °C
UTCI P95           +X.X °C
Précipitations     ±XX %
Pluies intenses    +X jours/an
Sécheresse         +X mois/an
Vent fort          ±X jours/an
```

Ces chiffres ne remplacent pas la matrice ; ils aident à la lire.

Ils doivent être calculés comme la différence entre :

```text
moyenne 2016–2025
-
moyenne 1996–2005
```

---

# 17. Tendance statistique : garder la prudence

Trente points annuels sont suffisants pour estimer une tendance, mais certaines variables — notamment précipitations et vent — présentent une forte variabilité interannuelle.

Je recommande de calculer en arrière-plan :

- une pente robuste de type Theil–Sen ;
- un test de tendance de type Mann–Kendall ;
- un intervalle d’incertitude.

Ces éléments n’ont pas besoin d’apparaître dans la vue principale.

Ils servent surtout à empêcher le moteur éditorial de produire automatiquement une phrase du type :

> « les tempêtes augmentent »

lorsque le signal sur trente ans n’est pas robuste.

Le texte généré pourra distinguer :

```text
« tendance nette »
« évolution possible mais variable »
« aucune tendance claire sur la période »
```

Cette partie est une **proposition méthodologique OpenDataVal**, et non un traitement fourni directement par CDS.

---

# 18. Architecture des données Python

## Entrée minimale

Pour une dalle :

```json
{
  "tile_id": "ODV-...",
  "lat": 0.0,
  "lon": 0.0,
  "period": [1996, 2025],
  "reference_period": [1991, 2020]
}
```

## Étape 1 — collecte/cache

Le traitement récupère seulement les séries nécessaires pour :

```text
1991 → 2025
```

soit 35 années, puisque les cinq premières sont nécessaires à la référence mais ne figurent pas dans l’image.

Les données sont mises en cache côté serveur.

## Étape 2 — agrégations

Produire une table annuelle :

```text
year
temp_mean
utci_p95
utci_days_ge_32
precip_total
extreme_precip_days
extreme_precip_total
drought_month_count
spei3_min
extreme_wind_days
wind_max
...
```

## Étape 3 — référence

Pour chaque indicateur :

```text
P10
P33.3
P50
P66.6
P90
mean
```

calculés sur 1991–2020.

## Étape 4 — classification

Pour chaque couple :

```text
année × indicateur
```

produire :

```text
raw_value
anomaly
percentile
class
rank
```

## Étape 5 — événements

Produire une liste séparée :

```json
[
  {
    "date_start": "...",
    "date_end": "...",
    "family": "heavy_rain",
    "severity_percentile": 99.7,
    "metrics": {},
    "label_status": "automatic"
  }
]
```

## Étape 6 — rendu

Deux sorties recommandées :

```text
climate-fingerprint.json
climate-fingerprint.svg
```

Le JSON permet :

- tooltips ;
- accessibilité ;
- réutilisation dans le rapport ;
- génération d’un texte automatique.

Le SVG fournit :

- rendu identique sur le web et dans un PDF ;
- qualité vectorielle ;
- coût navigateur minimal.

---

# 19. Contrat JSON conceptuel

```json
{
  "period": {
    "start": 1996,
    "end": 2025
  },
  "reference": {
    "start": 1991,
    "end": 2020
  },
  "rows": [
    {
      "id": "temperature",
      "label": "Température",
      "source": "ERA5-Land",
      "resolution": "0.1 degree",
      "metric": "annual_mean_2m_temperature",
      "unit": "degC",
      "years": [
        {
          "year": 1996,
          "value": null,
          "anomaly": null,
          "percentile": null,
          "class": null,
          "rank": null
        }
      ]
    }
  ],
  "events": [],
  "comparison": {
    "early": "1996-2005",
    "late": "2016-2025"
  },
  "provenance": {}
}
```

Les `null` sont intentionnels dans cette spécification : aucun résultat climatique réel n’est inventé.

---

# 20. Résolutions spatiales : point crucial

L’infographie appartient à une dalle OpenDataVal de 100 × 100 m, mais les données ne décrivent **pas** le climat à 100 m.

Sources proposées :

| Source | Rôle | Résolution annoncée |
|---|---|---|
| ERA5-Land | température, précipitation, sol, neige | grille 0,1° ; résolution native ~9 km |
| ERA5-HEAT | UTCI / MRT | 0,25° |
| ERA5–Drought | SPI / SPEI | 0,25° |
| ERA5 | vent atmosphérique | 0,25° |

La page doit donc dire :

> **« Contexte climatique du lieu — données de réanalyse sur grille »**

et jamais :

> **« climat mesuré dans les 100 × 100 m »**.

Pour chaque source, stocker également :

```text
coordonnées du point de grille utilisé
résolution
distance entre dalle et centre de grille
version du dataset
date de récupération
```

La coexistence de plusieurs grilles est acceptable à condition de la documenter ; il ne faut pas les fusionner artificiellement pour donner l’illusion d’une précision commune.

---

# 21. Pourquoi cette empreinte est compatible avec l’architecture OpenDataVal

Le climat est une **donnée snapshot** de la dalle.

Chaîne proposée :

```text
création de la dalle
        ↓
coordonnées du centre
        ↓
job Copernicus / Python
        ↓
séries 1991–2025
        ↓
agrégations
        ↓
empreinte + événements
        ↓
climate-fingerprint.json
climate-fingerprint.svg
        ↓
snapshot dans l’instance
        ↓
page HTML
```

Aucun appel CDS n’est nécessaire au chargement de la page publique.

Cela permet :

- reproductibilité ;
- versionnement ;
- validation humaine ;
- génération du même visuel dans HTML et dans le rapport ;
- affichage immédiat.

---

# 22. Points à ne pas faire

## Ne pas afficher une « anomalie universelle »

Les unités différentes ne doivent pas être mélangées dans une seule échelle numérique.

## Ne pas assimiler la dalle à la maille climatique

Une dalle 100 × 100 m n’est pas une mesure climatique à 100 m.

## Ne pas utiliser une année incomplète

La matrice ne contient que des années civiles complètes.

## Ne pas appeler toute pluie extrême « crue »

La pluie est météorologique ; la crue nécessite une information hydrologique.

## Ne pas appeler toute période chaude « canicule »

Un événement nommé doit idéalement être confirmé par une source météorologique officielle ou une règle explicitement documentée.

## Ne pas appeler un danger de feu « incendie »

Le danger météorologique et l’incendie observé sont deux informations différentes.

## Ne pas faire dépendre le MVP du paramètre ERA5 quotidien de rafale actuellement signalé comme problématique dans le CDS

Calculer en priorité le vent à partir des composantes horaires vérifiées.

## Ne pas lisser excessivement

L’intérêt de l’empreinte est précisément de conserver la variabilité interannuelle et les années singulières.

---

# 23. Version MVP recommandée

Pour la première implémentation, je limiterais l’empreinte à :

```text
1. Température moyenne annuelle
2. UTCI P95
3. Précipitations annuelles
4. Jours de pluies intenses > P95
5. Sécheresse SPEI-3
6. Jours de vent fort > P98
```

Avec :

```text
30 colonnes
6 lignes
5 classes de percentile
5 à 8 événements maximum
1 comparaison première / dernière décennie
```

Cela représente seulement :

```text
180 cellules
```

mais raconte déjà une histoire climatique beaucoup plus riche qu’une courbe de température.

---

# 24. Extension V2 éventuelle

Après validation du MVP :

- ligne neige adaptative ;
- rayonnement solaire / ensoleillement ;
- durée des séquences sèches ;
- indicateur de danger feu ;
- comparaison avec une station météorologique proche ;
- incertitude ;
- tendance robuste ;
- annotation automatique d’événements locaux validés.

Ces éléments ne doivent pas entrer dans la première version tant que la lisibilité des six lignes principales n’est pas validée.

---

# 25. Sources Copernicus/CDS prioritaires

## ERA5-HEAT / UTCI

**Thermal comfort indices derived from ERA5 reanalysis**
https://cds.climate.copernicus.eu/datasets/derived-utci-historical?tab=overview

À utiliser pour :

- UTCI ;
- MRT ;
- statistiques quotidiennes à annuelles ;
- compteurs de jours de stress ;
- nuits tropicales.

## ERA5-Land

**ERA5 Land hourly time-series data from 1950 to present**
https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land-timeseries?tab=overview

À utiliser pour :

- température 2 m ;
- précipitations ;
- humidité des sols ;
- neige ;
- éventuellement composantes du vent et rayonnement.

## ERA5–Drought

**Monthly drought indices from 1940 to present derived from ERA5 reanalysis**
https://cds.climate.copernicus.eu/datasets/derived-drought-historical-monthly?tab=overview

À utiliser pour :

- SPI ;
- SPEI ;
- caractérisation des séquences sèches ;
- comparaison native à la référence 1991–2020.

## ERA5

**ERA5 hourly data on single levels from 1940 to present**
https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels?tab=overview

À utiliser principalement pour :

- vent atmosphérique ;
- dérivation des vitesses horaires et extrêmes.

## Méthode Copernicus pour anomalies et percentiles

**Climate Bulletin — About the data and analysis**
https://climate.copernicus.eu/climate-bulletin-about-data-and-analysis

Référence graphique utile pour :

- anomalies ;
- percentiles ;
- catégories proches / au-dessus / très au-dessus de la moyenne ;
- référence 1991–2020.

## Indicateurs climatiques européens

**Climate indicators for Europe from 1940 to 2100 derived from reanalysis and climate projections**
https://cds.climate.copernicus.eu/datasets/sis-ecde-climate-indicators?tab=overview

À utiliser surtout comme **référence méthodologique** pour les définitions d’indicateurs (précipitations extrêmes, vent extrême, sécheresse, etc.), plutôt que comme source unique de l’empreinte.

---

# 26. Décision proposée

L’empreinte doit être considérée comme un **objet scientifique normalisé**, et non simplement comme un motif graphique.

Son contrat conceptuel est :

> **Une colonne = une année complète. Une ligne = un phénomène défini par un indicateur reproductible. La couleur = la position de cette année dans la distribution climatologique 1991–2020 de cet indicateur. Les marqueurs = les événements quotidiens ou saisonniers les plus exceptionnels détectés dans les séries sous-jacentes.**

Cette définition est suffisamment précise pour commencer ensuite :

1. le prototype Python de la matrice avec données fictives ;
2. la validation des requêtes CDS ;
3. le test sur une première dalle réelle ;
4. la validation scientifique des six indicateurs ;
5. la conception graphique définitive.
