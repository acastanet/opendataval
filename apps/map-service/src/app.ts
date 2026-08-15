import Fastify, { type FastifyInstance } from "fastify";
import { performance } from "node:perf_hooks";
import { ALTIMETRIE_IGN, RELIEF_MAXZOOM, type FondCartographique } from "@opendata-vda/shared/carto";
import { loadConfig, type MapConfig } from "./config.js";
import { chargerBinaire, ErreurHttpAmont, urlAltimetrieIgn, urlBrgm, urlIgn, urlRadar, type FetchLike } from "./clients/amonts.js";
import { erreurPublique } from "./domain/erreurs.js";
import { empriseLambert } from "./domain/lambert93.js";
import { indexLegendes, trouverLegende } from "./domain/legendes.js";
import { ANCIENS_STYLES, construireStyle, lireOptionsStyle, NOM_STYLE } from "./domain/styles.js";
import { cleTuile, lireCoordonneesTuile, type CoordonneesTuile } from "./domain/tuiles.js";
import { ActifsStatiques } from "./services/actifs-statiques.js";
import { CacheTuiles } from "./services/cache-tuiles.js";
import { MetriquesMap } from "./services/metriques.js";
import { ReliefPmtiles } from "./services/relief-pmtiles.js";
import { tuileTerrarium } from "./services/relief-ign.js";

export interface BuildAppOptions {
  config?: MapConfig;
  fetchImpl?: FetchLike;
  logger?: boolean;
}

type Params = Record<string, string>;
type Query = Record<string, unknown>;
const TUILE_TRANSPARENTE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+3jHqWQAAAABJRU5ErkJggg==",
  "base64",
);

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
  const relief = new ReliefPmtiles(config.reliefRegions);
  const actifs = new ActifsStatiques(config.assetsRoot);
  const metriques = new MetriquesMap();

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-request-id", request.id);
    return payload;
  });
  app.addHook("onReady", async () => {
    await Promise.all([relief.initialiser(), actifs.initialiser()]);
  });
  app.addHook("onClose", async () => relief.close());

  app.get("/health", async () => ({ status: "ok", service: "map-service", version: config.version }));
  app.get("/ready", async () => {
    const dependencies = { relief: relief.status(), vendor: actifs.vendorStatus(), glyphes: actifs.glyphStatus() };
    const status = Object.values(dependencies).every((value) => value === "disponible") ? "ready" : "degraded";
    // Le détail par région ne pèse pas sur `status` : une région déclarée dont l'archive
    // reste à générer est un chantier connu, pas une panne du service.
    return { status, service: "map-service", version: config.version, dependencies, regionsRelief: relief.detailRegions() };
  });

  app.get<{ Params: Params; Querystring: Query }>("/api/v2/map/styles/:style.json", async (request, reply) => {
    const nom = String(request.params.style ?? "");
    if (nom !== NOM_STYLE) {
      const remplace = (ANCIENS_STYLES as readonly string[]).includes(nom);
      const message = remplace
        ? `Le style « ${nom} » a été remplacé par le style unique « ${NOM_STYLE} » : appelez /api/v2/map/styles/${NOM_STYLE}.json avec les paramètres fond, geologie, teintes, ombrage, terrain et exageration.`
        : "Le style cartographique demandé n’existe pas.";
      return reply.code(404).send(erreurPublique("STYLE_INCONNU", message, false, request.id));
    }
    try {
      const optionsStyle = lireOptionsStyle(request.query);
      reply.header("cache-control", "public, max-age=3600, stale-while-revalidate=86400");
      return construireStyle(optionsStyle);
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
      if (source !== "radar" && error instanceof ErreurHttpAmont && error.status === 404) {
        const cacheControl = "public, max-age=86400";
        cache.set(cle, { data: TUILE_TRANSPARENTE_PNG, contentType: "image/png", cacheControl });
        metriques.miss(source, TUILE_TRANSPARENTE_PNG.byteLength, performance.now() - debut);
        request.log.info({ source, ...tuile }, "tuile absente de la couverture amont");
        return envoyerBinaire(reply, TUILE_TRANSPARENTE_PNG, "image/png", cacheControl, "miss");
      }
      metriques.erreur(source, performance.now() - debut);
      request.log.warn({ err: error, source, ...tuile }, "échec de chargement d’une tuile");
      const invalide = source === "radar" && error instanceof Error && error.message.includes("frame radar");
      // Un fond momentanément injoignable — le cas d'une liaison lente qui expire — ne
      // doit pas trouer la carte : on rend une tuile vide plutôt qu'une erreur que
      // MapLibre relaie à la console. Elle n'est jamais mémorisée, ni ici ni chez le
      // client, pour que la vraie tuile revienne dès que l'amont répond ; l'en-tête et
      // les métriques gardent la panne visible.
      if (!invalide && source !== "radar") {
        reply.header("x-tuile", "indisponible");
        return envoyerBinaire(reply, TUILE_TRANSPARENTE_PNG, "image/png", "no-store");
      }
      return reply.code(invalide ? 400 : 502).send(erreurPublique(invalide ? "FRAME_RADAR_INVALIDE" : "TUILE_AMONT_INDISPONIBLE", invalide ? "Le chemin de frame radar est invalide." : "La tuile cartographique amont est indisponible.", !invalide, request.id));
    }
  };
  app.get<{ Params: Params; Querystring: Query }>("/api/v2/map/tiles/:source/:z/:x/:y.:ext", traiterTuile);
  app.get<{ Params: Params; Querystring: Query }>("/api/v2/map/tiles/:source/:z/:x/:y", traiterTuile);

  // Les archives PMTiles stockent des WebP sans perte : le gabarit canonique du style
  // est en .webp, l'extension .png reste servie pour les clients déjà déployés.
  const traiterTuileRelief = async (request: any, reply: any) => {
    const tuile = lireCoordonneesTuile(request.params, RELIEF_MAXZOOM);
    if (!tuile) return reply.code(400).send(erreurPublique("TUILE_INVALIDE", "Les coordonnées de tuile sont invalides.", false, request.id));
    try {
      const data = await relief.getTile(tuile.z, tuile.x, tuile.y);
      if (!data) return reply.code(404).send(erreurPublique("TUILE_RELIEF_ABSENTE", "Aucune tuile de relief n’est disponible à cette coordonnée.", false, request.id));
      return envoyerBinaire(reply, Buffer.from(data), "image/webp", "public, max-age=2592000, immutable");
    } catch (error) {
      if (error instanceof Error && error.message === "RELIEF_INDISPONIBLE") return reply.code(503).send(erreurPublique("RELIEF_INDISPONIBLE", "Les archives de relief ne sont pas montées.", true, request.id));
      request.log.error({ err: error, ...tuile }, "lecture PMTiles en erreur");
      return reply.code(500).send(erreurPublique("ERREUR_RELIEF", "La tuile de relief n’a pas pu être lue.", true, request.id));
    }
  };
  app.get<{ Params: Params }>("/api/v2/map/relief/:z/:x/:y.webp", traiterTuileRelief);
  app.get<{ Params: Params }>("/api/v2/map/relief/:z/:x/:y.png", traiterTuileRelief);

  // Relief haute définition : le RGE ALTI de la Géoplateforme, converti à la volée en tuile
  // terrarium. Les archives locales s'arrêtent à z15 (~1,7 m/px) ; au-delà, MapLibre ne fait
  // qu'interpoler, alors que le RGE ALTI porte encore du détail réel.
  //
  // Sous ce seuil, la route sert l'archive locale plutôt que d'appeler l'IGN : elle est
  // aussi fine à ces niveaux, et cela rend la pyramide complète. Sans quoi MapLibre, qui
  // charge les tuiles parentes pendant les déplacements, réclamerait jusqu'à la tuile 0/0/0
  // et se verrait refuser tous les niveaux du dessous.
  app.get<{ Params: Params }>("/api/v2/map/relief-hd/:z/:x/:y.png", async (request, reply) => {
    const debut = performance.now();
    const tuile = lireCoordonneesTuile(request.params, ALTIMETRIE_IGN.zoomMax);
    if (!tuile) return reply.code(400).send(erreurPublique("TUILE_INVALIDE", `Les coordonnées de tuile sont invalides ou au-delà du zoom ${ALTIMETRIE_IGN.zoomMax}.`, false, request.id));
    if (tuile.z < ALTIMETRIE_IGN.zoomMin) return traiterTuileRelief(request, reply);

    const cle = cleTuile("relief-hd", tuile);
    const cacheControl = "public, max-age=2592000, immutable";
    const memorisee = cache.get(cle);
    if (memorisee) {
      metriques.hit("relief-hd", memorisee.data.byteLength, performance.now() - debut);
      return envoyerBinaire(reply, memorisee.data, memorisee.contentType, memorisee.cacheControl, "hit");
    }
    try {
      const emprise = empriseLambert(tuile);
      const reponse = await chargerBinaire(urlAltimetrieIgn(config.ignAltimetrieUrl, config.ignAltimetrieLayer, emprise), config.upstreamTimeoutMs, fetchImpl);
      const png = tuileTerrarium(reponse.data, emprise, tuile);
      cache.set(cle, { data: png, contentType: "image/png", cacheControl });
      metriques.miss("relief-hd", png.byteLength, performance.now() - debut);
      request.log.info({ source: "relief-hd", ...tuile }, "tuile d’altitude convertie depuis l’amont");
      return envoyerBinaire(reply, png, "image/png", cacheControl, "miss");
    } catch (error) {
      metriques.erreur("relief-hd", performance.now() - debut);
      request.log.warn({ err: error, source: "relief-hd", ...tuile }, "échec de conversion d’une tuile d’altitude");
      return reply.code(502).send(erreurPublique("TUILE_AMONT_INDISPONIBLE", "Le service altimétrique amont est indisponible.", true, request.id));
    }
  });

  app.get("/api/v2/map/legends", async (_request, reply) => {
    reply.header("cache-control", "public, max-age=3600");
    return indexLegendes();
  });
  app.get<{ Params: Params }>("/api/v2/map/legends/:layer", async (request, reply) => {
    const legende = trouverLegende(String(request.params.layer ?? ""));
    if (!legende) return reply.code(404).send(erreurPublique("LEGENDE_INCONNUE", "La légende demandée n’existe pas.", false, request.id));
    reply.header("cache-control", "public, max-age=3600");
    return legende;
  });

  app.get<{ Params: Params }>("/api/v2/map/glyphs/:fontstack/:range.pbf", async (request, reply) => {
    const data = actifs.glyphe(String(request.params.fontstack ?? ""), String(request.params.range ?? ""));
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
