import { dateOnly, iso, maxLevel, normalizeLevel, PHENOMENA } from "./domain.js";
import type { Bulletin, DepartmentVigilance, Phenomenon, StructuredWarning, VigilancePeriod } from "./types.js";

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function first(...values: unknown[]): unknown { return values.find((value) => value !== undefined && value !== null && value !== ""); }
function string(value: unknown): string | null { return typeof value === "string" || typeof value === "number" ? String(value) : null; }

interface MutableDepartment { name: string | null; periods: VigilancePeriod[]; warnings: StructuredWarning[] }

function periodBounds(period: Record<string, unknown>): { from: string | null; until: string | null } {
  return {
    from: iso(first(period.begin_time, period.start_time, period.valid_from, period.date_debut, period.start)),
    until: iso(first(period.end_time, period.stop_time, period.valid_until, period.date_fin, period.end)),
  };
}

function periodDay(period: Record<string, unknown>, index: number, from: string | null): VigilancePeriod["day"] {
  const raw = String(first(period.day, period.period_id, period.echeance, period.type, "") ?? "").toLowerCase();
  if (["j", "j0", "today", "0"].includes(raw)) return "today";
  if (["j1", "tomorrow", "1"].includes(raw)) return "tomorrow";
  if (from) {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    if (from.slice(0, 10) === today) return "today";
    if (from.slice(0, 10) === tomorrow) return "tomorrow";
  }
  return index === 0 ? "today" : index === 1 ? "tomorrow" : "unknown";
}

function timeSlices(period: Record<string, unknown>): Record<string, unknown>[] {
  const value = first(period.timelaps, period.timelines, period.time_laps, period.timeline);
  if (Array.isArray(value)) return value.map(record).filter((item): item is Record<string, unknown> => Boolean(item));
  const item = record(value);
  return item ? [item] : [];
}

function domainEntries(slice: Record<string, unknown>): Record<string, unknown>[] {
  const value = first(slice.domain_ids, slice.domains, slice.domain_arr);
  return array(value).map(record).filter((item): item is Record<string, unknown> => Boolean(item));
}

function readPhenomena(entry: Record<string, unknown>, slice: Record<string, unknown>, warnings: StructuredWarning[]): Phenomenon[] {
  const raw = first(entry.phenomenon_ids, entry.phenomena, entry.phenomenon_arr, entry.phenomenon);
  const result: Phenomenon[] = [];
  for (const value of array(raw)) {
    const item = record(value);
    if (!item) continue;
    const sourceCode = String(first(item.phenomenon_id, item.id, item.code, "") ?? "");
    if (!sourceCode) continue;
    const known = PHENOMENA[sourceCode];
    const level = normalizeLevel(first(item.color_id, item.level, item.max_color_id, entry.max_color_id, entry.max_color));
    if (!known) warnings.push({ code: "UNKNOWN_PHENOMENON", message: "Un phénomène Météo-France inconnu a été conservé.", sourceValue: sourceCode });
    result.push({
      code: known?.code ?? "unknown",
      sourceCode,
      label: known?.label ?? string(first(item.label, item.name)) ?? "Phénomène non référencé",
      level,
      timeline: [{
        validFrom: iso(first(slice.begin_time, slice.start_time, slice.valid_from)),
        validUntil: iso(first(slice.end_time, slice.stop_time, slice.valid_until)),
        level: level.code,
        sourceLevelCode: level.sourceCode,
      }],
    });
  }
  return result;
}

function mergePhenomena(items: Phenomenon[]): Phenomenon[] {
  const merged = new Map<string, Phenomenon>();
  for (const item of items) {
    const current = merged.get(item.sourceCode);
    if (!current) { merged.set(item.sourceCode, item); continue; }
    current.timeline.push(...item.timeline);
    current.level = maxLevel([current.level, item.level]);
  }
  return [...merged.values()];
}

export interface ParsedCard {
  issuedAt: string | null;
  publicationId: string | null;
  departments: Record<string, MutableDepartment>;
  warnings: StructuredWarning[];
}

export function parseCard(data: unknown): ParsedCard {
  const root = record(data);
  const product = record(root?.product) ?? record(root?.data) ?? root;
  if (!product) throw Object.assign(new Error("Produit carte absent ou invalide"), { code: "UPSTREAM_FORMAT_INVALID" });
  const issuedAt = iso(first(product.update_time, product.timestamp, product.issued_at, product.production_time));
  const publicationId = string(first(product.id, product.product_id, product.version, product.reference));
  const periods = array(product.periods).map(record).filter((item): item is Record<string, unknown> => Boolean(item));
  if (periods.length === 0 && record(product.timelaps)) periods.push({ timelaps: product.timelaps });
  if (periods.length === 0) throw Object.assign(new Error("Aucune période de vigilance exploitable"), { code: "UPSTREAM_FORMAT_INVALID" });

  const departments: Record<string, MutableDepartment> = {};
  const globalWarnings: StructuredWarning[] = [];
  periods.forEach((period, periodIndex) => {
    const bounds = periodBounds(period);
    const slices = timeSlices(period);
    if (slices.length === 0) globalWarnings.push({ code: "PERIOD_WITHOUT_TIMELAPS", message: "Une période ne contient aucune chronologie exploitable." });
    const byDepartment = new Map<string, { phenomena: Phenomenon[]; levels: ReturnType<typeof normalizeLevel>[]; name: string | null }>();
    for (const slice of slices) {
      for (const entry of domainEntries(slice)) {
        const code = String(first(entry.domain_id, entry.domain, entry.code, "") ?? "").toUpperCase();
        if (!code) continue;
        const state = byDepartment.get(code) ?? { phenomena: [], levels: [], name: null };
        state.name = state.name ?? string(first(entry.domain_name, entry.name, entry.label));
        state.levels.push(normalizeLevel(first(entry.max_color_id, entry.max_color, entry.color_id)));
        state.phenomena.push(...readPhenomena(entry, slice, globalWarnings));
        byDepartment.set(code, state);
      }
    }
    for (const [code, state] of byDepartment) {
      const localWarnings: StructuredWarning[] = [];
      const directOverall = maxLevel(state.levels);
      const overall = directOverall.code === "unknown" ? maxLevel(state.phenomena.map((phenomenon) => phenomenon.level)) : directOverall;
      if (overall.code === "unknown") localWarnings.push({ code: "UNKNOWN_LEVEL", message: "Le niveau officiel n'a pas pu être normalisé.", sourceValue: overall.sourceCode });
      const normalizedPeriod: VigilancePeriod = {
        day: periodDay(period, periodIndex, bounds.from),
        date: dateOnly(bounds.from) ?? string(first(period.date, period.validity_date)),
        overallLevel: overall,
        phenomena: mergePhenomena(state.phenomena).filter((phenomenon) => phenomenon.level.rank === null || phenomenon.level.rank > 0),
        validFrom: bounds.from,
        validUntil: bounds.until,
      };
      const department = departments[code] ?? { name: state.name, periods: [], warnings: [] };
      department.name = department.name ?? state.name;
      department.periods.push(normalizedPeriod);
      department.warnings.push(...localWarnings);
      departments[code] = department;
    }
  });
  if (Object.keys(departments).length === 0) throw Object.assign(new Error("Aucun département présent dans la carte"), { code: "UPSTREAM_FORMAT_INVALID" });
  return { issuedAt, publicationId, departments, warnings: globalWarnings };
}

function collectBulletinObjects(value: unknown, output: Record<string, unknown>[], depth = 0): void {
  if (depth > 8) return;
  if (Array.isArray(value)) { for (const item of value) collectBulletinObjects(item, output, depth + 1); return; }
  const item = record(value); if (!item) return;
  const text = first(item.text, item.texte, item.content, item.description, item.bulletin_text);
  if (typeof text === "string" && text.trim()) output.push(item);
  for (const child of Object.values(item)) collectBulletinObjects(child, output, depth + 1);
}

function bulletinScope(item: Record<string, unknown>): { scope: Bulletin["scope"]; code: string | null } {
  const raw = String(first(item.scope, item.type, item.level, item.domain_type, "") ?? "").toLowerCase();
  const code = string(first(item.scope_code, item.domain_id, item.department_code, item.zone_id, item.code));
  if (raw.includes("depart") || /^(?:\d{2,3}|2A|2B)$/i.test(code ?? "")) return { scope: "department", code };
  if (raw.includes("zone")) return { scope: "zone", code };
  if (raw.includes("nation") || code === "FR") return { scope: "national", code };
  return { scope: "unknown", code };
}

export function parseBulletins(data: unknown): Bulletin[] {
  if (data === null || data === undefined) return [];
  const objects: Record<string, unknown>[] = [];
  collectBulletinObjects(data, objects);
  const seen = new Set<string>();
  const result: Bulletin[] = [];
  for (const item of objects) {
    const text = String(first(item.text, item.texte, item.content, item.description, item.bulletin_text) ?? "").trim();
    if (!text) continue;
    const scope = bulletinScope(item);
    const sourceId = string(first(item.id, item.bulletin_id, item.reference));
    const key = sourceId ?? `${scope.scope}:${scope.code}:${text.slice(0, 80)}`;
    if (seen.has(key)) continue; seen.add(key);
    result.push({
      scope: scope.scope, scopeCode: scope.code,
      title: string(first(item.title, item.titre, item.name)), text,
      issuedAt: iso(first(item.issued_at, item.update_time, item.timestamp, item.production_time)),
      validFrom: iso(first(item.valid_from, item.begin_time, item.start_time)),
      validUntil: iso(first(item.valid_until, item.end_time, item.stop_time)),
      sourceId,
    });
  }
  return result;
}

export function buildDepartments(card: ParsedCard, bulletins: Bulletin[]): Record<string, DepartmentVigilance> {
  const result: Record<string, DepartmentVigilance> = {};
  for (const [code, department] of Object.entries(card.departments)) {
    const applicable = bulletins.filter((bulletin) => bulletin.scope === "national" || bulletin.scope === "zone" || (bulletin.scope === "department" && bulletin.scopeCode?.toUpperCase() === code));
    applicable.sort((a, b) => ({ department: 0, zone: 1, national: 2, unknown: 3 }[a.scope] - { department: 0, zone: 1, national: 2, unknown: 3 }[b.scope]));
    result[code] = { departmentCode: code, departmentName: department.name, periods: department.periods, bulletins: applicable, warnings: department.warnings };
  }
  return result;
}
