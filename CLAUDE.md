@AGENTS.md

## Format: frozen (format-v1, 2026-11-04)

The maintainer approved the beta prototype and froze its format. The git tag `format-v1` marks the frozen point. From now on the work is **research only**, in the sections the maintainer names.

- **Frozen:**
  - the record format: `schemas/`;
  - the tooling: `src/`, `cli/`, `tools/`;
  - the site: `web/`;
  - the boundary data: `geo/`.
- **Changing them** needs the maintainer's explicit OK in the conversation. A bug fix is allowed when the maintainer reports it or a check fails; ship it with a test or browser check.
- **Research** writes only `data/`, through `put`, following the guide and the rules below. When a fact doesn't fit a schema, don't force it in and don't change the schema: add it to TODO.md under "Format requests (after v1)", with the contest and the source.
- **Before pushing research:** `git diff format-v1 -- schemas src cli tools web geo` shows only changes the maintainer approved.
- The next format version gets a new tag (`format-v2`).

## Commits: the maintainer is the author

Cloud sessions start with git's identity set to Claude. Before the first commit in a session, set this repository's identity to the maintainer's GitHub identity (the one the initial commit uses; GitHub's no-reply address, so no personal email goes into the public history):

```bash
git config user.name "jamesEmerson112"
git config user.email "36806380+jamesEmerson112@users.noreply.github.com"
```

Keep the `Co-Authored-By:` trailer at the end of every commit message, so Claude stays credited as co-author.

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
| `connections` | how the office connects to others, at most one entry per `type`: `elected_by`, `elects`, `appoints`, `confirms`, `oversees`, `advised_by`. Each has a neutral one-line `text` (a verb and counts, e.g. "Appoints 403 seats on 74 boards, commissions and other posts"), optional `count` / `bodies` / `targets`, and `citations`. `put office --merge` merges them by `type`. |
| `legal_basis` | where the office is established (`url`, optional `label`, `citations`): constitution article, charter section, statute |
| `links.official_site`, `links.civlab` | the body's official site, and its node page on the CivLab government graph when CivLab maps it |

Rules:
- **No ranking words:** "powerful", "minor", "junior", "senior", "important" and similar are not allowed. Show the numbers side by side and let readers judge.
- **Link** each candidate's `offices_held` item to its office with `office_ref: "office:<id>"`, and each contest's agenda to the office it elects. The site shows the scope next to the title (e.g. "Local · 1 of 11 seats · ~79k residents").
- **Sources:** primary sources first (state constitution, city charter, official legislature and city sites, census.gov, budget documents, CalHR / compensation commissions). Secondary sources are leads to primary ones, not substitutes: https://graph.civlab.org/ (Michael Adams), Ballotpedia and Wikipedia are `reference_work` sources.
- **Research batches** come in through `npm run import:offices` (format: `docs/OFFICE_BATCH_FORMAT.md`). Facts seen only in search summaries get citations marked `unverified`. `validate` warns about them (UNVERIFIED_CITATION) and `validate --strict` blocks a release until someone verifies them.
- **CivLab** (graph.civlab.org) maps only two governments: San Francisco (`/sf`) and the U.S. federal government (`/us`). It has no California state graph. For an office with `links.civlab`, `npm run -s import:civlab -- [sf=<graph.json> us=<graph.json>] [--save <dir>] [--dry-run]` computes `connections`, and fills `legal_basis`, `links.official_site`, `term_years` and `powers` only where they are missing. It never overwrites a value or a connection from other research; it prints mismatches and the SF citywide budget for a human to decide. CivLab is a `reference_work`: its counts are cited `unverified` (method "computed from CivLab graph data", with a locator) until someone checks them against the charter or constitution it links, and phrases from its descriptions are verbatim `quote`s. No license was found, so never commit its raw graph JSON (keep `--save` output outside the repo).

## Citation statuses (strongest first)

1. `quote`: a verbatim excerpt from a source the recorder opened.
2. `verified_by`: a maintainer reviewed the source; the quote is pending (QUOTE_PENDING warning).
3. `unverified`: seen only indirectly, e.g. as a web search summary (UNVERIFIED_CITATION warning).

Free-text notes someone supplies without sources are **leads** (`data/leads/`), never citations.

## Naming

- Write **"President Donald Trump"**, never bare "Donald Trump", in any text this project authors: record names, summaries, titles, notes, the site. Verbatim `quote`s and the official voter guide's printed arguments keep the source's wording.
