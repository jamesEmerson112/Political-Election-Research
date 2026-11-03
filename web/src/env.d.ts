/// <reference types="svelte" />
/// <reference types="vite/client" />
declare module "virtual:datasets" {
  import type { Bundle } from "../../src/bundle";
  export const draft: Bundle;
  export const demo: Bundle;
  /** The commit (7 characters, or null) and the date of this build. */
  export const build: { sha: string | null; date: string };
}
