/**
 * Loads a state's district file only when a ZIP or location lookup is first
 * used. (In the single-file build the data is inlined, but it is parsed and
 * decoded on demand.) No network request carries the user's input: the files
 * are part of the site.
 */
import type { BallotState } from "./ballot";
import { decode, type Decoded, type DistrictFile } from "./geo";

export interface Districts {
  file: DistrictFile;
  decoded: Decoded;
}

const FILES: Record<BallotState, () => Promise<{ default?: unknown }>> = {
  ca: () => import("../../../geo/ca-2026-districts.json"),
  nv: () => import("../../../geo/nv-2026-districts.json"),
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
