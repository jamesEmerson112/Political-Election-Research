import { describe, expect, it } from "vitest";
import { budgetBase, fiscalChips, gapShare, pct, pctRange, usd } from "../web/src/lib/measureChips.js";

const M = 1_000_000;

describe("percent first: how big an amount is", () => {
  it("rounds shares so small amounts stay visible", () => {
    expect(pct(0.25)).toBe("≈25%");
    expect(pct(0.0158)).toBe("≈1.6%");
    expect(pct(0.000605)).toBe("≈0.06%");
    expect(pct(0.00005)).toBe("<0.01%");
    expect(pct(0)).toBe("0%");
    expect(pctRange(100 * M, 150 * M, 7598.833795 * M)).toBe("≈1.3–2.0%");
    expect(pctRange(4.6 * M, 4.6 * M, 7598.833795 * M)).toBe("≈0.06%");
  });

  it("compares with the first adopted fiscal year (the current budget)", () => {
    const b = budgetBase({ adopted: [{ fy: "2027-28", general_fund_usd: 2, total_usd: 4 }, { fy: "2026-27", general_fund_usd: 1, total_usd: 3 }] });
    expect(b).toEqual({ fy: "2026-27", generalFund: 1, total: 3 });
    expect(budgetBase(null)).toBeNull();
  });

  it("leads fiscal chips with the share: General Fund of the General Fund, other lanes of all funds", () => {
    const c = {
      fiscal: {
        effects: [
          { id: "a", lane: "general_fund", direction: "cost", amount: { low_usd: 120 * M, high_usd: 120 * M }, per: "year", estimate: "estimated", text: "t", citations: [] },
          { id: "b", lane: "dedicated", direction: "revenue", amount: { low_usd: 177 * M, high_usd: 177 * M }, per: "year", estimate: "estimated", text: "t", citations: [] },
        ],
      },
    };
    const base = { fy: "2026-27", generalFund: 7598.833795 * M, total: 16851.826113 * M };
    expect(fiscalChips(c, (r) => r, base).map((x) => x.text)).toEqual(["≈1.6% of GF · cost $120M/yr", "≈1.1% of all funds · dedicated revenue $177M/yr"]);
    // Without a budget to compare with, dollars only, as before.
    expect(fiscalChips(c).map((x) => x.text)).toEqual(["GF cost $120M/yr", "Dedicated fund revenue $177M/yr"]);
  });

  it("states a step as a share of the forecast gap, in the forecast's words", () => {
    expect(gapShare(-474.3 * M, { low: -120 * M, high: -120 * M })).toBe("≈25% larger");
    expect(gapShare(-474.3 * M, { low: 0.365 * M, high: 0.45 * M })).toBe("≈0.1% smaller");
    expect(gapShare(-474.3 * M, { low: -12 * M, high: 5 * M })).toBe("≈1.1% smaller to 2.5% larger");
    expect(gapShare(0, { low: -1, high: -1 })).toBeNull();
  });
});

describe("readable totals and ranges", () => {
  it("keeps nearby billions apart (two decimals) and millions as before", () => {
    expect([1.25e9, 1.2e9, 1.15e9, 1.1e9, 1.05e9].map((v) => usd(v))).toEqual(["$1.25B", "$1.2B", "$1.15B", "$1.1B", "$1.05B"]);
    expect(usd(1088.6e6)).toBe("$1.09B");
    expect(usd(474.3e6)).toBe("$474.3M");
  });

  it("orders a mixed range like the money range beside it", () => {
    // General Fund change −$30.5M (cost) to +$21.7M (revenue) on a $1,088.6M shortfall.
    expect(gapShare(-1088.6 * M, { low: -30.5 * M, high: 21.7 * M }, "money")).toBe("≈2.8% larger to 2.0% smaller");
    expect(gapShare(-1088.6 * M, { low: -30.5 * M, high: 21.7 * M })).toBe("≈2.0% smaller to 2.8% larger");
  });
});
