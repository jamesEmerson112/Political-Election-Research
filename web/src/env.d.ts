/// <reference types="svelte" />
/// <reference types="vite/client" />
declare module "virtual:datasets" {
  import type { Bundle } from "../../src/bundle";
  export const draft: Bundle;
  export const demo: Bundle;
}
