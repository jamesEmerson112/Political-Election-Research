/**
 * npm run -s db [-- --out dist/research.sqlite] [--data <dir>] [--today YYYY-MM-DD]
 * Rebuilds a queryable SQLite copy of the dataset from the JSON files (the
 * source of truth). Refuses to build from a dataset with validation errors.
 */
import fs from "node:fs";
import path from "node:path";
import { buildBundle } from "../src/bundle.js";
import { REPO_ROOT } from "../src/paths.js";
import { writeSqlite } from "../src/sqlite.js";
import { todayString } from "../src/validate.js";
import { dataDir, flagStr, parseArgs } from "./args.js";

// node:sqlite prints an ExperimentalWarning on load; keep CLI output clean.
process.removeAllListeners("warning");
const { DatabaseSync } = await import("node:sqlite");

const args = parseArgs();
const dir = dataDir(args);
const out = path.resolve(flagStr(args, "out") ?? path.join(REPO_ROOT, "dist", "research.sqlite"));
const bundle = buildBundle(dir, { label: path.relative(REPO_ROOT, dir) || dir, fictional: false, today: flagStr(args, "today") ?? todayString() });
if (bundle.validation.errors > 0) {
  console.error(`Dataset has ${bundle.validation.errors} validation error(s); run npm run validate.`);
  process.exit(1);
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.rmSync(out, { force: true });
const counts = writeSqlite(DatabaseSync, bundle, out);
console.log(`Wrote ${path.relative(process.cwd(), out)}`);
for (const [table, count] of Object.entries(counts)) console.log(`  ${table.padEnd(22)} ${count}`);
