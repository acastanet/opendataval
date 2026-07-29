# Pistes d'amélioration — qualité 3D et texture

## Objet

Le POC produit aujourd'hui une scène géométriquement saine : terrain MNT assis sous le bâti
avec raccord progressif, jupes adaptatives, 176 bâtiments en nœuds distincts nommés par leur
`cleabs`, toitures photo-texturées et orthophotographie recalée. Le mode de rendu réaliste du
visualiseur est abandonné — hors périmètre d'un POC.

Que reste-t-il à gagner en **effet visuel** et en **précision**, sans sur-ingénierie ?

Ce rapport répond par des mesures prises sur le run 200 m
(`output-200m/run-20260728-225318`), pas par des intuitions. Chaque piste porte son chiffre
justificatif, et une section dit explicitement où il ne faut **pas** investir.

---

## 1. Ce qui est déjà au plafond — ne pas y toucher

C'est la partie la plus utile du rapport : elle évite de dépenser de l'effort là où il n'y a
rien à prendre.

**L'orthophotographie est saturée.** Le détail réel s'arrête vers 20 cm ; on échantillonne
déjà à 11 cm (`ORTHO_SIZE_PX=2048` sur 230 m), soit 2× de sur-échantillonnage. Dégrader
l'image d'un facteur 2 puis la restaurer ne coûte que 0,4 fois le contraste inter-pixel — le
détail n'y était pas. Et la couche `HR.ORTHOIMAGERY.ORTHOPHOTOS` renvoie **exactement la même
imagerie** sur ce site : écart-type et pertes au rééchantillonnage identiques au centième.
Augmenter `ORTHO_SIZE_PX` n'apporterait qu'un fichier plus lourd.

**Le terrain à 0,25 m n'est pas soutenu par la donnée** : 0,8 point de sol par cellule. On
interpolerait du vide.

**Draco, KTX2, tuilage, niveaux de détail** : aucun intérêt sur 200 m servis en local. C'est
de l'industrialisation, pas de la qualité.

---

## 2. Les pistes, mesurées

### A. Végétation haute — le plus gros écart visuel

| Mesure | Valeur |
| --- | --- |
| Points LiDAR classe 5 | **617 984** (29 % du nuage, 11,7 pts/m²) |
| Emprise sous canopée > 3 m | **27 %** |
| Cimes détectables (maxima locaux 5 m) | **443** |
| Hauteur de canopée | médiane 8,1 m, maximum 29,9 m |

Plus d'un quart de la scène est boisé et **n'existe pas en 3D** : les arbres ne sont que de la
peinture plate sur le terrain. C'est ce qui trahit le plus le rendu.

Approche sobre : modèle de hauteur de canopée (max classe 5 − MNT), maxima locaux pour les
cimes, rayon de couronne par région connexe, puis un proxy simple par arbre — deux quads
croisés ou une icosphère basse densité. Réutilise `src/poc3d/raster.py` et la mécanique de
rastérisation déjà écrite pour `src/poc3d/sun.py`.

> **Garde-fou** — pas de segmentation individuelle sophistiquée, pas de modèles d'essences,
> pas de billboards orientés caméra. À 200 m, des proxys grossiers suffisent largement :
> l'enjeu est la présence, pas le réalisme botanique.

### B. Bâtiments mal reconstruits — le meilleur rapport précision/effort

Roofer **étiquette déjà** ses échecs, et l'information est jetée :

| `rf_roof_type` | Bâtiments |
| --- | --- |
| `slanted` | 161 |
| `unknown` | 12 |
| `no planes` | 2 |
| `no points` | 1 |

**15 bâtiments (8,5 %) sont dégradés**, nommément identifiés. La confrontation des toitures
Roofer au MNS bâti LiDAR (52 605 cellules à 0,5 m) le confirme :

- biais médian **−0,19 m**, écart-type **1,23 m** ;
- 54 % des cellules à moins de 0,5 m, **83 % à moins de 1 m** ;
- **5 % au-delà de 2 m** — c'est là que se logent les défauts visibles.

Deux niveaux d'action, du moins cher au plus utile :

1. remonter `rf_roof_type` dans le rapport de validation et dans `buildings.json` (déjà écrit,
   il suffit de lire l'attribut) ;
2. pour les 15 cas dégradés, substituer une extrusion LoD1 depuis l'emprise et la hauteur
   médiane des points LiDAR classe 6 — un volume franc est plus honnête qu'une toiture
   inventée.

> **Garde-fou** — ne pas chercher à réparer les toitures. Les signaler et les simplifier
> suffit.

### C. Terrain à 0,5 m — gain réel mais localisé

| Maille | Cellules | Points sol / cellule | Écart-type du résidu | 95ᵉ centile |
| --- | --- | --- | --- | --- |
| 1 m (actuel) | 52 900 | 12,0 | 0,269 m | 0,365 m |
| **0,5 m** | 211 600 | **3,0** | 0,214 m | **0,188 m** |
| 0,25 m | 846 400 | 0,8 | — non soutenu | — |

À lire avec nuance : l'écart-type ne s'améliore que de 20 %, mais le **95ᵉ centile chute de
48 %**. Le gain est donc concentré sur les ruptures de pente — précisément les terrasses
cévenoles et les murs de soutènement, aujourd'hui lissés.

`TERRAIN_RESOLUTION_M` est déjà paramétré partout (aucun 1 m codé en dur) : c'est une clé de
configuration, plus la vérification du pipeline. Coût : le GLB passe d'environ 5,7 à 17 Mo,
sans conséquence en service local.

### D. Occlusion ambiante cuite — ce qui remplace le GTAO abandonné

Calculer le facteur de vue du ciel sur le modèle de surface (une quinzaine d'azimuts, balayage
d'horizon sur le raster) et l'écrire en `COLOR_0` sur le terrain et les bâtiments.

Assombrit les ruelles et le pied des murs **dans n'importe quel moteur**, y compris celui de
l'étape 2, sans aucun coût à l'affichage ni dépendance de post-traitement. C'est la bonne
place pour cet effet maintenant que le mode réaliste du visualiseur est écarté.

### E. Eau et pont — effort faible, effet local

23 206 points classe 9 : l'Hérault traverse toute l'emprise (243 m d'est en ouest, 61 m du
nord au sud). Altitude médiane 349,08 m, mais **1,7 m d'étalement entre quartiles** — c'est
une rivière en pente, pas un plan horizontal : il faut une surface interpolée, pas un plan
unique. Rendue aujourd'hui comme du terrain caillouteux.

Le pont (4 037 points classe 17) est plus délicat : il n'est ni terrain ni bâtiment, et le MNT
passe sous lui. À traiter seulement si l'eau est faite.

### F. Textures de murs — la seule voie restante côté texture

Les murs sont en aplat, et **aucune imagerie de façade n'existe** en prise de vue nadir. La
seule option est de générer albédo et carte de normales tuilables directement en Python (bruit
procédural, sans dépendance ni téléchargement). Les UV métriques des murs sont déjà en place,
une unité UV valant un mètre.

> **Garde-fou** — une seule texture générique de crépi. Pas de variantes par bâtiment, pas
> d'atlas, pas de matériau par époque.

---

## 3. Ce qui est déconseillé

**Le dé-ombrage de l'orthophotographie.** Techniquement à portée : on connaît le soleil
d'origine (azimut 95°, hauteur 34,5°, voir `poc.py sun`) et on dispose d'un modèle de surface,
donc le masque d'ombre est calculable. Mais le relèvement local produit facilement des halos
et des transitions sales, et il faudrait inpeindre les zones où l'ombre a mangé toute
l'information. C'est le seul axe où le risque de sur-ingénierie est réel pour un POC. À
réserver à l'étape 2, si elle le demande.

**Réparer les toitures ratées.** Les signaler et les remplacer par un volume simple coûte une
fraction du prix et ne ment pas sur la donnée.

**Tout travail sur le visualiseur.** ~~Le mode réaliste est abandonné ; le mode diagnostic
remplit son office.~~ **Périmé.** Cette conclusion valait tant que le mode réaliste était
écarté ; il a depuis été réintroduit (ciel de Preetham, occlusion GTAO), et les réglages livrés
par les pistes A à E ont chargé le panneau au point de nuire à sa lecture. Le travail
d'interface qui en découle est traité à part, dans
[`ux-visualiseur.md`](ux-visualiseur.md).

---

## 4. Ordre recommandé et état

1. ✅ **C — terrain à 0,5 m** et ✅ **B niveau 1 — signalement des toitures dégradées** : deux
   gains quasi gratuits, faits en premier.
2. ✅ **A — végétation** : le seul poste qui change vraiment l'allure de la scène.
3. ✅ **D — occlusion cuite** : donne du corps à l'ensemble, et sert l'étape 2.
4. ⬜ **B niveau 2 — extrusion LoD1 des 15 cas dégradés**.
5. ⬜ **E — eau**, puis ⬜ **F — textures de murs**, selon l'appétit.

Les étapes 1 à 3 suffisent à obtenir l'essentiel de l'effet ; elles sont livrées.

### Ce qui a été livré, mesuré sur le même run 200 m

| Piste | Réalisation | Chiffre obtenu |
| --- | --- | --- |
| C | `TERRAIN_RESOLUTION_M=0.5`, dérivés `canopy.npy` et `surface.npy` | 460 × 460 cellules, 53 356 assises |
| B1 | `src/poc3d/roofs.py`, section du rapport, `roofQuality`, `rf_degraded` | 15 dégradés sur 176 (8,5 %) |
| A | `src/poc3d/vegetation.py`, `trees.json`, nœud `Vegetation` | 358 arbres, médiane 8,0 m, max 29,8 m |
| D | `src/poc3d/occlusion.py`, `COLOR_0` sur terrain, bâti et végétation | facteur de vue du ciel médian 0,65 |

Le pipeline complet s'exécute en moins de dix secondes et `scene.glb` pèse 20 Mo — le
surcoût de la maille fine et de l'occlusion reste sans conséquence en service local.

Ces mesures portent sur l'emprise 200 m. L'emprise 600 m, exécutée depuis, les confirme à neuf
fois la surface : toitures dégradées **9,0 %** contre 8,5 %, calage de l'orthophotographie
**2,92 m vers le sud** sur 484 emprises contre 2,58 m sur 178. Elle déplace en revanche
l'enjeu de la végétation, qui passe de 27 % à **63 % de l'emprise sous canopée** — voir la
section « Emprise 600 m » du README.

Écarts assumés par rapport aux mesures du rapport : 358 cimes au lieu de 443, la fenêtre de
suppression des doublons valant ici 5,5 m et non 5 m ; le compromis retenu supprime les
grappes de proxys sur un même houppier, ce qui pèse davantage à l'œil qu'une cime manquante.

---

## 5. Vérification attendue de chaque piste

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s test -v
.\.venv\Scripts\python.exe poc.py check
.\.venv\Scripts\python.exe poc.py all
.\.venv\Scripts\python.exe poc.py serve
node --check viewer\app.js
git diff --check
```

Tests à ajouter dans `test/`, par piste :

- **terrain 0,5 m** — la grille double dans chaque dimension, l'assise et le fondu restent
  cohérents, le résidu aux points sol diminue ;
- **toitures dégradées** — un `rf_roof_type` absent ou `no points` est compté et signalé ;
- **végétation** — sur un nuage synthétique, une cime isolée produit un proxy à la bonne
  position et à la bonne hauteur ; un nuage sans classe 5 n'en produit aucun ;
- **occlusion cuite** — un creux étroit reçoit un facteur de vue du ciel inférieur à une
  surface plane dégagée ; les valeurs restent dans l'intervalle [0, 1].

Contrôle visuel en mode diagnostic sur `output-200m` : lumière rasante pour juger le relief
des terrasses à 0,5 m, puis vue générale pour l'effet d'ensemble de la végétation. Reporter
dans [`acceptance-checklist.md`](acceptance-checklist.md).

---

## Annexe — méthode de mesure

Toutes les valeurs proviennent de scripts d'analyse ponctuels exécutés sur le run 200 m, à
partir de `lidar_subset.laz`, `terrain.npy`, `orthophoto.jpg` et `roofer_output/*.city.jsonl`.

| Grandeur | Méthode |
| --- | --- |
| Résolution effective de l'orthophoto | dégradation puis restauration par rééchantillonnage, à facteurs croissants |
| Équivalence des couches standard et HR | même emprise de 25 m à 512 px, comparaison des statistiques |
| Densité par classe LiDAR | comptage direct sur `classification` |
| Couverture et hauteur de canopée | max de la classe 5 par cellule, moins le MNT |
| Cimes | maxima locaux sur fenêtre 5 × 5 m, seuil 4 m |
| Résidu du terrain | écart des points classe 2 à la maille moyenne, à 1 m puis 0,5 m |
| Précision de reconstruction | rastérisation des `RoofSurface` à 0,5 m, confrontée au max de la classe 6 |
