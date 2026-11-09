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

  it("lists contest results and promise tracking updates", () => {
    expect(all("SELECT contest, person, votes, won, certified, certified_date FROM contest_results ORDER BY contest, votes DESC")).toEqual([
      { contest: "contest:2030-zz-general/governor", person: "person:avery-sample", votes: 1204331, won: 1, certified: 1, certified_date: "2030-12-05" },
      { contest: "contest:2030-zz-general/governor", person: "person:jordan-example", votes: 987120, won: 0, certified: 1, certified_date: "2030-12-05" },
    ]);
    // The "None of These Candidates" line (format-v3): one row per contest that has it.
    expect(all("SELECT contest, votes, certified, certified_date FROM contest_none_of_these ORDER BY contest")).toEqual([
      { contest: "contest:2030-zz-general/governor", votes: 41205, certified: 1, certified_date: "2030-12-05" },
    ]);
    expect(all("SELECT contest, yes_votes, no_votes, passed FROM measure_results ORDER BY contest")).toEqual([
      { contest: "contest:2030-zz-general/exampleville-prop-a", yes_votes: 61204, no_votes: 39118, passed: 0 },
      { contest: "contest:2030-zz-general/exampleville-prop-b", yes_votes: 55870, no_votes: 44032, passed: 1 },
      { contest: "contest:2030-zz-general/prop-1", yes_votes: 1150002, no_votes: 1020775, passed: 1 },
    ]);
    expect(all("SELECT person, promise, id, date, status FROM promise_updates ORDER BY promise, date")).toEqual([
      { person: "person:avery-sample", promise: "state-widget-grant-fund", id: "proposed-budget-2031-32", date: "2031-01-10", status: "in_progress" },
      { person: "person:avery-sample", promise: "widget-apprenticeships", id: "ab-2031-signed", date: "2031-02-14", status: "done" },
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
    expect(all("SELECT effect, fy, low_usd, high_usd FROM measure_fiscal_schedule WHERE contest = 'contest:2030-zz-general/exampleville-prop-b'")).toEqual([
      { effect: "tax-revenue", fy: "2031-32", low_usd: 40000000, high_usd: 55000000 },
    ]);
    // Sized only in words: no amount, the statement's words kept, and the recorder's note.
    const words = all("SELECT estimate, low_usd, words, note FROM measure_fiscal_effects WHERE contest = 'contest:2030-zz-general/exampleville-prop-f' AND id = 'commission-staff'")[0];
    expect(words).toMatchObject({ estimate: "in_words", low_usd: null, words: "low hundreds of thousands of dollars a year" });
    expect(String(words?.["note"])).toMatch(/General Fund lane/);
    expect(all("SELECT total_label FROM budget_years WHERE budget = 'exampleville' AND kind = 'adopted'")).toEqual([{ total_label: null }]);
    expect(all("SELECT principal_usd, annual_cost_per_100k_assessed_usd FROM measure_bonds")).toEqual([{ principal_usd: 300000000, annual_cost_per_100k_assessed_usd: 9.5 }]);
    expect(all("SELECT COUNT(*) AS n FROM measure_conflicts")[0]!["n"]).toBe(2);
    expect(all("SELECT kind, fy, general_fund_usd, direction, amount_usd FROM budget_years WHERE budget = 'exampleville' ORDER BY kind, fy")).toEqual([
      { kind: "adopted", fy: "2030-31", general_fund_usd: 1100000000, direction: null, amount_usd: null },
      { kind: "forecast", fy: "2031-32", general_fund_usd: null, direction: "shortfall", amount_usd: 60000000 },
      { kind: "forecast", fy: "2032-33", general_fund_usd: null, direction: "shortfall", amount_usd: 95000000 },
      { kind: "forecast", fy: "2033-34", general_fund_usd: null, direction: "shortfall", amount_usd: 130000000 },
    ]);
  });

  it("lists who a measure affects, its ballot arguments in printed order, and their signers", () => {
    expect(all("SELECT grp, effect, conditional, figure FROM measure_affects WHERE contest = 'contest:2030-zz-general/exampleville-prop-a' ORDER BY grp")).toEqual([
      { grp: "lower_income_households", effect: "receives", conditional: 0, figure: null },
      { grp: "property_owners", effect: "pays", conditional: 0, figure: "about $9.50" },
    ]);
    expect(all("SELECT id, position, side, kind FROM measure_arguments WHERE contest = 'contest:2030-zz-general/exampleville-prop-a' ORDER BY position")).toEqual([
      { id: "proponent", position: 1, side: "yes", kind: "proponent" },
      { id: "rebuttal-to-proponent", position: 2, side: "no", kind: "rebuttal_to_proponent" },
      { id: "opponent", position: 3, side: "no", kind: "opponent" },
      { id: "rebuttal-to-opponent", position: 4, side: "yes", kind: "rebuttal_to_opponent" },
      { id: "paid-yes-01", position: 5, side: "yes", kind: "paid" },
    ]);
    // Who signed each side, across every argument (the site's "signed for / against" counts).
    expect(
      all(
        "SELECT a.side, COUNT(DISTINCT s.signer) AS n FROM measure_argument_signers s JOIN measure_arguments a ON a.contest = s.contest AND a.id = s.argument WHERE s.contest = 'contest:2030-zz-general/exampleville-prop-a' GROUP BY a.side ORDER BY a.side",
      ),
    ).toEqual([
      { side: "no", n: 1 },
      { side: "yes", n: 2 },
    ]);
  });

  it("splits lobbying targets into rows", () => {
    expect(all("SELECT target_kind, target FROM lobbying_targets ORDER BY target_kind")).toEqual([
      { target_kind: "agency", target: "Example State Assembly" },
      { target_kind: "bill", target: "ca-2029-ab-123" },
    ]);
  });
});
