import { afterEach, describe, expect, it } from "vitest";
import { cleanVotes, forgetVotes, loadVotes, saveVotes } from "../web/src/lib/trialStorage.js";

class FakeStorage {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}
const g = globalThis as { localStorage?: unknown };
const A = "contest:2026-ca-general/sf-prop-a";
const B = "contest:2026-ca-general/sf-prop-b";

afterEach(() => {
  delete g.localStorage;
});

describe("trial ballot storage", () => {
  it("round-trips answers per ballot and forgets them", () => {
    g.localStorage = new FakeStorage();
    expect(saveVotes("san-francisco", { [A]: "yes", [B]: "skip" })).toBe(true);
    saveVotes("exampleville", { [A]: "no" });
    expect(loadVotes("san-francisco")).toEqual({ [A]: "yes", [B]: "skip" });
    forgetVotes("san-francisco");
    expect(loadVotes("san-francisco")).toEqual({});
    expect(loadVotes("exampleville")).toEqual({ [A]: "no" });
  });

  it("keeps only known refs and vote values", () => {
    expect(cleanVotes({ [A]: "yes", bogus: "yes", [B]: "maybe" })).toEqual({ [A]: "yes" });
    expect(cleanVotes(null)).toEqual({});
  });

  it("ignores unexpected payloads and works without storage", () => {
    const s = new FakeStorage();
    s.setItem("per-trial-ballot", JSON.stringify({ v: 2, ballots: { x: { [A]: "yes" } } }));
    g.localStorage = s;
    expect(loadVotes("x")).toEqual({});
    g.localStorage = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
      removeItem() {
        throw new Error("blocked");
      },
    };
    expect(loadVotes("x")).toEqual({});
    expect(saveVotes("x", { [A]: "yes" })).toBe(false);
    delete g.localStorage;
    expect(saveVotes("x", { [A]: "yes" })).toBe(false);
  });
});
