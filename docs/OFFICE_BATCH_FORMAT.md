# Office research batch format

ONE JSON file: an array with one object per office (a government position).

```json
[
  {
    "slug": "san-francisco-board-of-supervisors-member",
    "name": "Member, San Francisco Board of Supervisors",
    "level": "local",
    "jurisdiction": "City and County of San Francisco",
    "body": "San Francisco Board of Supervisors",
    "facts": {
      "seats":        { "value": 11, "as_of": "2026-11-03", "sources": [ ... ] },
      "constituents": { "value": 79000, "as_of": "2020", "basis": "2020 census population ÷ 11 districts", "sources": [ ... ] },
      "term_years":   { "value": 4, "sources": [ ... ] },
      "term_limit":   { "value": "Two successive four-year terms", "sources": [ ... ] },
      "powers":       { "value": "One or two neutral sentences: what the office or body can do.", "sources": [ ... ] },
      "budget":       { "value": 15900000000, "fiscal_year": "2025-26", "scope": "Annual budget the body adopts", "sources": [ ... ] },
      "salary":       { "value": 160000, "as_of": "2026", "sources": [ ... ] }
    },
    "notes": "Conflicts between sources, gaps, and anything about connections that did not fit a field."
  }
]
```

Field rules:
- `slug`: lowercase kebab-case from `name`, without commas. Example: `member-san-francisco-board-of-supervisors`, or a shorter stable form like `san-francisco-supervisor`. Keep it stable and descriptive.
- `level`: one of `local`, `county`, `state`, `federal`.
- `facts`: include only the facts you found. Omit unknown ones, and never guess.
  - Numbers are plain numbers: dollars as whole dollars, population as people.
  - `constituents`: the number of residents one office-holder represents (population per district, or the whole jurisdiction for statewide offices). Say how it was computed in `basis`.
  - `budget`: the budget the office or body adopts or administers, with `fiscal_year` and a `scope` phrase. For a single executive office (e.g. Controller), give the department's own budget and say so in `scope`. Don't credit a member with the whole government's budget unless the body adopts it.
- Each source: `{ "url": "...", "publisher": "...", "title": "...", "seen": "search summary" | "fetched page", "tier": "primary" | "secondary" }`.
  - **Primary:** official government sites (sfbos.org, sf.gov, senate.ca.gov, assembly.ca.gov, house.gov, census.gov, ca.gov, the state constitution, the City Charter, calhr.ca.gov for salaries).
  - **Secondary:** everything else, including graph.civlab.org.
- Neutral wording only. Describe scope; never rank importance ("powerful", "minor" and similar are not allowed).

## Connections, legal basis and links

`import:offices` reads only `facts`. Connections, the legal basis and links are added afterwards with `npm run -s put -- office --merge` (connections merge by `type`; register each source first with `put source`):

```json
{
  "id": "california-state-senator",
  "links": { "official_site": "https://www.senate.ca.gov/" },
  "legal_basis": { "url": "https://…/article-IV", "label": "California Constitution, Article IV", "citations": [ … ] },
  "connections": [
    { "type": "elected_by", "count": 40, "text": "Elected from 40 districts to 4-year terms", "citations": [ … ] },
    { "type": "confirms", "text": "Votes on confirmation of the Governor's appointments", "citations": [ … ] }
  ]
}
```

- `type`: one of `elected_by`, `elects`, `appoints`, `confirms`, `oversees`, `advised_by`; at most one entry per type.
- `text`: one neutral line, a verb plus counts. `count` (seats or positions), `bodies` (distinct bodies) and `targets` (names as the source gives them) are optional; leave out a count you could not establish.
- Citations follow the usual statuses: a verbatim `quote` from a page you opened, otherwise `unverified` with the method (e.g. "search summary"). A search tool's summary text is never a quote.
- Offices that CivLab maps (San Francisco and U.S. federal only): set `links.civlab` and run `npm run -s import:civlab` instead of writing connections by hand (see `CLAUDE.md`).
