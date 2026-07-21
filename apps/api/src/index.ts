import Fastify from "fastify";
import { createPool, runMigrations } from "@opendata-vda/shared";
import { registerTerritoireRoutes } from "./routes/territoire.js";
import { registerCouchesRoutes } from "./routes/couches.js";
import { registerPiezoRoutes } from "./routes/piezo.js";
import { registerOutilsRoutes } from "./routes/outils.js";
import { registerMeteoRoutes } from "./routes/meteo.js";
import { registerMeteoClimateRoutes } from "./routes/meteoClimate.js";
import { registerIndicateursRoutes } from "./routes/indicateurs.js";
import { registerIncendiesRoutes } from "./routes/incendies.js";

const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR ?? "/app/db/migrations";

async function main(): Promise<void> {
  const pool = createPool();
  await runMigrations(pool, MIGRATIONS_DIR);

  const app = Fastify({ logger: true });

  app.get("/api/health", async (_request, reply) => {
    try {
      await pool.query("select 1");
      return { status: "ok" };
    } catch (error) {
      app.log.error(error, "Base PostgreSQL indisponible");
      reply.code(503);
      return { status: "error" };
    }
  });

  registerTerritoireRoutes(app, pool);
  registerCouchesRoutes(app, pool);
  registerPiezoRoutes(app, pool);
  registerOutilsRoutes(app, pool);
  registerMeteoRoutes(app, pool);
  registerMeteoClimateRoutes(app, pool);
  registerIndicateursRoutes(app, pool);
  registerIncendiesRoutes(app, pool);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error("api : échec fatal au démarrage", err);
  process.exit(1);
});
