import Fastify, { type FastifyInstance } from "fastify";
import { performance } from "node:perf_hooks";
import { type FondCartographique } from "@opendata-vda/shared/carto";
import { loadConfig, type MapConfig } from "./config.js";
import { chargerBinaire, urlBrgm, urlIgn, urlRadar, type FetchLike } from "./clients/amonts.js";
import { erreurPublique } from "./domain/erreurs.js";
import { indexLegendes, trouverLegende } from "./domain/legendes.js";
import { construireStyle, estNomStyle, lireOptionsStyle } from "./domain/styles.js";
import { cleTuile, lireCoordonneesTuile, type CoordonneesTuile } from "./domain/tuiles.js";
import { ActifsStatiques } from "./services/actifs-statiques.js";
import { CacheTuiles } from "./services/cache-tuiles.js";
import { MetriquesMap } from "./services/metriques.js";
import { ReliefPmtiles } from "./services/relief-pmtiles.js";

export interface BuildAppOptions {
  config?: MapConfig;
  fetchImpl?: FetchLike;
  logger?: boolean;
}

type Params = Record<string, string>;
type Query = Record<string, unknown>;

function envoyerBinaire(reply: any, data: Buffer, contentType: string, cacheControl: string, cache?: "hit" | "miss") {
  reply.type(contentType).header("cache-control", cacheControl);
  if (cache) reply.header("x-cache", cache);
  return reply.send(data);
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const config = options.config ?? loadConfig();
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const app = Fastify({ logger: options.logger ?? true, requestIdHeader: "x-request-id", trustProxy: true });
  const cache = new CacheTuiles(config.tileCacheMaxBytes);
  const relief = new ReliefPmtiles(config.reliefGlobalPath, config.reliefHdPath);
  const actifs = new ActifsStatiques(config.assetsRoot);
  const metriques = new MetriquesMap();

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-request-id", request.id);
    return payload;
  });
  app.addHook("onReady", async () => {
    await Promise.all([
      relief.initialiser(config.reliefGlobalPath, config.reliefHdPath),
      actifs.initialiser(),
    ]);
  });
  app.addHook("onClose", async () => relief.close());

  app.get("/health", async () => ({ status: "ok", service: "map-service", version: config.version }));
  app.get("/ready", async () => {
    const dependencies = { relief: relief.status(), vendor: actifs.vendorStatus(), glyphes: actifs.glyphStatus() };
    const status = Object.values(dependencies).every((value) => value === "disponible") ? "ready" : "degraded";
    return { status, service: "map-service", version: config.version, dependencies };
  });

  app.get<{ Params: Params; Querystring: Query }>("/api/v2/map/styles/:style.json", async (request, reply) => {
    const nom = request.params.style;
    if (!estNomStyle(nom)) return reply.code(404).send(erreurPublique("STYLE_INCONNU", "Le style cartographique demandé n’existe pas.", false, request.id));
    try {
      const optionsStyle = lireOptionsStyle(request.query);
      reply.header("cache-control", "public, max-age=3600, stale-while-revalidate=86400");
      return construireStyle(nom, optionsStyle);
    } catch (error) {
      return reply.code(400).send(erreurPublique("OPTIONS_STYLE_INVALIDES", error instanceof Error ? error.message : "Options de style invalides.", false, request.id));
    }
  });

  const traiterTuile = async (request: any, reply: any) => {
    const debut = performance.now();
    const source = String(request.params.source);
    const tuile = lireCoordonneesTuile(request.params);
    if (!tuile) return reply.code(400).send(erreurPublique("TUILE_INVALIDE", "Les coordonnées de tuile sont invalides.", false, request.id));
    if (!["plan", "photo", "satellite", "geologie", "radar"].includes(source)) return reply.code(404).send(erreurPublique("SOURCE_INCONNUE", "La source cartographique demandée n’existe pas.", false, request.id));

    const pathRadar = source === "radar" && typeof request.query?.path === "string" ? request.query.path : "";
    const cle = cleTuile(source, tuile, pathRadar);
    if (source !== "radar") {
      const memorisee = cache.get(cle);
      if (memorisee) {
        metriques.hit(source, memorisee.data.byteLength, performance.now() - debut);
        return envoyerBinaire(reply, memorisee.data, memorisee.contentType, memorisee.cacheControl, "hit");
      }
    }

    try {
      let url: string;
      let contentType = "image/png";
      let cacheControl = "public, max-age=604800";
      if (source === "geologie") {
        url = urlBrgm(config.brgmUpstreamUrl, tuile);
      } else if (source === "radar") {
        url = urlRadar(pathRadar, tuile);
        cacheControl = "public, max-age=600";
      } else {
        const ign = urlIgn(config.ignUpstreamUrl, source as FondCartographique, tuile);
        url = ign.url;
        contentType = ign.contentType;
        cacheControl = "public, max-age=604800, immutable";
      }
      const reponse = await chargerBinaire(url, config.upstreamTimeoutMs, fetchImpl);
      contentType = reponse.contentType.startsWith("image/") ? reponse.contentType : contentType;
      if (source !== "radar") cache.set(cle, { data: reponse.data, contentType, cacheControl });
      metriques.miss(source, reponse.data.byteLength, performance.now() - debut);
      request.log.info({ source, z: tuile.z, x: tuile.x, y: tuile.y }, "tuile chargée depuis l’amont");
      return envoyerBinaire(reply, reponse.data, contentType, cacheControl, source === "radar" ? undefined : "miss");
    } catch (error) {
      metriques.erreur(source, performance.now() - debut);
      request.log.warn({ err: error, source, ...tuile }, "échec de chargement d’une tuile");
      const invalide = source === "radar" && error instanceof Error && error.message.includes("frame radar");
      return reply.code(invalide ? 400 : 502).send(erreurPublique(invalide ? "FRAME_RADAR_INVALIDE" : "TUILE_AMONT_INDISPONIBLE", invalide ? "Le chemin de frame radar est invalide." : "La tuile cartographique amont est indisponible.", !invalide, request.id));
    }
  };
  app.get<{ Params: Params; Querystring: Query }>("/api/v2/map/tiles/:source/:z/:x/:y.:ext", traiterTuile);
  app.get<{ Params: Params; Querystring: Query }>("/api/v2/map/tiles/:source/:z/:x/:y", traiterTuile);

  app.get<{ Params: Params }>("/api/v2/map/relief/:z/:x/:y.png", async (request, reply) => {
    const tuile = lireCoordonneesTuile(request.params, 15);
    if (!tuile) return reply.code(400).send(erreurPublique("TUILE_INVALIDE", "Les coordonnées de tuile sont invalides.", false, request.id));
    try {
      const data = await relief.getTile(tuile.z, tuile.x, tuile.y, request.raw.signal);
      if (!data) return reply.code(404).send(erreurPublique("TUILE_RELIEF_ABSENTE", "Aucune tuile de relief n’est disponible à cette coordonnée.", false, request.id));
      return envoyerBinaire(reply, Buffer.from(data), "image/png", "public, max-age=2592000, immutable");
    } catch (error) {
      if (error instanceof Error && error.message === "RELIEF_INDISPONIBLE") return reply.code(503).send(erreurPublique("RELIEF_INDISPONIBLE", "Les archives de relief ne sont pas montées.", true, request.id));
      request.log.error({ err: error, ...tuile }, "lecture PMTiles en erreur");
      return reply.code(500).send(erreurPublique("ERREUR_RELIEF", "La tuile de relief n’a pas pu être lue.", true, request.id));
    }
  });

  app.get("/api/v2/map/legends", async (_request, reply) => {
    reply.header("cache-control", "public, max-age=3600");
    return indexLegendes();
  });
  app.get<{ Params: Params }>("/api/v2/map/legends/:layer", async (request, reply) => {
    const legende = trouverLegende(request.params.layer);
    if (!legende) return reply.code(404).send(erreurPublique("LEGENDE_INCONNUE", "La légende demandée n’existe pas.", false, request.id));
    reply.header("cache-control", "public, max-age=3600");
    return legende;
  });

  app.get<{ Params: Params }>("/api/v2/map/glyphs/:fontstack/:range.pbf", async (request, reply) => {
    const data = actifs.glyphe(request.params.fontstack, request.params.range);
    if (data === undefined) return reply.code(503).send(erreurPublique("GLYPHES_INDISPONIBLES", "Les glyphes cartographiques ne sont pas installés.", true, request.id));
    return envoyerBinaire(reply, data, "application/x-protobuf", "public, max-age=31536000, immutable");
  });

  app.get<{ Params: Params }>("/api/v2/map/vendor/maplibre-gl.:ext", async (request, reply) => {
    const ext = request.params.ext;
    if (ext !== "js" && ext !== "css") return reply.code(404).send(erreurPublique("ACTIF_INCONNU", "L’actif demandé n’existe pas.", false, request.id));
    const actif = actifs.vendor(ext);
    if (!actif) return reply.code(503).send(erreurPublique("VENDOR_INDISPONIBLE", "Les actifs MapLibre ne sont pas installés.", true, request.id));
    const gzip = String(request.headers["accept-encoding"] ?? "").includes("gzip");
    if (gzip) reply.header("content-encoding", "gzip").header("vary", "accept-encoding");
    reply.header("x-maplibre-version", actifs.vendorVersion() ?? "unknown");
    return envoyerBinaire(reply, gzip ? actif.gzip : actif.data, actif.contentType, "public, max-age=31536000, immutable");
  });

  app.get("/internal/v1/map/metrics", async () => ({ cache: cache.stats(), familles: metriques.snapshot() }));

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "erreur interne map-service");
    return reply.code(500).send(erreurPublique("INTERNAL_ERROR", "Une erreur interne est survenue.", true, request.id));
  });
  return app;
}
