import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import { ErreurInfoterre, type InfoterreClient } from "../clients/infoterre.js";
import type { GeologieConfig } from "../config.js";
import { referenceValide } from "../domain/reference-bss.js";
import type { Convertisseur } from "../services/conversion-document.js";
import { interpreterFiche } from "../services/interpretation.js";
import type { Syntheseur } from "../services/llm-interpretation.js";
import type { SelecteurDocument } from "../services/selecteur-document.js";

function erreur(code: string, message: string, retryable: boolean, requestId: string) {
  return { error: { code, message, retryable }, requestId };
}

export interface DependancesSyntheseRoute {
  infoterre: InfoterreClient;
  selecteur: SelecteurDocument;
  convertisseur: Convertisseur;
  syntheseur: Syntheseur;
  config: GeologieConfig;
}

const CODES_ERREUR_INFOTERRE: Record<ErreurInfoterre["genre"], { status: number; code: string }> = {
  timeout: { status: 504, code: "GEOLOGIE_INFOTERRE_TIMEOUT" },
  indisponible: { status: 502, code: "GEOLOGIE_INFOTERRE_UNAVAILABLE" },
  reponse_invalide: { status: 502, code: "GEOLOGIE_INFOTERRE_INVALID_RESPONSE" },
  scan_trop_volumineux: { status: 502, code: "GEOLOGIE_INFOTERRE_SCAN_TOO_LARGE" },
};

export function registerSyntheseRoutes(app: FastifyInstance, deps: DependancesSyntheseRoute): void {
  const handler = async (
    request: { query: Record<string, unknown>; id: string; log: FastifyBaseLogger },
    reply: { code: (status: number) => { send: (body: unknown) => unknown } },
  ) => {
    const reference = typeof request.query.reference === "string" ? request.query.reference : "";
    if (!referenceValide(reference)) {
      return reply.code(400).send(erreur(
        "INVALID_REFERENCE",
        "Le paramètre reference est obligatoire et doit correspondre au format BSS (ex. 09372X0012/MONNA).",
        false,
        request.id,
      ));
    }

    try {
      return await interpreterFiche(reference, {
        infoterre: deps.infoterre,
        selecteur: deps.selecteur,
        convertisseur: deps.convertisseur,
        syntheseur: deps.syntheseur,
        config: deps.config,
        log: request.log,
      });
    } catch (error) {
      if (error instanceof ErreurInfoterre) {
        const { status, code } = CODES_ERREUR_INFOTERRE[error.genre];
        request.log.error({ err: error }, code);
        return reply.code(status).send(erreur(code, error.message, true, request.id));
      }
      throw error;
    }
  };

  app.get<{ Querystring: Record<string, unknown> }>("/internal/v1/geologie/bss/synthese", handler);
  app.get<{ Querystring: Record<string, unknown> }>("/api/v2/geologie/bss/synthese", handler);
}
