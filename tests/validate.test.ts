import { describe, expect, it } from "vitest";
import { RULES, validateFiles } from "../src/validate.js";
import { applyPatches, FIXTURE_TODAY, loadInvalidFixtures, VALID_DIR, validFiles } from "./helpers.js";

describe("valid fixture", () => {
  it("has zero problems, even under --strict", () => {
    const res = validateFiles(validFiles(), { dataDir: VALID_DIR, today: FIXTURE_TODAY, strict: true });
    expect(res.problems).toEqual([]);
  });

  it("produces identical output on repeated runs (determinism)", () => {
    const a = validateFiles(validFiles(), { dataDir: VALID_DIR, today: FIXTURE_TODAY });
    const b = validateFiles(validFiles(), { dataDir: VALID_DIR, today: FIXTURE_TODAY });
    expect(JSON.stringify(a.problems)).toBe(JSON.stringify(b.problems));
  });
});

describe("invalid fixtures: each fails with exactly its rule", () => {
  const fixtures = loadInvalidFixtures();

  it("covers every rule code", () => {
    expect(fixtures.map(([name]) => name).sort()).toEqual(Object.keys(RULES).sort());
  });

  for (const [name, fx] of fixtures) {
    it(`${name}: ${fx.description}`, () => {
      const files = applyPatches(validFiles(), VALID_DIR, fx.patches);
      const res = validateFiles(files, { dataDir: VALID_DIR, today: FIXTURE_TODAY, strict: fx.strict ?? false });
      const codes = [...new Set(res.problems.filter((p) => p.severity === "error").map((p) => p.code))].sort();
      expect(codes).toEqual(fx.expect);
    });
  }
});

describe("warning rules", () => {
  it("are warnings without --strict", () => {
    const fx = loadInvalidFixtures().find(([n]) => n === "ARCHIVE_REQUIRED")![1];
    const files = applyPatches(validFiles(), VALID_DIR, fx.patches);
    const res = validateFiles(files, { dataDir: VALID_DIR, today: FIXTURE_TODAY });
    expect(res.errors).toBe(0);
    expect(res.warnings).toBeGreaterThan(0);
  });
});
