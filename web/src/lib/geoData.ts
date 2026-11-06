/**
 * Loads a state's district file only when a ZIP or location lookup is first
 * used: a file next to the page (web/vite.config.ts), fetched whole and then
 * searched here. No network request carries the user's input: the ZIP code or
 * location never leaves this page.
 */
import { geoFiles } from "virtual:datasets";
import type { BallotState } from "./ballot";
import { decode, type Decoded, type DistrictFile } from "./geo";

export interface Districts {
  file: DistrictFile;
  decoded: Decoded;
}

const fetchJson = (url: string): Promise<{ default?: unknown }> => {
  const inline = (globalThis as { __PARTS__?: Record<string, unknown> }).__PARTS__?.[url];
  if (inline !== undefined) return Promise.resolve({ default: inline });
  return fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${url}: HTTP ${r.status}`)))).then((v) => ({ default: v }));
};
const FILES: Record<BallotState, () => Promise<{ default?: unknown }>> = {
  ca: () => fetchJson(geoFiles.ca),
  nv: () => fetchJson(geoFiles.nv),
};
const loading: Partial<Record<BallotState, Promise<Districts>>> = {};

export function loadDistricts(st: BallotState = "ca"): Promise<Districts> {
  loading[st] ??= FILES[st]()
    .then((m) => {
      const file = (m.default ?? m) as unknown as DistrictFile;
      return { file, decoded: decode(file) };
    })
    .catch((e: unknown) => {
      delete loading[st];
      throw e;
    });
  return loading[st];
}

/** Nevada's ZIP codes (889xx–898xx); every other 5-digit ZIP is looked up in California's table. */
export function stateOfZip(zip: string): BallotState {
  return /^8(89|9[0-8])\d\d$/.test(zip) ? "nv" : "ca";
}
