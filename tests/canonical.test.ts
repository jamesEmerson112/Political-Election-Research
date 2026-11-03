import { describe, expect, it } from "vitest";
import { canonicalize, serialize } from "../src/canonical.js";
import { classify, schemaPointer } from "../src/paths.js";
import { VALID_DIR, validFiles } from "./helpers.js";

describe("canonical form", () => {
  it("orders keys: priority, alphabetical, trailing", () => {
    const out = serialize(
      canonicalize("person", { last_verified: "2026-01-01", zeta: 1, name: "A", id: "a", alpha: 2, citations: [] }, "x.json"),
    );
    expect(Object.keys(JSON.parse(out))).toEqual(["$schema", "id", "name", "alpha", "zeta", "citations", "last_verified"]);
  });

  it("sorts positions by subject then as_of", () => {
    const out = canonicalize(
      "positions",
      {
        actor: "person:a",
        positions: [
          { subject: "q:b/x", as_of: "2026-02-01" },
          { subject: "q:a/x", as_of: "2026-03-01" },
          { subject: "q:a/x", as_of: "2026-01-01" },
        ],
      },
      "x.json",
    ) as { positions: Array<{ subject: string; as_of: string }> };
    expect(out.positions.map((p) => `${p.subject}@${p.as_of}`)).toEqual(["q:a/x@2026-01-01", "q:a/x@2026-03-01", "q:b/x@2026-02-01"]);
  });

  it("is idempotent on every fixture file", () => {
    for (const [rel, text] of validFiles()) {
      const info = classify(rel)!;
      const again = serialize(canonicalize(info.kind, JSON.parse(text), schemaPointer(VALID_DIR, rel, info.kind)));
      expect(again).toBe(text);
    }
  });
});
