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

  it("places every contest: 8 statewide, 4 BOE, 52 House, SF supervisor districts", () => {
    expect(placed.filter(({ p }) => p.scope === "unmatched")).toEqual([]);
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
  });

  it("uses the number in the contest id", () => {
    for (const { a, p } of placed) {
      const m = /-(\d+)$/.exec(a.contest);
      if (m) expect(p).toMatchObject({ scope: "district", n: Number(m[1]) });
    }
  });
});

describe("placeContest elsewhere", () => {
  it("leaves the fictional demo contests unmatched", () => {
    const fx = path.join(REPO_ROOT, "tests", "fixtures", "valid", "data");
    for (const a of agendas(path.join(fx, "agenda", "2030-zz-general"))) {
      expect(placeContest(a.contest, a.office_ref, a.kind)).toEqual({ scope: "unmatched", reason: "Not a California contest" });
    }
    expect(placeContest("contest:2030-zz-general/prop-1", undefined, "measure").scope).toBe("unmatched");
  });

  it("extends to Assembly and Senate contests", () => {
    expect(placeContest("contest:2026-ca-general/state-assembly-17", "office:california-assembly-member")).toEqual({ scope: "district", kind: "ad", n: 17 });
    expect(placeContest("contest:2026-ca-general/state-senate-12", "office:california-state-senator")).toEqual({ scope: "district", kind: "sd", n: 12 });
    expect(placeContest("contest:2026-ca-general/assembly-80")).toEqual({ scope: "district", kind: "ad", n: 80 });
  });

  it("places statewide propositions, not local measures", () => {
    expect(placeContest("contest:2026-ca-general/prop-50", undefined, "measure")).toEqual({ scope: "statewide" });
    expect(placeContest("contest:2026-ca-general/san-francisco-measure-a", undefined, "measure").scope).toBe("unmatched");
  });

  it("places San Francisco local contests by county (FIPS 75) and supervisor district", () => {
    expect(placeContest("contest:2026-ca-general/sf-prop-a", undefined, "measure")).toEqual({ scope: "district", kind: "county", n: 75 });
    expect(placeContest("contest:2026-ca-general/sf-board-of-education", "office:sfusd-board-of-education-member")).toEqual({ scope: "district", kind: "county", n: 75 });
    expect(placeContest("contest:2026-ca-general/sf-community-college-board")).toEqual({ scope: "district", kind: "county", n: 75 });
    expect(placeContest("contest:2026-ca-general/sf-supervisor-district-6", "office:san-francisco-supervisor")).toEqual({ scope: "district", kind: "sfsup", n: 6 });
    const sfVoter = { cd: [11], county: [75], sfsup: [6] };
    expect(ballotStatus({ scope: "district", kind: "county", n: 75 }, sfVoter)).toBe("on");
    expect(ballotStatus({ scope: "district", kind: "sfsup", n: 8 }, sfVoter)).toBe("off");
    expect(ballotStatus({ scope: "district", kind: "county", n: 75 }, { cd: [11] })).toBe("pick");
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
  const cd11: Placement = { scope: "district", kind: "cd", n: 11 };
  const boe2: Placement = { scope: "district", kind: "boe", n: 2 };
  it("filters by the voter's districts", () => {
    const c = { cd: [11] };
    expect(ballotStatus({ scope: "statewide" }, c)).toBe("on");
    expect(ballotStatus(cd11, c)).toBe("on");
    expect(ballotStatus({ scope: "district", kind: "cd", n: 12 }, c)).toBe("off");
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
