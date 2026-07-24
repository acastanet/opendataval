import type { FireDetectionConfig } from "./config.js";
import {
  FIRMS_SOURCES,
  boundingBox,
  deduplicateDetections,
  firmsQueryWindows,
  latestObservation,
  parseFirmsCsv,
  type FireDetection,
  type FirmsSource,
  type SourceReport,
} from "./domain.js";
import { fetchWithRetry, readLimitedText } from "./http.js";

export interface DetectionBatch {
  detections: FireDetection[];
  reports: SourceReport[];
}

function sourceUrl(config: FireDetectionConfig, source: FirmsSource, area: string, dayRange: number, startDate?: string): URL {
  const parts = [config.firmsApiBaseUrl, encodeURIComponent(config.firmsMapKey), source, area, String(dayRange)];
  if (startDate) parts.push(startDate);
  return new URL(parts.join("/"));
}

export class FirmsClient {
  constructor(
    private readonly config: FireDetectionConfig,
    private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async fetchNearby(latitude: number, longitude: number, radiusKm: number, historyDays: number): Promise<DetectionBatch> {
    const retrievedAt = this.now().toISOString();
    if (!this.config.firmsMapKey) {
      return {
        detections: [],
        reports: FIRMS_SOURCES.map((source) => ({
          source: `FIRMS_${source}`,
          state: "not_configured",
          retrieved_at: retrievedAt,
          latest_observation_at: null,
          detection_count: 0,
          detail: "NASA_FIRMS_MAP_KEY absent",
        })),
      };
    }
    const box = boundingBox(latitude, longitude, radiusKm);
    const area = [box.west, box.south, box.east, box.north].map((value) => value.toFixed(6)).join(",");
    const windows = firmsQueryWindows(historyDays, this.now());
    const batches = await Promise.all(FIRMS_SOURCES.map(async (source) => {
      const detections: FireDetection[] = [];
      const failures: string[] = [];
      for (const window of windows) {
        try {
          const response = await fetchWithRetry(
            this.fetchImpl,
            sourceUrl(this.config, source, area, window.dayRange, window.startDate),
            { headers: { accept: "text/csv" } },
            this.config.firmsTimeoutMs,
            this.config.firmsMaxRetries,
          );
          const text = await readLimitedText(response, this.config.maxResponseBytes);
          if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 160)}`);
          detections.push(...parseFirmsCsv(text, source, { latitude, longitude }, radiusKm));
        } catch (error) {
          failures.push(error instanceof Error ? error.message : "erreur inconnue");
        }
      }
      const unique = deduplicateDetections(detections);
      return {
        detections: unique,
        report: {
          source: `FIRMS_${source}`,
          state: failures.length ? "unavailable" as const : "available" as const,
          retrieved_at: retrievedAt,
          latest_observation_at: latestObservation(unique),
          detection_count: unique.length,
          ...(failures.length ? { detail: `${windows.length - failures.length}/${windows.length} fenêtre(s) récupérée(s) : ${failures.join(" ; ")}` } : {}),
        },
      };
    }));
    return {
      detections: deduplicateDetections(batches.flatMap((batch) => batch.detections)),
      reports: batches.map((batch) => batch.report),
    };
  }
}
