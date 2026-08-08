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
      return {
        glb: glbUrl,
        terrain: null,
        orthophoto: null,
        ...(estScenePoc ? { metadata: `${dossier}scene.json` } : {}),
        ...(estScenePoc && glbUrl.includes("/maison-200m/")
          ? {
              sourcePoints: {
                glb: `${dossier}source-points.glb`,
                metadata: `${dossier}source-points.json`,
              },
            }
          : {}),
      };
    },
  };
}
