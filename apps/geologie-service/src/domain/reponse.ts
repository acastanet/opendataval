import type { Candidat, RankingMethod, ResultatClassement } from "../types.js";

export interface ResultatReponse {
  rank: number;
  bss_id: string;
  distance_m: number;
  distance_rank: number;
  relevance_score: number;
  reason: string | null;
  designation: string | null;
  nature_brgm: string | null;
  profondeur_m: number | null;
  mode_execution: string | null;
  is_borehole: boolean;
  is_sounding: boolean;
  is_core_sample: boolean;
  has_geological_section: boolean;
  documents: string[];
  latitude: number | null;
  longitude: number | null;
  fiche_infoterre: string | null;
  ancien_code_bss: string | null;
  debug?: {
    geological_value_score: number;
    proximity_score: number;
    base_score: number;
    similarity_penalty: number | null;
    preselection_rank: number | null;
    protege: string[] | null;
  };
}

export interface ReponseBss {
  query: { lat: number; lon: number; radius_m: number };
  source: { provider: "BRGM"; dataset: "BSS_TOTAL" };
  selection: {
    candidates_in_radius: number;
    shortlist_count: number;
    returned_count: number;
    ranking_method: RankingMethod;
  };
  results: ResultatReponse[];
  debug?: { brgm_truncated: boolean };
}

export function construireReponse(params: {
  lat: number;
  lon: number;
  rayonM: number;
  candidatsDansLeCercle: number;
  classement: ResultatClassement;
  shortlist: Candidat[];
  debug: boolean;
  brgmTronque: boolean;
}): ReponseBss {
  const parBssId = new Map(params.shortlist.map((candidat) => [candidat.bss_id, candidat] as const));

  const entreesTriees = [...params.classement.entrees].sort((a, b) => a.rank - b.rank);

  const results: ResultatReponse[] = [];
  for (const entree of entreesTriees) {
    const candidat = parBssId.get(entree.bss_id);
    if (!candidat) continue;
    results.push({
      rank: entree.rank,
      bss_id: candidat.bss_id,
      distance_m: candidat.distance_m,
      distance_rank: candidat.distance_rank,
      relevance_score: entree.score,
      reason: entree.reason,
      designation: candidat.designation,
      nature_brgm: candidat.nature_brgm,
      profondeur_m: candidat.profondeur_m,
      mode_execution: candidat.mode_execution,
      is_borehole: candidat.is_borehole,
      is_sounding: candidat.is_sounding,
      is_core_sample: candidat.is_core_sample,
      has_geological_section: candidat.has_geological_section,
      documents: candidat.documents,
      latitude: candidat.latitude,
      longitude: candidat.longitude,
      fiche_infoterre: candidat.fiche_infoterre,
      ancien_code_bss: candidat.ancien_code_bss,
      ...(params.debug && {
        debug: {
          geological_value_score: candidat.geological_value_score,
          proximity_score: candidat.proximity_score,
          base_score: candidat.base_score,
          similarity_penalty: candidat.similarity_penalty ?? null,
          preselection_rank: candidat.preselection_rank ?? null,
          protege: candidat.protege ?? null,
        },
      }),
    });
  }

  return {
    query: { lat: params.lat, lon: params.lon, radius_m: params.rayonM },
    source: { provider: "BRGM", dataset: "BSS_TOTAL" },
    selection: {
      candidates_in_radius: params.candidatsDansLeCercle,
      shortlist_count: params.shortlist.length,
      returned_count: results.length,
      ranking_method: params.classement.methode,
    },
    results,
    ...(params.debug && { debug: { brgm_truncated: params.brgmTronque } }),
  };
}
