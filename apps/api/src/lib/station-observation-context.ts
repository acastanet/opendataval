import { AsyncLocalStorage } from "node:async_hooks";
import type { StationMeasurement } from "./station-observations.js";

interface StationObservationContext {
  measurements: StationMeasurement[] | null;
  providerUnavailable: boolean;
}

const storage = new AsyncLocalStorage<StationObservationContext>();

export function runWithStationObservationContext(callback: () => void): void {
  storage.run({ measurements: null, providerUnavailable: false }, callback);
}

export function recordStationMeasurements(measurements: readonly StationMeasurement[]): void {
  const context = storage.getStore();
  if (!context) return;
  context.measurements = [...measurements];
  context.providerUnavailable = false;
}

export function recordStationProviderUnavailable(): void {
  const context = storage.getStore();
  if (!context) return;
  context.measurements = null;
  context.providerUnavailable = true;
}

export function currentStationObservationContext(): Readonly<StationObservationContext> | null {
  return storage.getStore() ?? null;
}
