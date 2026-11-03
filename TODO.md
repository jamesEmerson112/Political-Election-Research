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
  - `npm run -s db`
  - `npm run web`
- Batch formats: `docs/RESEARCH_BATCH_FORMAT.md`, `docs/OFFICE_BATCH_FORMAT.md`.
- Maintainer's verified CA-11 notes: `notes/2026-11-02-ca-11.md`.
- Current state: 64 contest agendas, 13 offices, 809 unverified leads. Validate: 0 errors; warnings: 93 quote pending, 116 unverified citations, 65 not archived, 1 orphan source.

## Blocker: network access
- These hosts are blocked in this cloud environment. Allow them under environment settings → Network access, or pick a broader level.
  - **CA Secretary of State and state campaign finance:** sos.ca.gov, elections.cdn.sos.ca.gov, cal-access.sos.ca.gov, powersearch.sos.ca.gov
  - **Federal filings:** fec.gov, api.open.fec.gov, lda.senate.gov
  - **FPPC:** fppc.ca.gov
  - **Archiving:** archive.org, web.archive.org
  - **SF government:** sfgov.legistar.com, sfbos.org, sf.gov, media.api.sf.gov
  - **Legislature and governor:** senate.ca.gov, assembly.ca.gov, leginfo.legislature.ca.gov, gov.ca.gov
  - **News, guides and reference:** kqed.org, missionlocal.org, growsf.org, calmatters.org, ballotpedia.org, graph.civlab.org
  - **Candidate websites**
- Web search is capped at about 200 searches per turn, shared by all agents. Run research in batches of ≤40 searches per agent.

## Phase 1: Verification (biggest gap)
- Verify the 809 unverified leads. Each confirmed one becomes a cited record: a verbatim quote, or `verified_by` maintainer.
- Fill in 93 pending quotes (maintainer-verified CA-11 citations).
- Verify 116 unverified office citations (seen only as search summaries).
- Archive all 65 sources (Wayback snapshots); `validate --strict` must pass before release.
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
  - U.S. Rep 2-year term and no term limits are not sourced.
  - 761K residents per seat is a computed figure (2020 population ÷ 52); Prop 50 district populations unknown.
  - Most state department budgets not found.
  - SF FY26-27 budget $16.9B is unverified.
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
