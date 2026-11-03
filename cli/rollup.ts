/**
 * npm run -s rollup -- <person-ref> <contest-ref> [--through YYYY-MM-DD] [--top N] [--data <dir>]
 * Computed funding summary for one candidate in one contest (JSON).
 */
import { readDataDir } from "../src/dataset.js";
import { rollupCandidate } from "../src/rollup.js";
import { validateFiles } from "../src/validate.js";
import { dataDir, flagStr, parseArgs } from "./args.js";

const args = parseArgs();
const [person, contest] = args.positional;
if (!person || !contest) {
  console.error("usage: npm run -s rollup -- person:<slug> contest:<election>/<contest> [--through YYYY-MM-DD] [--top N]");
  process.exit(2);
}
const dir = dataDir(args);
const res = validateFiles(readDataDir(dir), { dataDir: dir });
const top = flagStr(args, "top");
const out = rollupCandidate(res.dataset, person, contest.startsWith("contest:") ? contest : `contest:${contest}`, {
  through: flagStr(args, "through") ?? null,
  top: top ? Number(top) : undefined,
});
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
