# Pistes d'amélioration — qualité 3D et texture

## Objet

Le POC produit aujourd'hui une scène géométriquement saine : terrain MNT assis sous le bâti
avec raccord progressif, jupes adaptatives, 176 bâtiments en nœuds distincts nommés par leur
`cleabs`, toitures photo-texturées et orthophotographie recalée. Le visualiseur conserve un
rendu standard unique : le mode réaliste essayé pendant la vague 0 a été retiré après comparaison.

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

Les sources suivantes ont également été examinées et sont closes pour cette POC :

| Source | Motif |
| --- | --- |
| Imagerie satellite Pléiades (30–50 cm) | résolution inférieure à l'orthophoto IGN à 20 cm |
| `HR.ORTHOIMAGERY.ORTHOPHOTOS` | imagerie mesurée identique à la couche standard sur le site |
| RGE ALTI | moins précis que le MNT reconstruit depuis le LiDAR HD |
| Clichés PVA bruts IGN | façades visibles par endroits, mais orientations externes non publiées |
| Obliques Google, Apple et Bing | licences incompatibles avec leur réemploi dans la POC |

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

Approche livrée : modèle de hauteur de canopée (max classe 5 − MNT), maxima locaux pour les
cimes, rayon de couronne par profil radial et icosaèdre basse densité. La couleur de chaque
arbre vient de l'orthophotographie, et le profil feuillu, conifère ou mixte vient de la
[BD Forêt V2](https://cartes.gouv.fr/aide/fr/partenaires/ign/referentiels-description-territoire/foret/bd-foret-v2/).
Sur le run 200 m, 115 des 358 cimes croisent une formation cartographiée ; les autres gardent
le profil générique. Le masque alpha essayé en vague 2 a été retiré après contrôle visuel :
son pointillé répétitif se lisait davantage que les trouées. Les arbres projettent toujours
leur ombre au sol, mais ne reçoivent plus les ombres très noires de leurs voisins.

> **Garde-fou** — la BD Forêt décrit des plages d'au moins 5 000 m², pas chaque arbre. Elle
> ne pilote donc qu'une silhouette de famille, jamais un modèle botanique individuel. Le WFS
> est un enrichissement non bloquant : hors couverture ou hors ligne, le proxy générique
> subsiste.

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
2. pour les 15 cas dégradés, substituer une extrusion LoD1 depuis l'emprise et l'attribut
   `hauteur`, avec l'enveloppe Roofer comme repli si la hauteur manque — un volume franc est
   plus honnête qu'une toiture inventée.

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

Après contrôle visuel, l'eau bleue opaque dominait la scène et son bord raster se lisait trop.
Elle est désormais gris-bleu, translucide (`alphaMode=BLEND`), et ne projette ni ne reçoit
d'ombre ; l'orthophotographie sous-jacente reste donc visible.

### F. Textures de murs — la seule voie restante côté texture

Les murs sont en aplat, et **aucune imagerie de façade n'existe** en prise de vue nadir. La
vague 1 a essayé sept familles procédurales pilotées par `materiaux_des_murs`, avec albédo,
normale et repli neutre. La comparaison a montré que l'affectation fonctionnait, mais
n'apportait que de légères nuances sans gain perceptuel suffisant. Les textures et leur
générateur ont donc été **retirés**.

Les codes BD TOPO restent affichés dans la fiche bâtiment : ils gardent leur valeur
documentaire sans prétendre remplacer une photographie de façade. Les légères nuances
minérales sont déterminées par le code `materiaux_des_murs` (et non par l'identifiant du
bâtiment) ; une teinte neutre unique sert de repli quand le code manque. Ces aplats
historiques restent le rendu neutre des murs.

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

**Ajouter une seconde chaîne de rendu.** Le mode réaliste essayé pendant la vague 0 — ciel de
Preetham, environnement lumineux et GTAO — a été retiré après comparaison sur les emprises 200
et 600 m : il comprimait le contraste sans ajouter d'information, alors que l'orthophotographie
porte déjà son propre éclairage. Le travail d'interface utile reste documenté dans
[`ux-visualiseur.md`](ux-visualiseur.md), indépendamment de cette expérimentation.

---

## 4. Ordre recommandé et état

Les pistes géométriques C, B niveau 1, A et D sont livrées. La suite est désormais organisée
en vagues réversibles :

1. ✅ **Vague 0 — correctifs sûrs et décision de rendu** : ombres 4096² avec repli 2048² sur
   petit écran ou GPU limité, attributs matériau/étages dans la fiche bâtiment et touche `P`
   pour copier la pose caméra avec confirmation à l'écran. Le préréglage contrasté combine
   directionnel `3.2`, environnement `0.08`, hémisphérique `0.20`, exposition `1.20` et contraste
   d'affichage `1.12`, avec le soleil mesuré à 35°/95°. L'essai MSAA/GTAO/ciel a rempli son rôle
   de comparaison puis a été retiré : l'antialiasing natif suffit et l'occlusion cuite reste
   l'unique occlusion.
2. ✅ **Porte 1 — validation comparative** : la recette a confirmé l'affichage des attributs et
   rejeté le mode réaliste, trop fade face au rendu standard. La vague 1 reste donc possible
   sans dépendre d'une seconde chaîne de rendu.
3. ↩️ **Vague 1 — textures de murs évaluées puis retirées** : l'affectation par code était
   correcte, mais le gain se limitait à de faibles nuances. Le coût visuel et logiciel ne
   justifiait pas de conserver le module.
4. ✅ **Porte 2 — gain insuffisant** : les murs reviennent aux teintes neutres et la vague 2
   est ouverte.
5. ✅ **Vague 2A — végétation** : couleur réelle de l'orthophoto et silhouette
   feuillu/conifère/mixte issue de BD Forêt V2, avec repli hors ligne. Le masque alpha
   expérimental a été retiré après la recette visuelle.
6. ✅ **Vague 2B — ombres et toitures dégradées** : trois cascades 2048² en mode
   `practical` sur les postes compatibles, avec fondu entre cascades et direction calée sur
   les contrôles solaires. Les petits écrans et GPU limités conservent le directionnel
   unique. Les toitures dégradées deviennent des extrusions LoD1 horizontales et portent
   `rf_lod1_fallback`, `rf_rendered_lod` et la provenance de leur hauteur.

### Ce qui a été livré, mesuré sur le même run 200 m

| Piste | Réalisation | Chiffre obtenu |
| --- | --- | --- |
| C | `TERRAIN_RESOLUTION_M=0.5`, dérivés `canopy.npy` et `surface.npy` | 460 × 460 cellules, 53 356 assises |
| B1 | `src/poc3d/roofs.py`, section du rapport, `roofQuality`, `rf_degraded` | 15 dégradés sur 176 (8,5 %) |
| B2 | extrusion de l'emprise, hauteur BD TOPO puis enveloppe Roofer en repli | 15 volumes LoD1 explicites sur le 200 m |
| A | `src/poc3d/vegetation.py`, `trees.json`, nœud `Vegetation` | 358 arbres, 115 typés BD Forêt, médiane 8,0 m, max 29,8 m |
| D | `src/poc3d/occlusion.py`, `COLOR_0` sur terrain, bâti et végétation | facteur de vue du ciel médian 0,65 |

`scene.glb` pèse environ 23,1 Mo sans texture de feuillage ni de mur.

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
