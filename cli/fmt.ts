/**
 * npm run fmt [-- --check] [--data <dir>]
 * Rewrites every data file into canonical form (key order, $schema pointer,
 * sorted positions, 2-space JSON + newline). --check only reports.
 */
import fs from "node:fs";
import path from "node:path";
import { canonicalize, serialize } from "../src/canonical.js";
import { readDataDir } from "../src/dataset.js";
import { classify, schemaPointer } from "../src/paths.js";
import { dataDir, parseArgs } from "./args.js";

const args = parseArgs();
const dir = dataDir(args);
const check = args.flags.has("check");
let changed = 0;
let skipped = 0;
for (const [rel, text] of readDataDir(dir)) {
  const info = classify(rel);
  if (!info) continue;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    skipped++;
    console.error(`skip (invalid JSON): ${rel}`);
    continue;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) continue;
  const out = serialize(canonicalize(info.kind, data as Record<string, unknown>, schemaPointer(dir, rel, info.kind)));
  if (out !== text) {
    changed++;
    if (check) console.log(`not canonical: ${rel}`);
    else fs.writeFileSync(path.join(dir, rel), out);
  }
}
console.log(check ? `${changed} file(s) need formatting.` : `${changed} file(s) formatted.`);
process.exit((check && changed > 0) || skipped > 0 ? 1 : 0);
