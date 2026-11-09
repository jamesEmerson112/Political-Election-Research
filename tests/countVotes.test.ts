import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { budgetInput, measureInput, runTrial } from "../web/src/lib/budgetTrial.js";
import { countVotes, passesThreshold } from "../web/src/lib/results.js";

const M = 1_000_000;
const cite = [{ source: "src:sos-example-gov-91cde2610d", quote: "Prop" }];
const semi = (yes: number, no: number, extra: Record<string, unknown> = {}) => ({
  kind: "measure",
  ...extra,
  result: { certified: false, as_of: "2026-11-08", yes_votes: yes, no_votes: no, citations: cite },
});

describe("the recorded count as a ballot", () => {
  it("counts Yes ahead as yes, No ahead and ties as no, and a measure without a result as skipped", () => {
    const b = countVotes([
      ["contest:a", semi(600, 400)],
      ["contest:b", semi(400, 600)],
      ["contest:c", semi(500, 500)],
      ["contest:d", { kind: "measure" }],
    ]);
    expect(b.votes).toEqual({ "contest:a": "yes", "contest:b": "no", "contest:c": "no", "contest:d": "skip" });
    expect(b.missing).toEqual(["contest:d"]);
    expect([b.status["contest:a"]!.word, b.status["contest:b"]!.word, b.status["contest:c"]!.word]).toEqual(["Yes ahead", "No ahead", "Tied"]);
    expect(b.count).toMatchObject({ certified: false, asOf: "2026-11-08" });
  });

  it("applies a recorded threshold before certification: Yes ahead under two-thirds is not counted as passing", () => {
    const b = countVotes([["contest:a", semi(600, 400, { vote_threshold: { value: "two_thirds", citations: cite } })]]);
    expect(b.votes["contest:a"]).toBe("no");
    expect(b.status["contest:a"]).toMatchObject({ word: "Yes ahead", short: true });
  });

  it("uses `passed` once certified (the demo's Prop A: more yes votes, two-thirds needed, failed)", () => {
    const dir = path.join(__dirname, "fixtures", "valid", "data", "contests", "2030-zz-general");
    const read = (f: string) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as Record<string, unknown>;
    const b = countVotes([
      ["contest:2030-zz-general/exampleville-prop-a", read("exampleville-prop-a.json")],
      ["contest:2030-zz-general/exampleville-prop-b", read("exampleville-prop-b.json")],
    ]);
    expect(b.votes).toEqual({ "contest:2030-zz-general/exampleville-prop-a": "no", "contest:2030-zz-general/exampleville-prop-b": "yes" });
    expect([b.status["contest:2030-zz-general/exampleville-prop-a"]!.word, b.status["contest:2030-zz-general/exampleville-prop-b"]!.word]).toEqual(["Failed", "Passed"]);
    expect(b.count?.certified).toBe(true);
  });

  it("follows the validator's threshold rule (majority: more than half; 55% and two-thirds: at least)", () => {
    expect([passesThreshold(undefined, 50, 50), passesThreshold("majority", 51, 49)]).toEqual([false, true]);
    expect([passesThreshold("fifty_five_percent", 55, 45), passesThreshold("fifty_five_percent", 54, 46)]).toEqual([true, false]);
    expect([passesThreshold("two_thirds", 2, 1), passesThreshold("two_thirds", 66, 34)]).toEqual([true, false]);
  });
});

describe("California's count against the state budget (data/)", () => {
  const dir = path.join(__dirname, "..", "data");
  const read = (rel: string) => JSON.parse(fs.readFileSync(path.join(dir, rel), "utf8")) as Record<string, unknown>;
  const props = fs
    .readdirSync(path.join(dir, "contests", "2026-ca-general"))
    .filter((f) => /^prop-\d+\.json$/.test(f))
    .map((f) => read(`contests/2026-ca-general/${f}`));
  const ballot = countVotes(props.map((c) => [`contest:${String(c["id"])}`, c]));
  const measures = props.map(measureInput);

  it("has a recorded result for every proposition, and the General Fund moves only by the props ahead with yearly amounts", () => {
    expect(ballot.missing).toEqual([]);
    const r = runTrial(measures, budgetInput(read("budgets/california.json")), ballot.votes);
    // The props ahead with a yearly General Fund amount inside the forecast: Props 1 and 38 ($500–600 million a year each).
    const ahead = measures.filter((m) => ballot.votes[m.ref] === "yes").map((m) => m.label);
    expect(ahead).toEqual(expect.arrayContaining(["Prop 1", "Prop 38"]));
    expect(r.generalFund.find((y) => y.fy === "2027-28")!.delta).toEqual({ low: -1_200 * M, high: -1_000 * M });
  });

  it("labels Nevada's ballot questions as questions", () => {
    const q = measureInput(read("contests/2026-nv-general/question-6.json"));
    expect(q.label).toBe("Question 6");
  });
});
