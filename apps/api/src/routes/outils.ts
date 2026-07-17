import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { TERRITOIRE, COMMUNES_EPCI } from "@opendata-vda/shared";

const CODES_EPCI = new Set<string>(COMMUNES_EPCI.map((c) => c.codeInsee));

// Stations de l'Hérault télésuivies par Vigicrues (repli live hors Hub'Eau).
const CODES_VIGICRUES = new Set<string>([
  "Y200002701",
  "Y210001001",
  "Y210002001",
  "Y214001002",
  "Y214002001",
  "Y230002001",
  "Y233001002",
  "Y237002001",
]);

const NOM_COUCHE: Record<string, string> = {
  cavite: "Cavité souterraine",
  mouvement: "Mouvement de terrain",
  piezo: "Piézomètre (nappe)",
  station_hydro: "Station hydrométrique",
  ecole: "École",
  administration: "Service public",
  poi_osm: "Point d'intérêt",
  natura2000: "Site Natura 2000",
  znieff: "ZNIEFF",
  commune: "Commune",
  station_meteo: "Station météo",
};

interface Resultat {
  type: "adresse" | "lieu" | "commune";
  couche: string;
  label: string;
  sousLabel: string | null;
  lon: number;
  lat: number;
  score: number;
}

interface FeatureBan {
  properties: { label: string; context: string; citycode: string; score: number };
  geometry: { coordinates: [number, number] };
}

async function rechercherBan(q: string): Promise<Resultat[]> {
  const url =
    `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}` +
    `&autocomplete=1&limit=15&lat=${TERRITOIRE.commune.centre.lat}&lon=${TERRITOIRE.commune.centre.lon}`;
  const res = await fetch(url);
  const data = (await res.json()) as { features?: FeatureBan[] };
  return (data.features ?? [])
    .filter((f) => CODES_EPCI.has(f.properties.citycode))
    .slice(0, 5)
    .map((f) => ({
      type: "adresse",
      couche: "adresse",
      label: f.properties.label,
      sousLabel: f.properties.context,
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
      score: f.properties.score,
    }));
}

async function rechercherLieux(pool: pg.Pool, q: string): Promise<Resultat[]> {
  const { rows } = await pool.query<{
    type: "lieu" | "commune";
    couche: string;
    nom: string;
    sous_label: string | null;
    lon: number;
    lat: number;
    score: number;
  }>(
    `select type, couche, nom, sous_label,
            ST_X(pt) as lon, ST_Y(pt) as lat,
            word_similarity(unaccent(lower($1)), unaccent(lower(nom))) as score
     from couches.lieux_recherche
     where unaccent(lower(nom)) ilike '%' || unaccent(lower($1)) || '%'
        or word_similarity(unaccent(lower($1)), unaccent(lower(nom))) > 0.35
     order by score desc
     limit 5`,
    [q],
  );
  return rows.map((r) => ({
    type: r.type,
    couche: r.couche,
    label: r.nom,
    sousLabel: r.sous_label ?? NOM_COUCHE[r.couche] ?? null,
    lon: r.lon,
    lat: r.lat,
    score: Number(r.score),
  }));
}

/** Petits proxys côté serveur pour éviter le CORS et centraliser le User-Agent. */
export function registerOutilsRoutes(app: FastifyInstance, pool: pg.Pool): void {
  app.get<{ Querystring: { lon?: string; lat?: string } }>("/api/alti", async (req, reply) => {
    const { lon, lat } = req.query;
    if (!lon || !lat) {
      reply.code(400);
      return { error: "paramètres lon et lat requis" };
    }
    const url =
      `https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json` +
      `?lon=${encodeURIComponent(lon)}&lat=${encodeURIComponent(lat)}&resource=ign_rge_alti_wld`;
    const res = await fetch(url);
    return res.json();
  });

  // Repli temps réel pour l'hydrométrie (observations_tr Hub'Eau en panne).
  // Vigicrues ne renvoie aucun en-tête CORS → proxy côté serveur obligatoire.
  app.get<{ Querystring: { code?: string; grandeur?: string } }>(
    "/api/vigicrues/observations",
    async (req, reply) => {
      const { code, grandeur } = req.query;
      if (!code || !CODES_VIGICRUES.has(code)) {
        reply.code(400);
        return { error: "code de station non autorisé" };
      }
      if (grandeur !== "H" && grandeur !== "Q") {
        reply.code(400);
        return { error: "grandeur doit valoir H (hauteur) ou Q (débit)" };
      }
      const url =
        `https://www.vigicrues.gouv.fr/services/observations.json/?CdStationHydro=${encodeURIComponent(code)}` +
        `&GrdSerie=${encodeURIComponent(grandeur)}`;
      const res = await fetch(url, { headers: { "User-Agent": "OpenDataVdA/1.0" } });
      if (!res.ok) {
        req.log.error(`Vigicrues → HTTP ${res.status} pour ${code}/${grandeur}`);
        reply.code(502);
        return { error: `Vigicrues indisponible (HTTP ${res.status})` };
      }
      const json = (await res.json()) as { error_msg?: string };
      if (json && json.error_msg) {
        reply.code(502);
        return { error: json.error_msg };
      }
      reply.header("Cache-Control", "public, max-age=600");
      return json;
    }
  );

  app.get<{ Querystring: { q?: string } }>("/api/recherche", async (req, reply) => {
    const { q } = req.query;
    if (!q || q.trim().length < 3) {
      reply.code(400);
      return { error: "paramètre q requis (3 caractères minimum)" };
    }
    const [ban, lieux] = await Promise.allSettled([rechercherBan(q), rechercherLieux(pool, q)]);
    const resultats = [
      ...(ban.status === "fulfilled" ? ban.value : []),
      ...(lieux.status === "fulfilled" ? lieux.value : []),
    ].sort((a, b) => b.score - a.score);
    if (ban.status === "rejected") req.log.error(ban.reason, "recherche BAN indisponible");
    if (lieux.status === "rejected") req.log.error(lieux.reason, "recherche lieux locaux indisponible");
    return { resultats };
  });
}
