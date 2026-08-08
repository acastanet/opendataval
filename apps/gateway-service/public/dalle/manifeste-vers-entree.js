/**
 * Traduction du manifeste de dalle (camelCase, embarqué dans la page) vers l'entrée que le
 * moteur three.js attend — sans dépendre de `three` : ce fichier doit rester importable sous
 * Node (tests de parité avec le POC) sans charger tout le moteur graphique.
 *
 * `configuration.terrainBbox` n'est JAMAIS dérivé de `identity.geometryProjected` (l'emprise
 * de la dalle) : tant que la scène rattachée est celle du POC et non une scène produite pour
 * cette dalle précise, une bbox dérivée serait fausse — la scène `maison-200m` fait 230 m
 * autour d'un centre légèrement différent, pas 200 m autour du centre de la dalle. Seule la
 * bbox réelle de la scène, si `scene.terrainBbox` la porte, est transmise ; sinon le moteur
 * retombe sur l'emprise du modèle chargé, qui est exacte. Voir ADR-011,
 * `agent/mvp/09-DECISIONS.md`.
 */
export function entreeDepuisManifeste(manifeste) {
  const identite = manifeste.identity;
  const sceneDalle = manifeste.scene;
  return {
    id: identite.tileId,
    label: identite.title ?? identite.tileId,
    run: manifeste.production?.pipelineVersion ?? null,
    scene: sceneDalle?.glb ?? null,
    metadata: sceneDalle?.metadata ?? null,
    sourcePoints: sceneDalle?.sourcePoints?.glb ?? null,
    sourcePointsMetadata: sceneDalle?.sourcePoints?.metadata ?? null,
    orthophotoCalage: sceneDalle?.orthophotoCalage ?? null,
    title: identite.title ?? `Dalle ${identite.tileId}`,
    subtitle: [
      sceneDalle?.sourcePoints ? "IGN LiDAR HD" : null,
      identite.address,
      `${identite.widthM} × ${identite.heightM} m`,
    ].filter(Boolean).join(" · "),
    centreLabel: "Centre de la dalle",
    configuration: {
      centreWgs84: [identite.center.lat, identite.center.lon],
      terrainBbox: sceneDalle?.terrainBbox ?? null,
      orthophotoLayer: "ORTHOIMAGERY.ORTHOPHOTOS",
      orthophotoSizePx: sceneDalle?.orthophotoSizePx ?? null,
      orthophotoResolutionM: sceneDalle?.orthophotoResolutionM ?? null,
      geology: sceneDalle?.geology ?? null,
    },
  };
}
