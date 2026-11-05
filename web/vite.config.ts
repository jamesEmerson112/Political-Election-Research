import { execFileSync } from "node:child_process";
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
 * `virtual:datasets` — the draft dataset (data/) and the fictional demo
 * (tests/fixtures/valid/data), each bundled by the same library the CLI uses:
 * records plus validation, research queue, coverage and funding rollups.
 */
function datasets(): Plugin {
  const id = "virtual:datasets";
  const resolved = "\0" + id;
  const watched = [DEFAULT_DATA_DIR, FIXTURE_DIR];
  return {
    name: "datasets",
    resolveId: (source) => (source === id ? resolved : undefined),
    load(moduleId) {
      if (moduleId !== resolved) return undefined;
      const draft = buildBundle(DEFAULT_DATA_DIR, { label: "Draft data", fictional: false, today: todayString() });
      const demo = buildBundle(FIXTURE_DIR, { label: "Fictional demo", fictional: true, today: FIXTURE_TODAY });
      const build = { sha: buildSha(), date: todayString() };
      return `export const draft = ${JSON.stringify(draft)};\nexport const demo = ${JSON.stringify(demo)};\nexport const build = ${JSON.stringify(build)};\n`;
    },
    configureServer(server) {
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
