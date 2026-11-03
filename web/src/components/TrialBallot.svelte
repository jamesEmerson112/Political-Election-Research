<script lang="ts">
  import { untrack } from "svelte";
  import type { Index } from "../lib/data";
  import { contestRoute } from "../lib/data";
  import { bridgeDomain, bridgeSteps, budgetInput, measureInput, runTrial, type Vote } from "../lib/budgetTrial";
  import { MEASURE_ICON } from "../lib/icons";
  import { MARK } from "../lib/marks";
  import { fiscalChips, gapLine, measureFactChips, signedRange } from "../lib/measureChips";
  import { forgetVotes, loadVotes, saveVotes } from "../lib/trialStorage";
  import { openDetail } from "../lib/ui.svelte";
  import Badge from "./Badge.svelte";
  import BudgetMeter from "./BudgetMeter.svelte";
  import OfficeChips from "./OfficeChips.svelte";
  import StanceMark from "./StanceMark.svelte";
  import TrialSummary from "./TrialSummary.svelte";

  /**
   * "Try your ballot": one local measure at a time (Yes / No / Skip) with a
   * running General Fund meter, then a summary. Answers stay in this browser.
   */
  let { ix, onDemo }: { ix: Index; onDemo?: () => void } = $props();

  const groups = $derived(ix.localMeasureGroups());
  let pick = $state<string | null>(null);
  const group = $derived(groups.find((g) => g.jurisdiction === pick) ?? groups.find((g) => g.budget) ?? groups[0] ?? null);
  const measures = $derived(group ? group.refs.map((r) => measureInput(ix.contests.get(r)!)) : []);
  const budget = $derived(group?.budget ? budgetInput(group.budget) : null);
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
    return r?.result && r.baseline !== null ? gapLine(r.fy, r.baseline, r.result).text : null;
  });
  const current = $derived(step < measures.length ? measures[step]! : null);
  const rec = $derived(current ? ix.contests.get(current.ref)! : null);
  const answered = $derived(measures.filter((m) => votes[m.ref]).length);
  const label = (ref: string) => `Prop ${String(ix.contests.get(ref)?.["number"] ?? ix.contestTitle(ref))}`;

  function answer(v: Vote) {
    if (!current) return;
    votes = { ...votes, [current.ref]: v };
    saveVotes(ballotKey, votes);
    step = Math.min(step + 1, measures.length);
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
    <h2>Try your ballot</h2>
    <p>
      Vote on each local measure and watch the official estimates add up against the budget forecast. This adds up the official fiscal statements for the
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

    <div class="sticky">
      <BudgetMeter {result} {bridge} {domain} budgetRec={group.budget} fy={shownFy} onfy={(f) => (fy = f)} />
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
      <article class="card panel" aria-live="polite">
        <div class="top">
          <Badge icon={MEASURE_ICON} group="record" size={28} />
          <strong class="letter">{label(current.ref)}</strong>
          <span class="muted num">{step + 1} of {measures.length}</span>
          <OfficeChips chips={measureFactChips(rec)} />
        </div>
        <h3>{titles[current.ref]}</h3>
        <p class="sum">{rec["summary"]?.["value"] ?? ""}</p>
        {#if rec["digest"]}
          <p class="means"><StanceMark mark={MARK["support"]!} /> <span><strong>Yes</strong> means: {rec["digest"]["yes_means"]["value"]}</span></p>
          <p class="means"><StanceMark mark={MARK["oppose"]!} /> <span><strong>No</strong> means: {rec["digest"]["no_means"]["value"]}</span></p>
        {/if}
        <div class="fiscal">
          <OfficeChips chips={fiscalChips(rec, label)} />
          {#if rec["fiscal"]}<button class="link" onclick={statement}>{rec["fiscal"]["statement_by"]}'s statement ›</button>{/if}
          <a class="link" href={`#${contestRoute(current.ref)}`}>Measure page ›</a>
        </div>
        <div class="answers">
          <button class="ans yes" class:on={votes[current.ref] === "yes"} onclick={() => answer("yes")}><StanceMark mark={MARK["support"]!} size={15} /> Yes</button>
          <button class="ans no" class:on={votes[current.ref] === "no"} onclick={() => answer("no")}><StanceMark mark={MARK["oppose"]!} size={15} /> No</button>
          <button class="ans" class:on={votes[current.ref] === "skip"} onclick={() => answer("skip")}>Skip</button>
          {#if step > 0}<button class="link back" onclick={() => (step -= 1)}>‹ Back</button>{/if}
        </div>
      </article>
      <div class="mini num" aria-hidden="true">
        {#if gap}{gap}{:else}General Fund {signedRange(result.perYearOnceInEffect.general_fund)}/yr{/if}
      </div>
    {:else}
      <TrialSummary {result} {measures} {votes} {titles} {bridge} {domain} />
      <div class="answers">
        <button class="ans" onclick={() => (step = 0)}>Change answers</button>
        <button class="ans" onclick={forget}>Forget my answers</button>
      </div>
    {/if}
  {/if}
</section>

<style>
  .sticky {
    position: sticky;
    top: var(--top-h, 0px);
    z-index: 2;
    background: var(--paper);
    padding-bottom: 4px;
  }
  .mini {
    display: none;
  }
  @media (max-width: 700px) {
    /* The header is tall on phones: the full meter scrolls with the page and a one-line summary sticks to the bottom. */
    .sticky {
      position: static;
    }
    .mini {
      display: block;
      position: sticky;
      bottom: 0;
      z-index: 2;
      margin: 0 -16px;
      padding: 8px 16px;
      background: var(--surface);
      border-top: 1px solid var(--line-strong);
      font-size: var(--step--1);
      color: var(--ink-2);
      overflow-wrap: anywhere;
    }
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
  .means {
    display: flex;
    gap: 6px;
    align-items: baseline;
    font-size: var(--step--1);
    overflow-wrap: anywhere;
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
