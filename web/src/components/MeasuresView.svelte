<script lang="ts">
  import type { Index } from "../lib/data";
  import { budgetInput } from "../lib/budgetTrial";
  import { balance, usd } from "../lib/measureChips";
  import MeasureCard from "./MeasureCard.svelte";

  /** Ballot measures: California's statewide propositions, Nevada's statewide ballot questions, then local measures by jurisdiction (with the budget context and a way into the trial ballot). */
  let { ix, onDemo }: { ix: Index; onDemo?: () => void } = $props();
  const groups = $derived(ix.localMeasureGroups());
  const statewide = $derived(ix.stateMeasures("ca"));
  const nevada = $derived(ix.stateMeasures("nv"));
</script>

<section class="section">
  <div class="section-head">
    <h1>Ballot measures</h1>
    <p>Each measure's legal form, the vote it needs, and its official fiscal statement, before the words. Open a measure for the digest, arguments and sources.</p>
  </div>
  {#if statewide.length}
    <div class="group">
      <div class="ghead">
        <h3>California · Statewide propositions</h3>
        <span class="ctx num">{statewide.length} on every California ballot · fiscal estimates by the Legislative Analyst</span>
      </div>
      <div class="cards">
        {#each statewide as ref (ref)}<MeasureCard {ix} contestRef={ref} />{/each}
      </div>
    </div>
  {/if}
  {#if nevada.length}
    <div class="group">
      <div class="ghead">
        <h3>Nevada · Statewide ballot questions</h3>
        <span class="ctx num">{nevada.length} on every Nevada ballot · fiscal notes as published</span>
      </div>
      <div class="cards">
        {#each nevada as ref (ref)}<MeasureCard {ix} contestRef={ref} />{/each}
      </div>
    </div>
  {/if}
  {#if !groups.length}
    <div class="empty">
      No local measures recorded yet. San Francisco's measures (with the City Controller's fiscal statements) are being researched.
      {#if onDemo}<button class="link" onclick={onDemo}>See the fictional demo</button>.{/if}
    </div>
  {/if}
  {#each groups as g (g.jurisdiction)}
    {@const b = g.budget ? budgetInput(g.budget) : null}
    <div class="group">
      <div class="ghead">
        <h3>{g.jurisdiction}</h3>
        {#if b}
          <span class="ctx num">
            {#if b.adoptedGeneralFund}General Fund FY{b.adoptedGeneralFund.fy}: {usd(b.adoptedGeneralFund.usd)}{/if}
            {#if b.forecast[0]} · Forecast FY{b.forecast[0].fy}: {balance({ low: b.forecast[0].signed, high: b.forecast[0].signed })}{/if}
          </span>
        {/if}
        <a class="try" href="#trial">Try your ballot ›</a>
      </div>
      <div class="cards">
        {#each g.refs as ref (ref)}<MeasureCard {ix} contestRef={ref} />{/each}
      </div>
    </div>
  {/each}
</section>

<style>
  .group {
    display: grid;
    gap: 10px;
  }
  .ghead {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 14px;
  }
  .ghead h3 {
    font-size: var(--step-1);
  }
  .ctx {
    color: var(--ink-2);
    font-size: var(--step--1);
  }
  .try {
    margin-left: auto;
    font-weight: 600;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
    gap: 10px;
  }
  .link {
    background: none;
    border: 0;
    padding: 0;
    color: inherit;
    text-decoration: underline;
    cursor: pointer;
  }
</style>
