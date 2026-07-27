import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { SnapshotStore } from "./store.js";
import { synchronizeRna } from "./sync.js";

const config = loadConfig();
const store = new SnapshotStore(config.snapshotPath);
await store.restore();

const app = buildApp({
  config,
  store,
  sync: async () => {
    await synchronizeRna(config, store);
  },
});

const close = async () => {
  await app.close();
};
process.once("SIGINT", () => void close());
process.once("SIGTERM", () => void close());

app
  .listen({ host: config.host, port: config.port })
  .catch((error) => {
    app.log.error({ err: error }, "association-service : échec fatal au démarrage");
    process.exit(1);
  });
