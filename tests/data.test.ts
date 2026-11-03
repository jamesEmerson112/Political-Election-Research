import { describe, expect, it } from "vitest";
import { readDataDir } from "../src/dataset.js";
import { DEFAULT_DATA_DIR } from "../src/paths.js";
import { formatProblem, validateFiles } from "../src/validate.js";

describe("the real dataset (data/)", () => {
  it("has no validation errors", () => {
    const res = validateFiles(readDataDir(DEFAULT_DATA_DIR), { dataDir: DEFAULT_DATA_DIR });
    expect(res.problems.filter((p) => p.severity === "error").map(formatProblem)).toEqual([]);
  });
});
