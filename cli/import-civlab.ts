/**
 * npm run -s import:civlab -- [<gov>=<graph.json> ...] [--save <dir>] [--dry-run] [--today YYYY-MM-DD] [--data <dir>]
 *
 * Adds CivLab-derived connections (and, where missing, legal basis, official
 * site, term and powers) to every office whose links.civlab is set.
 * Graph JSON is fetched from graph.civlab.org unless given as <gov>=<file>
 * (e.g. sf=/tmp/sf.json), which makes a run reproducible. --save writes the
 * fetched payloads to <dir> (keep it outside the repo: no license was found
 * for CivLab's data, so it is not committed).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { readDataDir } from "../src/dataset.js";
import { buildIdFromHtml, graphDataUrl, graphFromPayload, importCivlab, parseCivlabUrl, type CivlabGraph } from "../src/importCivlab.js";
import { todayString } from "../src/validate.js";
import { dataDir, flagStr, parseArgs } from "./args.js";

const curl = (url: string) => execFileSync("curl", ["-sS", "--fail", "-m", "60", url], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

const args = parseArgs();
const dir = dataDir(args);
const files = readDataDir(dir);
const given = new Map(
  args.positional.map((p) => {
    const i = p.indexOf("=");
    if (i < 1) throw new Error(`expected <gov>=<graph.json>, got "${p}"`);
    return [p.slice(0, i), p.slice(i + 1)] as [string, string];
  }),
);

const needed = new Set<string>();
for (const [rel, content] of files) {
  if (!/^offices\/[^/]+\.json$/.test(rel)) continue;
  const url = (JSON.parse(content) as { links?: { civlab?: string } }).links?.civlab;
  const parsed = url ? parseCivlabUrl(url) : null;
  if (parsed) needed.add(parsed.gov);
}

const graphs: Record<string, CivlabGraph> = {};
for (const gov of [...needed].sort()) {
  let raw: string;
  const file = given.get(gov);
  if (file) raw = fs.readFileSync(file, "utf8");
  else {
    const html = curl(`https://graph.civlab.org/${gov}`);
    const buildId = buildIdFromHtml(html, gov);
    if (!buildId) throw new Error(`could not find the CivLab build id on https://graph.civlab.org/${gov}`);
    raw = curl(graphDataUrl(gov, buildId));
    const save = flagStr(args, "save");
    if (save) {
      fs.mkdirSync(save, { recursive: true });
      fs.writeFileSync(path.join(save, `${gov}.json`), raw);
    }
  }
  graphs[gov] = graphFromPayload(JSON.parse(raw));
  console.log(`graph ${gov}: ${Object.keys(graphs[gov]!.nodes).length} nodes`);
}

const { writes, results, report } = importCivlab(files, graphs, { dataDir: dir, today: flagStr(args, "today") ?? todayString() });
const rejected = results.filter((r) => r.action === "rejected");
for (const r of results) console.log(`${r.action.padEnd(9)} ${r.file}`);
for (const r of rejected) console.log(`✕ ${r.file}: ${r.message ?? ""} ${JSON.stringify(r.problems)}`);
for (const line of report) console.log(`note: ${line}`);
if (!args.flags.has("dry-run") && !rejected.length) {
  for (const [rel, content] of writes) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
  console.log(`Wrote ${writes.size} file(s).`);
} else console.log(rejected.length ? "Rejected; nothing written." : `Dry run: ${writes.size} file(s).`);
process.exitCode = rejected.length ? 1 : 0;
