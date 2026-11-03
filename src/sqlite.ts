/**
 * SQLite export: a generated, queryable copy of a Bundle. The JSON files stay
 * the source of truth (diffable, deterministic); this database is rebuilt from
 * them by `npm run db` and never edited by hand.
 *
 * Every citation and search log is kept with the record and JSON pointer it
 * came from, so SQL answers keep their provenance. Computed values (funding
 * rollups, coverage, the task queue) come from the same library functions the
 * CLI uses rather than being re-implemented in SQL.
 */
import type { DatabaseSync as DatabaseSyncT } from "node:sqlite";
import type { Bundle } from "./bundle.js";
import type { Rec } from "./dataset.js";

const SCHEMA = `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE sources (id TEXT PRIMARY KEY, ref TEXT, kind TEXT, title TEXT, publisher TEXT, url TEXT, archive_url TEXT,
  published TEXT, accessed TEXT, filing_system TEXT, filer_id TEXT, filing_id TEXT, form TEXT, superseded INTEGER);
CREATE TABLE elections (id TEXT PRIMARY KEY, ref TEXT, name TEXT, date TEXT, type TEXT, jurisdiction TEXT, cycle INTEGER, last_verified TEXT);
CREATE TABLE contests (id TEXT PRIMARY KEY, ref TEXT, kind TEXT, election TEXT, name TEXT, office TEXT, level TEXT, district INTEGER,
  number TEXT, official_title TEXT, origin TEXT, summary TEXT, jurisdiction_level TEXT, jurisdiction_name TEXT, measure_type TEXT,
  vote_threshold TEXT, placed_by TEXT, fiscal_statement_by TEXT, fiscal_as_of TEXT, last_verified TEXT);
CREATE TABLE measure_fiscal_effects (contest TEXT, id TEXT, lane TEXT, direction TEXT, low_usd INTEGER, high_usd INTEGER, per TEXT,
  start_fy TEXT, years INTEGER, estimate TEXT, text TEXT, PRIMARY KEY (contest, id));
CREATE TABLE measure_bonds (contest TEXT PRIMARY KEY, principal_usd INTEGER, debt_service_total_usd INTEGER, term_years INTEGER,
  annual_cost_per_100k_assessed_usd REAL);
CREATE TABLE measure_conflicts (contest TEXT, other TEXT, rule TEXT, PRIMARY KEY (contest, other));
CREATE TABLE measure_affects (contest TEXT, grp TEXT, label TEXT, effect TEXT, conditional INTEGER, figure TEXT, text TEXT,
  PRIMARY KEY (contest, grp, label, effect));
CREATE TABLE measure_arguments (contest TEXT, id TEXT, position INTEGER, side TEXT, kind TEXT, heading TEXT, funds_source TEXT, text TEXT,
  PRIMARY KEY (contest, id));
CREATE TABLE measure_argument_signers (contest TEXT, argument TEXT, position INTEGER, signer TEXT, PRIMARY KEY (contest, argument, position));
CREATE TABLE budgets (id TEXT PRIMARY KEY, name TEXT, jurisdiction TEXT, forecast_title TEXT, forecast_publisher TEXT, forecast_published TEXT,
  last_verified TEXT);
CREATE TABLE budget_years (budget TEXT, kind TEXT, fy TEXT, total_usd INTEGER, general_fund_usd INTEGER, direction TEXT, amount_usd INTEGER,
  basis TEXT, PRIMARY KEY (budget, kind, fy));
CREATE TABLE contest_candidates (contest TEXT, person TEXT, party TEXT, ballot_designation TEXT, incumbent INTEGER, PRIMARY KEY (contest, person));
CREATE TABLE agendas (contest TEXT PRIMARY KEY, kind TEXT, endorsements_target INTEGER, top_contributors INTEGER, finance_cutoff TEXT,
  seeded_date TEXT, seeded_note TEXT);
CREATE TABLE agenda_candidates (contest TEXT, person TEXT, name TEXT, ord INTEGER, PRIMARY KEY (contest, person));
CREATE TABLE agenda_subjects (contest TEXT, subject TEXT, ord INTEGER, PRIMARY KEY (contest, subject));
CREATE TABLE leads (contest TEXT, person TEXT, topic TEXT, label TEXT, text TEXT, hint TEXT, provided_by TEXT, provided_date TEXT, ord INTEGER);
CREATE TABLE issues (id TEXT PRIMARY KEY, name TEXT, description TEXT);
CREATE TABLE questions (ref TEXT PRIMARY KEY, issue TEXT, id TEXT, text TEXT, support_means TEXT, oppose_means TEXT, notes TEXT, added TEXT);
CREATE TABLE people (id TEXT PRIMARY KEY, ref TEXT, name TEXT, public_figure INTEGER, last_verified TEXT,
  party_registration TEXT, party_registration_status TEXT, birth_date TEXT, birth_date_status TEXT, birthplace TEXT, birthplace_status TEXT,
  occupation TEXT, occupation_status TEXT, residence_city TEXT, residence_city_status TEXT,
  offices_held_as_of TEXT, education_as_of TEXT, career_as_of TEXT);
CREATE TABLE person_career (person TEXT, role TEXT, organization TEXT, start TEXT, "end" TEXT);
CREATE TABLE offices (id TEXT PRIMARY KEY, ref TEXT, name TEXT, level TEXT, jurisdiction TEXT, body TEXT, seats REAL, constituents REAL,
  term_years REAL, term_limit TEXT, powers TEXT, budget_usd REAL, budget_basis TEXT, salary_usd REAL, legal_basis_url TEXT, official_site TEXT,
  civlab TEXT, last_verified TEXT);
CREATE TABLE office_connections (office TEXT, type TEXT, count INTEGER, bodies INTEGER, text TEXT, targets TEXT, PRIMARY KEY (office, type));
CREATE TABLE bills (id TEXT PRIMARY KEY, title TEXT, summary TEXT, status TEXT, status_as_of TEXT, last_verified TEXT);
CREATE TABLE dossier_sections (person TEXT, section TEXT, as_of TEXT, items INTEGER, PRIMARY KEY (person, section));
CREATE TABLE dossier_items (person TEXT, section TEXT, id TEXT, title TEXT, kind TEXT, summary TEXT, date TEXT, as_of TEXT,
  issue TEXT, bill TEXT, response_summary TEXT, response_status TEXT, resolution_summary TEXT, PRIMARY KEY (person, section, id));
CREATE TABLE person_offices (person TEXT, office TEXT, jurisdiction TEXT, first_elected TEXT, start TEXT, "end" TEXT);
CREATE TABLE person_education (person TEXT, institution TEXT, degree TEXT, year INTEGER);
CREATE TABLE organizations (id TEXT PRIMARY KEY, ref TEXT, name TEXT, org_type TEXT, jurisdiction TEXT, last_verified TEXT);
CREATE TABLE aliases (entity TEXT, alias TEXT);
CREATE TABLE external_ids (entity TEXT, system TEXT, id TEXT);
CREATE TABLE positions (actor TEXT, subject TEXT, stance TEXT, summary TEXT, evidence_type TEXT, bill TEXT, cycle INTEGER, as_of TEXT,
  PRIMARY KEY (actor, subject, as_of));
CREATE TABLE relationships (id TEXT PRIMARY KEY, type TEXT, cycle INTEGER, from_ref TEXT, to_ref TEXT, official TEXT, role TEXT, side TEXT, action TEXT,
  form TEXT, election_designation TEXT, conduit TEXT, contest TEXT, amount_cents INTEGER, period_start TEXT, period_end TEXT,
  date TEXT, jurisdiction TEXT, rescinded_date TEXT, last_verified TEXT);
CREATE TABLE lobbying_targets (relationship TEXT, target_kind TEXT, target TEXT);
CREATE TABLE citations (record_kind TEXT, record_id TEXT, pointer TEXT, source TEXT, quote TEXT, locator TEXT, verified_by TEXT, verified_date TEXT);
CREATE TABLE search_logs (record_kind TEXT, record_id TEXT, pointer TEXT, where_searched TEXT, query TEXT, date TEXT);
CREATE TABLE tasks (id TEXT PRIMARY KEY, ord INTEGER, contest TEXT, kind TEXT, subject TEXT, item TEXT, file TEXT, detail TEXT,
  blocked_by TEXT, leads TEXT);
CREATE TABLE candidate_funding (contest TEXT, person TEXT, committees TEXT, through TEXT, receipts_cents INTEGER, loans_cents INTEGER,
  transfer_cents INTEGER, refund_cents INTEGER, ie_support_cents INTEGER, ie_oppose_cents INTEGER, latest_period_end TEXT,
  PRIMARY KEY (contest, person));
CREATE TABLE candidate_top_donors (contest TEXT, person TEXT, rank INTEGER, donor TEXT, amount_cents INTEGER);
CREATE TABLE coverage (contest TEXT, row_label TEXT, person TEXT, cell TEXT, asymmetric INTEGER);
CREATE TABLE validation_problems (file TEXT, pointer TEXT, code TEXT, severity TEXT, message TEXT);

CREATE INDEX idx_citations_record ON citations (record_kind, record_id);
CREATE INDEX idx_citations_source ON citations (source);
CREATE INDEX idx_rel_from ON relationships (from_ref);
CREATE INDEX idx_rel_to ON relationships (to_ref);

-- Names for any ref.
CREATE VIEW v_entities AS
  SELECT ref, name, 'person' AS kind FROM people
  UNION ALL SELECT ref, name, 'organization' FROM organizations
  UNION ALL SELECT ref, name, 'contest' FROM contests;

-- One row per candidate per researched contest (agenda), verified or not.
CREATE VIEW v_candidates AS
  SELECT ac.contest, ac.person, COALESCE(p.name, ac.name) AS name,
         cc.person IS NOT NULL AS on_certified_list, cc.party, cc.ballot_designation, cc.incumbent,
         p.party_registration, p.occupation, p.residence_city,
         (SELECT COUNT(*) FROM agenda_subjects s WHERE s.contest = ac.contest
            AND EXISTS (SELECT 1 FROM positions x WHERE x.actor = ac.person AND x.subject = s.subject)) AS subjects_researched,
         (SELECT COUNT(*) FROM agenda_subjects s WHERE s.contest = ac.contest) AS subjects_total,
         (SELECT COUNT(*) FROM relationships r WHERE r.type = 'endorsement' AND r.to_ref = ac.person AND r.rescinded_date IS NULL) AS endorsements,
         f.receipts_cents, f.ie_support_cents, f.ie_oppose_cents, f.through AS finance_through
  FROM agenda_candidates ac
  LEFT JOIN people p ON p.ref = ac.person
  LEFT JOIN contest_candidates cc ON cc.contest = ac.contest AND cc.person = ac.person
  LEFT JOIN candidate_funding f ON f.contest = ac.contest AND f.person = ac.person;

-- Latest stance of every candidate on every agenda subject (NULL stance = not researched yet).
CREATE VIEW v_candidate_stances AS
  SELECT ac.contest, ac.person, s.subject, s.ord,
         COALESCE(q.text, c.name) AS subject_text,
         x.stance, x.summary, x.evidence_type, x.bill, x.as_of,
         (SELECT COUNT(*) FROM citations ci WHERE ci.record_kind = 'position'
            AND ci.record_id = x.actor || '|' || x.subject || '|' || x.as_of) AS citations
  FROM agenda_candidates ac
  JOIN agenda_subjects s ON s.contest = ac.contest
  LEFT JOIN questions q ON q.ref = s.subject
  LEFT JOIN contests c ON 'contest:' || c.id = s.subject
  LEFT JOIN positions x ON x.actor = ac.person AND x.subject = s.subject
       AND x.as_of = (SELECT MAX(as_of) FROM positions y WHERE y.actor = ac.person AND y.subject = s.subject);

CREATE VIEW v_candidate_endorsements AS
  SELECT r.to_ref AS person, r.from_ref AS endorser, e.name AS endorser_name, e.kind AS endorser_kind,
         r.date, r.rescinded_date, r.cycle, r.id AS relationship
  FROM relationships r LEFT JOIN v_entities e ON e.ref = r.from_ref
  WHERE r.type = 'endorsement';

CREATE VIEW v_candidate_top_donors AS
  SELECT d.contest, d.person, d.rank, d.donor, e.name AS donor_name, e.kind AS donor_kind, d.amount_cents
  FROM candidate_top_donors d LEFT JOIN v_entities e ON e.ref = d.donor;

-- Money around each endorser: what they gave, what they received, what they spent lobbying.
CREATE VIEW v_endorser_money AS
  SELECT DISTINCT en.person AS endorsee, en.endorser, en.endorser_name,
         (SELECT COALESCE(SUM(amount_cents), 0) FROM relationships r WHERE r.type = 'contribution' AND r.from_ref = en.endorser) AS contributed_cents,
         (SELECT COALESCE(SUM(amount_cents), 0) FROM relationships r WHERE r.type = 'contribution' AND r.to_ref = en.endorser) AS received_cents,
         (SELECT COALESCE(SUM(amount_cents), 0) FROM relationships r WHERE r.type = 'lobbying' AND r.from_ref = en.endorser) AS lobbying_cents
  FROM v_candidate_endorsements en;

-- Your categories 5 and 6: where candidates in a contest agree or differ, computed from latest stances.
CREATE VIEW v_policy_comparison AS
  SELECT contest, subject, MIN(subject_text) AS subject_text,
         GROUP_CONCAT(person || '=' || COALESCE(stance, 'not_researched'), '; ') AS stances,
         CASE
           WHEN SUM(stance IS NULL OR stance NOT IN ('support', 'oppose', 'mixed')) > 0 THEN 'incomplete'
           WHEN COUNT(DISTINCT stance) = 1 THEN 'shared'
           ELSE 'differ'
         END AS comparison
  FROM v_candidate_stances GROUP BY contest, subject;

-- Your category 4: past policies, joined to bill titles and outcomes where a bill record exists.
CREATE VIEW v_candidate_legislation AS
  SELECT r.from_ref AS person, r.to_ref AS bill, b.title, r.action, r.date, b.status AS bill_status, b.status_as_of
  FROM relationships r LEFT JOIN bills b ON b.id = r.to_ref
  WHERE r.type = 'legislative_action';

CREATE VIEW v_citations AS
  SELECT ci.record_kind, ci.record_id, ci.pointer, ci.quote, ci.locator,
         s.id AS source_id, s.kind AS source_kind, s.title, s.publisher, s.url, s.archive_url, s.published, s.accessed
  FROM citations ci JOIN sources s ON s.ref = ci.source;
`;

type Row = Record<string, string | number | null>;

function s(v: unknown): string | null {
  return v === undefined || v === null ? null : typeof v === "string" ? v : JSON.stringify(v);
}
function n(v: unknown): number | null {
  return typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : null;
}

/** Walk a record collecting citations and search logs with their JSON pointers. */
function provenance(rec: unknown, kind: string, id: string, cites: Row[], logs: Row[], base = ""): void {
  const walk = (v: unknown, ptr: string, key: string) => {
    if (Array.isArray(v)) {
      if (key === "citations") {
        v.forEach((c: Rec, i) =>
          cites.push({
            record_kind: kind, record_id: id, pointer: `${ptr}/${i}`, source: s(c["source"]), quote: s(c["quote"]), locator: s(c["locator"]),
            verified_by: s((c["verified_by"] as Rec | undefined)?.["by"]), verified_date: s((c["verified_by"] as Rec | undefined)?.["date"]),
          }),
        );
        return;
      }
      if (key === "search_log") {
        v.forEach((l: Rec, i) =>
          logs.push({ record_kind: kind, record_id: id, pointer: `${ptr}/${i}`, where_searched: s(l["where"]), query: s(l["query"]), date: s(l["date"]) }),
        );
        return;
      }
      v.forEach((c, i) => walk(c, `${ptr}/${i}`, key));
    } else if (v && typeof v === "object") {
      for (const [k, c] of Object.entries(v)) walk(c, `${ptr}/${k}`, k);
    }
  };
  walk(rec, base, "");
}

function profileField(v: unknown): [string | null, string | null] {
  if (!v || typeof v !== "object") return [null, null];
  const o = v as Rec;
  if (o["status"] === "not_found") return [null, "not_found"];
  return [s(o["value"]), "cited"];
}

export function bundleRows(b: Bundle): Record<string, Row[]> {
  const t: Record<string, Row[]> = {};
  const push = (table: string, row: Row) => (t[table] ??= []).push(row);
  const cites: Row[] = [];
  const logs: Row[] = [];

  push("meta", { key: "label", value: b.label });
  push("meta", { key: "fictional", value: String(b.fictional) });
  push("meta", { key: "today", value: b.today });
  push("meta", { key: "generated_by", value: "npm run db (src/sqlite.ts)" });

  for (const r of b.sources) {
    const f = (r["filing"] as Rec | undefined) ?? {};
    push("sources", {
      id: s(r["id"]), ref: `src:${String(r["id"])}`, kind: s(r["kind"]), title: s(r["title"]), publisher: s(r["publisher"]),
      url: s(r["url"]), archive_url: s(r["archive_url"]), published: s(r["published"]), accessed: s(r["accessed"]),
      filing_system: s(f["system"]), filer_id: s(f["filer_id"]), filing_id: s(f["filing_id"]), form: s(f["form"]), superseded: n(f["superseded"]),
    });
  }
  for (const r of b.elections) {
    push("elections", {
      id: s(r["id"]), ref: `election:${String(r["id"])}`, name: s(r["name"]), date: s(r["date"]), type: s(r["type"]),
      jurisdiction: s(r["jurisdiction"]), cycle: n(r["cycle"]), last_verified: s(r["last_verified"]),
    });
    provenance(r, "election", String(r["id"]), cites, logs);
  }
  for (const r of b.contests) {
    push("contests", {
      id: s(r["id"]), ref: `contest:${String(r["id"])}`, kind: s(r["kind"]), election: s(r["election"]), name: s(r["name"]),
      office: s(r["office"]), level: s(r["level"]), district: n(r["district"]), number: s(r["number"]),
      official_title: s((r["official_title"] as Rec | undefined)?.["value"]), origin: s(r["origin"]),
      summary: s((r["summary"] as Rec | undefined)?.["value"]),
      jurisdiction_level: s((r["jurisdiction"] as Rec | undefined)?.["level"]), jurisdiction_name: s((r["jurisdiction"] as Rec | undefined)?.["name"]),
      measure_type: s((r["measure_type"] as Rec | undefined)?.["value"]), vote_threshold: s((r["vote_threshold"] as Rec | undefined)?.["value"]),
      placed_by: s((r["placed_by"] as Rec | undefined)?.["value"]), fiscal_statement_by: s((r["fiscal"] as Rec | undefined)?.["statement_by"]),
      fiscal_as_of: s((r["fiscal"] as Rec | undefined)?.["as_of"]), last_verified: s(r["last_verified"]),
    });
    const ref = `contest:${String(r["id"])}`;
    const fiscal = r["fiscal"] as Rec | undefined;
    for (const e of (fiscal?.["effects"] as Rec[] | undefined) ?? []) {
      const amt = e["amount"] as Rec | undefined;
      push("measure_fiscal_effects", {
        contest: ref, id: s(e["id"]), lane: s(e["lane"]), direction: s(e["direction"]), low_usd: n(amt?.["low_usd"]), high_usd: n(amt?.["high_usd"]),
        per: s(e["per"]), start_fy: s(e["start_fy"]), years: n(e["years"]), estimate: s(e["estimate"]), text: s(e["text"]),
      });
    }
    const bond = fiscal?.["bond"] as Rec | undefined;
    if (bond) {
      push("measure_bonds", {
        contest: ref, principal_usd: n(bond["principal_usd"]), debt_service_total_usd: n(bond["debt_service_total_usd"]),
        term_years: n(bond["term_years"]), annual_cost_per_100k_assessed_usd: n(bond["annual_cost_per_100k_assessed_usd"]),
      });
    }
    for (const c of (r["conflicts"] as Rec[] | undefined) ?? []) push("measure_conflicts", { contest: ref, other: s(c["contest"]), rule: s(c["rule"]) });
    for (const a of (r["affects"] as Rec[] | undefined) ?? []) {
      push("measure_affects", {
        contest: ref, grp: s(a["group"]), label: s(a["label"]) ?? "", effect: s(a["effect"]), conditional: a["conditional"] === true ? 1 : 0,
        figure: s(a["figure"]), text: s(a["text"]),
      });
    }
    ((r["arguments"] as Rec[] | undefined) ?? []).forEach((a, i) => {
      // Printed order is kept as `position`; signers in printed order too.
      push("measure_arguments", {
        contest: ref, id: s(a["id"]), position: i + 1, side: s(a["side"]), kind: s(a["kind"]), heading: s(a["heading"]),
        funds_source: s(a["funds_source"]), text: s(a["text"]),
      });
      ((a["authors"] as string[] | undefined) ?? []).forEach((who, j) =>
        push("measure_argument_signers", { contest: ref, argument: s(a["id"]), position: j + 1, signer: who }),
      );
    });
    for (const c of (r["candidates"] as Rec[] | undefined) ?? []) {
      push("contest_candidates", {
        contest: `contest:${String(r["id"])}`, person: s(c["person"]), party: s(c["party"]),
        ballot_designation: s(c["ballot_designation"]), incumbent: n(c["incumbent"]),
      });
    }
    provenance(r, "contest", String(r["id"]), cites, logs);
  }
  for (const a of b.agendas) {
    const tg = a["targets"] as Rec;
    const sd = a["seeded"] as Rec;
    push("agendas", {
      contest: s(a["contest"]), kind: s(a["kind"]), endorsements_target: n(tg["endorsements_per_candidate"]),
      top_contributors: n(tg["top_contributors"]), finance_cutoff: s(tg["finance_cutoff"]), seeded_date: s(sd["date"]), seeded_note: s(sd["note"]),
    });
    (a["candidates"] as Rec[]).forEach((c, i) =>
      push("agenda_candidates", { contest: s(a["contest"]), person: s(c["person"]), name: s(c["name"]), ord: i }),
    );
    [...(a["questions"] as string[]), ...(a["measures"] as string[])].forEach((subject, i) =>
      push("agenda_subjects", { contest: s(a["contest"]), subject, ord: i }),
    );
    provenance(a, "agenda", String(a["contest"]), cites, logs);
  }
  for (const l of b.leads) {
    const pr = l["provided"] as Rec;
    (l["items"] as Rec[]).forEach((it, i) =>
      push("leads", {
        contest: s(l["contest"]), person: s(it["person"]), topic: s(it["topic"]), label: s(it["label"]), text: s(it["text"]),
        hint: s(it["hint"]), provided_by: s(pr["by"]), provided_date: s(pr["date"]), ord: i,
      }),
    );
  }
  for (const r of b.issues) {
    push("issues", { id: s(r["id"]), name: s(r["name"]), description: s(r["description"]) });
    for (const q of r["questions"] as Rec[]) {
      push("questions", {
        ref: `q:${String(r["id"])}/${String(q["id"])}`, issue: s(r["id"]), id: s(q["id"]), text: s(q["text"]),
        support_means: s(q["support_means"]), oppose_means: s(q["oppose_means"]), notes: s(q["notes"]), added: s(q["added"]),
      });
    }
  }
  const entityExtras = (ref: string, r: Rec) => {
    for (const a of (r["aliases"] as string[] | undefined) ?? []) push("aliases", { entity: ref, alias: a });
    for (const x of (r["ids"] as Rec[] | undefined) ?? []) push("external_ids", { entity: ref, system: s(x["system"]), id: s(x["id"]) });
  };
  for (const r of b.people) {
    const ref = `person:${String(r["id"])}`;
    const cp = (r["candidate_profile"] as Rec | undefined) ?? {};
    const [party, partyS] = profileField(cp["party_registration"]);
    const [occ, occS] = profileField(cp["occupation"]);
    const [born, bornS] = profileField(cp["birth_date"]);
    const [place, placeS] = profileField(cp["birthplace"]);
    const career = cp["career"] as Rec | undefined;
    const [city, cityS] = profileField(cp["residence_city"]);
    const offices = cp["offices_held"] as Rec | undefined;
    const edu = cp["education"] as Rec | undefined;
    push("people", {
      id: s(r["id"]), ref, name: s(r["name"]), public_figure: n(r["public_figure"]), last_verified: s(r["last_verified"]),
      party_registration: party, party_registration_status: partyS, birth_date: born, birth_date_status: bornS,
      birthplace: place, birthplace_status: placeS, occupation: occ, occupation_status: occS,
      residence_city: city, residence_city_status: cityS, offices_held_as_of: s(offices?.["as_of"]), education_as_of: s(edu?.["as_of"]),
      career_as_of: s(career?.["as_of"]),
    });
    for (const c of (career?.["items"] as Rec[] | undefined) ?? []) {
      push("person_career", { person: ref, role: s(c["role"]), organization: s(c["organization"]), start: s(c["start"]), end: s(c["end"]) });
    }
    for (const o of (offices?.["items"] as Rec[] | undefined) ?? []) {
      push("person_offices", {
        person: ref, office: s(o["office"]), jurisdiction: s(o["jurisdiction"]), first_elected: s(o["first_elected"]), start: s(o["start"]), end: s(o["end"]),
      });
    }
    for (const e of (edu?.["items"] as Rec[] | undefined) ?? []) {
      push("person_education", { person: ref, institution: s(e["institution"]), degree: s(e["degree"]), year: n(e["year"]) });
    }
    entityExtras(ref, r);
    provenance(r, "person", String(r["id"]), cites, logs);
  }
  for (const r of b.organizations) {
    const ref = `org:${String(r["id"])}`;
    push("organizations", {
      id: s(r["id"]), ref, name: s(r["name"]), org_type: s(r["org_type"]), jurisdiction: s(r["jurisdiction"]), last_verified: s(r["last_verified"]),
    });
    entityExtras(ref, r);
    provenance(r, "organization", String(r["id"]), cites, logs);
  }
  const num = (v: unknown) => n((v as Rec | undefined)?.["value"]);
  for (const r of b.offices) {
    push("offices", {
      id: s(r["id"]), ref: `office:${String(r["id"])}`, name: s(r["name"]), level: s(r["level"]), jurisdiction: s(r["jurisdiction"]), body: s(r["body"]),
      seats: num(r["seats"]), constituents: num(r["constituents"]), term_years: num(r["term_years"]),
      term_limit: s((r["term_limit"] as Rec | undefined)?.["value"]), powers: s((r["powers"] as Rec | undefined)?.["value"]),
      budget_usd: num(r["budget"]), budget_basis: s((r["budget"] as Rec | undefined)?.["basis"]), salary_usd: num(r["salary"]),
      legal_basis_url: s((r["legal_basis"] as Rec | undefined)?.["url"]), official_site: s((r["links"] as Rec | undefined)?.["official_site"]),
      civlab: s((r["links"] as Rec | undefined)?.["civlab"]), last_verified: s(r["last_verified"]),
    });
    for (const c of (r["connections"] as Rec[] | undefined) ?? []) {
      const targets = c["targets"] as string[] | undefined;
      push("office_connections", {
        office: `office:${String(r["id"])}`, type: s(c["type"]), count: n(c["count"]), bodies: n(c["bodies"]), text: s(c["text"]),
        targets: targets?.length ? JSON.stringify(targets) : null,
      });
    }
    provenance(r, "office", String(r["id"]), cites, logs);
  }
  for (const r of b.budgets) {
    const fc = r["forecast"] as Rec | undefined;
    push("budgets", {
      id: s(r["id"]), name: s(r["name"]), jurisdiction: s(r["jurisdiction"]), forecast_title: s(fc?.["title"]),
      forecast_publisher: s(fc?.["publisher"]), forecast_published: s(fc?.["published"]), last_verified: s(r["last_verified"]),
    });
    for (const y of (r["adopted"] as Rec[] | undefined) ?? []) {
      push("budget_years", {
        budget: s(r["id"]), kind: "adopted", fy: s(y["fy"]), total_usd: n(y["total_usd"]), general_fund_usd: n(y["general_fund_usd"]),
        direction: null, amount_usd: null, basis: s(y["basis"]),
      });
    }
    for (const y of (fc?.["years"] as Rec[] | undefined) ?? []) {
      push("budget_years", {
        budget: s(r["id"]), kind: "forecast", fy: s(y["fy"]), total_usd: null, general_fund_usd: null, direction: s(y["direction"]),
        amount_usd: n(y["amount_usd"]), basis: s(y["basis"]),
      });
    }
    provenance(r, "budget", String(r["id"]), cites, logs);
  }
  for (const r of b.bills) {
    const st = r["status"] as Rec;
    push("bills", {
      id: s(r["id"]), title: s((r["title"] as Rec)["value"]), summary: s((r["summary"] as Rec | undefined)?.["value"]),
      status: s(st["value"]), status_as_of: s(st["as_of"]), last_verified: s(r["last_verified"]),
    });
    provenance(r, "bill", String(r["id"]), cites, logs);
  }
  for (const d of b.dossiers) {
    const person = String(d["actor"]);
    for (const section of ["track_record", "promises", "controversies"]) {
      const sec = d[section] as Rec | undefined;
      if (!sec) continue;
      const items = sec["items"] as Rec[];
      push("dossier_sections", { person, section, as_of: s(sec["as_of"]), items: items.length });
      for (const it of items) {
        const resp = it["response"] as Rec | undefined;
        push("dossier_items", {
          person, section, id: s(it["id"]), title: s(it["title"]), kind: s(it["kind"]), summary: s(it["summary"]), date: s(it["date"]),
          as_of: s(it["as_of"]), issue: s(it["issue"]), bill: s(it["bill"]), response_summary: s(resp?.["summary"]),
          response_status: resp ? (resp["status"] === "not_found" ? "not_found" : "cited") : null,
          resolution_summary: s((it["resolution"] as Rec | undefined)?.["summary"]),
        });
      }
    }
    provenance(d, "dossier", person, cites, logs);
  }
  for (const file of b.positions) {
    for (const p of file["positions"] as Rec[]) {
      const id = `${String(file["actor"])}|${String(p["subject"])}|${String(p["as_of"])}`;
      push("positions", {
        actor: s(file["actor"]), subject: s(p["subject"]), stance: s(p["stance"]), summary: s(p["summary"]),
        evidence_type: s(p["evidence_type"]), bill: s(p["bill"]), cycle: n(p["cycle"]), as_of: s(p["as_of"]),
      });
      provenance(p, "position", id, cites, logs);
    }
  }
  const ends: Record<string, [string, string, string?]> = {
    endorsement: ["endorser", "endorsee"],
    committee_role: ["committee", "subject"],
    contribution: ["donor", "recipient"],
    independent_expenditure: ["spender", "target"],
    lobbying: ["client", "firm"],
    behested_payment: ["payor", "payee", "official"],
    affiliation: ["person", "organization"],
    legislative_action: ["person", "bill"],
    bill_position: ["actor", "bill"],
  };
  for (const r of b.relationships) {
    const type = String(r["type"]);
    const [from, to, official] = ends[type] ?? ["", ""];
    const money = (r["money"] as Rec | undefined) ?? {};
    const period = ((money["period"] ?? r["period"]) as Rec | undefined) ?? {};
    push("relationships", {
      id: s(r["id"]), type, cycle: n(r["cycle"]), from_ref: s(r[from]), to_ref: s(r[to]), official: official ? s(r[official]) : null,
      role: s(r["role"]), side: s(r["side"]), action: s(r["action"] ?? r["position"]), form: s(r["form"]), election_designation: s(r["election_designation"]),
      conduit: s(r["conduit"]), contest: s(r["contest"]), amount_cents: n(money["amount_cents"] ?? r["amount_cents"]),
      period_start: s(period["start"]), period_end: s(period["end"]), date: s(r["date"]), jurisdiction: s(r["jurisdiction"]),
      rescinded_date: s((r["rescinded"] as Rec | undefined)?.["date"]), last_verified: s(r["last_verified"]),
    });
    if (type === "lobbying") {
      const tg = r["targets"] as Rec;
      for (const [k, list] of [["bill", tg["bills"]], ["agency", tg["agencies"]], ["official", tg["officials"]]] as const) {
        for (const v of (list as string[] | undefined) ?? []) push("lobbying_targets", { relationship: s(r["id"]), target_kind: k, target: v });
      }
    }
    provenance(r, "relationship", String(r["id"]), cites, logs);
  }
  b.tasks.forEach((tk, i) =>
    push("tasks", {
      id: tk.id, ord: i, contest: tk.contest, kind: tk.kind, subject: tk.subject ?? null, item: tk.item ?? null,
      file: tk.file, detail: tk.detail, blocked_by: tk.blocked_by ?? null, leads: tk.leads ? JSON.stringify(tk.leads) : null,
    }),
  );
  for (const [contest, byPerson] of Object.entries(b.rollups)) {
    for (const [person, r] of Object.entries(byPerson)) {
      push("candidate_funding", {
        contest, person, committees: JSON.stringify(r.committees), through: r.through, receipts_cents: r.receipts_cents,
        loans_cents: r.loans_cents, transfer_cents: r.excluded.transfer_cents, refund_cents: r.excluded.refund_cents,
        ie_support_cents: r.independent_expenditures.support_cents, ie_oppose_cents: r.independent_expenditures.oppose_cents,
        latest_period_end: r.latest_period_end,
      });
      r.top_donors.forEach((d, i) => push("candidate_top_donors", { contest, person, rank: i + 1, donor: d.donor, amount_cents: d.amount_cents }));
    }
  }
  for (const [contest, cov] of Object.entries(b.coverage)) {
    for (const row of cov.rows) {
      row.cells.forEach((cell, i) =>
        push("coverage", { contest, row_label: row.label, person: cov.candidates[i]!, cell, asymmetric: row.asymmetric ? 1 : 0 }),
      );
    }
  }
  for (const p of b.validation.problems) push("validation_problems", { ...p });
  t["citations"] = cites;
  t["search_logs"] = logs;
  return t;
}

export function writeSqlite(DatabaseSync: typeof DatabaseSyncT, b: Bundle, file: string): Record<string, number> {
  const db = new DatabaseSync(file);
  try {
    db.exec(SCHEMA);
    const rows = bundleRows(b);
    const counts: Record<string, number> = {};
    db.exec("BEGIN");
    for (const [table, list] of Object.entries(rows).sort(([a], [b2]) => (a < b2 ? -1 : 1))) {
      if (!list.length) continue;
      const cols = Object.keys(list[0]!);
      const stmt = db.prepare(
        `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
      );
      for (const row of list) stmt.run(...cols.map((c) => row[c] ?? null));
      counts[table] = list.length;
    }
    db.exec("COMMIT");
    return counts;
  } finally {
    db.close();
  }
}
