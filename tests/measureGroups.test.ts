import { describe, expect, it } from "vitest";
import { affectLabel, affectsByEffect, signersBySide } from "../web/src/lib/measureGroups.js";

const arg = (id: string, side: string, authors: string[]) => ({ id, side, kind: "paid", text: "…", authors, citations: [] });

describe("signersBySide", () => {
  it("counts each printed name once per side, with the arguments they signed, in first-seen order", () => {
    const s = signersBySide([
      arg("proponent", "yes", ["Mayor Example", "Example Coalition"]),
      arg("rebuttal-to-proponent", "no", ["Taxpayers Group"]),
      arg("paid-yes-01", "yes", ["Example Coalition", "Builders  Association"]),
      arg("paid-no-01", "no", ["Taxpayers Group"]),
    ]);
    expect(s.yes.map((x) => x.name)).toEqual(["Mayor Example", "Example Coalition", "Builders Association"]);
    expect(s.yes.find((x) => x.name === "Example Coalition")!.arguments).toEqual(["proponent", "paid-yes-01"]);
    expect(s.no).toEqual([{ name: "Taxpayers Group", arguments: ["rebuttal-to-proponent", "paid-no-01"] }]);
  });

  it("keeps spelling variants apart (as printed) and ignores empty names", () => {
    const s = signersBySide([arg("a", "yes", ["Jim Lazarus", "James Lazarus", " "])]);
    expect(s.yes.map((x) => x.name)).toEqual(["Jim Lazarus", "James Lazarus"]);
    expect(signersBySide(undefined)).toEqual({ yes: [], no: [] });
  });
});

describe("affectsByEffect", () => {
  it("groups entries by what the text says (pays, receives, rules change, other) and drops empty rows", () => {
    const rows = affectsByEffect([
      { group: "tenants", effect: "pays", text: "t" },
      { group: "property_owners", effect: "pays", text: "t" },
      { group: "voters_petitioners", effect: "rules_change", text: "t" },
    ]);
    expect(rows.map((r) => [r.effect, r.items.map((a) => a["group"])])).toEqual([
      ["pays", ["tenants", "property_owners"]],
      ["rules_change", ["voters_petitioners"]],
    ]);
  });

  it("labels groups from the fixed list, and 'other' by its own label", () => {
    expect(affectLabel({ group: "transit_riders" })).toBe("Muni riders");
    expect(affectLabel({ group: "other", label: "Sunset Dunes neighbors" })).toBe("Sunset Dunes neighbors");
  });
});
