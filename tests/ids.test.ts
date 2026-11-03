import { describe, expect, it } from "vitest";
import { canonicalUrl, refToken, relationshipId, slugify, sourceId } from "../src/ids.js";

describe("slugify", () => {
  it.each([
    ["Xavier Becerra", "xavier-becerra"],
    ["Steve Hilton", "steve-hilton"],
    ["AT&T Inc.", "at-and-t-inc"],
    ["José Núñez-O'Brien", "jose-nunez-obrien"],
    ["  SEIU California State Council  ", "seiu-california-state-council"],
    ["Yes on Prop. 3 — 2026", "yes-on-prop-3-2026"],
  ])("%s -> %s", (input, want) => expect(slugify(input)).toBe(want));
});

describe("canonicalUrl / sourceId", () => {
  it("normalizes scheme, www, trailing slash, fragment, tracking params and param order", () => {
    expect(canonicalUrl("http://www.Example.com/a/b/?utm_source=x&b=2&a=1#frag")).toBe("https://example.com/a/b?a=1&b=2");
  });
  it("gives equivalent URLs the same source id", () => {
    const a = sourceId("https://www.sos.ca.gov/elections/upcoming-elections/");
    const b = sourceId("http://sos.ca.gov/elections/upcoming-elections?utm_medium=email");
    expect(a).toBe(b);
    expect(a).toMatch(/^sos-ca-gov-[0-9a-f]{10}$/);
  });
  it("keeps distinct pages distinct", () => {
    expect(sourceId("https://example.com/a")).not.toBe(sourceId("https://example.com/b"));
  });
});

describe("relationshipId", () => {
  it("is built only from identifying fields", () => {
    const rec = {
      type: "contribution",
      donor: "org:example-union",
      recipient: "org:x-for-governor-2026",
      cycle: 2026,
      election_designation: "general",
      form: "monetary",
      money: { amount_cents: 1, period: { start: "2026-01-01", end: "2026-10-17" }, basis: "itemized" },
    };
    expect(relationshipId(rec)).toBe("contribution--org.example-union--org.x-for-governor-2026--2026--general--monetary");
    expect(relationshipId({ ...rec, money: { ...rec.money, amount_cents: 999 } })).toBe(relationshipId(rec));
  });
  it("encodes contest refs without slashes", () => {
    expect(refToken("contest:2026-ca-general/prop-3")).toBe("contest.2026-ca-general.prop-3");
    expect(
      relationshipId({ type: "endorsement", endorser: "org:a", endorsee: "contest:2026-ca-general/prop-3", cycle: 2026 }),
    ).toBe("endorsement--org.a--contest.2026-ca-general.prop-3--2026");
  });
  it("uses in-house when lobbying has no firm", () => {
    expect(
      relationshipId({
        type: "lobbying",
        client: "org:a",
        jurisdiction: "ca",
        money: { amount_cents: 1, period: { start: "2025-01-01", end: "2025-12-31" }, basis: "reported_total" },
      }),
    ).toBe("lobbying--org.a--in-house--ca--2025-01-01--2025-12-31");
  });
  it("throws when an identifying field is missing", () => {
    expect(() => relationshipId({ type: "endorsement", endorser: "org:a", cycle: 2026 })).toThrow(/endorsee/);
  });
});
