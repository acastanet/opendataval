import type { RestrictionsIndex } from "./restrictions.js";
import { restrictionFor } from "./restrictions.js";
import type { RouteEdge, RouteResult, VehicleInput } from "./types.js";

function numeric(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value.replace(",", ".").match(/[0-9]+(?:\.[0-9]+)?/)?.[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
}
function hasExplicitGauge(tags: Record<string, string>): boolean {
  return ["maxheight", "maxheight:physical", "maxweight", "maxweightrating", "maxwidth", "maxlength", "maxaxleload", "hgv", "hazmat"].some((key) => key in tags);
}
function gaugeDetails(tags: Record<string, string>): Array<{ type: string; valeur: string; unite?: string }> {
  const details: Array<{ type: string; valeur: string; unite?: string }> = [];
  const add = (type: string, value: string | undefined, unite?: string) => {
    if (!value) return;
    const normalized = value.toLowerCase();
    if (normalized === "default") { details.push({ type, valeur: "réglementation par défaut" }); return; }
    if (normalized === "below_default") { details.push({ type, valeur: "inférieure à la limite réglementaire" }); return; }
    if (type === "Accès poids lourd") {
      const labels: Record<string, string> = { yes: "autorisé", no: "interdit", destination: "desserte locale uniquement", delivery: "livraisons uniquement" };
      details.push({ type, valeur: labels[normalized] ?? value }); return;
    }
    if (type === "Matières dangereuses") {
      const labels: Record<string, string> = { yes: "autorisées", no: "interdites", destination: "desserte locale uniquement" };
      details.push({ type, valeur: labels[normalized] ?? value }); return;
    }
    details.push({ type, valeur: value, ...(unite ? { unite } : {}) });
  };
  add("Hauteur maximale", tags["maxheight:physical"] ?? tags.maxheight, "m");
  add("Largeur maximale", tags.maxwidth, "m");
  add("Longueur maximale", tags.maxlength, "m");
  add("Poids maximal", tags.maxweight ?? tags.maxweightrating, "t");
  add("Charge à l’essieu maximale", tags.maxaxleload, "t");
  add("Accès poids lourd", tags.hgv);
  add("Matières dangereuses", tags.hazmat);
  return details;
}
function incompatible(tags: Record<string, string>, vehicle: VehicleInput): { type: string; valeur: number | string } | undefined {
  const limits: Array<[string, string[], number]> = [
    ["hauteur", ["maxheight:physical", "maxheight"], vehicle.hauteurM], ["largeur", ["maxwidth"], vehicle.largeurM],
    ["longueur", ["maxlength"], vehicle.longueurM], ["poids", ["maxweight", "maxweightrating"], vehicle.poidsT],
    ["charge_essieu", ["maxaxleload"], vehicle.chargeEssieuT],
  ];
  for (const [type, keys, value] of limits) for (const key of keys) {
    const limit = numeric(tags[key]); if (limit !== undefined && limit < value) return { type, valeur: limit };
  }
  if (tags.hgv?.toLowerCase() === "no") return { type: "poids_lourd", valeur: "interdit" };
  if (vehicle.matieresDangereuses && ["no", "destination"].includes(tags.hazmat?.toLowerCase() ?? "")) return { type: "matieres_dangereuses", valeur: "interdit" };
  return undefined;
}
function total(edges: RouteEdge[]): number { return edges.reduce((sum, edge) => sum + edge.lengthKm, 0); }

export function analyzeRoute(route: RouteResult, reference: RouteResult, index: RestrictionsIndex, vehicle: VehicleInput, now = new Date()) {
  const routeIds = new Set(route.edges.map((edge) => edge.wayId));
  const unknownEdges = route.edges.filter((edge) => !hasExplicitGauge(restrictionFor(index, edge.wayId)?.tags ?? {}));
  const unknownKm = unknownEdges.reduce((sum, edge) => sum + edge.lengthKm, 0);
  const routeKm = total(route.edges) || route.distanceKm;
  const verified = Math.max(0, Math.min(1, routeKm ? 1 - unknownKm / routeKm : 0));
  const seenGauges = new Set<string>(); const seenGaugeLabels = new Set<string>();
  const gauges = route.edges.flatMap((edge) => {
    if (seenGauges.has(edge.wayId)) return [];
    const restriction = restrictionFor(index, edge.wayId); if (!restriction || !hasExplicitGauge(restriction.tags)) return [];
    seenGauges.add(edge.wayId);
    const limites = gaugeDetails(restriction.tags); if (!limites.length) return [];
    const nom = restriction.nom ?? edge.name ?? "Restriction OSM"; const labelKey = `${nom}|${JSON.stringify(limites)}`;
    if (seenGaugeLabels.has(labelKey)) return []; seenGaugeLabels.add(labelKey);
    return [{ wayId: edge.wayId, nom, limites, incompatible: Boolean(incompatible(restriction.tags, vehicle)), geometry: restriction.geometry ?? edge.geometry }];
  });
  const seen = new Set<string>();
  const obstacles = reference.edges.flatMap((edge) => {
    if (routeIds.has(edge.wayId) || seen.has(edge.wayId)) return [];
    const restriction = restrictionFor(index, edge.wayId); const issue = restriction && incompatible(restriction.tags, vehicle);
    if (!restriction || !issue) return [];
    seen.add(edge.wayId);
    return [{ type: issue.type, valeur: issue.valeur, nom: restriction.nom ?? edge.name ?? "Restriction OSM", wayId: Number(edge.wayId), geometry: restriction.geometry }];
  });
  const unknownPart = routeKm ? unknownKm / routeKm : 1;
  const niveau = verified >= 0.8 ? "elevee" : verified >= 0.4 ? "moyenne" : "faible";
  const warnings = unknownKm > 0 ? [`Aucune donnée de gabarit sur ${unknownKm.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km du trajet.`] : [];
  warnings.push("Outil d’aide à la décision : seul l’arrêté du gestionnaire de voirie fait foi.");
  return {
    statut: "ok", vehicule: { hauteur_m: vehicle.hauteurM, largeur_m: vehicle.largeurM, longueur_m: vehicle.longueurM, poids_t: vehicle.poidsT, charge_essieu_t: vehicle.chargeEssieuT, nb_essieux: vehicle.nbEssieux, matieres_dangereuses: vehicle.matieresDangereuses },
    itineraire: { duree_s: route.durationS, distance_km: route.distanceKm, geojson: route.geojson }, etapes: route.steps,
    obstacles_evites: obstacles, gabarits_trajet: gauges, gabarit_non_verifie: {
      part_lineaire: unknownPart, longueur_km: unknownKm,
      geojson: { type: "FeatureCollection", features: unknownEdges.flatMap((edge) => edge.geometry ? [{ type: "Feature" as const, properties: { wayId: edge.wayId, nom: edge.name ?? null }, geometry: edge.geometry }] : []) },
    },
    confiance: { niveau, part_verifiee: verified, sources: ["OpenStreetMap"] }, avertissements: warnings, generatedAt: now.toISOString(),
  };
}
