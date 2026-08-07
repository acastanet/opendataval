import type pg from "pg";
import type { DonneeDalle, ManifesteDalle } from "@opendata-vda/shared/dalle";
import { transitionerInstance } from "./instances.js";
import { ecrireManifesteAtomique, lireManifeste, repertoireInstance } from "./manifeste.js";
import { demarrerEtape, terminerEtape } from "./journal.js";
import type { ClientGeographie } from "./adapters/geography.js";
import type { ClientScene } from "./adapters/scene.js";

export interface ClientsFabrication {
  geographie: ClientGeographie;
  scene: ClientScene;
}

function fusionnerDonnees(manifeste: ManifesteDalle, donnees: DonneeDalle[]): ManifesteDalle {
  const data = { ...manifeste.data };
  for (const donnee of donnees) {
    data[donnee.sphere] = [...(data[donnee.sphere] ?? []), donnee];
  }
  return { ...manifeste, data };
}

/**
 * Déclenche l'enrichissement minimal de M1 (`05-M1-VERTICAL-SLICE.md`) : appelle
 * l'adaptateur géographie et l'adaptateur de scène (lot P4), fusionne leurs résultats dans le
 * manifeste, puis fait progresser l'instance jusqu'à `generated`. Les deux appels sont
 * journalisés mais non bloquants — un échec, y compris inattendu, laisse simplement la
 * donnée ou la scène absente plutôt que d'interrompre la fabrication ; seule l'écriture du
 * manifeste reste bloquante (`04-SITE-SERVICE.md` § « Tolérance aux pannes »).
 */
export async function lancerFabrication(
  pool: pg.Pool,
  instancesDir: string,
  tileId: string,
  clients: ClientsFabrication,
): Promise<ManifesteDalle> {
  await transitionerInstance(pool, instancesDir, tileId, { versEtat: "collecting" });

  const dir = repertoireInstance(instancesDir, tileId);
  const manifeste = await lireManifeste(dir);
  if (!manifeste) throw new Error(`lancerFabrication : instance ${tileId} introuvable`);

  const etapeEnrichissement = await demarrerEtape(pool, tileId, "enrichissement_geographie");
  let donnees: DonneeDalle[] = [];
  try {
    donnees = await clients.geographie.resoudre(manifeste.identity.center.lat, manifeste.identity.center.lon);
    await terminerEtape(pool, etapeEnrichissement, "succes");
  } catch (error) {
    await terminerEtape(pool, etapeEnrichissement, "echec", (error as Error).message);
  }

  const etapeScene = await demarrerEtape(pool, tileId, "rattachement_scene");
  let scene: ManifesteDalle["scene"] = undefined;
  try {
    scene = (await clients.scene.rattacher()) ?? undefined;
    await terminerEtape(pool, etapeScene, "succes");
  } catch (error) {
    await terminerEtape(pool, etapeScene, "echec", (error as Error).message);
  }

  const enrichi = { ...fusionnerDonnees(manifeste, donnees), ...(scene ? { scene } : {}) };
  const etapeEcriture = await demarrerEtape(pool, tileId, "ecriture_manifeste_enrichi");
  try {
    await ecrireManifesteAtomique(dir, enrichi);
    await terminerEtape(pool, etapeEcriture, "succes");
  } catch (error) {
    await terminerEtape(pool, etapeEcriture, "echec", (error as Error).message);
    await pool.query(`update sites.instances set status = 'failed', updated_at = now() where tile_id = $1`, [tileId]);
    throw error;
  }

  return transitionerInstance(pool, instancesDir, tileId, { versEtat: "generated" });
}
