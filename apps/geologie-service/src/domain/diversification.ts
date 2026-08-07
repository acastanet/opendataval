import type { Candidat } from "../types.js";
import { similarite } from "./similarite.js";

export const TAILLE_SHORTLIST_MAX = 15;

/** Meilleur candidat éligible, avec départage systématique par distance croissante. */
function meilleurPar(candidats: Candidat[], eligible: (c: Candidat) => boolean): Candidat | undefined {
  let meilleur: Candidat | undefined;
  for (const candidat of candidats) {
    if (!eligible(candidat)) continue;
    if (
      !meilleur ||
      candidat.base_score > meilleur.base_score ||
      (candidat.base_score === meilleur.base_score && candidat.distance_m < meilleur.distance_m)
    ) {
      meilleur = candidat;
    }
  }
  return meilleur;
}

function plusProche(candidats: Candidat[]): Candidat | undefined {
  let meilleur: Candidat | undefined;
  for (const candidat of candidats) {
    if (!meilleur || candidat.distance_m < meilleur.distance_m) meilleur = candidat;
  }
  return meilleur;
}

interface RoleProtege {
  nom: string;
  trouver: (candidats: Candidat[]) => Candidat | undefined;
}

const ROLES_PROTEGES: RoleProtege[] = [
  { nom: "plus_proche", trouver: plusProche },
  {
    nom: "meilleur_forage_documente",
    trouver: (cs) =>
      meilleurPar(cs, (c) => c.is_borehole && (c.has_geological_section || c.has_geological_section_document)) ??
      meilleurPar(cs, (c) => c.is_borehole),
  },
  { nom: "meilleur_sondage", trouver: (cs) => meilleurPar(cs, (c) => c.is_sounding) },
  { nom: "meilleur_carottage", trouver: (cs) => meilleurPar(cs, (c) => c.is_core_sample) },
  { nom: "meilleure_coupe", trouver: (cs) => meilleurPar(cs, (c) => c.has_geological_section) },
];

/**
 * Sélectionne les candidats protégés (§14 de la mission). Les recouvrements sont normaux :
 * un même ouvrage peut remplir plusieurs rôles, et le résultat n'est pas complété
 * artificiellement jusqu'à cinq ouvrages distincts.
 */
function selectionnerProteges(candidats: Candidat[]): Candidat[] {
  const retenus = new Map<string, Candidat>();
  const rolesParId = new Map<string, string[]>();

  for (const role of ROLES_PROTEGES) {
    const candidat = role.trouver(candidats);
    if (!candidat) continue;
    retenus.set(candidat.bss_id, candidat);
    const roles = rolesParId.get(candidat.bss_id) ?? [];
    roles.push(role.nom);
    rolesParId.set(candidat.bss_id, roles);
  }

  for (const [bssId, roles] of rolesParId) {
    const candidat = retenus.get(bssId);
    if (candidat) candidat.protege = roles;
  }

  return [...retenus.values()];
}

/**
 * Construit la shortlist finale : candidats protégés d'abord, puis sélection gloutonne de
 * type MMR jusqu'à `taille`. Aucun pré-filtrage par distance n'a lieu ici ni en amont —
 * `candidats` doit déjà contenir tous les ouvrages du cercle, scorés.
 */
export function construireShortlist(candidats: Candidat[], taille = TAILLE_SHORTLIST_MAX): Candidat[] {
  if (candidats.length === 0) return [];

  const shortlist: Candidat[] = [];
  const restants = new Map(candidats.map((c) => [c.bss_id, c] as const));

  for (const candidat of selectionnerProteges(candidats)) {
    if (shortlist.length >= taille) break;
    shortlist.push(candidat);
    restants.delete(candidat.bss_id);
  }

  while (shortlist.length < taille && restants.size > 0) {
    let meilleur: Candidat | undefined;
    let meilleurScore = -Infinity;
    let meilleurMaxSim = 0;

    for (const candidat of restants.values()) {
      const maxSim = shortlist.length === 0 ? 0 : Math.max(...shortlist.map((s) => similarite(candidat, s)));
      const selectionScore = 0.75 * candidat.base_score - 25 * maxSim;
      if (
        !meilleur ||
        selectionScore > meilleurScore ||
        (selectionScore === meilleurScore && candidat.distance_m < meilleur.distance_m)
      ) {
        meilleur = candidat;
        meilleurScore = selectionScore;
        meilleurMaxSim = maxSim;
      }
    }

    if (!meilleur) break;
    meilleur.similarity_penalty = 25 * meilleurMaxSim;
    shortlist.push(meilleur);
    restants.delete(meilleur.bss_id);
  }

  shortlist.forEach((candidat, index) => { candidat.preselection_rank = index; });
  return shortlist;
}
