# Research batch format (agent web research → agendas + leads)

Agents doing broad web research write ONE JSON file (UTF-8, valid JSON). `npm run -s import:research -- <file>` turns it into research agendas and unverified leads; person refs are recomputed from names with the project slug rule. It is an array with one object per contest:

```json
[
  {
    "contest": "contest:2026-ca-general/us-house-ca-12",
    "office": "U.S. House of Representatives",
    "district": 12,
    "candidate_list_sources": [
      { "url": "https://...", "publisher": "...", "seen": "search summary", "tier": "primary" }
    ],
    "candidates": [
      {
        "name": "Full Name as printed on the ballot",
        "slug": "full-name-as-printed-on-the-ballot",
        "party": "Democratic",
        "ballot_designation": "Member of Congress",
        "incumbent": true,
        "facts": [
          {
            "topic": "profile.occupation",
            "label": "Occupation",
            "text": "Plain factual sentence, titles and dates only.",
            "sources": [
              { "url": "https://...", "publisher": "...", "seen": "search summary", "tier": "primary" }
            ]
          }
        ]
      }
    ],
    "notes": "Conflicts between sources, gaps, anything uncertain."
  }
]
```

Rules for the fields:
- `contest` slugs:
  - statewide: `lieutenant-governor`, `attorney-general`, `secretary-of-state`, `controller`, `treasurer`, `insurance-commissioner`, `superintendent-of-public-instruction`
  - Board of Equalization: `board-of-equalization-1` … `-4`
  - House: `us-house-ca-<n>`
- `district`: an integer, or null for statewide offices.
- `slug`: lowercase; strip accents (é→e); "&" → "and"; drop apostrophes; every other run of non-alphanumerics → a single "-"; trim "-". Example: "José Núñez-O'Brien" → "jose-nunez-obrien".
- `party`: as printed on the ballot ("Democratic", "Republican", "No Party Preference", etc.). Use null if not found.
- `ballot_designation`: as printed on the SoS certified list, if a source reproduces it. Use null if not found. Never guess.
- `incumbent`: true only if a source says they currently hold this exact seat. Use null if unknown.
- `facts[].topic`, one of:
  - `profile.party_registration`
  - `profile.birth_date`
  - `profile.birthplace`
  - `profile.occupation`
  - `profile.offices_held` (current and previous offices, with dates)
  - `profile.education`
  - `profile.career`
  - `other`
- `facts[].hint` (optional): `"support" | "oppose" | "mixed"`, only for question (`q:...`) or measure (`contest:...`) topics and only when the source states the stance explicitly.
- `facts[].topic` may also be `dossier.track_record`, `dossier.promises`, `dossier.controversies`, `legislation`, `endorsements`, `committee`, `contributions`, `independent_expenditures`, an agenda question ref `q:<issue>/<question>`, or a measure ref `contest:<election>/<measure>`.
- `seen`: `"search summary"` (WebSearch snippet) or `"fetched page"` (only if WebFetch actually opened the page).
- `tier`: `"primary"` (SoS, county elections, government bios, congress.gov, the candidate's own site, official ballot pamphlets) or `"secondary"` (news, Ballotpedia, Wikipedia).
- Search summaries are paraphrases. Never put quotation marks around text unless you read it verbatim on a fetched page.
- Neutral wording: titles, dates, places, degrees. No adjectives about the candidate.
