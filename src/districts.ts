/**
 * Helpers for `npm run import:districts`: read the Census files (zip,
 * shapefile, dBASE, block equivalency and relationship text), simplify the
 * district shapes on a shared-arc topology, and encode the compact file the
 * site's "My ballot" lookup reads (geo/ca-2026-districts.json).
 *
 * Everything here is deterministic: the same input bytes give the same output
 * bytes. No clocks, no randomness, no locale-dependent formatting.
 */
import zlib from "node:zlib";
import { topology } from "topojson-server";
import type { DistrictFile, Kind } from "../web/src/lib/geo.js";

// ---------------------------------------------------------------- zip

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  localOffset: number;
}

/** Central directory of a zip archive (no zip64, no encryption). */
export function zipEntries(buf: Buffer): Map<string, ZipEntry> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip archive (no end of central directory)");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, ZipEntry>();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("corrupt zip central directory");
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    out.set(name, {
      name,
      method: buf.readUInt16LE(p + 10),
      compressedSize: buf.readUInt32LE(p + 20),
      size: buf.readUInt32LE(p + 24),
      localOffset: buf.readUInt32LE(p + 42),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

export function zipRead(buf: Buffer, e: ZipEntry): Buffer {
  const p = e.localOffset;
  if (buf.readUInt32LE(p) !== 0x04034b50) throw new Error(`corrupt zip local header: ${e.name}`);
  const start = p + 30 + buf.readUInt16LE(p + 26) + buf.readUInt16LE(p + 28);
  const data = buf.subarray(start, start + e.compressedSize);
  if (e.method === 0) return Buffer.from(data);
  if (e.method === 8) return zlib.inflateRawSync(data);
  throw new Error(`unsupported zip compression method ${e.method}: ${e.name}`);
}

/** The single entry whose name matches `re`. */
export function zipFind(buf: Buffer, re: RegExp): Buffer {
  const hits = [...zipEntries(buf).values()].filter((e) => re.test(e.name));
  if (hits.length !== 1) throw new Error(`expected one zip entry matching ${re}, found ${hits.length}`);
  return zipRead(buf, hits[0]!);
}

// ---------------------------------------------------------------- text

/** Calls fn for every line (without CR/LF) that starts with `prefix`. Avoids decoding other lines. */
export function eachLine(buf: Buffer, prefix: string, fn: (line: string) => void): void {
  const pre = Buffer.from(prefix, "latin1");
  let start = 0;
  // Skip a UTF-8 byte order mark.
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) start = 3;
  while (start < buf.length) {
    let end = buf.indexOf(10, start);
    if (end < 0) end = buf.length;
    if (end - start >= pre.length && buf.compare(pre, 0, pre.length, start, start + pre.length) === 0) {
      let e = end;
      if (e > start && buf[e - 1] === 13) e--;
      fn(buf.toString("latin1", start, e));
    }
    start = end + 1;
  }
}

/**
 * Block equivalency file (Census BEF: GEOID,...,<district>). Returns block
 * GEOID -> district number for blocks of one state. Non-numeric district
 * codes (e.g. "ZZ", unassigned water) are skipped.
 */
export function parseBef(buf: Buffer, stateFips: string): Map<string, number> {
  const out = new Map<string, number>();
  eachLine(buf, stateFips, (line) => {
    const cells = line.split(/[,|]/);
    const geoid = cells[0]!;
    const d = cells[cells.length - 1]!.trim();
    if (geoid.length === 15 && /^\d+$/.test(d)) out.set(geoid, Number(d));
  });
  return out;
}

// ---------------------------------------------------------------- dBASE / shapefile

/** Selected columns of a dBASE (.dbf) table, as trimmed strings. */
export function readDbf(buf: Buffer, names: string[]): Record<string, string[]> {
  const n = buf.readUInt32LE(4);
  const headerLen = buf.readUInt16LE(8);
  const recordLen = buf.readUInt16LE(10);
  const fields: Array<{ name: string; offset: number; len: number }> = [];
  let off = 1; // deletion flag
  for (let p = 32; buf[p] !== 0x0d && p < headerLen; p += 32) {
    const raw = buf.toString("latin1", p, p + 11);
    const name = raw.slice(0, raw.indexOf("\0") < 0 ? 11 : raw.indexOf("\0"));
    const len = buf[p + 16]!;
    fields.push({ name, offset: off, len });
    off += len;
  }
  const out: Record<string, string[]> = {};
  for (const name of names) {
    const f = fields.find((x) => x.name === name);
    if (!f) throw new Error(`dbf has no field ${name} (has ${fields.map((x) => x.name).join(", ")})`);
    const col: string[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const s = headerLen + i * recordLen + f.offset;
      col[i] = buf.toString("latin1", s, s + f.len).trim();
    }
    out[name] = col;
  }
  return out;
}

export type Ring = Array<[number, number]>;

/** Polygon records of an ESRI shapefile (.shp): record -> rings -> [x, y]. */
export function readShpPolygons(buf: Buffer): Ring[][] {
  const out: Ring[][] = [];
  let p = 100;
  while (p + 8 <= buf.length) {
    const contentLen = buf.readInt32BE(p + 4) * 2;
    const c = p + 8;
    const type = buf.readInt32LE(c);
    if (type === 0) out.push([]);
    else if (type === 5 || type === 15 || type === 25) {
      const numParts = buf.readInt32LE(c + 36);
      const numPoints = buf.readInt32LE(c + 40);
      const parts: number[] = [];
      for (let i = 0; i < numParts; i++) parts.push(buf.readInt32LE(c + 44 + i * 4));
      const pts = c + 44 + numParts * 4;
      const rings: Ring[] = [];
      for (let i = 0; i < numParts; i++) {
        const a = parts[i]!;
        const b = i + 1 < numParts ? parts[i + 1]! : numPoints;
        const ring: Ring = [];
        for (let k = a; k < b; k++) ring.push([buf.readDoubleLE(pts + k * 16), buf.readDoubleLE(pts + k * 16 + 8)]);
        rings.push(ring);
      }
      out.push(rings);
    } else throw new Error(`unsupported shape type ${type} (polygons only)`);
    p = c + contentLen;
  }
  return out;
}

/** True when a .prj describes geographic (longitude/latitude) coordinates. */
export function isGeographicPrj(prj: string): boolean {
  return /^\s*GEOGCS\[/.test(prj);
}

export interface DistrictShape {
  n: number;
  rings: Ring[];
}

export interface ShapeOptions {
  /** Keep only records whose fields equal these values (e.g. { STATEFP: "32" }). */
  where?: Record<string, string>;
  /** Number every kept record as this district (e.g. one city as district 1). */
  as?: number;
}

/**
 * District shapes from a zipped shapefile: records grouped by the numeric
 * value of `field` (records with a non-numeric or out-of-range value are
 * dropped), in district order.
 */
export function shapesFromZip(zip: Buffer, field: string, max: number, opts: ShapeOptions = {}): DistrictShape[] {
  const prj = zipFind(zip, /\.prj$/i).toString("latin1");
  if (!isGeographicPrj(prj)) {
    throw new Error("shapefile is projected; convert it to longitude/latitude (NAD83 or WGS84) first, e.g. mapshaper -proj wgs84");
  }
  const shp = readShpPolygons(zipFind(zip, /\.shp$/i));
  const where = Object.entries(opts.where ?? {});
  const cols = readDbf(zipFind(zip, /\.dbf$/i), [...new Set([field, ...where.map(([k]) => k)])]);
  const col = cols[field]!;
  if (col.length !== shp.length) throw new Error(`.shp has ${shp.length} records but .dbf has ${col.length}`);
  const by = new Map<number, Ring[]>();
  shp.forEach((rings, i) => {
    if (where.some(([k, v]) => cols[k]![i] !== v)) return;
    const n = opts.as ?? Number(col[i]);
    if (!Number.isInteger(n) || n < 1 || n > max) return;
    by.set(n, [...(by.get(n) ?? []), ...rings]);
  });
  return [...by.entries()].sort(([a], [b]) => a - b).map(([n, rings]) => ({ n, rings }));
}

// ---------------------------------------------------------------- simplification

const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LON_EQ = 111320;

/**
 * Douglas–Peucker on one arc, distances in meters on a local equirectangular
 * projection. Endpoints always stay; every dropped point is within `tolM` of
 * the kept line. A closed arc (a ring with no junctions) keeps at least 4
 * points so it remains a polygon.
 */
export function simplifyArc(arc: Ring, tolM: number): Ring {
  if (arc.length <= 2 || tolM <= 0) return arc.slice();
  const lat0 = (arc[0]![1] + arc[arc.length - 1]![1]) / 2;
  const kx = Math.cos((lat0 * Math.PI) / 180) * M_PER_DEG_LON_EQ;
  const xs = arc.map((p) => p[0] * kx);
  const ys = arc.map((p) => p[1] * M_PER_DEG_LAT);
  const keep = new Uint8Array(arc.length);
  const last = arc.length - 1;
  keep[0] = 1;
  keep[last] = 1;
  const closed = xs[0] === xs[last] && ys[0] === ys[last];
  const stack: Array<[number, number]> = [];
  if (closed) {
    // Split a ring at the point farthest from its start.
    let far = 1;
    let best = -1;
    for (let i = 1; i < last; i++) {
      const d = (xs[i]! - xs[0]!) ** 2 + (ys[i]! - ys[0]!) ** 2;
      if (d > best) {
        best = d;
        far = i;
      }
    }
    keep[far] = 1;
    stack.push([0, far], [far, last]);
  } else stack.push([0, last]);
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let idx = -1;
    let dmax = tolM;
    for (let i = a + 1; i < b; i++) {
      const d = segDist(xs[i]!, ys[i]!, xs[a]!, ys[a]!, xs[b]!, ys[b]!);
      if (d > dmax) {
        dmax = d;
        idx = i;
      }
    }
    if (idx >= 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  let out = arc.filter((_, i) => keep[i]);
  if (closed && out.length < 4) {
    // Too small to survive simplification: keep a 3-point outline from the original.
    const third = Math.floor(last / 3);
    out = [arc[0]!, arc[Math.max(1, third)]!, arc[Math.max(2, 2 * third)]!, arc[last]!];
  }
  return out;
}

/** Distance from (px,py) to segment (ax,ay)-(bx,by). */
export function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

// ---------------------------------------------------------------- encoding

export interface LayerInput {
  kind: Kind;
  label: string;
  districts: DistrictShape[];
}

export interface EncodeOptions {
  toleranceM: number;
  /** Grid size in degrees for the quantized coordinates. */
  quantumDeg: number;
}

/**
 * Shared-arc topology over all layers (so a boundary used by two districts,
 * or by two layers, is simplified once and stays seamless), Douglas–Peucker
 * per arc, then integer quantization with delta encoding.
 */
export function encodeLayers(
  layers: LayerInput[],
  opts: EncodeOptions,
): Pick<DistrictFile, "tolerance_m" | "margin_m" | "transform" | "arcs" | "layers"> {
  const objects: Record<string, unknown> = {};
  for (const l of layers) {
    objects[l.kind] = {
      type: "FeatureCollection",
      features: l.districts.map((d) => ({ type: "Feature", id: d.n, properties: {}, geometry: { type: "Polygon", coordinates: d.rings } })),
    };
  }
  const topo = topology(objects as Parameters<typeof topology>[0]) as unknown as {
    arcs: Ring[];
    objects: Record<string, { geometries: Array<{ id: number; type: string; arcs?: number[][] }> }>;
  };
  let minX = Infinity;
  let minY = Infinity;
  for (const arc of topo.arcs) {
    for (const [x, y] of arc) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
    }
  }
  const q = opts.quantumDeg;
  const tx = round9(Math.floor(minX / q) * q);
  const ty = round9(Math.floor(minY / q) * q);
  const arcs = topo.arcs.map((arc) => {
    const simple = simplifyArc(arc, opts.toleranceM);
    const flat: number[] = [];
    let px = 0;
    let py = 0;
    simple.forEach(([x, y], i) => {
      const qx = Math.round((x - tx) / q);
      const qy = Math.round((y - ty) / q);
      const last = i === simple.length - 1;
      if (i > 0 && qx === px && qy === py && !last) return;
      flat.push(i === 0 ? qx : qx - px, i === 0 ? qy : qy - py);
      px = qx;
      py = qy;
    });
    return encodeInts(flat);
  });
  const out: DistrictFile["layers"] = {};
  for (const l of layers) {
    const districts: Record<string, string[]> = {};
    for (const g of topo.objects[l.kind]!.geometries) {
      if (g.type === "Polygon" && g.arcs) districts[String(g.id)] = g.arcs.map((ring) => encodeInts(ring.map((ref, i) => (i === 0 ? ref : ref - ring[i - 1]!))));
    }
    out[l.kind] = { label: l.label, districts };
  }
  // Worst case between the true line and the stored one: the simplification
  // tolerance plus half a grid cell diagonal (rounding), plus 10% for the flat-earth
  // approximation used to measure both.
  const cellM = (q * Math.hypot(M_PER_DEG_LON_EQ, M_PER_DEG_LAT)) / 2;
  return {
    tolerance_m: opts.toleranceM,
    margin_m: Math.ceil((opts.toleranceM + cellM) * 1.1),
    transform: { scale: [q, q], translate: [tx, ty] },
    arcs,
    layers: out,
  };
}

/**
 * Integers as text, the encoding of Google's polyline algorithm: zigzag, then
 * 5-bit groups, low first, each + 63 (0x20 marks "more follows"). Small
 * deltas take one or two characters instead of JSON's three to six.
 */
export function encodeInts(values: number[]): string {
  let out = "";
  for (const v of values) {
    let z = v < 0 ? ~(v << 1) : v << 1;
    while (z >= 0x20) {
      out += String.fromCharCode((0x20 | (z & 0x1f)) + 63);
      z >>>= 5;
    }
    out += String.fromCharCode(z + 63);
  }
  return out;
}

function round9(v: number): number {
  return Math.round(v * 1e9) / 1e9;
}

// ---------------------------------------------------------------- ZIP table

export interface ZipBlock {
  zcta: string;
  /** Land area of the block inside the ZCTA, m². */
  land: number;
  /** Housing units (2020 census). */
  homes: number;
  /** District number per layer kind (undefined when the block has none). */
  districts: Partial<Record<Kind, number>>;
}

export const ZIP_LAYER_CODE: Record<Kind, string> = { cd: "c", boe: "b", sd: "s", ad: "a", county: "k", city: "l" };

/**
 * ZCTA -> districts, one row per ZCTA:
 *   `94025:c16/71,15/29;s13;a23/79,21/21`
 * Each layer lists every district that holds land or homes of the ZCTA. When
 * a ZCTA spans several districts, `/p` is the share of its 2020 housing units
 * in that district in whole percent (1–99 when several districts hold homes;
 * 0 means no housing units were counted there). A trailing `;x` marks a ZCTA that also
 * covers land outside the state. Rows are sorted by ZCTA and joined by single
 * spaces.
 */
export function encodeZipTable(blocks: Iterable<ZipBlock>, kinds: Kind[], crossState: ReadonlySet<string> = new Set()): string {
  const by = new Map<string, Map<Kind, Map<number, number>>>();
  for (const b of blocks) {
    if (!(b.land > 0 || b.homes > 0)) continue;
    let z = by.get(b.zcta);
    if (!z) by.set(b.zcta, (z = new Map()));
    for (const k of kinds) {
      const n = b.districts[k];
      if (n === undefined) continue;
      let m = z.get(k);
      if (!m) z.set(k, (m = new Map()));
      m.set(n, (m.get(n) ?? 0) + b.homes);
    }
  }
  const rows: string[] = [];
  for (const zcta of [...by.keys()].sort()) {
    const z = by.get(zcta)!;
    const parts: string[] = [];
    for (const k of kinds) {
      const m = z.get(k);
      if (!m) continue;
      const total = [...m.values()].reduce((s, v) => s + v, 0);
      // 1..99 when several districts hold homes, so a share never reads as "all" or "none" when it isn't.
      const withHomes = [...m.values()].filter((h) => h > 0).length;
      const pct = (homes: number) => Math.min(withHomes > 1 ? 99 : 100, Math.max(1, Math.round((100 * homes) / total)));
      const entries = [...m.entries()].map(([n, homes]) => ({ n, p: homes === 0 || total === 0 ? 0 : pct(homes) }));
      entries.sort((a, b) => b.p - a.p || a.n - b.n);
      const body = entries.length === 1 ? String(entries[0]!.n) : entries.map((e) => `${e.n}/${e.p}`).join(",");
      parts.push(ZIP_LAYER_CODE[k] + body);
    }
    if (crossState.has(zcta)) parts.push("x");
    if (parts.length) rows.push(`${zcta}:${parts.join(";")}`);
  }
  return rows.join(" ");
}

/**
 * Canonical JSON for the district file: keys in the order the type declares,
 * one top-level key per line, one layer per line, one arc per line (compact,
 * but a re-import shows a readable diff).
 */
export function serializeDistrictFile(f: DistrictFile): string {
  const order: Array<keyof DistrictFile> = [
    "format",
    "state",
    "election",
    "note",
    "tolerance_m",
    "margin_m",
    "transform",
    "zip_layers",
    "layers",
    "arcs",
    "zips",
  ];
  const lines = order.map((k) => {
    const v = f[k];
    if (k === "layers") {
      const layers = f.layers;
      const inner = (Object.keys(layers) as Kind[]).map((kind) => `${JSON.stringify(kind)}: ${JSON.stringify(layers[kind])}`);
      return `"layers": {\n${inner.join(",\n")}\n}`;
    }
    if (k === "arcs") return `"arcs": [\n${f.arcs.map((a) => JSON.stringify(a)).join(",\n")}\n]`;
    return `${JSON.stringify(k)}: ${JSON.stringify(v)}`;
  });
  return `{\n${lines.join(",\n")}\n}\n`;
}
