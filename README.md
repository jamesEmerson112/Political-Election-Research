# Political Election Research

An open, **cited**, machine-checkable dataset on California elections. For each contest it records:

- where each candidate stands on specific issues (and ballot measures);
- who endorses them;
- who funds them **and their endorsers**: contributions, independent expenditures, lobbying and behested payments, each traced to official filings.

**The promise: every claim has a citation.** A citation names a registered source, quotes it verbatim (or gives the schedule/line of a filing), and points to an archived snapshot. Research gaps are recorded explicitly with a log of where we looked. Nothing is inferred and nothing comes from memory.

The first target is the **California general election of November 3, 2026**: Governor, the other statewide offices, the 52 US House seats, and the statewide propositions. The data is tagged by election cycle so it remains a lasting archive and can be reused for later elections.

## Built for agentic research

The system is **deterministic** so that AI agents (and people) can research candidates in parallel and produce reviewable results:

- **Fixed paths, ids and bytes.** File locations and ids are computed from content, and JSON is written in canonical form. The same facts always produce the same files.
- **A computed work queue.** Each contest has a research agenda fixed in advance (candidates, questions, measures, targets). `npm run next` compares it with the verified data and returns tasks in a fixed order, interleaved across candidates.
- **One write path.** `npm run put` computes ids and paths, fills defaults, checks the schema, and only then writes.
- **Strict checks.** `npm run validate` checks schemas, references, citations, money sourcing, dates and privacy. Every check has a rule code and a test.

See **[AGENTS.md](AGENTS.md)** for the research loop.

## The site

`npm run web` starts the Svelte site, which reloads live as data changes. `npm run web:build` writes a single self-contained page to `dist/web/index.html`. Each contest is a side-by-side comparison in eleven categories (identity, occupation, qualifications, past policies, shared policies, policy differences, endorsements, campaign financing, performance record, controversies, promises). Every entry opens to its sources. A toggle switches between the real draft data and a fictional demo of a fully researched contest.

## SQLite

`npm run db` builds `dist/research.sqlite`, a queryable copy with per-candidate views (see [DATA_MODEL.md](docs/DATA_MODEL.md#sqlite-export)). The JSON files stay the source of truth.

## Quickstart

```bash
npm ci
npm run -s validate                                     # integrity + citation rules
npm run -s next -- --contest 2026-ca-general/governor   # what to research next
npm run -s coverage -- 2026-ca-general/governor         # parity across candidates
npm run check                                           # everything CI runs
```

Requires Node 22.12 or newer.

## Status

| | |
|---|---|
| Format, validator, tooling, tests | done |
| Governor (Becerra vs Hilton): agenda and 6 neutral issue questions | done |
| U.S. House CA-11 (Chan vs Wiener): agenda, AI/tech/visa/health questions, and the maintainer's comparison table as unverified leads | done |
| Governor and CA-11: cited research | **not started**. The primary sources (sos.ca.gov, CAL-ACCESS) and archive.org were not reachable from the environment the scaffold was built in. Run the agent loop where they are. |
| Other statewide offices, 14 propositions, other House races | agendas to be added |
| Importers (CARS, OpenFEC, Senate LDA, FPPC 803) | planned |
| Svelte site (side-by-side comparison, influence map, research queue) and SQLite export | done |

## Repository map

| path | contents |
|---|---|
| `data/` | the dataset ([layout](docs/DATA_MODEL.md)) |
| `schemas/` | JSON Schemas (draft 2020-12) |
| `src/` | library: ids, canonical form, validation rules, research queue, rollups, `put` |
| `cli/` | `validate`, `fmt`, `put`, `id`, `next`, `coverage`, `rollup`, `db` |
| `web/` | Svelte 5 site (reads the dataset through the same library at build time) |
| `tests/` | vitest suite and fixtures: a complete fictional dataset plus one failing case per rule |
| `docs/METHODOLOGY.md` | sourcing, neutrality, money and privacy rules |
| `docs/RESEARCH_GUIDE.md` | where to look and what to record, per task |
| `docs/DATA_MODEL.md` | every record type, its path, and its id |

## Contributing and corrections

See [CONTRIBUTING.md](CONTRIBUTING.md). Found an error? Open a **Correction** issue with the source that shows the right information.

## License

MIT. See [LICENSE](LICENSE).
