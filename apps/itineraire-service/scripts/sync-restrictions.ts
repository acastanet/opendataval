import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const output = process.env.ITINERAIRE_RESTRICTIONS_FILE?.trim() || "/var/lib/opendataval/itineraire-service/restrictions.json";
const defaultBboxes = ["43.2,2.5,45.0,4.9", "44.0,2.0,46.4,4.9", "46.0,3.0,48.0,5.5", "46.0,5.0,47.0,7.0", "47.0,5.0,48.0,7.0", "44.0,3.7,45.5,7.5", "45.5,3.7,46.7,7.5"];
const configuredBboxes = (process.env.ITINERAIRE_OSM_BBOXES?.trim() || "").split(";").map((bbox) => bbox.trim()).filter(Boolean);
const bboxes = configuredBboxes.length ? configuredBboxes : defaultBboxes;
const endpoints = ["https://overpass.kumi.systems/api/interpreter", "https://overpass-api.de/api/interpreter"];
type OverpassData = { elements: Array<{ type: string; id: number; tags?: Record<string, string>; geometry?: Array<{ lon: number; lat: number }> }> };
async function fetchOverpass(bbox: string): Promise<OverpassData> {
  const filters = ["maxheight", "maxheight:physical", "maxweight", "maxweightrating", "maxwidth", "maxlength", "maxaxleload", "hgv", "hazmat"].map((tag) => `way[\"${tag}\"](${bbox});`).join("\n");
  const query = `[out:json][timeout:180];(${filters}node[\"barrier\"](${bbox}););out tags geom;`;
  let last: unknown;
  for (const url of endpoints) for (let attempt = 0; attempt < 2; attempt += 1) try {
    const response = await fetch(url, { method: "POST", body: query, headers: { "content-type": "text/plain" }, signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`Overpass HTTP ${response.status}`); return response.json();
  } catch (error) { last = error; }
  throw last;
}
const data = (await Promise.all(bboxes.map(fetchOverpass))).flatMap((response) => response.elements);
const index = Object.fromEntries(data.filter((item) => item.type === "way" && item.tags).map((item) => [String(item.id), {
  tags: item.tags, nom: item.tags?.name, geometry: item.geometry ? { type: "LineString", coordinates: item.geometry.map((point) => [point.lon, point.lat]) } : undefined,
}]));
await mkdir(dirname(output), { recursive: true });
const temporary = `${output}.tmp`;
await writeFile(temporary, `${JSON.stringify(index)}\n`); await rename(temporary, output);
console.info(`Index de ${Object.keys(index).length} restrictions écrit dans ${output}.`);
