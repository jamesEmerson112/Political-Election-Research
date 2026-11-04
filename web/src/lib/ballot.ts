/**
 * "My ballot": which contests are on one voter's ballot, in California or in
 * Nevada (Las Vegas). A choice holds one state (`st`, missing = California).
 *
 * - Everyone votes on the statewide offices and statewide propositions.
 * - District contests depend on the districts of the voter's registered home
 *   address: U.S. House (cd), Board of Equalization (boe), State Senate (sd),
 *   State Assembly (ad).
 * - Local contests: county-wide ones (local measures, school and college
 *   boards) use the county's FIPS code as the district number (kind "county";
 *   San Francisco = 75), and San Francisco supervisor races use kind "sfsup"
 *   (districts 1-11). Both are picked by hand until boundary data exists.
 *
 * - Nevada (Las Vegas ballots): U.S. House, State Senate and Assembly (cd, sd,
 *   ad), the county (FIPS; Clark = 3), the City of Las Vegas (city: 1 = in the
 *   city, 0 = outside it), and local districts picked by hand: City Council
 *   ward, County Commission district and school trustee district (letters A-G
 *   stored as 1-7), and Board of Regents district.
 *
 * Pure functions plus a try/catch-wrapped localStorage helper. Only district
 * numbers and the state are ever stored, never an address, ZIP code or
 * coordinates.
 */

export type DistrictKind = "cd" | "boe" | "sd" | "ad" | "county" | "sfsup" | "city" | "ward" | "comm" | "ccsd" | "regent";
export const DISTRICT_KINDS: DistrictKind[] = ["cd", "boe", "sd", "ad", "county", "sfsup", "city", "ward", "comm", "ccsd", "regent"];

/** States whose ballots My ballot can narrow. */
export type BallotState = "ca" | "nv";
export const BALLOT_STATES: BallotState[] = ["ca", "nv"];

/** County FIPS codes (state 06) of the counties whose local contests this site covers. */
export const COUNTY_FIPS: Record<string, number> = { "san-francisco": 75 };
export const COUNTY_NAME: Record<number, string> = { 75: "San Francisco" };
/** Nevada county FIPS codes (state 32) used here, and their names. */
export const NV_COUNTY_FIPS: Record<string, number> = { clark: 3 };
export const NV_COUNTY_NAME: Record<number, string> = {
  1: "Churchill County",
  3: "Clark County",
  5: "Douglas County",
  7: "Elko County",
  9: "Esmeralda County",
  11: "Eureka County",
  13: "Humboldt County",
  15: "Lander County",
  17: "Lincoln County",
  19: "Lyon County",
  21: "Mineral County",
  23: "Nye County",
  27: "Pershing County",
  29: "Storey County",
  31: "Washoe County",
  33: "White Pine County",
  510: "Carson City",
};

/** The state a choice is for (a choice without `st` is California's: saved choices and links from before Nevada keep working). */
export function stateOfChoice(c: Choice): BallotState {
  return c.st === "nv" ? "nv" : "ca";
}

/** Number of districts per kind (California). */
export const DISTRICT_COUNT: Record<DistrictKind, number> = {
  cd: 52,
  boe: 4,
  sd: 40,
  ad: 80,
  county: 115,
  sfsup: 11,
  city: 0,
  ward: 0,
  comm: 0,
  ccsd: 0,
  regent: 0,
};
/** Number of districts per kind (Nevada). `city` is 0 (outside the City of Las Vegas) or 1 (inside). */
export const NV_DISTRICT_COUNT: Record<DistrictKind, number> = {
  cd: 4,
  boe: 0,
  sd: 21,
  ad: 42,
  county: 510,
  sfsup: 0,
  city: 1,
  ward: 6,
  comm: 7,
  ccsd: 7,
  regent: 13,
};
export function districtCount(st: BallotState, kind: DistrictKind): number {
  return (st === "nv" ? NV_DISTRICT_COUNT : DISTRICT_COUNT)[kind];
}
/** Lowest valid number: 0 means "outside the city" for `city`, every other kind starts at 1. */
function districtMin(kind: DistrictKind): number {
  return kind === "city" ? 0 : 1;
}
/** Kinds a state's choice can hold. */
export function kindsOf(st: BallotState): DistrictKind[] {
  return DISTRICT_KINDS.filter((k) => districtCount(st, k) > 0);
}

export const DISTRICT_NAME: Record<DistrictKind, string> = {
  cd: "U.S. House",
  boe: "Board of Equalization",
  sd: "State Senate",
  ad: "State Assembly",
  county: "County",
  sfsup: "SF Supervisor district",
  city: "City of Las Vegas",
  ward: "Las Vegas City Council ward",
  comm: "Clark County Commission district",
  ccsd: "School board (CCSD) trustee district",
  regent: "Board of Regents district",
};

/** Letter districts (County Commission and CCSD trustee districts A-G) are stored as numbers 1-7. */
export const LETTER_KINDS: ReadonlySet<DistrictKind> = new Set(["comm", "ccsd"]);
export function letterOf(n: number): string {
  return String.fromCharCode(64 + n);
}
function numberOfLetter(letter: string): number {
  return letter.toUpperCase().charCodeAt(0) - 64;
}

/** Short label for one district: CA-11, BOE 2, SD 11, AD 17; in Nevada NV-1, SD 8, Ward 2, Commission E. */
export function districtLabel(kind: DistrictKind, n: number, st: BallotState = "ca"): string {
  if (st === "nv") {
    if (kind === "cd") return `NV-${n}`;
    if (kind === "county") return NV_COUNTY_NAME[n] ?? `County ${n}`;
    if (kind === "city") return n === 1 ? "City of Las Vegas" : "Outside the City of Las Vegas";
    if (kind === "ward") return `Ward ${n}`;
    if (kind === "comm") return `Commission ${letterOf(n)}`;
    if (kind === "ccsd") return `Trustee ${letterOf(n)}`;
    if (kind === "regent") return `Regent ${n}`;
    return `${kind.toUpperCase()} ${n}`;
  }
  if (kind === "cd") return `CA-${n}`;
  if (kind === "county") return COUNTY_NAME[n] ?? `County ${n}`;
  if (kind === "sfsup") return `SF D${n}`;
  return `${kind.toUpperCase()} ${n}`;
}

export type Placement =
  | { scope: "statewide"; st: BallotState }
  | { scope: "district"; st: BallotState; kind: DistrictKind; n: number }
  | { scope: "unmatched"; reason: string };

/** office record id (office_ref without "office:") -> district kind. */
const DISTRICT_OFFICES: Record<string, DistrictKind> = {
  "us-representative-california": "cd",
  "california-board-of-equalization-member": "boe",
  "california-state-senator": "sd",
  "california-assembly-member": "ad",
  "san-francisco-supervisor": "sfsup",
};

/** County-wide local offices -> county FIPS code. */
const COUNTYWIDE_OFFICES: Record<string, number> = {
  "sfusd-board-of-education-member": 75,
  "sfccd-board-of-trustees-member": 75,
};
const COUNTYWIDE_SLUGS: Record<string, number> = {
  "sf-board-of-education": 75,
  "sf-community-college-board": 75,
  "sf-community-college-board-partial-term": 75,
  "sf-assessor-recorder": 75,
  "sf-public-defender": 75,
};
/** Local measure slugs: <county prefix>-prop-<letter or number>. */
const LOCAL_MEASURE_PREFIX: Record<string, number> = { sf: 75 };

/** Offices every California voter elects. */
const STATEWIDE_OFFICES = new Set([
  "california-governor",
  "california-lieutenant-governor",
  "california-attorney-general",
  "california-secretary-of-state",
  "california-controller",
  "california-treasurer",
  "california-insurance-commissioner",
  "california-superintendent-of-public-instruction",
]);

/** Contest slugs for the same statewide offices (used when a contest has no office_ref). */
const STATEWIDE_SLUGS = new Set([
  "governor",
  "lieutenant-governor",
  "attorney-general",
  "secretary-of-state",
  "controller",
  "treasurer",
  "insurance-commissioner",
  "superintendent-of-public-instruction",
]);

/** Contest slug -> district kind and number. us-house carries a state code that must match the election's. */
function districtFromSlug(slug: string, state: string): { kind: DistrictKind; n: number } | null {
  const house = /^us-house-([a-z]{2})-(\d+)$/.exec(slug);
  if (house) return house[1] === state ? { kind: "cd", n: Number(house[2]) } : null;
  const rules: Array<[RegExp, DistrictKind]> = [
    [/^board-of-equalization-(\d+)$/, "boe"],
    [/^(?:state-senate|senate)-(\d+)$/, "sd"],
    [/^(?:state-assembly|assembly)-(\d+)$/, "ad"],
    [/^sf-supervisor-district-(\d+)$/, "sfsup"],
  ];
  for (const [re, kind] of rules) {
    const m = re.exec(slug);
    if (m) return { kind, n: Number(m[1]) };
  }
  return null;
}

/**
 * Where a contest sits on a California ballot, from its id
 * (contest:<year>-<state>-<type>/<slug>) and the office it elects.
 * Anything it can't place with confidence is "unmatched", with a reason.
 */
export function placeContest(contestRef: string, officeRef?: string | null, kind?: "office" | "measure"): Placement {
  const id = contestRef.startsWith("contest:") ? contestRef.slice("contest:".length) : contestRef;
  const [election = "", slug = ""] = id.split("/");
  const state = election.split("-")[1] ?? "";
  if (state === "nv") return placeNevada(slug);
  if (state !== "ca") return { scope: "unmatched", reason: "Not a California or Nevada contest" };
  const p = placeCalifornia(slug, state, officeRef, kind);
  return p.scope === "unmatched" ? p : { ...p, st: "ca" } as Placement;
}

/** Contests on City of Las Vegas ballots (Nevada placeholders): fixed slug patterns, see docs/RESEARCH_GUIDE.md. */
const NV_STATEWIDE = new Set(["governor", "lieutenant-governor", "attorney-general", "secretary-of-state", "treasurer", "controller", "us-senate"]);
const NV_CLARK = NV_COUNTY_FIPS["clark"]!;

function placeNevada(slug: string): Placement {
  const st: BallotState = "nv";
  if (NV_STATEWIDE.has(slug) || /^question-\d+$/.test(slug) || /^supreme-court-seat-[a-z]$/.test(slug) || /^court-of-appeals-dept-\d+$/.test(slug)) {
    return { scope: "statewide", st };
  }
  const numbered: Array<[RegExp, DistrictKind]> = [
    [/^us-house-nv-(\d+)$/, "cd"],
    [/^state-senate-(\d+)$/, "sd"],
    [/^assembly-(\d+)$/, "ad"],
    [/^board-of-regents-(\d+)$/, "regent"],
    [/^las-vegas-council-ward-(\d+)$/, "ward"],
  ];
  for (const [re, kind] of numbered) {
    const m = re.exec(slug);
    if (!m) continue;
    const n = Number(m[1]);
    return n >= 1 && n <= NV_DISTRICT_COUNT[kind] ? { scope: "district", st, kind, n } : { scope: "unmatched", reason: "District number out of range" };
  }
  const lettered: Array<[RegExp, DistrictKind]> = [
    [/^clark-county-commission-([a-g])$/, "comm"],
    [/^ccsd-trustee-([a-g])$/, "ccsd"],
  ];
  for (const [re, kind] of lettered) {
    const m = re.exec(slug);
    if (m) return { scope: "district", st, kind, n: numberOfLetter(m[1]!) };
  }
  // The Las Vegas Municipal Court is elected by the whole city.
  if (/^las-vegas-municipal-court-dept-\d+$/.test(slug)) return { scope: "district", st, kind: "city", n: 1 };
  // Clark County offices and the Eighth Judicial District Court (Clark County) are elected county-wide.
  if (/^clark-county-[a-z-]+$/.test(slug) || /^district-court-(?:family-)?dept-[a-z0-9]+$/.test(slug)) return { scope: "district", st, kind: "county", n: NV_CLARK };
  return { scope: "unmatched", reason: "Office not placed on the ballot yet" };
}

type CaPlacement = { scope: "statewide" } | { scope: "district"; kind: DistrictKind; n: number } | { scope: "unmatched"; reason: string };

function placeCalifornia(slug: string, state: string, officeRef?: string | null, kind?: "office" | "measure"): CaPlacement {
  // Special districts (BART) have no district layer here yet; the voter's sample ballot shows theirs.
  if (/^bart-board-district-\d+$/.test(slug)) return { scope: "unmatched", reason: "BART districts aren't placed yet" };

  if (kind === "measure" || /^prop-\d+$/.test(slug) || /-prop-[a-z0-9]+$/.test(slug)) {
    if (/^prop-\d+$/.test(slug)) return { scope: "statewide" };
    const local = /^([a-z]+)-prop-[a-z0-9]+$/.exec(slug);
    const county = local ? LOCAL_MEASURE_PREFIX[local[1]!] : undefined;
    return county ? { scope: "district", kind: "county", n: county } : { scope: "unmatched", reason: "Local measures aren't placed yet" };
  }

  const fromSlug = districtFromSlug(slug, state);
  const office = officeRef?.startsWith("office:") ? officeRef.slice("office:".length) : (officeRef ?? undefined);
  const countywide = (office ? COUNTYWIDE_OFFICES[office] : undefined) ?? COUNTYWIDE_SLUGS[slug];
  if (countywide) return { scope: "district", kind: "county", n: countywide };
  const officeKind: DistrictKind | "statewide" | undefined = office
    ? (DISTRICT_OFFICES[office] ?? (STATEWIDE_OFFICES.has(office) ? "statewide" : undefined))
    : undefined;

  if (office && !officeKind) return { scope: "unmatched", reason: "Office not placed on the ballot yet" };

  if (fromSlug) {
    if (officeKind && officeKind !== fromSlug.kind) return { scope: "unmatched", reason: "Contest id and office disagree" };
    if (!Number.isInteger(fromSlug.n) || fromSlug.n < 1 || fromSlug.n > DISTRICT_COUNT[fromSlug.kind]) {
      return { scope: "unmatched", reason: "District number out of range" };
    }
    return { scope: "district", kind: fromSlug.kind, n: fromSlug.n };
  }
  if (officeKind && officeKind !== "statewide") return { scope: "unmatched", reason: "No district number in the contest id" };
  if (officeKind === "statewide" || STATEWIDE_SLUGS.has(slug)) return { scope: "statewide" };
  return { scope: "unmatched", reason: "Office not placed on the ballot yet" };
}

/**
 * A voter's districts. Several numbers for one kind mean "one of these" (an
 * ambiguous ZIP or location). `st` is "nv" for a Nevada ballot; it is left
 * out for California.
 */
export type Choice = Partial<Record<DistrictKind, number[]>> & { st?: BallotState };

export function normalizeChoice(c: Choice | null | undefined): Choice {
  const st: BallotState = c?.st === "nv" ? "nv" : "ca";
  const out: Choice = st === "nv" ? { st } : {};
  for (const k of DISTRICT_KINDS) {
    const v = c?.[k];
    if (!Array.isArray(v)) continue;
    const max = districtCount(st, k);
    if (!max) continue;
    const ns = [...new Set(v.filter((n) => Number.isInteger(n) && n >= districtMin(k) && n <= max))].sort((a, b) => a - b);
    if (ns.length) out[k] = ns;
  }
  return out;
}

export function isEmptyChoice(c: Choice): boolean {
  return DISTRICT_KINDS.every((k) => !c[k]?.length);
}

export type BallotStatus = "on" | "off" | "pick" | "unmatched";

/**
 * on: on this voter's ballot. off: not on it. pick: a district contest of a
 * kind the voter hasn't set (shown under "Pick your district"). unmatched: the
 * contest couldn't be placed.
 */
export function ballotStatus(p: Placement, c: Choice): BallotStatus {
  if (p.scope === "unmatched") return "unmatched";
  // Another state's contests are never on this voter's ballot.
  if (p.st !== stateOfChoice(c)) return "off";
  if (p.scope === "statewide") return "on";
  // City Council wards only exist inside the City of Las Vegas.
  if (p.kind === "ward" && c.city?.length && !c.city.includes(1)) return "off";
  const set = c[p.kind];
  if (!set?.length) return "pick";
  return set.includes(p.n) ? "on" : "off";
}

/** "CA-11 · BOE 2", or "CA-11 or CA-15 · BOE 2"; Nevada: "NV-1 · SD 8 · AD 6". */
export function choiceSummary(c: Choice): string {
  const st = stateOfChoice(c);
  return DISTRICT_KINDS.filter((k) => c[k]?.length)
    .map((k) => (k === "city" && c[k]!.length > 1 ? "in or outside the City of Las Vegas" : c[k]!.map((n) => districtLabel(k, n, st)).join(" or ")))
    .join(" · ");
}

/** Query-string form for the URL hash: cd=11&boe=2 (several: cd=11,15); Nevada starts with st=nv. */
export function serializeChoice(c: Choice): string {
  const n = normalizeChoice(c);
  return [
    ...(n.st === "nv" ? ["st=nv"] : []),
    ...DISTRICT_KINDS.filter((k) => n[k]).map((k) => `${k}=${n[k]!.join(",")}`),
  ].join("&");
}

export function parseChoice(query: string): Choice {
  const out: Choice = {};
  for (const part of query.replace(/^[?#]/, "").split("&")) {
    const [k, v] = part.split("=");
    if (k === "st" && v === "nv") {
      out.st = "nv";
      continue;
    }
    if (!k || v === undefined || !(DISTRICT_KINDS as string[]).includes(k)) continue;
    out[k as DistrictKind] = v
      .split(",")
      .filter((s) => /^\d{1,3}$/.test(s))
      .map(Number);
  }
  return normalizeChoice(out);
}

/** Senate seats on the November 2026 ballot: the even-numbered districts. */
export function senateSeatUp2026(n: number): boolean {
  return n % 2 === 0;
}

const STORAGE_KEY = "per-my-ballot";

/** The saved districts, or an empty choice when storage is empty, unavailable or holds anything unexpected. */
export function loadChoice(): Choice {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return {};
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object" || (v as { v?: unknown }).v !== 1) return {};
    return normalizeChoice(v as Choice);
  } catch {
    return {};
  }
}

/** Saves only the district numbers (and the state). Returns false when storage is unavailable. */
export function saveChoice(c: Choice): boolean {
  try {
    const n = normalizeChoice(c);
    if (isEmptyChoice(n)) globalThis.localStorage?.removeItem(STORAGE_KEY);
    else globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ v: 1, ...n }));
    return !!globalThis.localStorage;
  } catch {
    return false;
  }
}

export function forgetChoice(): void {
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable: nothing was saved */
  }
}

/** Official places to confirm a ballot (California Secretary of State). */
export const OFFICIAL_LINKS = {
  voterStatus: { label: "My Voter Status", url: "https://voterstatus.sos.ca.gov" },
  countyOffices: { label: "County elections offices", url: "https://www.sos.ca.gov/elections/voting-resources/county-elections-offices" },
};
/** Official places to confirm a Las Vegas ballot (Clark County Election Department). */
export const NV_OFFICIAL_LINKS = {
  voterLookup: { label: "Clark County voter lookup", url: "https://elections.clarkcountynv.gov/VoterRequests/" },
  election: { label: "Clark County Election Department", url: "https://www.clarkcountynv.gov/government/departments/elections" },
};
