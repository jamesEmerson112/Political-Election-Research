import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalize, serialize } from "../src/canonical.js";
import { readDataDir, type Dataset, type FileMap } from "../src/dataset.js";
import { classify, schemaPointer } from "../src/paths.js";
import { validateFiles } from "../src/validate.js";

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const VALID_DIR = path.join(HERE, "fixtures", "valid", "data");
export const INVALID_DIR = path.join(HERE, "fixtures", "invalid");
export const FIXTURE_TODAY = "2030-11-01";

export function validFiles(): FileMap {
  return readDataDir(VALID_DIR);
}

export function validDataset(): Dataset {
  const res = validateFiles(validFiles(), { dataDir: VALID_DIR, today: FIXTURE_TODAY, strict: true });
  if (res.errors) throw new Error("valid fixture has errors");
  return res.dataset;
}

export interface Patch {
  file: string;
  set?: Record<string, unknown>;
  remove?: string[];
  create?: Record<string, unknown>;
  raw?: string;
  minify?: boolean;
  delete?: boolean;
}

export interface InvalidFixture {
  description: string;
  expect: string[];
  strict?: boolean;
  patches: Patch[];
}

function walkTo(doc: unknown, pointer: string): [Record<string, unknown> | unknown[], string] {
  const parts = pointer.split("/").slice(1).map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  const last = parts.pop()!;
  let cur = doc as Record<string, unknown>;
  for (const p of parts) cur = (cur as Record<string, unknown>)[p] as Record<string, unknown>;
  return [cur, last];
}

/** Apply fixture patches to a copy of the file map; patched records are re-canonicalized. */
export function applyPatches(files: FileMap, dataDir: string, patches: Patch[]): FileMap {
  const out = new Map(files);
  for (const p of patches) {
    if (p.delete) {
      out.delete(p.file);
      continue;
    }
    if (p.raw !== undefined) {
      out.set(p.file, p.raw);
      continue;
    }
    const existing = out.get(p.file);
    let doc: Record<string, unknown> = p.create ? structuredClone(p.create) : JSON.parse(existing ?? "{}");
    if (p.minify) {
      out.set(p.file, JSON.stringify(doc));
      continue;
    }
    for (const [ptr, value] of Object.entries(p.set ?? {})) {
      const [parent, key] = walkTo(doc, ptr);
      if (Array.isArray(parent) && key === "-") parent.push(structuredClone(value));
      else (parent as Record<string, unknown>)[key] = structuredClone(value);
    }
    for (const ptr of p.remove ?? []) {
      const [parent, key] = walkTo(doc, ptr);
      if (Array.isArray(parent)) parent.splice(Number(key), 1);
      else delete (parent as Record<string, unknown>)[key];
    }
    const info = classify(p.file);
    if (info) doc = canonicalize(info.kind, doc, schemaPointer(dataDir, p.file, info.kind)) as Record<string, unknown>;
    out.set(p.file, serialize(doc));
  }
  return out;
}

export function loadInvalidFixtures(): Array<[string, InvalidFixture]> {
  return fs
    .readdirSync(INVALID_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => [f.replace(/\.json$/, ""), JSON.parse(fs.readFileSync(path.join(INVALID_DIR, f), "utf8")) as InvalidFixture]);
}

/** Dataset after full validation (cross-file rules only see schema-valid records). */
export function datasetOf(files: FileMap, dataDir = VALID_DIR): Dataset {
  return validateFiles(files, { dataDir, today: FIXTURE_TODAY }).dataset;
}
