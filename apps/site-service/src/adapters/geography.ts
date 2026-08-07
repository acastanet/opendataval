import type { DonneeDalle, Disponibilite } from "@opendata-vda/shared/dalle";

/**
 * Premier adaptateur du lot P3 (`agent/mvp/08-BACKLOG.md`) : appelle `geography-service` et
 * transforme sa réponse vers le contrat `DonneeDalle`, sans dupliquer sa logique métier
 * (`04-SITE-SERVICE.md` § « Adapter pattern »). Fournit l'information géographique simple
 * exigée par `05-M1-VERTICAL-SLICE.md` (« adresse ou information géographique simple issue
 * d'un service existant »).
 */
export interface ClientGeographie {
  resoudre(lat: number, lon: number): Promise<DonneeDalle[]>;
}

export interface ConfigClientGeographie {
  baseUrl: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

interface BlocEnrichissement {
  status: "available" | "not_found" | "unavailable" | "timeout";
  data: Record<string, unknown> | null;
  provenance: { source: string; resolvedAt: string };
}

interface ReponseGeographie {
  territory?: BlocEnrichissement;
  address?: BlocEnrichissement;
  elevation?: BlocEnrichissement;
}

function disponibilite(status: BlocEnrichissement["status"]): Disponibilite {
  switch (status) {
    case "available":
      return "available";
    case "not_found":
      return "not_found";
    case "unavailable":
    case "timeout":
      return "source_unavailable";
  }
}

interface SpecificationChamp {
  key: string;
  sphere: DonneeDalle["sphere"];
  spatialRelation: DonneeDalle["spatialRelation"];
  unit: string | null;
  extraireValeur: (data: Record<string, unknown>) => unknown;
  extraireDistanceM?: (data: Record<string, unknown>) => number | null;
  extraireResolutionM?: (data: Record<string, unknown>) => number | null;
}

/**
 * Construit une donnée même quand la source est en échec ou n'a rien trouvé : l'absence est
 * une information (`03-DATA-CONTRACT.md`), jamais un silence.
 */
function construireDonnee(spec: SpecificationChamp, bloc: BlocEnrichissement): DonneeDalle {
  const disponible = bloc.status === "available" && bloc.data !== null;
  const data = bloc.data;
  const resolutionValeur = disponible && data && spec.extraireResolutionM ? spec.extraireResolutionM(data) : undefined;

  return {
    key: spec.key,
    value: disponible && data ? spec.extraireValeur(data) : null,
    unit: spec.unit,
    sphere: spec.sphere,
    spatialRelation: spec.spatialRelation,
    distanceM: disponible && data && spec.extraireDistanceM ? spec.extraireDistanceM(data) : null,
    source: {
      producer: bloc.provenance.source,
      dataset: `geography/${spec.key}`,
      url: null,
      license: null,
    },
    time: {
      observedAt: bloc.provenance.resolvedAt,
      retrievedAt: bloc.provenance.resolvedAt,
      referencePeriod: null,
    },
    ...(resolutionValeur !== undefined && resolutionValeur !== null
      ? { resolution: { spatialM: resolutionValeur } }
      : {}),
    status: {
      availability: disponibilite(bloc.status),
      freshness: null,
      review: null,
    },
  };
}

const CHAMP_COMMUNE: SpecificationChamp = {
  key: "commune",
  sphere: "anthroposphere",
  spatialRelation: "administrative",
  unit: null,
  extraireValeur: (d) => (d.label as string | undefined) ?? null,
};

const CHAMP_ADRESSE: SpecificationChamp = {
  key: "adresse",
  sphere: "anthroposphere",
  spatialRelation: "nearest",
  unit: null,
  extraireValeur: (d) => (d.formatted as string | undefined) ?? null,
  extraireDistanceM: (d) => (d.distanceMeters as number | null | undefined) ?? null,
};

const CHAMP_ALTITUDE: SpecificationChamp = {
  key: "altitude",
  sphere: "lithosphere",
  spatialRelation: "model_at_point",
  unit: "m",
  extraireValeur: (d) => (d.meters as number | undefined) ?? null,
  extraireResolutionM: (d) => (d.horizontalResolutionMeters as number | null | undefined) ?? null,
};

export function transformerReponseGeographie(body: unknown): DonneeDalle[] {
  const reponse = (typeof body === "object" && body !== null ? body : {}) as ReponseGeographie;
  const donnees: DonneeDalle[] = [];
  if (reponse.territory) donnees.push(construireDonnee(CHAMP_COMMUNE, reponse.territory));
  if (reponse.address) donnees.push(construireDonnee(CHAMP_ADRESSE, reponse.address));
  if (reponse.elevation) donnees.push(construireDonnee(CHAMP_ALTITUDE, reponse.elevation));
  return donnees;
}

/**
 * Client HTTP vers `geography-service` (route interne `/internal/v1/geography/resolve`,
 * voir `apps/gateway-service/src/geography-proxy.ts` pour le même appel côté gateway). Une
 * panne réseau ou une réponse non exploitable renvoie un tableau vide plutôt que de faire
 * échouer la fabrication : source de proximité, pas condition bloquante
 * (`04-SITE-SERVICE.md` § « Tolérance aux pannes »).
 */
export function creerClientGeographie({ baseUrl, timeoutMs, fetchImpl }: ConfigClientGeographie): ClientGeographie {
  const fetchEffectif = fetchImpl ?? globalThis.fetch.bind(globalThis);
  return {
    async resoudre(lat, lon) {
      const url = new URL("/internal/v1/geography/resolve", baseUrl);
      url.searchParams.set("lat", String(lat));
      url.searchParams.set("lon", String(lon));
      try {
        const response = await fetchEffectif(url, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) return [];
        return transformerReponseGeographie(await response.json());
      } catch {
        return [];
      }
    },
  };
}
