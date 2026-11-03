# TODO / backlog (snapshot 2026-11-03)

## Where things are (resume here)
- Branch: `claude/practical-curie-2m7we8` (all work pushed; CI runs typecheck, fmt, validate, tests, web build).
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
- Batch formats: `docs/RESEARCH_BATCH_FORMAT.md`, `docs/OFFICE_BATCH_FORMAT.md`.
- Maintainer's verified CA-11 notes: `notes/2026-11-02-ca-11.md`.
- Current state (2026-11-03 evening): 71 contest agendas (64 statewide/House + SF Board of Education, City College board, Supervisor D2/4/6/8/10), 10 SF measure records (Props A–J) and the SF budget, 15 offices, 1,163 unverified leads, 124 sources. Validate: 0 errors; warnings: 167 unverified citations, 124 not archived, 99 quote pending, 5 orphan sources.

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
- **Budget meter:** the bridge (waterfall) chart plus a numbers-first gap line.
- **Tonight's impact-research run:**
  - finish the design;
  - add the impact data fields;
  - save the overnight workflow under `.claude/workflows/` before bedtime.

### Features not finished
- **"My ballot":**
  - SF supervisor districts by ZIP or location (DataSF is now reachable);
  - a county layer;
  - BOE location lookup stays pick-only until wedrawthelines.ca.gov is allowed.
- **Supervisor races:** a `voting_method` field (ranked choice), and showing `vote_for` (seats) in the site and SQLite.
- **Election results (today is election day):** add certified results, and a "measures that passed" mode for the trial ballot.

### Housekeeping
- **Site size:** the single-file site is over 3.1 MB, and the arguments will add more. Load contests on demand.
- **Hosting:** move to GitHub Pages so "Use my location" works (the private preview can't grant location) and the site has a shareable URL.
- **Disk:** delete the 10 old agent worktrees in `.claude/worktrees` (3.1 GB, including the 1.5 GB geo cache).
- **Docs:** update the README status table.
- **CI:** confirm the GitHub check is green after today's pushes.

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
- **Post-election:** add certified results to contest files (`result`), then keep tracking winners for the 2028 reuse.
- **Lazy-load per-contest data:** the single-file build is now ~2.2 MB.
- **InfluenceMap:** restyle with the category badges.
- **Optional:** NAICS sector tagging for donors (no editorial labels); a research-request issue template.

## Housekeeping
- Update the README status table: offices, leads, policy areas, 64 contests, SQLite, importers.
- `npm audit`: low-severity deepmerge advisory via `@sveltejs/vite-plugin-svelte` (dev only).
- Clean up merged agent worktrees under `.claude/worktrees/` (gitignored).
