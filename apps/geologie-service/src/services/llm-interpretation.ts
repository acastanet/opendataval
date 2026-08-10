import type { GeologieConfig } from "../config.js";
import type { NiveauLog } from "../domain/infoterre-parsing.js";

export interface ImagePourSynthese {
  nom: string;
  types: string[];
  pngBase64: string;
}

export interface RequeteSynthese {
  reference: string;
  log: NiveauLog[];
  images: ImagePourSynthese[];
}

export interface Syntheseur {
  /** Ne lève jamais d'exception : retourne `null` sur tout échec (repli déterministe côté appelant). */
  synthetiser(requete: RequeteSynthese): Promise<string | null>;
}

const PROMPT_SYSTEME = `Tu es un assistant d'interprétation géologique pour des ouvrages du sous-sol référencés au BRGM (Banque du Sous-Sol).

Tu reçois le log géologique structuré d'un ouvrage (profondeur, lithologie, stratigraphie par niveau),
et éventuellement un ou plusieurs scans de coupe géologique en image.

Rédige une synthèse concise (1 à 3 phrases) en français décrivant la nature du sous-sol observé.

Tu dois utiliser exclusivement les données fournies (log et images).

Ne déduis et n'invente aucune donnée absente des informations fournies.

Si aucune image n'est fournie, base-toi uniquement sur le log géologique.

Réponds uniquement avec le texte de la synthèse, sans balisage ni commentaire autour.`;

const MAX_CARACTERES_REPONSE = 4000;
const TEMPERATURE_LLM = 0.3;

interface ReponseChatCompletions {
  choices?: { message?: { content?: string } }[];
}

function construireMessages(requete: RequeteSynthese): { role: string; content: unknown }[] {
  const donnees = JSON.stringify({ reference: requete.reference, log: requete.log });

  if (requete.images.length === 0) {
    return [
      { role: "system", content: PROMPT_SYSTEME },
      { role: "user", content: donnees },
    ];
  }

  const parts: unknown[] = [{ type: "text", text: donnees }];
  for (const image of requete.images) {
    parts.push({ type: "image_url", image_url: { url: `data:image/png;base64,${image.pngBase64}` } });
  }
  return [
    { role: "system", content: PROMPT_SYSTEME },
    { role: "user", content: parts },
  ];
}

export function createSyntheseurLlm(config: GeologieConfig, fetchImpl: typeof fetch): Syntheseur {
  return {
    async synthetiser(requete) {
      if (!config.llmApiKey) return null;

      try {
        const response = await fetchImpl(config.llmUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${config.llmApiKey}`,
          },
          body: JSON.stringify({
            model: config.llmVisionModel,
            temperature: TEMPERATURE_LLM,
            max_tokens: config.llmSyntheseMaxTokens,
            messages: construireMessages(requete),
          }),
          signal: AbortSignal.timeout(config.llmVisionTimeoutMs),
        });

        if (!response.ok) return null;

        const payload = (await response.json()) as ReponseChatCompletions;
        const contenu = payload.choices?.[0]?.message?.content?.trim();
        if (!contenu) return null;
        if (contenu.length > MAX_CARACTERES_REPONSE) return null;

        return contenu;
      } catch {
        return null;
      }
    },
  };
}
