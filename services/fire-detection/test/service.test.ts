import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";
import type { FireDetection, SourceReport } from "../src/domain.js";
import { FireDetectionService } from "../src/service.js";

const detection = (source: FireDetection["source"], observedAt: string): FireDetection => ({
  id: `${source}-${observedAt}`,
  latitude: 44.1,
  longitude: 3.1,
  distance_km: 12,
  observed_at: observedAt,
  source,
  satellite: null,
  instrument: null,
  confidence: { raw: "low", normalized: "low" },
  certainty: null,
  frp_mw: 2,
  daynight: null,
  type_code: null,
  pixel_radius_km: 1,
  classification: "unconfirmed_fire_suspicion",
});
const report = (source: string, state: SourceReport["state"]): SourceReport => ({
  source,
  state,
  retrieved_at: "2026-07-24T21:00:00Z",
  latest_observation_at: null,
  detection_count: 0,
});

test("la dernière suspicion 50 km provient exclusivement de FIRMS", async () => {
  const config = loadConfig({ FIRE_CACHE_SECONDS: "0" });
  const firms = { fetchNearby: async () => ({ detections: [detection("FIRMS_VIIRS_NOAA21_NRT", "2026-07-24T19:00:00Z")], reports: [report("FIRMS", "available")] }) };
  const eumetsat = { fetchCollection: async (_collection: string, source: "EUMETSAT_MTG_CAP") => ({ detections: [detection(source, "2026-07-24T20:50:00Z")], reports: [report(source, "available")] }) };
  const service = new FireDetectionService(config, firms, eumetsat, () => new Date("2026-07-24T21:00:00Z"));
  const result = await service.nearby({ latitude: 44, longitude: 3, radiusKm: 50, historyDays: 7 });
  assert.equal(result.last_detection_50km?.source, "FIRMS_VIIRS_NOAA21_NRT");
  assert.equal(result.last_detection_50km?.basis, "NASA_FIRMS_AREA_API_ONLY");
  assert.equal(result.realtime.suspicions.length, 1);
});
