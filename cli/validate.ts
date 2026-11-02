/**
 * npm run validate [-- --json] [--strict] [--data <dir>] [--today YYYY-MM-DD]
 * Exit 1 on any error (warnings become errors with --strict).
 */
import { readDataDir } from "../src/dataset.js";
import { formatProblem, validateFiles } from "../src/validate.js";
import { dataDir, flagStr, parseArgs } from "./args.js";

const args = parseArgs();
const dir = dataDir(args);
const res = validateFiles(readDataDir(dir), { dataDir: dir, strict: args.flags.has("strict"), today: flagStr(args, "today") });
if (args.flags.has("json")) {
  process.stdout.write(JSON.stringify({ errors: res.errors, warnings: res.warnings, problems: res.problems }, null, 2) + "\n");
} else {
  for (const p of res.problems) console.log(formatProblem(p));
  console.log(`\n${res.dataset.files.length} files checked: ${res.errors} error(s), ${res.warnings} warning(s).`);
}
process.exit(res.errors > 0 ? 1 : 0);
