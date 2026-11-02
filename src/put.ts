/**
 * `put`: the single write path for agents. Give it a record (without id or
 * $schema); it computes the deterministic id and path, fills defaults,
 * merges with what is on disk if asked, canonicalizes, and schema-checks
 * before anything is written.
 */
import { canonicalize, serialize } from "./canonical.js";
import type { FileMap, Rec } from "./dataset.js";
import { cmp, relationshipId, slugify, sourceId } from "./ids.js";
import { pathFor, schemaPointer, type FileKind } from "./paths.js";
import { schemaIssues, type SchemaIssue } from "./schemas.js";

export const PUT_KINDS = [
  "source",
  "person",
  "organization",
  "relationship",
  "position",
  "contest",
  "election",
  "issue",
  "agenda",
  "config",
] as const;
export type PutKind = (typeof PUT_KINDS)[number];
export type PutMode = "create" | "merge" | "replace";

export interface PutOptions {
  dataDir: string;
  mode: PutMode;
  today: string;
}

export interface PutResult {
  action: "created" | "updated" | "unchanged" | "rejected";
  file: string;
  ref?: string;
  content?: string;
  problems: SchemaIssue[];
  message?: string;
}

/** Arrays of objects merged by a natural key instead of being replaced. */
const MERGE_KEYS: Record<string, string> = { candidates: "person", questions: "id", exhausted: "task" };

function isObj(v: unknown): v is Rec {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function deepMerge(base: unknown, patch: unknown, key = ""): unknown {
  if (isObj(base) && isObj(patch)) {
    const out: Rec = { ...base };
    for (const [k, v] of Object.entries(patch)) out[k] = k in base ? deepMerge(base[k], v, k) : v;
    return out;
  }
  const mk = MERGE_KEYS[key];
  if (mk && Array.isArray(base) && Array.isArray(patch)) {
    const out = [...(base as Rec[])];
    for (const item of patch as Rec[]) {
      const i = out.findIndex((x) => isObj(x) && x[mk] === item[mk]);
      if (i >= 0) out[i] = deepMerge(out[i], item) as Rec;
      else out.push(item);
    }
    return out;
  }
  return patch;
}

function fileKindOf(kind: PutKind): FileKind {
  return kind === "position" ? "positions" : kind;
}

function refOf(kind: PutKind, rec: Rec): string | undefined {
  switch (kind) {
    case "source":
      return `src:${String(rec["id"])}`;
    case "person":
      return `person:${String(rec["id"])}`;
    case "organization":
      return `org:${String(rec["id"])}`;
    case "contest":
      return `contest:${String(rec["id"])}`;
    case "election":
      return `election:${String(rec["id"])}`;
    case "relationship":
      return String(rec["id"]);
    case "position":
      return String(rec["actor"]);
    case "agenda":
      return String(rec["contest"]);
    default:
      return undefined;
  }
}

function prepare(kind: PutKind, input: Rec, today: string): Rec {
  const rec: Rec = { ...input };
  delete rec["$schema"];
  switch (kind) {
    case "source":
      rec["id"] = sourceId(String(rec["url"]));
      rec["accessed"] ??= today;
      break;
    case "person":
    case "organization":
      rec["id"] ??= slugify(String(rec["name"] ?? ""));
      rec["aliases"] ??= [];
      rec["ids"] ??= [];
      rec["links"] ??= {};
      rec["last_verified"] = today;
      break;
    case "relationship":
      rec["last_verified"] = today;
      rec["id"] = relationshipId(rec);
      break;
    case "contest":
    case "election":
      rec["last_verified"] = today;
      break;
  }
  return rec;
}

function finish(
  kind: PutKind,
  rec: Rec,
  existing: string | undefined,
  rel: string,
  opts: PutOptions,
  action: "created" | "updated",
): PutResult {
  const fk = fileKindOf(kind);
  const canon = canonicalize(fk, rec, schemaPointer(opts.dataDir, rel, fk));
  const content = serialize(canon);
  const problems = schemaIssues(fk, canon);
  const ref = refOf(kind, rec);
  if (problems.length) return { action: "rejected", file: rel, ref, problems, message: "Schema check failed; nothing written." };
  if (existing === content) return { action: "unchanged", file: rel, ref, problems: [] };
  return { action, file: rel, ref, content, problems: [] };
}

export function put(files: FileMap, kind: PutKind, input: Rec, opts: PutOptions): PutResult {
  if (kind === "position") return putPositions(files, input, opts);
  let rec: Rec;
  try {
    rec = prepare(kind, input, opts.today);
  } catch (e) {
    return { action: "rejected", file: "", problems: [], message: (e as Error).message };
  }
  const fk = fileKindOf(kind);
  const rel = pathFor(fk, rec);
  const existingText = files.get(rel);
  if (existingText === undefined) return finish(kind, rec, undefined, rel, opts, "created");

  const existing = JSON.parse(existingText) as Rec;
  if (opts.mode === "replace") return finish(kind, rec, existingText, rel, opts, "updated");
  if (opts.mode === "merge") {
    const merged = deepMerge(existing, rec) as Rec;
    if (kind === "relationship") merged["id"] = relationshipId(merged);
    return finish(kind, merged, existingText, rel, opts, "updated");
  }
  // create mode on an existing file
  const same = finish(kind, rec, existingText, rel, opts, "updated");
  if (same.action === "unchanged" || same.action === "rejected") return same;
  if (kind === "source") {
    return { action: "unchanged", file: rel, ref: refOf(kind, existing as Rec), problems: [], message: "Source already exists; reusing it (use --merge to update fields)." };
  }
  return { action: "rejected", file: rel, ref: refOf(kind, rec), problems: [], message: "File exists. Re-run with --merge (deep merge) or --replace." };
}

/**
 * Positions are stored one file per actor. Input: {actor, position:{...}} or
 * {actor, positions:[...]}. Entries are keyed by (subject, as_of): a new
 * as_of adds history; the same as_of is only overwritten with --replace.
 */
function putPositions(files: FileMap, input: Rec, opts: PutOptions): PutResult {
  const actor = String(input["actor"] ?? "");
  const incoming = (Array.isArray(input["positions"]) ? input["positions"] : input["position"] ? [input["position"]] : []) as Rec[];
  if (!actor || incoming.length === 0) {
    return { action: "rejected", file: "", problems: [], message: 'Expected {"actor": "...", "position": {...}} or {"actor": "...", "positions": [...]}.' };
  }
  const shell: Rec = { actor, positions: [] };
  const rel = pathFor("positions", shell);
  const existingText = files.get(rel);
  const current = existingText ? (JSON.parse(existingText) as Rec) : shell;
  const list = [...((current["positions"] as Rec[]) ?? [])];
  for (const p of incoming) {
    const i = list.findIndex((x) => x["subject"] === p["subject"] && x["as_of"] === p["as_of"]);
    if (i >= 0) {
      if (opts.mode === "create" && JSON.stringify(list[i]) !== JSON.stringify(p)) {
        return {
          action: "rejected",
          file: rel,
          ref: actor,
          problems: [],
          message: `A position on ${String(p["subject"])} as_of ${String(p["as_of"])} already exists. Use a new as_of to record a change, or --replace to correct it.`,
        };
      }
      list[i] = opts.mode === "merge" ? (deepMerge(list[i], p) as Rec) : p;
    } else {
      list.push(p);
    }
  }
  list.sort((a, b) => cmp(String(a["subject"]), String(b["subject"])) || cmp(String(a["as_of"]), String(b["as_of"])));
  return finish("position", { actor, positions: list }, existingText, rel, opts, existingText ? "updated" : "created");
}
