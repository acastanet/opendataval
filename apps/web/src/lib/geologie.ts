export const BASE_GEOLOGIE = "/api/v2/geologie";

export interface OptionsRechercheGeologie {
  lat: number;
  lon: number;
  /** 1 à 5000 m, plafonné côté service. */
  rayon: number;
  /** true : shortlist diversifiée + reranking, plafonné à 10 résultats. false (défaut VAL) : tous les ouvrages du cercle, triés par distance. */
  trier: boolean;
}

/** URL de la recherche BSS BRGM proche d'un point (voir doc/microservice/geologie-service/README.md). */
export function urlGeologieProches(options: OptionsRechercheGeologie): string {
  const params = new URLSearchParams({
    lat: String(options.lat),
    lon: String(options.lon),
    rayon: String(Math.round(options.rayon)),
    trier: options.trier ? "true" : "false",
  });
  return `${BASE_GEOLOGIE}/bss/proches?${params.toString()}`;
}

export interface OuvrageGeologie {
  rank: number;
  bss_id: string;
  distance_m: number;
  distance_rank: number;
  relevance_score: number;
  reason: string | null;
  designation: string | null;
  nature_brgm: string | null;
  profondeur_m: number | null;
  latitude: number | null;
  longitude: number | null;
  fiche_infoterre: string | null;
  /** Référence attendue par /bss/synthese ; absente pour certains ouvrages (pas d'analyse IA possible). */
  ancien_code_bss: string | null;
}

export interface ReponseGeologie {
  selection: {
    candidates_in_radius: number;
    shortlist_count: number;
    returned_count: number;
    ranking_method: "llm_reranked" | "deterministic" | "distance";
  };
  results: OuvrageGeologie[];
}

/** URL de l'analyse IA à la demande d'une fiche (log + coupe géologique). Coûteux : scraping + LLM vision. */
export function urlGeologieSynthese(ancienCodeBss: string): string {
  return `${BASE_GEOLOGIE}/bss/synthese?${new URLSearchParams({ reference: ancienCodeBss }).toString()}`;
}

export interface NiveauLogGeologique {
  profondeur_min_m: number | null;
  profondeur_max_m: number | null;
  lithologie: string | null;
  stratigraphie: string | null;
}

export interface ImageAnalysee {
  nom: string | null;
  types: string[];
  apercu_data_url: string | null;
}

export interface DocumentGeologie {
  nom: string;
  types: string[];
  /** URL absolue du document brut (scan TIFF, PDF, etc.), non forcément analysé automatiquement. */
  url_scan: string;
}

export interface ReponseSyntheseGeologie {
  methode_synthese: "llm_vision" | "llm_texte" | "structure_seule";
  synthese: string | null;
  log_geologique: NiveauLogGeologique[];
  documents: DocumentGeologie[];
  images_analysees: ImageAnalysee[];
  avertissements: string[];
  fiche_infoterre: string | null;
}
