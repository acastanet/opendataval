import type { GeologieConfig } from "../config.js";
import { urlFicheInfoterre } from "../domain/reference-bss.js";

/** Seul hôte autorisé pour les URLs de scan résolues depuis le HTML de la fiche (anti-SSRF). */
const HOTE_AUTORISE = "ficheinfoterre.brgm.fr";

export class ErreurInfoterre extends Error {
  constructor(
    public readonly genre: "timeout" | "indisponible" | "reponse_invalide" | "scan_trop_volumineux",
    message: string,
  ) {
    super(message);
  }
}

export interface InfoterreClient {
  recupererFiche(reference: string): Promise<string>;
  recupererScan(urlScanAbsolue: string): Promise<Buffer>;
}

function erreurReseau(error: unknown, contexte: string): ErreurInfoterre {
  if (error instanceof ErreurInfoterre) return error;
  const name = error instanceof Error ? error.name : "";
  const timeout = name === "AbortError" || name === "TimeoutError";
  return new ErreurInfoterre(
    timeout ? "timeout" : "indisponible",
    timeout ? `${contexte} n'a pas répondu dans le délai imparti.` : `${contexte} est injoignable.`,
  );
}

export function createInfoterreClient(config: GeologieConfig, fetchImpl: typeof fetch): InfoterreClient {
  return {
    async recupererFiche(reference) {
      const url = urlFicheInfoterre(reference);
      let buffer: ArrayBuffer;
      try {
        const response = await fetchImpl(url, {
          headers: { "user-agent": "opendataval-geologie-service/0.1" },
          signal: AbortSignal.timeout(config.infoterreTimeoutMs),
        });
        if (!response.ok) {
          throw new ErreurInfoterre("indisponible", `InfoTerre a répondu HTTP ${response.status}.`);
        }
        buffer = await response.arrayBuffer();
      } catch (error) {
        throw erreurReseau(error, "InfoTerre");
      }

      // Le serveur BRGM déclare charset=UTF-8 dans la balise <meta> de la page, mais sert en
      // réalité du ISO-8859-1 (confirmé par l'en-tête HTTP Content-Type réel) : on décode donc
      // toujours en latin1, sans se fier ni à la balise meta ni au décodage UTF-8 par défaut
      // qu'appliquerait `response.text()`.
      return new TextDecoder("iso-8859-1").decode(buffer);
    },

    async recupererScan(urlScanAbsolue) {
      const url = new URL(urlScanAbsolue);
      if (url.hostname !== HOTE_AUTORISE) {
        throw new ErreurInfoterre("reponse_invalide", `Hôte de scan non autorisé : ${url.hostname}.`);
      }

      let response: Response;
      try {
        response = await fetchImpl(url, {
          headers: { "user-agent": "opendataval-geologie-service/0.1" },
          signal: AbortSignal.timeout(config.infoterreTimeoutMs),
        });
      } catch (error) {
        throw erreurReseau(error, "Le scan InfoTerre");
      }
      if (!response.ok) {
        throw new ErreurInfoterre("indisponible", `Le scan InfoTerre a répondu HTTP ${response.status}.`);
      }

      const contentLength = response.headers.get("content-length");
      if (contentLength && Number(contentLength) > config.infoterreMaxScanBytes) {
        throw new ErreurInfoterre(
          "scan_trop_volumineux",
          `Le scan annonce ${contentLength} octets, au-delà du maximum autorisé (${config.infoterreMaxScanBytes}).`,
        );
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > config.infoterreMaxScanBytes) {
        throw new ErreurInfoterre(
          "scan_trop_volumineux",
          `Le scan pèse ${buffer.byteLength} octets, au-delà du maximum autorisé (${config.infoterreMaxScanBytes}).`,
        );
      }
      return buffer;
    },
  };
}
