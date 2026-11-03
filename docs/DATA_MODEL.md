# Data model

All data is JSON under `data/`, validated against the JSON Schemas (draft 2020-12) in `schemas/`. A record's location, id and exact bytes are determined by its content:

- **Path:** fixed by kind and id (table below). Files anywhere else fail [UNKNOWN_PATH].
- **Id:** derived from content. Slugs come from names, source ids from the canonical URL, and relationship ids from their identifying fields [ID_FILENAME, ID_DETERMINISTIC].
- **Bytes:** canonical JSON. `$schema` points at the schema; keys are ordered (`$schema`, `id`, `type`, `kind`, … then alphabetical, then `citations`, `search_log`, `last_verified`, `notes`); positions are sorted by subject then date; 2-space indent with a trailing newline [FORMAT]. `npm run fmt` fixes formatting. `npm run put` writes canonical files to begin with.

## Layout

| path | kind | id / key | schema |
|---|---|---|---|
| `config.json` | config | — | [config](../schemas/config.schema.json) |
| `elections/<id>.json` | election | `2026-ca-general` | [election](../schemas/election.schema.json) |
| `contests/<election>/<contest>.json` | contest | `2026-ca-general/governor` | [contest](../schemas/contest.schema.json) |
| `agenda/<election>/<contest>.json` | research agenda | `contest` ref | [agenda](../schemas/agenda.schema.json) |
| `issues/<id>.json` | issue + questions | `housing` | [issue](../schemas/issue.schema.json) |
| `people/<slug>.json` | person | `xavier-becerra` | [person](../schemas/person.schema.json) |
| `organizations/<slug>.json` | organization | `seiu-california` | [organization](../schemas/organization.schema.json) |
| `positions/people/<slug>.json`, `positions/organizations/<slug>.json` | positions of one actor | `actor` ref | [positions](../schemas/positions.schema.json) |
| `dossiers/people/<slug>.json` | track record, promises, controversies | `actor` ref | [dossier](../schemas/dossier.schema.json) |
| `bills/<bill-ref>.json` | bill title and outcome | `ca-2025-sb-53` | [bill](../schemas/bill.schema.json) |
| `leads/<election>/<contest>.json` | unverified hints (never cited) | `contest` ref | [leads](../schemas/leads.schema.json) |
| `relationships/<type>/<id>.json` | relationship | deterministic | [relationship](../schemas/relationship.schema.json) |
| `sources/<id>.json` | source | `<host>-<sha256 10>` | [source](../schemas/source.schema.json) |

## References

Records point at each other with typed, prefixed strings. This lets the schema check what kind of record each field must point to, and lets `validate` check that it exists [REF_UNRESOLVED] and is the right sub-kind [REF_KIND]: only committees receive contributions, only conduit orgs can be conduits, and so on.

| prefix | example |
|---|---|
| `person:` | `person:xavier-becerra` |
| `org:` | `org:example-teachers-union` |
| `election:` | `election:2026-ca-general` |
| `contest:` | `contest:2026-ca-general/prop-3` |
| `q:` (issue question) | `q:housing/transit-oriented-upzoning` |
| `src:` | `src:sos-ca-gov-1a2b3c4d5e` |
| bill (no prefix) | `ca-2025-sb-79`, `us-119-hr-1` |

Inside relationship ids, refs are written with `.` instead of `:` and `/` (`contest.2026-ca-general.prop-3`) so ids are valid file names.

## Shared building blocks (`defs.schema.json`)

- **Citation** `{source, quote?, locator?}`. A quote is required for non-filing sources; a locator is required for filings and videos.
- **CitedString / CitedDate** `{value, citations[≥1]}`.
- **NotFound** `{status: "not_found", as_of, search_log[≥1]}`: a recorded research gap.
- **Money** `{amount_cents (integer), period {start, end}, basis}`: always an aggregate.
- **ExternalId** `{system, id}`: systems such as `cal_access_filer`, `cars_filer`, `fec_committee`, `lda_client`, `wikidata`.

## Entities

**Election:** an election day: name, date, type, jurisdiction, cycle (cited). Contests point to their election, not the other way round.

**Contest:** verified facts about one item on the ballot. Two kinds:
- `office`: the office, level, district, and `candidates` as printed on the certified list (person, party, ballot designation, incumbent, cited).
- `measure`: number, official title, origin, summary (cited).

Both can later get a certified `result`. Committees supporting or opposing a measure are **not** listed in the contest; they come from `committee_role` relationships, so that fact is stored in one place only.

**Research agenda:** the editorial work list for a contest. It holds the candidates to research, the questions and measures to ask every candidate about, targets (endorsements per candidate, top contributors, one shared `finance_cutoff`), and `exhausted` entries that close count tasks. Its references may point at records research has not created yet. `npm run next` compares the agenda with the verified data to compute the work queue.

**Issue:** an issue area with neutrally worded `questions`, each defining what `support_means` and `oppose_means`. Rejected questions are kept with a reason. A question may list `facets` (`{id, label}`): named elements an answer can include, used by position `points`.

**Person:** name, aliases, external ids, links, `public_figure`, and, for candidates, the symmetric `candidate_profile`: `party_registration`, `birth_date` (partial dates allowed), `birthplace`, `occupation`, `residence_city` (each cited or NotFound), and `offices_held`, `education` and `career` (each `{as_of, items[], search_log?}`; an empty list requires a search log).

**Bill:** official title, optional summary, and `status` (introduced … enacted, vetoed, failed) with its as-of date, cited to the legislative record.

**Dossier:** per candidate, three sections, each `{as_of, items[], search_log?}`: `track_record` (documented outcomes), `promises` (specific proposals) and `controversies` (each with citations, the candidate's `response` (cited, or NotFound), and an optional `resolution`).

**Leads:** unverified notes for a contest, kept word for word with the topic they bear on (a profile field, a question, a dossier section, or a task kind). Never cited and never shown as findings.

**Organization:** name as registered, `org_type` (union, corporation, nonprofit, party, candidate/ballot-measure committee, PAC, IE committee, conduit, lobbying firm, government body, tribe, other), external ids and links. No editorial sector labels.

**Positions:** one file per actor, listing stances on question or measure subjects. Each entry has `stance`, `summary`, `evidence_type`, optional `bill`, `cycle`, `as_of`, and `citations`, or a `search_log` for `no_public_position`. Optional `points` (`{facet, text, citations}`) record the specifics of a stance; `facet` must be one of the question's facets, so candidates' specifics line up (shared vs. only one). Entries are keyed by (subject, as_of), so changes over time are kept as history.

**Relationships:** cited, typed edges, each with `cycle` and `last_verified`:

| type | fields | id |
|---|---|---|
| `endorsement` | endorser → endorsee (person or measure; `side` for measures), date, `rescinded?` | `endorsement--<endorser>--<endorsee>--<cycle>` |
| `committee_role` | committee → subject (person or measure), role, `contest` (required for counted roles), period | `committee_role--<committee>--<subject>--<role>--<cycle>` |
| `contribution` | donor → recipient committee, money, election_designation, form, `conduit?` | `contribution--<donor>--<recipient>--<cycle>--<designation>--<form>` |
| `independent_expenditure` | spender committee → target (person or measure), side, money, designation | `independent_expenditure--<spender>--<target>--<side>--<cycle>--<designation>` |
| `lobbying` | client, `firm?`, jurisdiction, targets {bills, agencies, officials?}, money | `lobbying--<client>--<firm or in-house>--<jurisdiction>--<start>--<end>` |
| `behested_payment` | official, payor, payee, amount_cents, date | `behested_payment--<official>--<payor>--<payee>--<date>` |
| `affiliation` | person, organization, role, title, period | `affiliation--<person>--<organization>--<role>` |
| `legislative_action` | person, bill, action (authored, co-authored, voted yes/no, abstained, publicly supported/opposed), date | `legislative_action--<person>--<bill>--<action>--<date>` |

**Source:** id (from the canonical URL), kind, title, publisher, url, `archive_url` (Wayback snapshot), published, accessed, and, for filings, `filing {system, filer_id, filing_id, form, period, amends, superseded}`.

## SQLite export

`npm run db` rebuilds `dist/research.sqlite` from the JSON files. It has one table per record type, a `citations` table that keeps every citation with the record and JSON pointer it came from, and views per candidate: `v_candidates`, `v_candidate_stances`, `v_policy_comparison` (shared, differ, incomplete), `v_candidate_legislation`, `v_candidate_endorsements`, `v_candidate_top_donors`, `v_endorser_money`, `v_citations`. The database is generated and never edited; the JSON stays the source of truth.

## Computed views (never stored)

- **Funding rollup** (`npm run rollup`): totals for the committees counted toward a contest, excluding transfers and refunds, with conduit gifts credited to the original donor and IEs kept separate by side.
- **Research queue** (`npm run next`) and **parity matrix** (`npm run coverage`).

A complete fictional example of every record type is in [tests/fixtures/valid/data](../tests/fixtures/valid/data).
