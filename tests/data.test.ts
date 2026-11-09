import { describe, expect, it } from "vitest";
import { readDataDir } from "../src/dataset.js";
import { DEFAULT_DATA_DIR } from "../src/paths.js";
import { formatProblem, validateFiles } from "../src/validate.js";

describe("the real dataset (data/)", () => {
  // Reads and validates every data file (about 3,000 now, and growing): about 2 s alone, but well past vitest's
  // 5 s default when the suite's workers share a busy machine.
  it("has no validation errors", { timeout: 30_000 }, () => {
    const res = validateFiles(readDataDir(DEFAULT_DATA_DIR), { dataDir: DEFAULT_DATA_DIR });
    expect(res.problems.filter((p) => p.severity === "error").map(formatProblem)).toEqual([]);
  });
});
