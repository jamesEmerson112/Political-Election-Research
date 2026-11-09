import { describe, expect, it } from "vitest";
import { countLine, measureOutcome, measureWord, officeOutcome, pct1, standing, winnerWord } from "../web/src/lib/results.js";

const cite = [{ source: "src:sos-example-gov-91cde2610d", quote: "Governor" }];

describe("office results", () => {
  const semi = officeOutcome({
    kind: "office",
    result: { certified: false, as_of: "2030-11-06", winners: ["person:b"], tallies: [{ person: "person:a", votes: 400 }, { person: "person:b", votes: 600 }], citations: cite },
  })!;

  it("sorts candidates by votes and computes shares here", () => {
    expect(semi.rows.map((r) => [r.person, r.votes, pct1(r.share), r.won])).toEqual([
      ["person:b", 600, "60.0%", true],
      ["person:a", 400, "40.0%", false],
    ]);
    expect(semi.total).toBe(1000);
  });

  it("says Leading until certified, then Elected", () => {
    expect(winnerWord(semi)).toBe("Leading");
    expect(countLine(semi)).toBe("Semi-official count · Nov 6, 2030");
    const cert = officeOutcome({ kind: "office", result: { certified: true, certified_date: "2030-12-05", winners: ["person:b"], tallies: [], citations: cite } })!;
    expect(winnerWord(cert)).toBe("Elected");
    expect(countLine(cert)).toBe("Certified Dec 5, 2030");
  });

  it("counts Nevada's “None of These Candidates” votes in the shares, never as a winner (format-v3)", () => {
    // A statewide card printed as 55.14% / 42.90% / 1.95%: the official shares include the None-of-these line.
    const nv = officeOutcome({
      kind: "office",
      result: {
        certified: false,
        as_of: "2026-11-08",
        winners: ["person:a"],
        tallies: [{ person: "person:b", votes: 461884 }, { person: "person:a", votes: 593669 }],
        none_of_these_votes: 21018,
        citations: cite,
      },
    })!;
    expect(nv.total).toBe(1076571);
    expect(nv.rows.map((r) => [r.person, pct1(r.share), r.won])).toEqual([
      ["person:a", "55.1%", true],
      ["person:b", "42.9%", false],
    ]);
    expect(nv.noneOfThese && [nv.noneOfThese.votes, pct1(nv.noneOfThese.share)]).toEqual([21018, "2.0%"]);
    expect(semi.noneOfThese).toBeUndefined();
  });

  it("marks the winner won and the others lost, and nothing without a result", () => {
    expect(standing(semi, "person:b")).toBe("won");
    expect(standing(semi, "person:a")).toBe("lost");
    expect(standing(officeOutcome({ kind: "office" }), "person:a")).toBe("");
    expect(officeOutcome({ kind: "measure", result: { certified: false } })).toBeNull();
  });
});

describe("measure results", () => {
  it("says which side is ahead until certified", () => {
    const o = measureOutcome({ kind: "measure", result: { certified: false, as_of: "2026-11-04", yes_votes: 506, no_votes: 494, citations: cite } })!;
    expect([o.ahead, measureWord(o), pct1(o.yesShare), pct1(o.noShare)]).toEqual(["yes", "Yes ahead", "50.6%", "49.4%"]);
    expect(o.passed).toBeUndefined();
  });

  it("says Passed or Failed once certified, with the recorded threshold", () => {
    const o = measureOutcome({
      kind: "measure",
      vote_threshold: { value: "two_thirds", citations: cite },
      result: { certified: true, certified_date: "2030-12-01", passed: false, yes_votes: 61204, no_votes: 39118, citations: cite },
    })!;
    expect([o.ahead, measureWord(o)]).toEqual(["yes", "Failed"]);
    expect(o.threshold).toEqual({ value: "two_thirds", share: 2 / 3 });
  });
});
