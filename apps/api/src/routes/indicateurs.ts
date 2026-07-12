import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { INDICATEURS_PAR_SLUG } from "@opendata-vda/shared";

export function registerIndicateursRoutes(app: FastifyInstance, pool: pg.Pool): void {
  app.get<{ Params: { slug: string }; Querystring: { territoire?: string; depuis?: string } }>(
    "/api/indicateurs/:slug",
    async (req, reply) => {
      const { slug } = req.params;
      if (!INDICATEURS_PAR_SLUG.has(slug)) {
        reply.code(404);
        return { error: "indicateur inconnu" };
      }
      const { territoire, depuis } = req.query;
      const { rows } = await pool.query(
        `select territoire, periode, valeur
         from series.indicateurs
         where indicateur = $1
           and ($2::text is null or territoire = $2)
           and ($3::text is null or periode >= $3)
         order by territoire, periode`,
        [slug, territoire ?? null, depuis ?? null],
      );
      reply.header("cache-control", "public, max-age=86400");
      return { indicateur: slug, points: rows };
    },
  );
}
