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
- Contest ids: `governor`, `lieutenant-governor`, `attorney-general`, `us-house-ca-<n>`, `prop-<n>`.

<a id="task-candidacy"></a>
## Task: candidacy

Add the candidate to the contest's `candidates` with `npm run -s put -- contest --merge` (the merge goes by `person`).

- `party` and `ballot_designation`: **exactly as printed** on the certified list, including capitalization. An empty designation is recorded as `""`.
- `incumbent`: true only if the certified list or an official roster shows they currently hold this office. Cite that source as well.
- The entry's single `citations` list must support every field in the entry.

<a id="task-person"></a>
## Task: person

Create `people/<slug>.json` with `name` as printed on the certified list. Set `public_figure: true` for candidates and officeholders. Add `ids` you can verify: `wikidata`, `cal_access_filer` / `cars_filer`, `fec_candidate`. Add `links` (campaign site, official site).

<a id="task-profile"></a>
## Task: profile

Fill one `candidate_profile` field with `npm run -s put -- person --merge`. Every candidate gets the same five fields:

| field | best sources |
|---|---|
| `party_registration` | certified list (party preference) |
| `occupation` | the candidate's official/campaign bio. The ballot designation is the candidate's self-description: cite it as such. |
| `residence_city` | city only, never a street address: official bio, candidate filings |
| `offices_held` | official government bios and rosters (legislature, congress.gov Bioguide, agency pages): office, start, end |
| `education` | official bio; institution, degree, year when stated |

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
