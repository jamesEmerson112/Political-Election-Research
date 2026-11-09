---
name: versus-ui
description: The site's visual language (Democracy 3-inspired, built from Lucide icons) for the Svelte site in web/. Covers icons and badges, ▲/▼ marks, numbers first, click to expand, the versus spine, colors, chips and accessibility. Use whenever you add or change anything a reader sees: a comparison row or category, an icon, chip, mark, color, legend, drawer or layout.
---

# The versus UI: icons and numbers first, words on click

## Where it comes from
The maintainer asked for the feel of the strategy game **Democracy 3**: icons, numbers and arrows instead of paragraphs, with text available on click.
- **Inspiration only.** Research found the game's art is not free to reuse, so never copy its icons, art, layouts or names.
- **Glyphs are Lucide only** (`@lucide/svelte`, ISC license, credited in `web/THIRD_PARTY_NOTICES.md`). Import per icon: `import X from "@lucide/svelte/icons/x"`.

## Maintainer decisions (don't change without asking)
1. **Less text, more signal.** A row shows a mark, a number or a short label. Sentences, quotes, citations and search logs open on click (expanded row or drawer).
2. **Arrows mean for/against.**
   - ▲ supports, gives money, endorses.
   - ▼ opposes, spends against.
   - ◐ mixed, ⊘ declined, ○ none found / no position, dashed = not researched, dashed amber = unverified lead (never an arrow).
   - Never use ▲/▼ for anything else: not rank, change, growth or "better".
3. **Neutral colors.**
   - Support teal (`--support`) and oppose orange (`--oppose`); never green or red, never party colors.
   - Money blue (`--money`). People/endorsements plum (`--cat-people`).
   - Endorsement edges: neutral ink, dashed.
4. **Round badges.**
   - A white Lucide glyph in a circle colored by category group (`GROUP_COLOR`: issue, money, people, record), never by stance.
   - No valence glyphs: no thumbs, no checkmarks for performance, no warning triangles.
5. **Versus spine for two candidates** (`VersusSpine.svelte`).
   - One candidate per side, badges down the middle.
   - The middle block under a stance question holds "Both say" chips. Each side lists "Only <candidate>" bullets (position `points` by question facet).
   - One candidate, or three or more: column table (`CompareTable.svelte`).
6. **Describe, never grade or rank.** Office scope is numbers side by side ("1 of 11 seats · ~79.5K residents"), never "powerful/minor". Track records and impact are facts and dated numbers, never success/failure colors.

## Building blocks (reuse before adding)
- **`web/src/lib/icons.ts`:** every icon and badge-color mapping.
  - `ISSUE_ICON` + `FALLBACK_ISSUE_ICON`
  - `CATEGORY` (the maintainer's 11 comparison categories), `ROW_ICON`
  - `CHIP_ICON`, `OFFICE_TYPE`, `BILL_OUTCOME`, `BALLOT_ICON`
  - Unknown ids fall back to a neutral glyph, so new data renders without code changes.
- **`web/src/lib/marks.ts`:** `MARK`, `stanceMark`, `LEGEND`. Shape carries meaning; color is secondary. Every mark has a 1–3 word label (shown or `aria-label`).
- **Components:**
  - `Badge.svelte`, `StanceMark.svelte`, `MarkShape.svelte`, `StanceChip.svelte`, `BillStamp.svelte`
  - `OfficeChips.svelte` (`officeChips.ts`), `Legend.svelte`
  - `CellDetail.svelte` (expanded lines, `group` headings, `point` bullets, citation count buttons)
  - `Drawer.svelte` via `openDetail()` in `ui.svelte.ts` (facts, quotes, quote-pending / unverified chips, search logs, leads, history)
- **`web/src/lib/compare.ts`:** the comparison model.
  - `Category` → `Row` (`kind`: value | stance | bars | dots | bills | lead) → `Cell` (`marks`, `num`/`unit`, `label`, `bars`, `dots`, `bills`, `chips`, `lines`, `summary`, `open`).
  - New UI usually means a new row or cell field here, rendered in `VersusSpine.svelte` and `CompareTable.svelte`.
- **Citation counts:** a small boxed number next to a fact is its source count; clicking it opens the drawer. Every fact shown must be clickable through to its citations.
- **Evidence strength at a glance:**
  - unverified-only → dashed border or dotted-circle "lead" mark
  - quote pending → chip in the drawer
  - not researched → dashed mark
  - Never hide gaps: show "Not researched" / "None found" explicitly.

## Budget meters (ballot measures, the trial ballot)
- One hue for measure effects (`--money`); the official forecast in `--muted`. Direction (cost / revenue) is shown by position left or right of a zero line and by words, never by ▲/▼ and never by teal/orange.
- Ranges stay ranges (a lighter band for low-high); never show a midpoint as if it were an estimate.
- **Percent first** (maintainer: big dollar figures numb readers): lead with a share and put dollars after it or on hover. Fiscal chips use "≈1.6% of GF · cost $120M/yr" (General Fund amounts as a share of the adopted General Fund; other lanes and bonds as a share of the whole adopted budget, named the way the budget names its total: "of all funds" for San Francisco, "of state funds" for California, from `total_label`; `budgetBase`, `totalLong`, `pct`, `pctRange` in `measureChips.ts`).
- **Amounts in words stay words.** An effect the statement sizes only in words (`in_words`) shows its words in quotation marks ("GF cost: “low tens of millions of dollars per year”"), never a number, a share or a bar, and the trial lists it as "Sized in words, not added up". An effect that starts after the forecast's last year is listed with its start year, not drawn.
- **Whose budget.** Each ballot is added up against its own government's budget (San Francisco's measures, California's propositions; the jurisdiction picker in the trial). Copy says "the city" or "the state" from the group, never a hard-coded "city". In the trial meter, steps and the result are a share of the forecast gap ("≈25% larger", `gapShare`); the forecast itself stays in dollars as the base. Say on hover that shares are computed here.
- Show "not estimated" and "minimal or no cost" with the same weight as numbers. List measures in ballot order, never sorted by size.
- Keep the scale fixed while a visitor answers (computed from the all-yes and single-measure extremes), so bars don't jump.
- **Bars start at $0, never a zoomed axis.** A bar's length is its amount: when the bridge's axis started at a $910M shortfall, a 13% smaller shortfall looked like half the bar, and the maintainer read it as halving the budget. Small steps may be slivers; their % label says how big they are.
- In the General Fund bridge (waterfall: forecast, one step per yes measure, result) the shortfall is drawn as a positive amount, larger to the right, a surplus on the other side of $0. Tick labels are amounts; words at the axis ends say which side is which ("← smaller shortfall · larger shortfall →").
- **The $0 mark.** Both budget charts label the $0 line "Balanced: $0 shortfall": the line a year's result would have to reach to have no shortfall. The result's tooltip says how much is still to close. It is the forecast's own term (balanced), never a "goal" or "target": the city closes the gap in its budget whatever the ballot does.
- **The per-year chart** (maintainer's choice, 2026-11-03) shows the General Fund balance: $0 at the top, the official forecast as a dashed gray line, and "with your choices" as a band. The band is `--shortfall` (red) below $0 and `--money` above it: red marks the sign of the balance ("in the red"), never a judgment of a measure or of the visitor's choices, and the chart says so. `--shortfall` is used nowhere else and never next to ▲/▼ (in dark mode it is close to `--oppose`). A computed sentence above it (`yearsNote`) keeps the forecast's own trend apart from the choices' effect, and says when a cumulative forecast's years don't add up (`forecast.cumulative`). The bridge's year is shaded there, and selecting a year shows it in the bridge. Open the summary with what the General Fund and a shortfall are.
- In the bridge, lead with the % change of the gap, large and bold (`gapLine`: "≈0.9% larger", the change ÷ the forecast, labeled as computed here); the dollars (forecast → result, change) follow in plain text. When the result crosses zero, state it in the forecast's words instead, with no %.
- **Every year at once.** The meter shows each forecast year as a button with its change ("FY2028-29 · ≈4.0–18% smaller"); selecting one shows it in the line, the bridge and the per-year chart. A vote can move later years only (a measure that starts in FY2028-29 leaves FY2027-28 as it was), so the meter never shows one year alone, and the years a vote changed are highlighted for a moment and announced ("changed"). Maintainer's bug report, 2026-11-03: a changed answer looked ignored because only FY2027-28 was in view.
- **Draw the bridge once** (maintainer, 2026-11-03: two bridges one above the other read as a bug). While a measure card shows, the meter draws the compact bridge and the other-funds line. In the summary the meter keeps only its headline (`headline`: gap line, fine print, `year buttons` switcher); the summary draws the bridge full size, with its table, and the other funds in "Outside the General Fund". The switcher, the per-year chart's selected year and the bridge share one year (`fy` in `TrialBallot.svelte`).
- Always state next to totals that the forecast excludes ballot measures and that the city must balance each budget. Building blocks: `budgetTrial.ts` (engine, `bridgeSteps`, `bridgeDomain`), `measureChips.ts` (`gapLine`), `BudgetMeter.svelte`, `BudgetBridge.svelte`, `TrialSummary.svelte`.

## Ballot measures: digest, who it affects, arguments
- **Digest** (`MeasureDigest.svelte`): labeled as printed, from `digest.label` ("Digest by the Ballot Simplification Council" in San Francisco, "What your vote means" in California's guide); the way it is now, the proposal (printed " • " bullets on their own lines), then ▲ A YES vote means | ▼ A NO vote means. Every part keeps its source count. In the trial card the long parts show four lines with "Read more" (only when actually cut off).
- **Who it affects** (`AffectedGroups.svelte`, `measureGroups.ts`): rows by effect ("Pays", "Receives", "Rules change for"), each group a people-colored badge with its label and the printed figure; "(may)" when the text is conditional. Effects are words only: never ▲/▼, green/red or "benefits". Below them, "Signed the arguments: ▲ N for · ▼ M against" (literal for/against, so arrows are allowed); a click lists names as printed. Missing data says "not researched yet".
- **Arguments** (`MeasureArguments.svelte`): For | Against side by side at every width, same weight; official arguments first, paid ones under their counts (folded in the trial card). On phones a tap opens the full text in the drawer instead of expanding a narrow column.
- **Trial card:** one scroll (facts, digest, who it affects, arguments) with a vote bar sticky at the bottom of the screen (percent-first gap line, ▲ Yes / ▼ No / Skip / Back). The meter scrolls with the page; after a vote the page returns to it and focus moves to the next measure's heading.

## Results and the promise tracker (format-v2, 2026-11-04)
- **Office results** (`results.ts`, maintainer: "highlight the winner and dim the loser"): the winner's header gets inverted initials and "Leading · 64.2%" ("Elected" once certified); losing candidates are dimmed by color, never by opacity: name and share in `--ink-2`, the initials ring in `--line-strong`, their columns in grayscale (opacity dropped dark-mode text to 2.78:1; browser check 8d holds 4.5:1). Same in the spine (`VersusSpine`) and the table (`CompareTable`, both header copies). A count line under the title: "Leading: name (share) · Semi-official count · date · not certified", with votes and the source in the drawer. On the Overview the winner is bold with the share, the others muted. Candidates keep their agenda order: results never reorder them.
- **Wording:** "Leading" / "Yes ahead" / "No ahead" until the result is certified; only then "Elected", "Passed", "Failed". Never "won", "lost", "defeated" or "victory". Shares are computed here from the votes, one decimal, and the drawer says so.
- **"None of These Candidates"** (Nevada's statewide offices, format-v3): its votes count in the total, so shares match the official ones; the "Votes and source" drawer lists it as its own line after the candidates, and it is never highlighted or called elected.
- **Measure result bar** (`ResultBar.svelte`): one bar, ▲ Yes in `--support` from the left and ▼ No in `--oppose` from the right (the maintainer's "green vs red": the site's own for/against pair, so literal for/against votes may use the arrows), a 2px gap, the side behind dimmed (opacity 0.4), an ink tick at the share needed to pass (50%, or the recorded 55% / two-thirds) labeled "50%" under it. Labels in ink with ▲/▼, the side ahead bold; vote counts after the shares (hidden under 480px; always in the tooltip and drawer). Compact (no counts, no button) on measure cards and Overview rows; inside a link it is `still` (no focus stop of its own).
- **Results first** (`ResultsStrip.svelte`, maintainer's pick U8): after the title on the Overview, one tile per office with a result (office, leader, share) and one chip per measure (▲ Yes / ▼ No, the side ahead and its share). "Leading" is said once in the header with the count line when every tile shares it. District results fold behind "Show N district results" unless My ballot narrows the list; then only that voter's contests show. A note names what has no result recorded yet.
- **Count so far** (`TrialBallot.svelte` mode, `CountBudget.svelte` on the Overview; maintainer, 2026-11-09): the budget meter, bridge and summary for the recorded results (`countVotes` in `results.ts`), worded through `trialWords.ts` ("If the semi-official count holds", "the measures ahead in the count"; "passed" only once certified). The per-measure list shows ▲ Yes ahead / ▼ No ahead (literal votes) or "No result yet". A ballot with no results gets a dashed waiting note, never an empty chart; a ballot with no budget forecast (Nevada) lists each measure's fiscal-note chips instead. Same colors as the trial ballot: measures in `--money`, forecast in `--muted`, red only for a balance below $0.
- **Promise tracker** (`PromiseTracker.svelte`, `tracker.ts`): a section under the comparison. Statuses are one circle family in ink and gray (`PROMISE_STATUS_ICON`): dashed = not checked yet, empty = no action found, dot = in progress, half = partly done, check = done, pause = stalled, pen = changed by the official. Never green/red and never "kept/broken". Counts first ("4 promises · 1 in progress · 1 done …"), then one row per promise (status, title, date of the latest update). "Waiting for results" until a winner is recorded; "No campaign promises recorded" when the dossiers have none.

## Lists, names and loading (sweep picks, 2026-11-06)
- **Names in lists:** `ix.listTitle()` (numbered districts in their short form, "U.S. House, CA-11"); the official name (`contestTitle`) on the contest page.
- **The Overview folds what has nothing to show:** each group lists contests with research or an official record and folds the rest behind "Show N more contests not researched yet". The filter and My ballot always show everything they match.
- **One state at a time** (maintainer, 2026-11-09): the Overview shows California or Nevada · Las Vegas, picked with the pill under the counts ("California 101 | Nevada · Las Vegas 107"; the title and counts stay site-wide). The two parts are links (`#overview?view=nv`, `overviewHash` in `lib/stateView.ts`), so Back, Forward and shared links keep the state. With no `view=`, it opens on My ballot's state, else California; a contest page's Overview link opens that contest's state. My ballot narrows only its own state's list: in the other state every contest is listed and "Show my ballot" goes back. Below the list, the other state is one link; with a filter, the link counts the matches there and keeps the text. Data with one place (the demo) has no switch.
- **Nonpartisan offices:** when the certified list prints no party, the Party row says "Nonpartisan office", cited to the list; never "Not found".
- **Phone header:** one brand line and one row of section links that scrolls sideways; keep it near 74 px.
- **Data on demand** (`lib/parts.svelte.ts`): a page that reads records, leads or tasks gets them through `App.svelte`'s `wants` (one batch) or `need()`; while waiting it shows a short "Loading…" line with `aria-busy`, and on failure a sentence saying to reload. Counts the Overview shows come from `ix.openTaskCount`, `ix.leadCount`, `ix.peopleCount`, `ix.sourceCount`, `ix.claimCount`, which work before the parts arrive.

## Color and accessibility rules
- **Tokens only:** use the tokens in `web/src/app.css` (light, plus dark under `prefers-color-scheme` and `[data-theme]`). Text uses ink tokens (`--ink`, `--ink-2`, `--muted`), never a series color.
- **Validate new colors:** a new hue must pass the dataviz validator (`validate_palette.js --pairs all`) against `--support`, `--oppose`, `--money` and `--cat-people` in both themes. `app.css` notes that no further badge hue passes, so prefer ink/gray.
- **Never color alone:** marks have shapes, chips have icons and text, legends are present for two or more series.
- **Phone width:** works at 390 px with a 16 px gutter and no horizontal scroll. Grid children use `minmax(0, 1fr)`; long text wraps (`overflow-wrap: anywhere`).
- **Keyboard and screen readers:** buttons for anything clickable; `aria-hidden` on decorative glyphs; a standalone badge gets `label`. A chart mark with a tooltip is a tab stop (`tabindex="0"`, `role="img"`, the tooltip's text as its `aria-label`): focus shows the tooltip, Escape hides it.
- **The beta frame:** a "Beta" badge in the header opens About (`AboutView.svelte`): what the beta covers, the open checks from `npm run validate` in plain words, privacy, Report an error, the build, and the switch to the fictional demo. Developer status (warning counts, the dataset switch) lives there, not in the header; validation errors, if any, still show in the header.

## Checking your change
1. `npm run check` and `npm run web:build`.
2. Playwright (pre-installed; `require('playwright')`, `chromium.launch()`): serve `dist/web` (`serve()` in `tests/e2e/server.mjs`; the data files don't load from a `file://` page), open `#c-2026-ca-general--us-house-ca-11`, expand the rows you changed, screenshot at 390 px and 1280 px in light and dark, and assert `document.documentElement.scrollWidth - innerWidth === 0`. Look at the screenshots.
3. **Preview artifact** (maintainer's live preview):
   - Build with `npm run web:build`.
   - Then run `python3 web/to-artifact.py dist/web/index.html <out.html>` (it carries the data files inline).
   - Publish to the same artifact URL (see TODO.md "Where things are").
