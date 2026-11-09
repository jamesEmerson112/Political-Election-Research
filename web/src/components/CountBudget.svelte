<script lang="ts">
  import type { Index } from "../lib/data";
  import { bridgeDomain, bridgeSteps, budgetInput, measureInput, runTrial } from "../lib/budgetTrial";
  import { countLine, countVotes } from "../lib/results";
  import { countWords } from "../lib/trialWords";
  import BudgetMeter from "./BudgetMeter.svelte";

  /**
   * The budget forecast if the recorded count holds, for the Overview: each ballot
   * (Try your ballot's groups) that has both a budget forecast and recorded results
   * gets the General Fund meter with its bridge, the measures ahead in the count as
   * if they became law. `region` limits it to one state's ballots ("ca": California
   * and San Francisco). `line`: one sentence instead (a ballot without a budget
   * forecast, such as Nevada's questions), linking to the full view.
   */
  let { ix, region = "ca", line = false }: { ix: Index; region?: string; line?: boolean } = $props();

  const keyOf = (g: { jurisdiction: string; budget: Record<string, unknown> | null }) =>
    String(g.budget?.["id"] ?? g.jurisdiction.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
  const stOf = (ref: string) => /^(?:contest:)?\d{4}-([a-z]{2})-/.exec(ref)?.[1] ?? "";

  const ballots = $derived(
    ix
      .trialGroups()
      .filter((g) => g.refs.length && stOf(g.refs[0]!) === region)
      .map((g) => {
        const counted = countVotes(g.refs.map((r) => [r, ix.contests.get(r)]));
        const measures = g.refs.map((r) => measureInput(ix.contests.get(r)!));
        const budget = g.budget ? budgetInput(g.budget) : null;
        const ahead = Object.values(counted.votes).filter((v) => v === "yes").length;
        const gf = g.refs.some((r) => (ix.contests.get(r)?.["fiscal"]?.["effects"] ?? []).some((e: { lane: string; estimate: string }) => e.lane === "general_fund" && e.estimate === "estimated"));
        return { g, key: keyOf(g), counted, measures, budget, ahead, gf, has: counted.missing.length < g.refs.length };
      }),
  );
  const shown = $derived(line ? ballots : ballots.filter((b) => b.budget && b.has));

  let fys = $state<Record<string, string>>({});
</script>

{#each shown as b (b.key)}
  {#if line}
    <p class="g-note count-line">
      Budget: {#if b.has}{b.counted.count?.certified ? "passed" : "Yes ahead"} on {b.ahead} of {b.g.refs.length} ({countLine(b.counted.count!)}){:else}statewide count not recorded yet{/if}{#if !b.budget}; no
        budget forecast recorded{/if}{#if !b.gf}, and no fiscal note gives a General Fund amount{/if}.
      <a href={`#trial?count&j=${b.key}`}>Each question's fiscal note ›</a>
    </p>
  {:else}
    {@const result = runTrial(b.measures, b.budget, b.counted.votes)}
    {@const fy = fys[b.key] && result.years.includes(fys[b.key]!) ? fys[b.key]! : (result.years[0] ?? null)}
    {@const bridge = fy ? bridgeSteps(result, b.measures, fy) : null}
    {@const domain = fy ? bridgeDomain(b.measures, b.budget, fy, bridge) : null}
    <section class="count-budget" aria-label={`${b.g.jurisdiction}: budget if the count holds`}>
      <h3 class="eyebrow">
        {b.counted.count?.certified ? "With the measures that passed" : "If the semi-official count holds"}: {b.g.jurisdiction}'s General Fund
      </h3>
      <BudgetMeter
        {result}
        {bridge}
        {domain}
        budgetRec={b.g.budget}
        {fy}
        onfy={(f) => (fys = { ...fys, [b.key]: f })}
        gov={b.g.level === "state" ? "state" : "city"}
        words={countWords(b.counted.count?.certified === true)}
      />
      <p class="more">
        <span class="muted num">{countLine(b.counted.count!)} · {b.counted.count?.certified ? "passed" : "Yes ahead"} on {b.ahead} of {b.g.refs.length}</span>
        <a href={`#trial?count&j=${b.key}`}>Every year and measure in Try your ballot ›</a>
      </p>
    </section>
  {/if}
{/each}

<style>
  .count-budget {
    display: grid;
    gap: 6px;
    margin: 4px 0 18px;
  }
  .count-budget h3 {
    margin: 0;
  }
  .more {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 4px 12px;
    margin: 0;
    font-size: var(--step--1);
  }
  .more a,
  .count-line a {
    color: var(--ink-2);
  }
</style>
