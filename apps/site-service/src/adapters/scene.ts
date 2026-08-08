import type { SceneDalle } from "@opendata-vda/shared/dalle";

/**
 * Adaptateur de scène 3D (lot P4, `agent/mvp/08-BACKLOG.md`). Pour M1
 * (`05-M1-VERTICAL-SLICE.md` § « Acceptable temporairement »), rattache une scène déjà
 * produite par `poc/valleraugue-mairie-3d` plutôt que d'en fabriquer une : cette interface
 * sera réimplémentée par un déclenchement réel du pipeline (lot P8) sans changer les
 * appelants (`fabrication.ts`).
 */
export interface ClientScene {
  rattacher(): Promise<SceneDalle | null>;
}

export interface ConfigClientScene {
  /**
   * URL relative au domaine (`/valleraugue-3d/...`) ou absolue de la scène de démonstration.
   * `null` ou vide : aucune scène n'est rattachée.
   */
  glbUrl: string | null;
}

/**
 * Emprise Lambert-93 réelle de la scène `maison-200m` (`poc/valleraugue-mairie-3d/publication/
 * assets/scenes.json`), recopiée ici plutôt que dérivée de la dalle : tant que cette scène
 * n'est pas produite POUR la dalle créée, une bbox dérivée de ses coordonnées serait fausse et
 * moins bonne que le repli du moteur sur l'emprise réelle du modèle chargé (ADR-011).
 */
const TERRAIN_BBOX_MAISON_200M: [number, number, number, number] = [754601.0, 6329635.0, 754831.0, 6329865.0];
const ORTHOPHOTO_SIZE_PX_MAISON_200M = 2048;
const ORTHOPHOTO_RESOLUTION_M_MAISON_200M = 0.1123046875;

/**
 * Rattachement provisoire et non géométrique : la scène attachée décrit un lieu réel du POC,
 * pas nécessairement la dalle créée. `terrain`/`orthophoto` restent `null` — le GLB de
 * `poc/valleraugue-mairie-3d` embarque déjà terrain, bâti et végétation en un seul actif.
 */
export function creerClientSceneProvisoire({ glbUrl }: ConfigClientScene): ClientScene {
  return {
    async rattacher() {
      if (!glbUrl) return null;
      const estScenePoc = glbUrl.includes("/valleraugue-3d/assets/") && glbUrl.endsWith("/scene.glb");
      const dossier = glbUrl.slice(0, -"scene.glb".length);
      const estMaison200m = estScenePoc && glbUrl.includes("/maison-200m/");
      return {
        glb: glbUrl,
        terrain: null,
        orthophoto: null,
        ...(estScenePoc ? { metadata: `${dossier}scene.json` } : {}),
        ...(estMaison200m
          ? {
              sourcePoints: {
                glb: `${dossier}source-points.glb`,
                metadata: `${dossier}source-points.json`,
              },
              geology: {
                texture: `${dossier}geology.png`,
                pick: `${dossier}geology-pick.png`,
                metadata: `${dossier}geology.json`,
              },
              terrainBbox: TERRAIN_BBOX_MAISON_200M,
              orthophotoSizePx: ORTHOPHOTO_SIZE_PX_MAISON_200M,
              orthophotoResolutionM: ORTHOPHOTO_RESOLUTION_M_MAISON_200M,
            }
          : {}),
      };
    },
  };
}
