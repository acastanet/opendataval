import type { Feature, FeatureCollection, Point } from "geojson";
import type { GeologieConfig } from "../config.js";
import type { BboxLambert93 } from "../domain/bbox.js";

export type BssFeature = Feature<Point, Record<string, string>>;

export class ErreurBrgm extends Error {
  constructor(
    public readonly genre: "timeout" | "indisponible" | "reponse_invalide",
    message: string,
  ) {
    super(message);
  }
}

export interface ResultatBrgm {
  features: BssFeature[];
  /** Vrai si `MAXFEATURES` a été atteint : le filtrage cercle en aval devient alors incertain. */
  tronque: boolean;
}

export interface BrgmClient {
  featuresDansBbox(bbox: BboxLambert93): Promise<ResultatBrgm>;
}

function estFeatureCollection(value: unknown): value is FeatureCollection {
  return (
    typeof value === "object" && value !== null &&
    "type" in value && (value as { type: unknown }).type === "FeatureCollection" &&
    "features" in value && Array.isArray((value as { features: unknown }).features)
  );
}

export function createBrgmClient(config: GeologieConfig, fetchImpl: typeof fetch): BrgmClient {
  return {
    async featuresDansBbox(bbox: BboxLambert93): Promise<ResultatBrgm> {
      const url = new URL(config.brgmWfsUrl);
      url.search = new URLSearchParams({
        SERVICE: "WFS",
        VERSION: "1.1.0",
        REQUEST: "GetFeature",
        TYPENAME: "BSS_TOTAL",
        SRSNAME: "EPSG:2154",
        BBOX: `${bbox.xmin},${bbox.ymin},${bbox.xmax},${bbox.ymax},EPSG:2154`,
        MAXFEATURES: String(config.brgmMaxFeatures),
        OUTPUTFORMAT: "application/json; subtype=geojson; charset=utf-8",
      }).toString();

      let texte: string;
      try {
        const response = await fetchImpl(url, {
          headers: { accept: "application/geo+json, application/json", "user-agent": "opendataval-geologie-service/0.1" },
          signal: AbortSignal.timeout(config.brgmTimeoutMs),
        });
        if (!response.ok) {
          throw new ErreurBrgm("indisponible", `BRGM WFS a répondu HTTP ${response.status}.`);
        }
        texte = await response.text();
      } catch (error) {
        if (error instanceof ErreurBrgm) throw error;
        const name = error instanceof Error ? error.name : "";
        const timeout = name === "AbortError" || name === "TimeoutError";
        throw new ErreurBrgm(
          timeout ? "timeout" : "indisponible",
          timeout ? "BRGM WFS n'a pas répondu dans le délai imparti." : "BRGM WFS est injoignable.",
        );
      }

      // Un corps vide ou blanc signifie « zéro résultat », pas une panne : le WFS BRGM
      // renvoie parfois un corps vide plutôt qu'une FeatureCollection sans éléments.
      if (!texte.trim()) return { features: [], tronque: false };

      let payload: unknown;
      try {
        payload = JSON.parse(texte);
      } catch {
        throw new ErreurBrgm("reponse_invalide", "BRGM WFS a renvoyé une réponse non-JSON.");
      }

      if (!estFeatureCollection(payload)) {
        throw new ErreurBrgm("reponse_invalide", "BRGM WFS a renvoyé un GeoJSON invalide.");
      }

      const features = payload.features as BssFeature[];
      return { features, tronque: features.length >= config.brgmMaxFeatures };
    },
  };
}
