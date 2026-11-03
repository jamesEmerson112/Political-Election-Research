<script lang="ts">
  import type { BudgetInput, Range, TrialResult } from "../lib/budgetTrial";
  import { shareOf } from "../lib/budgetTrial";
  import { date } from "../lib/format";
  import { balance, LANE_LABEL, signedRange, usd, usdRange } from "../lib/measureChips";
  import { openDetail } from "../lib/ui.svelte";

  /**
   * The running General Fund meter: the official forecast for one fiscal year,
   * the visitor's choices so far, and the result, all as ranges. One hue for
   * the choices (--money), gray for the forecast; direction is shown by
   * position (left of zero = shortfall side) and by words, never by arrows.
   */
  let {
    result,
    budget,
    budgetRec,
    fy,
    onfy,
    scaleMax,
  }: {
    result: TrialResult;
    budget: BudgetInput | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    budgetRec: Record<string, any> | null;
    fy: string | null;
    onfy: (fy: string) => void;
    scaleMax: number;
  } = $props();

  const row = $derived(result.generalFund.find((y) => y.fy === fy) ?? result.generalFund[0] ?? null);
  const i = $derived(row ? result.years.indexOf(row.fy) : -1);
  const W = 300;
  const C = W / 2;
  const x = (v: number) => C + (v / (scaleMax || 1)) * (C - 4);
  const near = (r: Range) => (Math.abs(r.low) < Math.abs(r.high) ? r.low : r.high);
  const share = $derived.by(() => {
    if (!row || (row.delta.low === 0 && row.delta.high === 0)) return null;
    const s = shareOf(Math.max(Math.abs(row.delta.low), Math.abs(row.delta.high)), budget);
    return s === null ? null : `${(s * 100).toFixed(s < 0.001 ? 2 : 1)}%`;
  });
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
    <dl class="lines">
      <dt>Official forecast <button class="cite" onclick={forecastSource} aria-label="Forecast source">i</button></dt>
      <dd class="num">{balance({ low: row.baseline ?? 0, high: row.baseline ?? 0 })}</dd>
      <dt>Your choices so far</dt>
      <dd class="num">{signedRange(row.delta)} a year{#if share}<span class="share"> · ≈{share} of the FY{budget?.adoptedGeneralFund?.fy} General Fund</span>{/if}</dd>
      <dt>With your choices</dt>
      <dd class="num strong">{row.result ? balance(row.result) : "—"}</dd>
    </dl>
    <svg viewBox={`0 0 ${W} 44`} preserveAspectRatio="none" class="bars" role="img" aria-label={`Forecast ${balance({ low: row.baseline ?? 0, high: row.baseline ?? 0 })}; with your choices ${row.result ? balance(row.result) : "unknown"}`}>
      <rect class="base" x={Math.min(C, x(row.baseline ?? 0))} y="5" width={Math.abs(x(row.baseline ?? 0) - C)} height="12" rx="2" />
      {#if row.result}
        <rect class="range" x={Math.min(x(row.result.low), x(row.result.high))} y="25" width={Math.max(2, Math.abs(x(row.result.high) - x(row.result.low)))} height="12" rx="2" />
        <rect class="you" x={Math.min(C, x(near(row.result)))} y="25" width={Math.abs(x(near(row.result)) - C)} height="12" rx="2" />
      {/if}
      <line x1={C} x2={C} y1="1" y2="43" class="zero" />
    </svg>
    <div class="axis"><span>← shortfall</span><span>surplus →</span></div>
    <div class="legend"><span class="sw base"></span> Official forecast <span class="sw you"></span> With your choices <span class="sw range"></span> range</div>
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
  .strong {
    font-weight: 700;
  }
  .share {
    color: var(--muted);
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
    margin-left: 2px;
  }
  .bars {
    width: 100%;
    height: 44px;
  }
  .base {
    fill: var(--muted);
  }
  .you {
    fill: var(--money);
  }
  .range {
    fill: var(--money);
    opacity: 0.35;
  }
  .zero {
    stroke: var(--ink-2);
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
  }
  .axis {
    display: flex;
    justify-content: space-between;
    font-size: 0.7rem;
    color: var(--muted);
  }
  .legend {
    font-size: 0.72rem;
    color: var(--ink-2);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 6px;
  }
  .sw {
    display: inline-block;
    width: 12px;
    height: 8px;
    border-radius: 2px;
  }
  .sw.base {
    background: var(--muted);
  }
  .sw.you {
    background: var(--money);
  }
  .sw.range {
    background: var(--money);
    opacity: 0.35;
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
