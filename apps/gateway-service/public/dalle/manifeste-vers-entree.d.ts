/**
 * Déclarations minimales pour les tests qui importent `manifeste-vers-entree.js` (non compilé
 * par `tsc` — le `tsconfig` du gateway n'inclut que `src` et `test`, sur le modèle de
 * `modules/index.d.ts`).
 */
export function entreeDepuisManifeste(manifeste: any): {
  id: string;
  label: string;
  run: string | null;
  scene: string | null;
  metadata: string | null;
  sourcePoints: string | null;
  sourcePointsMetadata: string | null;
  orthophotoCalage: { estM: number; nordM: number } | null;
  title: string;
  subtitle: string;
  centreLabel: string;
  configuration: {
    centreWgs84: [number, number];
    terrainBbox: [number, number, number, number] | null;
    orthophotoLayer: string;
    orthophotoSizePx: number | null;
    orthophotoResolutionM: number | null;
    geology: { texture: string; pick: string; metadata: string } | null;
  };
};
