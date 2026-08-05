import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

type Feature = { id?: unknown; geometry?: { type?: unknown; coordinates?: unknown }; properties?: unknown };

const output = process.env.ITINERAIRE_RESTRICTIONS_FILE?.trim() || "/var/lib/opendataval/itineraire-service/restrictions.json";
const input = process.env.ITINERAIRE_RESTRICTIONS_GEOJSON_FILE?.trim() || "/var/lib/opendataval/itineraire-service/restrictions.geojsonseq";
const records = (await readFile(input, "utf8")).split("\n");
const index: Record<string, { tags: Record<string, string>; nom?: string; geometry?: { type: "LineString"; coordinates: Array<[number, number]> } }> = {};

for (const record of records) {
  if (!record.trim()) continue;
  const feature = JSON.parse(record.replace(/^\u001e/, "")) as Feature;
  const id = typeof feature.id === "string" && feature.id.startsWith("w") ? feature.id.slice(1) : undefined;
  const properties = feature.properties;
  if (!id || !properties || typeof properties !== "object") continue;
  const tags = Object.fromEntries(Object.entries(properties).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const coordinates = feature.geometry?.type === "LineString" && Array.isArray(feature.geometry.coordinates)
    ? feature.geometry.coordinates.filter((point): point is [number, number] => Array.isArray(point) && typeof point[0] === "number" && typeof point[1] === "number")
    : [];
  index[id] = { tags, ...(typeof tags.name === "string" ? { nom: tags.name } : {}), ...(coordinates.length > 1 ? { geometry: { type: "LineString", coordinates } } : {}) };
}

await mkdir(dirname(output), { recursive: true });
const temporary = `${output}.tmp`;
await writeFile(temporary, `${JSON.stringify(index)}\n`);
await rename(temporary, output);
console.info(`Index local de ${Object.keys(index).length} restrictions écrit dans ${output}.`);
