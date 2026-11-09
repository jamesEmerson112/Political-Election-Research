# Research guide

One section per task kind that `npm run next` emits. Each task's `guide` field links to its section here. The general rules are in [METHODOLOGY.md](METHODOLOGY.md) and the agent loop is in [AGENTS.md](../AGENTS.md).

**Source preference, always:** official records and filings, then the candidate's own words (website, questionnaire, debate, press release), then reputable news reporting. Reference sites (Wikipedia, Ballotpedia) are **leads, not citations**. Follow them to the primary source and cite that.

**Every source you cite:** register it with `npm run -s put -- source` (url, kind, title, publisher, published). Archive it if you can (`https://web.archive.org/save/<url>`, then record the `https://web.archive.org/web/<14 digits>/...` snapshot as `archive_url`).

> **System change, mid-November 2026:** California's CAL-ACCESS disclosure site is being replaced by **CARS** (Cal-Access Replacement System). Old filing pages will go offline, so archive them now. For filings retrieved from CARS, set `filing.system` to `"cars"` and use `ids` entries with `system: "cars_filer"`.

---

<a id="task-election"></a>
## Task: election

Create `elections/<id>.json` with the election's official name, date and type.

- **Where:** the California Secretary of State (SoS) elections pages / statewide election calendar (`sos.ca.gov`).
- **Cite:** the SoS page that states the date (`kind: government_record`), quoting the line with the date.
- **Id convention:** `<cycle>-<state>-<type>`, e.g. `2026-ca-general`.

<a id="task-contest"></a>
## Task: contest

Create `contests/<election>/<contest>.json`.

- **Office races:** use the SoS **Certified List of Candidates** for the election (a PDF under `elections.cdn.sos.ca.gov/statewide-elections/<cycle>-<type>/`). Add every agenda candidate who appears on it (see *candidacy*). Set `level`: governor and other statewide offices are `state`; US House is `federal` with `district`.
- **Ballot measures:** use the SoS qualified-measures list and the **Official Voter Information Guide** (`voterguide.sos.ca.gov`). Record `number`, `official_title` and `summary` (both cited, quoting the official text), and `origin` (legislative / initiative / referendum).
- Contest ids: `governor`, `lieutenant-governor`, `attorney-general`, `us-house-ca-<n>`, `prop-<n>`; local measures `<place>-prop-<letter>` (e.g. `sf-prop-a`).
- **Local measures** (see *measure fiscal* below): set `jurisdiction`, and record `measure_type`, `vote_threshold`, `placed_by` and the `digest` from the local voter pamphlet, each quoted.

<a id="task-measure-fiscal"></a>
### Measure fiscal statement and budget baseline

1. Open the official fiscal statement (SF: the Controller's statement printed with each measure in the Voter Information Pamphlet, `media.api.sf.gov`; Board-placed measures also have a Legistar file on `sfgov.legistar.com`). Register it as a source (`voter_guide` or `government_record`).
2. Write one `fiscal.effects` entry per effect the statement names, with a verbatim quote: `lane` (what happens to the General Fund decides it), `direction`, `amount` as given (a range stays a range; dollars, unsigned), `per`, `start_fy` / `years` only if stated, `estimate` (`estimated`, `in_words`, `minimal`, `not_estimated`, `depends_on_future_decisions`), and one neutral `text` line. When the statement sizes an effect only in words ("low tens of millions of dollars per year") or gives only an open bound ("less than $1 billion per year"), use `in_words` with those exact words in `words` (copied from the quote; rule FISCAL_WORDS) and no `amount`: never turn words into numbers. When the record has to read the statement in a way its words don't say outright (which lane an unnamed fund belongs to, which fiscal year a calendar year falls in), add a one-line `note` saying how; leave `start_fy` out rather than guess when even that reading isn't possible. When the statement gives amounts for particular years ("approximately $6 million in FY2028-29 and $13 million in FY2029-30 … approximately $60 million … in FY2034-35 and subsequent years"), record exactly those as `schedule` [{fy, amount}], starting at `start_fy`, with `amount` as the whole range, and quote the passage that prints them (rule FISCAL_SCHEDULE). Don't compute the years in between; the site shows the range between the listed years. Bonds also get `fiscal.bond` (principal, debt service, cost per $100k of assessed value).
3. Record competing measures in `conflicts` with the rule as printed.
4. The baseline (`npm run -s put -- budget`): the adopted budget (Budget and Appropriation Ordinance) and the latest official multi-year forecast (Controller / Mayor's Budget Office / Budget and Legislative Analyst Joint Report or Five-Year Financial Plan), quoting each fiscal year's projected shortfall or surplus.
5. `validate`: FISCAL_RANGE (low above high) is an error; FISCAL_SOURCE (no official source) is a warning, and an error under `--strict`.

<a id="task-measure-affects"></a>
### Measure: who it affects

Sources: only the measure's official digest and fiscal statement in the voter pamphlet (never the arguments, news or campaign material).

1. For each group the text names (or unmistakably describes, such as "Muni service" for Muni riders), add one `affects` entry with a `group` from the fixed list (`other` needs a `label`) and an `effect`: `pays` (a tax, fee, charge, pass-through or cost), `receives` (money, a service, housing, loans or assistance), `rules_change` (requirements, powers, rights, eligibility, procedures, access) or `other`.
2. Set `conditional: true` when the text says could, may, might, if, or would be allowed to.
3. Add a `figure` only when the quote states an amount, rate or count for that group, copied character for character (AFFECT_FIGURE checks it is in the quote).
4. Write one neutral `text` line in plain words. Never benefit, help, hurt, harm, burden, unfair, win or lose (AFFECT_WORDING).
5. Quote the sentence(s) verbatim with a page locator. One entry per group and effect (AFFECT_DUPLICATE). Don't record the City's own General Fund revenue or cost as a group; that is the fiscal statement's job.
6. Double-check: a second researcher derives the list independently from the same text; keep what both found and resolve the rest against the quote.

<a id="task-contest-result"></a>
### Contest results (after the election)

`put contest --merge` with a `result`. Not a queue task: results never change research coverage. Record them when the maintainer asks.

- **Sources:** only the election official's own results, registered as `government_record` (RESULT_SOURCE warns otherwise). California statewide, BOE, U.S. House and Legislature: the Secretary of State's results data (`api.sos.ca.gov/returns/<contest>`, `.../ballot-measures`). San Francisco: the Department of Elections (sfelections.org, unreachable from cloud sessions). Nevada: the Secretary of State (silverstateelection.nv.gov) or Clark County. News reports and race calls are leads.
- **California:** `node tools/research/ca-sos-results.mjs [--dry] [--commit --trailers <file>]` records every California office contest and proposition the Secretary of State reports, one commit per contest. It stops when a name or a proposition title doesn't match.
- **Semi-official count:** `certified: false` with `as_of` (the date of the count). Offices: `tallies` for every candidate and `winners`, the candidates leading the count, as many as the contest's seats (`vote_for`). Measures: `yes_votes`, `no_votes`, and no `passed` yet. Quote the reporting line (time and precincts) and each candidate's or measure's line. The site says "Leading" / "Yes ahead" until certified. RESULT_UNCERTIFIED stays a warning until then.
- **Certified count:** when the official canvass is certified, replace the result: `certified: true`, `certified_date`, the final tallies and winners, and for measures `passed`, quoting the certified Statement of Vote. `passed` must agree with the votes and the recorded `vote_threshold` (RESULT_PASSED_MISMATCH).
- **Nevada's "None of These Candidates"** (format-v3): ballots for Nevada's statewide offices print this line (NRS 293.269). Record its votes in `none_of_these_votes` and quote its line; never put it in `tallies` or `winners`. The site counts it in the total, so shares match the official ones, but only a named candidate can be elected. House, legislative, judicial and local races have no such line.
- **Results the maintainer saves:** Nevada's statewide count is on the Secretary of State's results site, which refuses automated requests. The maintainer can open it in a browser and pass on a copy (a downloaded file, a PDF, or screenshots that show every choice, the page's address and the "last updated" time). Register the page's address as the source, say so in its `notes` ("Supplied by the maintainer, saved from … in a browser on <date>; the site refuses automated requests"), and quote the lines exactly as shown.
- **Checks:** winners and tallies are the contest's candidates (RESULT_NOT_CANDIDATE); at most `vote_for` winners, and they are the top vote-getters (RESULT_WINNERS).
- **Ranked-choice contests** (SF Supervisors): record the final round of the official ranked-choice report, with a locator naming the round.
- Uncontested races are out of research scope: no result needed.

<a id="task-candidacy"></a>
## Task: candidacy

Add the candidate to the contest's `candidates` with `npm run -s put -- contest --merge` (the merge goes by `person`).

- `party` and `ballot_designation`: **exactly as printed** on the certified list, including capitalization. An empty designation is recorded as `""`. For a nonpartisan office whose list prints no party (San Francisco's local races, for example), leave `party` out; never write a party the list doesn't print.
- `incumbent`: true only if the certified list or an official roster shows they currently hold this office. Cite that source as well.
- The entry's single `citations` list must support every field in the entry.

<a id="task-person"></a>
## Task: person

Create `people/<slug>.json` with `name` as printed on the certified list. Set `public_figure: true` for candidates and officeholders. Add `ids` you can verify: `wikidata`, `cal_access_filer` / `cars_filer`, `fec_candidate`. Add `links` (campaign site, official site).

<a id="task-profile"></a>
## Task: profile

Fill one `candidate_profile` field with `npm run -s put -- person --merge`. Every candidate gets the same eight fields (comparison categories 1–3: identity, occupation, qualifications):

| field | best sources |
|---|---|
| `party_registration` | certified list (party preference) |
| `birth_date` | official biography, as precise as it states (`1970`, `1970-05` or `1970-05-01`). Age is computed, never stored. |
| `birthplace` | official biography: place of birth or origin as stated |
| `occupation` | the candidate's official/campaign bio. The ballot designation is the candidate's self-description: cite it as such. |
| `residence_city` | city only, never a street address: official bio, candidate filings |
| `offices_held` | official government bios and rosters (legislature, congress.gov Bioguide, agency pages): office, start, end |
| `education` | official bio; institution, degree, year when stated |
| `career` | official bio, professional profiles cited to the candidate's own pages: role, organization, start, end |

If you can't find it after checking the candidate's site, official bios and at least two news searches, record `{"status": "not_found", "as_of": ..., "search_log": [...]}`. For lists, use `{"as_of": ..., "items": [], "search_log": [...]}`.

<a id="task-position"></a>
## Task: position

Record one stance by one candidate on one agenda subject (an issue question `q:...` or a measure `contest:...`) with `npm run -s put -- position`.

1. Read the question's `text`, `support_means` and `oppose_means` in `data/issues/<issue>.json`. The stance must match those definitions, not your own reading of the question.
2. Search, in this order, and log each place you look:
   1. Voting record and authored bills, for current or former legislators (`leginfo.legislature.ca.gov`, `congress.gov`). Use `evidence_type: vote` / `authored_legislation` and the `bill` ref (`ca-<session start year>-sb-<n>`, `us-<congress>-hr-<n>`).
   2. The candidate's campaign site issues pages (`platform`).
   3. Candidate questionnaires: CalMatters voter guide, League of Women Voters / Vote411 (`questionnaire`).
   4. Debates (transcript or video with timestamp locator) (`debate`).
   5. Interviews and statements reported by reputable outlets (`interview` / `statement`).
3. Assign the stance:
   - `support` / `oppose`: the evidence matches `support_means` / `oppose_means`.
   - `mixed`: the evidence supports parts of both, or the candidate supports with conditions that the definitions don't cover. Explain in `summary`.
   - `declined_to_answer`: the candidate was directly asked (for example, a questionnaire left blank) and did not answer. Cite that.
   - `no_public_position`: nothing found after the full search order. Give a `search_log` and no citations.
4. `summary`: one or two plain sentences that report what was said or done. No characterizing adjectives.
5. `as_of`: the date of the newest evidence. If the candidate's stance changed, add a **new** entry with a later `as_of`. Never overwrite history.
6. `points` (optional, recommended when two candidates take the same side): the specifics of the answer, one per element, each with its own citation. For example, "Freedom to change employers" or "H-1B / O-1 processing reform". Each point's `facet` must be one of the question's `facets` (`{id, label}` in the issue file; validate rule `POINT_FACET`). Add a facet to the question when a candidate states an element that isn't listed yet; facets describe answers and never change the question. Use the same facet for the same element across candidates. The site then lists it once under "Both say" and shows the rest as "Only <candidate>".

<a id="task-legislation"></a>
## Task: legislation

Comparison category 4 (past policies). Record bills the candidate authored, co-authored, voted on, or publicly supported or opposed, as `legislative_action` relationships (`person`, `bill`, `action`, `date`).

- **Where:** `leginfo.legislature.ca.gov` (author, votes), `congress.gov` and the House clerk's roll calls, city/county legislative records for local officials.
- **Which bills (in order):** bills tied to the agenda's questions first, then bills the candidate authored that were enacted, then other bills named in the candidate's own materials. Apply the same order to every candidate.
- For each bill, create a **bill record** (`npm run -s put -- bill`) with the official title and its outcome (`status`: enacted, vetoed, failed, ...), cited to the legislature's bill history. Outcomes feed category 9 (performance record).
- Someone who has never held legislative office: close the task with an `exhausted` entry and a search log.

<a id="task-dossier"></a>
## Task: dossier

Comparison categories 9–11, one section at a time (`npm run -s put -- dossier --merge`; items merge by `id`, a slug of the title). Every candidate gets all three sections. A section with nothing found is `{"as_of": ..., "items": [], "search_log": [...]}`.

- **`track_record`** (category 9, performance record): documented *outcomes*, such as enacted legislation, programs implemented, or budgets delivered. Each item states what happened and when, cited to government records. No praise and no "successful": report the result and let the reader judge.
- **`promises`** (category 11): specific proposals for the office sought, from the candidate's platform, website or debate statements. Record the proposal as stated, with the issue id it falls under. General values ("I'll fight for families") are not promises.
  - **Topics (optional, per contest):** to show which proposals several candidates share, the contest agenda can list `promise_topics` (`{id, label}`), and each promise names one with `topic`. A topic says what a proposal is about ("Downtown campus", "Transit for students"), never its stance or quality. Give every promise in the contest exactly one topic, and use the same topic for the same subject across candidates. The site then shows one row per topic, the topics with more candidates first.
  - **Tracking (after the election, winners only):** see *Promise tracking* below.
- **`controversies`** (category 10). Strict rules, enforced by `validate`:
  - Only **documented** matters: at least **two independent publishers** or **one official record** (court filing, ethics or audit finding, agency decision) [CONTROVERSY_SOURCING].
  - The `title` is neutral and descriptive ("Fine for a late campaign statement", not "Filing scandal").
  - The `summary` attributes every claim ("the commission found", "the Times reported"). Allegations are never stated as fact.
  - The candidate's **response** is required: cite it, or record `not_found` with a search log of where you looked (campaign statements, the same outlets, social accounts).
  - Add the **resolution** when there is one (dismissed, settled, fine paid, charges dropped).
  - Apply the same search to every candidate: the same outlets, the same official databases, the same date range.

<a id="task-dossier-tracking"></a>
### Promise tracking (after the election)

What a contest's winner does on each recorded campaign promise, from official records. Only a recorded winner's promises are tracked (TRACKING_NOT_WINNER), and only after they take office. Not a queue task. `put dossier --merge` with the promise's `id` and a `tracking` object; `updates` merge by `id`, so one update can be added without resending the promise:

```json
{"actor": "person:<slug>", "promises": {"items": [{"id": "<promise id>", "tracking": {"as_of": "<date checked>", "updates": [{"id": "<slug>", "date": "<date of the action>", "status": "in_progress", "summary": "...", "citations": [...]}]}}]}}
```

- **Sources:** official records only: bill status and votes (legislature, board or council sites), adopted budgets, executive orders, agency announcements, meeting minutes. News stories are leads, never the citation.
- **Status** of each update, describing the record, never grading the official:
  - `in_progress`: an official step toward the promise is documented (introduced, heard, funding requested, staff directed).
  - `partly_done`: part of what the promise names was adopted or carried out; the summary says which part.
  - `done`: what the promise names was adopted or carried out.
  - `stalled`: a documented step failed or stopped (vote failed, vetoed, withdrawn, tabled).
  - `changed`: the office-holder revised or dropped it, in their own quoted words.
- **One update per official action**, dated with the action's date; the site shows the latest update's status. `summary` is neutral and attributed ("the Legislature's bill status shows it was signed"), at most 400 characters.
- **Nothing found:** `tracking` with `as_of` and a `search_log` of where you looked: the site says "No action found" as of that date. A promise with no `tracking` shows "Not checked yet".
- Check every winner's promises against the same sources, on the same dates.

<a id="task-endorsements"></a>
## Task: endorsements

Record endorsements as `endorsement` relationships until the agenda target is met.

- **Where:** the candidate's endorsements page gives you the list. Cite the **endorser's own announcement** (press release, website, social post) when one exists. Otherwise cite the candidate's page.
- **Which ones (deterministic order):** take categories in this order: (1) political parties, (2) statewide and federal elected officials, (3) statewide labor organizations, (4) statewide business and trade associations, (5) newspaper editorial boards, (6) other organizations. Within a category, take them alphabetically by name. Do the same for every candidate.
- Endorsers must exist as `person` or `organization` records. Create them first (organizations: `org_type`, name as registered).
- Measure endorsements need `side: support|oppose`.
- If no more endorsements exist, close the task by adding an `exhausted` entry (task id + search log) to the agenda with `npm run -s put -- agenda --merge`.

<a id="task-committee"></a>
## Task: committee

Link each candidate to the committee(s) raising money for **this contest** with a `committee_role` relationship (`role: ca_controlled` for state candidates; `principal_campaign` / `authorized` for federal ones; `contest` set).

- **State:** the candidate's page on CAL-ACCESS / CARS lists controlled committees. The committee's Statement of Organization (Form 410) names the candidate and office.
- **Federal:** FEC candidate page. The principal campaign committee is designated on Form 2, and authorized committees on Form 1.
- Also record other committees the candidate controls (officeholder accounts, leadership PACs, ballot measure committees) with their own roles. They show up in the data but are **excluded** from contest funding totals.
- Create the committee as an `organization` (`org_type: candidate_committee`, exact registered name, `ids` with the filer id).

<a id="task-measure-committees"></a>
## Task: measure committees

Link the committees primarily formed to support or oppose a measure (`committee_role`, `subject: contest:...`, `role: primarily_formed_support|primarily_formed_oppose`). **Where:** the CAL-ACCESS / CARS "Propositions & Ballot Measures" page for the measure, and each committee's Form 410.

<a id="task-finance-cutoff"></a>
## Task: finance cutoff

Choose **one** filing-period end date for the whole contest and set `targets.finance_cutoff` in the agenda (`npm run -s put -- agenda --merge`). Use the latest reporting period that **every** candidate's committee has already filed for (for example, the end of the second pre-election period). Then all money data is pulled through that same date, which keeps candidates comparable.

<a id="task-contributions"></a>
## Task: contributions

Record the top contributors (agenda target) to each counted committee, aggregated through the cutoff.

- **State:** Form 460 Schedule A (itemized monetary contributions) and Schedule C (in-kind), for the periods ending on or before the cutoff. Late contribution reports (Form 497) **repeat** money that later appears on the 460. Use them only for days the 460 does not cover yet, and never add both.
- **Federal:** FEC Schedule A (itemized receipts) through the cutoff.
- **One record per donor × recipient × election designation × form**, with `money.period.end` = the cutoff and `basis: aggregated_by_project` when you summed several filings. Cite every filing you summed, each with a schedule/line `locator`.
- **Ranking:** rank by aggregate amount, breaking ties alphabetically by donor name. Use the same ranking for every candidate.
- **Conduits (ActBlue, WinRed, ...):** the donor is the original contributor. Set `conduit` to the platform organization (`org_type: conduit`). Never record the platform as the donor.
- Transfers from other committees: `form: transfer` (excluded from totals). Loans: `form: loan`. Refunds: `form: refund`.
- **Private individuals** below the privacy threshold in `data/config.json` are not recorded. `validate` enforces this.
- If the committee has fewer itemized donors than the target, close the task with an `exhausted` entry.

<a id="task-independent-expenditures"></a>
## Task: independent expenditures

Record outside spending supporting or opposing the candidate (or measure) as `independent_expenditure` relationships, aggregated per spender × side through the cutoff.

- **State:** CAL-ACCESS / CARS independent expenditure search (Forms 496 and 465; also Form 461 for major donors and IE committees). As with contributions, the late reports (496) and the supplemental reports (465) cover the same spending, so don't add them together.
- **Federal:** FEC Schedule E and 24/48-hour reports.
- The spender must be a committee organization. If no independent expenditures exist, close the task with an `exhausted` entry.

---

## Lobbying and behested payments (endorser and funder research)

These records explain *who is trying to influence whom*. Add them for major endorsers and donors once the contest tasks are done.

- **California lobbying:** each lobbyist employer files a quarterly Form 635, and each lobbying firm files a Form 625, on CAL-ACCESS / CARS. They report payments and the **bills and agencies** lobbied, not individual legislators. Record `targets.bills` / `targets.agencies` as filed. Fill `targets.officials` only if the filing itself names them.
- **Federal lobbying:** Senate LDA (`lda.senate.gov`). The LD-2 quarterly reports list issues, bills and the houses/agencies contacted.
- **Behested payments:** California elected officials report payments made at their request to third parties on FPPC Form 803 (`fppc.ca.gov`).
- **Linking influence to a candidate:** to connect "org X lobbied on bill B" to a candidate, record the candidate's vote on or authorship of B as a **position** (`evidence_type: vote`, `bill`). The connection is the shared bill, never an inference.
