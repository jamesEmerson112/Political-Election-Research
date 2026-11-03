/**
 * npm run -s next [-- --contest <id>] [--subject <ref>] [--json] [--limit N] [--all] [--data <dir>]
 * --all also lists tasks blocked by an unfinished prerequisite.
 * --subject person:<slug> keeps only one candidate's tasks (one agent per candidate
 * never touches another agent's files).
 * The deterministic research queue: agenda minus verified data, in
 * dependency order. Agents take the first task.
 */
import { readDataDir } from "../src/dataset.js";
import { nextTasks } from "../src/research.js";
import { validateFiles } from "../src/validate.js";
import { dataDir, flagStr, parseArgs } from "./args.js";

const args = parseArgs();
const dir = dataDir(args);
const res = validateFiles(readDataDir(dir), { dataDir: dir, today: flagStr(args, "today") });
if (res.errors > 0) {
  console.error(`Dataset has ${res.errors} validation error(s); fix them first (npm run validate).`);
  process.exit(1);
}
const limit = Number(flagStr(args, "limit") ?? Infinity);
const subject = flagStr(args, "subject");
const tasks = nextTasks(res.dataset, { contest: flagStr(args, "contest"), includeBlocked: args.flags.has("all") }).filter(
  (t) => !subject || t.subject === subject,
);
const shown = tasks.slice(0, limit);
if (args.flags.has("json")) {
  process.stdout.write(JSON.stringify({ total: tasks.length, tasks: shown }, null, 2) + "\n");
} else {
  for (const t of shown) {
    console.log(`${t.id}${t.blocked_by ? `  [blocked by ${t.blocked_by}]` : ""}\n    ${t.detail}\n    -> npm run -s put -- ${t.put}   (${t.file})   guide: ${t.guide}`);
    for (const l of t.leads ?? []) console.log(`    lead (unverified): ${l}`);
  }
  console.log(`\n${tasks.length} open task(s).`);
}
