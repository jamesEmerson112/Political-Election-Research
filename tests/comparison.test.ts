import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_DATA_DIR } from "../src/paths.js";

type Cmp = { columns: string[]; rows: Array<{ label: string; cells: string[] }> };

function comparisons(): Array<[string, Cmp]> {
  const out: Array<[string, Cmp]> = [];
  const root = path.join(DEFAULT_DATA_DIR, "contests");
  for (const el of fs.readdirSync(root).sort()) {
    for (const f of fs.readdirSync(path.join(root, el)).filter((x) => x.endsWith(".json")).sort()) {
      const rec = JSON.parse(fs.readFileSync(path.join(root, el, f), "utf8")) as { comparison?: Cmp };
      if (rec.comparison) out.push([`${el}/${f}`, rec.comparison]);
    }
  }
  return out;
}

describe("measure comparison tables", () => {
  it("SF Prop F has one", () => {
    expect(comparisons().map(([f]) => f)).toContain("2026-ca-general/sf-prop-f.json");
  });
  it("give every row one cell per column after the first", () => {
    for (const [f, c] of comparisons()) {
      for (const r of c.rows) expect([f, r.label, r.cells.length]).toEqual([f, r.label, c.columns.length - 1]);
    }
  });
});
