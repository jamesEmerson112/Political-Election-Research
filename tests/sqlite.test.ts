import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, describe, expect, it } from "vitest";
import { buildBundle } from "../src/bundle.js";
import { writeSqlite } from "../src/sqlite.js";
import { FIXTURE_TODAY, VALID_DIR } from "./helpers.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "per-sqlite-"));
const file = path.join(dir, "test.sqlite");
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("SQLite export", () => {
  const bundle = buildBundle(VALID_DIR, { label: "fixture", fictional: true, today: FIXTURE_TODAY });
  writeSqlite(DatabaseSync, bundle, file);
  const db = new DatabaseSync(file, { readOnly: true });
  const all = (sql: string) => db.prepare(sql).all() as Array<Record<string, unknown>>;

  it("summarizes each candidate from the computed rollup", () => {
    expect(all("SELECT person, on_certified_list, subjects_researched, subjects_total, receipts_cents FROM v_candidates ORDER BY person")).toEqual([
      { person: "person:avery-sample", on_certified_list: 1, subjects_researched: 2, subjects_total: 2, receipts_cents: 7_000_000 },
      { person: "person:jordan-example", on_certified_list: 1, subjects_researched: 2, subjects_total: 2, receipts_cents: 2_500_000 },
    ]);
  });

  it("keeps every citation with its record and pointer, and every citation resolves", () => {
    expect(all("SELECT COUNT(*) AS n FROM citations WHERE source NOT IN (SELECT ref FROM sources)")[0]!["n"]).toBe(0);
    const rows = all("SELECT record_kind, record_id, pointer FROM citations WHERE record_kind = 'position' AND record_id LIKE 'person:avery-sample|q:%' ORDER BY pointer");
    expect(rows).toEqual([
      { record_kind: "position", record_id: "person:avery-sample|q:widgets/subsidize-widgets|2030-09-20", pointer: "/citations/0" },
      { record_kind: "position", record_id: "person:avery-sample|q:widgets/subsidize-widgets|2030-09-20", pointer: "/points/0/citations/0" },
    ]);
  });

  it("exposes the latest stance per candidate and subject", () => {
    expect(all("SELECT person, stance FROM v_candidate_stances WHERE subject = 'q:widgets/subsidize-widgets' ORDER BY person")).toEqual([
      { person: "person:avery-sample", stance: "support" },
      { person: "person:jordan-example", stance: "no_public_position" },
    ]);
  });

  it("lists office connections, links and legal basis", () => {
    expect(all("SELECT office, type, count, bodies, text, targets FROM office_connections ORDER BY office, type")).toEqual([
      { office: "office:exampleville-council-member", type: "appoints", count: 12, bodies: 3, text: "Appoints 12 seats on 3 boards and commissions", targets: null },
      { office: "office:exampleville-council-member", type: "elected_by", count: 7, bodies: null, text: "Elected from 7 districts (7 seats)", targets: null },
    ]);
    expect(all("SELECT legal_basis_url, official_site, civlab FROM offices WHERE id = 'exampleville-council-member'")).toEqual([
      {
        legal_basis_url: "https://exampleville.example.gov/charter",
        official_site: "https://exampleville.example.gov/council",
        civlab: "https://graph.civlab.org/zz/elected/zz-exampleville-city-council",
      },
    ]);
    const pointers = all("SELECT pointer FROM citations WHERE record_kind = 'office' AND record_id = 'exampleville-council-member' AND pointer LIKE '/connections/%' ORDER BY pointer");
    expect(pointers.map((r) => r["pointer"])).toEqual(["/connections/0/citations/0", "/connections/1/citations/0"]);
  });

  it("lists ballot-measure fiscal effects, bonds, conflicts and the budget baseline", () => {
    const c = all("SELECT measure_type, vote_threshold, placed_by, jurisdiction_name FROM contests WHERE id = '2030-zz-general/exampleville-prop-a'")[0];
    expect(c).toEqual({ measure_type: "bond", vote_threshold: "two_thirds", placed_by: "governing_body", jurisdiction_name: "City of Exampleville" });
    expect(all("SELECT id, lane, direction, low_usd, high_usd, per FROM measure_fiscal_effects WHERE contest = 'contest:2030-zz-general/exampleville-prop-b' ORDER BY id")).toEqual([
      { id: "setup-cost", lane: "general_fund", direction: "cost", low_usd: 1200000, high_usd: 1200000, per: "one_time" },
      { id: "tax-revenue", lane: "general_fund", direction: "revenue", low_usd: 40000000, high_usd: 55000000, per: "year" },
    ]);
    expect(all("SELECT principal_usd, annual_cost_per_100k_assessed_usd FROM measure_bonds")).toEqual([{ principal_usd: 300000000, annual_cost_per_100k_assessed_usd: 9.5 }]);
    expect(all("SELECT COUNT(*) AS n FROM measure_conflicts")[0]!["n"]).toBe(2);
    expect(all("SELECT kind, fy, general_fund_usd, direction, amount_usd FROM budget_years WHERE budget = 'exampleville' ORDER BY kind, fy")).toEqual([
      { kind: "adopted", fy: "2030-31", general_fund_usd: 1100000000, direction: null, amount_usd: null },
      { kind: "forecast", fy: "2031-32", general_fund_usd: null, direction: "shortfall", amount_usd: 60000000 },
      { kind: "forecast", fy: "2032-33", general_fund_usd: null, direction: "shortfall", amount_usd: 95000000 },
      { kind: "forecast", fy: "2033-34", general_fund_usd: null, direction: "shortfall", amount_usd: 130000000 },
    ]);
  });

  it("splits lobbying targets into rows", () => {
    expect(all("SELECT target_kind, target FROM lobbying_targets ORDER BY target_kind")).toEqual([
      { target_kind: "agency", target: "Example State Assembly" },
      { target_kind: "bill", target: "ca-2029-ab-123" },
    ]);
  });
});
