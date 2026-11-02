/**
 * npm run -s import:research -- <batch.json> [more.json ...] [--dry-run] [--data <dir>]
 * Imports research batches (docs/RESEARCH_BATCH_FORMAT.md) as agendas + unverified leads.
 */
import fs from "node:fs";
import path from "node:path";
import { readDataDir } from "../src/dataset.js";
import { importBatch, type BatchContest } from "../src/importResearch.js";
import { todayString } from "../src/validate.js";
import { dataDir, flagStr, parseArgs } from "./args.js";

const args = parseArgs();
if (!args.positional.length) {
  console.error("usage: npm run -s import:research -- <batch.json> [...] [--dry-run]");
  process.exit(2);
}
const dir = dataDir(args);
const batch: BatchContest[] = args.positional.flatMap((f) => JSON.parse(fs.readFileSync(f, "utf8")) as BatchContest[]);
const { writes, reports } = importBatch(readDataDir(dir), batch, { dataDir: dir, today: flagStr(args, "today") ?? todayString() });
let failed = 0;
for (const r of reports) {
  const rejected = r.results.filter((x) => x.action === "rejected");
  failed += rejected.length;
  console.log(
    `${r.contest}: agenda ${r.agenda}, ${r.candidates.length} candidate(s), +${r.leadsAdded} lead(s)` +
      (r.agendaDiffers ? `\n    ! ${r.agendaDiffers}` : "") +
      rejected.map((x) => `\n    ✕ ${x.file}: ${x.message ?? ""} ${JSON.stringify(x.problems)}`).join(""),
  );
}
if (!args.flags.has("dry-run") && failed === 0) {
  for (const [rel, content] of writes) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
  console.log(`\nWrote ${writes.size} file(s).`);
} else {
  console.log(failed ? `\n${failed} rejected; nothing written.` : `\nDry run: ${writes.size} file(s) would be written.`);
}
process.exit(failed ? 1 : 0);
