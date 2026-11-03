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
- Show "not estimated" and "minimal or no cost" with the same weight as numbers. List measures in ballot order, never sorted by size.
- Keep the scale fixed while a visitor answers (computed from the all-yes and single-measure extremes), so bars don't jump.
- The General Fund bridge (waterfall: forecast, one step per yes measure, result) may zoom its axis away from $0 so small steps stay visible, but only with a break mark and a note saying where the bars start. Lead with the numbers (`gapLine`: forecast → result, change, % of the forecast labeled as computed).
- Always state next to totals that the forecast excludes ballot measures and that the city must balance each budget. Building blocks: `budgetTrial.ts` (engine, `bridgeSteps`, `bridgeDomain`), `measureChips.ts` (`gapLine`), `BudgetMeter.svelte`, `BudgetBridge.svelte`, `TrialSummary.svelte`.

## Color and accessibility rules
- **Tokens only:** use the tokens in `web/src/app.css` (light, plus dark under `prefers-color-scheme` and `[data-theme]`). Text uses ink tokens (`--ink`, `--ink-2`, `--muted`), never a series color.
- **Validate new colors:** a new hue must pass the dataviz validator (`validate_palette.js --pairs all`) against `--support`, `--oppose`, `--money` and `--cat-people` in both themes. `app.css` notes that no further badge hue passes, so prefer ink/gray.
- **Never color alone:** marks have shapes, chips have icons and text, legends are present for two or more series.
- **Phone width:** works at 390 px with a 16 px gutter and no horizontal scroll. Grid children use `minmax(0, 1fr)`; long text wraps (`overflow-wrap: anywhere`).
- **Keyboard and screen readers:** buttons for anything clickable; `aria-hidden` on decorative glyphs; a standalone badge gets `label`.

## Checking your change
1. `npm run check` and `npm run web:build`.
2. Playwright (pre-installed; `require('playwright')`, `chromium.launch()`): open `dist/web/index.html#c-2026-ca-general--us-house-ca-11`, expand the rows you changed, screenshot at 390 px and 1280 px in light and dark, and assert `document.documentElement.scrollWidth - innerWidth === 0`. Look at the screenshots.
3. **Preview artifact** (maintainer's live preview):
   - Build with `npm run web:build`.
   - Then run `python3 web/to-artifact.py dist/web/index.html <out.html>`.
   - Publish to the same artifact URL (see TODO.md "Where things are").
