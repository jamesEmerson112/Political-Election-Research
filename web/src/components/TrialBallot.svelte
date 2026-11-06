<script lang="ts">
  import { tick, untrack } from "svelte";
  import type { Index } from "../lib/data";
  import { contestRoute } from "../lib/data";
  import { measureLabel } from "../lib/measureLabel";
  import { bridgeDomain, bridgeSteps, budgetInput, measureInput, runTrial, type Vote } from "../lib/budgetTrial";
  import { MEASURE_ICON } from "../lib/icons";
  import { MARK } from "../lib/marks";
  import { budgetBase, fiscalChips, gapLine, measureFactChips, signedRange } from "../lib/measureChips";
  import { forgetVotes, loadVotes, saveVotes } from "../lib/trialStorage";
  import { openDetail } from "../lib/ui.svelte";
  import AffectedGroups from "./AffectedGroups.svelte";
  import Badge from "./Badge.svelte";
  import BudgetMeter from "./BudgetMeter.svelte";
  import MeasureArguments from "./MeasureArguments.svelte";
  import MeasureDigest from "./MeasureDigest.svelte";
  import OfficeChips from "./OfficeChips.svelte";
  import StanceMark from "./StanceMark.svelte";
  import TrialSummary from "./TrialSummary.svelte";
  import MeasureComparison from "./MeasureComparison.svelte";

  /**
   * "Try your ballot": one measure at a time (Yes / No / Skip) with a running
   * General Fund meter, then a summary. San Francisco's measures and California's
   * propositions are separate ballots, each against its own government's budget.
   * Answers stay in this browser.
   */
  let { ix, onDemo }: { ix: Index; onDemo?: () => void } = $props();

  const groups = $derived(ix.trialGroups());
  let pick = $state<string | null>(null);
  const group = $derived(groups.find((g) => g.jurisdiction === pick) ?? groups.find((g) => g.budget) ?? groups[0] ?? null);
  const measures = $derived(group ? group.refs.map((r) => measureInput(ix.contests.get(r)!)) : []);
  const budget = $derived(group?.budget ? budgetInput(group.budget) : null);
  /** Whose budget it is, for the wording. */
  const gov = $derived<"city" | "state">(group?.level === "state" ? "state" : "city");
  const ballotKey = $derived(group ? String(group.budget?.["id"] ?? group.jurisdiction) : "");
  const titles = $derived(Object.fromEntries((group?.refs ?? []).map((r) => [r, String(ix.contests.get(r)?.["official_title"]?.["value"] ?? "")])));

  let votes = $state<Record<string, Vote>>({});
  let step = $state(0);
  let fy = $state<string | null>(null);
  $effect(() => {
    // New jurisdiction (or dataset): load its saved answers and start where they left off.
    const key = ballotKey;
    const ms = measures;
    const first = budget?.forecast[0]?.fy ?? null;
    const loaded = key ? loadVotes(key) : {};
    untrack(() => {
      votes = loaded;
      const firstOpen = ms.findIndex((m) => !loaded[m.ref]);
      step = firstOpen === -1 ? ms.length : firstOpen;
      fy = first;
    });
  });

  const result = $derived(runTrial(measures, budget, votes));
  const shownFy = $derived(fy && result.years.includes(fy) ? fy : (result.years[0] ?? null));
  const bridge = $derived(shownFy ? bridgeSteps(result, measures, shownFy) : null);
  /** A fixed axis per fiscal year (from the all-yes and single-yes bridges) so the bridge doesn't jump around while answering. */
  const domain = $derived(shownFy ? bridgeDomain(measures, budget, shownFy, bridge) : null);
  const gap = $derived.by(() => {
    const r = result.generalFund.find((y) => y.fy === shownFy);
    return r?.result && r.baseline !== null ? gapLine(r.fy, r.baseline, r.result) : null;
  });
  const current = $derived(step < measures.length ? measures[step]! : null);
  const rec = $derived(current ? ix.contests.get(current.ref)! : null);
  const answered = $derived(measures.filter((m) => votes[m.ref]).length);
  const label = (ref: string) => measureLabel(ix, ref);

  let meterEl = $state<HTMLElement | null>(null);
  let headEl = $state<HTMLElement | null>(null);
  /** After a vote: back to the meter (so the change is visible), with the next card right below it; focus its heading. */
  async function toMeter() {
    await tick();
    meterEl?.scrollIntoView({ behavior: "smooth", block: "start" });
    headEl?.focus({ preventScroll: true });
  }
  function answer(v: Vote) {
    if (!current) return;
    votes = { ...votes, [current.ref]: v };
    saveVotes(ballotKey, votes);
    step = Math.min(step + 1, measures.length);
    void toMeter();
  }
  function back() {
    step = Math.max(step - 1, 0);
    void toMeter();
  }
  function forget() {
    forgetVotes(ballotKey);
    votes = {};
    step = 0;
  }
  function statement() {
    const f = rec?.["fiscal"];
    if (!f) return;
    openDetail({
      kicker: `${f["statement_by"]} · fiscal statement`,
      title: `${label(current!.ref)}: ${titles[current!.ref] ?? ""}`,
      text: f["summary"]?.["summary"] ?? "",
      facts: (f["effects"] ?? []).map((e: { text: string; id: string }) => [e.id, e.text] as [string, string]),
      citations: [...(f["summary"]?.["citations"] ?? []), ...(f["effects"] ?? []).flatMap((e: { citations: unknown[] }) => e.citations)],
    });
  }
</script>

<section class="section trial">
  <div class="section-head">
    <h1>Try your ballot</h1>
    <p>
      Vote on each measure and watch the official estimates add up against that government's budget forecast. This adds up the official fiscal statements for the
      choices you try; it doesn't recommend how to vote. Your answers stay in this browser.
    </p>
  </div>

  {#if !group}
    <div class="empty">
      No local measures with recorded fiscal statements yet. San Francisco's measures and budget forecast are being researched.
      {#if onDemo}<button class="link" onclick={onDemo}>See it on the fictional demo</button>.{/if}
    </div>
  {:else}
    {#if groups.length > 1}
      <div class="seg" role="group" aria-label="Jurisdiction">
        {#each groups as g (g.jurisdiction)}
          <button class:on={g.jurisdiction === group.jurisdiction} aria-pressed={g.jurisdiction === group.jurisdiction} onclick={() => (pick = g.jurisdiction)}>{g.jurisdiction}</button>
        {/each}
      </div>
    {/if}

    <!-- While voting, the meter draws the bridge; in the summary it keeps its year buttons and headline, and the summary draws the bridge, once. -->
    <div class="meter-wrap" bind:this={meterEl}>
      <BudgetMeter {result} {bridge} {domain} budgetRec={group.budget} fy={shownFy} onfy={(f) => (fy = f)} headline={!(current && rec)} {gov} />
    </div>

    <div class="progress">
      <span class="num">{answered} of {measures.length} answered</span>
      <span class="dots" aria-hidden="true">
        {#each measures as m, i (m.ref)}
          <button class="dot" class:cur={i === step} class:done={!!votes[m.ref]} onclick={() => (step = i)} tabindex="-1">{String(ix.contests.get(m.ref)?.["number"] ?? i + 1)}</button>
        {/each}
      </span>
      {#if answered}<button class="link" onclick={() => (step = measures.length)}>Summary</button> · <button class="link" onclick={forget}>Forget my answers</button>{/if}
    </div>

    {#if current && rec}
      {@const name = `${label(current.ref)}: ${titles[current.ref] ?? ""}`}
      <article class="card panel">
        <div class="top">
          <Badge icon={MEASURE_ICON} group="record" size={28} />
          <strong class="letter">{label(current.ref)}</strong>
          <span class="muted num">{step + 1} of {measures.length}</span>
          <OfficeChips chips={measureFactChips(rec)} />
        </div>
        {#snippet voteButtons(where: string)}
          <button class="ans yes" class:on={votes[current.ref] === "yes"} aria-pressed={votes[current.ref] === "yes"} aria-label={`Yes on ${label(current.ref)}${where}`} onclick={() => answer("yes")}
            ><StanceMark mark={MARK["support"]!} size={15} /> Yes</button
          >
          <button class="ans no" class:on={votes[current.ref] === "no"} aria-pressed={votes[current.ref] === "no"} aria-label={`No on ${label(current.ref)}${where}`} onclick={() => answer("no")}
            ><StanceMark mark={MARK["oppose"]!} size={15} /> No</button
          >
          <button class="ans" class:on={votes[current.ref] === "skip"} aria-pressed={votes[current.ref] === "skip"} aria-label={`Skip ${label(current.ref)}${where}`} onclick={() => answer("skip")}>Skip</button>
        {/snippet}
        <!-- Vote right at the title too, without scrolling to the bar at the bottom. -->
        <div class="titlerow">
          <h3 bind:this={headEl} tabindex="-1">{titles[current.ref]}</h3>
          <div class="answers quick">{@render voteButtons(" (top)")}</div>
        </div>
        <p class="sum">{rec["summary"]?.["value"] ?? ""}</p>
        <div class="fiscal">
          <OfficeChips chips={fiscalChips(rec, label, budgetBase(group.budget))} />
          {#if rec["fiscal"]}<button class="link" onclick={statement}>{rec["fiscal"]["statement_by"]}'s statement ›</button>{/if}
          <a class="link" href={`#${contestRoute(current.ref)}`}>Measure page ›</a>
        </div>
        {#if rec["digest"]}
          <section class="part"><MeasureDigest digest={rec["digest"]} clamp /></section>
        {/if}
        <section class="part">
          <span class="eyebrow">Who it affects</span>
          <AffectedGroups affects={rec["affects"]} args={rec["arguments"]} title={name} />
        </section>
        {#if rec["comparison"]}
          <section class="part">
            <MeasureComparison cmp={rec["comparison"]} measure={name} />
          </section>
        {/if}
        {#if rec["arguments"]?.length}
          <section class="part">
            <span class="eyebrow">Arguments, side by side</span>
            <MeasureArguments args={rec["arguments"]} title={name} compact />
          </section>
        {/if}
        <!-- Sticks to the bottom of the screen while the card is in view: the live budget change, then the vote. -->
        <div class="votebar">
          <p class="gapline num" aria-hidden="true">
            {#if gap?.mode === "pct"}{gap.head} <strong class="pct">{gap.pct}</strong> · {gap.from} → {gap.to}{:else if gap}{gap.text}{:else}General Fund {signedRange(
                result.perYearOnceInEffect.general_fund,
              )}/yr{/if}
          </p>
          <div class="answers">
            {@render voteButtons("")}
            {#if step > 0}<button class="link back" onclick={back}>‹ Back</button>{/if}
          </div>
        </div>
      </article>
    {:else}
      <TrialSummary
        {result}
        {measures}
        {votes}
        {titles}
        {bridge}
        {domain}
        base={budgetBase(group.budget)}
        cumulative={group.budget?.["forecast"]?.["cumulative"] === true}
        onfy={(f) => (fy = f)}
        {gov}
      />
      <div class="answers">
        <button class="ans" onclick={() => (step = 0)}>Change answers</button>
        <button class="ans" onclick={forget}>Forget my answers</button>
      </div>
    {/if}
  {/if}
</section>

<style>
  /* The meter scrolls with the page (a tall sticky meter left little room to read the card); after each vote the page returns to it. */
  .meter-wrap {
    scroll-margin-top: calc(var(--top-h, 0px) + 8px);
  }
  .part {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
    border-top: 1px solid var(--line);
    padding-top: 10px;
  }
  /* The vote bar sticks to the bottom of the screen while the card is in view. */
  .votebar {
    position: sticky;
    bottom: 0;
    z-index: 2;
    display: grid;
    gap: 4px;
    margin: 4px -16px -14px;
    padding: 8px 16px 10px;
    background: var(--surface);
    border-top: 1px solid var(--line-strong);
    border-radius: 0 0 var(--radius) var(--radius);
  }
  .gapline {
    font-size: var(--step--1);
    color: var(--ink-2);
    overflow-wrap: anywhere;
  }
  .gapline .pct {
    color: var(--ink);
    font-size: 1rem;
  }
  .titlerow {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 6px 14px;
  }
  .titlerow h3 {
    flex: 1 1 22rem;
    min-width: 0;
  }
  .answers.quick {
    padding-top: 0;
    flex: 0 0 auto;
  }
  h3:focus {
    outline: none;
  }
  h3:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
  .seg {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .seg button,
  .ans {
    border: 1px solid var(--line-strong);
    background: var(--surface);
    border-radius: 999px;
    padding: 4px 14px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
  }
  .seg button.on,
  .ans.on {
    border-color: var(--ink);
    box-shadow: inset 0 0 0 1px var(--ink);
  }
  .progress {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    font-size: var(--step--1);
    color: var(--ink-2);
  }
  .dots {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 3px;
  }
  .dot {
    min-width: 22px;
    height: 22px;
    border-radius: 11px;
    border: 1px dashed var(--line-strong);
    background: var(--surface);
    font-size: 0.7rem;
    cursor: pointer;
  }
  .dot.done {
    border-style: solid;
  }
  .dot.cur {
    border-color: var(--ink);
    font-weight: 700;
  }
  .card {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
    padding: 14px 16px;
  }
  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
  }
  .letter {
    font-size: var(--step-1);
  }
  h3 {
    font-size: var(--step-1);
    overflow-wrap: anywhere;
  }
  .sum {
    color: var(--ink-2);
  }
  .fiscal {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 12px;
  }
  .answers {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding-top: 4px;
  }
  .link {
    background: none;
    border: 0;
    padding: 0;
    color: var(--ink-2);
    text-decoration: underline;
    cursor: pointer;
    font-size: var(--step--1);
  }
  .back {
    margin-left: auto;
  }
</style>
