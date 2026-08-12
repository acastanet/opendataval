import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "packages/shared/styles/design-system.css");
const targets = [
  "apps/web/public/eau/design-system.css",
  "apps/gateway-service/public/dalle/design-system.css",
];

await Promise.all(targets.map(async (target) => {
  const destination = resolve(root, target);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}));
