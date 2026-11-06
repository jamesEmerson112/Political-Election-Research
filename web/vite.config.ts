import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { buildBundle } from "../src/bundle.ts";
import { DEFAULT_DATA_DIR, REPO_ROOT } from "../src/paths.ts";
import { todayString } from "../src/validate.ts";

const WEB_ROOT = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(REPO_ROOT, "tests", "fixtures", "valid", "data");
const FIXTURE_TODAY = "2031-03-01";

/** The commit this build is from: Vercel's build variable, else git, else null (shown on the About page). */
function buildSha(): string | null {
  const env = process.env["VERCEL_GIT_COMMIT_SHA"];
  if (env) return env.slice(0, 7);
  try {
    return execFileSync("git", ["rev-parse", "--short=7", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

/**
 * Load on demand (first load on a slow phone was ~6.4 s, 2.4 s of it parsing the 6.4 MB page): the research queue's
 * tasks and the unverified leads' texts, about a third of the data, leave the page and become files the pages that
 * use them fetch (contest and measure pages, the research queue). The page keeps their counts, and the validation
 * problems only as counts by rule (the About page shows nothing more). Data is embedded as JSON strings: browsers
 * parse JSON.parse("...") faster than the same object as script.
 */
type Bundle = ReturnType<typeof buildBundle>;
/** What the Overview, Measures and About pages never read: candidates' full records, positions, money, sources, dossiers. */
const RECORD_KEYS = ["people", "organizations", "positions", "relationships", "sources", "dossiers", "bills", "rollups"] as const;
function splitBundle(b: Bundle, name: string): { core: Bundle & { lazy: Record<string, unknown> }; files: Map<string, string> } {
  const files = new Map<string, string>();
  const paths: Record<string, string> = {};
  const parts: Record<string, unknown> = {
    tasks: b.tasks,
    leads: b.leads,
    records: Object.fromEntries(RECORD_KEYS.map((k) => [k, b[k]])),
  };
  for (const [part, value] of Object.entries(parts)) {
    const json = JSON.stringify(value);
    const file = `data/${name}-${part}.${crypto.createHash("sha256").update(json).digest("hex").slice(0, 10)}.json`;
    files.set(file, json);
    paths[part] = file;
  }
  const count = (keys: string[]) => keys.reduce<Record<string, number>>((acc, k) => ((acc[k] = (acc[k] ?? 0) + 1), acc), {});
  // Citations as Index.claimCount counts them: every "source" key in these records.
  let citations = 0;
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") for (const [k, c] of Object.entries(v)) k === "source" && typeof c === "string" ? citations++ : walk(c);
  };
  walk([b.people, b.organizations, b.contests, b.elections, b.positions, b.relationships]);
  const open = b.tasks.filter((t) => !t.blocked_by);
  const core = {
    ...b,
    tasks: [],
    leads: [],
    // Names only, for lists; the full records come with the records part.
    people: b.people.map((p) => ({ id: p["id"], name: p["name"] })),
    organizations: [],
    positions: [],
    relationships: [],
    sources: [],
    dossiers: [],
    bills: [],
    rollups: {},
    validation: { ...b.validation, problems: [] },
    lazy: {
      ...paths,
      openTasks: count(open.map((t) => t.contest)),
      openTaskTotal: open.length,
      leadCounts: Object.fromEntries(b.leads.map((l) => [String(l["contest"]), ((l["items"] as unknown[]) ?? []).length])),
      problemCounts: count(b.validation.problems.map((p) => p.code)),
      counts: { people: b.people.length, sources: b.sources.length, citations },
    },
  };
  return { core, files };
}

/**
 * `virtual:datasets` — the draft dataset (data/) and the fictional demo
 * (tests/fixtures/valid/data), each bundled by the same library the CLI uses:
 * records plus validation, research queue, coverage and funding rollups.
 * The draft's on-demand parts are written next to the page (build) or served from memory (dev).
 */
function datasets(): Plugin {
  const id = "virtual:datasets";
  const resolved = "\0" + id;
  const watched = [DEFAULT_DATA_DIR, FIXTURE_DIR];
  let serving = false;
  let devFiles = new Map<string, string>();
  /** The draft's part files, for the early fetch in the page head. */
  let partPaths: Record<string, string> = {};
  return {
    name: "datasets",
    configResolved(config) {
      serving = config.command === "serve";
    },
    resolveId: (source) => (source === id ? resolved : undefined),
    load(moduleId) {
      if (moduleId !== resolved) return undefined;
      const { core: draft, files } = splitBundle(buildBundle(DEFAULT_DATA_DIR, { label: "Draft data", fictional: false, today: todayString() }), "draft");
      const demo = buildBundle(FIXTURE_DIR, { label: "Fictional demo", fictional: true, today: FIXTURE_TODAY });
      const build = { sha: buildSha(), date: todayString() };
      partPaths = Object.fromEntries([...files.keys()].map((f) => [f.replace(/^data\/draft-(\w+)\..*$/, "$1"), f]));
      // District outlines for My ballot (geo/): files too, fetched on the first ZIP or location lookup.
      const geo: Record<string, string> = {};
      for (const st of ["ca", "nv"]) {
        const text = fs.readFileSync(path.join(REPO_ROOT, "geo", `${st}-2026-districts.json`), "utf8");
        const file = `data/${st}-2026-districts.${crypto.createHash("sha256").update(text).digest("hex").slice(0, 10)}.json`;
        files.set(file, text);
        geo[st] = file;
      }
      if (serving) devFiles = files;
      else for (const [fileName, source] of files) this.emitFile({ type: "asset", fileName, source });
      const parsed = (v: unknown) => `JSON.parse(${JSON.stringify(JSON.stringify(v))})`;
      return `export const draft = ${parsed(draft)};\nexport const demo = ${parsed(demo)};\nexport const build = ${JSON.stringify(build)};\nexport const geoFiles = ${JSON.stringify(geo)};\n`;
    },
    /**
     * Opening a contest page (or Issues, Sources, Try your ballot) directly: start fetching its parts before the page's
     * script has even been parsed, so the download overlaps the parsing. lib/parts.svelte.ts picks the fetches up.
     */
    transformIndexHtml: {
      order: "post",
      handler: () => [
        {
          tag: "script",
          injectTo: "head-prepend",
          children:
            `(function(){try{if(localStorage.getItem("per-dataset")==="demo")return}catch(e){}` +
            `var h=decodeURIComponent(location.hash.slice(1)),P=${JSON.stringify(partPaths)},w=/^c-/.test(h)?["records","leads"]:/^queue$/.test(h)?["tasks"]:/^(issues|sources|trial)$/.test(h)?["records"]:[];` +
            `var o=window.__PREFETCH__={};w.forEach(function(k){if(!P[k])return;o[P[k]]=fetch(P[k]).then(function(r){return r.ok?r.json():Promise.reject(r.status)});o[P[k]].catch(function(){})})})();`,
        },
      ],
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = devFiles.get(decodeURIComponent((req.url ?? "").split("?")[0]!.replace(/^\//, "")));
        if (!file) return next();
        res.setHeader("Content-Type", "application/json");
        res.end(file);
      });
      server.watcher.add(watched);
      server.watcher.on("all", (_event, file) => {
        if (!watched.some((d) => file.startsWith(d))) return;
        const mod = server.moduleGraph.getModuleById(resolved);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: "full-reload" });
      });
    },
  };
}

export default defineConfig({
  root: WEB_ROOT,
  plugins: [datasets(), svelte({ preprocess: vitePreprocess(), configFile: false }), viteSingleFile()],
  build: { outDir: path.join(REPO_ROOT, "dist", "web"), emptyOutDir: true },
  // geo/ (district outlines for My ballot) lives outside the web root.
  server: { fs: { allow: [REPO_ROOT] } },
});
