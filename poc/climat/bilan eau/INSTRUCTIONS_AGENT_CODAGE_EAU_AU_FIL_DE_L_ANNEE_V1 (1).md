# Instructions agent de codage — Infographie « L’eau au fil de l’année » V1

## 0. Objet

L’objectif est d’implémenter une **troisième grande infographie climatique** pour OpenDataVal :

> **L’eau au fil de l’année**

Cette infographie doit s’inscrire dans la même série visuelle que :

1. **L’empreinte climatique du lieu**
2. **Les saisons se déplacent**

Elle doit répondre à la question :

> **Comment le rythme annuel des apports d’eau, du stockage dans le sol et du déficit hydrique a-t-il changé autour du lieu entre 1996–2005 et 2016–2025 ?**

Le travail demandé comprend :

- la préparation des données ;
- le calcul des indicateurs ;
- la sérialisation JSON ;
- le rendu SVG ;
- une preview HTML ;
- les tests ;
- une documentation méthodologique.

---

# 1. Contraintes générales

## 1.1 Séparer strictement calcul scientifique et rendu

Le code doit séparer :

- extraction / lecture des données ;
- agrégations mensuelles ;
- calcul des indicateurs ;
- comparaison décennale ;
- rendu SVG ;
- rendu HTML.

Le renderer ne doit pas contenir de logique scientifique implicite.

## 1.2 S’appuyer sur le style des deux premières infographies

L’infographie doit reprendre le langage visuel déjà utilisé :

- fond gris neutre ;
- hiérarchie typographique identique ou très proche ;
- composition horizontale ;
- ombre légère ;
- bandes et formes simples ;
- pas de décor non informatif ;
- explications longues dans le HTML, pas dans le SVG.

## 1.3 Pas d’assimilation abusive

Ne pas écrire ni suggérer visuellement que :

- l’humidité du sol ERA5-Land est une mesure locale ;
- le stock d’eau calculé est la « réserve utile » réelle ;
- le runoff ERA5-Land est le débit d’un cours d’eau ;
- `P − ET` est une recharge de nappe ;
- les valeurs décrivent une observation à l’échelle exacte du terrain.

Toujours parler de :

> **contexte hydroclimatique du lieu à partir de la maille de réanalyse associée**

---

# 2. Positionnement produit

L’infographie fait partie de la page climat selon cette progression :

1. **Le climat du lieu**
2. **L’empreinte climatique du lieu**
3. **Les saisons se déplacent**
4. **L’eau au fil de l’année**
5. **Le climat ressenti** (UTCI, hors de ce chantier)

Cette infographie doit montrer une séquence simple :

```text
apports d’eau
→ stockage dans le sol
→ retour vers l’atmosphère
→ déficit / excédent climatique
```

---

# 3. Sources à utiliser

## 3.1 Source principale

**ERA5-Land**

Utiliser en priorité le pipeline ou le cache déjà en place dans le projet.

Variables nécessaires :

- `total_precipitation`
- `volumetric_soil_water_layer_1`
- `volumetric_soil_water_layer_2`
- `volumetric_soil_water_layer_3`
- `total_evaporation`

Variables secondaires utiles si disponibles :

- `runoff`
- `surface_runoff`
- `sub_surface_runoff`
- `snowfall`
- `snowmelt`
- `snow_depth_water_equivalent`

## 3.2 Source complémentaire

**ERA5-Drought**

Variable principale :

- `SPEI-3`

Si le format du dataset impose une logique de fichiers mensuels ou une extraction préparée en amont, s’y adapter proprement.

## 3.3 Référence climatologique

Utiliser partout :

```text
1991–2020
```

## 3.4 Période étudiée

Utiliser :

```text
1996–2025
```

## 3.5 Comparaison principale

Afficher :

```text
1996–2005
vs
2016–2025
```

Conserver aussi :

```text
2006–2015
```

dans les données JSON, même si cette période n’est pas visible dans le SVG V1.

---

# 4. Représentativité du lieu

## 4.1 Métadonnées obligatoires

Conserver dans le JSON final :

- latitude demandée ;
- longitude demandée ;
- latitude du point de grille utilisé ;
- longitude du point de grille utilisé ;
- résolution de grille ;
- résolution native approximative ;
- version du dataset ;
- date de récupération ;
- altitude du lieu si disponible ;
- orographie / altitude modèle si disponible ;
- différence d’altitude si disponible.

## 4.2 Texte HTML

Le HTML de preview doit rappeler explicitement :

> Les données décrivent une maille de réanalyse climatique et non une mesure directe effectuée sur le terrain.

---

# 5. Variables et indicateurs à produire

L’infographie V1 doit reposer sur **quatre signaux principaux**.

## 5.1 Précipitations mensuelles

Source :

```text
ERA5-Land / total_precipitation
```

Unité source :

```text
m d’eau
```

Conversion :

```text
mm = m × 1000
```

Agrégation :

```text
somme mensuelle
```

Indicateur de comparaison :

```text
médiane mensuelle par décennie
```

Conserver aussi `P25` et `P75`.

---

## 5.2 Stock d’eau modélisé dans les 0–100 cm

Source :

- couche 1 : 0–7 cm
- couche 2 : 7–28 cm
- couche 3 : 28–100 cm

Variables :

```text
volumetric_soil_water_layer_1
volumetric_soil_water_layer_2
volumetric_soil_water_layer_3
```

Unité source :

```text
m³/m³
```

Construire un stock dérivé en mm d’eau équivalente :

```text
S0_100_mm =
1000 × (
    0.07 × θ1
  + 0.21 × θ2
  + 0.72 × θ3
)
```

où :

- `θ1` = layer 1
- `θ2` = layer 2
- `θ3` = layer 3

Ce calcul est un **indicateur dérivé OpenDataVal**.

Nom à utiliser dans le produit :

> **Stock d’eau modélisé 0–100 cm**

ou :

> **Stock d’eau du sol modélisé (0–100 cm)**

Ne pas utiliser :

- réserve utile ;
- eau disponible pour les plantes ;
- réserve réelle du sol.

Agrégation :

```text
moyenne mensuelle
```

Puis :

```text
médiane mensuelle par décennie
P25/P75
```

---

## 5.3 Évapotranspiration réelle

Source :

```text
ERA5-Land / total_evaporation
```

Attention à la convention de signe ECMWF.

Pour l’affichage public, créer une variable dérivée :

```text
ETa_display_mm = - total_evaporation_mm
```

de façon à avoir :

```text
valeur positive = eau repartant vers l’atmosphère
```

Agrégation :

```text
somme mensuelle
```

Puis :

```text
médiane mensuelle par décennie
P25/P75
```

Ne pas utiliser `potential_evaporation` comme variable principale du graphique.

---

## 5.4 SPEI-3

Source :

```text
ERA5-Drought
```

Utiliser :

```text
SPEI-3
```

Agrégation :

- la valeur mensuelle est déjà l’échelle pertinente ;
- construire ensuite la médiane mensuelle par décennie ;
- conserver `P25/P75`.

Le SPEI-3 doit rester une **bande synthétique fine** dans le rendu.

---

# 6. Variables secondaires à conserver, sans en faire le cœur de la V1

Conserver dans le JSON si disponibles :

- `soil_water_layer_1` brut ;
- `runoff`
- `surface_runoff`
- `sub_surface_runoff`
- `snowfall`
- `snowmelt`
- `snow_depth_water_equivalent`

Utilisation recommandée :

- tooltip ;
- debug ;
- extensions futures ;
- module neige adaptatif.

Ne pas faire du runoff une série visuelle principale dans la V1.

---

# 7. Structure temporelle

## 7.1 Axe principal

L’infographie doit utiliser :

```text
JAN → DÉC
```

avec une lecture mensuelle.

## 7.2 Année civile

Utiliser l’année civile :

```text
janvier à décembre
```

Ne pas basculer en année hydrologique dans la V1.

## 7.3 Décennies affichées

Deux bandes comparées :

```text
1996–2005
2016–2025
```

---

# 8. Agrégations détaillées

## 8.1 Pour chaque mois de chaque année

Calculer :

### Précipitations

```text
P_month_mm = somme mensuelle
```

### Stock 0–100 cm

Calcul :

```text
S0_100_daily_mm
```

à partir des couches de sol, puis :

```text
S0_100_month_mm = moyenne mensuelle
```

### Évapotranspiration réelle

```text
ETa_month_mm = somme mensuelle
```

après inversion de signe pour l’affichage.

### SPEI-3

```text
SPEI3_month = valeur mensuelle
```

## 8.2 Pour chaque mois de calendrier et chaque décennie

Calculer :

```text
P25
médiane
P75
```

pour :

- précipitations ;
- stock 0–100 cm ;
- évapotranspiration ;
- SPEI-3.

---

# 9. Comparaison à la climatologie 1991–2020

Pour certaines couches visuelles et pour les tooltips, calculer aussi des références mensuelles sur :

```text
1991–2020
```

Il faut comparer chaque mois à **son propre mois de référence**.

Exemple :

```text
août comparé aux août 1991–2020
```

et non à toute l’année.

## 9.1 Pour le stock du sol

Conserver :

- la valeur absolue en mm ;
- une position relative par rapport à la distribution mensuelle 1991–2020.

Cette position relative pourra servir à la couleur de la bande centrale.

## 9.2 Pour les précipitations et ETa

Les anomalies peuvent être présentes dans les données ou au survol, mais le SVG V1 peut se contenter des valeurs mensuelles médianes.

---

# 10. Produit final attendu

## 10.1 Titre

Le SVG doit afficher :

> **L’eau au fil de l’année**

## 10.2 Sous-titre

Sous-titre court recommandé :

> **La pluie n’est qu’une partie de l’histoire.**

Possibilité d’ajustement si les résultats suggèrent une meilleure formulation, mais rester bref.

## 10.3 Ligne de méta

Afficher dans ou juste sous l’en-tête :

```text
1996–2025 · référence 1991–2020 · ERA5-Land + ERA5-Drought
```

---

# 11. Composition visuelle du SVG

L’infographie doit être un **objet éditorial compact**, aligné avec le style des deux premières.

## 11.1 Fond

Utiliser :

```text
#C5C4C1
```

comme fond gris neutre général.

## 11.2 Ombre

Appliquer une ombre légère sur le groupe principal :

```text
shadow_color   = #1C2529
shadow_opacity = 0.18 à 0.22
```

Ombre discrète, sans effet “carte SaaS”.

## 11.3 Typographie

Conserver :

```text
system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
```

Couleurs de texte :

```text
principal   #24313A
secondaire  #52616A
clair       #FBFAF7
```

---

# 12. Structure graphique recommandée

Le graphique doit montrer **deux profils hydriques distincts**, un par décennie.

Chaque profil comporte **quatre étages synchronisés** :

1. **Précipitations** (barres au-dessus)
2. **Stock du sol** (bande principale centrale)
3. **Évapotranspiration** (forme plus discrète dessous)
4. **SPEI-3** (bande fine inférieure)

---

# 13. Étages visuels : détails d’implémentation

## 13.1 Étage 1 — précipitations

Représentation :

- petites barres verticales ;
- une barre par mois ;
- au-dessus du stock du sol.

Couleur :

```text
#2166AC
```

ou une variante proche.

Les barres doivent être fines et régulières.

Ne pas laisser les précipitations dominer toute la composition.

Prévoir une échelle stable entre les deux décennies.

---

## 13.2 Étage 2 — stock du sol (élément principal)

C’est le cœur du graphique.

Créer une bande ou un profil continu représentant la médiane mensuelle du stock 0–100 cm.

Deux dimensions peuvent coexister :

### Géométrie

La hauteur / épaisseur de la bande représente la valeur absolue du stock.

### Couleur

La couleur représente la position relative du stock par rapport à la référence mensuelle 1991–2020.

Palette recommandée :

```text
très humide   #2166AC
humide        #92C5DE
normal        #FBFAF7
sec léger     #E6C7A3
sec marqué    #9A6238
```

Le stock du sol doit immédiatement suggérer :

- remplissage hivernal ;
- maintien printanier ;
- chute estivale ;
- recharge automnale.

Ne pas dessiner une vague décorative arbitraire : la géométrie doit suivre les données.

---

## 13.3 Étage 3 — évapotranspiration

Représentation :

- petites barres descendantes ;
- ou petite bande discrète inversée ;
- une valeur par mois.

Couleur recommandée :

```text
#A67C52
```

ou un gris chaud / ocre doux proche.

L’évapotranspiration doit être identifiable sans dominer.

Son rôle est de montrer **l’eau qui repart vers l’atmosphère**.

---

## 13.4 Étage 4 — SPEI-3

Représentation :

- bande horizontale très fine ;
- une cellule ou un segment par mois ;
- lecture proche de l’empreinte climatique.

Palette recommandée :

```text
humide        #2166AC
normal        #FBFAF7
sec           #9A6238
```

Le SPEI-3 doit rester synthétique.

---

# 14. Comparaison visuelle entre décennies

L’infographie doit permettre de repérer immédiatement :

- décalage de la recharge ;
- dessèchement plus précoce ;
- minimum estival plus bas ;
- saison sèche plus longue ;
- pluie inchangée mais sol plus sec ;
- ou au contraire absence de modification nette.

Il ne faut pas forcer un récit.

---

# 15. Bloc comparatif à droite

Comme pour l’empreinte climatique, prévoir un petit bloc à droite :

```text
Écart entre
les décennies
```

Ne pas dépasser **trois indicateurs**.

### V1 recommandée

Afficher :

1. **Pluie annuelle**
   - différence relative ou absolue entre décennies

2. **Stock du sol en été**
   - par exemple médiane JJA, en mm

3. **Déficit SPEI-3**
   - par exemple nombre moyen de mois par an sous un seuil sec
   - ou minimum saisonnier médian
   - choisir une métrique définie de manière robuste

Aucune valeur fictive dans le rendu final.

Le HTML ou le JSON doit documenter exactement la définition de chaque indicateur.

---

# 16. Ce qui doit rester hors du SVG

Les longues explications doivent être dans le HTML.

## 16.1 Bloc “Comment lire”

Expliquer brièvement :

- les barres = précipitations ;
- la bande centrale = stock d’eau modélisé 0–100 cm ;
- la partie basse = évapotranspiration réelle ;
- la bande fine = SPEI-3.

## 16.2 Bloc “Ce que représentent les données”

Expliquer :

- réanalyse ;
- point de grille ;
- résolution ;
- limite de représentativité en terrain complexe.

## 16.3 Bloc “Sources”

Afficher :

- ERA5-Land ;
- ERA5-Drought ;
- période 1991–2020 ;
- comparaison 1996–2005 / 2016–2025.

---

# 17. Tooltip

Chaque mois et chaque période doivent pouvoir fournir un tooltip.

Exemple de contenu :

```text
Août · 2016–2025

Précipitations
42 mm/mois

Stock du sol 0–100 cm
183 mm

Évapotranspiration
76 mm/mois

SPEI-3
-0.82

Source
ERA5-Land / ERA5-Drought
```

Si disponible, ajouter :

- P25/P75 ;
- écart à la référence mensuelle.

Ne pas charger le SVG de ces détails.

---

# 18. Module neige

## 18.1 Principe

La neige est un module adaptatif.

Si le signal neigeux est significatif :

- prévoir un usage dans le tooltip ;
- éventuellement distinguer une part de précipitation solide ;
- éventuellement afficher la fonte dans les détails.

## 18.2 V1

Le module neige n’est pas obligatoire dans le SVG principal V1.

Il doit surtout être prévu dans les données et dans la structure de code.

---

# 19. Runoff

Le runoff est utile mais secondaire.

Conserver dans les données :

- `runoff`
- et si possible `surface_runoff` / `sub_surface_runoff`

Utilisation V1 :

- JSON ;
- tooltip éventuel ;
- pas d’affichage principal.

Ne jamais l’appeler :

> débit de rivière

---

# 20. Données manquantes et qualité

## 20.1 Contrôle de qualité

Conserver :

- nombre de jours / heures valides par mois ;
- statut des mois incomplets ;
- qualité de l’indice SPEI ;
- statut global par variable.

## 20.2 Affichage

Si un mois ou une variable sont insuffisants :

- ne pas inventer une valeur ;
- utiliser `null` dans le JSON ;
- marquer visuellement la donnée manquante de manière cohérente avec le style du projet si nécessaire.

---

# 21. Structure JSON attendue

Créer un fichier de type :

```text
water-through-year.json
```

Structure minimale recommandée :

```json
{
  "schema_version": "1.0",
  "tile": {
    "lat": null,
    "lon": null
  },
  "representativity": {
    "grid_lat": null,
    "grid_lon": null,
    "grid_resolution_deg": 0.1,
    "native_resolution_km": 9,
    "site_altitude_m": null,
    "model_orography_m": null,
    "altitude_difference_m": null
  },
  "periods": {
    "reference": [1991, 2020],
    "study": [1996, 2025],
    "early": [1996, 2005],
    "middle": [2006, 2015],
    "late": [2016, 2025]
  },
  "sources": {
    "precipitation": "ERA5-Land",
    "soil_water": "ERA5-Land",
    "actual_evapotranspiration": "ERA5-Land",
    "spei3": "ERA5-Drought"
  },
  "monthly": {
    "1996-2005": {
      "jan": {},
      "feb": {}
    },
    "2006-2015": {},
    "2016-2025": {}
  },
  "comparison": {
    "annual_precip_change_pct": null,
    "summer_soil_water_change_mm": null,
    "dry_months_change": null
  },
  "quality": {}
}
```

Pour chaque mois, conserver au minimum :

- `precipitation_mm_p25`
- `precipitation_mm_median`
- `precipitation_mm_p75`
- `soil_water_0_100_mm_p25`
- `soil_water_0_100_mm_median`
- `soil_water_0_100_mm_p75`
- `actual_evapotranspiration_mm_p25`
- `actual_evapotranspiration_mm_median`
- `actual_evapotranspiration_mm_p75`
- `spei3_p25`
- `spei3_median`
- `spei3_p75`

Optionnel / recommandé :

- `soil_water_layer_1_m3m3_*`
- `runoff_mm_*`
- `snowfall_mm_we_*`
- `snowmelt_mm_we_*`

---

# 22. Rendu SVG attendu

Créer :

```text
water-through-year.svg
```

## 22.1 Aspect général

Le SVG doit être compact et équilibré.

Aspect ratio conseillé :

- paysage ;
- proche des deux premières infographies ;
- largeur suffisante pour afficher clairement les 12 mois + bloc comparatif à droite.

## 22.2 Deux profils distincts

Afficher visiblement :

- `1996–2005`
- `2016–2025`

Ces deux profils doivent être séparés par un espace suffisant pour la lecture.

## 22.3 Pas d’effets inutiles

Ne pas utiliser :

- coins arrondis décoratifs importants ;
- gradients excessifs ;
- icônes décoratives ;
- textures inutiles.

Un léger dégradé est acceptable uniquement s’il sert à la lisibilité des bandes et reste sobre.

---

# 23. HTML de preview

Créer :

```text
water-through-year-preview.html
```

La preview HTML doit contenir :

- titre ;
- phrase d’accroche ;
- SVG ;
- bloc “Comment lire” ;
- bloc “Ce que représentent les données” ;
- bloc “Sources et références” ;
- provenance / représentativité ;
- éventuellement un tableau de quelques valeurs synthétiques.

Le HTML doit rappeler que les détails méthodologiques ne sont pas tous dans le SVG.

---

# 24. Documentation méthodologique

Créer :

```text
WATER_THROUGH_YEAR_METHOD.md
```

Ce document doit expliquer :

1. les objectifs ;
2. les sources ;
3. la représentativité du point de grille ;
4. la référence 1991–2020 ;
5. la période 1996–2025 ;
6. les agrégations mensuelles ;
7. le calcul du stock 0–100 cm ;
8. la correction de signe pour l’évapotranspiration ;
9. l’usage de SPEI-3 ;
10. les indicateurs comparatifs ;
11. les limites ;
12. ce que le graphique ne représente pas.

---

# 25. Tests unitaires et tests de non-régression

Créer au minimum :

- `test_water_data.py`
- `test_water_aggregation.py`
- `test_water_soil_stock.py`
- `test_water_svg.py`
- `test_water_schema.py`

## 25.1 Tests scientifiques

Vérifier notamment :

### Conversion des précipitations

```text
m → mm
```

### Calcul du stock 0–100 cm

Vérifier le calcul pondéré :

```text
0.07 / 0.21 / 0.72
```

### Convention de signe ETa

Vérifier que l’affichage est :

```text
positif = flux vers l’atmosphère
```

### Agrégations mensuelles

Vérifier :

- somme pour pluie ;
- somme pour ETa ;
- moyenne pour stock ;
- conservation de SPEI mensuel.

### Statistiques décennales

Vérifier :

```text
P25 / médiane / P75
```

---

# 26. Tests visuels

Produire des captures :

```text
1920 px
1440 px
1280 px
768 px
390 px
```

Vérifier :

- cohérence avec les deux premières infographies ;
- lisibilité des mois ;
- lisibilité des deux décennies ;
- contraste du stock du sol ;
- précipitations visibles mais non dominantes ;
- évapotranspiration lisible ;
- bande SPEI lisible ;
- bloc comparatif lisible ;
- aucun chevauchement de texte ;
- fond gris visible ;
- ombre discrète ;
- pas d’effet “dashboard”.

---

# 27. Critères d’acceptation V1

La V1 est validée si :

- [ ] les données viennent bien d’ERA5-Land et d’ERA5-Drought ;
- [ ] la référence 1991–2020 est utilisée ;
- [ ] la période 1996–2025 est traitée ;
- [ ] la comparaison principale oppose 1996–2005 à 2016–2025 ;
- [ ] quatre signaux principaux sont présents :
  - [ ] précipitations
  - [ ] stock d’eau 0–100 cm
  - [ ] évapotranspiration réelle
  - [ ] SPEI-3
- [ ] le stock 0–100 cm est correctement calculé ;
- [ ] le runoff n’est pas présenté comme un débit ;
- [ ] l’humidité du sol n’est pas appelée “réserve utile” ;
- [ ] le SVG reprend le style des deux premières infographies ;
- [ ] le fond gris et l’ombre sont cohérents ;
- [ ] les deux décennies sont comparables en un regard ;
- [ ] la provenance et la représentativité sont documentées ;
- [ ] le JSON est produit ;
- [ ] la preview HTML est produite ;
- [ ] la documentation méthodologique est produite ;
- [ ] les tests sont en place ;
- [ ] aucune valeur fictive n’apparaît dans le rendu final.

---

# 28. Ordre d’exécution recommandé

## Étape 1 — audit

- inspecter le pipeline existant ;
- identifier les sources ERA5-Land déjà disponibles ;
- identifier l’accès à ERA5-Drought ;
- identifier le style partagé des deux premières infographies.

## Étape 2 — extraction de données

- préparer les séries nécessaires ;
- documenter les métadonnées de source et de représentativité.

## Étape 3 — agrégations

- calculs mensuels ;
- calcul du stock 0–100 cm ;
- conversion ETa ;
- extraction SPEI-3.

## Étape 4 — statistiques décennales

- `P25 / médiane / P75` ;
- indicateurs comparatifs.

## Étape 5 — JSON

- produire `water-through-year.json`.

## Étape 6 — rendu SVG

- produire `water-through-year.svg`.

## Étape 7 — preview HTML

- produire `water-through-year-preview.html`.

## Étape 8 — tests

- scientifiques ;
- schéma ;
- rendu ;
- responsive.

## Étape 9 — documentation

- produire `WATER_THROUGH_YEAR_METHOD.md`.

---

# 29. Non-objectifs de cette V1

Ne pas ajouter dans cette passe :

- données de nappes ;
- débits de rivières observés ;
- couplage ADES / Vigicrues ;
- calcul de recharge de nappe ;
- irrigation ;
- végétation ;
- module agricole spécifique ;
- projections futures ;
- comparaison multi-lieux.

L’infographie doit rester une **lecture hydroclimatique** du lieu.

---

# 30. Résumé opérationnel

La V1 doit produire une infographie éditoriale scientifique répondant à cette logique :

> **La pluie dit ce qui arrive.  
> Le sol montre ce qui reste.  
> L’évapotranspiration montre ce qui repart.  
> Le SPEI révèle quand le déficit s’installe.**

Ce message doit être visible immédiatement, dans un objet graphique cohérent avec **L’empreinte climatique du lieu** et **Les saisons se déplacent**.
