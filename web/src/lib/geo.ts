/**
 * Location -> district lookup for "My ballot", entirely in the browser.
 *
 * The district file (geo/ca-2026-districts.json, built by
 * `npm run import:districts`) holds simplified district outlines as a
 * shared-arc topology plus a ZIP (ZCTA) table. Nothing here makes a network
 * request; coordinates and ZIP codes never leave the page.
 *
 * Honesty rules:
 * - A point within `margin_m` (simplification error) plus the device's
 *   reported accuracy of a district boundary returns every district it could
 *   be in, not just the one whose simplified outline contains it.
 * - A ZIP that spans districts returns all of them, with each one's share of
 *   the ZIP's 2020 housing units.
 *
 * Pure functions, no imports: shared by the web app, the importer's
 * verification and the unit tests.
 */

export type Kind = "cd" | "boe" | "sd" | "ad";
export const KINDS: Kind[] = ["cd", "boe", "sd", "ad"];

export interface DistrictFile {
  format: "ca-districts/1";
  state: string;
  election: string;
  note: string;
  /** Douglas–Peucker tolerance used on every arc, meters. */
  tolerance_m: number;
  /** Largest distance between a stored outline and the official one, meters. */
  margin_m: number;
  transform: { scale: [number, number]; translate: [number, number] };
  /** Layers present in the ZIP table, in row order. */
  zip_layers: Kind[];
  /**
   * kind -> district number -> rings. A ring is a list of arc indexes (~i means
   * arc i reversed), delta-encoded as text (see decodeInts).
   */
  layers: Partial<Record<Kind, { label: string; districts: Record<string, string[]> }>>;
  /** Quantized, delta-encoded arcs [x0, y0, dx1, dy1, ...], each as text (see decodeInts). */
  arcs: string[];
  /** See encodeZipTable in src/districts.ts. */
  zips: string;
}

interface DecodedDistrict {
  n: number;
  /** Each ring as [lon0, lat0, lon1, lat1, ...]. */
  rings: Float64Array[];
  bbox: [number, number, number, number];
}

export interface Decoded {
  marginM: number;
  layers: Partial<Record<Kind, DecodedDistrict[]>>;
}

/** Inverse of encodeInts (src/districts.ts): Google polyline-style integer text. */
export function decodeInts(s: string): number[] {
  const out: number[] = [];
  let shift = 0;
  let z = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i) - 63;
    z |= (c & 0x1f) << shift;
    if (c & 0x20) shift += 5;
    else {
      out.push(z & 1 ? ~(z >>> 1) : z >>> 1);
      z = 0;
      shift = 0;
    }
  }
  return out;
}

/** Arcs to absolute lon/lat. */
function decodeArcs(f: DistrictFile): Float64Array[] {
  const [sx, sy] = f.transform.scale;
  const [tx, ty] = f.transform.translate;
  return f.arcs.map((text) => {
    const a = decodeInts(text);
    const out = new Float64Array(a.length);
    let x = 0;
    let y = 0;
    for (let i = 0; i < a.length; i += 2) {
      x += a[i]!;
      y += a[i + 1]!;
      out[i] = x * sx + tx;
      out[i + 1] = y * sy + ty;
    }
    return out;
  });
}

function ringFromArcs(arcs: Float64Array[], refs: number[]): Float64Array {
  const pts: number[] = [];
  for (const ref of refs) {
    const arc = arcs[ref < 0 ? ~ref : ref]!;
    const n = arc.length / 2;
    for (let k = 0; k < n; k++) {
      const i = ref < 0 ? n - 1 - k : k;
      // Consecutive arcs share their joining point; keep it once.
      if (k === 0 && pts.length) continue;
      pts.push(arc[2 * i]!, arc[2 * i + 1]!);
    }
  }
  return Float64Array.from(pts);
}

export function decode(f: DistrictFile): Decoded {
  const arcs = decodeArcs(f);
  const layers: Decoded["layers"] = {};
  for (const kind of KINDS) {
    const l = f.layers[kind];
    if (!l) continue;
    layers[kind] = Object.entries(l.districts)
      .map(([n, rings]) => {
        const rs = rings.map((text) => {
          let ref = 0;
          return ringFromArcs(
            arcs,
            decodeInts(text).map((d, i) => (ref = i === 0 ? d : ref + d)),
          );
        });
        const bbox: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
        for (const r of rs) {
          for (let i = 0; i < r.length; i += 2) {
            if (r[i]! < bbox[0]) bbox[0] = r[i]!;
            if (r[i + 1]! < bbox[1]) bbox[1] = r[i + 1]!;
            if (r[i]! > bbox[2]) bbox[2] = r[i]!;
            if (r[i + 1]! > bbox[3]) bbox[3] = r[i + 1]!;
          }
        }
        return { n: Number(n), rings: rs, bbox };
      })
      .sort((a, b) => a.n - b.n);
  }
  return { marginM: f.margin_m, layers };
}

const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LON_EQ = 111320;

/** Even-odd rule over every ring of a district (holes and islands included). */
export function insideRings(rings: Float64Array[], lon: number, lat: number): boolean {
  let inside = false;
  for (const r of rings) {
    const n = r.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = r[2 * i]!;
      const yi = r[2 * i + 1]!;
      const xj = r[2 * j]!;
      const yj = r[2 * j + 1]!;
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** Shortest distance in meters from a point to any ring edge (flat-earth approximation around the point). */
export function distanceToRings(rings: Float64Array[], lon: number, lat: number): number {
  const kx = Math.cos((lat * Math.PI) / 180) * M_PER_DEG_LON_EQ;
  let best = Infinity;
  for (const r of rings) {
    const n = r.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ax = (r[2 * j]! - lon) * kx;
      const ay = (r[2 * j + 1]! - lat) * M_PER_DEG_LAT;
      const bx = (r[2 * i]! - lon) * kx;
      const by = (r[2 * i + 1]! - lat) * M_PER_DEG_LAT;
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      let t = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(ax + t * dx, ay + t * dy);
      if (d < best) best = d;
    }
  }
  return best;
}

export interface LayerHit {
  /** Districts whose stored outline contains the point. */
  inside: number[];
  /** Every district the point could be in: inside, or within the margin of its boundary. */
  possible: number[];
}

export interface PointResult {
  /** Margin used: stored-outline error plus the device's reported accuracy, meters. */
  marginM: number;
  /** False when no congressional district is within the margin (the point is outside California). */
  inState: boolean;
  layers: Partial<Record<Kind, LayerHit>>;
}

/**
 * Districts for a point. `accuracyM` is the device's reported accuracy
 * (GeolocationCoordinates.accuracy); it widens the margin.
 */
export function lookupPoint(d: Decoded, lon: number, lat: number, accuracyM = 0): PointResult {
  const marginM = d.marginM + Math.max(0, accuracyM || 0);
  const padLat = marginM / M_PER_DEG_LAT;
  const padLon = marginM / (Math.cos((lat * Math.PI) / 180) * M_PER_DEG_LON_EQ);
  const layers: PointResult["layers"] = {};
  for (const kind of KINDS) {
    const ds = d.layers[kind];
    if (!ds) continue;
    const inside: number[] = [];
    const possible: number[] = [];
    for (const dist of ds) {
      const [x0, y0, x1, y1] = dist.bbox;
      if (lon < x0 - padLon || lon > x1 + padLon || lat < y0 - padLat || lat > y1 + padLat) continue;
      if (insideRings(dist.rings, lon, lat)) {
        inside.push(dist.n);
        possible.push(dist.n);
      } else if (distanceToRings(dist.rings, lon, lat) <= marginM) possible.push(dist.n);
    }
    layers[kind] = { inside, possible };
  }
  return { marginM, inState: (layers.cd?.possible.length ?? 0) > 0, layers };
}

export interface ZipDistrict {
  n: number;
  /** Share of the ZIP's 2020 housing units in this district, whole percent; null when the ZIP is entirely in one district. */
  share: number | null;
}

export interface ZipResult {
  zip: string;
  layers: Partial<Record<Kind, ZipDistrict[]>>;
  /** The ZCTA also covers land outside the state; only its in-state part is described. */
  crossesState: boolean;
}

const CODE_KIND: Record<string, Kind> = { c: "cd", b: "boe", s: "sd", a: "ad" };

/** Districts for a 5-digit ZIP code (via its ZCTA), or null when the table has no such ZCTA. */
export function lookupZip(f: Pick<DistrictFile, "zips">, zip: string): ZipResult | null {
  if (!/^\d{5}$/.test(zip)) return null;
  let at: number;
  if (f.zips.startsWith(`${zip}:`)) at = 0;
  else {
    const i = f.zips.indexOf(` ${zip}:`);
    if (i < 0) return null;
    at = i + 1;
  }
  const end = f.zips.indexOf(" ", at);
  const row = f.zips.slice(at + 6, end < 0 ? undefined : end);
  const layers: ZipResult["layers"] = {};
  let crossesState = false;
  for (const part of row.split(";")) {
    if (part === "x") crossesState = true;
    const kind = CODE_KIND[part.charAt(0)];
    if (!kind) continue;
    const entries = part.slice(1).split(",");
    layers[kind] = entries.map((e) => {
      const [n, p] = e.split("/");
      return { n: Number(n), share: entries.length === 1 || p === undefined ? null : Number(p) };
    });
  }
  return { zip, layers, crossesState };
}
