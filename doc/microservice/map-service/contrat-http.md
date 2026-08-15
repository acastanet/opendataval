# Contrat HTTP — Map Service

Toutes les routes publiques sont servies sous `/api/v2/map` directement par Caddy.

## Style

```text
GET /api/v2/map/styles/carte.json
```

Un seul style est servi. Paramètres facultatifs : `fond` (`plan`, `photo`, `satellite`, `nu`),
`fondOpaque` (booléen, défaut `true`), `geologie`, `teintes`, `ombrage` (`aucun`, `doux`, `naturel`,
`sculpte`, `multi`), `altitude` (`standard`, `hd`), `terrain`, `exageration` (0,5 à 3) et `prefixe`.
Voir [`styles.md`](styles.md).

Les styles nommés `plan`, `territoire`, `relief` et `hypsometrique` ont fusionné dans `carte` :
ils renvoient un `404 STYLE_INCONNU` indiquant la route de remplacement.

## Tuiles

```text
GET /api/v2/map/tiles/{source}/{z}/{x}/{y}.{ext}
GET /api/v2/map/relief/{z}/{x}/{y}.webp
GET /api/v2/map/relief-hd/{z}/{x}/{y}.png
```

Sources : `plan`, `photo`, `satellite`, `geologie`, `radar`. Le radar exige un paramètre `path` validé contre le format des frames RainViewer.

Les tuiles de relief sont des WebP sans perte encodés en terrarium, servis en `image/webp` ;
`/api/v2/map/relief/{z}/{x}/{y}.png` reste accepté pour les clients déjà déployés et renvoie les
mêmes octets.

Le relief est servi par région (voir [`README.md`](README.md#régions-de-relief)) et ne couvre pas
tout le territoire : une tuile qu’aucune archive montée ne porte renvoie `404 TUILE_RELIEF_ABSENTE`.
Le `503 RELIEF_INDISPONIBLE` est réservé au cas où **aucune** région n’a ses archives.

`relief-hd` couvre la même pyramide, du zoom 0 au zoom 16. Jusqu’au zoom 15 elle sert les archives
PMTiles, à l’identique de `relief` ; au zoom 16 elle produit la tuile à la demande depuis le RGE
ALTI 1 m de la Géoplateforme — requête WMS en BIL 32 bits **en EPSG:2154**, reprojection bilinéaire
vers la grille mercator, ré-encodage terrarium, PNG. Au-delà du zoom 16 : `400 TUILE_INVALIDE` ;
amont indisponible : `502 TUILE_AMONT_INDISPONIBLE` (`retryable`) ; aucune archive montée sous le
zoom 16 : `503 RELIEF_INDISPONIBLE`.

Ni le système de la requête, ni la couche interrogée, ni le plafond de zoom ne sont des détails
d’implémentation : chacun des trois a produit à lui seul un quadrillage visible sur la carte. La
couche par défaut (`IGN_ALTIMETRIE_LAYER`) est la pyramide native du RGE ALTI, et non la couche
`ELEVATION.*` dont le nom le laisserait croire. Voir [`styles.md`](styles.md).

En-têtes :

- `x-request-id` sur toutes les réponses ;
- `x-cache: hit|miss` pour les tuiles conservées en mémoire ;
- `x-tuile: indisponible` lorsqu’un fond amont n’a pas répondu ;
- `cache-control` adapté à la durée de vie de la ressource.

**Dégradation des fonds.** Une tuile de fond que l’amont ne rend pas — typiquement un délai dépassé
sur une liaison lente — est servie vide (PNG transparent, `200`, `x-tuile: indisponible`,
`cache-control: no-store`) au lieu d’un `502` que MapLibre relaierait à la console en trouant la
carte. Elle n’est mémorisée nulle part : la vraie tuile revient dès que l’amont répond. Les
journaux et `/internal/v1/map/metrics` continuent de comptabiliser l’échec.

Le relief n’est jamais dégradé ainsi : une altitude nulle creuserait un cratère dans le terrain,
bien plus visible qu’une tuile manquante. Le délai amont par défaut est de 20 s
(`MAP_UPSTREAM_TIMEOUT_MS`) ; seules les coupures immédiates sont réessayées, un dépassement de
délai ne l’est pas.

## Légendes

```text
GET /api/v2/map/legends
GET /api/v2/map/legends/{layer}
```

Les réponses contiennent uniquement des informations visuelles : libellés, couleurs, géométrie, clustering, pointillés ou paliers.

## Erreurs JSON

```json
{
  "error": {
    "code": "TUILE_INVALIDE",
    "message": "Les coordonnées de tuile sont invalides.",
    "retryable": false
  },
  "requestId": "..."
}
```

Les réponses binaires valides ne sont jamais enveloppées dans du JSON.
