import type pg from "pg";
import { empriseDalle } from "@opendata-vda/shared/dalle-geometrie";
import { transitionValide, type EtatDalle, type ManifesteDalle, type StatutRevue } from "@opendata-vda/shared/dalle";
import { genererTileId } from "./tile-id.js";
import { construireManifesteInitial, ecrireManifesteAtomique, lireManifeste, repertoireInstance } from "./manifeste.js";
import { demarrerEtape, terminerEtape } from "./journal.js";

export interface CreationDalle {
  lat: number;
  lon: number;
  title?: string | null;
}

function validerCoordonnees({ lat, lon }: CreationDalle): void {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error(`latitude invalide : ${lat}`);
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw new Error(`longitude invalide : ${lon}`);
}

/**
 * Crée une instance : géométrie, `tile_id`, index PostgreSQL, puis manifeste initial sur
 * disque. L'écriture du manifeste est l'étape journalisée et bloquante
 * (`04-SITE-SERVICE.md` § « Tolérance aux pannes ») ; son échec bascule l'instance en
 * `failed` plutôt que de laisser un index sans manifeste correspondant.
 */
export async function createInstance(pool: pg.Pool, instancesDir: string, entree: CreationDalle): Promise<ManifesteDalle> {
  validerCoordonnees(entree);
  const emprise = empriseDalle(entree.lat, entree.lon);
  const tileId = await genererTileId(pool);
  const manifeste = construireManifesteInitial(tileId, emprise, entree.title ?? null);

  await pool.query(`insert into sites.instances (tile_id, lat, lon, title) values ($1, $2, $3, $4)`, [
    tileId,
    entree.lat,
    entree.lon,
    entree.title ?? null,
  ]);

  const etapeId = await demarrerEtape(pool, tileId, "creation");
  try {
    await ecrireManifesteAtomique(repertoireInstance(instancesDir, tileId), manifeste);
    await terminerEtape(pool, etapeId, "succes");
  } catch (error) {
    await terminerEtape(pool, etapeId, "echec", (error as Error).message);
    await pool.query(`update sites.instances set status = 'failed', updated_at = now() where tile_id = $1`, [tileId]);
    throw error;
  }

  return manifeste;
}

/** Lit le dossier logique d'une instance. `null` si elle n'existe pas. */
export async function getInstance(instancesDir: string, tileId: string): Promise<ManifesteDalle | null> {
  return lireManifeste(repertoireInstance(instancesDir, tileId));
}

export interface TransitionDemandee {
  versEtat: EtatDalle;
  /** Omis pour les transitions qui ne touchent pas la revue humaine : celle-ci est conservée telle quelle. */
  revue?: StatutRevue;
}

/**
 * Fait progresser une instance dans son cycle de fabrication. Le manifeste sur disque est la
 * source de vérité de l'état courant ; l'index PostgreSQL n'en est qu'un miroir pour les
 * listes et filtres (`01-ARCHITECTURE.md` § « Stockage MVP »).
 */
export async function transitionerInstance(
  pool: pg.Pool,
  instancesDir: string,
  tileId: string,
  { versEtat, revue }: TransitionDemandee,
): Promise<ManifesteDalle> {
  const dir = repertoireInstance(instancesDir, tileId);
  const manifeste = await lireManifeste(dir);
  if (!manifeste) throw new Error(`transitionerInstance : instance ${tileId} introuvable`);

  const revueEffective = revue ?? manifeste.review.status;
  if (!transitionValide(manifeste.status, versEtat, revueEffective)) {
    throw new Error(`transition refusée : ${manifeste.status} → ${versEtat} (revue ${revueEffective})`);
  }

  const suivant: ManifesteDalle = {
    ...manifeste,
    status: versEtat,
    review: revue ? { ...manifeste.review, status: revue } : manifeste.review,
  };

  await ecrireManifesteAtomique(dir, suivant);
  await pool.query(
    `update sites.instances set status = $2, review_status = $3, updated_at = now() where tile_id = $1`,
    [tileId, suivant.status, suivant.review.status],
  );

  return suivant;
}
