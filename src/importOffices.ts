/**
 * Import an office research batch (docs/OFFICE_BATCH_FORMAT.md) as office
 * records. Every fact is cited to the source the agent named, with the
 * citation marked `unverified` (seen as a search summary, not opened), so
 * `validate` warns and `validate --strict` blocks release until checked.
 */
import type { FileMap, Rec } from "./dataset.js";
import { slugify } from "./ids.js";
import { put, type PutResult } from "./put.js";

export interface OfficeSource {
  url: string;
  publisher?: string;
  title?: string;
  seen?: string;
  tier?: string;
}
interface OfficeFact {
  value: number | string;
  as_of?: string;
  basis?: string;
  fiscal_year?: string;
  scope?: string;
  sources?: OfficeSource[];
}
export interface OfficeBatchItem {
  slug: string;
  name: string;
  level: "local" | "county" | "state" | "federal";
  jurisdiction: string;
  body?: string;
  facts?: Record<string, OfficeFact>;
  notes?: string;
}

const REFERENCE_HOSTS = /(wikipedia\.org|ballotpedia\.org|civlab\.org)$/;
const NUMBER_FACTS = ["seats", "constituents", "term_years", "budget", "salary"];
const TEXT_FACTS = ["term_limit", "powers"];

function sourceKind(s: OfficeSource): string {
  const host = new URL(s.url).hostname.replace(/^www\./, "");
  if (REFERENCE_HOSTS.test(host)) return "reference_work";
  return s.tier === "primary" ? "government_record" : "news_report";
}

export function importOffices(files: FileMap, batch: OfficeBatchItem[], opts: { dataDir: string; today: string; by?: string }) {
  const working = new Map(files);
  const writes = new Map<string, string>();
  const results: PutResult[] = [];
  const apply = (res: PutResult) => {
    results.push(res);
    if (res.content !== undefined) {
      working.set(res.file, res.content);
      writes.set(res.file, res.content);
    }
    return res;
  };
  const by = opts.by ?? "research agent";

  const cite = (sources: OfficeSource[] | undefined) =>
    (sources ?? []).map((s) => {
      const res = apply(
        put(
          working,
          "source",
          {
            url: s.url,
            kind: sourceKind(s),
            title: s.title ?? s.publisher ?? new URL(s.url).hostname,
            publisher: s.publisher ?? new URL(s.url).hostname,
            accessed: opts.today,
            notes: `Seen by a ${by} as a ${s.seen ?? "web search summary"} on ${opts.today}; not verified.`,
          },
          { dataDir: opts.dataDir, mode: "create", today: opts.today },
        ),
      );
      return { source: res.ref!, unverified: { by, method: s.seen ?? "web search summary", date: opts.today } };
    });

  for (const o of batch) {
    const rec: Rec = { id: slugify(o.slug || o.name), name: o.name, level: o.level, jurisdiction: o.jurisdiction };
    if (o.body) rec["body"] = o.body;
    for (const [k, f] of Object.entries(o.facts ?? {})) {
      const citations = cite(f.sources);
      if (!citations.length) continue;
      if (NUMBER_FACTS.includes(k) && typeof f.value === "number") {
        const basis = [f.basis, f.fiscal_year, f.scope].filter(Boolean).join(" · ");
        rec[k] = { value: f.value, ...(f.as_of ? { as_of: String(f.as_of) } : {}), ...(basis ? { basis } : {}), citations };
      } else if (TEXT_FACTS.includes(k)) {
        rec[k] = { value: String(f.value), citations };
      }
    }
    if (o.notes) rec["notes"] = o.notes;
    const exists = working.has(`offices/${String(rec["id"])}.json`);
    apply(put(working, "office", rec, { dataDir: opts.dataDir, mode: exists ? "replace" : "create", today: opts.today }));
  }
  return { writes, results };
}
