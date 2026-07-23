import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = await buildApp({ config });
app.listen({ host: config.host, port: config.port }).catch((error) => {
  app.log.error({ err: error }, "weather-vigilance-service : échec fatal au démarrage");
  process.exit(1);
});
