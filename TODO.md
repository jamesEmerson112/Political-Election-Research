# TODO / backlog (snapshot 2026-11-06; format frozen at `format-v2`)

## Format requests (after v2)
The format is frozen at the tag `format-v2` (2026-11-05; `format-v1` was 2026-11-04; see CLAUDE.md "Format: frozen"). These format changes were left out on purpose. Each needs the maintainer's OK before work starts. Research that finds a fact the format can't hold adds it here, with the contest and the source.
- **Election results:** done in v2 (contest `result`, shown on contest pages, the Overview and measure bars; see "Results and promise tracker" below). The "measures that passed" mode is done (2026-11-09): **Count so far** in Try your ballot and the meter under the Overview's results. California uses the semi-official count; San Francisco and Nevada show a waiting note until their results are recorded (Nevada has no budget forecast either, so it lists the fiscal notes).
- **Judicial retention votes:** 13 yes/no retention votes on SF ballots (2 California Supreme Court, 11 First District Court of Appeal) don't fit the contest model.
- **Impact of past policies:** a record type for measured outcomes of candidates' past bills and programs. It needs the 12 design answers first (see "Impact of past policies and actions" below).
- **Supervisor races:** a `voting_method` field (ranked choice), and showing `vote_for` (seats).
- **Boundaries:**
  - **BOE:** the Commission's shapefile host is blocked.
  - **SF supervisor districts:** from DataSF.
  - **Nevada local districts:** ward, County Commission, CCSD trustee, Regents; only if published with terms that allow reuse.
- **Site size:** done 2026-11-06 (U5): the page carries what the Overview, Measures and About need; records, leads, tasks and district files load on demand (`web/vite.config.ts`, `web/src/lib/parts.svelte.ts`). Still open: per-contest files, so a contest landing on a slow connection fetches only its own records.
- **CI:** run the browser checks (`npm run e2e`) in CI.
- **Promise topics** for other contests are data, not format: they can be added during research.
- **Found in the 2026-11-09 research pass** (facts the format or tooling can't hold yet; nothing recorded for them):
  - **Extraordinary-session bills:** `BillRef` has no form for them. Gloria Romero's Parent Trigger and Open Enrollment Act (SBX5 4, Chapter 3, 2009–10 Fifth Extraordinary Session; Lieutenant Governor) was confirmed but not recorded; `ca-2009-sb-4` would name a different bill.
  - **Local board resolutions without file numbers:** SF Board of Education votes (Alida Fisher, Phil Kim) need `sfusd-file-<number>`, and SFUSD BoardDocs (go.boarddocs.com) returns no text here. Recorded in track records instead.
  - **Legislature bulk data:** the `downloads.leginfo.legislature.ca.gov` zips (0.5–1.2 GB) are larger than `fetch-text` accepts, so bill quotes from them can't be checked (Superintendent: Shaw and Barrera's bills were dropped for this). Bonta's legislation holds only the 6 bills his official biographies name, of about 190 he authored.
  - **Hidden page text:** leg.state.nv.us member pages put "Born: …" in a collapsed tab that `fetch-text` doesn't capture (Tanya Flanagan, Clark County Recorder; left open, not marked not found).
  - **Scanned questionnaires:** City of Las Vegas SB418 questionnaires are handwritten scans with unusable OCR (Jessica A. Green, Municipal Court Dept 2: education and city left open).
- **Nevada initiative constitutional amendments (second vote):** `2026-nv-general/question-6` and `question-7` are the second of the two votes Article 19, Section 2 requires ("must be approved by the voters at two successive general elections", Fiscal Analysis Division notes in Clark County's All Ballot Questions PDF, src:clarkcountynv-gov-384ac2c752, pp. 9 and 14). The measure schema has no field for the first vote (2024 Question 6 / Question 7) or the two-vote requirement; today it is only in `fiscal.summary` (Q6) and `digest.proposal` (Q7).
- **Ballot-argument footnotes:** the Nevada arguments for `2026-nv-general/question-6` and `question-7` print numbered endnotes (the authors' sources) after each argument (same PDF, pp. 5-8, 12-14). `BallotArgument` has no field for them, so `text` keeps the inline note markers and the endnotes are left out.

## Site sweep (2026-11-06)
Every page was crawled: 215 in the real data and 16 in the demo, at 1440 and 390 px, light and dark. Each visit opened every folded section and ran axe-core. Then each page type got a keyboard and click pass, and screenshots were reviewed by eye. The maintainer chose "Bugs now, UI after you pick": the bugs are fixed, and browser checks 8a–8h in `tests/e2e/beta.mjs` keep them fixed. The UI improvements below wait for the maintainer to pick.
- [x] **Fixed:**
  - light-mode gray text contrast (`tests/contrast.test.ts`);
  - dimmed losers unreadable in dark mode;
  - clamped lines cut without an ellipsis;
  - the drawer's focus (return, Tab trap, dialog);
  - Back/Forward losing the reader's place;
  - Nevada's questions missing from Measures;
  - long URLs pushing pages sideways (110 phone pages);
  - stance labels cut mid-phrase ("Speed rail funding");
  - the Overview title and My ballot's "not covered" note;
  - axe findings (map links hidden from screen readers, missing h1s, the queue's scroll region, banner landmarks, tap spacing).
- **UI improvements the maintainer picked (2026-11-06: U1, U2, U4, U5, U6, U8, U9):** built, each with a browser check (9a–9g).
  - [x] **U1 Phone header:** 177 px → 74 px: one brand line and one row of section links that scrolls sideways (9c).
  - [x] **U2 Overview length:** 12,400 px → 4,000 px: each group lists the contests with research and folds the rest behind "Show N more contests not researched yet" (9d).
  - [x] **U4 Contest names:** lists use the short district form ("U.S. House, CA-11"); contest pages keep the official name (9b).
  - [x] **U5 Speed:** data loads on demand (see "Site size"). On a phone with 4× slower CPU: the Overview in 3.2 s instead of 6.6 s on slow 4G, 2.2 s instead of 3.7 s on 9 Mbps; landing on a contest page 5.9 s instead of 6.7 s on slow 4G, 4.2 s instead of 3.9 s on 9 Mbps. The sweep's "1.0–1.7 s to open the San Francisco tables" was wrong: axe-core was running in the same page; they open in 70–170 ms (9g).
  - [x] **U6 Nonpartisan races:** "Nonpartisan office" in the Party row where the certified list prints no party, cited to that list (9a).
  - [x] **U8 After the election:** a Results section leads the Overview: statewide leaders, the propositions, district results on request, only the voter's contests with My ballot set (9e).
  - [x] **U9 San Francisco ZIPs:** California's district file has a county layer, so a ZIP or location finds the county and San Francisco's local contests (9f).
- **Not picked (still open):**
  - [ ] **U3 Money map on phones:** a 900 px drawing in a sideways scroller, so a phone shows the donors but not the candidates they connect to. Use a list layout under 600 px.
  - [ ] **U7 Long pages:** Research queue is about 169,000 px and Sources about 51,000 px. Fold them by contest, or page them.
- **Data wording (research, not the site):** unverified-lead notes in 6 contests say a designation is "left null" in text readers see (Treasurer, Superintendent, BOE 2 and 4, CA-6, CA-34).

## Results and promise tracker (built 2026-11-05, `format-v2`)
After the election: who won each contest, and what each winner does on the campaign promises recorded in their dossier, from official records only. Guide: `docs/RESEARCH_GUIDE.md` "Contest results" and "Promise tracking"; visual rules: the versus-ui skill.

**The maintainer's decisions (2026-11-04)**
- **Results on the site:** "highlight the winner and dim the loser"; for props "a bar of green vs red" (the site's teal-green ▲ Yes and orange-red ▼ No).
- **Wording:** "Leading" / "Yes ahead" / "No ahead" until certified, then "Elected" / "Passed" / "Failed".
- **Promise status:** one label per promise, set only by cited official records; gray shapes; never green/red or "kept/broken". Labels: Not checked yet · No action found · In progress · Partly done · Done · Stalled · Changed by the official. The label shown is the latest update's.
- **Whose:** winners only. **Where:** a "Promise tracker" section on each contest page, under the comparison table.
- **SF results:** wait (sfelections.org refuses cloud sessions).

**Done**
- [x] Format v2: `OfficeResult.winners` and `as_of`; `MeasureResult.passed` once certified; promise `tracking`; `updates` merge by id; canonical sorts; validate rules (RESULT_NOT_CANDIDATE, RESULT_WINNERS, RESULT_PASSED_MISMATCH, TRACKING_NOT_WINNER; warnings RESULT_UNCERTIFIED, RESULT_SOURCE); SQLite tables; fixture (certified results and tracked promises in the demo); tests (964f0ea).
- [x] Site: count line, winner highlighted and losers dimmed (spine, table, Overview), `ResultBar` on measure pages, cards and Overview rows, `PromiseTracker`; browser checks 5n–5q (5173d44).
- [x] California semi-official results, count of November 4, 2026, 7:20 p.m. (refreshed 2026-11-09 to the count of November 8, 4:21 p.m.) (`api.sos.ca.gov/returns/...`, fetched with plain curl by `tools/research/ca-sos-results.mjs`): 16 office contests (8 statewide, BOE 1–4, CA-11, CA-15, Assembly 17 and 19) and the 14 propositions, one commit per contest.

**Open**
- [ ] **Optional: tags on GitHub.** CLAUDE.md names the frozen commits (`format-v1` = 38939a6, `format-v2` = bce387a), so the freeze check needs no tag. Cloud sessions can't push tags (GitHub answers 403), so if the maintainer wants them on GitHub: on github.com, Releases, then Draft a new release, then Choose a tag `format-v2`, Target `main`, then Publish. `format-v1` (38939a6 is not the tip of a branch) is easiest from any fresh clone: `git tag -a format-v1 38939a6 -m "Beta format frozen 2026-11-04"`, then `git push origin format-v1`.
- [ ] **Refresh the California semi-official counts** when asked: `node tools/research/ca-sos-results.mjs --commit --trailers <file>` (each run replaces the semi-official result, one commit per contest; `--dry` checks first). Close contests to watch: Prop 5 (50.6% Yes), Insurance Commissioner (52.2%).
- [ ] **Certified results** replace the semi-official ones when the Secretary of State certifies (`certified: true`, `certified_date`, `passed` for measures, quoting the Statement of Vote).
- [ ] **SF results wait** (Board of Education, City College, Supervisors 2/4/6/8/10, Props A–J, Assessor, Public Defender, BART 8): sfelections.org refuses this environment (CloudFront 403). The maintainer can supply the official results, or they wait for a reachable official copy. Ranked-choice contests record the final round of the official ranked-choice report.
- [ ] **Nevada results wait:** the Secretary of State's results site (silverstateelection.nv.gov) answers with a bot check; Clark County's page (elections.clarkcountynv.gov/electionresultsTV/) is readable but covers only Clark County's part of statewide and NV-4 results.
- [ ] **Tracking** starts once the winners take office: each promise gets one update per official action, or "No action found" with a search log (guide: "Promise tracking").
- [ ] **Promises still missing** in these contested races: Treasurer, CA-15, Assembly 19, Supervisors 8 and 10, and every Nevada race.

## Where things are (resume here)
- Branch: `claude/practical-curie-2m7we8` (all work pushed; CI runs typecheck, fmt, validate, tests, web build).
- **Public beta:** https://political-election-research.vercel.app/ (Vercel project `political-election-research`, preset "Other"; production deploys from `main`, so changes go live through a PR into `main`; every other branch gets a preview deployment). Check it with `BASE_URL=https://political-election-research.vercel.app/ node tests/e2e/beta.mjs` (and `trial-ballot.mjs`): 18/18 passed on 2026-11-03 (build 763be63).
- Live preview (private): https://claude.ai/artifact/H8hJQpAzVSF6yTugX4gcgv. Republish = `npm run web:build`, then `python3 web/to-artifact.py dist/web/index.html <out.html>` and publish to the same artifact.
- Agent loop: `AGENTS.md`. Office-scope rules and citation statuses: `CLAUDE.md`.
- Key commands:
  - `npm run -s next -- --contest <id>`
  - `npm run -s put -- <kind>`
  - `npm run -s validate [--strict]`
  - `npm run -s coverage -- <contest>`
  - `npm run -s import:research -- <batch.json>`
  - `npm run -s import:offices -- <offices.json>`
  - `npm run -s import:civlab -- [--save <dir outside the repo>]` (offices with `links.civlab`; SF and U.S. only)
  - `npm run -s db`
  - `npm run web`
  - `npm run e2e` (builds the site, serves it with `vercel.json`'s headers, then runs the browser checks in `tests/e2e/trial-ballot.mjs` and `tests/e2e/beta.mjs`; needs Playwright with Chromium, so it isn't part of `npm run check`). `BASE_URL=https://<deployment>/` runs them against a deployed site.
- Batch formats: `docs/RESEARCH_BATCH_FORMAT.md`, `docs/OFFICE_BATCH_FORMAT.md`.
- Maintainer's verified CA-11 notes: `notes/2026-11-02-ca-11.md`.
- Current state (2026-11-03, late):
  - **Agendas:** 71 California and 107 Nevada (placeholders: Las Vegas ballots, including 60 judge seats).
  - **Records:** 24 measures (SF Props A–J with digest, fiscal effects, who it affects and all 161 arguments; California Props 1–5 and 37–45 from the official guide, with the Legislative Analyst's fiscal effects), the SF and California budgets and forecasts, 15 offices, 151 sources, 71 lead files.
  - **Validate:** 0 errors; 424 warnings: 167 unverified citations, 151 not archived, 99 quote pending, 7 orphan sources.
  - **Site:** a 2.2 MB page (334 KB compressed) plus data files loaded on demand in `dist/web/data/` (2026-11-06).

## Beta (2026-11-03)
**Shipped in the beta**
- California's propositions in "Try your ballot", against the state budget: the Department of Finance's operating deficits for FY2027-28 to FY2029-30; the Legislative Analyst's dollar amounts for Props 1, 3 and 38; 12 effects sized only in words (`in_words`), quoted and never added up. Prop 3 starts in FY2030-31 (after the forecast).
- About page (what's in it, the open checks, privacy, Report an error, build), the Beta badge, keyboard access to the bridge's tooltips.
- `vercel.json` (build and security headers) and `npm run e2e` with 18 browser checks served under those headers, including that nothing leaves the browser.

**Deployed** 2026-11-03: PR #1 merged into `main`; https://political-election-research.vercel.app/ serves the beta with `vercel.json`'s headers (brotli, about 650 KB transferred), and all 18 browser checks pass against it.

**Next: the mass research** (maintainer, 2026-11-03: San Francisco first, then Las Vegas; how to run it is the maintainer's call: the Workflow tool needs their explicit opt-in)
- **Queue on 2026-11-03** (`npm run next`): 1,725 open tasks (3,039 counting blocked ones).

  | scope | contests | candidates | open tasks |
  |---|---|---|---|
  | SF ballot: statewide offices (8 offices, Board of Equalization 1–4) | 12 | 24 | 237 |
  | SF ballot: U.S. House CA-11 and CA-15 | 2 | 4 | 42 |
  | SF ballot: Board of Education, City College, Supervisors D2/4/6/8/10 | 7 | 39 | 326 |
  | Other U.S. House races | 50 | 100 | 900 |
  | Nevada (Las Vegas): placeholder agendas, no candidates yet | 107 | 0 | 220 |
- **SF local stances wait for questions:** the draft question sets (SFUSD 7, City College 6, Supervisors 8) are in `notes/2026-11-03-sf-draft-questions.md`, not approved, so the queue has no position tasks for those races. Everything else (person, profile, legislation, dossier, endorsements, committees, finance cutoff, independent expenditures) can start.
- **Las Vegas:** the agendas need certified candidate lists first (the contest task). The Nevada Secretary of State's site answers with a bot block page ("Request unsuccessful. Incapsula…"), so use Clark County Election Department documents (clarkcountynv.gov is reachable).
- **Hosts on 2026-11-03:**
  - reachable: sos.ca.gov, cal-access.sos.ca.gov, powersearch.sos.ca.gov, fec.gov (website; the OpenFEC API needs a key), sf.gov, campaign.sfethics.org, netfile.com, clerk.house.gov, missionlocal.org, clarkcountynv.gov, lasvegasnevada.gov, leg.state.nv.us;
  - blocked: web.archive.org, leginfo.legislature.ca.gov, ballotpedia.org, congress.gov, sfelections.org (403), nvsos.gov (bot block).
- **Going live:** each batch is committed on the branch (one task per commit, AGENTS.md), then a PR into `main`; the merge deploys. Check with `BASE_URL=https://political-election-research.vercel.app/ node tests/e2e/beta.mjs`.
- **The `validate --strict` gate for 1.0**, now 424 warnings:
  - Archive snapshots for 151 sources. web.archive.org refuses connections from the cloud sessions, so archive from another machine or allow the host.
  - A verification pass on the 167 unverified citations and the 99 pending quotes.
  - Remove or cite the 7 orphan sources.

**After the beta**
- **Results:** see "Results and promise tracker".
- **Site size:** data loads on demand since 2026-11-06 (see "Format requests"); per-contest files are still open.
- **Accessibility:** the dark-mode shortfall red sits close to the dark orange ▼ (accepted for now: separate charts, with a legend).
- **"My ballot":** places California and Nevada (Las Vegas) contests. Nevada ZIPs and locations use `geo/nv-2026-districts.json`. Nevada's contests are still placeholders (no candidates).
- **CI:** run `npm run e2e` in CI if Chromium can be installed there.
- **Open maintainer decisions:** see "Decisions for the maintainer" below.

## Revisit (list from 2026-11-03 evening)

### Decisions for the maintainer
- **Draft question sets for the SF races:**
  - Board of Education (7), City College (6) and Supervisors (8).
  - They are in the agents' reports, not on the agendas yet; stance research waits for approval.
- **Bill policy areas:** immigration legal services → Civil rights; Alexandria Theater Special Use District → Other. Confirm both.
- **Promises with no matching issue:** childcare, paid family leave, free community college, the stock-trading ban, campaign-finance reform. Add Education and Government issue groups?
- **SB 1074:** "BASED Act" appears in no official record; rename to the official subject ("self-preferencing conduct")?
- **STAR sentence length:** past-policy sentences run 45–67 words. Keep, or move votes and dates into the expanded view?
- **City College:** add the separate partial-term contest (Ruth Ferguson)?
- **Measure conflicts:** A/F and I/C/J were treated as partial ("both take effect; one prevails where provisions conflict"). Confirm.
- **California's budget forecast:** the trial uses the Department of Finance's "Operating Surplus/Deficit with BSA Transfer" row (each year on its own: $10.5B, $8.6B, $8.4B shortfalls). The same table's reserve balance (SFEU: +$0.4B, −$8.2B, −$16.7B) is a running total and would need running-balance math. Confirm the framing.
- **California's Prop 3 and 37 context entries:** Prop 3's "roughly 40 percent to schools" (an allocation of the same revenue) and Prop 37's "Other Potential Effects" are recorded as effects; drop them if they read as context rather than budget effects.
- **Budget forecast:**
  - FY2026-27 was dropped.
  - The March 2026 Budget Outlook Update (cumulative shortfalls, made before the budget was adopted) is used for FY2027-28 to FY2029-30. Confirm the framing.
- **Money each candidate introduced:** keep "voted for" separate from "introduced / sponsored"?
- **Budget chart option 3:** General Fund by service area, from the adopted ordinance (not started).

### Data to verify
- **CA-11 ballot statements** (the pamphlet is now downloaded): check word for word "fully funded Free City College", the Muni/BART/Caltrain claim, and who wrote the "$35 insulin" line.
- **SF local candidates** (Board of Education, City College, Supervisors; 39 in all):
  - check against the official list on sf.gov (now reachable);
  - resolve name variants;
  - add ballot designations.
- **Verification pass on the warnings:**
  - 167 unverified citations (office facts, CivLab counts, State Senate);
  - 99 citations that still need an exact quote (the maintainer's CA-11 notes);
  - 1,163 unverified leads.
- **Archives:** 124 sources lack Wayback snapshots (web.archive.org is blocked); `validate --strict` fails until they're added.
- **State Senate:**
  - term-limit date conflict (after June 7, 2011 vs after June 2012);
  - salary figure is the 2013-14 rate;
  - senate.ca.gov is reachable now.
- **Primary legal texts still blocked:** SF Charter (codelibrary.amlegal.com), constitution.congress.gov, www.house.gov.
- **SF measures:**
  - Prop G: a possible missing effect (Upper Great Highway signal replacement).
  - Prop J: the statement doesn't name the General Fund (classified as general_fund by rule).
  - Prop I: the House SF Fund is about $119M net vs $120M recorded.
  - Prop B: resolved 2026-11-03. The pamphlet prints the **amended** Controller's statement (August 20, 2026). The amendment changed one sentence ("Under the RWG modeling, … would be financed" became "Capitalization and funding costs could be financed"); every figure is the same.
  - Optional cross-check: the standalone argument PDFs on sf.gov's Qualified Ballot Measures page against the pamphlet text. Prop D has a filed challenge to its rebuttal to the opponent's argument (with the Department's response), and Prop H's rebuttal to the proponent is posted as "Corrected".
- **Official per-measure documents (all public):** https://www.sf.gov/qualified-ballot-measures lists each measure's legal text, legislative digest, Controller's statement and each argument as separate PDFs on `api.sf.gov` (reachable since 2026-11-03). Each measure's Controller's statement is now cited directly, with its date as `fiscal.as_of`.

### In progress (2026-11-03)
- **Ballot arguments for Props A–J:** extraction running, then a verbatim check (`scratchpad/tools/write_sf_arguments.ts`) and import.
- **Budget meter:** the bridge (waterfall) chart plus a numbers-first gap line. Done 2026-11-03: the bridge's bars start at $0 (no zoom), with the shortfall drawn as a positive amount; both charts label $0 "Balanced: $0 shortfall"; the per-year chart is a dashed forecast line and a band (red below $0) under a computed sentence, with its years selectable; and the summary draws the bridge once (the meter keeps only its headline there). The meter shows every forecast year as a button, and highlights the years a vote changed. Effects can carry per-year amounts (`schedule`; Prop C uses the Controller's $6M / $13M / $60M). Still open: keyboard access to the bridge's steps (the hover tooltips are mouse-only), and statewide propositions in the trial (needs the state budget as a base).
- **Tonight's impact-research run:**
  - finish the design;
  - add the impact data fields;
  - save the overnight workflow under `.claude/workflows/` before bedtime.

### Features not finished
- **"My ballot":**
  - SF supervisor districts by ZIP or location (DataSF is now reachable);
  - ~~a county layer~~ (done 2026-11-06: ZIPs and locations find the county);
  - BOE location lookup stays pick-only until wedrawthelines.ca.gov is allowed.
- **Supervisor races:** see "Format requests (after v2)".
- **Election results:** see "Results and promise tracker".

### Housekeeping
- **Site size:** see "Format requests (after v2)": on-demand data done, per-contest files open.
- **Hosting:** move to GitHub Pages so "Use my location" works (the private preview can't grant location) and the site has a shareable URL.
- **Disk:** delete the 10 old agent worktrees in `.claude/worktrees` (3.1 GB, including the 1.5 GB geo cache).
- **Docs:** update the README status table.
- **CI:** confirm the GitHub check is green after today's pushes.

## California statewide propositions (2026-11-03)
- **In progress:** the 14 propositions on the November 3, 2026 ballot (Props 1–5 and 37–45, per the Secretary of State's qualified list), from the official Voter Information Guide: title, summary, who placed it, what a YES and a NO vote mean, the Legislative Analyst's fiscal estimate (word for word) and every argument and rebuttal with its signers.
- **Note on the guide's PDF:** its fonts drop the fi/fl/ff ligatures when text is extracted ("inflation" comes out "infation"). Every passage is matched against the Secretary of State's web version of the same guide (voterguide.sos.ca.gov/propositions/N/), and the correctly spelled web text is stored.
- **Next:**
  - "Who it affects" for the state propositions (two independent passes, as for San Francisco).
  - Fiscal effects by lane where the Analyst gives numbers (e.g. "$500 million to $600 million annually for about 25 years"); word-only estimates ("tens of millions to low hundreds of millions") stay as text.
  - A state budget base for percentages: the Analyst writes "This year, the state plans to spend about $250 billion from the General Fund" (Prop 2 analysis); record the enacted budget from the Department of Finance.
  - "Try your ballot" for state propositions (needs the state budget base and a multi-year outlook).
  - The Analyst's "Background" and "Proposal" as the digest's "the way it is now" and "the proposal" (long; would need "Read more").

## Nevada state ballot questions (placeholders)
- State Question 6 (constitutional amendment, abortion rights) and State Question 7 (constitutional amendment, voter identification) are placeholder agendas, cited to Clark County's ballot-question list. Both are second votes (Nevada initiative constitutional amendments must pass at two general elections; the printed fiscal notes name November 2024 and November 2026).
- **Next:** record each question's text, explanation, arguments for and against, and fiscal note from Clark County's sample ballot or "All Ballot Questions" PDF (the Nevada Secretary of State's site blocks automated access), then show them with the digest and arguments like the California propositions.

## Las Vegas, Nevada (placeholders, 2026-11-03)
- **In place:** the election `2026-nv-general` and 107 placeholder agendas (no candidates, questions or positions) for the contests on City of Las Vegas ballots, each citing the Clark County Election Department list it appears on; the Overview's "Nevada · Las Vegas" view (one state at a time since 2026-11-09: the switch under the Overview's title), with judges in their own "Courts" group.
- **Next, before research:** seed each agenda's candidates from the certified list (Clark County's "All Contests and Candidates in the November 3 2026, General Election" PDF), then fix each contest's question set (AGENTS rule 6), then run `npm run -s next -- --contest 2026-nv-general/<contest>`.
- **Judges (added 2026-11-03, maintainer's choice):** the Eighth Judicial District Court's 58 seats (`district-court-dept-1` … `-32`, Family Division `district-court-family-dept-a` … `-z`; every Las Vegas voter sees all of them, since NRS 3.010 makes Clark County the Eighth Judicial District) and the two City of Las Vegas Municipal Court seats (`las-vegas-municipal-court-dept-1`, `-2`, unexpired terms), each quoted from Clark County's general-election contest list. No Las Vegas Township justice of the peace is on the November ballot. Many judge contests have one candidate.
- **Blocked:** the Nevada Secretary of State (`www.nvsos.gov`, `silverstateelection.nv.gov`) answers automated requests with a bot check (Incapsula), so statewide contests and questions rest on Clark County's documents for now.
- **"My ballot"** narrows to a Las Vegas voter's contests by ZIP, location or picked districts: House, Senate, Assembly, Clark County and the City of Las Vegas from Census data. Ward, County Commission, CCSD trustee and Regent districts are picked by hand. **Next:** add their boundaries, if Clark County or City of Las Vegas open data publishes them with terms that allow reuse.

## Priority (maintainer, 2026-11-03): San Francisco first
- Do San Francisco-area contests and candidates first; the rest of California comes later.
- **In progress:**
  - CA-11 (Chan vs Wiener)
  - SF Board of Education
  - City College of SF Board of Trustees
  - SF Board of Supervisors district races
- **Done (2026-11-03):** SF measures model, fiscal statements and budget baseline (`budget` records), the "Try your ballot" trial with a budget meter (works on the fictional demo).
- **SF measures data (waiting on hosts):** allow `www.sf.gov`, `media.api.sf.gov`, `sfcontroller.org`, `openbook.sfgov.org`, `data.sfgov.org`, then research every SF Prop (facts, digest, Controller's statement, conflicts) and `data/budgets/san-francisco.json` (adopted FY2026-27/27-28 from Legistar File 260596; the latest Joint Report / Five-Year Plan forecast). See RESEARCH_GUIDE `task-measure-fiscal`.
- **Money each candidate introduced to the budget (maintainer: important):**
  - Per candidate, track the dollars in the past policies they introduced, sponsored or moved: appropriations, budget add-backs, bonds and taxes they placed.
  - Each amount is cited, with its fiscal year, kind (one-time / annual) and fund, shown as a total row in Past policies (lane by lane, never blended).
  - Data: an amount field on track-record items.
  - CA-11 so far, from cited records:
    - Chan: File 251080 $3.5M (FY2025-26), File 261148 $1.765M (pending), Free City College +$2.8M/yr (FY2026-27, FY2027-28).
    - Wiener: none recorded yet.
- **Next SF items:**
  - State Assembly districts covering SF (AD-17 east, AD-19 west)
  - SF local ballot measures
  - Regional measures on SF ballots
  - Any other SF-wide offices on the Nov 2026 ballot
- **"My ballot":** SF-wide contests should show for every SF voter; supervisor races need SF supervisorial district boundaries (DataSF).
- **Statewide offices, other House districts and propositions:** keep as is; deeper research waits until SF is covered.

## Blocker: network access
- These hosts are blocked in this cloud environment. Allow them under environment settings → Network access, or pick a broader level.
  - **CA Secretary of State and state campaign finance:** elections.cdn.sos.ca.gov, admin.cdn.sos.ca.gov, cal-access.sos.ca.gov, powersearch.sos.ca.gov (www.sos.ca.gov pages open now)
  - **Federal filings:** fec.gov, api.open.fec.gov, lda.senate.gov
  - **FPPC:** fppc.ca.gov
  - **Archiving:** web.archive.org (archive.org's availability API answers; saving and opening snapshots does not)
  - **SF government:** sfgov.legistar.com, sfbos.org, sf.gov, media.api.sf.gov now open (checked 2026-11-03). Still blocked: `api.sf.gov` (per-measure official PDFs, the audio pamphlet, the ballot-arguments guide), `sfethics.org` / `campaign.sfethics.org` and `netfile.com` / `public.netfile.com` (filings of committees that paid for ballot arguments), `digitalsf.org` (SF Public Library's archive of voter pamphlets: a lasting copy while web.archive.org is blocked), `data.sf.gov`, `sfplanning.org`, `www.sfcontroller.org` (sfcontroller.org redirects to sf.gov, which opens)
  - **State voter guide:** `voterguide.sos.ca.gov` (for state propositions)
  - **Legislature and governor:** www.senate.ca.gov (and its subdomains), assembly.ca.gov, gov.ca.gov; leginfo.legislature.ca.gov answers with a Cloudflare challenge that needs challenges.cloudflare.com
  - **Primary texts behind CivLab's office data:** codelibrary.amlegal.com (SF Charter), constitution.congress.gov (U.S. Const. art. I), www.house.gov
  - **News, guides and reference:** kqed.org, missionlocal.org, growsf.org, calmatters.org, ballotpedia.org (graph.civlab.org works now)
  - **Candidate websites**
- Web search is capped at about 200 searches per turn, shared by all agents. Run research in batches of ≤40 searches per agent.

## Phase 1: Verification (biggest gap)
- Verify the 809 unverified leads. Each confirmed one becomes a cited record: a verbatim quote, or `verified_by` maintainer.
- Fill in 93 pending quotes (maintainer-verified CA-11 citations).
- Verify 144 unverified office citations (search summaries, and counts computed from CivLab graph data).
- Archive all 83 sources (Wayback snapshots); `validate --strict` must pass before release. archive.org lists earlier snapshots of two CivLab pages (graph.civlab.org/sf, 2026-10-07; the House node, 2026-09-18) that could not be opened to compare.
- Create contest records for all 64 contests from the SoS Certified List (party and ballot designation exactly as printed).

## Decisions / checks for the maintainer
- **CA-11**
  - Wiener on AI disclosure is recorded as "support" (authored SB 53). The question also includes incident reporting; confirm.
  - Bill titles are descriptive names from the notes, not official titles.
  - Chan's roles with Maxwell, Harris and Peskin are a lead; the notes don't say what the roles were.
  - Source published dates use the register's "updated", "last action" or "enacted" dates.
  - Taxes issue description now reads "State and federal…".
  - **ICE conflict:** the notes say Chan's ballot statement proposes "abolishing ICE"; the agent found only "defund"; Wiener's campaign page says he has backed abolishing ICE since 2018.
  - Wiener controversies to verify (two outlets or an official record each):
    - FPPC warning letter (2023)
    - Sunshine complaint (dismissed in 2013)
    - AI chatbot parody of Chan (Aug 2026; he apologized)
  - Chan controversies are recorded as "searched, none found" (18 searches); coverage flags the row as uneven until Wiener's are verified.
  - Finance: committees C00909283 (Wiener) and C00927558 (Chan); totals through 2026-10-14 conflict across windows; check the Rising Tide Collective $100K direction (against Wiener or for Chan?); no top-donor list yet.
  - Leads to confirm:
    - ballot designations "San Francisco Supervisor" / "State Senator"
    - birth years 1978 / ~1970
    - transit upzoning: Chan oppose, Wiener support (SB 79)
    - Prop 40: Chan support, Wiener oppose
    - civil-rights stances (Equality Act both support; federal abortion law: Wiener explicit, Chan alignment only; preclearance: nothing found)
- **Governor**
  - Ballot designations "Voting Rights Attorney" (Becerra) and "Small Business Owner" (Hilton): only from search summaries of the SoS PDF.
  - Becerra date conflicts: Assembly end Nov 30 vs Dec 3, 1992; HHS start Mar 18 vs 19, 2021; HHS end date unstated.
  - Excluded: a claim that Hilton was an Uber VP (unverified).
- **House**
  - CA-1 Gallagher incumbency (June special election).
  - CA-3 / CA-6: Bera and Kiley swapped districts; Kiley now NPP.
  - CA-14 Wahab: incumbency; DSW or PhD?
  - CA-16: Soulé advanced per AP; confirm the full ballot name.
  - Weak candidate lists: CA-35 (Cargile), CA-38 (Casas), CA-46 (Pan), CA-51 (Cabrera), CA-31 (Ching vs Levi), CA-34 (Gonzales-Torres vs Dixon).
  - Name spellings to check: Lincoln / Lincoln II, Jeff / Jeffrey Frese, Clemmons, Le Roux, Belle.
  - Ballot designations missing for most candidates.
- **Statewide**
  - Designation conflicts: Hawks, Umberg, Gates (Deputy U.S. Attorney vs Deputy Assistant AG), Shaw / Barrera pairing.
  - Missing designations: Lieber, Pimentel.
  - Thin bios: Board of Equalization and several others.
- **Offices**
  - U.S. Rep: the 2-year term and the powers sentence now come from verbatim quotes of CivLab's House description (secondary); verify against U.S. Const. art. I. "No term limits" is still unsourced.
  - 761K residents per seat is a computed figure (2020 population ÷ 52); Prop 50 district populations unknown.
  - Most state department budgets not found.
  - SF budget is now FY 2026-27 $16,851,826,113, CivLab's citywide total, which corroborates the $16.9B report; still unverified (computed from CivLab data). Check it against the adopted appropriation ordinance.
  - CivLab counts (SF Board: 11 seats, appoints 403 seats on 74 boards, commissions and other posts, advised by 5 bodies; House: 435 seats, elects the Speaker) are unverified until checked against the SF Charter and U.S. Const. art. I.
  - CivLab's SF description also says the Board "holds the authority to reject appointments and propose city policies"; our `powers` text is kept. Decide whether to add it.
  - State Senator: term-limit date conflict (record: first elected after June 7, 2011; SOS 2014 page: after June 2012), to resolve against Cal. Const. art. IV, sec. 2(a)(4). Appointments are not counted (the Senate's list of state boards, 3.14.25, is on www.senate.ca.gov). No vote threshold found for ordinary confirmations.
  - SF term limits: does November Prop A undo June Prop B?

## Phase 2: Research backlog
- **CA-11:** 24 open tasks. Ballot listing; birth dates and residence; 9 stances; Prop 40 contest record (official title and summary); performance record verification; FEC committees and contributions from filings; outside spending (IEs) from filings.
- **Question sets** for the other 63 contests, fixed per office before stance research (e.g. Insurance Commissioner ≠ House).
- **Governor:** stance research on its 6 questions plus Prop 3.
- **Propositions (14):** contest records, committees for and against, top funders, endorsements, candidate stances.
- **Basic-info depth for House and statewide candidates:** education, office dates, birth details.
- **Impact of past policies and actions (maintainer priority; overnight ultracode run):**
  - For each candidate's track-record items (bills authored, budget actions, programs) research what measurably happened afterward.
  - **Outcome data:** enrollment, ridership, housing permits, service levels, dollars spent.
  - **Evaluations:** official ones (Controller/City audits, LAO, agency reports) and independent studies.
  - **Rules:**
    - Cite every number; keep attribution honest (shared credit, other causes, too early to measure).
    - Describe, never grade.
    - Same depth for both candidates.
  - **Start with CA-11:**
    - Chan: Free City College funding; the $1.3B reserve she cites as Budget Chair.
    - Wiener: Muni/BART/Caltrain funding, SB 79, SB 53 and other authored bills.
  - **Data sources:** the Legislature's bulk data (downloads.leginfo.legislature.ca.gov) has official bill history and votes.
  - **Prep:** the method and the saved workflow are designed before the run.

## Phase 3: Features
- **Importers:** CARS (CAL-ACCESS replacement, live mid-Nov 2026), OpenFEC, Senate LDA lobbying, FPPC Form 803 behested payments. Mark records `provenance: import` for human review.
- **check-quotes script:** fuzzy-match each quote against its Wayback snapshot.
- **Public hosting:** GitHub Pages, auto-deploy on push.
- **Post-election:** results and tracking the winners' promises: see "Results and promise tracker" near the top. Keep tracking winners for the 2028 reuse.
- **Lazy-load per-contest data:** parts load on demand since 2026-11-06; per-contest files are next.
- **InfluenceMap:** restyle with the category badges.
- **Optional:** NAICS sector tagging for donors (no editorial labels); a research-request issue template.

## Housekeeping
- Update the README status table: offices, leads, policy areas, 64 contests, SQLite, importers.
- `npm audit`: low-severity deepmerge advisory via `@sveltejs/vite-plugin-svelte` (dev only).
- Clean up merged agent worktrees under `.claude/worktrees/` (gitignored).
