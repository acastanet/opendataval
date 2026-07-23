import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const app = buildApp({ config });
  let closing = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, "arrêt du gateway");
    try {
      await app.close();
      process.exitCode = 0;
    } catch (error) {
      app.log.error({ err: error }, "échec de l'arrêt propre du gateway");
      process.exitCode = 1;
    }
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ host: config.host, port: config.port });
}

main().catch((error) => {
  console.error("gateway-service : échec fatal au démarrage", error);
  process.exit(1);
});
