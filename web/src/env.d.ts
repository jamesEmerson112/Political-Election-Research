/// <reference types="svelte" />
/// <reference types="vite/client" />
declare module "virtual:datasets" {
  import type { Bundle } from "../../src/bundle";
  /** The draft without its on-demand parts (see web/vite.config.ts and web/src/lib/parts.svelte.ts). */
  export const draft: Bundle & { lazy?: import("./lib/data").Lazy };
  export const demo: Bundle & { lazy?: import("./lib/data").Lazy };
  /** My ballot's district files (geo/), fetched on the first lookup. */
  export const geoFiles: Record<"ca" | "nv", string>;
  /** The commit (7 characters, or null) and the date of this build. */
  export const build: { sha: string | null; date: string };
}
