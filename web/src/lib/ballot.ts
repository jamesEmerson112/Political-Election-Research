/**
 * "My ballot": which contests are on one voter's California ballot.
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
 * Pure functions plus a try/catch-wrapped localStorage helper. Only district
 * numbers are ever stored, never an address, ZIP code or coordinates.
 */

export type DistrictKind = "cd" | "boe" | "sd" | "ad" | "county" | "sfsup";
export const DISTRICT_KINDS: DistrictKind[] = ["cd", "boe", "sd", "ad", "county", "sfsup"];

/** County FIPS codes (state 06) of the counties whose local contests this site covers. */
export const COUNTY_FIPS: Record<string, number> = { "san-francisco": 75 };
export const COUNTY_NAME: Record<number, string> = { 75: "San Francisco" };

/** The state whose ballot this logic describes. */
export const BALLOT_STATE = "ca";

/** Number of districts per kind (California). */
export const DISTRICT_COUNT: Record<DistrictKind, number> = { cd: 52, boe: 4, sd: 40, ad: 80, county: 115, sfsup: 11 };

export const DISTRICT_NAME: Record<DistrictKind, string> = {
  cd: "U.S. House",
  boe: "Board of Equalization",
  sd: "State Senate",
  ad: "State Assembly",
  county: "County",
  sfsup: "SF Supervisor district",
};

/** Short label for one district: CA-11, BOE 2, SD 11, AD 17. */
export function districtLabel(kind: DistrictKind, n: number): string {
  if (kind === "cd") return `CA-${n}`;
  if (kind === "county") return COUNTY_NAME[n] ?? `County ${n}`;
  if (kind === "sfsup") return `SF D${n}`;
  return `${kind.toUpperCase()} ${n}`;
}

export type Placement =
  | { scope: "statewide" }
  | { scope: "district"; kind: DistrictKind; n: number }
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
  if (state !== BALLOT_STATE) return { scope: "unmatched", reason: "Not a California contest" };

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

/** A voter's districts. Several numbers for one kind mean "one of these" (an ambiguous ZIP or location). */
export type Choice = Partial<Record<DistrictKind, number[]>>;

export function normalizeChoice(c: Choice | null | undefined): Choice {
  const out: Choice = {};
  for (const k of DISTRICT_KINDS) {
    const v = c?.[k];
    if (!Array.isArray(v)) continue;
    const ns = [...new Set(v.filter((n) => Number.isInteger(n) && n >= 1 && n <= DISTRICT_COUNT[k]))].sort((a, b) => a - b);
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
  if (p.scope === "statewide") return "on";
  if (p.scope === "unmatched") return "unmatched";
  const set = c[p.kind];
  if (!set?.length) return "pick";
  return set.includes(p.n) ? "on" : "off";
}

/** "CA-11 · BOE 2", or "CA-11 or CA-15 · BOE 2". */
export function choiceSummary(c: Choice): string {
  return DISTRICT_KINDS.filter((k) => c[k]?.length)
    .map((k) => c[k]!.map((n) => districtLabel(k, n)).join(" or "))
    .join(" · ");
}

/** Query-string form for the URL hash: cd=11&boe=2 (several: cd=11,15). */
export function serializeChoice(c: Choice): string {
  const n = normalizeChoice(c);
  return DISTRICT_KINDS.filter((k) => n[k])
    .map((k) => `${k}=${n[k]!.join(",")}`)
    .join("&");
}

export function parseChoice(query: string): Choice {
  const out: Choice = {};
  for (const part of query.replace(/^[?#]/, "").split("&")) {
    const [k, v] = part.split("=");
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

/** Saves only the district numbers. Returns false when storage is unavailable. */
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
