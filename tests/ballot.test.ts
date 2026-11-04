import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_DATA_DIR, REPO_ROOT } from "../src/paths.js";
import {
  ballotStatus,
  districtLabel,
  choiceSummary,
  forgetChoice,
  isEmptyChoice,
  loadChoice,
  normalizeChoice,
  parseChoice,
  placeContest,
  saveChoice,
  senateSeatUp2026,
  serializeChoice,
  type Placement,
} from "../web/src/lib/ballot.js";

function agendas(dir: string): Array<{ contest: string; office_ref?: string; kind: "office" | "measure" }> {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
}

describe("placeContest on the real 2026 agendas", () => {
  const all = agendas(path.join(DEFAULT_DATA_DIR, "agenda", "2026-ca-general"));
  const placed = all.map((a) => ({ a, p: placeContest(a.contest, a.office_ref, a.kind) }));

  it("places every contest: 8 statewide, 4 BOE, 52 House, SF supervisor and Assembly districts", () => {
    // Only special districts (BART) are left for the voter's sample ballot.
    expect(placed.filter(({ a, p }) => p.scope === "unmatched" && !/\/bart-board-district-\d+$/.test(a.contest))).toEqual([]);
    expect(placed.filter(({ p }) => p.scope === "statewide")).toHaveLength(8);
    const nums = (kind: string) =>
      placed
        .map(({ p }) => p)
        .filter((p): p is Extract<Placement, { scope: "district" }> => p.scope === "district" && p.kind === kind)
        .map((p) => p.n)
        .sort((x, y) => x - y);
    expect(nums("boe")).toEqual([1, 2, 3, 4]);
    expect(nums("cd")).toEqual(Array.from({ length: 52 }, (_, i) => i + 1));
    expect(nums("sfsup")).toEqual([2, 4, 6, 8, 10]);
    expect(nums("ad")).toEqual([17, 19]);
    expect(placeContest("contest:2026-ca-general/bart-board-district-8")).toEqual({ scope: "unmatched", reason: "BART districts aren't placed yet" });
  });

  it("uses the number in the contest id", () => {
    for (const { a, p } of placed) {
      const m = /-(\d+)$/.exec(a.contest);
      if (m && !/\/bart-board-district-/.test(a.contest)) expect(p).toMatchObject({ scope: "district", n: Number(m[1]) });
    }
  });
});

describe("placeContest elsewhere", () => {
  it("leaves the fictional demo contests unmatched", () => {
    const fx = path.join(REPO_ROOT, "tests", "fixtures", "valid", "data");
    for (const a of agendas(path.join(fx, "agenda", "2030-zz-general"))) {
      expect(placeContest(a.contest, a.office_ref, a.kind)).toEqual({ scope: "unmatched", reason: "Not a California or Nevada contest" });
    }
    expect(placeContest("contest:2030-zz-general/prop-1", undefined, "measure").scope).toBe("unmatched");
  });

  it("extends to Assembly and Senate contests", () => {
    expect(placeContest("contest:2026-ca-general/state-assembly-17", "office:california-assembly-member")).toEqual({ scope: "district", st: "ca", kind: "ad", n: 17 });
    expect(placeContest("contest:2026-ca-general/state-senate-12", "office:california-state-senator")).toEqual({ scope: "district", st: "ca", kind: "sd", n: 12 });
    expect(placeContest("contest:2026-ca-general/assembly-80")).toEqual({ scope: "district", st: "ca", kind: "ad", n: 80 });
  });

  it("places statewide propositions, not local measures", () => {
    expect(placeContest("contest:2026-ca-general/prop-50", undefined, "measure")).toEqual({ scope: "statewide", st: "ca" });
    expect(placeContest("contest:2026-ca-general/san-francisco-measure-a", undefined, "measure").scope).toBe("unmatched");
  });

  it("places San Francisco local contests by county (FIPS 75) and supervisor district", () => {
    expect(placeContest("contest:2026-ca-general/sf-prop-a", undefined, "measure")).toEqual({ scope: "district", st: "ca", kind: "county", n: 75 });
    expect(placeContest("contest:2026-ca-general/sf-board-of-education", "office:sfusd-board-of-education-member")).toEqual({ scope: "district", st: "ca", kind: "county", n: 75 });
    expect(placeContest("contest:2026-ca-general/sf-community-college-board")).toEqual({ scope: "district", st: "ca", kind: "county", n: 75 });
    for (const s of ["sf-community-college-board-partial-term", "sf-assessor-recorder", "sf-public-defender"]) expect(placeContest(`contest:2026-ca-general/${s}`)).toEqual({ scope: "district", st: "ca", kind: "county", n: 75 });
    expect(placeContest("contest:2026-ca-general/sf-supervisor-district-6", "office:san-francisco-supervisor")).toEqual({ scope: "district", st: "ca", kind: "sfsup", n: 6 });
    const sfVoter = { cd: [11], county: [75], sfsup: [6] };
    expect(ballotStatus({ scope: "district", st: "ca", kind: "county", n: 75 }, sfVoter)).toBe("on");
    expect(ballotStatus({ scope: "district", st: "ca", kind: "sfsup", n: 8 }, sfVoter)).toBe("off");
    expect(ballotStatus({ scope: "district", st: "ca", kind: "county", n: 75 }, { cd: [11] })).toBe("pick");
    expect(districtLabel("county", 75)).toBe("San Francisco");
    expect(districtLabel("sfsup", 6)).toBe("SF D6");
  });

  it("refuses what it can't place with confidence", () => {
    const reason = (ref: string, office?: string) => {
      const p = placeContest(ref, office);
      return p.scope === "unmatched" ? p.reason : p.scope;
    };
    expect(reason("contest:2026-ca-general/san-francisco-supervisor-5", "office:san-francisco-supervisor")).toBe("No district number in the contest id");
    expect(reason("contest:2026-ca-general/us-house-ca-53")).toBe("District number out of range");
    expect(reason("contest:2026-ca-general/us-house-nv-3")).toBe("Office not placed on the ballot yet");
    expect(reason("contest:2026-ca-general/us-house-ca-11", "office:california-state-senator")).toBe("Contest id and office disagree");
    expect(reason("contest:2026-ca-general/board-of-equalization", "office:california-board-of-equalization-member")).toBe(
      "No district number in the contest id",
    );
    expect(reason("contest:2026-ca-general/governor")).toBe("statewide");
    expect(reason("contest:2026-ca-general/mayor")).toBe("Office not placed on the ballot yet");
  });
});

describe("ballot status", () => {
  const cd11: Placement = { scope: "district", st: "ca", kind: "cd", n: 11 };
  const boe2: Placement = { scope: "district", st: "ca", kind: "boe", n: 2 };
  it("filters by the voter's districts", () => {
    const c = { cd: [11] };
    expect(ballotStatus({ scope: "statewide", st: "ca" }, c)).toBe("on");
    expect(ballotStatus(cd11, c)).toBe("on");
    expect(ballotStatus({ scope: "district", st: "ca", kind: "cd", n: 12 }, c)).toBe("off");
    expect(ballotStatus(boe2, c)).toBe("pick");
    expect(ballotStatus({ scope: "unmatched", reason: "x" }, c)).toBe("unmatched");
  });
  it("keeps every possible district of an ambiguous choice", () => {
    expect(ballotStatus(cd11, { cd: [11, 15] })).toBe("on");
    expect(choiceSummary({ cd: [15, 11], boe: [2] })).toBe("CA-15 or CA-11 · BOE 2");
    expect(choiceSummary(normalizeChoice({ cd: [15, 11], boe: [2] }))).toBe("CA-11 or CA-15 · BOE 2");
  });
});

describe("choice serialization", () => {
  it("round-trips through the hash", () => {
    expect(serializeChoice({ boe: [2], cd: [15, 11] })).toBe("cd=11,15&boe=2");
    expect(parseChoice("cd=11,15&boe=2")).toEqual({ cd: [11, 15], boe: [2] });
    expect(parseChoice("?cd=11")).toEqual({ cd: [11] });
  });
  it("drops garbage and out-of-range values", () => {
    expect(parseChoice("cd=0,53,11x,7&boe=5&zip=94110&lat=37.7&sd=40")).toEqual({ cd: [7], sd: [40] });
    expect(isEmptyChoice(parseChoice("foo=bar"))).toBe(true);
    expect(serializeChoice({})).toBe("");
  });
  it("knows which Senate seats are up in 2026", () => {
    expect(senateSeatUp2026(12)).toBe(true);
    expect(senateSeatUp2026(11)).toBe(false);
  });
});

describe("storage", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  });
  function fake(): Map<string, string> {
    const m = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => m.set(k, v), removeItem: (k: string) => m.delete(k) },
    });
    return m;
  }

  it("stores only district numbers", () => {
    const m = fake();
    expect(saveChoice({ cd: [11], boe: [2] })).toBe(true);
    expect([...m.values()]).toEqual(['{"v":1,"cd":[11],"boe":[2]}']);
    expect(loadChoice()).toEqual({ cd: [11], boe: [2] });
    forgetChoice();
    expect(m.size).toBe(0);
    expect(loadChoice()).toEqual({});
  });
  it("ignores unexpected stored values", () => {
    const m = fake();
    m.set("per-my-ballot", "not json");
    expect(loadChoice()).toEqual({});
    m.set("per-my-ballot", '{"v":2,"cd":[11]}');
    expect(loadChoice()).toEqual({});
  });
  it("works when storage throws", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError");
      },
    });
    expect(loadChoice()).toEqual({});
    expect(saveChoice({ cd: [11] })).toBe(false);
    expect(() => forgetChoice()).not.toThrow();
  });
});

describe("Nevada (Las Vegas ballots)", () => {
  const nvAgendas = agendas(path.join(DEFAULT_DATA_DIR, "agenda", "2026-nv-general"));
  const place = (slug: string, kind?: "office" | "measure") => placeContest(`contest:2026-nv-general/${slug}`, undefined, kind);

  it("places every Nevada placeholder contest", () => {
    expect(nvAgendas.length).toBeGreaterThan(100);
    expect(nvAgendas.filter((a) => placeContest(a.contest, a.office_ref, a.kind).scope === "unmatched").map((a) => a.contest)).toEqual([]);
  });
  it("places each slug pattern", () => {
    expect(place("governor")).toEqual({ scope: "statewide", st: "nv" });
    expect(place("question-6", "measure")).toEqual({ scope: "statewide", st: "nv" });
    expect(place("supreme-court-seat-b")).toEqual({ scope: "statewide", st: "nv" });
    expect(place("us-house-nv-3")).toEqual({ scope: "district", st: "nv", kind: "cd", n: 3 });
    expect(place("state-senate-21")).toEqual({ scope: "district", st: "nv", kind: "sd", n: 21 });
    expect(place("assembly-37")).toEqual({ scope: "district", st: "nv", kind: "ad", n: 37 });
    expect(place("board-of-regents-8")).toEqual({ scope: "district", st: "nv", kind: "regent", n: 8 });
    expect(place("las-vegas-council-ward-2")).toEqual({ scope: "district", st: "nv", kind: "ward", n: 2 });
    expect(place("clark-county-commission-e")).toEqual({ scope: "district", st: "nv", kind: "comm", n: 5 });
    expect(place("ccsd-trustee-d")).toEqual({ scope: "district", st: "nv", kind: "ccsd", n: 4 });
    expect(place("clark-county-assessor")).toEqual({ scope: "district", st: "nv", kind: "county", n: 3 });
    expect(place("district-court-family-dept-q")).toEqual({ scope: "district", st: "nv", kind: "county", n: 3 });
    expect(place("district-court-dept-32")).toEqual({ scope: "district", st: "nv", kind: "county", n: 3 });
    expect(place("las-vegas-municipal-court-dept-1")).toEqual({ scope: "district", st: "nv", kind: "city", n: 1 });
    expect(place("us-house-nv-5").scope).toBe("unmatched");
    expect(place("mayor").scope).toBe("unmatched");
  });
  it("never mixes the two states' ballots", () => {
    const nv = normalizeChoice({ st: "nv", cd: [1], sd: [2], ad: [11], county: [3], city: [1] });
    expect(ballotStatus(place("governor"), nv)).toBe("on");
    expect(ballotStatus(placeContest("contest:2026-ca-general/governor"), nv)).toBe("off");
    expect(ballotStatus(placeContest("contest:2026-ca-general/us-house-ca-1"), nv)).toBe("off");
    expect(ballotStatus(place("governor"), { cd: [11] })).toBe("off");
    expect(ballotStatus(place("us-house-nv-1"), nv)).toBe("on");
    expect(ballotStatus(place("us-house-nv-3"), nv)).toBe("off");
    expect(ballotStatus(place("las-vegas-municipal-court-dept-1"), nv)).toBe("on");
    expect(ballotStatus(place("ccsd-trustee-d"), nv)).toBe("pick");
  });
  it("leaves city contests off a ballot outside the City of Las Vegas, and on when the ZIP is split", () => {
    const outside = normalizeChoice({ st: "nv", cd: [1], county: [3], city: [0] });
    expect(ballotStatus(place("las-vegas-municipal-court-dept-1"), outside)).toBe("off");
    expect(ballotStatus(place("las-vegas-council-ward-2"), outside)).toBe("off");
    expect(ballotStatus(place("clark-county-clerk"), outside)).toBe("on");
    const split = normalizeChoice({ st: "nv", city: [0, 1] });
    expect(ballotStatus(place("las-vegas-municipal-court-dept-1"), split)).toBe("on");
    expect(ballotStatus(place("las-vegas-council-ward-2"), split)).toBe("pick");
  });
  it("labels Nevada districts", () => {
    expect(choiceSummary(normalizeChoice({ st: "nv", cd: [1], sd: [2], ad: [11, 6], city: [1] }))).toBe("NV-1 · SD 2 · AD 6 or AD 11 · City of Las Vegas");
    expect(districtLabel("comm", 5, "nv")).toBe("Commission E");
    expect(districtLabel("county", 3, "nv")).toBe("Clark County");
    expect(districtLabel("city", 0, "nv")).toBe("Outside the City of Las Vegas");
  });
  it("round-trips st=nv through the hash and storage, and keeps old California choices", () => {
    const c = normalizeChoice({ st: "nv", cd: [4], city: [0, 1], comm: [5] });
    expect(serializeChoice(c)).toBe("st=nv&cd=4&city=0,1&comm=5");
    expect(parseChoice("st=nv&cd=4&city=0,1&comm=5")).toEqual(c);
    expect(parseChoice("cd=11")).toEqual({ cd: [11] });
    // Nevada ranges: NV-5 doesn't exist; California's CA-11 isn't a Nevada district.
    expect(parseChoice("st=nv&cd=5,11&sd=21&ad=43")).toEqual({ st: "nv", sd: [21] });
    // A California choice has no city (0 is never a California district).
    expect(parseChoice("city=0,1")).toEqual({});
  });
});

describe("storage (Nevada)", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  });
  it("stores the state with the district numbers, and reads old California entries", () => {
    const m = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => m.set(k, v), removeItem: (k: string) => m.delete(k) },
    });
    expect(saveChoice({ st: "nv", cd: [1], city: [1] })).toBe(true);
    expect([...m.values()]).toEqual(['{"v":1,"st":"nv","cd":[1],"city":[1]}']);
    expect(loadChoice()).toEqual({ st: "nv", cd: [1], city: [1] });
    m.set("per-my-ballot", '{"v":1,"cd":[11],"boe":[2]}');
    expect(loadChoice()).toEqual({ cd: [11], boe: [2] });
  });
});
