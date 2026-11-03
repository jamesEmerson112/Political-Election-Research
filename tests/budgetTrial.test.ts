import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  bridgeDomain,
  bridgeSteps,
  budgetInput,
  measureInput,
  runTrial,
  shareOf,
  type MeasureInput,
  type Vote,
} from "../web/src/lib/budgetTrial.js";
import { gapLine } from "../web/src/lib/measureChips.js";

const M = 1_000_000;
const effect = (e: Record<string, unknown>) => ({ id: "e", lane: "general_fund", per: "year", estimate: "estimated", text: "x", citations: [], ...e });
const measure = (ref: string, effects: Array<Record<string, unknown>>, extra: Partial<MeasureInput> = {}): MeasureInput => ({
  ref,
  label: ref.toUpperCase(),
  effects: effects.map(effect),
  conflicts: [],
  ...extra,
});
const budget = budgetInput({
  adopted: [{ fy: "2030-31", general_fund_usd: 1_100 * M }],
  forecast: {
    years: [
      { fy: "2031-32", direction: "shortfall", amount_usd: 60 * M },
      { fy: "2032-33", direction: "shortfall", amount_usd: 95 * M },
      { fy: "2033-34", direction: "surplus", amount_usd: 10 * M },
    ],
  },
});
const gf = (r: ReturnType<typeof runTrial>, fy: string) => r.generalFund.find((y) => y.fy === fy)!;

const tax = measure("b", [{ id: "rev", direction: "revenue", amount: { low_usd: 40 * M, high_usd: 55 * M }, start_fy: "2031-32" }]);
const parks = measure("c", [{ id: "parks", direction: "cost", amount: { low_usd: 8 * M, high_usd: 12 * M }, start_fy: "2031-32" }], { conflicts: ["e"] });
const parksSmall = measure("e", [{ id: "parks", direction: "cost", amount: { low_usd: 3 * M, high_usd: 5 * M }, start_fy: "2031-32" }], { conflicts: ["c"] });

describe("budget trial engine", () => {
  it("leaves the forecast unchanged when nothing is voted yes", () => {
    const r = runTrial([tax, parks], budget, { b: "no", c: "skip" });
    expect(r.years).toEqual(["2031-32", "2032-33", "2033-34"]);
    expect(gf(r, "2031-32")).toEqual({ fy: "2031-32", baseline: -60 * M, delta: { low: 0, high: 0 }, result: { low: -60 * M, high: -60 * M } });
    expect(gf(r, "2033-34").baseline).toBe(10 * M);
  });

  it("signs ranges by direction: revenue adds, cost subtracts", () => {
    const r = runTrial([tax, parks], budget, { b: "yes", c: "yes" });
    expect(gf(r, "2031-32").delta).toEqual({ low: 28 * M, high: 47 * M });
    expect(gf(r, "2031-32").result).toEqual({ low: -32 * M, high: -13 * M });
    expect(r.perYearOnceInEffect.general_fund).toEqual({ low: 28 * M, high: 47 * M });
  });

  it("keeps one-time and multi-year totals out of annual sums", () => {
    const m = measure("x", [
      { id: "setup", direction: "cost", amount: { low_usd: 1 * M, high_usd: 1 * M }, per: "one_time", start_fy: "2031-32" },
      { id: "total", direction: "cost", amount: { low_usd: 9 * M, high_usd: 9 * M }, per: "total", years: 3 },
    ]);
    const r = runTrial([m], budget, { x: "yes" });
    expect(gf(r, "2031-32").delta).toEqual({ low: 0, high: 0 });
    expect(r.oneTime.map((c) => [c.effectId, c.range])).toEqual([["setup", { low: -1 * M, high: -1 * M }]]);
    expect(r.totals.map((c) => [c.effectId, c.range])).toEqual([["total", { low: -9 * M, high: -9 * M }]]);
  });

  it("applies annual effects from their start year for their duration", () => {
    const m = measure("x", [
      { id: "late", direction: "cost", amount: { low_usd: 2 * M, high_usd: 2 * M }, start_fy: "2032-33" },
      { id: "short", direction: "cost", amount: { low_usd: 1 * M, high_usd: 1 * M }, start_fy: "2031-32", years: 1 },
    ]);
    const r = runTrial([m], budget, { x: "yes" });
    expect(gf(r, "2031-32").delta).toEqual({ low: -1 * M, high: -1 * M });
    expect(gf(r, "2032-33").delta).toEqual({ low: -2 * M, high: -2 * M });
    expect(r.startAssumed).toEqual([]);
  });

  it("counts an effect with no stated start from the first forecast year and flags it", () => {
    const m = measure("x", [{ id: "nostart", direction: "cost", amount: { low_usd: 2 * M, high_usd: 3 * M } }]);
    const r = runTrial([m], budget, { x: "yes" });
    expect(gf(r, "2031-32").delta).toEqual({ low: -3 * M, high: -2 * M });
    expect(r.startAssumed).toEqual(["X"]);
  });

  it("lists minimal, not-estimated and depends-on-future-decisions effects without adding them", () => {
    const m = measure("x", [
      { id: "none", direction: "none", estimate: "minimal", text: "No effect on the cost of government." },
      { id: "unk", direction: "cost", estimate: "not_estimated", text: "Not estimated." },
      { id: "dep", direction: "cost", estimate: "depends_on_future_decisions", text: "Depends on future decisions." },
    ]);
    const r = runTrial([m], budget, { x: "yes" });
    expect(gf(r, "2031-32").delta).toEqual({ low: 0, high: 0 });
    expect(r.minimal.map((n) => n.text)).toEqual(["No effect on the cost of government."]);
    expect(r.notEstimated.map((n) => [n.estimate, n.text])).toEqual([
      ["not_estimated", "Not estimated."],
      ["depends_on_future_decisions", "Depends on future decisions."],
    ]);
  });

  it("keeps set-asides, dedicated funds, other agencies and bonds out of the General Fund headline", () => {
    const m = measure("x", [
      { id: "lib", lane: "set_aside", direction: "cost", amount: { low_usd: 5 * M, high_usd: 5 * M }, start_fy: "2031-32" },
      { id: "ded", lane: "dedicated", direction: "revenue", amount: { low_usd: 7 * M, high_usd: 8 * M }, start_fy: "2031-32" },
      { id: "debt", lane: "bond_debt", direction: "cost", amount: { low_usd: 21 * M, high_usd: 21 * M }, start_fy: "2031-32", years: 20 },
    ], { bond: { principal_usd: 300 * M, debt_service_total_usd: 420 * M, annual_cost_per_100k_assessed_usd: 9.5 } });
    const r = runTrial([m], budget, { x: "yes" });
    expect(gf(r, "2031-32").delta).toEqual({ low: 0, high: 0 });
    expect(r.perYearOnceInEffect.set_aside).toEqual({ low: -5 * M, high: -5 * M });
    expect(r.perYearOnceInEffect.dedicated).toEqual({ low: 7 * M, high: 8 * M });
    expect(r.perYearOnceInEffect.bond_debt).toEqual({ low: -21 * M, high: -21 * M });
    expect(r.bonds).toEqual({ principal: 300 * M, debtServiceTotal: 420 * M, perHundredK: 9.5, labels: ["X"] });
  });

  it("treats competing measures as a range when both get a yes", () => {
    const one = runTrial([parks, parksSmall], budget, { c: "yes" });
    expect(gf(one, "2031-32").delta).toEqual({ low: -12 * M, high: -8 * M });
    expect(one.conflicts).toEqual([]);
    const both = runTrial([parks, parksSmall], budget, { c: "yes", e: "yes" });
    expect(gf(both, "2031-32").delta).toEqual({ low: -12 * M, high: -3 * M });
    expect(both.conflicts).toEqual([{ refs: ["c", "e"], labels: ["C", "E"] }]);
  });

  it("spans only outcomes that can happen when exclusive conflicts chain (I vs C, I vs J; C and J compatible)", () => {
    const c = measure("c", [{ id: "x", direction: "cost", amount: { low_usd: 10 * M, high_usd: 10 * M }, start_fy: "2031-32" }], { conflicts: ["i"] });
    const i = measure("i", [{ id: "x", direction: "cost", amount: { low_usd: 100 * M, high_usd: 100 * M }, start_fy: "2031-32" }], { conflicts: ["c", "j"] });
    const j = measure("j", [{ id: "x", direction: "revenue", amount: { low_usd: 50 * M, high_usd: 50 * M }, start_fy: "2031-32" }], { conflicts: ["i"] });
    const r = runTrial([c, i, j], budget, { c: "yes", i: "yes", j: "yes" });
    // outcomes: {i} -> -100; {c, j} -> +40
    expect(gf(r, "2031-32").delta).toEqual({ low: -100 * M, high: 40 * M });
  });

  it("adds partial conflicts (both take effect) and lists them", () => {
    const a = measure("a", [{ id: "x", direction: "cost", amount: { low_usd: 1 * M, high_usd: 1 * M }, start_fy: "2031-32" }], { overlaps: ["f"] });
    const f = measure("f", [{ id: "x", direction: "cost", amount: { low_usd: 2 * M, high_usd: 2 * M }, start_fy: "2031-32" }], { overlaps: ["a"] });
    const r = runTrial([a, f], budget, { a: "yes", f: "yes" });
    expect(gf(r, "2031-32").delta).toEqual({ low: -3 * M, high: -3 * M });
    expect(r.conflicts).toEqual([]);
    expect(r.overlaps).toEqual([{ refs: ["a", "f"], labels: ["A", "F"] }]);
  });

  it("is deterministic and independent of vote order", () => {
    const a = runTrial([tax, parks, parksSmall], budget, { b: "yes", c: "yes", e: "yes" });
    const b = runTrial([tax, parks, parksSmall], budget, { e: "yes", c: "yes", b: "yes" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("works with no budget record (no baseline, annual totals only)", () => {
    const r = runTrial([tax], null, { b: "yes" });
    expect(r.years).toEqual([]);
    expect(r.perYearOnceInEffect.general_fund).toEqual({ low: 40 * M, high: 55 * M });
  });

  it("expresses an amount as a share of the adopted General Fund", () => {
    expect(shareOf(11 * M, budget)).toBeCloseTo(0.01, 6);
    expect(shareOf(11 * M, null)).toBeNull();
  });
});

describe("budget trial on the fictional Exampleville ballot", () => {
  const dir = path.join(__dirname, "fixtures", "valid", "data");
  const read = (rel: string) => JSON.parse(fs.readFileSync(path.join(dir, rel), "utf8")) as Record<string, unknown>;
  const letters = ["a", "b", "c", "d", "e", "f", "g"];
  const measures = letters.map((l) => measureInput(read(`contests/2030-zz-general/exampleville-prop-${l}.json`)));
  const city = budgetInput(read("budgets/exampleville.json"));

  it("reads measures and the budget from records", () => {
    expect(measures.map((m) => m.label)).toEqual(["Prop A", "Prop B", "Prop C", "Prop D", "Prop E", "Prop F", "Prop G"]);
    expect(measures[2]!.conflicts).toEqual(["contest:2030-zz-general/exampleville-prop-e"]);
    expect(city.forecast.map((y) => y.signed)).toEqual([-60 * M, -95 * M, -130 * M]);
  });

  it("adds up an all-yes ballot lane by lane", () => {
    const votes = Object.fromEntries(measures.map((m) => [m.ref, "yes" as Vote]));
    const r = runTrial(measures, city, votes);
    // B +40..55; C (-12..-8) and E (-5..-3) compete -> -12..-3; D minimal; F not estimated; G set-aside; A bond.
    expect(gf(r, "2031-32").delta).toEqual({ low: 28 * M, high: 52 * M });
    expect(gf(r, "2031-32").result).toEqual({ low: -32 * M, high: -8 * M });
    expect(r.oneTime.map((c) => c.label)).toEqual(["Prop B"]);
    expect(r.notEstimated.map((n) => n.label)).toEqual(["Prop F"]);
    expect(r.minimal.map((n) => n.label)).toEqual(["Prop D"]);
    expect(r.perYearOnceInEffect.set_aside).toEqual({ low: -5 * M, high: -5 * M });
    expect(r.bonds.principal).toBe(300 * M);
    expect(r.conflicts.map((c) => c.labels)).toEqual([["Prop C", "Prop E"]]);
  });

  it("bridges the all-yes ballot: competing C and E as one step, measures without a General Fund amount listed", () => {
    const votes = Object.fromEntries(measures.map((m) => [m.ref, "yes" as Vote]));
    const b = bridgeSteps(runTrial(measures, city, votes), measures, "2031-32")!;
    expect(b.steps.map((s) => s.label)).toEqual(["Forecast", "Prop B", "Prop C/E", "Result"]);
    expect(b.steps[2]!.delta).toEqual({ low: -12 * M, high: -3 * M });
    expect(b.result).toEqual({ low: -32 * M, high: -8 * M });
    expect(b.omitted.map((o) => [o.label, o.reason])).toEqual([
      ["Prop A", "other_lanes"],
      ["Prop D", "minimal"],
      ["Prop F", "not_estimated"],
      ["Prop G", "other_lanes"],
    ]);
  });
});

describe("bridge (waterfall) for one fiscal year", () => {
  const cost = (ref: string, low: number, high: number, extra: Record<string, unknown> = {}) =>
    measure(ref, [{ id: "x", direction: "cost", amount: { low_usd: low * M, high_usd: high * M }, start_fy: "2031-32", ...extra }]);
  const steps = (r: ReturnType<typeof runTrial>, ms: MeasureInput[], fy = "2031-32") => bridgeSteps(r, ms, fy)!;

  it("lists steps in ballot order, whatever order the votes came in", () => {
    const ms = [cost("x", 1, 1), tax, cost("y", 2, 2)];
    const r = runTrial(ms, budget, { y: "yes", b: "yes", x: "yes" });
    expect(steps(r, ms).steps.map((s) => [s.kind, s.label])).toEqual([
      ["start", "Forecast"],
      ["measure", "X"],
      ["measure", "B"],
      ["measure", "Y"],
      ["end", "Result"],
    ]);
  });

  it("keeps a range step as a signed range and chains from its nearer end", () => {
    const ms = [tax, cost("x", 4, 4)];
    const b = steps(runTrial(ms, budget, { b: "yes", x: "yes" }), ms);
    const [start, t, x, end] = b.steps;
    expect(start!.after).toEqual({ low: -60 * M, high: -60 * M });
    expect(t!.delta).toEqual({ low: 40 * M, high: 55 * M });
    expect(t!.after).toEqual({ low: -20 * M, high: -5 * M });
    expect(t!.chain).toBe(-60 * M);
    // drawn from the forecast plus the nearer end of the range step (+40M)
    expect(x!.chain).toBe(-20 * M);
    expect(x!.after).toEqual({ low: -24 * M, high: -9 * M });
    expect(end!.after).toEqual({ low: -24 * M, high: -9 * M });
  });

  it("shows competing measures (only one can take effect) as one step spanning both outcomes", () => {
    const ms = [parks, tax, parksSmall];
    const b = steps(runTrial(ms, budget, { c: "yes", b: "yes", e: "yes" }), ms);
    expect(b.steps.map((s) => s.label)).toEqual(["Forecast", "C/E", "B", "Result"]);
    expect(b.steps[1]).toMatchObject({ refs: ["c", "e"], labels: ["C", "E"], exclusive: true, delta: { low: -12 * M, high: -3 * M } });
  });

  it("lists yes measures with no General Fund amount in the year instead of drawing them", () => {
    const later = cost("l", 2, 2, { start_fy: "2032-33" });
    const minimal = measure("m", [{ id: "x", direction: "none", estimate: "minimal" }]);
    const unknown = measure("u", [{ id: "x", direction: "cost", estimate: "not_estimated" }]);
    const once = measure("o", [{ id: "x", direction: "cost", per: "one_time", amount: { low_usd: 1 * M, high_usd: 1 * M } }]);
    const other = measure("s", [{ id: "x", lane: "set_aside", direction: "cost", amount: { low_usd: 5 * M, high_usd: 5 * M } }]);
    const no = cost("n", 9, 9);
    const ms = [later, minimal, unknown, tax, once, other, no];
    const votes = Object.fromEntries(ms.filter((m) => m !== no).map((m) => [m.ref, "yes" as Vote]));
    const b = steps(runTrial(ms, budget, votes), ms);
    expect(b.steps.map((s) => s.label)).toEqual(["Forecast", "B", "Result"]);
    expect(b.omitted.map((o) => [o.label, o.reason, o.startFy])).toEqual([
      ["L", "not_in_year", "2032-33"],
      ["M", "minimal", null],
      ["U", "not_estimated", null],
      ["O", "one_time_only", null],
      ["S", "other_lanes", null],
    ]);
    // the same measure is a step in the year it applies
    expect(steps(runTrial(ms, budget, votes), ms, "2032-33").steps.map((s) => s.label)).toEqual(["Forecast", "L", "B", "Result"]);
  });

  it("ends every year's running total at the engine's result", () => {
    const c = cost("c", 10, 10);
    c.conflicts = ["i"];
    const i = cost("i", 100, 100);
    i.conflicts = ["c", "j"];
    const j = measure("j", [{ id: "x", direction: "revenue", amount: { low_usd: 50 * M, high_usd: 50 * M }, start_fy: "2031-32" }], { conflicts: ["i"] });
    const ms = [c, i, j, tax, cost("p", 8, 12), cost("late", 3, 7, { start_fy: "2033-34" })];
    const votes = Object.fromEntries(ms.map((m) => [m.ref, "yes" as Vote]));
    const r = runTrial(ms, budget, votes);
    for (const y of r.generalFund) {
      const b = steps(r, ms, y.fy);
      expect(b.result).toEqual(y.result);
      expect(b.steps.at(-1)!.after).toEqual(y.result);
      for (let k = 1; k < b.steps.length; k++) expect(b.steps[k]!.before).toEqual(b.steps[k - 1]!.after);
    }
    expect(steps(r, ms).steps.map((s) => s.label)).toEqual(["Forecast", "C/I/J", "B", "P", "Result"]);
  });

  it("keeps a fixed, zoomed axis while answering", () => {
    const big = budgetInput({ forecast: { years: [{ fy: "2031-32", direction: "shortfall", amount_usd: 474.3 * M }] } });
    const ms = [cost("x", 4, 4), tax, cost("y", 120, 120)];
    const none = bridgeDomain(ms, big, "2031-32", bridgeSteps(runTrial(ms, big, {}), ms, "2031-32"));
    const some = bridgeDomain(ms, big, "2031-32", bridgeSteps(runTrial(ms, big, { x: "yes", b: "yes" }), ms, "2031-32"));
    expect(some).toEqual(none);
    expect(none!.zero).toBe(false);
    expect(none!.hi).toBeLessThan(-400 * M);
    expect(none!.lo).toBeLessThan(-(474.3 + 124) * M);
  });
});

describe("numbers-first gap line", () => {
  it("states the forecast shortfall, the result and how much larger it gets", () => {
    const l = gapLine("2027-28", -474.3 * M, { low: -478.535 * M, high: -478.4 * M });
    expect(l.text).toBe("Shortfall FY2027-28: $474.3M → $478.4M–$478.5M (+$4.1M–$4.2M, ≈0.9% larger)");
  });

  it("says smaller when revenue shrinks the shortfall", () => {
    expect(gapLine("2027-28", -474.3 * M, { low: -374.3 * M, high: -324.3 * M }).text).toBe(
      "Shortfall FY2027-28: $474.3M → $324.3M–$374.3M (−$100M–$150M, ≈21–32% smaller)",
    );
    expect(gapLine("2027-28", -474.3 * M, { low: -474.3 * M, high: -474.3 * M }).text).toBe("Shortfall FY2027-28: $474.3M → $474.3M (no change)");
  });

  it("uses the forecast's words when the result crosses zero", () => {
    expect(gapLine("2027-28", -60 * M, { low: -20 * M, high: 10 * M }).text).toBe(
      "FY2027-28: shortfall $60M → between a $20M shortfall and a $10M surplus (+$40M–$70M a year)",
    );
  });
});
