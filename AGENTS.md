# Agent research protocol

This repository is built so an AI agent (or a person) can research California election candidates **deterministically**. Every file path, every id and every byte of JSON is a pure function of the facts recorded. The work queue is computed, not chosen. Two agents given the same task and finding the same sources produce the same files.

Read [docs/METHODOLOGY.md](docs/METHODOLOGY.md) once before you start. Read the [docs/RESEARCH_GUIDE.md](docs/RESEARCH_GUIDE.md) section for each task kind as you reach it.

## The loop

```bash
npm ci                                            # once
npm run -s next -- --json --limit 1               # 1. take the first open task
# 2. read the guide section in the task's "guide" field
# 3. research it: open the sources yourself
npm run -s put -- source < source.json            # 4. register each source -> prints its src: ref
npm run -s put -- <kind> [--merge] < record.json  # 5. write the claim (put prints what it wrote)
npm run -s validate                               # 6. must report 0 errors
git add -A && git commit -m "research(<contest>): <task id>"   # 7. one task per commit
```

Then repeat. When `next` reports `0 open task(s)`, the contest is done. Run `npm run -s coverage -- <contest>` to check that all candidates were researched to the same depth.

- Filter the queue with `--contest 2026-ca-general/governor` or `--subject person:<slug>`.
- **Several agents at once:** give each agent one `--subject` (one candidate). Positions and person files are per actor, so agents never write to the same file. Shared files (sources, organizations) are content-addressed, so the same source always lands at the same path with the same bytes.
- `--all` also shows *blocked* tasks (for example, a stance on a ballot measure whose contest record does not exist yet). Do the `blocked_by` task first.

## Hard rules

1. **Nothing from memory.** Every value you write must come from a source you opened in this session. If you can't reach a source (blocked host, paywall, dead link), skip the task, say so in your report, and move on. Never fill the gap with what you believe is true.
2. **Quotes are verbatim.** `quote` is copied character-for-character from the source: no fixing typos, no ellipses joining distant passages. Tools that *summarize* a page (for example, a fetcher that answers a prompt about the page) are not verbatim: ask them for the exact passage and check it. If you can't be sure the text is verbatim, don't record it.
3. **Never infer a stance.** It doesn't matter what party, endorsers or donors a candidate has. Without explicit evidence the stance is `no_public_position` with a `search_log` of everywhere you looked.
4. **Never hand-write ids, paths or `$schema`.** `put` computes them. Use `npm run -s id -- slug "<name>"` or `npm run -s id -- source "<url>"` to look up a ref before you write a record that points to it.
5. **Don't change the agenda's questions or candidates mid-research.** They were fixed beforehand so every candidate is asked the same things. The only agenda edits allowed during research are `targets.finance_cutoff` (the finance-cutoff task) and `exhausted` entries (closing a count task that can't reach its target, with a search log).
6. **Money must come from filings.** Contributions, independent expenditures, lobbying and behested payments cite a `*_filing` source with a `locator` (schedule/line). News stories about money are leads, not citations.
7. **Archive what you cite** when you can: `https://web.archive.org/save/<url>`, then record the `https://web.archive.org/web/<14 digits>/...` snapshot as `archive_url`. If archiving is unavailable, leave it out. `validate` shows a warning, and `validate --strict` (the release gate) blocks until someone adds it.

## Writing records with `put`

`put` reads one JSON object on stdin (or `--file`). It fills `id`, `$schema`, `accessed` and `last_verified`, puts the JSON in canonical form, checks it against the schema, and only then writes. It prints `{action, file, ref, problems}` and exits 1 if it rejected the record (nothing is written).

| kind | id from | default mode | notes |
|---|---|---|---|
| `source` | canonical URL hash | reuse if it exists | a second agent citing the same page gets the same ref |
| `person`, `organization` | `slugify(name)` (or give `id`) | create | `--merge` deep-merges, e.g. to add one `candidate_profile` field |
| `relationship` | type + identifying fields | create | ids like `contribution--org.x--org.y--2026--general--monetary` |
| `position` | the actor | append | `{"actor": ..., "position": {...}}`; a new `as_of` adds history; the same `as_of` needs `--replace` |
| `contest`, `election`, `issue`, `agenda` | the `id` / `contest` you give | create | `--merge` merges `candidates` by person, `questions` by id, and `exhausted` by task |

### Examples (fictional)

```bash
echo '{"url":"https://example.org/about","kind":"candidate_website","title":"About","publisher":"Example campaign","published":"2026-02-01"}' \
  | npm run -s put -- source
# -> {"action":"created","file":"sources/example-org-1a2b3c4d5e.json","ref":"src:example-org-1a2b3c4d5e"}

echo '{"id":"avery-sample","candidate_profile":{"occupation":{"value":"Widget engineer","citations":[{"source":"src:example-org-1a2b3c4d5e","quote":"Avery has worked as a widget engineer for 20 years."}]}}}' \
  | npm run -s put -- person --merge

echo '{"actor":"person:avery-sample","position":{"subject":"q:housing/transit-oriented-upzoning","stance":"no_public_position","cycle":2026,"as_of":"2026-11-02","search_log":[{"where":"campaign site issues page","query":"housing transit zoning","date":"2026-11-02"}]}}' \
  | npm run -s put -- position
```

The test fixture in [tests/fixtures/valid/data](tests/fixtures/valid/data) is a complete, entirely fictional dataset with one example of every record type. It was generated through `put` by [tests/fixtures/make-valid-fixture.ts](tests/fixtures/make-valid-fixture.ts).

## Commands

| command | purpose |
|---|---|
| `npm run -s next -- [--json] [--contest C] [--subject S] [--limit N] [--all]` | the research queue |
| `npm run -s put -- <kind> [--merge\|--replace]` | write a record |
| `npm run -s id -- slug "<name>"` / `source "<url>"` / `relationship < rec.json` | compute ids without writing |
| `npm run -s validate -- [--json] [--strict]` | integrity + citation rules (`file#/pointer [RULE] message`) |
| `npm run -s fmt -- [--check]` | canonical formatting |
| `npm run -s coverage -- <contest>` | parity matrix across candidates |
| `npm run -s rollup -- person:<slug> contest:<id> [--through DATE]` | computed funding summary |
| `npm run check` | typecheck + fmt check + validate + tests (what CI runs) |
