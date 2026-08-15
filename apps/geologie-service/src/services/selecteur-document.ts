import type { GeologieConfig } from "../config.js";
import { classerDocuments, type DocumentInfoterre } from "../domain/infoterre-parsing.js";
import { extraireJson } from "./reranker.js";

export type MethodeSelection = "aucune" | "unique" | "llm" | "deterministe";

export interface ResultatSelection {
  document: DocumentInfoterre | null;
  raison: string | null;
  methode: MethodeSelection;
}

export interface SelecteurDocument {
  /** Ne lève jamais d'exception : repli déterministe sur tout échec. */
  selectionner(documents: DocumentInfoterre[]): Promise<ResultatSelection>;
}

const MAX_DOCUMENTS_ENVOYES_LLM = 20;

const PROMPT_SYSTEME = `Tu es un module de sélection de document pour des fiches d'ouvrages du sous-sol BRGM (Banque du Sous-Sol).

Tu reçois la liste des documents numérisés disponibles sur une fiche (nom de fichier et types déclarés), sans leur contenu.

Choisis LE document le plus susceptible de contenir une coupe géologique interprétable ou un log stratigraphique exploitable pour comprendre le sous-sol de l'ouvrage.

Favorise dans l'ordre : une coupe géologique interprétée, une coupe géologique de chantier ou autre coupe, un rapport de fin de sondage ou de forage, puis tout autre document.

Tu dois choisir exactement un document parmi ceux fournis, en recopiant son nom exactement.

Retourne uniquement un JSON conforme au schéma suivant, sans texte autour :
{"document":"<nom exact>","reason":"une phrase courte"}`;

interface ReponseChatCompletions {
  choices?: { message?: { content?: string } }[];
}

function documentDeterministe(documents: DocumentInfoterre[]): ResultatSelection {
  const meilleur = classerDocuments(documents)[0] ?? null;
  return { document: meilleur, raison: null, methode: "deterministe" };
}

function validerSortieLlm(payload: unknown, nomsAutorises: ReadonlySet<string>): { nom: string; raison: string | null } | null {
  if (typeof payload !== "object" || payload === null || !("document" in payload)) return null;
  const { document, reason } = payload as Record<string, unknown>;
  if (typeof document !== "string" || !nomsAutorises.has(document)) return null;
  return { nom: document, raison: typeof reason === "string" ? reason : null };
}

export function createSelecteurDocument(config: GeologieConfig, fetchImpl: typeof fetch): SelecteurDocument {
  return {
    async selectionner(documents) {
      if (documents.length === 0) return { document: null, raison: null, methode: "aucune" };
      if (documents.length === 1) return { document: documents[0] ?? null, raison: null, methode: "unique" };
      if (!config.llmApiKey) return documentDeterministe(documents);

      const candidats = classerDocuments(documents).slice(0, MAX_DOCUMENTS_ENVOYES_LLM);

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
              {
                role: "user",
                content: JSON.stringify({
                  documents: candidats.map((doc) => ({ nom: doc.nom, types: doc.types })),
                }),
              },
            ],
          }),
          signal: AbortSignal.timeout(config.llmTimeoutMs),
        });

        if (!response.ok) return documentDeterministe(documents);

        const payload = (await response.json()) as ReponseChatCompletions;
        const contenu = payload.choices?.[0]?.message?.content;
        if (!contenu) return documentDeterministe(documents);

        const jsonExtrait = extraireJson(contenu);
        if (jsonExtrait === null) return documentDeterministe(documents);

        const nomsAutorises = new Set(candidats.map((doc) => doc.nom));
        const validation = validerSortieLlm(jsonExtrait, nomsAutorises);
        if (!validation) return documentDeterministe(documents);

        const document = candidats.find((doc) => doc.nom === validation.nom) ?? null;
        if (!document) return documentDeterministe(documents);

        return { document, raison: validation.raison, methode: "llm" };
      } catch {
        return documentDeterministe(documents);
      }
    },
  };
}
