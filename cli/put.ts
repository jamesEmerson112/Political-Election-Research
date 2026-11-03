/**
 * npm run -s put -- <kind> [--merge | --replace] [--file rec.json] [--data <dir>]
 * Reads one JSON record (stdin or --file), computes its deterministic id and
 * path, canonicalizes, schema-checks, then writes. Prints a JSON result.
 * Kinds: source person organization relationship position contest election issue agenda config
 */
import fs from "node:fs";
import path from "node:path";
import { readDataDir } from "../src/dataset.js";
import { put, PUT_KINDS, type PutKind } from "../src/put.js";
import { todayString } from "../src/validate.js";
import { dataDir, flagStr, parseArgs, readStdin } from "./args.js";

const args = parseArgs();
const kind = args.positional[0] as PutKind | undefined;
if (!kind || !PUT_KINDS.includes(kind)) {
  console.error(`usage: npm run -s put -- <${PUT_KINDS.join("|")}> [--merge|--replace] [--file rec.json]`);
  process.exit(2);
}
const dir = dataDir(args);
const file = flagStr(args, "file");
const raw = file ? fs.readFileSync(file, "utf8") : await readStdin();
let input: Record<string, unknown>;
try {
  input = JSON.parse(raw) as Record<string, unknown>;
} catch (e) {
  console.error(`Input is not valid JSON: ${(e as Error).message}`);
  process.exit(2);
}
const mode = args.flags.has("replace") ? "replace" : args.flags.has("merge") ? "merge" : "create";
const res = put(readDataDir(dir), kind, input, { dataDir: dir, mode, today: flagStr(args, "today") ?? todayString() });
if (res.content !== undefined) {
  const abs = path.join(dir, res.file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, res.content);
}
const { content: _content, ...report } = res;
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
process.exitCode = res.action === "rejected" ? 1 : 0;
