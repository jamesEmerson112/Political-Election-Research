/**
 * Canonical serialization: one record has exactly one byte representation.
 * - `$schema` set to the relative schema path for the file's location
 * - keys ordered: PRIORITY keys first, then alphabetical, then TRAILING keys
 * - positions sorted by (subject, as_of)
 * - 2-space indent, LF, trailing newline; strings are never altered
 */
import { cmp } from "./ids.js";
import type { FileKind } from "./paths.js";

const PRIORITY = [
  "$schema",
  "id",
  "type",
  "kind",
  "contest",
  "election",
  "actor",
  "person",
  "subject",
  "name",
  "office",
  "stance",
  "status",
  "value",
  "source",
  "quote",
  "locator",
];
const TRAILING = ["citations", "search_log", "last_verified", "notes"];

function keyRank(k: string): [number, number] {
  const p = PRIORITY.indexOf(k);
  if (p >= 0) return [0, p];
  const t = TRAILING.indexOf(k);
  if (t >= 0) return [2, t];
  return [1, 0];
}

function compareKeys(a: string, b: string): number {
  const [ga, ia] = keyRank(a);
  const [gb, ib] = keyRank(b);
  if (ga !== gb) return ga - gb;
  if (ga === 1) return cmp(a, b);
  return ia - ib;
}

export function sortKeysDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort(compareKeys)) {
      const child = (v as Record<string, unknown>)[k];
      if (child !== undefined) out[k] = sortKeysDeep(child);
    }
    return out;
  }
  return v;
}

export function canonicalize(kind: FileKind, rec: Record<string, unknown>, schemaRef: string): unknown {
  const copy: Record<string, unknown> = { ...rec, $schema: schemaRef };
  if (kind === "positions" && Array.isArray(copy["positions"])) {
    copy["positions"] = [...(copy["positions"] as Record<string, unknown>[])].sort(
      (a, b) => cmp(String(a["subject"]), String(b["subject"])) || cmp(String(a["as_of"]), String(b["as_of"])),
    );
    // Points in facet order (stable for equal facets), so two agents writing the same points get the same bytes.
    copy["positions"] = (copy["positions"] as Record<string, unknown>[]).map((p) =>
      Array.isArray(p["points"]) ? { ...p, points: [...(p["points"] as Record<string, unknown>[])].sort((a, b) => cmp(String(a["facet"]), String(b["facet"]))) } : p,
    );
  }
  if (kind === "contest" && copy["fiscal"] && Array.isArray((copy["fiscal"] as Record<string, unknown>)["effects"])) {
    const fiscal = copy["fiscal"] as Record<string, unknown>;
    // Effects by id; a per-year schedule in fiscal-year order.
    const withSchedule = (e: Record<string, unknown>) =>
      Array.isArray(e["schedule"]) ? { ...e, schedule: [...(e["schedule"] as Record<string, unknown>[])].sort((a, b) => cmp(String(a["fy"]), String(b["fy"]))) } : e;
    copy["fiscal"] = {
      ...fiscal,
      effects: [...(fiscal["effects"] as Record<string, unknown>[])].map(withSchedule).sort((a, b) => cmp(String(a["id"]), String(b["id"]))),
    };
  }
  if (kind === "contest" && Array.isArray(copy["affects"])) {
    // Fixed group order, then effect order, so two agents recording the same groups write the same bytes.
    const g = (a: Record<string, unknown>) => AFFECT_GROUPS.indexOf(String(a["group"]));
    const e = (a: Record<string, unknown>) => AFFECT_EFFECTS.indexOf(String(a["effect"]));
    copy["affects"] = [...(copy["affects"] as Record<string, unknown>[])].sort(
      (a, b) => g(a) - g(b) || e(a) - e(b) || cmp(String(a["label"] ?? ""), String(b["label"] ?? "")),
    );
  }
  if (kind === "budget") {
    const byFy = (a: Record<string, unknown>, b: Record<string, unknown>) => cmp(String(a["fy"]), String(b["fy"]));
    if (Array.isArray(copy["adopted"])) copy["adopted"] = [...(copy["adopted"] as Record<string, unknown>[])].sort(byFy);
    const fc = copy["forecast"] as Record<string, unknown> | undefined;
    if (fc && Array.isArray(fc["years"])) copy["forecast"] = { ...fc, years: [...(fc["years"] as Record<string, unknown>[])].sort(byFy) };
  }
  if (kind === "office" && Array.isArray(copy["connections"])) {
    const rank = (c: Record<string, unknown>) => CONNECTION_ORDER.indexOf(String(c["type"]));
    copy["connections"] = [...(copy["connections"] as Record<string, unknown>[])].sort((a, b) => rank(a) - rank(b));
  }
  if (kind === "contest" && copy["result"] && typeof copy["result"] === "object") {
    // Tallies by votes (most first), then person; winners by ref.
    const r = { ...(copy["result"] as Record<string, unknown>) };
    if (Array.isArray(r["tallies"]))
      r["tallies"] = [...(r["tallies"] as Record<string, unknown>[])].sort((a, b) => Number(b["votes"]) - Number(a["votes"]) || cmp(String(a["person"]), String(b["person"])));
    if (Array.isArray(r["winners"])) r["winners"] = [...(r["winners"] as string[])].sort(cmp);
    copy["result"] = r;
  }
  if (kind === "dossier" && copy["promises"] && Array.isArray((copy["promises"] as Record<string, unknown>)["items"])) {
    // A tracked promise's updates in date order, then id.
    const promises = copy["promises"] as Record<string, unknown>;
    const byDate = (a: Record<string, unknown>, b: Record<string, unknown>) => cmp(String(a["date"]), String(b["date"])) || cmp(String(a["id"]), String(b["id"]));
    copy["promises"] = {
      ...promises,
      items: (promises["items"] as Record<string, unknown>[]).map((it) => {
        const t = it["tracking"] as Record<string, unknown> | undefined;
        return t && Array.isArray(t["updates"]) ? { ...it, tracking: { ...t, updates: [...(t["updates"] as Record<string, unknown>[])].sort(byDate) } } : it;
      }),
    };
  }
  return sortKeysDeep(copy);
}

/** Office connections are kept in this order (schema enum order). */
export const CONNECTION_ORDER = ["elected_by", "elects", "appoints", "confirms", "oversees", "advised_by"];

/** Measure "who it affects" groups and effects, in schema enum order (contest.schema.json $defs.Affect). */
export const AFFECT_GROUPS = [
  "tenants",
  "property_owners",
  "property_buyers_sellers",
  "businesses",
  "workers_unions",
  "city_employees",
  "city_departments",
  "commission_members",
  "voters_petitioners",
  "transit_riders",
  "drivers",
  "park_visitors",
  "people_experiencing_homelessness",
  "lower_income_households",
  "families_students",
  "seniors",
  "contractors_vendors",
  "other",
];
export const AFFECT_EFFECTS = ["pays", "receives", "rules_change", "other"];

export function serialize(v: unknown): string {
  return JSON.stringify(v, null, 2) + "\n";
}
