# Styles cartographiques

Les styles suivent la spécification MapLibre Style v8 et utilisent des identifiants canoniques partagés dans `@opendata-vda/shared/carto`.

| Style | Usage |
|---|---|
| `plan` | Fond Plan IGN minimal et glyphes locaux |
| `territoire` | Plan, photographie, satellite et géologie |
| `relief` | Style territoire complété par le DEM, le hillshade, le terrain et le ciel |
| `hypsometrique` | Palette d’altitude, hillshade, terrain et fonds drapables |

## Identifiants canoniques

Sources :

```text
fond-plan-src
fond-photo-src
fond-satellite-src
geologie-src
relief-dem-src
```

Couches :

```text
basemap-plan
basemap-photo
basemap-satellite
geologie-layer
relief-hillshade
relief-color
```

Le paramètre `prefixe` ajoute une chaîne validée devant tous les identifiants lorsqu’une même carte doit composer plusieurs ensembles de styles.

## Caméra et interactions

Le style ne fixe pas le centre, le zoom, le pitch, le bearing, le hash ni les contrôles. Ces éléments restent sous la responsabilité du composant consommateur.

## Sources de vérité

- fonds, identifiants, relief et palettes : `packages/shared/src/carto.ts` ;
- génération du style : `apps/map-service/src/domain/styles.ts` ;
- compatibilité des îlots existants : `apps/web/src/lib/carte.ts`.
