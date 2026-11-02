# Methodology

This project records where candidates stand and who supports them with money and endorsements, so voters can compare candidates. It only works if readers can trust that it is **accurate, sourced and even-handed**. These rules are enforced by tooling wherever possible (rule codes in brackets are checked by `npm run validate`).

## 1. No claim without a citation

Every factual claim carries `citations` with at least one entry [SCHEMA]. A citation names a registered source and, for anything other than an official filing, a **verbatim quote** from it [QUOTE_REQUIRED]. Filings and videos also need a **locator** (schedule/line, timestamp) [LOCATOR_REQUIRED]. A source must exist on or before the date it is used to support [CITATION_AFTER_ASOF].

The only uncited records are **recorded research gaps** (`not_found`, `no_public_position`, `exhausted`). These are facts about our research, not about the candidate. They carry a `search_log` of where we looked and when.

Editorial choices (issues, questions, research agendas) are not claims and carry no citations. They are written down in the repository and visible in its history.

## 2. Same questions, same depth, for every candidate

- **Symmetric attributes:** every candidate has the same `candidate_profile` fields [CANDIDATE_PROFILE_REQUIRED]. A field that can't be found is recorded as `not_found`, never silently left out.
- **Questions fixed in advance:** each contest's agenda (`data/agenda/...`) fixes the questions and measures before stance research starts. If a candidate avoids an issue, the result is "no public position", not a dropped question. Questions considered and rejected are logged in the issue file with a reason.
- **Interleaved research:** the research queue (`npm run next`) asks the same item of every candidate back to back.
- **Parity check:** `npm run coverage -- <contest>` flags any row where one candidate has been researched and another has not. That includes money data pulled at different filing cutoffs, which the shared `finance_cutoff` is there to prevent.
- **Deterministic selection:** when only the "top N" of something is recorded (endorsements, contributors), the selection rule is written down in the research guide and applied the same way to everyone.

## 2a. The comparison structure

Each office contest is compared side by side in eleven categories. Every category is either recorded with citations or computed from cited records:

| # | Category | Stored as | Computed |
|---|---|---|---|
| 1 | Identity | name, party, `birth_date`, `birthplace` | age on election day |
| 2 | Occupation | `occupation`, `offices_held` | current office, years served |
| 3 | Qualifications | `education`, `career`, past `offices_held` | |
| 4 | Past policies | `legislative_action` + `bill` records | |
| 5 | Shared policies | | stances on the same side |
| 6 | Policy differences | | stances on different sides |
| 7 | Endorsements | `endorsement` | |
| 8 | Campaign financing | `contribution`, `independent_expenditure`, `committee_role` | funding rollup |
| 9 | Performance record | dossier `track_record`, bill outcomes | |
| 10 | Controversies and criticisms | dossier `controversies` (with response) | |
| 11 | Campaign promises | dossier `promises` | |

"Shared" and "differing" are computed only from explicit, cited stances (`support`, `oppose`, `mixed`) on the same pre-fixed question. If any candidate's stance is missing, the question is shown as "not yet comparable" rather than guessed.

## 3. Stances come only from explicit evidence

Each question defines what `support` and `oppose` mean. The stances are:

| stance | meaning | evidence |
|---|---|---|
| `support` / `oppose` | explicit statement, vote, authored bill, executive action or questionnaire answer that matches the definition | cited |
| `mixed` | evidence supports parts of both definitions, or conditional support | cited, explained in summary |
| `declined_to_answer` | the candidate was directly asked and did not answer | cited (the unanswered question) |
| `no_public_position` | nothing found after the full search order | search log |

We never infer a stance from party, endorsers, donors or demographics. Stances change: a new `as_of` entry records the change, and the earlier entry stays.

## 4. Neutral wording

- Questions are phrased so that support and oppose each have one meaning, without loaded terms.
- Summaries report what was said or done, in plain words, with no adjectives that characterize the candidate.
- Quotes are verbatim and never edited.
- **No editorial labels for donors.** We don't tag donors with industry or interest labels ("Big Oil", "special interests"). If sector labels are added later, they will come only from standard codes (NAICS) and the employer/occupation text exactly as filed.
- Organization names are recorded exactly as registered.

## 5. Money and influence: precise definitions

These are **different things** and are never blended:

| type | what it is | source |
|---|---|---|
| endorsement | a public statement of support (or, for a measure, support/opposition) | the endorser's announcement |
| contribution | money or in-kind support given to a committee | campaign finance filing |
| independent expenditure | outside spending for or against, not coordinated with the campaign | campaign finance filing |
| lobbying | payments to influence legislation or agency action, and what was lobbied on | lobbying filing |
| behested payment | a payment made to a third party at an official's request | FPPC Form 803 |
| affiliation | a person's role at an organization | official or organizational records |

- Money records must cite an official filing [MONEY_NEEDS_FILING]. Superseded filings (later amended) are flagged [FILING_SUPERSEDED].
- Money is recorded as **aggregates** per donor/recipient/election/form over a stated period, in integer cents. Raw transactions are never recorded.
- **No double counting.** Late reports (Form 497, 496) repeat money that later appears on the periodic statements (460, 465, 461). Transfers between committees and refunds are excluded from totals. Gifts through conduits (ActBlue, WinRed) are attributed to the original donor.
- A candidate's funding for a contest counts only committees tied to **that contest** (`ca_controlled`, `principal_campaign`, `authorized`). Officeholder accounts, leadership PACs and committees for other races are shown but not counted. Totals are always **computed** (`npm run rollup`), never typed in.
- **Lobbying honesty:** lobbying disclosures name bills and agencies, not individual officials. "Who lobbies candidate X" is shown as two linked facts: the organization lobbied on bill B, and the candidate voted on or wrote bill B. A direct link to an official is recorded only when a filing names them.
- **Disclosure is not wrongdoing.** Recording a contribution or lobbying relationship says only that the filing reports it. It implies nothing about motive or quid pro quo.

## 5a. Controversies and criticisms

This is where a research project can do the most harm, so the bar is highest:

- Only documented matters: two independent publishers or an official record [CONTROVERSY_SOURCING].
- A neutral title, and a summary that attributes every claim to its source. Allegations are never stated as fact.
- The candidate's response is always shown: cited, or "none found" with a search log.
- The resolution is recorded when there is one.
- Every candidate gets the same search (the same outlets, official databases and date range), and "none found" is recorded with a search log like any other gap.

## 5b. Leads are not claims

Notes people give the project (a comparison table, a tip) are stored as **leads** (`data/leads/`), word for word, labeled unverified. `npm run next` attaches each lead to the research task it bears on, and the site shows leads in dashed boxes marked "Unverified lead". A lead becomes part of the dataset only when a researcher confirms it in a primary source and records it with citations. Leads are never cited.

## 6. Privacy

Private individuals are listed as donors only when their total to one recipient is at or above the threshold in `data/config.json` (default $10,000) [PRIVACY_THRESHOLD]. Candidates, officeholders and other public figures (`public_figure: true`) are exempt. We never record street addresses, only cities, and only for candidates.

## 7. Durable sources

Each source records when it was accessed and, for web pages, a Wayback Machine snapshot pinned to a 14-digit timestamp [ARCHIVE_REQUIRED, enforced in `--strict` release checks]. Then a quote can always be checked against the exact text we saw, even after the page changes or disappears. This matters now in particular: California's CAL-ACCESS system is being replaced by CARS in mid-November 2026, and its old pages will go offline.

## 8. Corrections

Anyone can report an error with the **Correction** issue template. Corrections are made as new commits, so the history of every change stays visible. If a stance or fact was wrong, the record is fixed and the commit message explains why. If a position *changed*, a new dated entry is added instead.
