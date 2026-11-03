/**
 * Validation = per-file checks (parse, layout, JSON Schema, canonical format)
 * + cross-file rules (references, ids, citations, money, dates, privacy).
 * Every problem carries a stable rule code; output order is deterministic.
 */
import { canonicalize, serialize } from "./canonical.js";
import {
  COMMITTEE_ORG_TYPES,
  DOSSIER_SECTIONS,
  FILING_SOURCE_KINDS,
  OFFICIAL_SOURCE_KINDS,
  FREE_TEXT_KEYS,
  LOCATOR_SOURCE_KINDS,
  MONEY_REL_TYPES,
} from "./constants.js";
import { buildDataset, parseFiles, resolve, type Dataset, type FileMap, type LoadedFile, type Rec } from "./dataset.js";
import { cmp, REF_RE, relationshipId, sourceId } from "./ids.js";
import { schemaPointer } from "./paths.js";
import { schemaIssues } from "./schemas.js";

export type Severity = "error" | "warning";

export const RULES = {
  PARSE: "File is not valid JSON.",
  UNKNOWN_PATH: "File is not at a path the data layout recognizes.",
  SCHEMA: "Record does not match its JSON Schema.",
  FORMAT: "File is not in canonical form (run `npm run fmt`).",
  ID_FILENAME: "The record's id / actor / contest / type does not match its file path.",
  ID_DETERMINISTIC: "The id is not the one computed from the record's content.",
  REF_UNRESOLVED: "A reference points at a record that does not exist.",
  REF_KIND: "A reference points at the wrong kind of record (e.g. a non-committee receiving contributions).",
  MONEY_NEEDS_FILING: "A money record does not cite any official filing.",
  QUOTE_REQUIRED: "A citation of a non-filing source has no verbatim quote (and no maintainer verification).",
  QUOTE_PENDING: "A maintainer-verified citation still needs its verbatim quote.",
  UNVERIFIED_CITATION: "A citation was seen only indirectly (e.g. a web search summary) and nobody has verified it.",
  LOCATOR_REQUIRED: "A citation of a filing or video has no locator (schedule/line, timestamp).",
  DATE_ORDER: "A period starts after it ends.",
  DATE_FUTURE: "A date is after today.",
  CITATION_AFTER_ASOF: "A position cites a source published after the position's as_of date.",
  POSITION_DUPLICATE: "Two positions share the same subject and as_of date.",
  POINT_FACET: "A stance point names a facet the question does not define (add it to the question's facets).",
  FISCAL_RANGE: "A fiscal estimate's low end is above its high end.",
  FISCAL_SOURCE: "A measure's fiscal effect cites no official source (government or legislative record, or the official voter guide).",
  PRIVACY_THRESHOLD: "A private individual is listed as a donor below the privacy threshold.",
  FILING_SUPERSEDED: "A money record only cites filings that were superseded by amendments.",
  CONTROVERSY_SOURCING: "A controversy is not backed by two independent publishers or an official record.",
  CANDIDATE_PROFILE_REQUIRED: "A person on a contest ballot has no candidate_profile.",
  ARCHIVE_REQUIRED: "A source has no Wayback archive_url.",
  ORPHAN_SOURCE: "A source is not cited by any record.",
} as const;
export type RuleCode = keyof typeof RULES;

/** Rules reported as warnings unless --strict. */
const WARNING_RULES = new Set<RuleCode>([
  "FISCAL_SOURCE",
  "QUOTE_PENDING",
  "UNVERIFIED_CITATION",
  "FILING_SUPERSEDED",
  "CANDIDATE_PROFILE_REQUIRED",
  "ARCHIVE_REQUIRED",
  "ORPHAN_SOURCE",
]);

export interface Problem {
  file: string;
  pointer: string;
  code: RuleCode;
  severity: Severity;
  message: string;
}

export interface ValidateOptions {
  dataDir: string;
  /** YYYY-MM-DD; defaults to RESEARCH_TODAY env or the current UTC date. */
  today?: string;
  strict?: boolean;
}

export interface ValidateResult {
  problems: Problem[];
  dataset: Dataset;
  errors: number;
  warnings: number;
}

export function todayString(): string {
  return process.env["RESEARCH_TODAY"] ?? new Date().toISOString().slice(0, 10);
}

export function validateFiles(fileMap: FileMap, opts: ValidateOptions): ValidateResult {
  const today = opts.today ?? todayString();
  const problems: Problem[] = [];
  const add = (file: string, pointer: string, code: RuleCode, message: string) => {
    const severity: Severity = WARNING_RULES.has(code) && !opts.strict ? "warning" : "error";
    problems.push({ file, pointer: pointer || "/", code, severity, message });
  };

  const files = parseFiles(fileMap);
  for (const f of files) checkFile(f, opts.dataDir, add);
  const ds = buildDataset(opts.dataDir, files);
  crossFile(ds, today, add);

  problems.sort(
    (a, b) => cmp(a.file, b.file) || cmp(a.pointer, b.pointer) || cmp(a.code, b.code) || cmp(a.message, b.message),
  );
  const errors = problems.filter((p) => p.severity === "error").length;
  return { problems, dataset: ds, errors, warnings: problems.length - errors };
}

type Add = (file: string, pointer: string, code: RuleCode, message: string) => void;

function checkFile(f: LoadedFile, dataDir: string, add: Add): void {
  if (!f.info) {
    add(f.rel, "/", "UNKNOWN_PATH", `Unrecognized path. See docs/DATA_MODEL.md for the layout.`);
    return;
  }
  if (f.parseError !== undefined) {
    add(f.rel, "/", "PARSE", f.parseError);
    return;
  }
  const data = f.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    add(f.rel, "/", "SCHEMA", "Top level must be a JSON object.");
    return;
  }
  const issues = schemaIssues(f.info.kind, data);
  for (const i of issues) add(f.rel, i.pointer, "SCHEMA", i.message);
  f.valid = issues.length === 0;

  const rec = data as Rec;
  const { kind, expectedId } = f.info;
  if (kind === "agenda" || kind === "leads") {
    if (rec["contest"] !== expectedId) add(f.rel, "/contest", "ID_FILENAME", `Expected "${expectedId}" for this path.`);
  } else if (kind === "positions" || kind === "dossier") {
    if (rec["actor"] !== expectedId) add(f.rel, "/actor", "ID_FILENAME", `Expected "${expectedId}" for this path.`);
  } else if (kind === "relationship") {
    if (rec["type"] !== f.info.relType) {
      add(f.rel, "/type", "ID_FILENAME", `File is under relationships/${f.info.relType}/ but type is "${String(rec["type"])}".`);
    }
    if (rec["id"] !== expectedId) add(f.rel, "/id", "ID_FILENAME", `Expected id "${expectedId}" for this path.`);
  } else if (kind !== "config") {
    if (rec["id"] !== expectedId) add(f.rel, "/id", "ID_FILENAME", `Expected id "${expectedId}" for this path.`);
  }
  if (kind === "contest" && typeof rec["election"] === "string") {
    const election = expectedId.split("/")[0];
    if (rec["election"] !== `election:${election}`) {
      add(f.rel, "/election", "ID_FILENAME", `Contest lives under ${election}/ so election must be "election:${election}".`);
    }
  }

  if (f.valid && kind === "relationship") {
    try {
      const want = relationshipId(rec);
      if (rec["id"] !== want) add(f.rel, "/id", "ID_DETERMINISTIC", `Expected "${want}".`);
    } catch (e) {
      add(f.rel, "/id", "ID_DETERMINISTIC", (e as Error).message);
    }
  }
  if (f.valid && kind === "source") {
    try {
      const want = sourceId(String(rec["url"]));
      if (rec["id"] !== want) add(f.rel, "/id", "ID_DETERMINISTIC", `Expected "${want}" (from the canonical url).`);
    } catch (e) {
      add(f.rel, "/url", "ID_DETERMINISTIC", (e as Error).message);
    }
  }

  const canonical = serialize(canonicalize(kind, rec, schemaPointer(dataDir, f.rel, kind)));
  if (f.text !== canonical) add(f.rel, "/", "FORMAT", "Not in canonical form. Run `npm run fmt`.");
}

/** Depth-first walk yielding [pointer, key, value] for every node. */
function* walk(v: unknown, pointer = "", key = ""): Generator<[string, string, unknown]> {
  yield [pointer, key, v];
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) yield* walk(v[i], `${pointer}/${i}`, key);
  } else if (v && typeof v === "object") {
    for (const [k, child] of Object.entries(v)) {
      yield* walk(child, `${pointer}/${k.replace(/~/g, "~0").replace(/\//g, "~1")}`, k);
    }
  }
}

function citationLists(rec: unknown): Array<[string, Rec[]]> {
  const out: Array<[string, Rec[]]> = [];
  for (const [ptr, key, v] of walk(rec)) {
    if (key === "citations" && Array.isArray(v) && !ptr.match(/\/citations\/\d+$/)) out.push([ptr, v as Rec[]]);
  }
  return out;
}

function crossFile(ds: Dataset, today: string, add: Add): void {
  const cited = new Set<string>();
  const ballotPeople = new Set<string>();
  for (const c of ds.contests.values()) {
    for (const cand of (c["candidates"] as Rec[] | undefined) ?? []) ballotPeople.add(String(cand["person"]));
  }
  const threshold = Number((ds.config?.["privacy"] as Rec | undefined)?.["individual_donor_min_cents"] ?? 0);

  for (const f of ds.files) {
    if (!f.info || !f.valid) continue;
    const rec = f.data as Rec;
    const kind = f.info.kind;

    // --- references ------------------------------------------------------
    for (const [ptr, key, v] of walk(rec)) {
      if (typeof v !== "string" || FREE_TEXT_KEYS.has(key)) continue;
      if (!REF_RE.test(v)) continue;
      // Agendas and leads may point at contests/people/measures that research has not created yet.
      if ((kind === "agenda" || kind === "leads") && !v.startsWith("q:")) continue;
      if (v.startsWith("src:")) cited.add(v);
      if (!ds.existing.has(v)) add(f.rel, ptr, "REF_UNRESOLVED", `"${v}" does not exist.`);
    }

    // --- citations ---------------------------------------------------------
    for (const [ptr, list] of citationLists(rec)) {
      list.forEach((c, i) => {
        const src = resolve(ds, String(c["source"]));
        if (!src) return;
        const sk = String(src["kind"]);
        if (!FILING_SOURCE_KINDS.has(sk) && !c["quote"]) {
          if (c["unverified"]) {
            add(f.rel, `${ptr}/${i}`, "UNVERIFIED_CITATION", `Seen via ${String((c["unverified"] as Rec)["method"])}; verify the source and add the verbatim "quote".`);
          } else if (c["verified_by"]) {
            add(f.rel, `${ptr}/${i}`, "QUOTE_PENDING", `Verified by ${String((c["verified_by"] as Rec)["by"])}; add the verbatim "quote" before release.`);
          } else {
            add(f.rel, `${ptr}/${i}`, "QUOTE_REQUIRED", `Citation of a ${sk} needs a verbatim "quote".`);
          }
        }
        if (LOCATOR_SOURCE_KINDS.has(sk) && !c["locator"]) {
          add(f.rel, `${ptr}/${i}`, "LOCATOR_REQUIRED", `Citation of a ${sk} needs a "locator".`);
        }
      });
    }

    // --- dates -------------------------------------------------------------
    for (const [ptr, , v] of walk(rec)) {
      if (!v || typeof v !== "object" || Array.isArray(v)) continue;
      const o = v as Rec;
      if (typeof o["start"] === "string" && typeof o["end"] === "string" && o["start"] > o["end"]) {
        add(f.rel, ptr, "DATE_ORDER", `start ${o["start"]} is after end ${o["end"]}.`);
      }
    }
    for (const [ptr, key, v] of walk(rec)) {
      if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) continue;
      if (kind === "election" && ptr === "/date") continue; // election day may be in the future
      if (["accessed", "published", "as_of", "last_verified", "date"].includes(key) && v > today) {
        add(f.rel, ptr, "DATE_FUTURE", `${key} ${v} is after today (${today}).`);
      }
    }

    // --- kind-specific -----------------------------------------------------
    if (kind === "positions") checkPositions(ds, f.rel, rec, add);
    if (kind === "dossier") checkDossier(ds, f.rel, rec, add);
    if (kind === "relationship") checkRelationship(ds, f.rel, rec, add, threshold, ballotPeople);
    if (kind === "contest") {
      checkFiscal(ds, f.rel, rec, add);
      ((rec["candidates"] as Rec[] | undefined) ?? []).forEach((cand, i) => {
        const p = resolve(ds, String(cand["person"]));
        if (p && !p["candidate_profile"]) {
          add(f.rel, `/candidates/${i}/person`, "CANDIDATE_PROFILE_REQUIRED", `${String(cand["person"])} has no candidate_profile yet.`);
        }
      });
    }
    if (kind === "source" && !rec["archive_url"]) {
      add(f.rel, "/archive_url", "ARCHIVE_REQUIRED", "Add a Wayback snapshot (https://web.archive.org/web/<14 digits>/...).");
    }
  }

  for (const [id] of ds.sources) {
    if (!cited.has(`src:${id}`)) add(`sources/${id}.json`, "/", "ORPHAN_SOURCE", "No record cites this source.");
  }
}

/** Ballot-measure fiscal effects: ranges in order, and backed by an official statement. */
function checkFiscal(ds: Dataset, rel: string, rec: Rec, add: Add): void {
  const fiscal = rec["fiscal"] as Rec | undefined;
  if (!fiscal) return;
  const official = (list: unknown, ptr: string) => {
    const kinds = ((list as Rec[] | undefined) ?? []).map((c) => resolve(ds, String(c["source"]))?.["kind"] as string | undefined);
    if (!kinds.some((k) => k !== undefined && (OFFICIAL_SOURCE_KINDS.has(k) || k === "voter_guide"))) {
      add(rel, ptr, "FISCAL_SOURCE", "Cite the official fiscal statement (e.g. the Controller's statement in the official voter guide).");
    }
  };
  ((fiscal["effects"] as Rec[] | undefined) ?? []).forEach((e, i) => {
    const a = e["amount"] as Rec | undefined;
    if (a && Number(a["low_usd"]) > Number(a["high_usd"])) {
      add(rel, `/fiscal/effects/${i}/amount`, "FISCAL_RANGE", `low_usd ${String(a["low_usd"])} is above high_usd ${String(a["high_usd"])}.`);
    }
    official(e["citations"], `/fiscal/effects/${i}/citations`);
  });
  if (fiscal["bond"]) official((fiscal["bond"] as Rec)["citations"], "/fiscal/bond/citations");
}

function checkPositions(ds: Dataset, rel: string, rec: Rec, add: Add): void {
  const seen = new Set<string>();
  ((rec["positions"] as Rec[]) ?? []).forEach((p, i) => {
    const key = `${String(p["subject"])}@${String(p["as_of"])}`;
    if (seen.has(key)) add(rel, `/positions/${i}`, "POSITION_DUPLICATE", `Duplicate subject/as_of ${key}.`);
    seen.add(key);
    const subject = String(p["subject"]);
    if (subject.startsWith("contest:")) {
      const c = resolve(ds, subject);
      if (c && c["kind"] !== "measure") add(rel, `/positions/${i}/subject`, "REF_KIND", "Position subjects must be questions or ballot measures.");
    }
    const points = (p["points"] as Rec[] | undefined) ?? [];
    if (points.length) {
      const q = subject.startsWith("q:") ? (resolve(ds, subject) as Rec | undefined) : undefined;
      const facets = new Set(((q?.["facets"] as Rec[] | undefined) ?? []).map((f) => String(f["id"])));
      points.forEach((pt, k) => {
        if (!facets.has(String(pt["facet"]))) add(rel, `/positions/${i}/points/${k}/facet`, "POINT_FACET", `Facet "${String(pt["facet"])}" is not defined on ${subject}.`);
      });
    }
    ((p["citations"] as Rec[] | undefined) ?? []).forEach((c, j) => {
      const src = resolve(ds, String(c["source"]));
      if (src && typeof src["published"] === "string" && src["published"] > String(p["as_of"])) {
        add(rel, `/positions/${i}/citations/${j}`, "CITATION_AFTER_ASOF", `Source published ${String(src["published"])} after as_of ${String(p["as_of"])}.`);
      }
    });
  });
}

function checkDossier(ds: Dataset, rel: string, rec: Rec, add: Add): void {
  for (const section of DOSSIER_SECTIONS) {
    const sec = rec[section] as Rec | undefined;
    if (!sec) continue;
    const asOf = String(sec["as_of"]);
    for (const [ptr, list] of citationLists(sec)) {
      list.forEach((c, j) => {
        const src = resolve(ds, String(c["source"]));
        if (src && typeof src["published"] === "string" && src["published"] > asOf) {
          add(rel, `/${section}${ptr}/${j}`, "CITATION_AFTER_ASOF", `Source published ${String(src["published"])} after section as_of ${asOf}.`);
        }
      });
    }
  }
  const items = ((rec["controversies"] as Rec | undefined)?.["items"] as Rec[] | undefined) ?? [];
  items.forEach((item, i) => {
    const sources = ((item["citations"] as Rec[]) ?? []).map((c) => resolve(ds, String(c["source"]))).filter((s): s is Rec => !!s);
    const official = sources.some((s) => OFFICIAL_SOURCE_KINDS.has(String(s["kind"])));
    const publishers = new Set(sources.map((s) => String(s["publisher"] ?? s["id"])));
    if (!official && publishers.size < 2) {
      add(rel, `/controversies/items/${i}/citations`, "CONTROVERSY_SOURCING", "Cite two independent publishers, or an official record (court, agency, legislature, filing).");
    }
  });
}

function orgType(ds: Dataset, ref: unknown): string | undefined {
  if (typeof ref !== "string" || !ref.startsWith("org:")) return undefined;
  return resolve(ds, ref)?.["org_type"] as string | undefined;
}

function checkRelationship(
  ds: Dataset,
  rel: string,
  rec: Rec,
  add: Add,
  threshold: number,
  ballotPeople: Set<string>,
): void {
  const type = String(rec["type"]);
  const needCommittee = (field: string) => {
    const t = orgType(ds, rec[field]);
    if (t !== undefined && !COMMITTEE_ORG_TYPES.has(t)) {
      add(rel, `/${field}`, "REF_KIND", `${String(rec[field])} is a ${t}, not a political committee.`);
    }
  };
  const needContestKind = (field: string, want: "office" | "measure") => {
    const v = rec[field];
    if (typeof v !== "string" || !v.startsWith("contest:")) return;
    const c = resolve(ds, v);
    if (c && c["kind"] !== want) add(rel, `/${field}`, "REF_KIND", `${v} must be a${want === "office" ? "n office race" : " ballot measure"}.`);
  };

  switch (type) {
    case "endorsement":
      needContestKind("endorsee", "measure");
      break;
    case "committee_role":
      needCommittee("committee");
      needContestKind("subject", "measure");
      needContestKind("contest", "office");
      break;
    case "contribution": {
      needCommittee("recipient");
      const ct = orgType(ds, rec["conduit"]);
      if (ct !== undefined && ct !== "conduit") add(rel, "/conduit", "REF_KIND", `${String(rec["conduit"])} is a ${ct}, not a conduit.`);
      const donor = String(rec["donor"]);
      if (donor.startsWith("person:")) {
        const p = resolve(ds, donor);
        const amount = Number((rec["money"] as Rec)["amount_cents"]);
        if (p && p["public_figure"] !== true && !ballotPeople.has(donor) && amount < threshold) {
          add(rel, "/donor", "PRIVACY_THRESHOLD", `Private individual below ${threshold} cents; omit or aggregate.`);
        }
      }
      break;
    }
    case "independent_expenditure":
      needCommittee("spender");
      needContestKind("target", "measure");
      break;
    case "lobbying": {
      const ft = orgType(ds, rec["firm"]);
      if (ft !== undefined && ft !== "lobbying_firm") add(rel, "/firm", "REF_KIND", `${String(rec["firm"])} is a ${ft}, not a lobbying_firm.`);
      break;
    }
  }

  if (MONEY_REL_TYPES.has(type)) {
    const filings = ((rec["citations"] as Rec[]) ?? [])
      .map((c) => resolve(ds, String(c["source"])))
      .filter((s): s is Rec => !!s && FILING_SOURCE_KINDS.has(String(s["kind"])));
    if (filings.length === 0) {
      add(rel, "/citations", "MONEY_NEEDS_FILING", "Cite at least one campaign finance / lobbying / behested payment filing.");
    } else if (filings.every((s) => (s["filing"] as Rec | undefined)?.["superseded"] === true)) {
      add(rel, "/citations", "FILING_SUPERSEDED", "Every cited filing is superseded; cite the latest amendment.");
    }
  }
}

export function formatProblem(p: Problem): string {
  return `${p.file}#${p.pointer} [${p.code}] ${p.severity === "warning" ? "warning: " : ""}${p.message}`;
}
