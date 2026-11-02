import { describe, expect, it } from "vitest";
import { rollupCandidate } from "../src/rollup.js";
import { validDataset } from "./helpers.js";

const GOV = "contest:2030-zz-general/governor";

describe("candidate funding rollup", () => {
  const ds = validDataset();
  const avery = rollupCandidate(ds, "person:avery-sample", GOV);

  it("counts only committees controlled for this contest (leadership PAC excluded)", () => {
    expect(avery.committees).toEqual(["org:avery-sample-for-governor-2030"]);
  });

  it("excludes transfers between committees and money given to the leadership PAC", () => {
    // union $50,000 + Pat $20,000; the $30,000 PAC transfer and the union's $100,000 to the PAC are not receipts.
    expect(avery.receipts_cents).toBe(7_000_000);
    expect(avery.excluded.transfer_cents).toBe(3_000_000);
  });

  it("attributes conduit gifts to the original donor", () => {
    expect(avery.top_donors.map((d) => d.donor)).toEqual(["org:example-teachers-union", "person:pat-donor"]);
    expect(avery.top_donors.some((d) => d.donor === "org:example-conduit")).toBe(false);
    expect(avery.via_conduits).toEqual({ "org:example-conduit": 2_000_000 });
  });

  it("splits receipts by election designation", () => {
    expect(avery.by_designation).toEqual({ general: 5_000_000, primary: 2_000_000 });
  });

  it("keeps independent expenditures separate from receipts", () => {
    expect(avery.independent_expenditures.support_cents).toBe(25_000_000);
    expect(avery.independent_expenditures.oppose_cents).toBe(0);
  });

  it("respects the through date", () => {
    expect(rollupCandidate(ds, "person:avery-sample", GOV, { through: "2030-06-30" }).receipts_cents).toBe(0);
  });

  it("is deterministic", () => {
    expect(JSON.stringify(rollupCandidate(ds, "person:jordan-example", GOV))).toBe(
      JSON.stringify(rollupCandidate(ds, "person:jordan-example", GOV)),
    );
  });
});
