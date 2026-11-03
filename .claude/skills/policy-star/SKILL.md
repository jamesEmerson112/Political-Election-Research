---
name: policy-star
description: Write a candidate's past policy (a bill, budget action, program or executive action) as one neutral STAR-style sentence: action verb + what they did and how + context + measurable result, every part cited. Use when recording or summarizing track records, past policies or their impact (dossier track_record items, legislative actions, the overnight impact research), and when the site needs a one-line summary of a past policy.
---

# Past policies as one STAR sentence

The maintainer wants every past policy readable at a glance in one sentence:

**[Action verb] + [what they did / how] + [context or task] + [measurable result].**

This is the resume STAR pattern (Situation, Task, Action, Result), made **neutral**. A resume sells; this project describes. Same shape, no salesmanship.

## The four parts

1. **Action verb.** Use the candidate's role as the record states it, in the past tense:
   - **Use:** authored, co-authored, sponsored, co-sponsored, introduced, amended, voted for, voted against, moved, chaired the committee that…, signed, vetoed, directed, funded (only if the record says their body appropriated it).
   - **Never use:** championed, fought for, led the charge, delivered, saved, secured, won, spearheaded, slashed. They grade the action or claim sole credit.
2. **What / how.** The concrete instrument: the bill number and short title, the budget line and amount, or the program, plus the mechanism ("by requiring…", "through the FY2026-27 budget changes").
3. **Context or task.** The documented situation it responded to, only if a source states it (e.g. "after the Mayor's proposal cut the line"). Leave it out rather than guess a motive.
4. **Measurable result:**
   - First the official outcome: enacted / vetoed / stalled / adopted, the vote, and the date.
   - Then a measured outcome, if one is published: a dated number with its baseline, e.g. "permits rose from 1,200 (2022) to 1,900 (2025)".
   - When none exists, say so: "no measured outcome recorded as of <date>". Too early to measure is a valid result.

## Rules
- **Every part is cited.** Use the existing citations (bill record, legislative action, budget file, impact source). A part you can't cite is dropped, not softened.
- **Shared credit stays visible.** Include co-authors, the body's vote (11–0), or "as part of the budget the Board adopted". Never imply sole credit.
- **Attribution is not causation.** Write "after enactment, X changed from A to B". Don't write "it caused" or "it led to" unless an official evaluation says so; then name the evaluation.
- **Neutral numbers.** No "only", "just", "a whopping", "a record", and no adjectives on results.
- **One sentence**, ideally 35 words or fewer. If the result needs more, the sentence ends with the official outcome, and the measured outcome goes on the next line of the expanded detail.
- **Symmetry.** Same form, depth and kinds of results for every candidate in a contest.

## Where it goes
- **`data/dossiers/people/<slug>.json`:** the `track_record.items[].summary` of each item is the STAR sentence; the item's `citations` back each part.
- **Bills:** the `legislative_action` relationship and the `bill` record already hold the action, instrument and official outcome. The site builds the sentence from them; measured outcomes come from the impact research.
- **On the site:** CA-11's Past policies category is the reference: the expanded line shows the outcome stamp, then the action glyph, then the sentence.

## Examples (fictional, from the demo data's style)
- **Bill with a measured result:** "Authored AB 123 (Widget Workforce Act), requiring state-funded apprenticeships in widget plants, after the 2028 audit found a training backlog; enacted 2029 (41–30), and enrollments rose from 410 (2029) to 980 (2031) per the Labor Agency."
- **Budget action, too early to measure:** "Chaired the committee that added $2.8M a year for city college tuition aid to the FY2030-31 budget, after the Mayor's proposal cut the line; the Council adopted it 9–2, and no measured outcome is recorded as of 2030-11-01."
- **Vetoed bill:** "Authored SB 77, requiring safety reports from large model developers; vetoed by the Governor (September 2029)."

## Before / after
- **Before (resume voice):** "Championed groundbreaking housing reform that unleashed thousands of new homes."
- **After (neutral STAR):** "Authored SB 35, letting qualifying housing projects skip discretionary review in cities behind on state housing goals; enacted 2017, with no measured permit outcome recorded yet."

Every fact in that "after" sentence still needs its citation.
