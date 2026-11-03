<script lang="ts">
  import type { Bridge, BridgeDomain, TrialResult } from "../lib/budgetTrial";
  import { date } from "../lib/format";
  import { gapLine, LANE_LABEL, signedRange, usd } from "../lib/measureChips";
  import { openDetail } from "../lib/ui.svelte";
  import BudgetBridge from "./BudgetBridge.svelte";

  /**
   * The running General Fund meter for one fiscal year: a numbers-first line
   * (forecast -> result, and how much larger or smaller the gap gets) and the
   * bridge from the official forecast through each yes measure to the result.
   * One hue for the measures (--money), gray for the forecast and the result;
   * direction is shown by position and by words, never by arrows.
   */
  let {
    result,
    bridge,
    domain,
    budgetRec,
    fy,
    onfy,
  }: {
    result: TrialResult;
    bridge: Bridge | null;
    domain: BridgeDomain | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    budgetRec: Record<string, any> | null;
    fy: string | null;
    onfy: (fy: string) => void;
  } = $props();

  const row = $derived(result.generalFund.find((y) => y.fy === fy) ?? result.generalFund[0] ?? null);
  const i = $derived(row ? result.years.indexOf(row.fy) : -1);
  const line = $derived(row?.result && row.baseline !== null ? gapLine(row.fy, row.baseline, row.result) : null);
  const lanes = $derived(
    (["set_aside", "dedicated", "other_agency", "bond_debt"] as const)
      .map((l) => ({ l, r: result.perYearOnceInEffect[l] }))
      .filter(({ r }) => r.low !== 0 || r.high !== 0),
  );
  function forecastSource() {
    const y = (budgetRec?.["forecast"]?.["years"] ?? []).find((v: { fy: string }) => v.fy === row?.fy);
    if (!y) return;
    openDetail({
      kicker: `${budgetRec?.["forecast"]?.["publisher"] ?? "Official forecast"} · ${date(budgetRec?.["forecast"]?.["published"])}`,
      title: `${budgetRec?.["forecast"]?.["title"] ?? "Forecast"}: FY${row?.fy}`,
      text: `Projected ${y.direction} of ${usd(y.amount_usd)}.${y.basis ? ` ${y.basis}` : ""}`,
      citations: y.citations,
      note: "The city adopts a balanced budget each year; a projected shortfall is the gap the Mayor and Board must close with cuts, new revenue or reserves. The forecast doesn't include these measures.",
    });
  }
</script>

<div class="meter panel" aria-live="polite">
  {#if row}
    <div class="head">
      <span class="eyebrow">General Fund</span>
      <span class="fy">
        <button aria-label="Earlier fiscal year" disabled={i <= 0} onclick={() => onfy(result.years[i - 1]!)}>‹</button>
        <span class="num">FY{row.fy}</span>
        <button aria-label="Later fiscal year" disabled={i >= result.years.length - 1} onclick={() => onfy(result.years[i + 1]!)}>›</button>
      </span>
    </div>
    {#if line}
      <p class="gap num">
        <span class="h">{line.head}:</span>
        <span>{line.from}</span>
        <button class="cite" onclick={forecastSource} aria-label="Forecast source">i</button>
        <span aria-label="to">→</span>
        <strong>{line.to}</strong>
        <span class="chg">({line.change}{#if line.pct}, <abbr title="Computed here: the change divided by the forecast amount">{line.pct}</abbr>{/if})</span>
      </p>
    {/if}
    {#if bridge && domain}<BudgetBridge {bridge} {domain} compact />{/if}
    <p class="fine">The forecast doesn't include ballot measures; the city must adopt a balanced budget each year. The % is the change ÷ the forecast, computed here.</p>
  {:else}
    <p class="muted">No official budget forecast is recorded for this jurisdiction yet, so only the yearly amounts are added up below.</p>
    <dl class="lines">
      <dt>Your choices so far (General Fund)</dt>
      <dd class="num">{signedRange(result.perYearOnceInEffect.general_fund)} a year</dd>
    </dl>
  {/if}
  {#if lanes.length || result.bonds.principal}
    <p class="lanes">
      {#each lanes as { l, r } (l)}<span>{LANE_LABEL[l]} {signedRange(r)}/yr</span>{/each}
      {#if result.bonds.principal}<span>Bonds {usd(result.bonds.principal)}{#if result.bonds.perHundredK} · ~${result.bonds.perHundredK.toFixed(2)}/yr per $100k assessed{/if}</span>{/if}
    </p>
  {/if}
</div>

<style>
  .meter {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
    padding: 10px 14px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  .fy {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
  }
  .fy button {
    border: 1px solid var(--line-strong);
    background: var(--surface);
    border-radius: 6px;
    width: 26px;
    height: 24px;
    cursor: pointer;
  }
  .fy button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .gap {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 6px;
    overflow-wrap: anywhere;
  }
  .gap .h {
    color: var(--ink-2);
    font-weight: 600;
  }
  .gap .chg {
    color: var(--ink-2);
  }
  abbr {
    text-decoration: underline dotted;
    cursor: help;
  }
  .fine {
    font-size: 0.7rem;
    color: var(--muted);
  }
  .lines {
    display: grid;
    grid-template-columns: minmax(0, auto) minmax(0, 1fr);
    gap: 2px 12px;
    font-size: var(--step--1);
  }
  .lines dt {
    color: var(--ink-2);
  }
  .lines dd {
    text-align: right;
    overflow-wrap: anywhere;
  }
  .cite {
    border: 1px solid var(--line-strong);
    border-radius: 50%;
    width: 16px;
    height: 16px;
    font-size: 0.65rem;
    line-height: 1;
    background: var(--surface);
    cursor: pointer;
    align-self: center;
  }
  .lanes {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    font-size: var(--step--1);
    color: var(--ink-2);
    border-top: 1px solid var(--line);
    padding-top: 6px;
  }
</style>
