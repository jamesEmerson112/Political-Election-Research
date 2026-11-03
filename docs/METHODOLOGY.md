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

## 5c. Ballot measures and budgets

Every measure sounds good on its own; voters rarely see the costs and revenues of all of them added up against a budget that may already be forecast to fall short. The site shows that sum, without grading any measure.

- **Official estimates only, as given.** A measure's fiscal effects come from its official fiscal statement (in San Francisco, the City Controller's statement in the Voter Information Pamphlet; for state measures, the Legislative Analyst). Ranges stay ranges. An effect the statement doesn't estimate is recorded as `not_estimated` or `depends_on_future_decisions`, and the site shows it with the same weight as a number. News stories and campaign claims about cost are leads, never fiscal effects (rule FISCAL_SOURCE).
- **Lanes, never one blended number.** `general_fund` (the city's discretionary budget, the headline), `set_aside` (required minimum spending that doesn't change the General Fund total), `dedicated` (special taxes and funds), `bond_debt` (borrowing repaid by property owners) and `other_agency`. The lane follows what the statement says happens to the General Fund.
- **The baseline is the official forecast** (`data/budgets/<id>.json`): the adopted budget, and the projected shortfall or surplus per fiscal year from the official multi-year forecast, quoted. The forecast doesn't include ballot measures. The city must adopt a balanced budget each year, so a projected shortfall is the gap the Mayor and Board must close with cuts, new revenue or reserves; the site says so next to every total.
- **Adding up (the trial ballot):** a yes applies a measure's effects; no and skip mean the status quo. Annual effects apply from their stated start year (if none is stated, from the first forecast year, flagged). One-time effects and multi-year totals are listed, never added to annual sums. When a visitor says yes to competing measures (only one can take effect), the total uses the range spanning them. Measures are listed in ballot order, never by size.
- **How big, not just how many dollars.** Every amount is also shown as a share, computed here and labeled as such: a General Fund amount as a share of the adopted General Fund, other funds and bonds as a share of the whole adopted budget (all funds), and each trial-ballot step as a share of the forecast gap. Dollars stay next to the share.
- **No grading.** No "affordable", no good/bad colors, no arrows for budget change (▲/▼ only mean the visitor's yes/no). Costs and revenues share one hue; direction is shown by position and words. Answers stay in the visitor's browser; there is no tally.
- **What the voter guide says, as printed.** Each measure carries the official digest ("Digest by the Ballot Simplification Council" in San Francisco: the way it is now, the proposal, what a YES and a NO vote mean) and every argument printed with it (the proponent's and opponent's arguments, both rebuttals, and each paid argument with its printed funding disclosure), word for word. Arguments are their authors' opinions; the site shows both sides with the same weight, side by side, and never checks or ranks them.
- **Who it affects (`affects`).** Like a strategy game's voter groups, but descriptive: the groups the official digest and Controller's statement name, from one fixed list for every measure (tenants, property owners, property buyers and sellers, businesses, workers and unions, City employees, City departments and officials, board and commission members, voters and petition signers, Muni riders, drivers, park visitors, people experiencing homelessness, lower-income households, families and students, seniors and retirees, City contractors and vendors, other). Each entry says what the text states the group **pays**, **receives**, or has **change in its rules** (or other), quoted, with the amount when the text gives one for that group, and "may" when the text says could, may or if. It never says who benefits or is harmed (rule AFFECT_WORDING), and only official texts count (AFFECT_SOURCE); arguments, news and campaign claims don't. Next to it, the site counts the people and organizations that signed the printed arguments on each side, names as printed.

## 6. Privacy

Private individuals are listed as donors only when their total to one recipient is at or above the threshold in `data/config.json` (default $10,000) [PRIVACY_THRESHOLD]. Candidates, officeholders and other public figures (`public_figure: true`) are exempt. We never record street addresses, only cities, and only for candidates.

## 7. Durable sources

Each source records when it was accessed and, for web pages, a Wayback Machine snapshot pinned to a 14-digit timestamp [ARCHIVE_REQUIRED, enforced in `--strict` release checks]. Then a quote can always be checked against the exact text we saw, even after the page changes or disappears. This matters now in particular: California's CAL-ACCESS system is being replaced by CARS in mid-November 2026, and its old pages will go offline.

## 8. Corrections

Anyone can report an error with the **Correction** issue template. Corrections are made as new commits, so the history of every change stays visible. If a stance or fact was wrong, the record is fixed and the commit message explains why. If a position *changed*, a new dated entry is added instead.
