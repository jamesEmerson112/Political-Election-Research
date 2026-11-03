/**
 * Research harness for many agents at once (AGENTS.md, "Several agents at once").
 *
 * Each agent works on one *work package* in its own *run directory*: a private copy of
 * data/ seeded from a commit, where it runs the normal loop (`next`, `put`, `validate`
 * with --data). Every write goes through `run.mts put`, which logs it. Judges then drop
 * what they can't confirm, and `integrate` replays the kept writes against the real data/
 * one task at a time: validate, then one commit per task. Agents never touch data/.
 *
 *   npx tsx tools/research/run.mts packages --layer <L0|L1|L2|L3|L4|R> --contests <id,...> --root <dir>
 *                                            [--lenses a,b] [--max-tasks 24] [--kinds k1,k2]
 *   npx tsx tools/research/run.mts packages --custom <file.json> --root <dir>
 *   npx tsx tools/research/run.mts put <run> <task id> <kind|src> [--merge|--replace] [--file rec.json]
 *   npx tsx tools/research/run.mts check <run>... [--json]
 *   npx tsx tools/research/run.mts integrate <run>... --trailers <file> [--dry-run]
 *   npx tsx tools/research/run.mts status <run>...
 *
 * A run directory holds pkg.json (the package: tasks, lenses, data_dir), log.jsonl (every
 * put), the judges' verdicts-<lens>.json ({"drops":[{"seq":n,"reason":"..."}]}) and, after
 * integration, integrated.json. Its private data/ is reached through a symlink
 * <repo>/.rd-<package id> so `$schema` pointers come out exactly as in data/.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readDataDir, type FileMap } from "../../src/dataset.js";
import { put, PUT_KINDS, type PutKind } from "../../src/put.js";
import { nextTasks, type Task } from "../../src/research.js";
import { todayString, validateFiles } from "../../src/validate.js";
// @ts-expect-error plain ESM module without types
import { fetchText, keyOf, CACHE } from "./fetch-text.mjs";

type Rec = Record<string, unknown>;
type Mode = "create" | "merge" | "replace";
interface PkgTask {
  id: string;
  kind: string;
  subject?: string;
  item?: string;
  detail: string;
  guide?: string;
  put?: string;
  file?: string;
  blocked_by?: string;
  leads?: string[];
}
interface Pkg {
  id: string;
  layer: string;
  contest: string;
  subjects: string[];
  judge_group: string;
  lenses: string[];
  run_dir: string;
  data_dir: string;
  seed_head: string;
  commit_prefix?: string;
  brief?: string;
  tasks: PkgTask[];
}
interface Entry {
  seq: number;
  task: string;
  kind: PutKind;
  mode: Mode;
  input: Rec;
  date: string;
  action: string;
  file: string;
  ref?: string;
  at: string;
}

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DATA = path.join(REPO, "data");
const LAYER_KINDS: Record<string, string[]> = {
  L0: ["election", "person", "contest", "candidacy", "finance_cutoff", "measure_committees"],
  L1: ["profile"],
  L2: ["committee", "contributions", "independent_expenditures"],
  L3: ["endorsements", "position"],
  L4: ["legislation", "dossier"],
  R: ["person", "contest", "candidacy", "finance_cutoff", "measure_committees", "profile", "committee", "contributions", "independent_expenditures", "endorsements", "position", "legislation", "dossier"],
};
const DEFAULT_LENSES: Record<string, string[]> = {
  L0: ["fidelity"],
  L1: ["fidelity"],
  L2: ["fidelity"],
  L3: ["fidelity", "inference"],
  L4: ["fidelity", "neutrality"],
  R: ["fidelity", "inference"],
  V: ["fidelity"],
};
/** Kinds whose create may meet a record another package already wrote: reuse it. */
const REUSABLE = new Set<string>(["organization", "person", "bill", "office", "election", "issue", "source"]);
/** --replace rewrites a whole file; only allowed where the file is one record of this package. */
const REPLACE_OK = new Set<string>(["position", "relationship"]);
const REF_RE = /^(person|org|office|election|contest|q|src):[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)?$/;

// ---------------------------------------------------------------------------- helpers
const argv = process.argv.slice(2);
const cmd = argv.shift();
function flag(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}
const has = (name: string) => argv.includes(`--${name}`);
function positionals(): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      if (["layer", "contests", "root", "lenses", "max-tasks", "kinds", "custom", "file", "trailers"].includes(a.slice(2))) i++;
      continue;
    }
    out.push(a);
  }
  return out;
}
const readJson = <T,>(f: string): T => JSON.parse(fs.readFileSync(f, "utf8")) as T;
const git = (...a: string[]) => execFileSync("git", ["-C", REPO, ...a], { encoding: "utf8" }).trim();
function die(msg: string): never {
  console.error(msg);
  process.exit(2);
}
function loadPkg(run: string): Pkg {
  const f = path.join(run, "pkg.json");
  if (!fs.existsSync(f)) die(`${run}: no pkg.json (not a run directory)`);
  return readJson<Pkg>(f);
}
function loadLog(run: string): Entry[] {
  const f = path.join(run, "log.jsonl");
  if (!fs.existsSync(f)) return [];
  return fs
    .readFileSync(f, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Entry);
}
function refsIn(v: unknown, out = new Set<string>()): Set<string> {
  if (typeof v === "string") {
    if (REF_RE.test(v)) out.add(v);
  } else if (Array.isArray(v)) v.forEach((x) => refsIn(x, out));
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v as Rec)) {
      if (k === "bill" && typeof x === "string" && !x.includes(":")) out.add(`bill:${x}`);
      refsIn(x, out);
    }
  }
  return out;
}
/** The file a ref lives in, for the kinds the dependency closure needs. */
function fileOfRef(ref: string): string | undefined {
  const [k, id] = [ref.slice(0, ref.indexOf(":")), ref.slice(ref.indexOf(":") + 1)];
  const dir: Record<string, string> = { src: "sources", person: "people", org: "organizations", bill: "bills", office: "offices", election: "elections", contest: "contests" };
  return dir[k] ? `${dir[k]}/${id}.json` : undefined;
}

// ---------------------------------------------------------------------------- packages
function seedFrom(head: string, root: string): string {
  const seed = path.join(root, ".seed", head);
  if (!fs.existsSync(path.join(seed, "data"))) {
    fs.mkdirSync(seed, { recursive: true });
    execFileSync("bash", ["-c", `git -C '${REPO}' archive '${head}' data | tar -x -C '${seed}'`]);
  }
  return path.join(seed, "data");
}
function makeRun(root: string, p: Omit<Pkg, "run_dir" | "data_dir" | "seed_head">, head: string): Pkg {
  const run = path.join(root, p.id);
  if (fs.existsSync(run)) die(`${run} exists; pick another --root or remove it`);
  fs.mkdirSync(run, { recursive: true });
  fs.cpSync(seedFrom(head, root), path.join(run, "data"), { recursive: true });
  const link = path.join(REPO, `.rd-${p.id}`);
  fs.rmSync(link, { force: true });
  fs.symlinkSync(path.join(run, "data"), link);
  const pkg: Pkg = { ...p, run_dir: run, data_dir: link, seed_head: head };
  fs.writeFileSync(path.join(run, "pkg.json"), JSON.stringify(pkg, null, 2) + "\n");
  return pkg;
}
const flat = (s: string) => s.replace(/^[a-z]+:/, "").replace(/[/|:]+/g, "--");

function cmdPackages() {
  const root = path.resolve(flag("root") ?? die("--root <dir> is required"));
  const head = git("rev-parse", "HEAD");
  if (git("status", "--porcelain", "--", "data")) die("data/ has uncommitted changes; commit them first so packages seed from HEAD");
  const out: Pkg[] = [];
  const custom = flag("custom");
  if (custom) {
    for (const c of readJson<Array<Omit<Pkg, "run_dir" | "data_dir" | "seed_head">>>(path.resolve(custom))) out.push(makeRun(root, { lenses: DEFAULT_LENSES[c.layer] ?? ["fidelity"], ...c }, head));
  } else {
    const layer = flag("layer") ?? die("--layer is required");
    const contests = new Set((flag("contests") ?? die("--contests is required")).split(",").map((c) => c.trim().replace(/^contest:/, "")));
    const kinds = new Set(flag("kinds")?.split(",") ?? LAYER_KINDS[layer] ?? die(`unknown layer ${layer}`));
    const lenses = flag("lenses")?.split(",") ?? DEFAULT_LENSES[layer]!;
    const maxTasks = Number(flag("max-tasks") ?? 24);
    const res = validateFiles(readDataDir(DATA), { dataDir: DATA });
    if (res.errors) die(`data/ has ${res.errors} validation error(s)`);
    const all = nextTasks(res.dataset, { includeBlocked: true }).filter((t) => contests.has(t.contest.replace(/^contest:/, "")) && kinds.has(t.kind));
    const groups = new Map<string, { contest: string; subjects: string[]; tasks: Task[] }>();
    const add = (key: string, contest: string, t: Task, subjects: string[]) => {
      const g = groups.get(key) ?? { contest, subjects, tasks: [] };
      g.tasks.push(t);
      groups.set(key, g);
    };
    const byContest = new Map<string, Task[]>();
    for (const t of all) byContest.set(t.contest, [...(byContest.get(t.contest) ?? []), t]);
    for (const [contest, ts] of byContest) {
      const cid = contest.replace(/^contest:/, "");
      const people = [...new Set(ts.filter((t) => t.subject?.startsWith("person:")).map((t) => t.subject!))];
      for (const t of ts) {
        const kind = t.kind as string;
        if (layer === "L0") add(`${layer}--${flat(cid)}`, contest, t, people);
        else if (kind === "position") {
          const qs = [...new Set(ts.filter((x) => x.kind === "position").map((x) => x.item!))];
          const perPkg = Math.max(1, Math.floor(maxTasks / Math.max(1, people.length)));
          const chunk = Math.floor(qs.indexOf(t.item!) / perPkg);
          add(`${layer}--${flat(cid)}--positions-${chunk + 1}`, contest, t, people);
        } else if (kind === "dossier" && t.item === "controversies") {
          const chunk = Math.floor(people.indexOf(t.subject!) / 4);
          add(`${layer}--${flat(cid)}--controversies-${chunk + 1}`, contest, t, people.slice(chunk * 4, chunk * 4 + 4));
        } else if (t.subject) add(`${layer}--${flat(cid)}--${flat(t.subject)}`, contest, t, [t.subject]);
        else add(`${layer}--${flat(cid)}`, contest, t, people);
      }
    }
    // Blocked tasks stay only when what blocks them is in the same package.
    let dropped = 0;
    for (const g of groups.values()) {
      const ids = new Set(g.tasks.map((t) => t.id));
      const kept = g.tasks.filter((t) => !t.blocked_by || ids.has(t.blocked_by));
      dropped += g.tasks.length - kept.length;
      g.tasks = kept;
    }
    // Judge groups: consecutive packages of one contest, at most 4 packages / 48 tasks each.
    let gi = 0;
    let cur = { contest: "", n: 0, tasks: 0 };
    for (const [id, g] of groups) {
      if (!g.tasks.length) continue;
      if (cur.contest !== g.contest || cur.n >= 4 || cur.tasks + g.tasks.length > 48) {
        gi++;
        cur = { contest: g.contest, n: 0, tasks: 0 };
      }
      cur.n++;
      cur.tasks += g.tasks.length;
      const tasks: PkgTask[] = g.tasks.map((t) => ({ ...t }) as unknown as PkgTask);
      out.push(makeRun(root, { id, layer, contest: g.contest, subjects: g.subjects, judge_group: `${layer}-${String(gi).padStart(3, "0")}--${flat(g.contest)}`, lenses, tasks }, head));
    }
    if (dropped) console.error(`${dropped} blocked task(s) left out (their blocker is not in the same package).`);
  }
  const summary = out.map((p) => ({ id: p.id, run_dir: p.run_dir, data_dir: p.data_dir, layer: p.layer, contest: p.contest, judge_group: p.judge_group, subjects: p.subjects, lenses: p.lenses, tasks: p.tasks.length, kinds: [...new Set(p.tasks.map((t) => t.kind))] }));
  const file = path.join(root, `packages-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify({ packages: summary.length, tasks: summary.reduce((n, p) => n + p.tasks, 0), file }));
}

// ---------------------------------------------------------------------------- put
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}
async function cmdPut() {
  const [run, task, kindArg] = positionals();
  if (!run || !task || !kindArg) die("usage: run.mts put <run> <task id> <kind|src> [--merge|--replace] [--file rec.json]");
  const kind = (kindArg === "src" ? "source" : kindArg) as PutKind;
  if (!PUT_KINDS.includes(kind)) die(`unknown kind ${kindArg}; one of src, ${PUT_KINDS.join(", ")}`);
  const pkg = loadPkg(path.resolve(run));
  if (!pkg.tasks.some((t) => t.id === task)) die(`task "${task}" is not in this package (${pkg.id}); see ${path.join(pkg.run_dir, "pkg.json")}`);
  const mode: Mode = has("replace") ? "replace" : has("merge") ? "merge" : "create";
  const agendaFix = kind === "agenda" && /^(L0|NV0|SCOPE)/.test(pkg.layer);
  if (mode === "replace" && !REPLACE_OK.has(kind) && !agendaFix) die(`--replace is not allowed for ${kind} here (it would overwrite other packages' work at integration); use --merge with only the fields you change`);
  const file = flag("file");
  const raw = file ? fs.readFileSync(file, "utf8") : await readStdin();
  let input: Rec;
  try {
    input = JSON.parse(raw) as Rec;
  } catch (e) {
    die(`Input is not valid JSON: ${(e as Error).message}`);
  }
  const today = todayString();
  const res = put(readDataDir(pkg.data_dir), kind, input, { dataDir: pkg.data_dir, mode, today });
  let seq: number | undefined;
  if (res.content !== undefined) {
    const abs = path.join(pkg.data_dir, res.file);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, res.content);
    seq = loadLog(pkg.run_dir).length + 1;
    const entry: Entry = { seq, task, kind, mode, input, date: today, action: res.action, file: res.file, ...(res.ref ? { ref: res.ref } : {}), at: new Date().toISOString() };
    fs.appendFileSync(path.join(pkg.run_dir, "log.jsonl"), JSON.stringify(entry) + "\n");
  }
  const { content: _c, ...report } = res;
  process.stdout.write(JSON.stringify({ ...report, ...(seq ? { seq } : {}) }, null, 2) + "\n");
  process.exitCode = res.action === "rejected" ? 1 : 0;
}

// ---------------------------------------------------------------------------- check
const LIG: Record<string, string> = { "ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl", "ﬅ": "st", "ﬆ": "st" };
export function norm(s: string): string {
  return s
    .normalize("NFC")
    .replace(/\[\[page \d+\]\]/g, " ")
    .replace(/[ﬀ-ﬆ]/g, (c) => LIG[c] ?? c)
    .replace(/[­​-‍⁠﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
const fold = (s: string) =>
  norm(s)
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/…/g, "...")
    .toLowerCase();

function citationsIn(v: unknown, at = "", out: Array<{ at: string; source: string; quote?: string; status: string }> = []) {
  if (Array.isArray(v)) v.forEach((x, i) => citationsIn(x, `${at}/${i}`, out));
  else if (v && typeof v === "object") {
    const o = v as Rec;
    if (typeof o["source"] === "string" && String(o["source"]).startsWith("src:")) {
      out.push({ at, source: String(o["source"]), ...(typeof o["quote"] === "string" ? { quote: String(o["quote"]) } : {}), status: typeof o["quote"] === "string" ? "quote" : o["verified_by"] ? "verified_by" : o["unverified"] ? "unverified" : "none" });
    }
    for (const [k, x] of Object.entries(o)) citationsIn(x, `${at}/${k}`, out);
  }
  return out;
}
function sourceUrls(pkg: Pkg, log: Entry[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const dir of [path.join(DATA, "sources"), path.join(pkg.data_dir, "sources")]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      const r = readJson<Rec>(path.join(dir, f));
      m.set(`src:${String(r["id"])}`, String(r["url"]));
    }
  }
  for (const e of log) if (e.kind === "source" && e.ref) m.set(e.ref, String(e.input["url"]));
  return m;
}
async function textOf(url: string): Promise<{ text: string; blocked: boolean; file: string }> {
  const meta = path.join(CACHE, `${keyOf(url)}.json`);
  const info = fs.existsSync(meta) ? (readJson<Rec>(meta) as Rec & { file: string }) : ((await fetchText(url)) as Rec & { file: string });
  return { text: fs.existsSync(info.file) ? fs.readFileSync(info.file, "utf8") : "", blocked: Boolean(info["blocked"]), file: info.file };
}
async function checkRun(run: string) {
  const pkg = loadPkg(run);
  const log = loadLog(run);
  const urls = sourceUrls(pkg, log);
  const failures: Rec[] = [];
  let checked = 0;
  const texts = new Map<string, { text: string; blocked: boolean; file: string; n: string; f: string }>();
  for (const e of log) {
    if (e.kind === "source") continue;
    for (const c of citationsIn(e.input)) {
      if (c.quote === undefined) continue; // filings need a locator, not a quote; validate enforces both rules
      checked++;
      const url = urls.get(c.source);
      if (!url) {
        failures.push({ seq: e.seq, task: e.task, at: c.at, source: c.source, problem: "source not registered" });
        continue;
      }
      if (!texts.has(url)) {
        const t = await textOf(url);
        texts.set(url, { ...t, n: norm(t.text), f: fold(t.text) });
      }
      const t = texts.get(url)!;
      const q = norm(c.quote);
      if (!q) failures.push({ seq: e.seq, task: e.task, at: c.at, source: c.source, problem: "empty quote" });
      else if (t.n.includes(q)) continue;
      else
        failures.push({
          seq: e.seq,
          task: e.task,
          at: c.at,
          source: c.source,
          url,
          cached_text: t.file,
          quote: c.quote.slice(0, 240),
          problem: t.blocked ? "source unreadable here (blocked); the quote cannot be confirmed" : t.f.includes(fold(c.quote)) ? "not verbatim: differs in quote marks, dashes, ellipses or capitals; copy the exact characters" : "quote not found in the source text",
        });
    }
  }
  return { run, package: pkg.id, entries: log.length, quotes_checked: checked, failures };
}
async function cmdCheck() {
  const runs = positionals().map((r) => path.resolve(r));
  if (!runs.length) die("usage: run.mts check <run>... [--json]");
  const results = [];
  for (const r of runs) results.push(await checkRun(r));
  if (has("json")) console.log(JSON.stringify(results, null, 2));
  else
    for (const r of results) {
      console.log(`${r.package}: ${r.entries} put(s), ${r.quotes_checked} quote(s) checked, ${r.failures.length} problem(s)`);
      for (const f of r.failures) console.log(`  seq ${String(f["seq"])} ${String(f["task"])} ${String(f["at"])}: ${String(f["problem"])}${f["quote"] ? `\n    "${String(f["quote"])}"` : ""}`);
    }
  process.exitCode = results.some((r) => r.failures.length) ? 1 : 0;
}

// ---------------------------------------------------------------------------- integrate
function cmdIntegrate() {
  const runs = positionals().map((r) => path.resolve(r));
  const dry = has("dry-run");
  const trailersFile = flag("trailers");
  if (!runs.length || (!dry && !trailersFile)) die("usage: run.mts integrate <run>... --trailers <file> [--dry-run]");
  const trailers = trailersFile ? fs.readFileSync(trailersFile, "utf8").trim() : "";
  if (!dry && git("status", "--porcelain", "--", "data")) die("data/ has uncommitted changes; commit or stash them first");
  const files: FileMap = readDataDir(DATA);
  const today = todayString();
  const base = validateFiles(files, { dataDir: DATA, today });
  if (base.errors) die(`data/ already has ${base.errors} validation error(s); fix them first`);
  const report: Rec[] = [];
  for (const run of runs) {
    const pkg = loadPkg(run);
    const done = path.join(run, "integrated.json");
    if (fs.existsSync(done) && !dry) {
      report.push({ package: pkg.id, skipped: "already integrated" });
      continue;
    }
    const missing = pkg.lenses.filter((l) => !fs.existsSync(path.join(run, `verdicts-${l}.json`)));
    if (missing.length) {
      report.push({ package: pkg.id, skipped: `not judged (${missing.join(", ")})` });
      continue;
    }
    const log = loadLog(run);
    const dropSeq = new Map<number, string>();
    for (const l of pkg.lenses) for (const d of readJson<{ drops?: Array<{ seq: number; reason: string }> }>(path.join(run, `verdicts-${l}.json`)).drops ?? []) dropSeq.set(Number(d.seq), `${l}: ${d.reason}`);
    // Dropping one write of a file in a task drops every write of that file in that task.
    const droppedTF = new Set<string>();
    for (const e of log) if (dropSeq.has(e.seq)) droppedTF.add(`${e.task}\u0000${e.file}`);
    const isDropped = (e: Entry) => droppedTF.has(`${e.task}\u0000${e.file}`);
    const createdBy = new Map<string, Entry>();
    for (const e of log) if (e.action === "created" && !isDropped(e) && !createdBy.has(e.file)) createdBy.set(e.file, e);
    const applied = new Set<number>();
    const taskOrder = [...new Set(log.map((e) => e.task))];
    const results: Rec[] = [];
    for (const task of taskOrder) {
      const own = log.filter((e) => e.task === task && !isDropped(e));
      if (!own.length) {
        results.push({ task, status: "dropped", why: [...new Set(log.filter((e) => e.task === task).map((e) => dropSeq.get(e.seq)).filter(Boolean))].join(" | ") || "every write was dropped" });
        continue;
      }
      // Sources and organizations nobody in this task cites are left out (no orphans);
      // anything cited that data/ lacks is pulled in from the entry that created it.
      const cited = new Set<string>();
      for (const e of own) if (e.kind !== "source") refsIn(e.input, cited);
      const plan: Entry[] = [];
      const want = (e: Entry) => {
        if (applied.has(e.seq) || plan.includes(e)) return;
        const deps = new Set<string>();
        refsIn(e.input, deps);
        for (const r of deps) {
          const f = fileOfRef(r);
          const c = f ? createdBy.get(f) : undefined;
          if (c && c !== e && !files.has(c.file)) want(c);
        }
        plan.push(e);
      };
      for (const e of own) {
        if ((e.kind === "source" || e.kind === "organization") && e.ref && !cited.has(e.ref)) continue;
        want(e);
      }
      const written = new Map<string, string | undefined>();
      let fail = "";
      const notes: string[] = [];
      for (const e of plan) {
        const res = put(files, e.kind, e.input, { dataDir: DATA, mode: e.mode, today: e.date });
        if (res.action === "rejected") {
          if (e.mode === "create" && REUSABLE.has(e.kind) && /File exists/.test(res.message ?? "")) {
            notes.push(`reused existing ${res.ref ?? res.file}`);
            continue;
          }
          fail = `seq ${e.seq} (${e.kind} ${e.mode}): ${res.message ?? "rejected"} ${res.problems.map((p) => `${p.pointer} ${p.message}`).join("; ")}`.trim();
          break;
        }
        if (res.content === undefined) continue;
        if (!written.has(res.file)) written.set(res.file, files.get(res.file));
        files.set(res.file, res.content);
        if (!dry) {
          const abs = path.join(DATA, res.file);
          fs.mkdirSync(path.dirname(abs), { recursive: true });
          fs.writeFileSync(abs, res.content);
        }
      }
      if (!fail && written.size) {
        const v = validateFiles(files, { dataDir: DATA, today });
        if (v.errors)
          fail = `validate: ${v.problems
            .filter((p) => p.severity === "error")
            .slice(0, 5)
            .map((p) => `${p.file}#${p.pointer} [${p.code}] ${p.message}`)
            .join(" | ")}`;
      }
      if (fail) {
        for (const [rel, old] of written) {
          if (old === undefined) {
            files.delete(rel);
            if (!dry) fs.rmSync(path.join(DATA, rel), { force: true });
          } else {
            files.set(rel, old);
            if (!dry) fs.writeFileSync(path.join(DATA, rel), old);
          }
        }
        results.push({ task, status: "failed", why: fail });
        continue;
      }
      for (const e of plan) applied.add(e.seq);
      if (!written.size) {
        results.push({ task, status: "unchanged", ...(notes.length ? { notes } : {}) });
        continue;
      }
      let commit = "";
      if (!dry) {
        const subject = pkg.commit_prefix ? `${pkg.commit_prefix}: ${task}` : `research(${task.split("|")[0]}): ${task}`;
        const msgFile = path.join(run, ".commit-msg");
        fs.writeFileSync(msgFile, `${subject}\n\nPackage ${pkg.id} (${pkg.layer}); judged: ${pkg.lenses.join(", ")}.\n\n${trailers}\n`);
        git("add", "--", ...[...written.keys()].map((r) => path.join("data", r)));
        git("commit", "-q", "-F", msgFile);
        fs.rmSync(msgFile, { force: true });
        commit = git("rev-parse", "--short", "HEAD");
      }
      results.push({ task, status: dry ? "would commit" : "committed", files: [...written.keys()], ...(commit ? { commit } : {}), ...(notes.length ? { notes } : {}) });
    }
    const summary = { package: pkg.id, at: new Date().toISOString(), committed: results.filter((r) => r["status"] === "committed" || r["status"] === "would commit").length, failed: results.filter((r) => r["status"] === "failed").length, dropped: results.filter((r) => r["status"] === "dropped").length, results };
    if (!dry) fs.writeFileSync(done, JSON.stringify(summary, null, 2) + "\n");
    report.push(summary);
  }
  console.log(JSON.stringify(report, null, 2));
}

// ---------------------------------------------------------------------------- status
function cmdStatus() {
  for (const run of positionals().map((r) => path.resolve(r))) {
    const pkg = loadPkg(run);
    const log = loadLog(run);
    const verdicts = pkg.lenses.map((l) => `${l}:${fs.existsSync(path.join(run, `verdicts-${l}.json`)) ? "yes" : "no"}`).join(" ");
    console.log(`${pkg.id}  tasks ${pkg.tasks.length}  puts ${log.length}  tasks-with-puts ${new Set(log.map((e) => e.task)).size}  verdicts ${verdicts}  integrated ${fs.existsSync(path.join(run, "integrated.json")) ? "yes" : "no"}`);
  }
}

switch (cmd) {
  case "packages":
    cmdPackages();
    break;
  case "put":
    await cmdPut();
    break;
  case "check":
    await cmdCheck();
    break;
  case "integrate":
    cmdIntegrate();
    break;
  case "status":
    cmdStatus();
    break;
  default:
    die("usage: run.mts <packages|put|check|integrate|status> ... (see the header of tools/research/run.mts)");
}
