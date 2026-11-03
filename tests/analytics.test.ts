import { describe, expect, it } from "vitest";
import type { BeforeSendEvent } from "@vercel/analytics";
import { analyticsOn, beforeSend, pageAddress } from "../web/src/lib/analytics.js";
import { serializeChoice } from "../web/src/lib/ballot.js";

const SITE = "https://political-election-research.vercel.app/";
/** The hash My ballot writes (Overview.svelte): the visitor's district numbers. */
const MY_BALLOT = `#overview?${serializeChoice({ cd: [11], boe: [2], sd: [11], ad: [17, 19], county: [75], sfsup: [6] })}`;

describe("Vercel Web Analytics", () => {
  it("reports the page's address without the hash or query string", () => {
    expect(MY_BALLOT).toBe("#overview?cd=11&boe=2&sd=11&ad=17,19&county=75&sfsup=6");
    expect(pageAddress(SITE)).toBe(SITE);
    expect(pageAddress(`${SITE}${MY_BALLOT}`)).toBe(SITE);
    expect(pageAddress(`${SITE}#trial`)).toBe(SITE);
    expect(pageAddress(`${SITE}#2026-ca-general%2Fgovernor`)).toBe(SITE);
    expect(pageAddress(`${SITE}?utm_source=news${MY_BALLOT}`)).toBe(SITE);
    expect(pageAddress(`${SITE}?`)).toBe(SITE);
    expect(pageAddress(`${SITE}#`)).toBe(SITE);
    expect(pageAddress(`${SITE}docs/page?x=1#y`)).toBe(`${SITE}docs/page`);
    expect(pageAddress("https://political-election-research.vercel.app#a\nb?c")).toBe("https://political-election-research.vercel.app");
  });

  it("applies to every event and keeps its other fields", () => {
    expect(beforeSend({ type: "pageview", url: `${SITE}${MY_BALLOT}` })).toEqual({ type: "pageview", url: SITE });
    expect(beforeSend({ type: "event", url: `${SITE}?q=1#trial` })).toEqual({ type: "event", url: SITE });
    const withPayload = { type: "event", url: `${SITE}#x`, payload: { name: "n" } } as BeforeSendEvent;
    expect(beforeSend(withPayload)).toEqual({ type: "event", url: SITE, payload: { name: "n" } });
  });

  it("runs only on the public site", () => {
    expect(analyticsOn("political-election-research.vercel.app")).toBe(true);
    for (const host of [
      "localhost",
      "127.0.0.1",
      "",
      "political-election-research-git-main-jamesemerson112.vercel.app",
      "www.political-election-research.vercel.app",
      "political-election-research.vercel.app.example.com",
      "example.org",
    ]) {
      expect(analyticsOn(host)).toBe(false);
    }
  });
});
