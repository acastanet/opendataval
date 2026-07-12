import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { TERRITOIRE } from "@opendata-vda/shared";

export function registerTerritoireRoutes(app: FastifyInstance, pool: pg.Pool): void {
  app.get("/api/territoire", async () => {
    const communeRes = await pool.query(
      `select code_insee, nom, code_epci, population, surface_ha, maj,
              ST_AsGeoJSON(geom)::json as geometry
       from territoire.communes where code_insee = $1`,
      [TERRITOIRE.commune.codeInsee],
    );
    const epciRes = await pool.query(
      `select code_insee, nom, population, ST_AsGeoJSON(geom)::json as geometry
       from territoire.communes where est_epci_membre = true order by nom`,
    );
    return {
      commune: communeRes.rows[0] ?? null,
      epci: {
        code: TERRITOIRE.epci.code,
        nom: TERRITOIRE.epci.nom,
        communes: epciRes.rows,
      },
      montAigoual: TERRITOIRE.montAigoual,
    };
  });
}
