/**
 * The file layout is a pure function of record content. classify() maps a
 * data-relative path to its record kind; pathFor() maps a record back to the
 * only path it may live at.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SCHEMAS_DIR = path.join(REPO_ROOT, "schemas");
export const DEFAULT_DATA_DIR = path.join(REPO_ROOT, "data");

export const FILE_KINDS = [
  "config",
  "election",
  "contest",
  "agenda",
  "leads",
  "issue",
  "bill",
  "person",
  "organization",
  "office",
  "positions",
  "dossier",
  "relationship",
  "source",
] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export const RELATIONSHIP_TYPES = [
  "endorsement",
  "committee_role",
  "contribution",
  "independent_expenditure",
  "lobbying",
  "behested_payment",
  "affiliation",
  "legislative_action",
  "bill_position",
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export interface Classified {
  kind: FileKind;
  /** The id the record must carry, derived from its path (or the actor/contest ref for positions/agenda). */
  expectedId: string;
  /** Relationship folder type, for relationships. */
  relType?: string;
}

const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";
const SRC_ID = `${SLUG}-[0-9a-f]{10}`;

const RULES: Array<[RegExp, (m: RegExpExecArray) => Classified]> = [
  [/^config\.json$/, () => ({ kind: "config", expectedId: "config" })],
  [new RegExp(`^elections/(${SLUG})\\.json$`), (m) => ({ kind: "election", expectedId: m[1]! })],
  [new RegExp(`^contests/(${SLUG})/(${SLUG})\\.json$`), (m) => ({ kind: "contest", expectedId: `${m[1]}/${m[2]}` })],
  [new RegExp(`^agenda/(${SLUG})/(${SLUG})\\.json$`), (m) => ({ kind: "agenda", expectedId: `contest:${m[1]}/${m[2]}` })],
  [new RegExp(`^leads/(${SLUG})/(${SLUG})\\.json$`), (m) => ({ kind: "leads", expectedId: `contest:${m[1]}/${m[2]}` })],
  [new RegExp(`^issues/(${SLUG})\\.json$`), (m) => ({ kind: "issue", expectedId: m[1]! })],
  [
    /^bills\/((?:ca|us)-[0-9]{1,4}-[a-z]+-[0-9]+|[a-z]{2,6}-file-[0-9][0-9a-z-]*)\.json$/,
    (m) => ({ kind: "bill", expectedId: m[1]! }),
  ],
  [new RegExp(`^dossiers/people/(${SLUG})\\.json$`), (m) => ({ kind: "dossier", expectedId: `person:${m[1]}` })],
  [new RegExp(`^people/(${SLUG})\\.json$`), (m) => ({ kind: "person", expectedId: m[1]! })],
  [new RegExp(`^organizations/(${SLUG})\\.json$`), (m) => ({ kind: "organization", expectedId: m[1]! })],
  [new RegExp(`^offices/(${SLUG})\\.json$`), (m) => ({ kind: "office", expectedId: m[1]! })],
  [new RegExp(`^positions/people/(${SLUG})\\.json$`), (m) => ({ kind: "positions", expectedId: `person:${m[1]}` })],
  [
    new RegExp(`^positions/organizations/(${SLUG})\\.json$`),
    (m) => ({ kind: "positions", expectedId: `org:${m[1]}` }),
  ],
  [
    /^relationships\/([a-z_]+)\/([a-z0-9_.-]+)\.json$/,
    (m) => ({ kind: "relationship", expectedId: m[2]!, relType: m[1]! }),
  ],
  [new RegExp(`^sources/(${SRC_ID})\\.json$`), (m) => ({ kind: "source", expectedId: m[1]! })],
];

/** Classify a data-relative POSIX path. Returns null for paths outside the layout. */
export function classify(rel: string): Classified | null {
  for (const [re, f] of RULES) {
    const m = re.exec(rel);
    if (m) return f(m);
  }
  return null;
}

/** The only data-relative path a record of this kind may live at. */
export function pathFor(kind: FileKind, rec: Record<string, unknown>): string {
  const id = rec["id"];
  switch (kind) {
    case "config":
      return "config.json";
    case "election":
      return `elections/${String(id)}.json`;
    case "contest":
      return `contests/${String(id)}.json`;
    case "agenda":
      return `agenda/${String(rec["contest"]).replace(/^contest:/, "")}.json`;
    case "leads":
      return `leads/${String(rec["contest"]).replace(/^contest:/, "")}.json`;
    case "issue":
      return `issues/${String(id)}.json`;
    case "bill":
      return `bills/${String(id)}.json`;
    case "dossier":
      return `dossiers/people/${String(rec["actor"]).replace(/^person:/, "")}.json`;
    case "person":
      return `people/${String(id)}.json`;
    case "organization":
      return `organizations/${String(id)}.json`;
    case "office":
      return `offices/${String(id)}.json`;
    case "positions": {
      const actor = String(rec["actor"]);
      const [k, slug] = actor.split(":");
      return `positions/${k === "person" ? "people" : "organizations"}/${slug}.json`;
    }
    case "relationship":
      return `relationships/${String(rec["type"])}/${String(id)}.json`;
    case "source":
      return `sources/${String(id)}.json`;
  }
}

/** Value of the `$schema` key for a file: relative path from the file to its schema. */
export function schemaPointer(dataDir: string, rel: string, kind: FileKind): string {
  const fileDir = path.dirname(path.join(dataDir, rel));
  const target = path.join(SCHEMAS_DIR, `${kind}.schema.json`);
  return path.relative(fileDir, target).split(path.sep).join("/");
}

export function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}
