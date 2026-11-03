import fs from "node:fs";
import path from "node:path";
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { SCHEMAS_DIR, type FileKind } from "./paths.js";

// ajv-formats ships CJS; under NodeNext the callable may sit on .default.
const addFormats = ((addFormatsModule as unknown as { default?: unknown }).default ??
  addFormatsModule) as unknown as (ajv: Ajv2020) => Ajv2020;

let cache: Map<FileKind, ValidateFunction> | null = null;

function build(): Map<FileKind, ValidateFunction> {
  const ajv = new Ajv2020({ allErrors: true, discriminator: true, strict: true, strictRequired: false });
  addFormats(ajv);
  const byName = new Map<string, string>();
  for (const f of fs.readdirSync(SCHEMAS_DIR).sort()) {
    if (!f.endsWith(".schema.json")) continue;
    const schema = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, f), "utf8")) as { $id: string };
    ajv.addSchema(schema);
    byName.set(f.replace(/\.schema\.json$/, ""), schema.$id);
  }
  const out = new Map<FileKind, ValidateFunction>();
  for (const [name, id] of byName) {
    if (name === "defs") continue;
    const fn = ajv.getSchema(id);
    if (!fn) throw new Error(`Schema failed to compile: ${name}`);
    out.set(name as FileKind, fn);
  }
  return out;
}

export function validatorFor(kind: FileKind): ValidateFunction {
  cache ??= build();
  const fn = cache.get(kind);
  if (!fn) throw new Error(`No schema for kind: ${kind}`);
  return fn;
}

export interface SchemaIssue {
  pointer: string;
  message: string;
}

/** Validate one record against its schema; returns de-duplicated, sorted issues. */
export function schemaIssues(kind: FileKind, data: unknown): SchemaIssue[] {
  const fn = validatorFor(kind);
  if (fn(data)) return [];
  const seen = new Set<string>();
  const out: SchemaIssue[] = [];
  for (const e of (fn.errors ?? []) as ErrorObject[]) {
    if (e.keyword === "if" || e.keyword === "oneOf" || e.keyword === "anyOf") continue;
    const detail =
      e.keyword === "additionalProperties"
        ? `unknown property "${String((e.params as { additionalProperty: string }).additionalProperty)}"`
        : e.keyword === "enum"
          ? `${e.message}: ${JSON.stringify((e.params as { allowedValues: unknown[] }).allowedValues)}`
          : e.keyword === "false schema"
            ? "property not allowed here"
            : (e.message ?? e.keyword);
    const key = `${e.instancePath}|${detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ pointer: e.instancePath || "/", message: detail });
  }
  return out.sort((a, b) => (a.pointer === b.pointer ? (a.message < b.message ? -1 : 1) : a.pointer < b.pointer ? -1 : 1));
}
