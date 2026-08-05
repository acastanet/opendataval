# Application Périmètre OLD

> Application cartographique d’aide à la préparation des obligations légales de débroussaillement.
> Dernière mise à jour et vérification : 2026-08-02

## Accès

- développement Astro : `http://localhost:4321/old/` ;
- stack Compose : `http://localhost:8080/old/` ;
- après publication sous le préfixe actuel : `https://euporie.cloud/val-daigoual/old/`.

La publication sur `euporie.cloud` nécessite encore le build et le redéploiement de la stack ; l’URL indique la cible, pas l’état du serveur avant déploiement.

## Fonctions

- coordonnées préremplies sur `44.06455556, 3.68302778` ;
- sélection par clic ou géolocalisation ;
- calcul par `GET /api/v2/old/perimetre` ;
- orthophotographie et Plan IGN via `/api/v2/map/*` ;
- couches distinctes : périmètre, bâtiment source et parcelle ;
- exports GeoJSON, KML et impression/PDF ;
- avertissements sur la précision, la voie privée et la vérification de terrain.

Le calcul API reste utilisable si WebGL ou la carte sont indisponibles.

## Code

- page : `apps/web/src/pages/old.astro` ;
- composant : `apps/web/src/islands/OldPerimetre.svelte` ;
- service métier : `apps/old-service/` ;
- documentation du contrat et de la méthode : [`../../microservice/old-service/README.md`](../../microservice/old-service/README.md).

## Validation

```bash
pnpm build:web
pnpm check:old
pnpm check:gateway
```

La vérification visuelle du 2 août 2026 confirme la superposition de l’orthophoto IGN, de l’emprise BD TOPO, de la parcelle cadastrale et du tampon calculé.
