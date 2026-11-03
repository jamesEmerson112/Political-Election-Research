import { describe, expect, it } from "vitest";
import { budgetBase, fiscalChips, gapShare, pct, pctRange } from "../web/src/lib/measureChips.js";

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
