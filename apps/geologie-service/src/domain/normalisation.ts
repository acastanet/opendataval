import type { BssFeature } from "../clients/brgm.js";
import type { OuvrageBss } from "../types.js";
import type { CentreLambert93 } from "./bbox.js";
import { distanceLambert93 } from "./bbox.js";

/**
 * Les 134 propriétés renvoyées par le WFS BRGM sont toutes des chaînes, vides quand la
 * valeur est absente. `Number("")` vaut `0` : passer par ce garde-fou évite d'inventer une
 * profondeur ou une altitude de zéro mètre là où le BRGM n'a simplement rien renseigné.
 */
function nombreOuNull(valeur: string | undefined): number | null {
  if (!valeur || !valeur.trim()) return null;
  const parsed = Number(valeur);
  return Number.isFinite(parsed) ? parsed : null;
}

function texteOuNull(valeur: string | undefined): string | null {
  if (!valeur || !valeur.trim()) return null;
  return valeur.trim();
}

/**
 * `documents` arrive sous la forme `"COUPE-GEOLOGIQUE,PERMEABILITE."`, séparée par des
 * virgules et terminée par un point.
 */
function listeDocuments(valeur: string | undefined): string[] {
  if (!valeur) return [];
  return valeur
    .replace(/\.\s*$/, "")
    .split(",")
    .map((doc) => doc.trim().toUpperCase())
    .filter((doc) => doc.length > 0);
}

export function normaliserFeature(feature: BssFeature, centre: CentreLambert93): OuvrageBss | null {
  const props = feature.properties ?? {};
  const bssId = texteOuNull(props.bss_id);
  if (!bssId) return null;

  const xL93 = nombreOuNull(props.x_ref06);
  const yL93 = nombreOuNull(props.y_ref06);
  if (xL93 === null || yL93 === null) return null;

  const natureBrut = texteOuNull(props.nature);
  const nature = (natureBrut ?? "").toUpperCase();
  const modeExecution = texteOuNull(props.mode_execution);
  const modeExecutionMaj = (modeExecution ?? "").toUpperCase();
  const coupeGeologique = (texteOuNull(props.coupe_geologique) ?? "").toUpperCase();
  const documents = listeDocuments(props.documents);
  const nbScansCoupe = nombreOuNull(props.nb_scans_coupe) ?? 0;

  const reference = texteOuNull(props.reference);

  return {
    bss_id: bssId,
    ancien_code_bss: reference,
    designation: texteOuNull(props.designation),
    nature_brgm: natureBrut,

    distance_m: distanceLambert93(centre, xL93, yL93),
    x_l93: xL93,
    y_l93: yL93,

    profondeur_m: nombreOuNull(props.prof_atteinte),
    altitude_m: nombreOuNull(props.zsol),
    mode_execution: modeExecution,
    commune_bss: texteOuNull(props.nom_commune),
    lieu_dit: texteOuNull(props.lieu_dit),

    longitude: nombreOuNull(props.longitude),
    latitude: nombreOuNull(props.latitude),

    is_borehole: nature === "FORAGE",
    is_sounding: nature.startsWith("SONDAGE"),
    is_core_sample: modeExecutionMaj.includes("CAROTT"),
    has_geological_section: coupeGeologique === "PRESENTE",
    has_geological_section_document: documents.includes("COUPE-GEOLOGIQUE"),
    has_geological_section_scan: nbScansCoupe > 0,

    documents,
    fiche_infoterre: reference
      ? `http://ficheinfoterre.brgm.fr/InfoterreFiche/ficheBss.action?id=${encodeURIComponent(reference)}`
      : null,
  };
}
