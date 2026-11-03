@AGENTS.md

## Offices: describe scope, never rank

The maintainer wants readers to understand the "weight" of a government position: what a San Francisco Supervisor does compared with a State Senator or a U.S. Representative. This project expresses weight only as **neutral, measurable scope**, recorded in `data/offices/<id>.json` (schema `schemas/office.schema.json`):

| field | meaning |
|---|---|
| `level` | local, county, state, federal |
| `body`, `seats` | the body the office-holder sits on and how many seats it has (1 for a single executive office) |
| `constituents` | residents one office-holder represents; `basis` says how it was computed (e.g. "2020 census ÷ 11 districts") |
| `budget` | the budget the body adopts or the department administers, in USD; `basis` names the fiscal year and scope. Never credit a member with a whole government's budget unless their body adopts it. |
| `term_years`, `term_limit` | term length and limits |
| `powers` | one or two neutral sentences on what the office can do |
| `salary` | annual salary in USD |

Rules:
- **No ranking words:** "powerful", "minor", "junior", "senior", "important" and similar are not allowed. Show the numbers side by side and let readers judge.
- **Link** each candidate's `offices_held` item to its office with `office_ref: "office:<id>"`, and each contest's agenda to the office it elects. The site shows the scope next to the title (e.g. "Local · 1 of 11 seats · ~79k residents").
- **Sources:** primary sources first (state constitution, city charter, official legislature and city sites, census.gov, budget documents, CalHR / compensation commissions). Secondary sources are leads to primary ones, not substitutes: https://graph.civlab.org/ (Michael Adams), Ballotpedia and Wikipedia are `reference_work` sources.
- **Research batches** come in through `npm run import:offices` (format: `docs/OFFICE_BATCH_FORMAT.md`). Facts seen only in search summaries get citations marked `unverified`. `validate` warns about them (UNVERIFIED_CITATION) and `validate --strict` blocks a release until someone verifies them.

## Citation statuses (strongest first)

1. `quote`: a verbatim excerpt from a source the recorder opened.
2. `verified_by`: a maintainer reviewed the source; the quote is pending (QUOTE_PENDING warning).
3. `unverified`: seen only indirectly, e.g. as a web search summary (UNVERIFIED_CITATION warning).

Free-text notes someone supplies without sources are **leads** (`data/leads/`), never citations.
