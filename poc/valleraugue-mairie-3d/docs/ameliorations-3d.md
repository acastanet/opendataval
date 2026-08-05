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

**L'arbitrage sur les bibliothèques est rouvert, et tranché dans l'autre sens.** Le POC s'est
longtemps tenu à quatre dépendances, réimplémentant filtre maximum, morphologie, sommes
glissantes et point-dans-polygone. La segmentation des houppiers a mis fin à ce régime :
réécrire un watershed par marqueurs et des moments d'inertie de région n'a pas de sens quand
`scikit-image` les fournit. Sont entrés dans `requirements.txt` `scipy`, `scikit-image`,
`shapely`, `geopandas` et `rasterio`.

Ce qui reste vrai de l'ancien inventaire tient en deux points, et ils sont contraignants :

- **`scipy` ≥ 1.18 abandonne Python 3.11**, sur lequel tourne le POC. `pip` plafonne donc à
  1.17.1, et `requirements.txt` porte un `<1.18` explicite. Relever cette borne impose de
  faire passer toute la chaîne à Python 3.12 ou plus ;
- **les roues Windows de `rasterio`, `geopandas`/`fiona` et `pyproj` embarquent chacune leur
  copie de GDAL, GEOS et PROJ.** Elles cohabitent aujourd'hui — GDAL 3.10.3, GEOS 3.13.1,
  PROJ 9.5.1 — mais une divergence de version se manifesterait par un plantage à l'`import`
  et non par un message clair. `poc.py check` les importe donc ensemble à chaque exécution.

**PDAL n'est pas entré**, et le motif a changé : ce n'est plus un interdit, c'est une absence
d'emploi. Son `filters.hag_dem` recalculerait un CHM déjà disponible et sa classification du
sol ferait double emploi avec celle de l'IGN. C'est aussi la seule bibliothèque envisagée sans
roue `pip` autoportante : l'adopter remplacerait le `py -3.11 -m venv` documenté partout par
conda ou OSGeo4W.

Restent écartées, sur leurs motifs propres et non sur celui du poids : `open3d` (roue de
~400 Mo pour une décimation voxel qui tient en cinq lignes de numpy), `pyntcloud` (sans
publication depuis juillet 2022) et `py3dtiles` (impose un chargeur tiers au visualiseur, et
le tuilage est tranché ci-dessus).

La dépendance qui était sous-exploitée est `laspy`, installée de longue date : ses dimensions `intensity`,
`return_number` et `scan_angle` étaient lues par personne. La réflectance est désormais un mode
de couleur du visualiseur.

### Une proposition externe, et ce qu'il en reste

Une proposition reçue en août 2026 recommandait de refondre la végétation autour de PDAL, de
`lidR` et de Blender Geometry Nodes, avec export CityGML, sur le modèle du dépôt
*LiDAR-3D-Urban-Forest-Mapping*. L'essentiel de son pipeline était **déjà livré** — modèle de
hauteur de canopée, détection de cimes, dimensions de houppier, typage par référentiel, canopée
continue, nuage classé de contrôle. Trois de ses observations étaient justes et ont donné les
pistes A′, G et H ci-dessous. Le reste est écarté, et pour des motifs qui ne tiennent plus à un
interdit d'outillage :

| Écarté | Motif |
| --- | --- |
| `lidR` / `lasR` | impose R à une chaîne Python ; `skimage.segmentation.watershed` donne le même `dalponte2016` |
| Blender + Geometry Nodes | il n'y a pas de rendu hors ligne ici, et `poc.py all` doit rester **une** commande |
| CityGML via FME | le format cible est glTF, et FME est propriétaire |
| `filters.hag_dem` (PDAL) | le MNT est déjà en mémoire au moment où le CHM se calcule |
| Trois niveaux de détail par distance | il n'y a pas de vue territoriale : les emprises font 100 à 600 m, et le LOD est tranché plus haut |

Le principe qu'elle défendait — le LiDAR **mesure** la végétation, il ne la modélise pas, et
l'on ne convertit pas un point en feuille — est en revanche exactement celui que le POC
applique depuis la vague 2.

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
cimes, houppier segmenté par ligne de partage des eaux et icosaèdre basse densité. La couleur
de chaque arbre vient de l'orthophotographie, et le profil feuillu, conifère ou mixte vient de
la [BD Forêt V2](https://cartes.gouv.fr/aide/fr/partenaires/ign/referentiels-description-territoire/foret/bd-foret-v2/),
complétée par la BD TOPO — voir la piste H. Le masque alpha essayé en vague 2 a été retiré
après contrôle visuel : son pointillé répétitif se lisait davantage que les trouées. Les arbres
projettent toujours leur ombre au sol, mais ne reçoivent plus les ombres très noires de leurs
voisins.

> **Garde-fou** — la BD Forêt décrit des plages d'au moins 5 000 m², pas chaque arbre. Elle
> ne pilote donc qu'une silhouette de famille, jamais un modèle botanique individuel. Le WFS
> est un enrichissement non bloquant : hors couverture ou hors ligne, le proxy générique
> subsiste.

#### A′. Le houppier segmenté — ce qui remplace le profil radial

Le rayon de couronne se mesurait par retombée d'un profil radial autour de la cime : on
s'éloignait par anneaux concentriques jusqu'à ce que la canopée passe sous la moitié de la
hauteur du sujet. Le critère est juste sur un arbre isolé et **faux en couvert continu** —
entre deux arbres jointifs la canopée ne retombe jamais, le profil court jusqu'au plafond, et
`VEGETATION_MAX_CROWN_M` finissait par trancher pour près de la moitié des sujets. La largeur
des houppiers était donc décidée par un réglage, pas par la donnée.

La ligne de partage des eaux résout exactement ce cas. Les cimes servent de marqueurs, le
relief soumis à l'algorithme est la canopée **retournée**, et la crête qui sépare deux bassins
tombe dans le creux entre deux arbres. C'est l'algorithme de `lidR::dalponte2016`, obtenu ici
par `skimage.segmentation.watershed` sans quitter Python.

Sur l'emprise 200 m de référence, à cimes identiques (358) :

| Mesure | Profil radial | Segmentation |
| --- | --- | --- |
| Rayon médian | 5,50 m | **1,78 m** |
| Rayon moyen | 4,40 m | 2,48 m |
| Arbres au plafond de 6,4 m | **163 (46 %)** | **8 (2 %)** |
| Couvert cumulé des houppiers | 27 035 m² | **9 697 m²** |

Le chiffre qui tranche est le dernier, et il demande son référent : la canopée mesurée
**au-dessus du seuil d'arbre** de 4 m couvre 10 611 m². Le profil radial en produisait donc
**+155 %** — les houppiers s'interpénétraient massivement — quand la segmentation reste à
**−9 %**. Les bassins couvrent 90 % du masque ; le reste se partage entre le plafond de rayon
(820 m²) et la canopée hors de portée d'une cime détectée (804 m²).

La segmentation donne en outre l'**ellipse** de chaque couronne — aire, rapport des axes,
orientation — par les moments d'ordre deux de sa région. L'ovalité et la rotation étaient
jusque-là tirées d'un CRC de la position : assez pour rompre l'alignement d'un solide identique
recopié des centaines de fois, mais sans aucun rapport avec l'arbre. Elles sont maintenant
mesurées, pour le même coût de rendu. `crownArea`, `crownRatio` et `crownAngle` voyagent dans
`trees.json`.

> **Garde-fou** — `MINIMUM_CROWN_RATIO` borne l'aplatissement à 0,35. Sous ce seuil la région
> décrit une trouée entre deux arbres ou une haie prise pour un sujet, pas une couronne. Le
> plafond `VEGETATION_MAX_CROWN_M` subsiste comme garde-fou contre un arbre de lisière qui
> annexerait tout un versant, mais il ne décide plus de la mesure : `trees.json` porte le
> compte de ceux qu'il borne encore. `VEGETATION_CROWN_SEGMENTATION=0` rejoue le profil radial
> pour comparer.

### G. Strate arbustive — la donnée était là, rien ne la montrait

Les classes LiDAR 3 et 4 — végétation basse et moyenne — voyagent depuis toujours dans
`lidar_subset.laz`. Elles ne pesaient que dans le modèle de surface et l'occlusion : **rien ne
les affichait**, alors qu'elles portent la garrigue, les ronces et le sous-bois cévenols.

| Mesure | Valleraugue 200 m | Hort-de-Dieu 500 m |
| --- | --- | --- |
| Emprise sous canopée | 27 % | 89 % |
| Emprise en strate arbustive | **14 %** | **47 %** |
| Continuité verticale | **8 %** | **39 %** |
| Coût dans le GLB | 1,4 Mo (6 %) | 13,0 Mo (26 %) |

La dernière ligne du haut est celle qui compte au-delà du rendu : la **continuité verticale du
combustible** est la superposition d'une strate basse et d'un houppier au-dessus. C'est par
elle qu'un feu de surface gagne la canopée, et elle ne se lit sur aucune des deux couches prise
séparément. Elle sort dans la console de l'étape `terrain`, et les deux rasters sortent
désormais en GeoTIFF géoréférencés — `canopy.tif` et `understory.tif` — directement
exploitables dans un SIG pour l'étude des obligations légales de débroussaillement.

Le rendu est une **nappe qui épouse le relief**, pas des buissons individuels : le LiDAR aérien
mesure ici une hauteur de couvert, pas des sujets qu'on pourrait dénombrer, et inventer des
volumes séparés ajouterait de la fiction à une mesure. La strate s'arrête à
`VEGETATION_MIN_HEIGHT_M` pour ne pas faire double emploi avec les houppiers.

> **Garde-fou** — le coût en octets n'est pas négligeable sur une grande emprise très
> couverte : un quart du GLB à l'Hort-de-Dieu. `UNDERSTORY=0` la retire. Sous
> `UNDERSTORY_MIN_HEIGHT_M`, la mesure décrit surtout le bruit du sol et les herbes rases, que
> le terrain restitue déjà.

### H. Typage par la BD TOPO — ce que la BD Forêt ne voit pas

La BD Forêt ne cartographie que des massifs d'au moins 5 000 m². Sur l'emprise 200 m elle ne
type que 115 cimes sur 358 ; sur l'Hort-de-Dieu, aucune. Tout ce qui n'est pas un massif — haie,
lande ligneuse, bois, forêt ouverte, c'est-à-dire l'essentiel du pourtour d'un village — lui
échappe par construction.

`BDTOPO_V3:zone_de_vegetation` décrit ces objets à la parcelle, et sert de **second recours sur
les seules cimes restées génériques**. Une cime déjà typée n'est jamais reclassée : BD Forêt
décrit l'essence, la BD TOPO seulement la forme du couvert. Le gain est spectaculaire là où la
BD Forêt est muette — **3 834 arbres typés sur 3 957 à l'Hort-de-Dieu**, contre 2 de plus
seulement sur les 358 de Valleraugue, déjà largement couvert.

> **À savoir** — le thème Végétation harmonisé de **BD France**
> (`IGNF_BD-FRANCE-TOPO-VEGETATION`) serait le candidat naturel, et c'est lui qu'annonçait la
> Géoplateforme. Il figure bien au catalogue WFS mais **n'y renvoie aucune entité** : vérifié
> sur Valleraugue, l'Hort-de-Dieu et Besançon. La BD TOPO le remplace tant qu'il reste vide ;
> le jour où il se remplira, seule la constante `LANDCOVER_WFS_LAYER` change.
>
> **Garde-fou** — « Lande ligneuse », « Bois » et « Forêt ouverte » ne disent rien de
> l'essence : ces natures gardent le profil générique. Les typer serait inventer une silhouette
> que la donnée ne porte pas. L'appel est non bloquant, comme celui de la BD Forêt.

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
7. ✅ **Vague 3 — relief des houppiers et courbe de rendu** : voir ci-dessous.
8. ✅ **Vague 4 — le nuage LiDAR témoin** : voir « Vague 4 » plus bas. C'était le dernier objet
   de la scène à n'avoir jamais été travaillé.

### Vague 3 — les deux dernières prises, à coût nul

Une fois les pistes A à F closes, l'inventaire du rendu ne laissait que deux endroits où
gagner sans rien construire. Aucune des deux n'ajoute de dépendance, de passe de rendu ni
d'octet dans le GLB.

**A′. Relief des houppiers, puis ombrage en volume.** La rotation et l'ovalité de ±15 %
cassaient la répétition d'un arbre au suivant, mais pas la régularité de **chacun** :
l'icosaèdre de vingt faces reste une boule à facettes dès qu'on l'approche. Le rayon de chaque
sommet est donc tiré autour de sa valeur nominale, de façon stable pour un arbre donné — même
CRC que les teintes de bâtiment, pour la même raison. Le relief ne porte que sur le rayon
horizontal : étirer aussi la verticale déplacerait la cime, alors qu'elle est le seul chiffre
que le proxy restitue.

### L'ombrage du feuillage : une hypothèse, et sa réfutation

Cette première version a d'abord été jugée facettée à l'excès — les houppiers se lisaient comme
des cristaux taillés. Le diagnostic paraissait clair : tout le GLB s'écrit avec une normale par
face, correcte pour un mur ou un pan de toiture, mais chaque facette de l'icosaèdre recevait
alors un éclairement uniforme distinct. Le relief, en creusant l'écart d'orientation entre faces
voisines, **renforçait ce contraste** au lieu de le masquer.

Le lissage a donc été essayé : un houppier étant un solide étoilé autour de son centre, la
normale lissée d'un sommet est la direction qui l'en éloigne. Cinq lignes, aucun triangle,
aucun octet.

**La recette l'a rejeté, et c'est le rejet qui est instructif.** Un houppier n'a que douze
sommets : le lissage rend son intérieur continu, mais sa silhouette reste un polygone à arêtes
franches. L'œil reçoit deux signaux contradictoires — un volume qui se prétend rond, un contour
qui dit le contraire — et lit une bulle de gomme. Le facettage, lui, ne prétend rien : vingt
faces éclairées distinctement se lisent comme une **représentation**, au même titre que les
volumes LoD2.2 du bâti et les proxys d'arbres eux-mêmes.

Le bon critère n'était donc pas « est-ce que ça ressemble à un arbre » mais « est-ce que ça se
lit ». Le GLB reste facetté. Le lissage vit désormais dans le visualiseur, sous « Houppiers →
Ombrage du feuillage », où il se compare à l'écran sans réassembler la scène — même principe
que la courbe de rendu.

> **Le piège technique, à connaître avant toute reprise.** Écrire des normales dans le GLB ne
> suffisait pas : le visualiseur les **écrasait**. `applyCrownScale` appelle
> `computeVertexNormals` après avoir déplacé les sommets — or la primitive du feuillage n'est
> pas indexée, et Three.js y produit donc une normale par face. L'appel a lieu à chaque
> chargement de scène et à chaque restauration d'état, **y compris avec les trois facteurs à
> 100 %**. Le GLB a porté pendant toute une recette des normales que rien n'affichait jamais.
> Cet appel est aujourd'hui la branche « schématique » du sélecteur, donc voulu — mais tout
> ombrage qu'on voudrait cuire dans le GLB doit d'abord vérifier que le visualiseur ne le
> reprend pas derrière.

Réglage `VEGETATION_CROWN_IRREGULARITY`, `0.18` par défaut, `0` rétablissant à l'identique la
géométrie des exécutions précédentes. Il se règle comme `VEGETATION_MAX_CROWN_M` : par
comparaison de deux `poc.py glb`, puis on fige la valeur. Le visualiseur ne peut pas en faire
un curseur — la déformation est cuite dans le GLB, contrairement aux trois facteurs de
dimension des houppiers, qui agissent sur les sommets au chargement. La valeur employée est
écrite dans `render/scene.json` sous `crownIrregularity`, faute de quoi une scène servie ne
dirait pas lequel des deux rendus elle porte.

> **Garde-fou** — si les houppiers se lisent comme des cailloux, ou si le couvert continu de
> l'emprise 600 m devient bruité, revenir à `0`. Le réglage rend le retour gratuit. Ce
> garde-fou a servi : c'est lui qui a fait remonter le facettage.

**B′. Courbe de rendu réglable.** Le contraste passait — et passe encore — par un
`filter: contrast()` CSS appliqué **après** le tone mapping et la conversion sRGB : il écrête
les hautes lumières au lieu de les rouler. `NeutralToneMapping` avait été retenu sans
comparaison documentée. Le panneau porte donc un sélecteur « Courbe de rendu » — Neutre
(référence), AgX, ACES Filmic, Aucune — dans les réglages avancés, à côté de l'exposition et
du contraste. Three.js recompile ses shaders de lui-même quand la courbe change : aucune
propagation de `needsUpdate` sur les matériaux chargés.

C'est l'outil de comparaison que la seconde chaîne de rendu abandonnée prétendait fournir, pour
quatre lignes au lieu d'un `EffectComposer`. La courbe est persistée avec le reste du panneau,
et le préréglage contrasté la ramène à Neutre : deux postes annonçant les mêmes réglages
doivent afficher la même image.

**Le retrait du `filter: contrast()` n'est pas décidé ici.** Le sélecteur est précisément ce
qui permet de trancher à l'écran sur les emprises 200 et 600 m. Si une courbe rend le filtre
inutile, il se retirera dans un second temps.

> **Garde-fou** — si aucune courbe ne se distingue nettement de Neutre sur les deux emprises,
> ne pas changer le défaut. Le sélecteur documente alors le choix plutôt qu'il ne l'ouvre.

**Ménage associé.** `poc.py web` ne téléchargeait que les dépendances manquantes et n'en
supprimait aucune : `vendor/addons/` servait encore `Sky.js`, `GTAOPass.js`, `EffectComposer.js`
et leurs voisins, du code mort mis en ligne avec le reste. La préparation retire désormais
tout fichier absent de `VENDOR_FILES`.

### Vague 4 — le nuage LiDAR témoin, resté au réglage par défaut

Le mode « Nuage source » existait depuis longtemps, mais aucun de ses réglages n'avait jamais
été comparé à l'écran. Il cumulait quatre défauts, tous mesurés :

**A″. Des points de taille fixe, en pixels.** `PointsMaterial` recevait `size: 1.7` et
`sizeAttenuation: false` : la taille ne dépendait pas de la distance. Le nuage se lisait donc
comme un voile pointilliste uniforme de loin, et se **trouait** quand on approchait —
exactement l'inverse de ce qu'on veut. La taille s'exprime désormais en mètres, dérivée du pas
de la décimation que le pipeline annonce dans `spacingM` et `voxelM`, avec des bornes en
pixels : sans plancher le nuage s'évapore en vue générale, sans plafond il devient des disques
énormes au ras du sol, où la caméra passe le plus clair de son temps.

> Le facteur de 2,2 a été calé par comparaison de captures à la même pose, sur l'emprise
> 200 m en vue rapprochée : 0,4 m laissait voir le ciel entre les tuiles, 0,9 m referme les
> toitures sans empâter les houppiers, 1,1 m commence à noyer le feuillage. Le curseur du
> panneau couvre la plage, et le réglage par défaut est le milieu de ce qui a été validé.

**B″. Une décimation prise dans l'ordre du fichier.** L'échantillon stratifié conservait un
point sur *n* dans l'ordre de stockage COPC — donc dans l'ordre de passage du capteur, pas
dans l'espace. Un voxel de 0,40 m rend le même budget de points (744 933 contre 750 000) avec
une densité étale : **CV par mètre cube 0,66 contre 0,80**, et 17 points au lieu de 22 dans le
mètre cube le plus chargé. La grille s'élargit d'elle-même tant que le plafond n'est pas tenu,
ce qui vaut aussi pour l'emprise 600 m et ses neuf fois plus de points.

**C″. Une couleur qui ne disait que la classe.** Le LAZ porte `intensity`, `return_number` et
`scan_angle`, et l'orthophotographie recalée à 11 cm/pixel était là depuis le début : rien de
tout cela n'était lu. `COLOR_0` porte maintenant la couleur de la photographie — c'est la
pratique que décrit l'IGN pour l'exploitation architecturale du LiDAR HD — et un attribut
`_LIDAR` à quatre canaux transporte classification, réflectance et occlusion, d'où le
visualiseur tire quatre modes de couleur et un filtre par classe.

> **Le point de méthode.** La vocation du mode reste documentaire : il montre la donnée, pas
> une interprétation. C'est précisément pourquoi la classification n'a pas été *remplacée* par
> la photographie mais mise à côté d'elle, avec la légende par classe alimentée dans les
> quatre modes. Décocher une classe la masque à l'écran sans rien retirer du fichier.

**D″. Aucun ombrage.** Le nuage était le seul objet de la scène à échapper à l'occlusion
cuite. Elle y est appliquée comme ailleurs, sans un octet de plus à l'affichage.

**E″. Les deux représentations ne pouvaient pas se regarder ensemble.** Le nuage et le modèle
étaient mutuellement exclusifs, si bien que la question la plus utile qu'on puisse poser à un
jumeau numérique — *la reconstruction est-elle fidèle à la mesure ?* — n'avait pour réponse
qu'un tableau de résidus dans ce rapport. La représentation « Superposé » les affiche
ensemble ; combinée au filtre par classe, elle met la mesure des toits sur les volumes Roofer
et rend les 15 toitures dégradées visibles à l'œil.

> Deux détails la rendent lisible, et leur absence la rendrait inutilisable. Le nuage bascule
> d'emblée en couleurs de classe : deux images photo-texturées superposées se confondraient
> exactement là où il s'agit de les distinguer. Et ses points reçoivent un biais de profondeur,
> sans quoi ils grésilleraient contre le terrain — interpolé depuis la classe 2, il coïncide
> avec elle à quelques centimètres près. Le biais déplace l'affichage, jamais la mesure.
>
> **Le biais se pose en mètres, et c'est le second essai.** Écrit d'abord en profondeur
> normalisée — `gl_Position.z -= biais * gl_Position.w` —, il paraissait constant. Il ne
> l'était qu'en NDC : ramené en distance, il croît comme le carré de l'éloignement.
>
> | Distance à la caméra | Décalage réel |
> | --- | --- |
> | 100 m | ≈ 7 m |
> | 200 m | ≈ 30 m |
>
> Les points d'arrière-plan passaient donc devant les volumes qui auraient dû les masquer, et
> la végétation traversait les façades — un défaut d'autant plus trompeur qu'il ressemblait à
> de la transparence. Le décalage est désormais appliqué en espace vue, avant reprojection :
> dix centimètres, quelle que soit la distance.

**F″. Le feuillage prenait la couleur de ce qu'il surplombait.** En couleur
d'orthophotographie, un point de végétation reçoit la teinte du pixel à son aplomb : une
toiture, une route, un rocher. Les houppiers se constellaient de blanc, de rose et de gris
clair, comme s'ils poussaient du bâti. C'est la même limite que celle déjà signalée pour les
façades — faute d'imagerie oblique, la couleur vient du dessus, d'une prise de vue qui ne
coïncide ni en date ni en angle avec le tir laser. Le modèle 3D protège ses houppiers depuis
la vague 2 ; le nuage ne l'était pas.

La teinte des seules classes 3, 4 et 5 est ramenée dans `[80°, 140°]`, avec un plancher de
saturation à 0,25 et **la valeur laissée intacte** — c'est elle qui porte l'ombrage et le
relief, et l'écraser rendrait un aplat où l'on ne distinguerait plus un houppier au soleil
d'un sous-bois à l'ombre. La plage n'est pas arbitraire : c'est celle de la palette de
classification, dont les trois strates occupent 84°, 109° et 135°. Sur le run 200 m, les
312 428 points de végétation ressortent tous dans les verts, et les autres classes sont
inchangées.

> **À savoir avant d'y toucher** — le mode « Orthophotographie » ne lit pas la couleur cuite
> dans le GLB : il rééchantillonne la texture dans le fragment shader, pour que le calage suive
> les curseurs au pixel. Corriger la seule couleur cuite n'aurait donc rien changé à l'écran.
> Les deux chemins portent la correction, et les seuils voyagent dans `source-points.json`
> plutôt que d'être recopiés — deux constantes tenues en parallèle finiraient par diverger.
> La bascule « Feuillage forcé en vert » rend l'image brute, qui reste la mesure.

Rien de tout cela n'ajoute de passe de rendu : le clamp de taille, la silhouette ronde, le
filtre et le biais tiennent dans un `onBeforeCompile`. Le visualiseur n'a toujours qu'une
chaîne de rendu, et l'Eye-Dome Lighting de Potree — la réponse canonique à la lisibilité d'un
nuage — a été écarté pour cette raison, l'occlusion cuite jouant le même rôle sans
`EffectComposer`.

Le GLB passe de 12,0 à 14,9 Mo pour l'attribut supplémentaire, sans conséquence en service
local — même arbitrage que sur Draco et KTX2.

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
