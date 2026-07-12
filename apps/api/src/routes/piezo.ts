import type { FastifyInstance } from "fastify";
import type pg from "pg";

export function registerPiezoRoutes(app: FastifyInstance, pool: pg.Pool): void {
  app.get<{ Querystring: { code_bss?: string; depuis?: string } }>(
    "/api/piezo/chronique",
    async (req, reply) => {
      const { code_bss, depuis } = req.query;
      if (!code_bss) {
        reply.code(400);
        return { error: "paramètre code_bss requis" };
      }
      const { rows } = await pool.query(
        `select date, niveau_m_ngf
         from series.piezo
         where code_bss = $1 and ($2::date is null or date >= $2::date)
         order by date`,
        [code_bss, depuis ?? null],
      );
      return { code_bss, mesures: rows };
    },
  );
}
