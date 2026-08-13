/** Ouvrage BSS normalisé, tel que produit par `normaliserFeature`. */
export interface OuvrageBss {
  bss_id: string;
  ancien_code_bss: string | null;
  designation: string | null;
  /** Nature BRGM brute, jamais réécrite (ex. "FORAGE", "SONDAGE", "SOURCE"). */
  nature_brgm: string | null;

  distance_m: number;
  /** Coordonnées Lambert-93 internes, jamais exposées dans la réponse publique. */
  x_l93: number;
  y_l93: number;

  profondeur_m: number | null;
  altitude_m: number | null;
  mode_execution: string | null;
  commune_bss: string | null;
  lieu_dit: string | null;

  longitude: number | null;
  latitude: number | null;

  is_borehole: boolean;
  is_sounding: boolean;
  is_core_sample: boolean;
  has_geological_section: boolean;
  has_geological_section_document: boolean;
  has_geological_section_scan: boolean;

  documents: string[];
  fiche_infoterre: string | null;
}

/** Ouvrage scoré, avec les rangs et scores intermédiaires nécessaires au debug. */
export interface Candidat extends OuvrageBss {
  distance_rank: number;
  geological_value_score: number;
  proximity_score: number;
  base_score: number;
  /** Renseigné une fois le candidat retenu dans la shortlist. */
  preselection_rank?: number;
  /** Pénalité de similarité au moment de la sélection MMR (debug uniquement). */
  similarity_penalty?: number;
  /** Rôle(s) de candidat protégé ayant justifié son entrée en phase A (debug uniquement). */
  protege?: string[];
}

export type RankingMethod = "llm_reranked" | "deterministic" | "distance";

export interface EntreeClassement {
  bss_id: string;
  rank: number;
  score: number;
  reason: string | null;
}

export interface ResultatClassement {
  methode: RankingMethod;
  entrees: EntreeClassement[];
}
