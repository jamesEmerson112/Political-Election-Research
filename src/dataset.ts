/**
 * In-memory view of the data directory. Works on a virtual file map
 * (data-relative POSIX path -> file text) so the same code serves the CLI,
 * `put`, and tests that patch fixtures in memory.
 */
import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import { classify, type Classified, type FileKind } from "./paths.js";

export type Rec = Record<string, unknown>;
export type FileMap = Map<string, string>;

export interface LoadedFile {
  rel: string;
  text: string;
  info: Classified | null;
  /** Parsed JSON, or undefined if it failed to parse. */
  data?: unknown;
  parseError?: string;
  /** True once the record passed its JSON Schema. Cross-file rules only run on valid records. */
  valid: boolean;
}

export interface Dataset {
  dataDir: string;
  files: LoadedFile[];
  config?: Rec;
  elections: Map<string, Rec>;
  contests: Map<string, Rec>;
  agendas: Map<string, Rec>;
  /** contest ref -> leads file (unverified hints) */
  leads: Map<string, Rec>;
  issues: Map<string, Rec>;
  /** "issue/question" -> question object */
  questions: Map<string, Rec>;
  people: Map<string, Rec>;
  orgs: Map<string, Rec>;
  bills: Map<string, Rec>;
  budgets: Map<string, Rec>;
  offices: Map<string, Rec>;
  /** person ref -> dossier */
  dossiers: Map<string, Rec>;
  /** actor ref -> positions file */
  positions: Map<string, Rec>;
  relationships: Rec[];
  sources: Map<string, Rec>;
  /** Every ref that exists on disk (derived from paths, even if the record is invalid). */
  existing: Set<string>;
}

export function readDataDir(dataDir: string): FileMap {
  const files: FileMap = new Map();
  if (!fs.existsSync(dataDir)) return files;
  const rels = fg.sync("**/*", { cwd: dataDir, dot: false, onlyFiles: true }).sort();
  for (const rel of rels) files.set(rel, fs.readFileSync(path.join(dataDir, rel), "utf8"));
  return files;
}

export function parseFiles(fileMap: FileMap): LoadedFile[] {
  const out: LoadedFile[] = [];
  for (const rel of [...fileMap.keys()].sort()) {
    const text = fileMap.get(rel)!;
    const lf: LoadedFile = { rel, text, info: classify(rel), valid: false };
    if (rel.endsWith(".json")) {
      try {
        lf.data = JSON.parse(text);
      } catch (e) {
        lf.parseError = (e as Error).message;
      }
    }
    out.push(lf);
  }
  return out;
}

/** The ref a file defines, derived only from its path. */
export function refForPath(info: Classified): string | null {
  switch (info.kind) {
    case "election":
      return `election:${info.expectedId}`;
    case "contest":
      return `contest:${info.expectedId}`;
    case "person":
      return `person:${info.expectedId}`;
    case "organization":
      return `org:${info.expectedId}`;
    case "office":
      return `office:${info.expectedId}`;
    case "source":
      return `src:${info.expectedId}`;
    default:
      return null;
  }
}

export function buildDataset(dataDir: string, files: LoadedFile[]): Dataset {
  const ds: Dataset = {
    dataDir,
    files,
    elections: new Map(),
    contests: new Map(),
    agendas: new Map(),
    leads: new Map(),
    issues: new Map(),
    questions: new Map(),
    people: new Map(),
    orgs: new Map(),
    bills: new Map(),
    budgets: new Map(),
    offices: new Map(),
    dossiers: new Map(),
    positions: new Map(),
    relationships: [],
    sources: new Map(),
    existing: new Set(),
  };
  for (const f of files) {
    if (!f.info || f.data === undefined) continue;
    const ref = refForPath(f.info);
    if (ref) ds.existing.add(ref);
    if (f.info.kind === "issue" && f.data && typeof f.data === "object") {
      // Questions exist as soon as the issue file parses, so refs resolve even mid-edit.
      const qs = (f.data as Rec)["questions"];
      if (Array.isArray(qs)) {
        for (const q of qs as Rec[]) {
          if (typeof q?.["id"] === "string") ds.existing.add(`q:${f.info.expectedId}/${q["id"]}`);
        }
      }
    }
    if (!f.valid) continue;
    const rec = f.data as Rec;
    const id = f.info.expectedId;
    const kind: FileKind = f.info.kind;
    switch (kind) {
      case "config":
        ds.config = rec;
        break;
      case "election":
        ds.elections.set(id, rec);
        break;
      case "contest":
        ds.contests.set(id, rec);
        break;
      case "agenda":
        ds.agendas.set(id, rec);
        break;
      case "leads":
        ds.leads.set(id, rec);
        break;
      case "issue":
        ds.issues.set(id, rec);
        for (const q of (rec["questions"] as Rec[]) ?? []) ds.questions.set(`${id}/${String(q["id"])}`, q);
        break;
      case "person":
        ds.people.set(id, rec);
        break;
      case "organization":
        ds.orgs.set(id, rec);
        break;
      case "positions":
        ds.positions.set(id, rec);
        break;
      case "relationship":
        ds.relationships.push(rec);
        break;
      case "bill":
        ds.bills.set(id, rec);
        break;
      case "budget":
        ds.budgets.set(id, rec);
        break;
      case "office":
        ds.offices.set(id, rec);
        break;
      case "dossier":
        ds.dossiers.set(id, rec);
        break;
      case "source":
        ds.sources.set(id, rec);
        break;
    }
  }
  return ds;
}

/** Look up the record a ref points at (valid records only). */
export function resolve(ds: Dataset, ref: string): Rec | undefined {
  const i = ref.indexOf(":");
  const kind = ref.slice(0, i);
  const key = ref.slice(i + 1);
  switch (kind) {
    case "person":
      return ds.people.get(key);
    case "org":
      return ds.orgs.get(key);
    case "office":
      return ds.offices.get(key);
    case "election":
      return ds.elections.get(key);
    case "contest":
      return ds.contests.get(key);
    case "q":
      return ds.questions.get(key);
    case "src":
      return ds.sources.get(key);
    default:
      return undefined;
  }
}
