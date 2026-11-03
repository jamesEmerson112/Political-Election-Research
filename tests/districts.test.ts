import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  encodeInts,
  encodeLayers,
  encodeZipTable,
  parseBef,
  readDbf,
  readShpPolygons,
  segDist,
  serializeDistrictFile,
  shapesFromZip,
  simplifyArc,
  zipEntries,
  zipFind,
  zipRead,
  type Ring,
  type ZipBlock,
} from "../src/districts.js";
import { REPO_ROOT } from "../src/paths.js";
import { decode, decodeInts, lookupPoint, lookupZip, type DistrictFile } from "../web/src/lib/geo.js";

// ---- tiny writers for fictional fixtures (zip, shapefile, dBASE)

function makeZip(files: Record<string, Buffer>, deflate = true): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const body = deflate ? zlib.deflateRawSync(data) : data;
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, body);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(deflate ? 8 : 0, 10);
    c.writeUInt32LE(body.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(nameBuf.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

function makeShp(records: Ring[][]): Buffer {
  const recs = records.map((rings, i) => {
    const pts = rings.flat();
    const content = Buffer.alloc(44 + rings.length * 4 + pts.length * 16);
    content.writeInt32LE(5, 0);
    content.writeInt32LE(rings.length, 36);
    content.writeInt32LE(pts.length, 40);
    let k = 0;
    rings.forEach((r, j) => {
      content.writeInt32LE(k, 44 + j * 4);
      k += r.length;
    });
    pts.forEach(([x, y], j) => {
      content.writeDoubleLE(x, 44 + rings.length * 4 + j * 16);
      content.writeDoubleLE(y, 44 + rings.length * 4 + j * 16 + 8);
    });
    const head = Buffer.alloc(8);
    head.writeInt32BE(i + 1, 0);
    head.writeInt32BE(content.length / 2, 4);
    return Buffer.concat([head, content]);
  });
  return Buffer.concat([Buffer.alloc(100), ...recs]);
}

function makeDbf(fields: Array<[string, number]>, rows: string[][]): Buffer {
  const headerLen = 32 + fields.length * 32 + 1;
  const recordLen = 1 + fields.reduce((s, [, len]) => s + len, 0);
  const head = Buffer.alloc(headerLen);
  head.writeUInt8(3, 0);
  head.writeUInt32LE(rows.length, 4);
  head.writeUInt16LE(headerLen, 8);
  head.writeUInt16LE(recordLen, 10);
  fields.forEach(([name, len], i) => {
    head.write(name, 32 + i * 32, "latin1");
    head.write("C", 32 + i * 32 + 11, "latin1");
    head.writeUInt8(len, 32 + i * 32 + 16);
  });
  head.writeUInt8(0x0d, headerLen - 1);
  const body = rows.map((r) => Buffer.from(" " + r.map((v, i) => v.padEnd(fields[i]![1])).join(""), "latin1"));
  return Buffer.concat([head, ...body]);
}

const GEO_PRJ = Buffer.from('GEOGCS["GCS_North_American_1983",DATUM["D_North_American_1983"]]');
const sq = (x0: number, y0: number, s: number): Ring => [
  [x0, y0],
  [x0, y0 + s],
  [x0 + s, y0 + s],
  [x0 + s, y0],
  [x0, y0],
];

// Fictional map at 0°/0° (no real place): district 1 and 2 are 0.01° squares
// sharing an edge at x = 0.01; district 1 has a hole; district 3 is an island.
const D1: Ring[] = [sq(0, 0, 0.01), sq(0.004, 0.004, 0.002).reverse()];
const D2: Ring[] = [sq(0.01, 0, 0.01)];
const D3: Ring[] = [sq(0.05, 0.05, 0.002)];

describe("zip reader", () => {
  it("reads stored and deflated entries", () => {
    for (const deflate of [false, true]) {
      const zip = makeZip({ "a.txt": Buffer.from("hello"), "dir/b.dbf": Buffer.from("x".repeat(500)) }, deflate);
      const entries = zipEntries(zip);
      expect([...entries.keys()]).toEqual(["a.txt", "dir/b.dbf"]);
      expect(zipRead(zip, entries.get("a.txt")!).toString()).toBe("hello");
      expect(zipFind(zip, /\.dbf$/).length).toBe(500);
    }
  });
  it("rejects ambiguous or missing entries", () => {
    const zip = makeZip({ "a.txt": Buffer.from("1"), "b.txt": Buffer.from("2") });
    expect(() => zipFind(zip, /\.txt$/)).toThrow(/found 2/);
    expect(() => zipFind(zip, /\.shp$/)).toThrow(/found 0/);
  });
});

describe("shapefile and dBASE", () => {
  const shp = makeShp([D1, D2, D3, [sq(1, 1, 0.01)]]);
  const dbf = makeDbf(
    [
      ["DIST", 3],
      ["NAME", 8],
    ],
    [
      ["001", "one"],
      ["002", "two"],
      ["001", "one-b"],
      ["ZZZ", "water"],
    ],
  );
  it("reads polygon rings and columns", () => {
    const recs = readShpPolygons(shp);
    expect(recs).toHaveLength(4);
    expect(recs[0]).toEqual(D1);
    expect(readDbf(dbf, ["NAME"])).toEqual({ NAME: ["one", "two", "one-b", "water"] });
    expect(() => readDbf(dbf, ["NOPE"])).toThrow(/no field NOPE/);
  });
  it("groups records by district number and drops non-districts", () => {
    const zip = makeZip({ "x.shp": shp, "x.dbf": dbf, "x.prj": GEO_PRJ });
    const shapes = shapesFromZip(zip, "DIST", 4);
    expect(shapes.map((s) => s.n)).toEqual([1, 2]);
    expect(shapes[0]!.rings).toEqual([...D1, ...D3]);
  });
  it("refuses projected shapefiles", () => {
    const zip = makeZip({ "x.shp": shp, "x.dbf": dbf, "x.prj": Buffer.from('PROJCS["NAD83 / California Albers"]') });
    expect(() => shapesFromZip(zip, "DIST", 4)).toThrow(/projected/);
  });
});

describe("block equivalency files", () => {
  it("keeps one state's numbered blocks", () => {
    const text = "﻿GEOID,STATEFP,COUNTYFP,TRACTCE,BLOCKCE,CDFP\r\n990010001001000,99,001,000100,1000,03\r\n990010001001001,99,001,000100,1001,ZZ\r\n980010001001000,98,001,000100,1000,01\r\n";
    expect([...parseBef(Buffer.from(text), "99")]).toEqual([["990010001001000", 3]]);
    expect([...parseBef(Buffer.from("990010001001000|12\n"), "99")]).toEqual([["990010001001000", 12]]);
  });
});

describe("simplification", () => {
  it("keeps endpoints and stays within tolerance", () => {
    const arc: Ring = Array.from({ length: 200 }, (_, i) => [i * 0.0001, Math.sin(i / 7) * 0.0003]);
    const out = simplifyArc(arc, 10);
    expect(out[0]).toEqual(arc[0]);
    expect(out.at(-1)).toEqual(arc.at(-1));
    expect(out.length).toBeLessThan(arc.length);
    const kx = Math.cos(0) * 111320;
    for (const p of arc) {
      let best = Infinity;
      for (let i = 1; i < out.length; i++) {
        const [a, b] = [out[i - 1]!, out[i]!];
        best = Math.min(best, segDist(p[0] * kx, p[1] * 110574, a[0] * kx, a[1] * 110574, b[0] * kx, b[1] * 110574));
      }
      expect(best).toBeLessThanOrEqual(10 + 1e-6);
    }
  });
  it("keeps a closed ring a polygon", () => {
    expect(simplifyArc(sq(0, 0, 0.00001), 1000).length).toBeGreaterThanOrEqual(4);
  });
});

describe("integer text encoding", () => {
  it("round-trips", () => {
    const v = [0, 1, -1, 15, -16, 16, 511, -512, 123456, -98765, 206000];
    expect(decodeInts(encodeInts(v))).toEqual(v);
  });
});

function fixtureFile(): DistrictFile {
  const enc = encodeLayers(
    [
      {
        kind: "cd",
        label: "Fictional",
        districts: [
          { n: 1, rings: D1 },
          { n: 2, rings: D2 },
          { n: 3, rings: D3 },
        ],
      },
    ],
    { toleranceM: 5, quantumDeg: 0.00001 },
  );
  return {
    format: "ca-districts/1",
    state: "zz",
    election: "2030-zz-general",
    note: "fictional",
    ...enc,
    zip_layers: ["cd"],
    zips: "",
  };
}

describe("encoded district file", () => {
  it("shares the common edge: both districts use the same arc", () => {
    const f = fixtureFile();
    // Ring arc lists are delta-encoded; decode them the way the client does.
    const abs = (n: string) =>
      new Set(
        f.layers.cd!.districts[n]!.flatMap((r) => {
          let ref = 0;
          return decodeInts(r).map((d, i) => (ref = i === 0 ? d : ref + d));
        }).map((x) => (x < 0 ? ~x : x)),
      );
    expect(abs("1").size).toBeGreaterThan(0);
    expect([...abs("1")].some((a) => abs("2").has(a))).toBe(true);
  });
  it("looks points up with the stored margin", () => {
    const d = decode(fixtureFile());
    const at = (lon: number, lat: number, acc = 0) => lookupPoint(d, lon, lat, acc).layers.cd!.possible;
    expect(at(0.002, 0.002)).toEqual([1]);
    expect(at(0.015, 0.005)).toEqual([2]);
    expect(at(0.051, 0.051)).toEqual([3]);
    // In district 1's hole, about 111 m from its edge: no district.
    expect(at(0.005, 0.005)).toEqual([]);
    // 2 m from the shared edge: both.
    expect(at(0.01 - 0.00002, 0.005)).toEqual([1, 2]);
    // Far away: none, and out of state.
    expect(lookupPoint(d, 1, 1).inState).toBe(false);
    // A coarse device fix widens the margin.
    expect(at(0.002, 0.005, 2000)).toEqual([1, 2]);
  });
  it("serializes the same bytes every time", () => {
    expect(serializeDistrictFile(fixtureFile())).toBe(serializeDistrictFile(fixtureFile()));
    expect(JSON.parse(serializeDistrictFile(fixtureFile()))).toEqual(fixtureFile());
  });
});

describe("ZIP table", () => {
  const b = (zcta: string, homes: number, cd: number, sd?: number, land = 1): ZipBlock => ({ zcta, land, homes, districts: sd ? { cd, sd } : { cd } });
  const table = encodeZipTable(
    [b("00002", 10, 1, 7), b("00001", 75, 1, 7), b("00001", 25, 2, 7), b("00001", 0, 3, 7), b("00003", 0, 4, undefined, 0)],
    ["cd", "sd"],
    new Set(["00002"]),
  );
  it("encodes shares of housing units, sorted", () => {
    expect(table).toBe("00001:c1/75,2/25,3/0;s7 00002:c1;s7;x");
  });
  it("never rounds a split to 100% or 0%", () => {
    expect(encodeZipTable([b("00009", 999, 1), b("00009", 1, 2)], ["cd"])).toBe("00009:c1/99,2/1");
  });
  it("looks ZIP codes up", () => {
    expect(lookupZip({ zips: table }, "00001")).toEqual({
      zip: "00001",
      layers: {
        cd: [
          { n: 1, share: 75 },
          { n: 2, share: 25 },
          { n: 3, share: 0 },
        ],
        sd: [{ n: 7, share: null }],
      },
      crossesState: false,
    });
    expect(lookupZip({ zips: table }, "00002")?.crossesState).toBe(true);
    expect(lookupZip({ zips: table }, "00003")).toBeNull();
    expect(lookupZip({ zips: table }, "0001")).toBeNull();
    expect(lookupZip({ zips: table }, "abcde")).toBeNull();
  });
});

describe("the committed California file (geo/)", () => {
  const file = path.join(REPO_ROOT, "geo", "ca-2026-districts.json");
  const f = JSON.parse(fs.readFileSync(file, "utf8")) as DistrictFile;
  it("is canonical", () => {
    expect(serializeDistrictFile(f)).toBe(fs.readFileSync(file, "utf8"));
  });
  it("has every district of each layer", () => {
    const count = (k: "cd" | "sd" | "ad") => Object.keys(f.layers[k]!.districts).map(Number);
    expect(count("cd")).toEqual(Array.from({ length: 52 }, (_, i) => i + 1));
    expect(count("sd")).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    expect(count("ad")).toEqual(Array.from({ length: 80 }, (_, i) => i + 1));
    expect(f.margin_m).toBeGreaterThan(f.tolerance_m);
  });
  it("matches its manifest", async () => {
    const m = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "geo", "manifest.json"), "utf8"));
    const crypto = await import("node:crypto");
    expect(m.output.sha256).toBe(crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"));
    expect(m.verification.results.cd.outside_margin).toBe(0);
  });
  it("has a parseable, sorted ZIP table", () => {
    const rows = f.zips.split(" ");
    expect(rows.map((r) => r.slice(0, 5))).toEqual([...rows.map((r) => r.slice(0, 5))].sort());
    for (const r of rows) expect(lookupZip(f, r.slice(0, 5))?.layers.cd?.length).toBeGreaterThan(0);
  });
});
