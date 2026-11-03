/**
 * Loads the district file only when a ZIP or location lookup is first used.
 * (In the single-file build the data is inlined, but it is parsed and decoded
 * on demand.) No network request carries the user's input: the file is part
 * of the site.
 */
import { decode, type Decoded, type DistrictFile } from "./geo";

export interface Districts {
  file: DistrictFile;
  decoded: Decoded;
}

let loading: Promise<Districts> | null = null;

export function loadDistricts(): Promise<Districts> {
  loading ??= import("../../../geo/ca-2026-districts.json")
    .then((m) => {
      const file = (m.default ?? m) as unknown as DistrictFile;
      return { file, decoded: decode(file) };
    })
    .catch((e: unknown) => {
      loading = null;
      throw e;
    });
  return loading;
}
