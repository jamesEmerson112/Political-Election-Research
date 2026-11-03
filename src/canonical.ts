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
  if (kind === "office" && Array.isArray(copy["connections"])) {
    const rank = (c: Record<string, unknown>) => CONNECTION_ORDER.indexOf(String(c["type"]));
    copy["connections"] = [...(copy["connections"] as Record<string, unknown>[])].sort((a, b) => rank(a) - rank(b));
  }
  return sortKeysDeep(copy);
}

/** Office connections are kept in this order (schema enum order). */
export const CONNECTION_ORDER = ["elected_by", "elects", "appoints", "confirms", "oversees", "advised_by"];

export function serialize(v: unknown): string {
  return JSON.stringify(v, null, 2) + "\n";
}
