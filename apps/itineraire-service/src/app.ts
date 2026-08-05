import Fastify, { type FastifyInstance } from "fastify";
import { analyzeRoute } from "./analysis.js";
import type { ItineraireConfig } from "./config.js";
import { loadRestrictions, type RestrictionsIndex } from "./restrictions.js";
import { createValhallaClient, ValhallaRouteError, ValhallaUnavailableError } from "./valhalla.js";
import type { ValhallaClient, VehicleInput } from "./types.js";

export interface BuildAppOptions { config: ItineraireConfig; client?: ValhallaClient; restrictions?: RestrictionsIndex; logger?: boolean; now?: () => Date; }
function failure(code: string, message: string, retryable: boolean, requestId: string) { return { error: { code, message, retryable }, requestId }; }
function parseInput(query: Record<string, unknown>): VehicleInput | null {
  const values: Record<string, number> = {};
  const rules: Array<[string, string, number, number]> = [
    ["lonDepart", "lon_depart", -180, 180], ["latDepart", "lat_depart", -90, 90], ["lonArrivee", "lon_arrivee", -180, 180], ["latArrivee", "lat_arrivee", -90, 90],
    ["hauteurM", "hauteur_m", 0.1, 10], ["largeurM", "largeur_m", 0.1, 5], ["longueurM", "longueur_m", 0.1, 40], ["poidsT", "poids_t", 0.1, 100], ["chargeEssieuT", "charge_essieu_t", 0.1, 30], ["nbEssieux", "nb_essieux", 1, 12],
  ];
  for (const [property, name, min, max] of rules) { const value = typeof query[name] === "string" ? Number(query[name]) : Number.NaN; if (!Number.isFinite(value) || value < min || value > max || (name === "nb_essieux" && !Number.isInteger(value))) return null; values[property] = value; }
  const dangerous = query.matieres_dangereuses;
  if (dangerous !== "0" && dangerous !== "1") return null;
  const lonDepart = values.lonDepart;
  const lonArrivee = values.lonArrivee;
  const latDepart = values.latDepart;
  const latArrivee = values.latArrivee;
  if (lonDepart === undefined || lonArrivee === undefined || latDepart === undefined || latArrivee === undefined) return null;
  // Le graphe du POC couvre le corridor Doubs ↔ Cévennes. Refuser les recherches
  // hors zone donne un retour utile au lieu d’un échec Valhalla.
  if (lonDepart < 2 || lonDepart > 7 || lonArrivee < 2 || lonArrivee > 7 || latDepart < 43.2 || latDepart > 48 || latArrivee < 43.2 || latArrivee > 48) return null;
  return { ...values, matieresDangereuses: dangerous === "1" } as VehicleInput;
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? true, requestIdHeader: "x-request-id", trustProxy: true });
  const client = options.client ?? createValhallaClient(options.config);
  let index = options.restrictions ?? new Map();
  const loaded = options.restrictions ? Promise.resolve() : loadRestrictions(options.config.restrictionsFile).then((value) => { index = value; });
  app.addHook("onSend", async (request, reply, payload) => { reply.header("x-request-id", request.id); return payload; });
  app.get("/health", async () => ({ status: "ok", service: "itineraire-service", version: options.config.version }));
  app.get("/ready", async (_request, reply) => { await loaded; return reply.send({ status: "ready", service: "itineraire-service", version: options.config.version, restrictions: index.size }); });
  const route = async (request: { query: Record<string, unknown>; id: string }, reply: { code: (status: number) => { send: (body: unknown) => unknown } }) => {
    await loaded; const vehicle = parseInput(request.query);
    if (!vehicle) return reply.code(400).send(failure("INVALID_QUERY", "Les coordonnées et le gabarit sont obligatoires. Pour ce POC, départ et arrivée doivent être dans le corridor Doubs–Cévennes (longitude 2–7 ; latitude 43,2–48).", false, request.id));
    try { const [truck, auto] = await Promise.all([client.route(vehicle, "truck"), client.route(vehicle, "auto")]); return analyzeRoute(truck, auto, index, vehicle, options.now?.()); }
    catch (error) {
      if (error instanceof ValhallaRouteError) return reply.code(422).send(failure("ROUTE_NOT_FOUND", "Aucune voie praticable n’a été trouvée à proximité d’un des points. Choisissez une adresse ou un point plus proche d’une route ouverte à la circulation.", false, request.id));
      if (error instanceof ValhallaUnavailableError) return reply.code(503).send(failure("VALHALLA_UNAVAILABLE", "Le moteur d’itinéraire est en cours de préparation ou indisponible.", true, request.id));
      throw error;
    }
  };
  app.get<{ Querystring: Record<string, unknown> }>("/internal/v1/itineraire/poids-lourd", route);
  app.get<{ Querystring: Record<string, unknown> }>("/api/v2/itineraire/poids-lourd", route);
  app.setErrorHandler((error, request, reply) => { request.log.error({ err: error }, "calcul itinéraire en erreur"); return reply.code(500).send(failure("ITINERAIRE_CALCULATION_FAILED", "L’itinéraire n’a pas pu être calculé.", true, request.id)); });
  return app;
}
