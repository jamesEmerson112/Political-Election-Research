import { describe, expect, it } from "vitest";
import { importOffices } from "../src/importOffices.js";
import { validateFiles } from "../src/validate.js";
import { FIXTURE_TODAY, VALID_DIR, validFiles } from "./helpers.js";

const batch = [
  {
    slug: "example-council-member",
    name: "Member, Example City Council",
    level: "local" as const,
    jurisdiction: "City of Example",
    body: "Example City Council",
    facts: {
      seats: { value: 9, sources: [{ url: "https://city.example.gov/council", publisher: "City of Example", seen: "search summary", tier: "primary" }] },
      powers: { value: "Adopts the city budget and ordinances.", sources: [{ url: "https://en.wikipedia.org/wiki/Example", publisher: "Wikipedia", seen: "search summary", tier: "secondary" }] },
      salary: { value: 50000, sources: [] },
    },
  },
];

describe("import:offices", () => {
  it("writes office records whose citations are marked unverified, and validates", () => {
    const { writes } = importOffices(validFiles(), batch, { dataDir: VALID_DIR, today: FIXTURE_TODAY });
    const office = JSON.parse(writes.get("offices/example-council-member.json")!);
    expect(office.seats.value).toBe(9);
    expect(office.salary).toBeUndefined(); // no source, no fact
    expect(office.seats.citations[0].unverified.method).toBe("search summary");
    const res = validateFiles(new Map([...validFiles(), ...writes]), { dataDir: VALID_DIR, today: FIXTURE_TODAY });
    expect(res.errors).toBe(0);
    expect(res.problems.some((p) => p.code === "UNVERIFIED_CITATION")).toBe(true);
    const wiki = [...writes.entries()].find(([k, v]) => k.startsWith("sources/") && v.includes("wikipedia"))!;
    expect(JSON.parse(wiki[1]).kind).toBe("reference_work");
  });
});
