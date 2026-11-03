/**
 * npm run -s import:offices -- <offices.json> [--dry-run] [--data <dir>]
 * Imports an office research batch as office records with unverified citations.
 */
import fs from "node:fs";
import path from "node:path";
import { readDataDir } from "../src/dataset.js";
import { importOffices, type OfficeBatchItem } from "../src/importOffices.js";
import { todayString } from "../src/validate.js";
import { dataDir, flagStr, parseArgs } from "./args.js";

const args = parseArgs();
if (!args.positional.length) {
  console.error("usage: npm run -s import:offices -- <offices.json> [--dry-run]");
  process.exit(2);
}
const dir = dataDir(args);
const batch: OfficeBatchItem[] = args.positional.flatMap((f) => JSON.parse(fs.readFileSync(f, "utf8")) as OfficeBatchItem[]);
const { writes, results } = importOffices(readDataDir(dir), batch, { dataDir: dir, today: flagStr(args, "today") ?? todayString() });
const rejected = results.filter((r) => r.action === "rejected");
for (const r of results.filter((x) => x.file.startsWith("offices/"))) console.log(`${r.action.padEnd(9)} ${r.file}`);
for (const r of rejected) console.log(`✕ ${r.file}: ${r.message ?? ""} ${JSON.stringify(r.problems)}`);
if (!args.flags.has("dry-run") && !rejected.length) {
  for (const [rel, content] of writes) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
  console.log(`Wrote ${writes.size} file(s).`);
} else console.log(rejected.length ? "Rejected; nothing written." : `Dry run: ${writes.size} file(s).`);
process.exitCode = rejected.length ? 1 : 0;
