/**
 * npm run -s import:districts [-- --state ca|nv] [--cache <dir>] [--verify] [--stride <n>]
 *                                 [--boe <zip> --boe-field <name>] [--boe-bef <file>]
 *
 * Builds geo/ca-2026-districts.json (district outlines + ZIP table for the
 * site's "My ballot" lookup) and geo/manifest.json (provenance) from pinned
 * U.S. Census Bureau files. Same inputs -> same bytes.
 *
 * --state nv builds geo/nv-2026-districts.json and geo/manifest.nv.json
 * instead: Nevada's U.S. House, State Senate and Assembly districts, its
 * counties and the City of Las Vegas (Las Vegas ballots).
 *
 * Inputs are downloaded once into a gitignored cache (default .cache/geo/)
 * and checked against their pinned sha256; a changed upstream file stops the
 * run so a person can review it and update the pin.
 *
 * --verify   Look up the internal point of every <stride>-th census block
 *            (default 10) in the generated file and compare with the block
 *            equivalency files; results go into geo/manifest.json.
 * --boe      (California only) The California Citizens Redistricting Commission's final Board of
 *            Equalization shapefile (zip, longitude/latitude). Adds a BOE layer.
 *            --boe-field names the district-number field.
 * --boe-bef  A block -> BOE district equivalency file (GEOID,...,district),
 *            to add BOE districts to the ZIP table.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  encodeLayers,
  encodeZipTable,
  parseBef,
  readDbf,
  serializeDistrictFile,
  shapesFromZip,
  ZIP_LAYER_CODE,
  zipFind,
  type LayerInput,
  type ZipBlock,
} from "../src/districts.js";
import { REPO_ROOT } from "../src/paths.js";
import { decode, insideRings, lookupPoint, type DistrictFile, type Kind } from "../web/src/lib/geo.js";
import { flagStr, parseArgs } from "./args.js";

interface Input {
  id: string;
  url: string;
  title: string;
  publisher: string;
  /** Last-Modified date of the file on the publisher's server. */
  published: string;
  /** When the pin (bytes + sha256) was taken. */
  fetched: string;
  license: string;
  /** What the file is derived from, per the publisher. */
  origin: string;
  bytes: number;
  sha256: string;
  /** Registered source record (data/sources), when there is one. */
  source_ref?: string;
}

const CENSUS = "U.S. Census Bureau";
const PUBLIC_DOMAIN = "Public domain: work of the U.S. federal government (17 U.S.C. § 105).";

export const INPUTS: Input[] = [
  {
    id: "cd120-shapes",
    url: "https://www2.census.gov/geo/tiger/TIGER2026/CD/tl_2026_06_cd120.zip",
    title: "TIGER/Line Shapefile, 2026, California, 120th Congressional Districts",
    publisher: CENSUS,
    published: "2026-10-06",
    fetched: "2026-11-03",
    license: PUBLIC_DOMAIN,
    origin:
      "Districts for the 120th Congress (elected November 3, 2026) as specified to the Census Bureau by the State of California: the AB 604 map approved by Proposition 50 (November 2025).",
    bytes: 4350554,
    sha256: "5d441c64cb33ba3f6d8dee1be2ce5f7c1efa502f245ac67c36344de2567d4269",
    source_ref: "src:www2-census-gov-79fceea71e",
  },
  {
    id: "cd120-bef",
    url: "https://www2.census.gov/programs-surveys/decennial/rdo/mapping-files/2027/120-congressional-district-befs/cd120.zip",
    title: "120th Congressional District Block Equivalency Files (California: CD120_06.txt)",
    publisher: CENSUS,
    published: "2026-10-07",
    fetched: "2026-11-03",
    license: PUBLIC_DOMAIN,
    origin: "Block-to-district assignments specified to the Census Bureau by the State of California (Redistricting Data Program).",
    bytes: 55241385,
    sha256: "bc9a4fc543b8b279ce3663642a5cc4e19e32a8ef84f12371e26f754e5b8cc8a5",
    source_ref: "src:www2-census-gov-ade03cc232",
  },
  {
    id: "sldu-shapes",
    url: "https://www2.census.gov/geo/tiger/TIGER2026/SLDU/tl_2026_06_sldu.zip",
    title: "TIGER/Line Shapefile, 2026, California, State Legislative Districts – Upper Chamber (State Senate)",
    publisher: CENSUS,
    published: "2026-10-06",
    fetched: "2026-11-03",
    license: PUBLIC_DOMAIN,
    origin: "State Senate districts drawn by the California Citizens Redistricting Commission (2021), unchanged by Proposition 50.",
    bytes: 3249504,
    sha256: "bdcb8e8f712a4ab291e9d7434d054feb2482ddd989a231f7161e82965b537ffa",
  },
  {
    id: "sldl-shapes",
    url: "https://www2.census.gov/geo/tiger/TIGER2026/SLDL/tl_2026_06_sldl.zip",
    title: "TIGER/Line Shapefile, 2026, California, State Legislative Districts – Lower Chamber (Assembly)",
    publisher: CENSUS,
    published: "2026-10-06",
    fetched: "2026-11-03",
    license: PUBLIC_DOMAIN,
    origin: "Assembly districts drawn by the California Citizens Redistricting Commission (2021), unchanged by Proposition 50.",
    bytes: 4123431,
    sha256: "e23b8e468f6e5e299943b92ea8ac66a06e14288b32994c099bcbc2cdff7e4233",
  },
  {
    id: "sldu-bef",
    url: "https://www2.census.gov/programs-surveys/decennial/rdo/mapping-files/2027/2026-state-legislative-bef/sldu26.zip",
    title: "2026 State Legislative District Block Equivalency Files, Upper Chamber (NationalSLDU26.txt, California rows)",
    publisher: CENSUS,
    published: "2026-08-31",
    fetched: "2026-11-03",
    license: PUBLIC_DOMAIN,
    origin: "Block-to-district assignments specified to the Census Bureau by the State of California.",
    bytes: 46793479,
    sha256: "4cb669e71e05caa0ff340b4525300ad503994a15c85b63873e07ef0ebf6d1200",
  },
  {
    id: "sldl-bef",
    url: "https://www2.census.gov/programs-surveys/decennial/rdo/mapping-files/2027/2026-state-legislative-bef/sldl26.zip",
    title: "2026 State Legislative District Block Equivalency Files, Lower Chamber (NationalSLDL26.txt, California rows)",
    publisher: CENSUS,
    published: "2026-08-31",
    fetched: "2026-11-03",
    license: PUBLIC_DOMAIN,
    origin: "Block-to-district assignments specified to the Census Bureau by the State of California.",
    bytes: 44600009,
    sha256: "78691acb59cebe5c9e7851d1ba8702699140a291d0311b04c560b3d3771141e0",
  },
  {
    id: "zcta-blocks",
    url: "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_tabblock20_natl.txt",
    title: "2020 ZIP Code Tabulation Area (ZCTA5) to 2020 Census Tabulation Block Relationship File, national",
    publisher: CENSUS,
    published: "2021-12-09",
    fetched: "2026-11-03",
    license: PUBLIC_DOMAIN,
    origin: "2020 Census ZCTAs, which are built from 2020 census blocks to approximate USPS ZIP Code service areas.",
    bytes: 1057697144,
    sha256: "7f077624d252fc1cc5a2d1100be07cfe038ffc152bfe193561d068b4def6bbbf",
  },
  {
    id: "blocks",
    url: "https://www2.census.gov/geo/tiger/TIGER2026/TABBLOCK20/tl_2026_06_tabblock20.zip",
    title: "TIGER/Line Shapefile, 2026, California, 2020 Census Tabulation Blocks (attributes only: HOUSING20, INTPTLAT20, INTPTLON20)",
    publisher: CENSUS,
    published: "2026-10-06",
    fetched: "2026-11-03",
    license: PUBLIC_DOMAIN,
    origin: "2020 Census housing-unit counts and internal points per block.",
    bytes: 385696957,
    sha256: "b2c80c85b039484f526dbd8133e1e83557d2cc944bdfcf08222b94bab4d417a5",
  },
];

const SHARED = (id: string) => INPUTS.find((i) => i.id === id)!;

/** Nevada's inputs: its own shapes and blocks, plus the national files California's build pins too. */
export const NV_INPUTS: Input[] = [
  {
    id: "nv-cd120-shapes",
    url: "https://www2.census.gov/geo/tiger/TIGER2026/CD/tl_2026_32_cd120.zip",
    title: "TIGER/Line Shapefile, 2026, Nevada, 120th Congressional Districts",
    publisher: CENSUS,
    published: "2026-10-06",
    fetched: "2026-11-03",
    license: PUBLIC_DOMAIN,
    origin: "Districts for the 120th Congress (elected November 3, 2026) as specified to the Census Bureau by the State of Nevada.",
    bytes: 307841,
    sha256: "28b76d5e696ff62c8271b190e5a3121839f8cad6bec5390d4c73b5c7bd63edc6",
  },
  { ...SHARED("cd120-bef"), title: "120th Congressional District Block Equivalency Files (NationalCD120.txt, Nevada rows)", origin: "Block-to-district assignments specified to the Census Bureau by the State of Nevada (Redistricting Data Program).", source_ref: undefined },
  {
    id: "nv-sldu-shapes",
    url: "https://www2.census.gov/geo/tiger/TIGER2026/SLDU/tl_2026_32_sldu.zip",
    title: "TIGER/Line Shapefile, 2026, Nevada, State Legislative Districts – Upper Chamber (State Senate)",
    publisher: CENSUS,
    published: "2026-10-06",
    fetched: "2026-11-03",
    license: PUBLIC_DOMAIN,
    origin: "Nevada State Senate districts as specified to the Census Bureau by the State of Nevada.",
    bytes: 601292,
    sha256: "ebcb7511d58045767bf25e22501be1563501f9b108b0543b7212c0290d603059",
  },
  {
    id: "nv-sldl-shapes",
    url: "https://www2.census.gov/geo/tiger/TIGER2026/SLDL/tl_2026_32_sldl.zip",
    title: "TIGER/Line Shapefile, 2026, Nevada, State Legislative Districts – Lower Chamber (Assembly)",
    publisher: CENSUS,
    published: "2026-10-06",
    fetched: "2026-11-03",
    license: PUBLIC_DOMAIN,
    origin: "Nevada Assembly districts as specified to the Census Bureau by the State of Nevada.",
    bytes: 778510,
    sha256: "08b0c79afe2c2219e84ee8d05002316cac1fb9d9e6b6eb0b8e43659af4d479dd",
  },
  { ...SHARED("sldu-bef"), title: "2026 State Legislative District Block Equivalency Files, Upper Chamber (NationalSLDU26.txt, Nevada rows)", origin: "Block-to-district assignments specified to the Census Bureau by the State of Nevada." },
  { ...SHARED("sldl-bef"), title: "2026 State Legislative District Block Equivalency Files, Lower Chamber (NationalSLDL26.txt, Nevada rows)", origin: "Block-to-district assignments specified to the Census Bureau by the State of Nevada." },
  {
    id: "county-shapes",
    url: "https://www2.census.gov/geo/tiger/TIGER2026/COUNTY/tl_2026_us_county.zip",
    title: "TIGER/Line Shapefile, 2026, United States, Counties (Nevada records: STATEFP 32)",
    publisher: CENSUS,
    published: "2026-10-07",
    fetched: "2026-11-03",
    license: PUBLIC_DOMAIN,
    origin: "County boundaries as of January 1, 2026 (Boundary and Annexation Survey).",
    bytes: 83378454,
    sha256: "b527c9ba7aeb8f17ef118f026eae5e5a938aa1d00b873bc32342d0dce59321c0",
  },
  {
    id: "nv-place-shapes",
    url: "https://www2.census.gov/geo/tiger/TIGER2026/PLACE/tl_2026_32_place.zip",
    title: "TIGER/Line Shapefile, 2026, Nevada, Places (City of Las Vegas: PLACEFP 40000)",
    publisher: CENSUS,
    published: "2026-10-06",
    fetched: "2026-11-03",
    license: PUBLIC_DOMAIN,
    origin: "Incorporated place boundaries as of January 1, 2026 (Boundary and Annexation Survey).",
    bytes: 850132,
    sha256: "f8ee4d236bb335cc41daf0156ea7684825d084f3cf769ec70fb5ffa00770f624",
  },
  SHARED("zcta-blocks"),
  {
    id: "nv-blocks",
    url: "https://www2.census.gov/geo/tiger/TIGER2026/TABBLOCK20/tl_2026_32_tabblock20.zip",
    title: "TIGER/Line Shapefile, 2026, Nevada, 2020 Census Tabulation Blocks (attributes only: HOUSING20, INTPTLAT20, INTPTLON20)",
    publisher: CENSUS,
    published: "2026-10-06",
    fetched: "2026-11-03",
    license: PUBLIC_DOMAIN,
    origin: "2020 Census housing-unit counts and internal points per block.",
    bytes: 74820692,
    sha256: "e16d93cb0120dfc730d1d96fc700f3fd1f622e0ac8ecde47cb107d377b5844f8",
  },
].map((i) => JSON.parse(JSON.stringify(i)) as Input);

/** Simplification parameters (changing them changes the output). */
export const PARAMS = { toleranceM: 120, quantumDeg: 0.00005 };

const args = parseArgs();
const STATE = flagStr(args, "state") ?? "ca";
if (STATE !== "ca" && STATE !== "nv") throw new Error("--state must be ca or nv");
const NV = STATE === "nv";
if (NV && (flagStr(args, "boe") || flagStr(args, "boe-bef"))) throw new Error("--boe is California only");
const STATE_FIPS = NV ? "32" : "06";
const STATE_INPUTS = NV ? NV_INPUTS : INPUTS;
const OUT_DIR = path.join(REPO_ROOT, "geo");
const OUT_NAME = NV ? "nv-2026-districts.json" : "ca-2026-districts.json";
const OUT_FILE = path.join(OUT_DIR, OUT_NAME);
const MANIFEST = path.join(OUT_DIR, NV ? "manifest.nv.json" : "manifest.json");
/** City of Las Vegas (Census place code), stored as district 1 of the `city` layer. */
const LAS_VEGAS_PLACEFP = "40000";
const cacheDir = path.resolve(flagStr(args, "cache") ?? path.join(REPO_ROOT, ".cache", "geo"));
fs.mkdirSync(cacheDir, { recursive: true });

async function sha256File(file: string): Promise<string> {
  const h = crypto.createHash("sha256");
  await pipeline(fs.createReadStream(file), h);
  return h.digest("hex");
}

/** Path of a verified local copy of an input, downloading it when needed. */
async function ensure(input: Input): Promise<string> {
  const ext = path.extname(new URL(input.url).pathname);
  const file = path.join(cacheDir, `${input.id}${ext}`);
  if (fs.existsSync(file) && fs.statSync(file).size === input.bytes && (await sha256File(file)) === input.sha256) return file;
  console.error(`download ${input.url}`);
  const res = await fetch(input.url);
  if (!res.ok || !res.body) throw new Error(`${input.url}: HTTP ${res.status}`);
  const tmp = `${file}.part`;
  await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), fs.createWriteStream(tmp));
  const sha = await sha256File(tmp);
  if (sha !== input.sha256) {
    throw new Error(
      `${input.url} changed upstream (sha256 ${sha}, pinned ${input.sha256}). Review the new file, then update the pin in cli/import-districts.ts.`,
    );
  }
  fs.renameSync(tmp, file);
  return file;
}

function read(file: string): Buffer {
  return fs.readFileSync(file);
}

const files: Record<string, string> = {};
for (const input of STATE_INPUTS) files[input.id] = await ensure(input);

// ---- outlines
console.error("reading district shapes");
const layers: LayerInput[] = NV
  ? [
      { kind: "cd", label: "U.S. House (120th Congress)", districts: shapesFromZip(read(files["nv-cd120-shapes"]!), "CD120FP", 4) },
      { kind: "sd", label: "State Senate", districts: shapesFromZip(read(files["nv-sldu-shapes"]!), "SLDUST", 21) },
      { kind: "ad", label: "State Assembly", districts: shapesFromZip(read(files["nv-sldl-shapes"]!), "SLDLST", 42) },
      { kind: "county", label: "County (FIPS code)", districts: shapesFromZip(read(files["county-shapes"]!), "COUNTYFP", 510, { where: { STATEFP: STATE_FIPS } }) },
      {
        kind: "city",
        label: "City of Las Vegas (1 = in the city)",
        districts: shapesFromZip(read(files["nv-place-shapes"]!), "PLACEFP", 1, { where: { PLACEFP: LAS_VEGAS_PLACEFP }, as: 1 }),
      },
    ]
  : [
      { kind: "cd", label: "U.S. House (120th Congress)", districts: shapesFromZip(read(files["cd120-shapes"]!), "CD120FP", 52) },
      { kind: "sd", label: "State Senate (2021 Commission map)", districts: shapesFromZip(read(files["sldu-shapes"]!), "SLDUST", 40) },
      { kind: "ad", label: "State Assembly (2021 Commission map)", districts: shapesFromZip(read(files["sldl-shapes"]!), "SLDLST", 80) },
    ];
const boeZip = flagStr(args, "boe");
const boeInput: Partial<Input> | null = boeZip ? { id: "boe-shapes", url: path.basename(boeZip), sha256: await sha256File(boeZip) } : null;
if (boeZip) {
  const field = flagStr(args, "boe-field");
  if (!field) throw new Error("--boe needs --boe-field <district-number field>");
  layers.splice(1, 0, { kind: "boe", label: "Board of Equalization (2021 Commission map)", districts: shapesFromZip(read(boeZip), field, 4) });
}
for (const l of layers) console.error(`  ${l.kind}: ${l.districts.length} districts`);

console.error("building topology and simplifying");
const params = {
  toleranceM: Number(flagStr(args, "tolerance") ?? PARAMS.toleranceM),
  quantumDeg: Number(flagStr(args, "quantum") ?? PARAMS.quantumDeg),
};
const encoded = encodeLayers(layers, params);

// ---- block tables
console.error("reading block equivalency files");
const bef: Partial<Record<Kind, Map<string, number>>> = {
  cd: parseBef(zipFind(read(files["cd120-bef"]!), NV ? /^NationalCD120\.txt$/ : /^CD120_06\.txt$/), STATE_FIPS),
  sd: parseBef(zipFind(read(files["sldu-bef"]!), /^NationalSLDU26\.txt$/), STATE_FIPS),
  ad: parseBef(zipFind(read(files["sldl-bef"]!), /^NationalSLDL26\.txt$/), STATE_FIPS),
};
const boeBef = flagStr(args, "boe-bef");
if (boeBef) bef.boe = parseBef(read(boeBef), STATE_FIPS);

console.error("reading block attributes");
const blockCols = readDbf(zipFind(read(files[NV ? "nv-blocks" : "blocks"]!), /\.dbf$/), ["GEOID20", "HOUSING20", "INTPTLAT20", "INTPTLON20"]);
const homes = new Map<string, number>();
blockCols["GEOID20"]!.forEach((g, i) => homes.set(g, Number(blockCols["HOUSING20"]![i])));

if (NV) {
  // County: the block GEOID's county code. City: whether the block's internal point is inside the
  // city's (unsimplified) outline; 0 = outside. Neither has a Census equivalency file.
  const cityRings = layers.find((l) => l.kind === "city")!.districts.flatMap((d) => d.rings.map((r) => Float64Array.from(r.flat())));
  const county = new Map<string, number>();
  const city = new Map<string, number>();
  blockCols["GEOID20"]!.forEach((g, i) => {
    county.set(g, Number(g.slice(2, 5)));
    city.set(g, insideRings(cityRings, Number(blockCols["INTPTLON20"]![i]), Number(blockCols["INTPTLAT20"]![i])) ? 1 : 0);
  });
  bef.county = county;
  bef.city = city;
}

console.error(`reading ZCTA relationship file (state ${STATE_FIPS} rows)`);
const zipBlocks: ZipBlock[] = [];
/** ZCTA -> [total land area, land area inside the state] (m²), to flag ZCTAs that cross the state line. */
const zctaLand = new Map<string, [number, number]>();
const zipKinds: Kind[] = (["cd", "boe", "sd", "ad", "county", "city"] as Kind[]).filter((k) => bef[k]);
{
  const rl = readline.createInterface({ input: fs.createReadStream(files["zcta-blocks"]!, { encoding: "latin1" }), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.includes(`|${STATE_FIPS}`)) continue;
    const c = line.split("|");
    const zcta = c[1]!;
    const block = c[9]!;
    if (!zcta || !block.startsWith(STATE_FIPS) || block.length !== 15) continue;
    const land = zctaLand.get(zcta) ?? [Number(c[3]), 0];
    land[1] += Number(c[15]);
    zctaLand.set(zcta, land);
    const districts: Partial<Record<Kind, number>> = {};
    for (const k of zipKinds) {
      const n = bef[k]!.get(block);
      if (n !== undefined) districts[k] = n;
    }
    zipBlocks.push({ zcta, land: Number(c[15]), homes: homes.get(block) ?? 0, districts });
  }
}
// Stable order regardless of file order.
zipBlocks.sort((a, b) => (a.zcta < b.zcta ? -1 : a.zcta > b.zcta ? 1 : 0));
const crossState = new Set([...zctaLand].filter(([, [total, inState]]) => inState < total).map(([z]) => z));
const zips = encodeZipTable(zipBlocks, zipKinds, crossState);

const out: DistrictFile = {
  format: "ca-districts/1",
  state: STATE,
  election: `2026-${STATE}-general`,
  note: NV
    ? "U.S. House: 120th Congress districts. State Senate and Assembly: the districts the Census Bureau's 2026 files carry for Nevada. Counties and the City of Las Vegas: 2026 TIGER/Line boundaries. Outlines simplified; see geo/README.md."
    : "U.S. House: 120th Congress districts (Proposition 50 / AB 604 map). State Senate and Assembly" +
      (boeZip ? " and Board of Equalization" : "") +
      ": 2021 Citizens Redistricting Commission maps. Outlines simplified; see geo/README.md.",
  tolerance_m: encoded.tolerance_m,
  margin_m: encoded.margin_m,
  transform: encoded.transform,
  zip_layers: zipKinds,
  layers: encoded.layers,
  arcs: encoded.arcs,
  zips,
};
const text = serializeDistrictFile(out);
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, text);
console.error(`wrote ${path.relative(REPO_ROOT, OUT_FILE)} (${text.length} bytes, ${out.arcs.length} arcs)`);

// ---- verification
let verification: Record<string, unknown> | undefined;
if (args.flags.has("verify")) {
  const stride = Number(flagStr(args, "stride") ?? 10);
  console.error(`verifying every ${stride}th block`);
  const d = decode(out);
  const stats: Record<string, { checked: number; outside_margin: number; ambiguous_share_of_homes: number }> = {};
  const acc: Record<string, { checked: number; miss: number; homes: number; ambHomes: number }> = {};
  const geoids = blockCols["GEOID20"]!;
  for (let i = 0; i < geoids.length; i += stride) {
    const g = geoids[i]!;
    const lat = Number(blockCols["INTPTLAT20"]![i]);
    const lon = Number(blockCols["INTPTLON20"]![i]);
    const res = lookupPoint(d, lon, lat);
    for (const l of layers) {
      const want = bef[l.kind]?.get(g);
      if (want === undefined) continue;
      const a = (acc[l.kind] ??= { checked: 0, miss: 0, homes: 0, ambHomes: 0 });
      const hit = res.layers[l.kind]!;
      const h = homes.get(g) ?? 0;
      a.checked++;
      if (!hit.possible.includes(want)) a.miss++;
      a.homes += h;
      if (hit.possible.length > 1) a.ambHomes += h;
    }
  }
  for (const [k, a] of Object.entries(acc)) {
    stats[k] = { checked: a.checked, outside_margin: a.miss, ambiguous_share_of_homes: Math.round((1000 * a.ambHomes) / Math.max(1, a.homes)) / 1000 };
  }
  verification = {
    method:
      `Internal point (INTPTLAT20/INTPTLON20) of every ${stride}th 2020 census block, looked up in the generated file with no device error; checked that the block's district in the equivalency file is among the possible districts.` +
      (NV ? " County: the block GEOID's county code. City: the block point tested against the unsimplified 2026 city outline (no equivalency file exists)." : ""),
    results: stats,
  };
  console.error(JSON.stringify(stats));
}

const zipRows = zips ? zips.split(" ") : [];
const multi = (code: string) => zipRows.filter((r) => new RegExp(`(?:^|[:;])${code}\\d+/`).test(r.slice(6))).length;
const manifest = {
  output: {
    file: `geo/${OUT_NAME}`,
    bytes: Buffer.byteLength(text),
    sha256: crypto.createHash("sha256").update(text).digest("hex"),
    generated_by: "npm run import:districts",
    tolerance_m: out.tolerance_m,
    margin_m: out.margin_m,
    quantum_deg: params.quantumDeg,
    layers: Object.fromEntries(layers.map((l) => [l.kind, l.districts.length])),
    zip_codes: zipRows.length,
    zip_codes_crossing_state_line: crossState.size,
    zip_codes_split: Object.fromEntries(zipKinds.map((k) => [k, multi(ZIP_LAYER_CODE[k])])),
  },
  inputs: [...STATE_INPUTS, ...(boeInput ? [boeInput] : [])],
  ...(verification ? { verification } : {}),
};
const prev = fs.existsSync(MANIFEST) ? (JSON.parse(fs.readFileSync(MANIFEST, "utf8")) as Record<string, unknown>) : null;
// Keep the last verification when this run did not verify, so a plain re-import doesn't drop it.
if (!verification && prev?.["verification"] && (prev["output"] as Record<string, unknown>)?.["sha256"] === manifest.output.sha256) {
  (manifest as Record<string, unknown>)["verification"] = prev["verification"];
}
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
console.error(`wrote ${path.relative(REPO_ROOT, MANIFEST)}`);
