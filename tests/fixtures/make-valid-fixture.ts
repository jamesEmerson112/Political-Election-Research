/**
 * Regenerates tests/fixtures/valid/data — a small, entirely FICTIONAL dataset
 * (jurisdiction "zz", example.org sources) that exercises every record type.
 * Written through put() so the fixture is exactly what agents would produce.
 *
 *   npx tsx tests/fixtures/make-valid-fixture.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readDataDir, type Rec } from "../../src/dataset.js";
import { put, type PutKind } from "../../src/put.js";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "valid", "data");
export const FIXTURE_TODAY = "2030-11-01";

fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });

function p(kind: PutKind, rec: Rec, mode: "create" | "merge" = "create"): string {
  const res = put(readDataDir(DIR), kind, rec, { dataDir: DIR, mode, today: FIXTURE_TODAY });
  if (res.action === "rejected") {
    throw new Error(`${kind} rejected: ${res.message ?? ""} ${JSON.stringify(res.problems)}`);
  }
  if (res.content !== undefined) {
    const abs = path.join(DIR, res.file);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, res.content);
  }
  return res.ref ?? "";
}

const W = (n: number) => `https://web.archive.org/web/203010${String(n).padStart(2, "0")}120000/`;

// --- sources -------------------------------------------------------------
const srcList = p("source", {
  url: "https://sos.example.gov/2030-general/certified-list",
  kind: "government_record",
  title: "Certified List of Candidates, 2030 General Election",
  publisher: "Example Secretary of State",
  published: "2030-08-27",
  archive_url: W(1) + "https://sos.example.gov/2030-general/certified-list",
});
const srcCalendar = p("source", {
  url: "https://sos.example.gov/2030-general/calendar",
  kind: "government_record",
  title: "2030 General Election Calendar",
  publisher: "Example Secretary of State",
  published: "2030-01-05",
  archive_url: W(1) + "https://sos.example.gov/2030-general/calendar",
});
const srcMeasures = p("source", {
  url: "https://sos.example.gov/2030-general/measures",
  kind: "government_record",
  title: "Qualified Statewide Ballot Measures",
  publisher: "Example Secretary of State",
  published: "2030-07-01",
  archive_url: W(1) + "https://sos.example.gov/2030-general/measures",
});
const srcAveryBio = p("source", {
  url: "https://averysample.example.org/about",
  kind: "candidate_website",
  title: "About Avery",
  publisher: "Avery Sample for Governor 2030",
  published: "2030-02-01",
  archive_url: W(2) + "https://averysample.example.org/about",
});
const srcNews = p("source", {
  url: "https://news.example.com/2030/09/widgets-debate?utm_source=feed",
  kind: "news_report",
  title: "Candidates split on widget subsidies",
  publisher: "Example News",
  published: "2030-09-15",
  archive_url: W(3) + "https://news.example.com/2030/09/widgets-debate",
});
const srcDebate = p("source", {
  url: "https://video.example.com/watch?v=debate2030",
  kind: "video",
  title: "Gubernatorial debate, October 2030",
  publisher: "Example Public Media",
  published: "2030-10-08",
  archive_url: W(4) + "https://video.example.com/watch?v=debate2030",
});
const srcTimes = p("source", {
  url: "https://times.example.net/2030/08/candidate-profiles",
  kind: "news_report",
  title: "Meet the candidates for governor",
  publisher: "Example Times",
  published: "2030-08-20",
  archive_url: W(6) + "https://times.example.net/2030/08/candidate-profiles",
});
const srcEthics = p("source", {
  url: "https://ethics.example.gov/decisions/2028-117",
  kind: "government_record",
  title: "Stipulation and decision, case 2028-117",
  publisher: "Example Ethics Commission",
  published: "2028-12-10",
  archive_url: W(7) + "https://ethics.example.gov/decisions/2028-117",
});
const srcBill = p("source", {
  url: "https://legislature.example.gov/bills/2029/ab-123",
  kind: "legislative_record",
  title: "AB 123 Widget Workforce Act — bill history",
  publisher: "Example State Legislature",
  published: "2029-10-02",
  archive_url: W(8) + "https://legislature.example.gov/bills/2029/ab-123",
});
const filing = (n: number, filer: string, form: string, kind = "campaign_finance_filing") =>
  p("source", {
    url: `https://disclosure.example.gov/filing/${filer}/${n}`,
    kind,
    title: `Form ${form}, filer ${filer}`,
    publisher: "Example disclosure system",
    published: "2030-10-24",
    archive_url: W(5) + `https://disclosure.example.gov/filing/${filer}/${n}`,
    filing: { system: "cal-access", filer_id: filer, filing_id: String(n), form, period: { start: "2030-01-01", end: "2030-10-17" } },
  });
const fAvery = filing(9001, "1400001", "460");
const fJordan = filing(9002, "1400002", "460");
const fPac = filing(9003, "1400003", "460");
const fIe = filing(9004, "1400004", "496");
const fMeasure = filing(9005, "1400005", "460");
const fLobby = filing(9006, "E00001", "635", "lobbying_filing");
const fBehest = filing(9007, "803-avery", "803", "behested_payment_filing");

const cite = (source: string, quote: string) => [{ source, quote }];
const fcite = (source: string, locator: string) => [{ source, locator }];

const srcCharter = p("source", {
  url: "https://exampleville.example.gov/charter",
  kind: "government_record",
  title: "Exampleville City Charter",
  publisher: "City of Exampleville",
  published: "2019-01-01",
  archive_url: W(9) + "https://exampleville.example.gov/charter",
});
const srcGovOffice = p("source", {
  url: "https://example.gov/constitution/article-5",
  kind: "government_record",
  title: "Example State Constitution, Article V",
  publisher: "Example State",
  published: "2010-01-01",
  archive_url: W(9) + "https://example.gov/constitution/article-5",
});

// --- config, election, issues ------------------------------------------------
p("config", { privacy: { individual_donor_min_cents: 1_000_000 } });
p("election", {
  id: "2030-zz-general",
  name: "2030 Example State General Election",
  date: "2030-11-05",
  type: "general",
  jurisdiction: "zz",
  cycle: 2030,
  citations: cite(srcCalendar, "General Election: November 5, 2030"),
});
p("issue", {
  id: "widgets",
  name: "Widgets",
  description: "Public support for the widget industry.",
  questions: [
    {
      id: "subsidize-widgets",
      text: "Should the state subsidize widget manufacturing?",
      area: "economy",
      support_means: "Favors state subsidies for widget manufacturing.",
      oppose_means: "Opposes state subsidies for widget manufacturing.",
      added: "2030-06-01",
    },
  ],
  rejected_questions: [{ text: "Are widgets good?", reason: "Not a policy question; no clear support/oppose meaning.", date: "2030-06-01" }],
});

// --- people & orgs -----------------------------------------------------------
const avery = p("person", {
  name: "Avery Sample",
  public_figure: true,
  links: { campaign_site: "https://averysample.example.org" },
  candidate_profile: {
    party_registration: { value: "Example Party", citations: cite(srcList, "Avery Sample  Example Party  Widget Engineer") },
    birth_date: { value: "1980-04-12", citations: cite(srcAveryBio, "Born April 12, 1980, in Exampleville") },
    birthplace: { value: "Exampleville", citations: cite(srcAveryBio, "Born April 12, 1980, in Exampleville") },
    career: {
      as_of: "2030-10-01",
      items: [
        {
          role: "Widget engineer",
          organization: "Example Widget Works",
          start: "2006",
          citations: cite(srcAveryBio, "Avery has worked as a widget engineer for 20 years."),
        },
      ],
    },
    occupation: { value: "Widget engineer", citations: cite(srcAveryBio, "Avery has worked as a widget engineer for 20 years.") },
    residence_city: { value: "Exampleville", citations: cite(srcAveryBio, "Avery lives in Exampleville.") },
    offices_held: {
      as_of: "2030-10-01",
      items: [
        {
          office: "Exampleville City Council",
          office_ref: "office:exampleville-council-member",
          start: "2022-12-01",
          end: "2026-12-01",
          citations: cite(srcAveryBio, "Avery served on the Exampleville City Council from 2022 to 2026."),
        },
      ],
    },
    education: {
      as_of: "2030-10-01",
      items: [{ institution: "Example State University", degree: "B.S.", citations: cite(srcAveryBio, "B.S., Example State University") }],
    },
  },
});
const jordan = p("person", {
  name: "Jordan Example",
  public_figure: true,
  candidate_profile: {
    party_registration: { value: "Sample Party", citations: cite(srcList, "Jordan Example  Sample Party  Small Business Owner") },
    birth_date: {
      status: "not_found",
      as_of: "2030-10-01",
      search_log: [{ where: "Candidate website; Example Times profile; certified list", query: "Jordan Example born", date: "2030-10-01" }],
    },
    birthplace: { value: "Sampletown", citations: cite(srcTimes, "Example grew up in Sampletown") },
    career: {
      as_of: "2030-10-01",
      items: [
        { role: "Owner", organization: "Example Hardware", start: "2012", citations: cite(srcTimes, "has owned Example Hardware since 2012") },
      ],
    },
    occupation: { value: "Small business owner", citations: cite(srcList, "Jordan Example  Sample Party  Small Business Owner") },
    residence_city: {
      status: "not_found",
      as_of: "2030-10-01",
      search_log: [{ where: "Candidate website, certified list, Example News archive", query: "Jordan Example residence", date: "2030-10-01" }],
    },
    offices_held: {
      as_of: "2030-10-01",
      items: [],
      search_log: [{ where: "Example State legislature roster; Ballotpedia", query: "Jordan Example office", date: "2030-10-01" }],
    },
    education: {
      as_of: "2030-10-01",
      items: [],
      search_log: [{ where: "Candidate website; Example News", query: "Jordan Example education", date: "2030-10-01" }],
    },
  },
});
const patDonor = p("person", { name: "Pat Donor" });

const org = (name: string, org_type: string, extra: Rec = {}) => p("organization", { name, org_type, jurisdiction: "other", ...extra });
const averyCommittee = org("Avery Sample for Governor 2030", "candidate_committee", { ids: [{ system: "cal_access_filer", id: "1400001" }] });
const jordanCommittee = org("Jordan Example for Governor 2030", "candidate_committee", { ids: [{ system: "cal_access_filer", id: "1400002" }] });
const averyPac = org("Avery Sample Leadership PAC", "general_purpose_pac");
const union = org("Example Teachers Union", "labor_union");
const conduit = org("Example Conduit", "conduit");
const lobbyFirm = org("Example Lobbying Group", "lobbying_firm");
const yesProp1 = org("Yes on Prop 1 Committee", "ballot_measure_committee");
const ieCommittee = org("Example Independent Expenditure Committee", "ie_committee");
const foodBank = org("Example Food Bank", "nonprofit_501c3");

// --- offices -------------------------------------------------------------------
p("office", {
  id: "exampleville-council-member",
  name: "Member, Exampleville City Council",
  level: "local",
  jurisdiction: "City of Exampleville",
  body: "Exampleville City Council",
  seats: { value: 7, citations: cite(srcCharter, "The Council shall consist of seven members.") },
  constituents: { value: 21000, as_of: "2020", basis: "2020 census population ÷ 7 districts", citations: cite(srcCharter, "seven districts of approximately equal population") },
  term_years: { value: 4, citations: cite(srcCharter, "Members serve four-year terms.") },
  powers: { value: "Adopts city ordinances and the annual city budget.", citations: cite(srcCharter, "The Council adopts ordinances and the annual budget.") },
  links: { official_site: "https://exampleville.example.gov/council", civlab: "https://graph.civlab.org/zz/elected/zz-exampleville-city-council" },
  legal_basis: { url: "https://exampleville.example.gov/charter", label: "Exampleville City Charter", citations: cite(srcCharter, "The Council shall consist of seven members.") },
  connections: [
    { type: "appoints", count: 12, bodies: 3, text: "Appoints 12 seats on 3 boards and commissions", citations: cite(srcCharter, "The Council appoints the members of the Planning, Library and Parks boards.") },
    { type: "elected_by", count: 7, text: "Elected by district: 7 seats", citations: cite(srcCharter, "seven districts of approximately equal population") },
  ],
});
p("office", {
  id: "example-state-governor",
  name: "Governor of Example State",
  level: "state",
  jurisdiction: "Example State",
  seats: { value: 1, citations: cite(srcGovOffice, "The executive power is vested in the Governor.") },
  constituents: { value: 3900000, as_of: "2020", basis: "statewide population, 2020 census", citations: cite(srcGovOffice, "elected statewide") },
  term_years: { value: 4, citations: cite(srcGovOffice, "The Governor serves a four-year term.") },
});

// --- contests & agenda ---------------------------------------------------------
p("contest", {
  id: "2030-zz-general/governor",
  kind: "office",
  election: "election:2030-zz-general",
  name: "Governor",
  office: "Governor",
  level: "state",
  candidates: [
    { person: avery, party: "Example Party", ballot_designation: "Widget Engineer", incumbent: false, citations: cite(srcList, "Avery Sample  Example Party  Widget Engineer") },
    { person: jordan, party: "Sample Party", ballot_designation: "Small Business Owner", incumbent: false, citations: cite(srcList, "Jordan Example  Sample Party  Small Business Owner") },
  ],
});
p("contest", {
  id: "2030-zz-general/prop-1",
  kind: "measure",
  election: "election:2030-zz-general",
  name: "Proposition 1",
  number: "1",
  official_title: { value: "Widget Investment Act", citations: cite(srcMeasures, "Proposition 1 — Widget Investment Act") },
  origin: "initiative",
  summary: { value: "Creates a state fund for widget manufacturing grants.", citations: cite(srcMeasures, "Creates a state fund for widget manufacturing grants.") },
});
p("agenda", {
  contest: "contest:2030-zz-general/governor",
  kind: "office",
  office_ref: "office:example-state-governor",
  candidates: [
    { person: avery, name: "Avery Sample" },
    { person: jordan, name: "Jordan Example" },
  ],
  questions: ["q:widgets/subsidize-widgets"],
  measures: ["contest:2030-zz-general/prop-1"],
  targets: { endorsements_per_candidate: 1, top_contributors: 2, finance_cutoff: "2030-10-17" },
  seeded: { date: "2030-06-01", note: "Fictional fixture." },
  exhausted: [
    {
      task: "2030-zz-general/governor|legislation|person:jordan-example",
      date: "2030-10-30",
      search_log: [{ where: "Example State Legislature bill search; Example Times archive", query: "Jordan Example bill", date: "2030-10-30" }],
    },
    {
      task: "2030-zz-general/governor|independent_expenditures|person:jordan-example",
      date: "2030-10-30",
      search_log: [{ where: "Example disclosure system IE search", query: "Jordan Example", date: "2030-10-30" }],
    },
  ],
});

p("leads", {
  contest: "contest:2030-zz-general/governor",
  provided: { by: "fixture", date: "2030-06-01", note: "Fictional unverified hints." },
  items: [
    { person: avery, topic: "profile.occupation", label: "Job", text: "Engineer at a widget plant" },
    { person: jordan, topic: "q:widgets/subsidize-widgets", label: "Widgets", text: "Said at a town hall they oppose subsidies", hint: "oppose" },
  ],
});

// --- positions -----------------------------------------------------------------
p("position", {
  actor: avery,
  positions: [
    {
      subject: "q:widgets/subsidize-widgets",
      stance: "support",
      summary: "Said the state should fund widget manufacturing grants.",
      evidence_type: "statement",
      cycle: 2030,
      as_of: "2030-09-20",
      citations: cite(srcNews, "\"The state should invest in widgets,\" Sample said."),
    },
    {
      subject: "contest:2030-zz-general/prop-1",
      stance: "support",
      summary: "Said in the debate that they will vote yes on Proposition 1.",
      evidence_type: "debate",
      cycle: 2030,
      as_of: "2030-10-10",
      citations: [{ source: srcDebate, quote: "I'm voting yes on Prop 1.", locator: "00:41:10" }],
    },
  ],
});
p("position", {
  actor: jordan,
  positions: [
    {
      subject: "q:widgets/subsidize-widgets",
      stance: "no_public_position",
      cycle: 2030,
      as_of: "2030-10-01",
      search_log: [{ where: "Candidate website; Example News; debate transcript", query: "Jordan Example widgets", date: "2030-10-01" }],
    },
    {
      subject: "contest:2030-zz-general/prop-1",
      stance: "oppose",
      summary: "Said in the debate that they oppose Proposition 1.",
      evidence_type: "debate",
      cycle: 2030,
      as_of: "2030-10-10",
      citations: [{ source: srcDebate, quote: "Prop 1 is the wrong approach and I oppose it.", locator: "00:43:02" }],
    },
  ],
});

// --- relationships -----------------------------------------------------------------
const period = { start: "2030-01-01", end: "2030-10-17" };
const rel = (rec: Rec) => p("relationship", { cycle: 2030, ...rec });
rel({ type: "committee_role", committee: averyCommittee, subject: avery, role: "ca_controlled", contest: "contest:2030-zz-general/governor", citations: fcite(fAvery, "Cover page") });
rel({ type: "committee_role", committee: jordanCommittee, subject: jordan, role: "ca_controlled", contest: "contest:2030-zz-general/governor", citations: fcite(fJordan, "Cover page") });
rel({ type: "committee_role", committee: averyPac, subject: avery, role: "leadership_pac", citations: fcite(fPac, "Cover page") });
rel({ type: "committee_role", committee: yesProp1, subject: "contest:2030-zz-general/prop-1", role: "primarily_formed_support", citations: fcite(fMeasure, "Cover page") });
rel({
  type: "contribution", donor: union, recipient: averyCommittee, election_designation: "general", form: "monetary",
  money: { amount_cents: 5_000_000, period, basis: "itemized" }, citations: fcite(fAvery, "Schedule A, line 12"),
});
rel({
  type: "contribution", donor: patDonor, recipient: averyCommittee, election_designation: "primary", form: "monetary", conduit,
  money: { amount_cents: 2_000_000, period, basis: "itemized" }, citations: fcite(fAvery, "Schedule A, line 30"),
});
rel({
  type: "contribution", donor: averyPac, recipient: averyCommittee, election_designation: "general", form: "transfer",
  money: { amount_cents: 3_000_000, period, basis: "itemized" }, citations: fcite(fAvery, "Schedule I, line 2"),
});
rel({
  type: "contribution", donor: union, recipient: averyPac, election_designation: "other", form: "monetary",
  money: { amount_cents: 10_000_000, period, basis: "itemized" }, citations: fcite(fPac, "Schedule A, line 1"),
});
rel({
  type: "contribution", donor: union, recipient: jordanCommittee, election_designation: "general", form: "monetary",
  money: { amount_cents: 1_000_000, period, basis: "itemized" }, citations: fcite(fJordan, "Schedule A, line 4"),
});
rel({
  type: "contribution", donor: patDonor, recipient: jordanCommittee, election_designation: "general", form: "monetary",
  money: { amount_cents: 1_500_000, period, basis: "itemized" }, citations: fcite(fJordan, "Schedule A, line 9"),
});
rel({
  type: "contribution", donor: union, recipient: yesProp1, election_designation: "general", form: "monetary",
  money: { amount_cents: 100_000_000, period, basis: "itemized" }, citations: fcite(fMeasure, "Schedule A, line 1"),
});
rel({
  type: "independent_expenditure", spender: ieCommittee, target: avery, side: "support", election_designation: "general",
  money: { amount_cents: 25_000_000, period, basis: "reported_total" }, citations: fcite(fIe, "Summary page"),
});
rel({
  type: "independent_expenditure", spender: ieCommittee, target: "contest:2030-zz-general/prop-1", side: "oppose", election_designation: "general",
  money: { amount_cents: 7_500_000, period, basis: "reported_total" }, citations: fcite(fIe, "Summary page"),
});
rel({ type: "endorsement", endorser: union, endorsee: avery, date: "2030-04-01", citations: cite(srcNews, "The Example Teachers Union endorsed Sample.") });
rel({ type: "endorsement", endorser: union, endorsee: jordan, date: "2030-03-01", rescinded: { date: "2030-04-01", citations: cite(srcNews, "The union withdrew its endorsement of Example.") }, citations: cite(srcNews, "The union had endorsed Example in March.") });
rel({ type: "endorsement", endorser: foodBank, endorsee: jordan, date: "2030-05-01", citations: cite(srcNews, "The Example Food Bank backed Example.") });
rel({ type: "endorsement", endorser: union, endorsee: "contest:2030-zz-general/prop-1", side: "support", date: "2030-07-15", citations: cite(srcNews, "The union supports Proposition 1.") });
rel({
  type: "lobbying", client: union, firm: lobbyFirm, jurisdiction: "ca",
  targets: { bills: ["ca-2029-ab-123"], agencies: ["Example State Assembly"] },
  money: { amount_cents: 4_000_000, period: { start: "2029-01-01", end: "2030-06-30" }, basis: "aggregated_by_project" },
  citations: fcite(fLobby, "Payments to lobbying firms, line 1"),
});
rel({ type: "behested_payment", official: avery, payor: union, payee: foodBank, amount_cents: 500_000, date: "2030-03-01", citations: fcite(fBehest, "Line 1") });
p("bill", {
  id: "ca-2029-ab-123",
  title: { value: "Widget Workforce Act", citations: cite(srcBill, "AB 123 Widget Workforce Act") },
  status: { value: "enacted", as_of: "2029-10-02", citations: cite(srcBill, "Chaptered by Secretary of State, Chapter 412, Statutes of 2029") },
});
rel({
  type: "legislative_action", person: avery, bill: "ca-2029-ab-123", action: "publicly_supported", date: "2029-06-01", cycle: 2030,
  citations: cite(srcTimes, "Sample testified in support of AB 123 in June 2029."),
});
p("dossier", {
  actor: avery,
  track_record: {
    as_of: "2030-10-01",
    items: [
      {
        id: "exampleville-widget-incubator",
        title: "Exampleville widget incubator",
        kind: "program",
        summary: "Proposed the city's widget incubator program, which the council funded in 2024.",
        date: "2024",
        citations: cite(srcAveryBio, "Avery created the Exampleville widget incubator, funded by the council in 2024."),
      },
    ],
  },
  promises: {
    as_of: "2030-10-01",
    items: [
      {
        id: "state-widget-grant-fund",
        title: "State widget grant fund",
        summary: "Proposes a state fund for widget manufacturing grants.",
        issue: "widgets",
        as_of: "2030-09-20",
        citations: cite(srcNews, "\"The state should invest in widgets,\" Sample said."),
      },
    ],
  },
  controversies: {
    as_of: "2030-10-01",
    items: [],
    search_log: [{ where: "Example News and Example Times archives; Example Ethics Commission decisions", query: "Avery Sample", date: "2030-10-01" }],
  },
});
p("dossier", {
  actor: jordan,
  track_record: {
    as_of: "2030-10-01",
    items: [],
    search_log: [{ where: "Example Times archive; candidate website", query: "Jordan Example accomplishments", date: "2030-10-01" }],
  },
  promises: {
    as_of: "2030-10-01",
    items: [],
    search_log: [{ where: "Candidate website; debate video", query: "Jordan Example plan proposal", date: "2030-10-01" }],
  },
  controversies: {
    as_of: "2030-10-01",
    items: [
      {
        id: "late-filing-fine-2028",
        title: "Fine for a late campaign statement",
        date: "2028-12",
        summary: "The Example Ethics Commission fined Example's 2028 committee $500 for filing a campaign statement late.",
        citations: cite(srcEthics, "The committee shall pay an administrative penalty of $500."),
        response: {
          summary: "Example's campaign said the filing was late because of a software error and paid the fine.",
          citations: cite(srcTimes, "a software glitch delayed the filing"),
        },
        resolution: { summary: "The fine was paid.", date: "2028-12", citations: cite(srcEthics, "Penalty paid in full.") },
      },
    ],
  },
});
rel({ type: "affiliation", person: jordan, organization: foodBank, role: "board_member", period: { start: "2020-01-01" }, citations: cite(srcNews, "Example sits on the food bank's board.") });

console.log(`wrote ${[...readDataDir(DIR).keys()].length} files to ${DIR}`);
