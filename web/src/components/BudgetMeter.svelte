<script lang="ts">
  import { untrack } from "svelte";
  import type { Bridge, BridgeDomain, TrialResult } from "../lib/budgetTrial";
  import { date } from "../lib/format";
  import { budgetBase, gapLine, LANE_LABEL, pct, pctRange, signedRange, usd } from "../lib/measureChips";
  import { openDetail } from "../lib/ui.svelte";
  import BudgetBridge from "./BudgetBridge.svelte";

  /**
   * The running General Fund meter for one fiscal year: a percent-first line
   * (how much larger or smaller the gap gets, then forecast -> result) and the
   * bridge from the official forecast through each yes measure to the result.
   * One hue for the measures (--money), gray for the forecast and the result;
   * direction is shown by position and by words, never by arrows.
   *
   * `headline`: only the year buttons, the gap line and its fine print. The
   * trial summary draws the bridge full size (with its table) and the other
   * funds, so the meter above it doesn't draw them a second time.
   */
  let {
    result,
    bridge,
    domain,
    budgetRec,
    fy,
    onfy,
    headline = false,
  }: {
    result: TrialResult;
    bridge: Bridge | null;
    domain: BridgeDomain | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    budgetRec: Record<string, any> | null;
    fy: string | null;
    onfy: (fy: string) => void;
    /** Headline only (no bridge, no other-funds line): set while the trial summary, which shows both, is on screen. */
    headline?: boolean;
  } = $props();

  const row = $derived(result.generalFund.find((y) => y.fy === fy) ?? result.generalFund[0] ?? null);
  const line = $derived(row?.result && row.baseline !== null ? gapLine(row.fy, row.baseline, row.result) : null);

  /**
   * Every forecast year at once, each with its change: a vote can move later years only (a measure that starts in
   * FY2028-29 leaves FY2027-28 as it was), so the meter must never show one year alone. Selecting a year shows it
   * below and in the bridge.
   */
  const years = $derived(
    result.generalFund.map((y) => {
      const g = y.result && y.baseline !== null ? gapLine(y.fy, y.baseline, y.result) : null;
      return {
        fy: y.fy,
        text: !g ? "no forecast" : g.mode === "pct" ? (g.pct ?? "") : g.mode === "none" ? "no change" : "crosses $0",
        key: y.result ? `${y.result.low}:${y.result.high}` : "",
      };
    }),
  );
  /** Years whose numbers the last vote changed: highlighted for a moment, and announced ("changed"). */
  let changed = $state<Set<string>>(new Set());
  let prev = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const now = new Map(years.map((y) => [y.fy, y.key]));
    untrack(() => {
      const moved = [...now].filter(([fy, k]) => prev.has(fy) && prev.get(fy) !== k).map(([fy]) => fy);
      prev = now;
      if (!moved.length) return;
      changed = new Set(moved);
      clearTimeout(timer);
      timer = setTimeout(() => (changed = new Set()), 2400);
    });
  });
  $effect(() => () => clearTimeout(timer));
  /** The adopted budget the other lanes are compared with (percent first, dollars after). */
  const base = $derived(budgetBase(budgetRec));
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
      <div class="years" role="group" aria-label="Fiscal year">
        {#each years as y (y.fy)}
          <button class="yr" class:on={y.fy === row.fy} class:changed={changed.has(y.fy)} aria-pressed={y.fy === row.fy} onclick={() => onfy(y.fy)}
            ><span class="yfy num">FY{y.fy}</span><span class="ych">{y.text}</span>{#if changed.has(y.fy)}<span class="sr">changed</span>{/if}</button
          >
        {/each}
      </div>
    </div>
    {#if line}
      <!-- The % change leads; the dollars follow in plain text. -->
      <p class="gap num">
        {#if line.mode === "cross"}
          <span class="h">{line.head}:</span>
          <span>{line.from}</span>
          <button class="cite" onclick={forecastSource} aria-label="Forecast source">i</button>
          <span aria-label="to">→</span>
          <strong>{line.to}</strong>
          <span class="chg nw">({line.change})</span>
        {:else}
          <span class="h">{line.head}</span>
          {#if line.mode === "pct"}
            <abbr class="hero" title="Computed here: the change divided by the forecast amount">{line.pct}</abbr>
          {:else}
            <span class="hero">no change</span>
          {/if}
          <span class="dollars">
            {line.from}
            <button class="cite" onclick={forecastSource} aria-label="Forecast source">i</button>
            {#if line.mode === "pct"}<span class="nw"><span aria-label="to">→</span> {line.to}</span> <span class="nw">({line.change})</span>{/if}
          </span>
        {/if}
      </p>
    {/if}
    {#if bridge && domain && !headline}<BudgetBridge {bridge} {domain} compact />{/if}
    <p class="fine">The forecast doesn't include ballot measures; the city must adopt a balanced budget each year. The % is the change ÷ the forecast, computed here.</p>
  {:else}
    <p class="muted">No official budget forecast is recorded for this jurisdiction yet, so only the yearly amounts are added up below.</p>
    <dl class="lines">
      <dt>Your choices so far (General Fund)</dt>
      <dd class="num">{signedRange(result.perYearOnceInEffect.general_fund)} a year</dd>
    </dl>
  {/if}
  {#if !headline && (lanes.length || result.bonds.principal)}
    <p class="lanes">
      {#each lanes as { l, r } (l)}<span title={base?.total ? `Share of the City's whole FY${base.fy} budget, all funds (${usd(base.total)}), computed here` : undefined}
          >{LANE_LABEL[l]}
          {#if base?.total}<strong>{pctRange(r.low, r.high, base.total)} of all funds</strong> ({signedRange(r)}/yr){:else}{signedRange(r)}/yr{/if}</span
        >{/each}
      {#if result.bonds.principal}<span
          >Bonds {#if base?.total}<strong>{pct(result.bonds.principal / base.total)} of all funds</strong> ({usd(result.bonds.principal)}){:else}{usd(
              result.bonds.principal,
            )}{/if}{#if result.bonds.perHundredK}
            · ~${result.bonds.perHundredK.toFixed(2)}/yr per $100k assessed{/if}</span
        >{/if}
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
  .head {
    flex-wrap: wrap;
  }
  .years {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .yr {
    display: grid;
    gap: 1px;
    text-align: left;
    min-width: 0;
    padding: 4px 9px;
    border: 1px solid var(--line-strong);
    background: var(--surface);
    color: var(--ink-2);
    border-radius: 6px;
    cursor: pointer;
    font: inherit;
    transition: background-color 0.4s, border-color 0.4s;
  }
  .yr .yfy {
    font-weight: 600;
    font-size: 0.8rem;
  }
  .yr .ych {
    font-size: 0.75rem;
  }
  .yr.on {
    border-color: var(--ink);
    color: var(--ink);
    box-shadow: inset 0 0 0 1px var(--ink);
  }
  /* The last vote changed this year's numbers. */
  .yr.changed {
    background: var(--wash);
    border-color: var(--money);
  }
  @media (prefers-reduced-motion: reduce) {
    .yr {
      transition: none;
    }
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  /* Phones: the years share the row evenly, below the label. */
  @media (max-width: 560px) {
    .years {
      width: 100%;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
    }
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
  .gap .chg,
  .gap .dollars {
    color: var(--ink-2);
  }
  .gap .hero {
    font-size: 1.4rem;
    font-weight: 700;
    line-height: 1.2;
    color: var(--ink);
  }
  abbr {
    text-decoration: underline dotted;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
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
  /* Keep an amount, a range and its change whole on narrow screens (no "(−" left at a line end). */
  .nw {
    white-space: nowrap;
  }
</style>
