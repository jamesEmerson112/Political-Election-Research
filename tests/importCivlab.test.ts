import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { FileMap, Rec } from "../src/dataset.js";
import {
  buildIdFromHtml,
  civlabFacts,
  displayName,
  graphDataUrl,
  graphFromPayload,
  importCivlab,
  parseCivlabUrl,
  sentences,
  verbClause,
  type CivlabEdge,
  type CivlabGraph,
} from "../src/importCivlab.js";
import { validateFiles } from "../src/validate.js";
import { applyPatches, FIXTURE_TODAY, HERE, VALID_DIR, validFiles } from "./helpers.js";

/** Fictional graph in CivLab's Next.js data payload shape. */
const payload = JSON.parse(fs.readFileSync(path.join(HERE, "fixtures", "civlab", "zz.json"), "utf8")) as unknown;
const graph = () => graphFromPayload(structuredClone(payload));
const NODE = "zz-exampleville-city-council";
const OFFICE = "offices/exampleville-council-member.json";
const opts = { dataDir: VALID_DIR, today: FIXTURE_TODAY };

// Parsed JSON, read loosely in assertions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = Record<string, any>;
const computed = (locator: string): Rec => ({ source: "src:x", locator, unverified: { by: "t", method: "computed", date: FIXTURE_TODAY } });
const quoted = (quote: string): Rec => ({ source: "src:x", quote });
const byType = (conns: J[]) => Object.fromEntries(conns.map((c) => [c["type"], c])) as Record<string, J>;
const officeOf = (files: FileMap) => JSON.parse(files.get(OFFICE)!) as J;
const merged = (base: FileMap, writes: Map<string, string>): FileMap => new Map([...base, ...writes]);
const run = (files: FileMap, g: CivlabGraph = graph()) => importCivlab(files, { zz: g }, opts);

describe("CivLab URLs and payloads", () => {
  it("parses node URLs and rejects others", () => {
    expect(parseCivlabUrl("https://graph.civlab.org/sf/elected/ccsf-board-of-supervisors")).toEqual({ gov: "sf", section: "elected", slug: "ccsf-board-of-supervisors" });
    expect(parseCivlabUrl("https://graph.civlab.org/us/elected/us-the-house-of-representatives/")).toEqual({
      gov: "us",
      section: "elected",
      slug: "us-the-house-of-representatives",
    });
    expect(parseCivlabUrl("https://graph.civlab.org/sf")).toBeNull();
    expect(parseCivlabUrl("http://graph.civlab.org/sf/elected/x")).toBeNull();
    expect(parseCivlabUrl("https://example.org/sf/elected/x")).toBeNull();
  });

  it("finds the build id from the preload link, else from __NEXT_DATA__", () => {
    const preload = '<link rel="preload" href="/_next/data/AbC123_x/graph/zz.json" as="fetch"/>';
    expect(buildIdFromHtml(preload, "zz")).toBe("AbC123_x");
    expect(buildIdFromHtml('<script id="__NEXT_DATA__">{"page":"/graph/[gov]","buildId":"Zz9"}</script>', "zz")).toBe("Zz9");
    expect(buildIdFromHtml("<html></html>", "zz")).toBeNull();
    expect(graphDataUrl("zz", "AbC123_x")).toBe("https://graph.civlab.org/_next/data/AbC123_x/graph/zz.json");
  });

  it("accepts the Next.js payload or a bare graph, and rejects anything else", () => {
    const g = graph();
    expect(Object.keys(g.nodes)).toContain(NODE);
    expect(graphFromPayload({ nodes: g.nodes, edges: g.edges }).nodes[NODE]).toBeDefined();
    expect(() => graphFromPayload({ pageProps: {} })).toThrow(/not a CivLab graph/);
  });
});

describe("description text", () => {
  it("splits sentences as exact substrings, not after abbreviations", () => {
    const desc = graph().nodes[NODE]!.description!;
    const s = sentences(desc);
    expect(s).toEqual([
      "The Exampleville City Council adopts ordinances under Art. II of the Exampleville Charter.",
      "It adopts the annual budget, oversees city departments, and confirms appointments to the U.S. Route 9 Corridor Board.",
      "Members are elected to four-year terms.",
      "The Council holds the authority to override mayoral vetoes.",
    ]);
    for (const x of s) expect(desc.includes(x)).toBe(true);
  });

  it("extracts the clause that starts with the verb", () => {
    const s = "It approves budgets, oversees city departments, and confirms mayoral appointments.";
    expect(verbClause(s, "oversees")).toBe("oversees city departments");
    expect(verbClause(s, "confirms")).toBe("confirms mayoral appointments");
    expect(verbClause("It confirms appointments to the U.S. Route 9 Corridor Board.", "confirms")).toBe("confirms appointments to the U.S. Route 9 Corridor Board");
    expect(verbClause("It adopts the budget.", "confirms")).toBeNull();
  });

  it("drops a repeated body name from a head's title, for text only", () => {
    const g = graph();
    expect(displayName(g, NODE, "zz-council-president")).toBe("President of the Council");
    expect(displayName(g, NODE, "zz-council-clerk")).toBe("Clerk of the Council");
  });
});

describe("civlabFacts", () => {
  const facts = civlabFacts(graph(), "zz", NODE, computed, quoted);
  const c = byType(facts.connections);

  it("computes one connection per type, in schema order", () => {
    expect(facts.connections.map((x) => x["type"])).toEqual(["elected_by", "elects", "appoints", "confirms", "oversees", "advised_by"]);
  });

  it("counts who elects the body and what it elects", () => {
    expect(c["elected_by"]).toMatchObject({ count: 9, targets: ["People of Exampleville"], text: "Elected by the People of Exampleville (9 seats)" });
    expect(c["elects"]).toMatchObject({ targets: ["President of the Council of The Exampleville City Council"], text: "Elects the President of the Council" });
    expect(c["elects"]!["count"]).toBeUndefined();
  });

  it("sums appointed seats and groups them by body (metadata first, then the node, then the id without -member-N)", () => {
    // Planning 3 (commission metadata) + Library 1+1 (advisory_entity, no node) + Parks 2 (no node, no metadata) + Clerk 1.
    // The Mayor's 4 Planning seats are not the Council's.
    expect(c["appoints"]).toMatchObject({
      count: 8,
      bodies: 4,
      targets: ["Clerk of the Council", "Library Board", "Parks and Trails Board", "Planning Commission"],
      text: "Appoints 8 seats on 4 boards, commissions and other posts",
    });
    expect(c["appoints"]!["citations"][0].locator).toMatch(/^graph\/zz\.json · 5 appoints edges from zz-exampleville-city-council/);
  });

  it("quotes the description for confirms and oversees, and counts edges when present", () => {
    const sentence = "It adopts the annual budget, oversees city departments, and confirms appointments to the U.S. Route 9 Corridor Board.";
    expect(c["confirms"]).toEqual({ type: "confirms", text: "Confirms appointments to the U.S. Route 9 Corridor Board", citations: [quoted(sentence)] });
    expect(c["oversees"]).toMatchObject({ count: 1, targets: ["Department of Widgets"], text: "Oversees city departments" });
    expect(c["oversees"]!["citations"]).toEqual([quoted(sentence), computed("graph/zz.json · 1 oversees edge from zz-exampleville-city-council")]);
  });

  it("lists advisory bodies that point at the node only", () => {
    expect(c["advised_by"]).toMatchObject({ count: 2, targets: ["Widget Advisory Committee", "Youth Commission"], text: "Advised by 2 bodies" });
  });

  it("reads term, powers, seats and links from the node", () => {
    expect(facts.term).toEqual({ years: 4, quote: "Members are elected to four-year terms." });
    expect(facts.powers).toEqual(["The Council holds the authority to override mayoral vetoes."]);
    expect(facts.seatsCount).toBe(9);
    expect(facts.legalUrl).toBe("https://exampleville.example.gov/charter/article-2");
    expect(facts.officialUrl).toBe("https://exampleville.example.gov/council");
  });

  it("omits types with no edges and no description clause", () => {
    const g = graph();
    g.nodes[NODE]!.description = "The Council meets weekly.";
    const edges = Object.values(g.edges as Record<string, CivlabEdge>).filter((e) => e["type"] !== "oversees" && e["type"] !== "advises");
    g.edges = edges;
    const types = civlabFacts(g, "zz", NODE, computed, quoted).connections.map((x) => x["type"]);
    expect(types).toEqual(["elected_by", "elects", "appoints"]);
  });
});

describe("importCivlab", () => {
  it("never overwrites existing values: keeps our facts and connections, reports CivLab's", () => {
    const { writes, report, results } = run(validFiles());
    expect(results.filter((r) => r.action === "rejected")).toEqual([]);
    const o = officeOf(writes);
    const before = officeOf(validFiles());
    expect(o["seats"]).toEqual(before["seats"]);
    expect(o["powers"]).toEqual(before["powers"]);
    expect(o["legal_basis"]).toEqual(before["legal_basis"]);
    expect(o["links"]).toEqual(before["links"]);
    const c = byType(o["connections"]);
    expect(c["elected_by"]).toEqual(byType(before["connections"])["elected_by"]);
    expect(c["appoints"]).toEqual(byType(before["connections"])["appoints"]);
    expect(Object.keys(c)).toEqual(["elected_by", "elects", "appoints", "confirms", "oversees", "advised_by"]);
    expect(report.join("\n")).toMatch(/seats 7 vs CivLab seatsCount 9; kept ours/);
    expect(report.join("\n")).toMatch(/legal_basis\.url differs from CivLab/);
    expect(report.join("\n")).toMatch(/has powers; CivLab says "The Council holds the authority to override mayoral vetoes\."/);
    expect(report.join("\n")).toMatch(/connections\.appoints kept ours/);
    expect(report.join("\n")).toMatch(/totalSpendingBudget 123456789 \(FY2031\); not written/);
  });

  it("adds a CivLab quote to a term it agrees with", () => {
    const o = officeOf(run(validFiles()).writes);
    expect(o["term_years"]["value"]).toBe(4);
    expect(o["term_years"]["citations"]).toHaveLength(2);
    expect(o["term_years"]["citations"][1]).toMatchObject({ quote: "Members are elected to four-year terms.", locator: "node description" });
  });

  it("fills missing values from CivLab, citing a registered reference_work source", () => {
    const files = applyPatches(validFiles(), VALID_DIR, [{ file: OFFICE, remove: ["/term_years", "/powers", "/legal_basis", "/links/official_site", "/connections"] }]);
    const { writes } = run(files);
    const o = officeOf(writes);
    expect(o["term_years"]).toMatchObject({ value: 4, citations: [{ quote: "Members are elected to four-year terms." }] });
    expect(o["powers"]["value"]).toBe("The Council holds the authority to override mayoral vetoes.");
    expect(o["legal_basis"]).toMatchObject({ url: "https://exampleville.example.gov/charter/article-2" });
    expect(o["legal_basis"]["citations"][0]["unverified"]).toEqual({ by: "import:civlab", method: "computed from CivLab graph data", date: FIXTURE_TODAY });
    expect(o["links"]["official_site"]).toBe("https://exampleville.example.gov/council");
    expect(byType(o["connections"])["elected_by"]!["text"]).toBe("Elected by the People of Exampleville (9 seats)");
    const src = [...writes].find(([k]) => k.startsWith("sources/"))!;
    expect(JSON.parse(src[1])).toMatchObject({ kind: "reference_work", publisher: "CivLab", url: "https://graph.civlab.org/zz/elected/zz-exampleville-city-council" });
    expect(o["connections"][0]["citations"][0]["source"]).toBe(`src:${src[0].replace(/^sources\/|\.json$/g, "")}`);
  });

  it("produces records that validate (0 errors)", () => {
    const files = validFiles();
    const res = validateFiles(merged(files, run(files).writes), opts);
    expect(res.problems.filter((p) => p.severity === "error")).toEqual([]);
    expect(res.problems.some((p) => p.code === "UNVERIFIED_CITATION" && p.file === OFFICE)).toBe(true);
  });

  it("is deterministic: identical bytes on two runs, and nothing to write on a re-run", () => {
    const files = validFiles();
    const a = run(files);
    const b = run(files);
    expect([...b.writes]).toEqual([...a.writes]);
    const again = run(merged(files, a.writes));
    expect(again.writes.size).toBe(0);
    expect(again.results.every((r) => r.action === "unchanged")).toBe(true);
  });

  it("recomputes its own connections, keeps citations others added, and drops ones CivLab no longer has", () => {
    const files = applyPatches(validFiles(), VALID_DIR, [{ file: OFFICE, remove: ["/connections"] }]);
    const first = merged(files, run(files).writes);
    const o = officeOf(first);
    const charter = { source: "src:exampleville-example-gov-9cccac723f", quote: "The Council elects a President from among its members." };
    const patched = applyPatches(first, VALID_DIR, [{ file: OFFICE, set: { "/connections/1/citations/-": charter } }]);
    expect(officeOf(patched)["connections"][1]["type"]).toBe("elects");

    const g = graph();
    g.edges = Object.values(g.edges as Record<string, CivlabEdge>).filter((e) => e["type"] !== "advises");
    const { writes, report } = run(patched, g);
    const c = byType(officeOf(writes)["connections"]);
    expect(c["advised_by"]).toBeUndefined();
    expect(c["elects"]!["citations"]).toHaveLength(2);
    expect(c["elects"]!["citations"][1]).toEqual(charter);
    expect(report.join("\n")).toMatch(/connections\.advised_by is no longer in CivLab; dropped/);
    expect(Object.keys(byType(o["connections"]))).toContain("advised_by");
  });

  it("reports offices it cannot resolve without writing them", () => {
    const files = applyPatches(validFiles(), VALID_DIR, [{ file: OFFICE, set: { "/links/civlab": "https://graph.civlab.org/zz/elected/zz-nowhere" } }]);
    expect(run(files).report).toEqual([`${OFFICE}: node zz/zz-nowhere not in the graph; skipped`]);
    expect(importCivlab(validFiles(), {}, opts).report).toEqual([`${OFFICE}: no graph loaded for gov "zz"; skipped`]);
  });
});
