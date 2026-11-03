// Minimal types for topojson-server (ISC), used only by src/districts.ts.
declare module "topojson-server" {
  export function topology(objects: Record<string, unknown>, quantization?: number): unknown;
}
