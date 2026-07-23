export const LEVELS = ["green", "yellow", "orange", "red", "unknown"] as const;
export type VigilanceLevelCode = (typeof LEVELS)[number];
export type FreshnessStatus = "fresh" | "stale" | "expired" | "unknown";
export interface Level { code: VigilanceLevelCode; rank: number | null; label: string; sourceCode?: string }
export interface TimelineEntry { validFrom: string | null; validUntil: string | null; level: VigilanceLevelCode; sourceLevelCode?: string }
export interface Phenomenon { code: string; sourceCode: string; label: string; level: Level; timeline: TimelineEntry[] }
export interface VigilancePeriod { day: "today" | "tomorrow" | "unknown"; date: string | null; overallLevel: Level; phenomena: Phenomenon[]; validFrom: string | null; validUntil: string | null }
export interface Bulletin { scope: "department" | "zone" | "national" | "unknown"; scopeCode: string | null; title: string | null; text: string; issuedAt: string | null; validFrom: string | null; validUntil: string | null; sourceId: string | null }
export interface StructuredWarning { code: string; message: string; sourceValue?: string }
export interface DepartmentVigilance { departmentCode: string; departmentName: string | null; periods: VigilancePeriod[]; bulletins: Bulletin[]; warnings: StructuredWarning[] }
export interface SourceMetadata { name: "Météo-France"; product: "Vigilance météorologique"; issuedAt: string | null; retrievedAt: string; publicationId: string | null }
export interface VigilanceSnapshot { schemaVersion: 1; retrievedAt: string; lastAttemptAt: string; source: SourceMetadata; departments: Record<string, DepartmentVigilance>; globalWarnings: StructuredWarning[] }
export interface RuntimeState { snapshot: VigilanceSnapshot | null; lastAttemptAt: string | null; lastSuccessfulRetrieval: string | null; lastError: { code: string; message: string; at: string } | null }
