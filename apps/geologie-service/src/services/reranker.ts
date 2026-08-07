import type { GeologieConfig } from "../config.js";
import type { Candidat, EntreeClassement, ResultatClassement } from "../types.js";

export interface Reranker {
  classer(shortlist: Candidat[]): Promise<ResultatClassement>;
}

const PROMPT_SYSTEME = `Tu es un module de classement d'ouvrages géologiques BRGM.

Tu reçois une liste d'ouvrages déjà présélectionnés autour d'un point.

Classe les ouvrages selon leur intérêt pour comprendre la géologie locale.

La distance est importante mais secondaire par rapport à la qualité de l'information
géologique disponible.

Favorise :
- carottages explicites ;
- sondages et forages documentés ;
- coupes géologiques ;
- profondeur utile ;
- documentation géologique ;
- complémentarité entre les ouvrages.

Évite qu'un ensemble d'ouvrages presque identiques monopolise le classement s'ils
n'apportent pas d'information complémentaire.

Tu dois utiliser exclusivement les données fournies.

Ne déduis aucune lithologie, structure ou propriété absente des données.

Retourne uniquement un JSON conforme au schéma suivant, sans texte autour :
{"ranking":[{"bss_id":"...","rank":1,"score":96,"reason":"une phrase courte"}]}
Maximum 10 éléments.`;

interface FicheCompacte {
  bss_id: string;
  distance_m: number;
  nature: string | null;
  profondeur_m: number | null;
  mode_execution: string | null;
  is_borehole: boolean;
  is_sounding: boolean;
  is_core_sample: boolean;
  has_geological_section: boolean;
  has_geological_section_document: boolean;
  has_geological_section_scan: boolean;
  documents: string[];
  base_score: number;
}

function ficheCompacte(candidat: Candidat): FicheCompacte {
  return {
    bss_id: candidat.bss_id,
    distance_m: Math.round(candidat.distance_m * 10) / 10,
    nature: candidat.nature_brgm,
    profondeur_m: candidat.profondeur_m,
    mode_execution: candidat.mode_execution,
    is_borehole: candidat.is_borehole,
    is_sounding: candidat.is_sounding,
    is_core_sample: candidat.is_core_sample,
    has_geological_section: candidat.has_geological_section,
    has_geological_section_document: candidat.has_geological_section_document,
    has_geological_section_scan: candidat.has_geological_section_scan,
    documents: candidat.documents,
    base_score: Math.round(candidat.base_score * 10) / 10,
  };
}

/**
 * Extrait le premier objet JSON équilibré d'un texte libre : la passerelle ILAAS n'est pas
 * garantie de respecter `response_format`, la réponse peut donc arriver entourée de
 * ```json … ``` ou de commentaires.
 */
export function extraireJson(texte: string): unknown | null {
  const sansFences = texte.replace(/```(?:json)?/gi, "").trim();
  const debut = sansFences.indexOf("{");
  if (debut === -1) return null;

  let profondeur = 0;
  for (let i = debut; i < sansFences.length; i++) {
    const caractere = sansFences[i];
    if (caractere === "{") profondeur++;
    else if (caractere === "}") {
      profondeur--;
      if (profondeur === 0) {
        try {
          return JSON.parse(sansFences.slice(debut, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Valide strictement la sortie du LLM : jamais de confiance directe. Tout identifiant hors
 * shortlist, doublon, rang dupliqué ou score hors bornes est rejeté élément par élément
 * plutôt que d'invalider toute la réponse.
 */
export function validerSortieLlm(payload: unknown, bssIdsAutorises: ReadonlySet<string>): EntreeClassement[] | null {
  if (typeof payload !== "object" || payload === null || !("ranking" in payload)) return null;
  const ranking = (payload as { ranking: unknown }).ranking;
  if (!Array.isArray(ranking)) return null;

  const bssIdsVus = new Set<string>();
  const rangsVus = new Set<number>();
  const entrees: EntreeClassement[] = [];

  for (const item of ranking) {
    if (entrees.length >= 10) break;
    if (typeof item !== "object" || item === null) continue;
    const { bss_id, rank, score, reason } = item as Record<string, unknown>;

    if (typeof bss_id !== "string" || !bssIdsAutorises.has(bss_id) || bssIdsVus.has(bss_id)) continue;
    if (typeof rank !== "number" || !Number.isFinite(rank) || rangsVus.has(rank)) continue;
    if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 100) continue;

    bssIdsVus.add(bss_id);
    rangsVus.add(rank);
    entrees.push({ bss_id, rank, score, reason: typeof reason === "string" ? reason : null });
  }

  return entrees.length > 0 ? entrees : null;
}

/** Repli utilisé dès que le LLM est absent, indisponible ou renvoie une sortie invalide. */
export function classementDeterministe(shortlist: Candidat[]): ResultatClassement {
  return {
    methode: "deterministic",
    entrees: shortlist.slice(0, 10).map((candidat, index) => ({
      bss_id: candidat.bss_id,
      rank: index + 1,
      score: Math.round(candidat.base_score),
      reason: null,
    })),
  };
}

interface ReponseChatCompletions {
  choices?: { message?: { content?: string } }[];
}

export function createReranker(config: GeologieConfig, fetchImpl: typeof fetch): Reranker {
  return {
    async classer(shortlist) {
      if (shortlist.length === 0) return classementDeterministe(shortlist);
      if (!config.llmApiKey) return classementDeterministe(shortlist);

      try {
        const response = await fetchImpl(config.llmUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${config.llmApiKey}`,
          },
          body: JSON.stringify({
            model: config.llmModel,
            temperature: 0,
            max_tokens: config.llmMaxTokens,
            messages: [
              { role: "system", content: PROMPT_SYSTEME },
              { role: "user", content: JSON.stringify({ ouvrages: shortlist.map(ficheCompacte) }) },
            ],
          }),
          signal: AbortSignal.timeout(config.llmTimeoutMs),
        });

        if (!response.ok) return classementDeterministe(shortlist);

        const payload = (await response.json()) as ReponseChatCompletions;
        const contenu = payload.choices?.[0]?.message?.content;
        if (!contenu) return classementDeterministe(shortlist);

        const jsonExtrait = extraireJson(contenu);
        if (jsonExtrait === null) return classementDeterministe(shortlist);

        const bssIdsAutorises = new Set(shortlist.map((candidat) => candidat.bss_id));
        const entrees = validerSortieLlm(jsonExtrait, bssIdsAutorises);
        if (!entrees) return classementDeterministe(shortlist);

        return { methode: "llm_reranked", entrees };
      } catch {
        return classementDeterministe(shortlist);
      }
    },
  };
}
