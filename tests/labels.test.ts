import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_DATA_DIR } from "../src/paths.js";
import { humanizeId, shortQuestionLabel, titleFromSlug } from "../web/src/lib/labels.js";

/** Every question id in the dataset, for the label checks below. */
function questionIds(): string[] {
  const dir = path.join(DEFAULT_DATA_DIR, "issues");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => (JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).questions ?? []).map((q: { id: string }) => q.id));
}

describe("shortQuestionLabel", () => {
  it.each([
    ["expand-skilled-work-visas", "Skilled work visas"],
    ["high-speed-rail-funding", "High speed rail funding"],
    ["bike-lanes-over-parking", "Bike lanes over parking"],
    ["local-tax-for-muni", "Local tax for muni"],
    ["sfusd-close-or-merge-schools", "Close or merge schools"],
    ["sfusd-limit-screens-and-ai", "Limit screens and AI"],
    ["end-drug-use-supply-distribution", "Drug use supply distribution"],
    ["lower-top-income-tax-rates", "Income tax rates"],
    ["single-payer", "Single payer"],
    ["abolish-ice", "Abolish ICE"],
  ])("%s -> %s", (id, label) => {
    expect(shortQuestionLabel(id)).toBe(label);
  });

  it("no question in the dataset gets a label that starts mid-phrase", () => {
    const ids = questionIds();
    expect(ids.length).toBeGreaterThan(20);
    for (const id of ids) {
      const label = shortQuestionLabel(id);
      const first = label.split(" ")[0]!.toLowerCase();
      expect(["and", "or", "for", "over", "of", "to", "with", "in", "on"], `${id} -> ${label}`).not.toContain(first);
      // The label is the end of the full humanized id, never a word cut in two.
      expect(humanizeId(id).toLowerCase().endsWith(label.toLowerCase()), `${id} -> ${label}`).toBe(true);
      const before = humanizeId(id).slice(0, humanizeId(id).length - label.length).trim().split(" ").pop()?.toLowerCase() ?? "";
      expect(["high", "drug"], `${id} -> ${label}`).not.toContain(before);
      expect(label.split(" ").length, `${id} -> ${label}`).toBeLessThanOrEqual(5);
    }
  });
});

describe("titleFromSlug (the short names lists use)", () => {
  it.each([
    ["2026-ca-general/us-house-ca-11", "U.S. House, CA-11"],
    ["2026-nv-general/us-house-nv-1", "U.S. House, NV-1"],
    ["2026-ca-general/state-assembly-17", "State Assembly, District 17"],
    ["2026-ca-general/board-of-equalization-2", "Board of Equalization, District 2"],
    ["2026-nv-general/assembly-6", "Assembly, District 6"],
  ])("%s -> %s", (slug, title) => {
    expect(titleFromSlug(slug)).toBe(title);
  });
});
