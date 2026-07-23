export const LEVELS = {
  1: { code: "green", rank: 0, label: "Vigilance verte" },
  2: { code: "yellow", rank: 1, label: "Vigilance jaune" },
  3: { code: "orange", rank: 2, label: "Vigilance orange" },
  4: { code: "red", rank: 3, label: "Vigilance rouge" },
} as const;

export type LevelCode = "green" | "yellow" | "orange" | "red";
export interface Level { code: LevelCode; rank: number; label: string; source_code: string }
export interface TimelineItem { valid_from: string | null; valid_until: string | null; level: LevelCode; source_level_code: string }
export interface Phenomenon {
  code: string;
  source_code: string;
  label: string;
  level: Level;
  timeline: TimelineItem[];
}
export interface VigilancePeriod {
  day: "today" | "tomorrow";
  date: string | null;
  overall_level: Level;
  phenomena: Phenomenon[];
  valid_from: string | null;
  valid_until: string | null;
}
export interface Bulletin {
  scope: "department" | "zone" | "national";
  scope_code: string;
  title: string;
  text: string;
  issued_at: string | null;
  valid_from: string | null;
  valid_until: string | null;
  source_id: string;
}
export interface DepartmentSnapshot {
  department_code: string;
  department_name: string | null;
  periods: VigilancePeriod[];
  bulletins: Bulletin[];
  warnings: StructuredWarning[];
}
export interface StructuredWarning { code: string; message: string; source_code?: string }
export interface VigilanceSnapshot {
  schema_version: 1;
  retrieved_at: string;
  issued_at: string | null;
  publication_id: string | null;
  map_product_datetime: string | null;
  bulletin_product_datetime: string | null;
  departments: Record<string, DepartmentSnapshot>;
  warnings: StructuredWarning[];
}

const PHENOMENA: Record<string, { code: string; label: string }> = {
  "1": { code: "wind", label: "Vent" },
  "2": { code: "rain_flood", label: "Pluie-inondation" },
  "3": { code: "thunderstorm", label: "Orages" },
  "4": { code: "flood", label: "Crues" },
  "5": { code: "snow_ice", label: "Neige-verglas" },
  "6": { code: "heatwave", label: "Canicule" },
  "7": { code: "extreme_cold", label: "Grand froid" },
  "8": { code: "avalanche", label: "Avalanches" },
  "9": { code: "waves_submersion", label: "Vagues-submersion" },
};

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function string(value: unknown): string | null { return typeof value === "string" && value.trim() ? value : null; }
function validIso(value: unknown): string | null {
  const raw = string(value); if (!raw) return null;
  const date = new Date(raw); return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
function datePart(value: string | null): string | null { return value ? value.slice(0, 10) : null; }

export class SourceFormatError extends Error {
  constructor(message: string) { super(message); this.name = "SourceFormatError"; }
}

function levelFromSource(value: unknown): Level {
  const id = Number(value);
  const level = LEVELS[id as keyof typeof LEVELS];
  if (!level) throw new SourceFormatError(`Niveau de vigilance inconnu: ${String(value)}`);
  return { ...level, source_code: String(value) };
}

function parsePhenomenon(raw: unknown, warnings: StructuredWarning[]): Phenomenon | null {
  const item = object(raw); if (!item) return null;
  const sourceCode = String(item.phenomenon_id ?? item.id ?? item.code ?? "").trim();
  if (!sourceCode) return null;
  const sourceLevel = item.phenomenon_max_color_id ?? item.max_color_id ?? item.color_id;
  const level = levelFromSource(sourceLevel);
  if (level.rank === 0) return null;
  const known = PHENOMENA[sourceCode];
  if (!known) warnings.push({ code: "UNKNOWN_PHENOMENON", message: `Phénomène source inconnu ${sourceCode}`, source_code: sourceCode });
  const timeline = array(item.timelaps_items ?? item.timeline ?? item.timelaps).map((entry): TimelineItem | null => {
    const t = object(entry); if (!t) return null;
    const timelineLevel = levelFromSource(t.color_id ?? t.level ?? sourceLevel);
    return { valid_from: validIso(t.begin_time ?? t.valid_from), valid_until: validIso(t.end_time ?? t.valid_until), level: timelineLevel.code, source_level_code: timelineLevel.source_code };
  }).filter((value): value is TimelineItem => value !== null);
  return {
    code: known?.code ?? "unknown",
    source_code: sourceCode,
    label: known?.label ?? string(item.phenomenon_name ?? item.label) ?? `Phénomène ${sourceCode}`,
    level,
    timeline,
  };
}

function periodDay(period: Record<string, unknown>, index: number): "today" | "tomorrow" | null {
  const term = String(period.echeance ?? period.term ?? period.day ?? "").toUpperCase();
  if (term === "J" || term === "TODAY") return "today";
  if (term === "J1" || term === "TOMORROW") return "tomorrow";
  if (index === 0) return "today";
  if (index === 1) return "tomorrow";
  return null;
}

export interface ParsedMap {
  departments: Record<string, DepartmentSnapshot>;
  issuedAt: string | null;
  publicationId: string | null;
  productDatetime: string | null;
  warnings: StructuredWarning[];
}

export function parseMapProduct(payload: unknown): ParsedMap {
  const root = object(payload); if (!root) throw new SourceFormatError("Produit carte non objet");
  const product = object(root.product ?? root.data ?? root); if (!product) throw new SourceFormatError("Bloc product absent du produit carte");
  const periods = array(product.periods);
  if (periods.length < 1) throw new SourceFormatError("Aucune période dans le produit carte");
  const warnings: StructuredWarning[] = [];
  const departments: Record<string, DepartmentSnapshot> = {};

  periods.forEach((rawPeriod, index) => {
    const period = object(rawPeriod); if (!period) return;
    const day = periodDay(period, index); if (!day) return;
    const timelaps = object(period.timelaps); if (!timelaps) throw new SourceFormatError(`Période ${day}: timelaps absent`);
    const domains = array(timelaps.domain_ids);
    if (!domains.length) throw new SourceFormatError(`Période ${day}: domain_ids absent`);
    for (const rawDomain of domains) {
      const domain = object(rawDomain); if (!domain) continue;
      const code = String(domain.domain_id ?? domain.domain ?? "").toUpperCase();
      if (!/^(?:0[1-9]|1\d|2A|2B|2[1-9]|[3-8]\d|9[0-5])$/.test(code)) continue;
      const localWarnings: StructuredWarning[] = [];
      const overall = levelFromSource(domain.max_color_id ?? domain.max_color ?? domain.color_id);
      const rawPhenomena = array(domain.phenomenon_items ?? domain.phenomenon_ids ?? domain.phenomena);
      const phenomena = rawPhenomena.map((item) => parsePhenomenon(item, localWarnings)).filter((value): value is Phenomenon => value !== null);
      const begin = validIso(period.begin_validity_time ?? period.valid_from);
      const end = validIso(period.end_validity_time ?? period.valid_until);
      const entry = departments[code] ?? {
        department_code: code,
        department_name: string(domain.domain_name ?? domain.name),
        periods: [], bulletins: [], warnings: [],
      };
      entry.department_name ??= string(domain.domain_name ?? domain.name);
      entry.periods.push({ day, date: datePart(begin), overall_level: overall, phenomena, valid_from: begin, valid_until: end });
      entry.warnings.push(...localWarnings);
      departments[code] = entry;
    }
  });

  if (!Object.keys(departments).length) throw new SourceFormatError("Aucun département interprétable dans le produit carte");
  const meta = object(product.meta);
  return {
    departments,
    issuedAt: validIso(product.update_time ?? meta?.generation_timestamp),
    publicationId: string(meta?.snapshot_id ?? product.snapshot_id),
    productDatetime: validIso(meta?.product_datetime),
    warnings,
  };
}

function collectText(value: unknown, output: string[]): void {
  if (Array.isArray(value)) { for (const item of value) collectText(item, output); return; }
  const item = object(value); if (!item) return;
  if (Array.isArray(item.text)) {
    for (const text of item.text) if (typeof text === "string") output.push(text);
  }
  for (const [key, child] of Object.entries(item)) if (key !== "text") collectText(child, output);
}
function collectDates(value: unknown, starts: number[], ends: number[]): void {
  if (Array.isArray(value)) { for (const item of value) collectDates(item, starts, ends); return; }
  const item = object(value); if (!item) return;
  const start = validIso(item.start_time ?? item.begin_time ?? item.valid_from); if (start) starts.push(Date.parse(start));
  const end = validIso(item.end_time ?? item.valid_until); if (end) ends.push(Date.parse(end));
  for (const child of Object.values(item)) collectDates(child, starts, ends);
}
function classifyScope(domainId: string, departmentCode: string, title: string): Bulletin["scope"] | null {
  if (domainId === departmentCode || domainId === `VIGI${departmentCode}`) return "department";
  if (domainId === "FRA" || domainId === "FRANCE" || /national/i.test(title)) return "national";
  return null;
}

export interface ParsedBulletins { byDepartment: Record<string, Bulletin[]>; productDatetime: string | null; issuedAt: string | null }

export function parseBulletinProduct(payload: unknown, departmentCodes: string[]): ParsedBulletins {
  const root = object(payload); if (!root) throw new SourceFormatError("Produit textes non objet");
  const product = object(root.product ?? root.data ?? root); if (!product) throw new SourceFormatError("Bloc product absent du produit textes");
  const blocks = array(product.text_bloc_items ?? product.bulletins ?? product.items);
  const byDepartment: Record<string, Bulletin[]> = Object.fromEntries(departmentCodes.map((code) => [code, []]));
  const issuedAt = validIso(product.update_time);
  blocks.forEach((raw, index) => {
    const block = object(raw); if (!block) return;
    const domainId = String(block.domain_id ?? block.scope_code ?? "").toUpperCase();
    const title = string(block.bloc_title ?? block.title) ?? "Bulletin de vigilance";
    for (const departmentCode of departmentCodes) {
      let scope = classifyScope(domainId, departmentCode, title);
      const ids = array(block.domain_ids ?? block.department_ids).map(String);
      if (!scope && ids.includes(departmentCode)) scope = "zone";
      if (!scope) continue;
      const textParts: string[] = []; collectText(block, textParts);
      const text = textParts.join("\n").trim(); if (!text) continue;
      const starts: number[] = []; const ends: number[] = []; collectDates(block, starts, ends);
      byDepartment[departmentCode]?.push({
        scope,
        scope_code: domainId || departmentCode,
        title,
        text,
        issued_at: issuedAt,
        valid_from: starts.length ? new Date(Math.min(...starts)).toISOString() : null,
        valid_until: ends.length ? new Date(Math.max(...ends)).toISOString() : null,
        source_id: String(block.bloc_id ?? block.id ?? `${domainId || "bulletin"}-${index}`),
      });
    }
  });
  for (const bulletins of Object.values(byDepartment)) bulletins.sort((a, b) => ({ department: 0, zone: 1, national: 2 }[a.scope] - ({ department: 0, zone: 1, national: 2 }[b.scope])));
  const meta = object(product.meta);
  return { byDepartment, productDatetime: validIso(meta?.product_datetime), issuedAt };
}
