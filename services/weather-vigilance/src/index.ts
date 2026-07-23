import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { Metrics } from "./metrics.js";
import { MeteoFranceClient } from "./source-client.js";
import { VigilanceStore } from "./store.js";

const config = loadConfig();
const metrics = new Metrics();
const client = new MeteoFranceClient(config, metrics);
const store = new VigilanceStore(config, client, metrics);
await store.restore();
const app = buildApp({ config, store, metrics });
const timer = setInterval(() => void store.refresh(), config.refreshSeconds * 1000); timer.unref();
app.addHook("onClose", async () => clearInterval(timer));
app.listen({ host: config.host, port: config.port }).then(() => void store.refresh()).catch((err) => { app.log.error({ err }, "weather-vigilance: fatal startup failure"); process.exit(1); });
