import type { FireDetectionConfig } from "./config.js";
import { deduplicateDetections, type FireDetection, type SourceReport } from "./domain.js";
import { EumetsatClient } from "./eumetsat-client.js";
import { FirmsClient, type DetectionBatch } from "./firms-client.js";

export interface NearbyInput {
  latitude: number;
  longitude: number;
  accuracyM?: number;
  radiusKm: number;
  historyDays: number;
}

export interface NearbyResponse {
  service: "fire-detection";
  version: string;
  data_status: "available" | "partial" | "unavailable";
  location: { latitude: number; longitude: number; accuracy_m?: number; radius_km: number };
  realtime: { window_minutes: number; suspicions: FireDetection[] };
  last_detection_50km: (FireDetection & { basis: "NASA_FIRMS_AREA_API_ONLY" }) | null;
  sources: SourceReport[];
  warnings: Array<{ code: string; message: string }>;
  generated_at: string;
}

interface CacheEntry { expiresAt: number; value: NearbyResponse; }

function status(reports: SourceReport[]): NearbyResponse["data_status"] {
  const configured = reports.filter((report) => report.state !== "not_configured");
  const available = configured.filter((report) => report.state === "available");
  if (available.length === 0) return "unavailable";
  return reports.every((report) => report.state === "available") ? "available" : "partial";
}

export class FireDetectionService {
  private readonly cache = new Map<string, CacheEntry>();
  constructor(
    private readonly config: FireDetectionConfig,
    private readonly firms: Pick<FirmsClient, "fetchNearby"> = new FirmsClient(config),
    private readonly eumetsat: Pick<EumetsatClient, "fetchCollection"> = new EumetsatClient(config),
    private readonly now: () => Date = () => new Date(),
  ) {}

  private key(input: NearbyInput): string {
    return [input.latitude.toFixed(4), input.longitude.toFixed(4), input.radiusKm, input.historyDays].join(":");
  }

  async nearby(input: NearbyInput): Promise<NearbyResponse> {
    const key = this.key(input);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > this.now().getTime()) return structuredClone(cached.value);

    const [firms, mtg, msg] = await Promise.all([
      this.firms.fetchNearby(input.latitude, input.longitude, input.radiusKm, input.historyDays),
      this.eumetsat.fetchCollection(this.config.eumetsatMtgCollection, "EUMETSAT_MTG_CAP", input.latitude, input.longitude, input.radiusKm),
      this.eumetsat.fetchCollection(this.config.eumetsatMsgCollection, "EUMETSAT_MSG_CAP", input.latitude, input.longitude, input.radiusKm),
    ]);
    const batches: DetectionBatch[] = [firms, mtg, msg];
    const sources = batches.flatMap((batch) => batch.reports);
    const all = deduplicateDetections(batches.flatMap((batch) => batch.detections));
    const threshold = this.now().getTime() - this.config.realtimeWindowMinutes * 60_000;
    const realtime = all.filter((detection) => Date.parse(detection.observed_at) >= threshold);
    const lastFirms = firms.detections[0] ?? null;
    const warnings: NearbyResponse["warnings"] = [];
    if (sources.some((source) => source.state === "unavailable")) warnings.push({
      code: "SOURCE_UNAVAILABLE",
      message: "Au moins une source n’a pas répondu : l’absence de suspicion ne peut pas être interprétée comme une absence de feu.",
    });
    if (sources.some((source) => source.state === "not_configured")) warnings.push({
      code: "SOURCE_NOT_CONFIGURED",
      message: "Au moins une source libre n’est pas configurée sur ce déploiement.",
    });
    warnings.push({
      code: "SATELLITE_LIMITATION",
      message: "Une suspicion satellitaire n’est pas un incendie confirmé ; les nuages, la résolution et les filtres amont peuvent masquer des feux.",
    });

    const response: NearbyResponse = {
      service: "fire-detection",
      version: this.config.version,
      data_status: status(sources),
      location: {
        latitude: input.latitude,
        longitude: input.longitude,
        ...(input.accuracyM === undefined ? {} : { accuracy_m: input.accuracyM }),
        radius_km: input.radiusKm,
      },
      realtime: { window_minutes: this.config.realtimeWindowMinutes, suspicions: realtime },
      last_detection_50km: lastFirms ? { ...lastFirms, basis: "NASA_FIRMS_AREA_API_ONLY" } : null,
      sources,
      warnings,
      generated_at: this.now().toISOString(),
    };
    if (this.config.cacheSeconds > 0) this.cache.set(key, { expiresAt: this.now().getTime() + this.config.cacheSeconds * 1000, value: response });
    return structuredClone(response);
  }
}
