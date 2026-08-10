# Style cartographique

Le service ne sert **qu’un seul style**, `carte`, conforme à la spécification MapLibre Style v8 et
bâti sur les identifiants canoniques partagés dans `@opendata-vda/shared/carto`.

```text
GET /api/v2/map/styles/carte.json
```

Les quatre styles nommés antérieurs (`plan`, `territoire`, `relief`, `hypsometrique`) ont fusionné :
ils renvoient un `404 STYLE_INCONNU` dont le message indique la route de remplacement. Ils ne
différaient que par les couches qu’ils incluaient ou omettaient, ce qui rendait une partie des
paramètres sans effet selon le style demandé.

## Paramètres

Tous sont facultatifs, et **tous ont toujours un effet** — la seule dépendance restante est celle de
`exageration` envers `terrain`.

| Paramètre | Valeurs | Défaut | Effet |
|---|---|---|---|
| `fond` | `plan`, `photo`, `satellite`, `nu` | `plan` | rend visible l’une des trois couches raster de fond, ou aucune |
| `geologie` | booléen (`1`/`true`) | `false` | visibilité de la couche BRGM, superposée à 100 % d’opacité |
| `teintes` | booléen | `false` | visibilité des teintes hypsométriques (`color-relief`) |
| `ombrage` | `aucun`, `doux`, `naturel`, `sculpte`, `multi` | `naturel` | préréglage complet de la couche `hillshade` |
| `altitude` | `standard`, `hd` | `standard` | source du modèle d’altitude (voir ci-dessous) |
| `terrain` | booléen | `false` | pose `terrain` **et** `sky` |
| `exageration` | 0,5 à 3 | `1,3` | exagération du terrain 3D uniquement |
| `prefixe` | `^[a-z][a-z0-9-]{0,20}$` | — | préfixe tous les identifiants de sources et de couches |

Une valeur d’`ombrage` hors liste, un `fond` inconnu, une exagération hors bornes ou un préfixe
invalide donnent un `400 OPTIONS_STYLE_INVALIDES` dont le message décrit l’attendu.

## Toutes les couches sont toujours présentes

Une couche non demandée est en `visibility: none`, jamais absente. Les consommateurs peuvent donc
basculer un fond, une opacité ou une teinte par `setLayoutProperty` / `setPaintProperty` sans
recharger le style, et leurs `map.getLayer(…)` défensifs ne deviennent jamais des no-op silencieux.
MapLibre ne charge pas les tuiles d’une source dont aucune couche visible ne dépend : le style
complet ne coûte donc rien de plus qu’un style partiel.

Sources :

```text
fond-plan-src
fond-photo-src
fond-satellite-src
geologie-src
relief-dem-src
relief-terrain-src
```

Chaque source raster porte le `maxzoom` de la couverture réelle de son amont — plan et photographie
19, satellite 17, géologie 16. Sans ce plafond, MapLibre réclame des tuiles jusqu’à z22 : l’IGN
expire au bout de huit secondes, le service répond 502 et la carte affiche « le style ou une tuile
n’a pas pu être chargé », là où un simple agrandissement aurait suffi.

Couches, dans leur ordre d’empilement :

```text
basemap-plan
basemap-photo
basemap-satellite
geologie-layer
relief-color
relief-hillshade
```

## Préréglages d’ombrage

Chaque préréglage encapsule un algorithme MapLibre (≥ 5.5) et son éclairage, pour qu’un appelant
choisisse une intention plutôt que des radians.

| Préréglage | `hillshade-method` | Intention |
|---|---|---|
| `aucun` | — (couche masquée) | fond nu |
| `doux` | `igor` | modelé discret qui n’assombrit pas le fond : sous la photographie aérienne et le plan IGN |
| `naturel` | `basic` | éclairage lambertien du nord-ouest à 45°, lecture physique du terrain |
| `sculpte` | `combined` | intensité liée à la pente : crêtes, ravins et gorges ressortent |
| `multi` | `multidirectional` | quatre sources (225°, 270°, 315°, 360°) : aucun versant dans une ombre plate |

Trois invariants, tirés du shader `hillshade.fragment.glsl` de MapLibre :

- `hillshade-illumination-anchor` vaut toujours `map`. Laissé à son défaut `viewport`, le moteur
  ajoute le cap de la caméra à l’azimut : l’ombrage tourne alors avec la vue, ce qui ruine la
  lecture du relief dès qu’on pivote en 3D.
- `hillshade-accent-color` n’est lu que par la méthode `standard`, et `hillshade-illumination-altitude`
  est ignoré par `standard` et `igor` : ces propriétés ne sont posées que là où elles agissent.
- Le nombre de sources lumineuses compilé dans le shader vaut **exactement** la longueur de
  `hillshade-highlight-color`. Le préréglage `multi` fournit donc quatre teintes de highlight ; avec
  une seule, ses quatre azimuts seraient silencieusement réduits à un.

## Relief

### Deux sources pour une même donnée

Lorsque `terrain=true`, le style déclare **deux fois** le modèle d’altitude, sur les mêmes tuiles :
`relief-dem-src` alimente l’ombrage et les teintes, `relief-terrain-src` alimente le terrain 3D.

Ce n’est pas une redondance. MapLibre dégrade toute source `raster-dem` branchée sur `terrain` : son
gestionnaire de tuiles passe en `usedForTerrain`, sa taille de tuile est doublée
(`TerrainTileManager`, `deltaZoom = 1`, *« raster-dem tiles will load for performance the
actualZoom - deltaZoom zoom-level »*) et le niveau de zoom demandé descend donc d’un cran. Une couche
d’ombrage partageant cette source se calculerait sur un relief deux fois moins résolu que celui
disponible — perte invisible dans le style, bien visible à l’écran. C’est le motif retenu par les
exemples officiels MapLibre et Mapterhorn.

La source de terrain est en outre annoncée en `tileSize: 256`. Le gestionnaire de terrain doublant
cette valeur, la grille revient au zoom affiché au lieu du zoom - 1, ce qui **double la finesse du
maillage 3D**. Les tuiles restent physiquement en 512 px : cette taille ne pilote que le niveau de
zoom demandé, jamais le décodage, qui lit les dimensions réelles de l’image. Contrepartie : environ
quatre fois plus de tuiles d’altitude chargées en vue 3D. `TERRAIN_TILESIZE` dans
`packages/shared/src/carto.ts` ramène au comportement économe si le compromis ne convient pas.

### Données : `altitude=standard` ou `hd`

En **`standard`** (défaut), le modèle d’altitude vient des archives PMTiles montées sur le service,
servies par `/api/v2/map/relief/{z}/{x}/{y}.webp` — l’extension `.png` reste acceptée pour les
clients déjà déployés, mais **les tuiles sont des WebP sans perte** (VP8L) et le service annonce
désormais leur type réel. L’encodage est terrarium, en tuiles de 512 px, jusqu’à `RELIEF_MAXZOOM`
(15), soit environ 1,7 m/px. Au-delà, MapLibre se contente d’agrandir : les terrasses de culture
cévenoles, que le modèle résout bien, s’épaississent au lieu de se préciser.

En **`hd`**, les deux sources d’altitude basculent sur `/api/v2/map/relief-hd/{z}/{x}/{y}.png`
(`maxzoom` 16). Jusqu’à `RELIEF_MAXZOOM` (15), cette route sert les mêmes archives PMTiles : elles
sont aussi fines à ces niveaux, et la pyramide reste ainsi complète — MapLibre charge les tuiles
parentes pendant les déplacements, jusqu’à `0/0/0`, et se verrait sinon refuser tous les niveaux du
dessous. En z16, elle produit la tuile à la demande depuis le **RGE ALTI 1 m** de la Géoplateforme :
c’est exactement le niveau où les archives n’ont plus de détail à donner, et le dernier où la source
en a encore.

#### Deux pièges, et un seul quadrillage

Le mode `hd` a longtemps couvert la carte d’un quadrillage régulier que l’ombrage rendait en traits
noirs. Deux causes distinctes, toutes deux invisibles depuis le nom des paramètres.

**Le système.** La pyramide EPSG:3857 des couches altimétriques est sur-échantillonnée au plus
proche voisin dès qu’on demande plus fin qu’elle. Sur une tuile z16 en BIL 512 px, 384 colonnes sur
511 étaient la copie exacte de leur voisine ; en z17, 448 sur 511. Ces colonnes recopiées forment
des plateaux, et l’ombrage — qui dérive la pente — rend chaque marche comme un trait. Le service
demande donc la grille en **EPSG:2154** et la reprojette lui-même, en bilinéaire, vers la grille de
la tuile (`src/domain/lambert93.ts`, `src/services/relief-ign.ts`).

**La couche.** Passer en Lambert a supprimé les colonnes dupliquées sans supprimer le quadrillage :
`ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES`, malgré son nom, est servie depuis une pyramide plafonnée
à 4,78 m/px **quel que soit le système demandé**. Le Lambert n’avait fait que remplacer la
duplication franche par une interpolation — laquelle ne recopie plus rien, mais laisse à chaque
maille un raccord de pente que l’ombrage souligne tout autant. Mesure du pic spectral de la dérivée
seconde sur les tuiles produites :

| Couche | Période du réseau | Force du pic |
|---|---|---|
| `ELEVATION.…HIGHRES`, z16 | 4,02 px = **3,46 m** au sol | ×19 à ×67 |
| `ELEVATION.…HIGHRES`, z17 | 7,97 px = **3,43 m** au sol | ×31 à ×82 |
| `RGEALTI-MNT_PYR-ZIP_FXX_LAMB93_WMS`, z16 | aucun réseau court | ×7,5 à ×11 (fond naturel) |

3,45 m au sol vaut exactement `4,777 m/px × cos(44°)` : la signature du niveau 15 de la pyramide
Web Mercator. La couche `RGEALTI-MNT_PYR-ZIP_FXX_LAMB93_WMS` est la pyramide native — elle duplique
franchement si on lui demande mieux que 1 m, et ne porte plus aucun réseau à 1 m pile.

Contrepartie : c’est un nom de pyramide interne, moins stable qu’un identifiant `ELEVATION.*`, et
limité à la France métropolitaine en Lambert-93. La variable `IGN_ALTIMETRIE_LAYER` permet d’en
changer sans reconstruire l’image.

L’emprise Lambert est calée sur une grille métrique globale : sans ce calage, deux tuiles voisines
interpoleraient le même relief sur des phases différentes et l’ombrage soulignerait la couture. Les
altitudes obtenues coïncident à moins d’un mètre avec le service d’altimétrie ponctuel de l’IGN.

#### Pourquoi le mode `hd` s’arrête à z16

Une tuile z16 de 512 px vaut 0,86 m/px : **déjà plus fin que la source de 1 m**. Un niveau de plus
n’apporterait aucune donnée, seulement une interpolation 2,33×, et c’est précisément là que le
réseau de la grille métrique redevenait visible — pic à 2,33 px, jusqu’à 30 fois le fond sur les
terrains lisses, quand z16 reste au niveau du fond naturel. Une interpolation C¹ (Catmull-Rom) le
ramenait à ×20 : atténué, pas éliminé. Au-delà de z16, MapLibre agrandit donc la tuile z16 — ce que
notre interpolation ferait de toute façon, mais sans figer le motif dans la donnée.

La bascule est totale et jamais partielle : les deux modèles ne coïncidant pas au mètre près,
mélanger les niveaux créerait des ressauts aux jointures.

Contreparties du mode `hd` : il **dépend de la Géoplateforme en temps réel** au-delà de z15 — une
lenteur IGN se voit sur le relief, là où les archives fonctionnent hors ligne — et chaque tuile
coûte une requête amont (de l’ordre de 800 Ko), une reprojection et un encodage PNG, amortis par le
cache mémoire (`x-cache: hit|miss`) et un `cache-control` de 30 jours.

La géométrie 3D, elle, est bornée par MapLibre : `meshSize` vaut 128 quads par tuile de rendu et
n’est pas exposé au style. Les leviers de qualité restent donc l’ombrage, les teintes et
l’exagération, pas la densité du maillage.

## Caméra et interactions

Le style ne fixe pas le centre, le zoom, le pitch, le bearing, le hash ni les contrôles. Ces
éléments restent sous la responsabilité du composant consommateur.

## Sources de vérité

- fonds, identifiants, palette hypsométrique, préréglages d’ombrage et ciel : `packages/shared/src/carto.ts` ;
- génération du style : `apps/map-service/src/domain/styles.ts` ;
- compatibilité des îlots existants : `apps/web/src/lib/carte.ts` — `urlCarte()` cible le style
  unique ; `urlStyle(nom, options)` reste en place, **déprécié**, et traduit l’ancien nom en options
  le temps que les îlots migrent.
