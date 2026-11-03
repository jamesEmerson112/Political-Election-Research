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
 *                                            [--lenses a,b] [--max-tasks 24] [--kinds k1,k2] [--brief "<notes>"] [--per-package N]
 *   npx tsx tools/research/run.mts packages --custom <file.json> --root <dir>
 *   npx tsx tools/research/run.mts put <run> <task id> <kind|src> [--merge|--replace] [--file rec.json]
 *   npx tsx tools/research/run.mts check <run>... [--json]
 *   npx tsx tools/research/run.mts integrate <run>... --trailers <file> [--dry-run]
 *   npx tsx tools/research/run.mts status <run>...
 *   npx tsx tools/research/run.mts verdicts <workflow journal.jsonl> --roots <dir,...>
 *
 * A run directory holds pkg.json (the package: tasks, lenses, data_dir), log.jsonl (every
 * put), the judges' verdicts-<lens>.json ({"drops":[{"seq":n,"reason":"..."}]}) and, after
 * integration, integrated.json. Its private data/ is reached through a symlink
 * <repo>/.rd-<package id> so `$schema` pointers come out exactly as in data/.
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
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
      if (["layer", "contests", "root", "lenses", "max-tasks", "kinds", "custom", "file", "trailers", "roots", "brief", "per-package"].includes(a.slice(2))) i++;
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
    const tmp = `${seed}.tmp-${process.pid}`;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    execFileSync("bash", ["-c", `set -o pipefail; git -C '${REPO}' archive '${head}' data | tar -x -C '${tmp}'`]);
    fs.mkdirSync(path.dirname(seed), { recursive: true });
    fs.renameSync(tmp, seed);
  }
  return path.join(seed, "data");
}
function makeRun(root: string, p: Omit<Pkg, "run_dir" | "data_dir" | "seed_head">, head: string): Pkg {
  const run = path.join(root, p.id);
  if (fs.existsSync(run)) die(`${run} exists; pick another --root or remove it`);
  fs.mkdirSync(run, { recursive: true });
  fs.cpSync(seedFrom(head, root), path.join(run, "data"), { recursive: true });
  // One link per (root, package): packaging the same id under another root never re-points a live copy.
  const link = path.join(REPO, `.rd-${crypto.createHash("sha256").update(root).digest("hex").slice(0, 6)}-${p.id}`);
  if (fs.existsSync(link) || fs.lstatSync(link, { throwIfNoEntry: false })) {
    if (fs.readlinkSync(link) !== path.join(run, "data")) die(`${link} already points elsewhere; refusing to re-point it`);
    fs.rmSync(link, { force: true });
  }
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
    for (const c of readJson<Array<Omit<Pkg, "run_dir" | "data_dir" | "seed_head">>>(path.resolve(custom))) out.push(makeRun(root, { ...c, lenses: c.lenses ?? DEFAULT_LENSES[c.layer] ?? ["fidelity"] }, head));
  } else {
    const layer = flag("layer") ?? die("--layer is required");
    const contests = new Set((flag("contests") ?? die("--contests is required")).split(",").map((c) => c.trim().replace(/^contest:/, "")));
    const kinds = new Set(flag("kinds")?.split(",") ?? LAYER_KINDS[layer] ?? die(`unknown layer ${layer}`));
    const lenses = flag("lenses")?.split(",") ?? DEFAULT_LENSES[layer]!;
    const maxTasks = Number(flag("max-tasks") ?? 24);
    const perPackage = Math.max(1, Number(flag("per-package") ?? 1));
    const res = validateFiles(readDataDir(DATA), { dataDir: DATA });
    if (res.errors) die(`data/ has ${res.errors} validation error(s)`);
    const hasPerson = (s?: string) => !s || !s.startsWith("person:") || res.dataset.people.has(s.slice("person:".length));
    let noPerson = 0;
    const all = nextTasks(res.dataset, { includeBlocked: true }).filter((t) => {
      if (!contests.has(t.contest.replace(/^contest:/, "")) || !kinds.has(t.kind)) return false;
      if (layer !== "L0" && !hasPerson(t.subject)) return (noPerson++, false);
      return true;
    });
    if (noPerson) console.error(`${noPerson} task(s) left out: their person record doesn't exist yet (L0 first).`);
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
        } else if (t.subject && perPackage > 1) {
          // Several candidates per package (fewer agents): chunks in agenda order.
          const chunk = Math.floor(people.indexOf(t.subject) / perPackage);
          add(`${layer}--${flat(cid)}--people-${chunk + 1}`, contest, t, people.slice(chunk * perPackage, chunk * perPackage + perPackage));
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
      const brief = flag("brief");
      out.push(makeRun(root, { id, layer, contest: g.contest, subjects: g.subjects, judge_group: `${layer}-${String(gi).padStart(3, "0")}--${flat(g.contest)}`, lenses, tasks, ...(brief ? { brief } : {}) }, head));
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
const LIG: Record<string, string> = { "\uFB00": "ff", "\uFB01": "fi", "\uFB02": "fl", "\uFB03": "ffi", "\uFB04": "ffl", "\uFB05": "st", "\uFB06": "st" };
export function norm(s: string): string {
  return s
    .normalize("NFC")
    .replace(/\[\[page \d+\]\]/g, " ")
    .replace(/[\uFB00-\uFB06]/g, (c) => LIG[c] ?? c)
    .replace(/[\u00AD\u200B-\u200F\u2060\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
const fold = (s: string) =>
  norm(s)
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
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
/** Cache entries by URL variant (exact, final URL, www/trailing-slash/https/tracking-free forms). */
let cacheIndex: Map<string, string> | undefined;
function variant(u: string): string {
  try {
    const x = new URL(u);
    x.protocol = "https:";
    x.hostname = x.hostname.toLowerCase().replace(/^www\./, "");
    x.hash = "";
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(k)) x.searchParams.delete(k);
    return x.toString().replace(/\/+$/, "");
  } catch {
    return u;
  }
}
function cachedMeta(url: string): (Rec & { file: string }) | undefined {
  const exact = path.join(CACHE, `${keyOf(url)}.json`);
  if (fs.existsSync(exact)) return readJson<Rec & { file: string }>(exact);
  if (!cacheIndex) {
    cacheIndex = new Map();
    if (fs.existsSync(CACHE))
      for (const f of fs.readdirSync(CACHE)) {
        if (!f.endsWith(".json")) continue;
        try {
          const m = readJson<Rec>(path.join(CACHE, f));
          for (const u of [m["url"], m["final_url"]]) if (typeof u === "string") cacheIndex.set(variant(u), path.join(CACHE, f));
        } catch {
          /* a meta being written right now */
        }
      }
  }
  const hit = cacheIndex.get(variant(url));
  return hit ? readJson<Rec & { file: string }>(hit) : undefined;
}
async function textOf(url: string): Promise<{ text: string; blocked: boolean; file: string; note?: string }> {
  let info = cachedMeta(url);
  let note: string | undefined;
  if (!info) {
    note = "was not in the cache (the agent may have read another copy); fetched now";
    info = (await fetchText(url)) as Rec & { file: string };
  }
  return { text: fs.existsSync(info.file) ? fs.readFileSync(info.file, "utf8") : "", blocked: Boolean(info["blocked"]), file: info.file, ...(note ? { note } : {}) };
}
/** The text of a JSON string as it appears inside a serialized record file. */
const inFile = (fileText: string, quote: string) => fileText.includes(JSON.stringify(quote).slice(1, -1));
async function checkRun(run: string) {
  const pkg = loadPkg(run);
  const log = loadLog(run);
  const urls = sourceUrls(pkg, log);
  const failures: Rec[] = [];
  const notes: Rec[] = [];
  let checked = 0;
  const texts = new Map<string, { text: string; blocked: boolean; file: string; n: string; f: string; note?: string }>();
  const finalText = (rel: string) => {
    const f = path.join(pkg.data_dir, rel);
    return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "";
  };
  for (const e of log) {
    if (e.kind === "source") continue;
    for (const c of citationsIn(e.input)) {
      if (c.quote === undefined) {
        // Filings need a locator, not a quote (validate enforces both). Agents never mark citations
        // maintainer-verified or unverified; show any such citation to the judges.
        if (c.status === "verified_by" || c.status === "unverified") notes.push({ seq: e.seq, task: e.task, at: c.at, source: c.source, note: `${c.status} citation written by an agent (agents must quote; keep only if it was already in the record)` });
        continue;
      }
      checked++;
      let problem = "";
      let extra: Rec = {};
      if (/\[\[page \d+\]\]|\[\[post /.test(c.quote)) problem = "the quote contains a page marker from the cached text";
      const url = urls.get(c.source);
      if (!problem && !url) problem = "source not registered";
      if (!problem && url) {
        try {
          if (!texts.has(url)) {
            const t = await textOf(url);
            texts.set(url, { ...t, n: norm(t.text), f: fold(t.text) });
          }
          const t = texts.get(url)!;
          const q = norm(c.quote);
          extra = { url, cached_text: t.file, ...(t.note ? { cache_note: t.note } : {}) };
          if (!q) problem = "empty quote";
          else if (!t.n.includes(q))
            problem = t.blocked ? "source unreadable here (blocked); the quote cannot be confirmed" : t.f.includes(fold(c.quote)) ? "not verbatim: differs in quote marks, dashes, ellipses or capitals; copy the exact characters" : "quote not found in the source text";
        } catch (err) {
          problem = `could not read the source: ${(err as Error).message.split("\n")[0]}`;
        }
      }
      if (!problem) continue;
      // Only what is still in the final file counts: a quote a later write replaced is history, not a problem.
      if (!inFile(finalText(e.file), c.quote)) continue;
      const needle = JSON.stringify(c.quote).slice(1, -1);
      const last = [...log].reverse().find((x) => x.task === e.task && x.file === e.file && JSON.stringify(x.input).includes(needle));
      failures.push({ seq: (last ?? e).seq, task: e.task, file: e.file, at: c.at, source: c.source, quote: c.quote.slice(0, 240), problem, ...extra });
    }
  }
  const seen = new Set<string>();
  const unique = failures.filter((f) => {
    const k = `${String(f["seq"])}|${String(f["at"])}|${String(f["quote"])}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
  return { run, package: pkg.id, entries: log.length, last_seq: log.length ? log[log.length - 1]!.seq : 0, quotes_checked: checked, failures: unique, notes };
}
async function cmdCheck() {
  const runs = positionals().map((r) => path.resolve(r));
  if (!runs.length) die("usage: run.mts check <run>... [--json]");
  const results = [];
  for (const r of runs) results.push(await checkRun(r));
  if (has("json")) console.log(JSON.stringify(results, null, 2));
  else
    for (const r of results) {
      console.log(`${r.package}: ${r.entries} put(s) (last seq ${r.last_seq}), ${r.quotes_checked} quote(s) checked, ${r.failures.length} problem(s)${r.notes.length ? `, ${r.notes.length} note(s)` : ""}`);
      for (const f of r.failures) console.log(`  seq ${String(f["seq"])} ${String(f["task"])} ${String(f["at"])}: ${String(f["problem"])}${f["quote"] ? `\n    "${String(f["quote"])}"` : ""}`);
      for (const n of r.notes) console.log(`  note: seq ${String(n["seq"])} ${String(n["at"])}: ${String(n["note"])}`);
    }
  process.exitCode = results.some((r) => r.failures.length) ? 1 : 0;
}

// ---------------------------------------------------------------------------- integrate
interface Verdict {
  package?: string;
  lens?: string;
  reviewed_through_seq?: number;
  drops: Array<{ seq: number; reason: string }>;
}
/** A verdict file the integrator can trust, or the reason it can't. */
function readVerdict(run: string, pkg: Pkg, lens: string, log: Entry[]): Verdict | string {
  const f = path.join(run, `verdicts-${lens}.json`);
  if (!fs.existsSync(f)) return `no verdicts-${lens}.json`;
  let v: Verdict;
  try {
    v = readJson<Verdict>(f);
  } catch (e) {
    return `verdicts-${lens}.json is not JSON (${(e as Error).message})`;
  }
  if (!v || typeof v !== "object" || !Array.isArray(v.drops)) return `verdicts-${lens}.json has no "drops" list`;
  if (v.package !== undefined && v.package !== pkg.id) return `verdicts-${lens}.json is for ${String(v.package)}, not ${pkg.id}`;
  const seqs = new Set(log.map((e) => e.seq));
  for (const d of v.drops) if (!Number.isInteger(d?.seq) || !seqs.has(d.seq)) return `verdicts-${lens}.json drops seq ${JSON.stringify(d?.seq)}, which is not in the log`;
  const last = log.length ? log[log.length - 1]!.seq : 0;
  if (v.reviewed_through_seq !== undefined) {
    if (v.reviewed_through_seq !== last) return `verdicts-${lens}.json reviewed through seq ${v.reviewed_through_seq} but the log ends at ${last}`;
  } else if (fs.existsSync(path.join(run, "log.jsonl")) && fs.statSync(path.join(run, "log.jsonl")).mtimeMs > fs.statSync(f).mtimeMs) {
    return `verdicts-${lens}.json is older than the log (written before the last puts)`;
  }
  return v;
}
function lock(): () => void {
  const f = path.join(REPO, ".cache", "integrate.lock");
  fs.mkdirSync(path.dirname(f), { recursive: true });
  try {
    fs.writeFileSync(f, String(process.pid), { flag: "wx" });
  } catch {
    const pid = Number(fs.readFileSync(f, "utf8"));
    let alive = false;
    try {
      process.kill(pid, 0);
      alive = true;
    } catch {
      alive = false;
    }
    if (alive) die(`another integrate is running (pid ${pid}); wait for it`);
    fs.writeFileSync(f, String(process.pid));
  }
  return () => fs.rmSync(f, { force: true });
}
/** Writes whose refs need not resolve (validate skips them in agendas and leads). */
const NO_DEPS = new Set<string>(["agenda", "leads"]);
/** A create that meets an existing file of these kinds becomes a merge (sections from several packages). */
const MERGE_ON_EXISTS = new Set<string>(["dossier"]);

function cmdIntegrate() {
  const runs = positionals().map((r) => path.resolve(r));
  const dry = has("dry-run");
  const trailersFile = flag("trailers");
  if (!runs.length || (!dry && !trailersFile)) die("usage: run.mts integrate <run>... --trailers <file> [--dry-run]");
  const trailers = trailersFile ? fs.readFileSync(trailersFile, "utf8").trim() : "";
  const unlock = dry ? () => {} : lock();
  try {
    if (!dry && git("status", "--porcelain", "--", "data")) die("data/ has uncommitted changes; commit or stash them first");
    let head = git("rev-parse", "HEAD");
    const files: FileMap = readDataDir(DATA);
    const today = todayString();
    const base = validateFiles(files, { dataDir: DATA, today });
    if (base.errors) die(`data/ already has ${base.errors} validation error(s); fix them first`);
    const report: Rec[] = [];
    for (const run of runs) {
      const pkg = loadPkg(run);
      const donePath = path.join(run, "integrated.json");
      const prior = fs.existsSync(donePath) ? readJson<{ complete?: boolean; results?: Rec[] }>(donePath) : undefined;
      if (prior?.complete && !dry) {
        report.push({ package: pkg.id, skipped: "already integrated" });
        continue;
      }
      const finished = new Set((prior?.results ?? []).filter((r) => ["committed", "unchanged", "dropped"].includes(String(r["status"]))).map((r) => String(r["task"])));
      const log = loadLog(run);
      const verdicts: Verdict[] = [];
      let notJudged = "";
      for (const l of pkg.lenses) {
        const v = readVerdict(run, pkg, l, log);
        if (typeof v === "string") notJudged ||= v;
        else verdicts.push(v);
      }
      if (notJudged) {
        report.push({ package: pkg.id, skipped: `not judged: ${notJudged}` });
        continue;
      }
      const dropSeq = new Map<number, string>();
      pkg.lenses.forEach((l, i) => {
        for (const d of verdicts[i]!.drops) dropSeq.set(d.seq, `${l}: ${d.reason}`);
      });
      // Dropping one write of a file in a task drops every write of that file in that task.
      const droppedTF = new Set<string>();
      for (const e of log) if (dropSeq.has(e.seq)) droppedTF.add(`${e.task}\u0000${e.file}`);
      const isDropped = (e: Entry) => droppedTF.has(`${e.task}\u0000${e.file}`);
      const createdBy = new Map<string, Entry>();
      for (const e of log) if (e.action === "created" && !isDropped(e) && !createdBy.has(e.file)) createdBy.set(e.file, e);
      const applied = new Set<number>();
      const results: Rec[] = (prior?.results ?? []).filter((r) => finished.has(String(r["task"])));
      const save = (complete: boolean) => {
        if (dry) return;
        const summary = { package: pkg.id, complete, at: new Date().toISOString(), committed: results.filter((r) => r["status"] === "committed").length, failed: results.filter((r) => r["status"] === "failed").length, dropped: results.filter((r) => r["status"] === "dropped").length, results };
        fs.writeFileSync(donePath, JSON.stringify(summary, null, 2) + "\n");
      };
      for (const task of [...new Set(log.map((e) => e.task))]) {
        if (finished.has(task)) continue;
        const own = log.filter((e) => e.task === task && !isDropped(e));
        if (!own.some((e) => e.kind !== "source")) {
          results.push({ task, status: "dropped", why: [...new Set(log.filter((e) => e.task === task).map((e) => dropSeq.get(e.seq)).filter(Boolean))].join(" | ") || "every write was dropped" });
          save(false);
          continue;
        }
        // Creations of sources and organizations that nothing kept in this task cites are left
        // out (no orphans); anything a write needs (a cited record, or the file it merges into)
        // is pulled in from the entry that created it.
        const cited = new Set<string>();
        for (const e of own) if (e.kind !== "source" && !NO_DEPS.has(e.kind)) refsIn(e.input, cited);
        const plan: Entry[] = [];
        const want = (e: Entry) => {
          if (applied.has(e.seq) || plan.includes(e)) return;
          if (!files.has(e.file) && e.action !== "created") {
            const c = createdBy.get(e.file);
            if (c && c !== e) want(c);
          }
          if (!NO_DEPS.has(e.kind)) {
            const deps = new Set<string>();
            refsIn(e.input, deps);
            for (const r of deps) {
              const f = fileOfRef(r);
              const c = f ? createdBy.get(f) : undefined;
              if (c && c !== e && !files.has(c.file)) want(c);
            }
          }
          plan.push(e);
        };
        for (const e of own) {
          if ((e.kind === "source" || e.kind === "organization") && e.action === "created" && !files.has(e.file) && e.ref && !cited.has(e.ref)) continue;
          want(e);
        }
        const written = new Map<string, string | undefined>();
        let fail = "";
        const notes: string[] = [];
        try {
          if (!dry && git("rev-parse", "HEAD") !== head) throw new Error("HEAD moved during integration (another commit landed); stopping");
          for (const e of plan) {
            let mode = e.mode;
            if (e.kind === "agenda" && e.mode === "replace") {
              const atSeed = (() => {
                try {
                  return execFileSync("git", ["-C", REPO, "show", `${pkg.seed_head}:data/${e.file}`], { encoding: "utf8" });
                } catch {
                  return undefined;
                }
              })();
              if (atSeed !== files.get(e.file)) throw new Error(`${e.file} changed since this package was made; its agenda replacement would undo that`);
            }
            let res = put(files, e.kind, e.input, { dataDir: DATA, mode, today: e.date });
            if (res.action === "rejected" && mode === "create" && /File exists/.test(res.message ?? "") && MERGE_ON_EXISTS.has(e.kind)) {
              mode = "merge";
              res = put(files, e.kind, e.input, { dataDir: DATA, mode, today: e.date });
              notes.push(`seq ${e.seq}: merged into the existing ${e.file}`);
            }
            if (res.action === "rejected") {
              if (mode === "create" && REUSABLE.has(e.kind) && /File exists/.test(res.message ?? "")) {
                notes.push(`reused existing ${res.ref ?? res.file}`);
                continue;
              }
              throw new Error(`seq ${e.seq} (${e.kind} ${mode}): ${res.message ?? "rejected"} ${res.problems.map((p) => `${p.pointer} ${p.message}`).join("; ")}`.trim());
            }
            if (res.content === undefined) continue;
            if (!written.has(res.file)) written.set(res.file, files.get(res.file));
            const abs = path.join(DATA, res.file);
            if (!dry && fs.existsSync(abs) && fs.readFileSync(abs, "utf8") !== (files.get(res.file) ?? "")) throw new Error(`${res.file} changed on disk during integration; stopping`);
            files.set(res.file, res.content);
            if (!dry) {
              fs.mkdirSync(path.dirname(abs), { recursive: true });
              fs.writeFileSync(abs, res.content);
            }
          }
          if (written.size) {
            const v = validateFiles(files, { dataDir: DATA, today });
            if (v.errors)
              throw new Error(
                `validate: ${v.problems
                  .filter((p) => p.severity === "error")
                  .slice(0, 5)
                  .map((p) => `${p.file}#${p.pointer} [${p.code}] ${p.message}`)
                  .join(" | ")}`,
              );
          }
        } catch (err) {
          fail = (err as Error).message;
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
          save(false);
          if (/HEAD moved|changed on disk/.test(fail)) {
            report.push({ package: pkg.id, stopped: fail });
            return void console.log(JSON.stringify(report, null, 2));
          }
          continue;
        }
        for (const e of plan) applied.add(e.seq);
        if (!written.size) {
          results.push({ task, status: "unchanged", ...(notes.length ? { notes } : {}) });
          save(false);
          continue;
        }
        let commit = "";
        if (!dry) {
          const subject = pkg.commit_prefix ? `${pkg.commit_prefix}: ${task}` : `research(${task.split("|")[0]}): ${task}`;
          const msgFile = path.join(run, ".commit-msg");
          fs.writeFileSync(msgFile, `${subject}\n\nPackage ${pkg.id} (${pkg.layer}); judged: ${pkg.lenses.join(", ")}.\n\n${trailers}\n`);
          const paths = [...written.keys()].map((r) => path.join("data", r));
          try {
            git("add", "--", ...paths);
            git("commit", "-q", "-F", msgFile, "--", ...paths);
          } catch (err) {
            // Unstage and restore this task's files so data/ stays at the last commit.
            try {
              git("reset", "-q", "--", ...paths);
            } catch {
              /* nothing staged */
            }
            for (const [rel, old] of written) {
              if (old === undefined) {
                files.delete(rel);
                fs.rmSync(path.join(DATA, rel), { force: true });
              } else {
                files.set(rel, old);
                fs.writeFileSync(path.join(DATA, rel), old);
              }
            }
            results.push({ task, status: "failed", why: `git commit failed: ${(err as Error).message.split("\n")[0]}` });
            save(false);
            report.push({ package: pkg.id, stopped: "git commit failed" });
            return void console.log(JSON.stringify(report, null, 2));
          } finally {
            fs.rmSync(msgFile, { force: true });
          }
          head = git("rev-parse", "HEAD");
          commit = head.slice(0, 7);
        }
        results.push({ task, status: dry ? "would commit" : "committed", files: [...written.keys()], ...(commit ? { commit } : {}), ...(notes.length ? { notes } : {}) });
        save(false);
      }
      save(true);
      report.push({ package: pkg.id, committed: results.filter((r) => r["status"] === "committed" || r["status"] === "would commit").length, failed: results.filter((r) => r["status"] === "failed").length, dropped: results.filter((r) => r["status"] === "dropped").length, results });
    }
    console.log(JSON.stringify(report, null, 2));
  } finally {
    unlock();
  }
}

// ---------------------------------------------------------------------------- verdicts
/**
 * run.mts verdicts <workflow journal.jsonl> --roots <dir,...>
 * Writes each judge's schema-checked drops (from the workflow journal) as the run's
 * verdicts-<lens>.json, stamped with the package and the log's last seq at that moment.
 */
function cmdVerdicts() {
  const [journal] = positionals();
  const roots = (flag("roots") ?? die("--roots <dir,...> is required")).split(",").map((r) => path.resolve(r));
  if (!journal) die("usage: run.mts verdicts <journal.jsonl> --roots <dir,...>");
  const labels = new Map<string, string>();
  const written: string[] = [];
  const problems: string[] = [];
  for (const line of fs.readFileSync(journal, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const j = JSON.parse(line) as Rec;
    if (j["type"] === "started") labels.set(String(j["key"]), String(j["label"] ?? ""));
    if (j["type"] !== "result") continue;
    const label = labels.get(String(j["key"])) ?? "";
    const m = /^judge:([a-z]+):/.exec(label);
    if (!m) continue;
    const lens = m[1]!;
    const res = j["result"] as { runs?: Array<{ package: string; drops?: Array<{ seq: number; reason: string }> }> } | null;
    if (!res || !Array.isArray(res.runs)) {
      problems.push(`${label}: no result`);
      continue;
    }
    for (const r of res.runs) {
      // The same package id can exist under several roots (a re-packaged copy); prefer the one with writes.
      const candidates = roots.map((root) => path.join(root, r.package)).filter((d) => fs.existsSync(path.join(d, "pkg.json")));
      const run = candidates.find((d) => loadLog(d).length > 0) ?? candidates[0];
      if (candidates.length > 1) problems.push(`${label}: ${r.package} exists under ${candidates.length} roots; used ${run}`);
      if (!run) {
        problems.push(`${label}: no run directory for ${r.package}`);
        continue;
      }
      const log = loadLog(run);
      const last = log.length ? log[log.length - 1]!.seq : 0;
      let drops = (r.drops ?? []).map((d) => ({ seq: Number(d.seq), reason: String(d.reason ?? "") }));
      // A second judge of the same log adds its drops to the first one's (any judge's drop wins).
      const prevFile = path.join(run, `verdicts-${lens}.json`);
      if (fs.existsSync(prevFile)) {
        try {
          const prev = readJson<Verdict>(prevFile);
          if (prev.package === r.package && prev.reviewed_through_seq === last && Array.isArray(prev.drops))
            for (const d of prev.drops) if (!drops.some((x) => x.seq === d.seq)) drops = [...drops, d];
        } catch {
          /* replaced below */
        }
      }
      const bad = drops.filter((d) => !log.some((e) => e.seq === d.seq));
      if (bad.length) problems.push(`${label}: ${r.package} drops unknown seq(s) ${bad.map((d) => d.seq).join(", ")}`);
      fs.writeFileSync(path.join(run, `verdicts-${lens}.json`), JSON.stringify({ package: r.package, lens, reviewed_through_seq: last, drops, from: "workflow journal" }, null, 2) + "\n");
      written.push(`${r.package} ${lens}: ${drops.length} drop(s)`);
    }
  }
  console.log(JSON.stringify({ written, problems }, null, 2));
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
  case "verdicts":
    cmdVerdicts();
    break;
  default:
    die("usage: run.mts <packages|put|check|integrate|status> ... (see the header of tools/research/run.mts)");
}
