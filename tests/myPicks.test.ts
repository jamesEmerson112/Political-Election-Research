import { afterEach, describe, expect, it } from "vitest";
import { cleanPicks, loadPicks, NOTE_MAX, picksToText, savePicks, setPick, type ExportContest } from "../web/src/lib/myPicks.js";

describe("my picks", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  });
  function fake(): Map<string, string> {
    const m = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => m.set(k, v), removeItem: (k: string) => m.delete(k) },
    });
    return m;
  }

  it("keeps only valid refs, picks and capped notes", () => {
    expect(
      cleanPicks({
        "contest:2026-ca-general/us-house-ca-11": { pick: "person:scott-wiener", note: "  check transit plan  " },
        "contest:2026-ca-general/prop-1": { pick: "maybe" },
        "not a ref": { pick: "yes" },
        "contest:2026-nv-general/question-7": { pick: "no", note: "x".repeat(NOTE_MAX + 50) },
      }),
    ).toEqual({
      "contest:2026-ca-general/us-house-ca-11": { pick: "person:scott-wiener", note: "check transit plan" },
      "contest:2026-nv-general/question-7": { pick: "no", note: "x".repeat(NOTE_MAX) },
    });
  });
  it("saves in this browser, clears a pick, and survives broken storage", () => {
    const m = fake();
    setPick("contest:2026-ca-general/prop-1", { pick: "yes" });
    expect(loadPicks()).toEqual({ "contest:2026-ca-general/prop-1": { pick: "yes" } });
    setPick("contest:2026-ca-general/prop-1", {});
    expect(m.size).toBe(0);
    m.set("per-my-picks", "not json");
    expect(loadPicks()).toEqual({});
    expect(savePicks({})).toBe(true);
  });
  it("exports a checklist: boxes for every candidate, Yes/No, notes, Try your ballot fallback", () => {
    const contests: ExportContest[] = [
      {
        ref: "contest:2026-ca-general/us-house-ca-11",
        title: "U.S. House, CA-11",
        group: "U.S. House",
        kind: "office",
        candidates: [
          { ref: "person:connie-chan", name: "Connie Chan", party: "Democratic" },
          { ref: "person:scott-wiener", name: "Scott Wiener", party: "Democratic" },
        ],
      },
      { ref: "contest:2026-ca-general/prop-1", title: "Proposition 1", group: "State propositions", kind: "measure", candidates: [] },
      { ref: "contest:2026-ca-general/prop-2", title: "Proposition 2", group: "State propositions", kind: "measure", candidates: [] },
    ];
    const text = picksToText(
      contests,
      { "contest:2026-ca-general/us-house-ca-11": { pick: "person:connie-chan", note: "Read both voter guide statements again." } },
      { election: "California General Election, November 3, 2026", districts: "CA-11", today: "2026-11-04", site: "example.org", trialVotes: { "contest:2026-ca-general/prop-1": "no" } },
    );
    expect(text).toContain("Districts: CA-11");
    expect(text).toContain("2 of 3 contests decided.");
    expect(text).toContain("  [x] Connie Chan (Democratic)\n  [ ] Scott Wiener (Democratic)\n  Note: Read both voter guide statements again.");
    expect(text).toContain("Proposition 1\n  [ ] Yes   [x] No   (from Try your ballot)");
    expect(text).toContain("Proposition 2\n  [ ] Yes   [ ] No");
    expect(text).toContain("The site doesn't recommend anyone.");
  });
});
