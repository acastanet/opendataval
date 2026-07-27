import { loadConfig } from "../src/config.js";
import { synchronizeRna } from "../src/sync.js";
import { SnapshotStore } from "../src/store.js";

const config = loadConfig();
const store = new SnapshotStore(config.snapshotPath);
await store.restore();
try {
  await synchronizeRna(config, store);
  console.log("Synchronisation RNA terminée.");
} catch (error) {
  console.error(
    `Échec de la synchronisation (le snapshot précédent est conservé) : ${(error as Error).message}`,
  );
  process.exit(1);
}
