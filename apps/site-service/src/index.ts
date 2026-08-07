import { createPool, runMigrations } from "@opendata-vda/shared";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createPool();
  await runMigrations(pool, config.migrationsDir);

  const app = buildApp({ config, pool });
  const close = async () => {
    await app.close();
    await pool.end();
  };
  process.once("SIGINT", () => void close());
  process.once("SIGTERM", () => void close());

  await app.listen({ host: config.host, port: config.port });
}

main().catch((error) => {
  console.error("site-service : échec fatal au démarrage", error);
  process.exit(1);
});
