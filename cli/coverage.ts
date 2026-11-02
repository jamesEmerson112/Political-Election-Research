/**
 * npm run -s coverage -- <contest-id> [--json] [--data <dir>]
 * Parity matrix: every candidate x every agenda field. Rows marked "!" are
 * asymmetric (one candidate researched, another not).
 */
import { readDataDir } from "../src/dataset.js";
import { coverage } from "../src/research.js";
import { validateFiles } from "../src/validate.js";
import { dataDir, flagStr, parseArgs } from "./args.js";

const args = parseArgs();
const contest = args.positional[0] ?? flagStr(args, "contest");
if (!contest) {
  console.error("usage: npm run -s coverage -- <election>/<contest>");
  process.exit(2);
}
const dir = dataDir(args);
const res = validateFiles(readDataDir(dir), { dataDir: dir, today: flagStr(args, "today") });
const cov = coverage(res.dataset, contest);
if (args.flags.has("json")) {
  process.stdout.write(JSON.stringify(cov, null, 2) + "\n");
} else {
  const header = ["", "field", ...cov.candidates];
  const rows = cov.rows.map((r) => [r.asymmetric ? "!" : "", r.label, ...r.cells]);
  const widths = header.map((_, i) => Math.max(...[header, ...rows].map((r) => (r[i] ?? "").length)));
  const line = (r: string[]) => r.map((c, i) => c.padEnd(widths[i]!)).join("  ").trimEnd();
  console.log(`Coverage: ${cov.contest}\n`);
  console.log(line(header));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const r of rows) console.log(line(r));
  const asym = cov.rows.filter((r) => r.asymmetric).length;
  console.log(`\n${asym} asymmetric row(s).`);
}
