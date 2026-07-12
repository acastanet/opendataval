import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { CATALOGUE_SOURCES } from "@opendata-vda/shared";

const SLUG_AUTORISES = new Set(CATALOGUE_SOURCES.map((s) => s.slug));

export function registerCouchesRoutes(app: FastifyInstance, pool: pg.Pool): void {
  app.get("/api/couches", async () => {
    const { rows } = await pool.query(
      `select couche, count(*)::int as nb, max(maj) as derniere_maj
       from couches.objets group by couche order by couche`,
    );
    return { couches: rows, sources: CATALOGUE_SOURCES };
  });

  app.get<{ Params: { slug: string } }>("/api/couches/:slug/geojson", async (req, reply) => {
    const { slug } = req.params;
    if (!SLUG_AUTORISES.has(slug as (typeof CATALOGUE_SOURCES)[number]["slug"])) {
      reply.code(404);
      return { error: "couche inconnue" };
    }
    const { rows } = await pool.query<{
      external_id: string;
      props: Record<string, unknown>;
      source_url: string | null;
      geometry: unknown;
    }>(
      `select external_id, props, source_url, ST_AsGeoJSON(geom, 6)::json as geometry
       from couches.objets where couche = $1`,
      [slug],
    );
    reply.header("cache-control", "public, max-age=3600");
    return {
      type: "FeatureCollection",
      features: rows.map((r) => ({
        type: "Feature",
        geometry: r.geometry,
        properties: { ...r.props, external_id: r.external_id, source_url: r.source_url },
      })),
    };
  });
}
