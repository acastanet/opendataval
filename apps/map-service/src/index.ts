import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = buildApp({ config });
const close = async () => { await app.close(); };
process.once("SIGINT", () => void close());
process.once("SIGTERM", () => void close());
app.listen({ host: config.host, port: config.port }).catch((error) => {
  app.log.error({ err: error }, "map-service : échec fatal au démarrage");
  process.exit(1);
});
