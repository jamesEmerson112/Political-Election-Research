<script lang="ts">
  import type { Bridge, BridgeDomain, MeasureInput, Range, TrialResult, Vote } from "../lib/budgetTrial";
  import { LANES } from "../lib/budgetTrial";
  import { MARK } from "../lib/marks";
  import { balance, gapShare, LANE_LABEL, pct, pctRange, signedRange, usd, usdRange, yearsNote, type BudgetBase, type YearRow } from "../lib/measureChips";
  import { hideTip, showTip } from "../lib/ui.svelte";
  import BudgetBridge from "./BudgetBridge.svelte";
  import StanceMark from "./StanceMark.svelte";

  /**
   * The end of the trial: what the General Fund and a shortfall are; the
   * bridge for the selected fiscal year (forecast, each yes measure, result)
   * with its table; the shortfall per fiscal year (official forecast next to
   * the visitor's choices, as bars from $0, with a sentence saying which is
   * which); each measure's share in ballot order (never sorted by size); the
   * other lanes; and everything the estimates leave out. One axis per chart,
   * never zoomed; table views of the same numbers.
   */
  let {
    result,
    measures,
    votes,
    titles,
    bridge,
    domain,
    base = null,
    cumulative = false,
    onfy,
  }: {
    result: TrialResult;
    measures: MeasureInput[];
    votes: Record<string, Vote>;
    titles: Record<string, string>;
    bridge: Bridge | null;
    domain: BridgeDomain | null;
    /** The adopted budget the amounts are compared with (percent first, dollars after). */
    base?: BudgetBase | null;
    /** The forecast carries earlier years' gaps forward (the budget record's `forecast.cumulative`), so the years don't add up. */
    cumulative?: boolean;
    /** Show another fiscal year in the bridge (the per-year chart's years are selectable). */
    onfy?: (fy: string) => void;
  } = $props();
  const stepWord = (r: Range) => (r.low >= 0 ? "revenue or savings" : r.high <= 0 ? "cost" : "cost or revenue");

  // ---- the shortfall per fiscal year: two bars a year from $0 (the official forecast, then with your choices), a larger shortfall taller
  const years = $derived(result.generalFund);
  const n = $derived(years.length);
  const selFy = $derived(bridge?.fy ?? null);
  const note = $derived(yearsNote(years, cumulative));
  let cw = $state(0);
  const narrow = $derived(cw < 560);
  const H = $derived(narrow ? 220 : 260);
  const ml = $derived(narrow ? 50 : 62);
  const mr = $derived(base?.generalFund ? (narrow ? 44 : 54) : 12);
  const gw = $derived((cw - ml - mr) / Math.max(1, n));
  /** Each year's change and amounts sit above its bars when there is room; otherwise they are in the sentence, the tooltip and the table. */
  const labels = $derived(gw >= 150);
  const mt = $derived(labels ? 50 : 14);
  const mb = 26;
  /** Plotted value: the shortfall, the negative of the General Fund balance (a surplus would go below $0). */
  const sf = (v: number) => -v;
  const ps = $derived(years.flatMap((y) => [y.baseline ?? 0, y.result?.low ?? 0, y.result?.high ?? 0]).map(sf).concat([0]));
  const pMin = $derived(Math.min(...ps));
  const pMax = $derived(Math.max(...ps));
  /** Round gridlines (dollars on the left; the same lines as a share of the adopted General Fund on the right). */
  const yStep = $derived.by(() => {
    const raw = (pMax - pMin) / (narrow ? 4 : 5);
    const mag = 10 ** Math.floor(Math.log10(raw || 1));
    return ([1, 2, 2.5, 5, 10].map((m) => m * mag).find((st) => st >= raw) ?? 10 * mag) || 1;
  });
  const lo = $derived(Math.floor(pMin / yStep) * yStep);
  const hi = $derived(Math.max(yStep, Math.ceil((pMax + (pMax - pMin) * 0.03) / yStep) * yStep));
  const yAt = (p: number) => mt + ((hi - p) / (hi - lo || 1)) * (H - mt - mb);
  const yTicks = $derived.by(() => {
    const out: number[] = [];
    for (let p = lo; p <= hi + 1e-6; p += yStep) out.push(Math.round(p) || 0);
    return out;
  });
  const cx = (i: number) => ml + gw * (i + 0.5);
  const bw = $derived(Math.max(10, Math.min(46, gw * 0.3)));
  const gfShare = (p: number) => (base?.generalFund ? `${((Math.abs(p) / base.generalFund) * 100).toFixed(1)}%` : "");
  interface Bar {
    x: number;
    y: number;
    h: number;
    light: boolean;
  }
  /** A bar from a to b (plotted units), at least 2px tall. */
  const bar = (x: number, a: number, b: number, light = false): Bar => {
    const ya = yAt(a);
    const yb = yAt(b);
    return { x, y: Math.min(ya, yb) - (Math.abs(yb - ya) < 2 ? 1 : 0), h: Math.max(2, Math.abs(yb - ya)), light };
  };
  /** The forecast bar (left) and the with-your-choices bar (right, 2px apart): solid from $0 to the nearer end of the range, lighter for the rest, as in the bridge. */
  function barsOf(y: YearRow, i: number): { forecast: Bar | null; mine: Bar[] } {
    if (y.baseline === null) return { forecast: null, mine: [] };
    const forecast = bar(cx(i) - 1 - bw, 0, sf(y.baseline));
    if (!y.result) return { forecast, mine: [] };
    const a = sf(y.result.high);
    const b = sf(y.result.low);
    const xr = cx(i) + 1;
    if (a < 0 && b > 0) return { forecast, mine: [bar(xr, a, b, true)] };
    const [near, far] = Math.abs(a) <= Math.abs(b) ? [a, b] : [b, a];
    return { forecast, mine: far === near ? [bar(xr, 0, near)] : [bar(xr, 0, near), bar(xr, near, far, true)] };
  }
  const side = (v: number) => (v < 0 ? "Shortfall" : "Surplus");
  const changeText = (y: YearRow) => (y.result && y.baseline ? (gapShare(y.baseline, y.delta, "money") ?? "") : "");
  const amountsText = (y: YearRow) => {
    if (!y.result || y.baseline === null) return "";
    const same = (y.baseline < 0 && y.result.high <= 0) || (y.baseline > 0 && y.result.low >= 0);
    return same ? `${usd(y.baseline)} → ${usdRange(y.result.low, y.result.high)}` : "";
  };
  const tipLines = (y: YearRow) => [
    `FY${y.fy}${y.fy === selFy ? " · in the bridge above" : ""}`,
    `Official forecast: ${y.baseline === null ? "—" : balance({ low: y.baseline, high: y.baseline })}${y.baseline && base?.generalFund ? ` (${gfShare(y.baseline)} of the General Fund)` : ""}`,
    `Your choices: ${signedRange(y.delta)} a year`,
    `With your choices: ${y.result ? balance(y.result) : "—"}`,
    ...(changeText(y) && y.baseline ? [`${side(y.baseline)} ${changeText(y)} (share computed here)`] : []),
  ];
  const yearLabel = (y: YearRow) =>
    `FY${y.fy}: official forecast ${y.baseline === null ? "not given" : balance({ low: y.baseline, high: y.baseline })}; with your choices ${y.result ? balance(y.result) : "not given"}`;
  const pickKey = (e: KeyboardEvent, fy: string) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    onfy?.(fy);
  };

  // ---- per measure (ballot order)
  const sum = (rs: Range[]) => rs.reduce((a, r) => ({ low: a.low + r.low, high: a.high + r.high }), { low: 0, high: 0 });
  const gfOf = (ref: string) => sum(result.contributions.filter((c) => c.ref === ref && c.lane === "general_fund").map((c) => c.range));
  const otherOf = (ref: string) =>
    LANES.filter((l) => l !== "general_fund")
      .map((l) => ({ l, r: sum(result.contributions.filter((c) => c.ref === ref && c.lane === l).map((c) => c.range)) }))
      .filter(({ r }) => r.low !== 0 || r.high !== 0);
  const voteLabel: Record<Vote, string> = { yes: "Yes", no: "No", skip: "Skipped" };
</script>

<section class="section">
  <div class="section-head">
    <h2>Your trial ballot: budget effects</h2>
    <p>If every choice you made became law, using the official estimates. Ranges stay ranges; nothing here says how to vote.</p>
  </div>

  <p class="gf">
    <strong>The General Fund</strong> is the city's main account and its most flexible money, not tied to one purpose{#if base?.generalFund && base?.total}: {usd(
        base.generalFund,
      )} of the {usd(base.total)} adopted for FY{base.fy}, all funds{/if}. <strong>A shortfall</strong> is the official forecast's gap for a coming year: how much General
    Fund costs would exceed its revenue if nothing changed. The city must adopt a balanced budget every year, so each gap is closed before the year starts, with cuts, new
    revenue or reserves; the forecast doesn't say which.
  </p>

  {#if bridge && domain}
    <figure class="panel chart">
      <figcaption class="eyebrow">General Fund bridge, FY{bridge.fy}: forecast, each Yes in ballot order, result</figcaption>
      <BudgetBridge {bridge} {domain} />
      <p class="link-note">
        One year, step by step: its Forecast and Result are FY{bridge.fy}'s two bars in the chart below{#if onfy && n > 1}; select another year there to show it here{/if}.
      </p>
    </figure>
    <div class="scroll-x"><table class="grid num steps">
      <caption>The bridge as a table: General Fund, FY{bridge.fy}, a year</caption>
      <thead><tr><th>Step</th><th>Change (share of the forecast gap, then dollars)</th><th>Running total</th></tr></thead>
      <tbody>
        {#each bridge.steps as s, k (k)}
          <tr>
            <td>{s.kind === "start" ? "Official forecast" : s.kind === "end" ? "With your choices" : s.label}{#if s.exclusive}<span class="muted">{" "}(only one can take effect)</span>{/if}</td>
            <td
              >{#if s.kind === "measure"}<strong>{gapShare(bridge.baseline, s.delta, "money") ?? ""}</strong> {signedRange(s.delta)}
                <span class="muted">{stepWord(s.delta)}</span>{:else if s.kind === "end"}{@const d = { low: bridge.result.low - bridge.baseline, high: bridge.result.high - bridge.baseline }}<strong
                  >{gapShare(bridge.baseline, d, "money") ?? ""}</strong
                >
                {signedRange(d)}{:else}—{/if}</td
            >
            <td>{balance(s.after)}</td>
          </tr>
        {/each}
      </tbody>
    </table></div>
  {/if}

  {#if n}
    <figure class="panel chart">
      <figcaption class="eyebrow">Projected General Fund shortfall, by fiscal year</figcaption>
      {#if note}<p class="lead">{note}</p>{/if}
      <div class="caps">
        <span>Shortfall in dollars ($0 = balanced{pMin < 0 ? "; below $0 = surplus" : ""})</span>
        {#if base?.generalFund}<span>% of the FY{base.fy} General Fund</span>{/if}
      </div>
      <div class="yplot" bind:clientWidth={cw}>
        {#if cw > 0}
          <svg
            width={cw}
            height={H}
            viewBox={`0 0 ${cw} ${H}`}
            role="img"
            aria-label="Projected General Fund shortfall by fiscal year: the official forecast next to the range with your choices, as bars from $0. The same numbers are in the table below."
          >
            {#each years as y, i (y.fy)}
              {#if y.fy === selFy && n > 1}<rect class="sel" x={cx(i) - gw / 2 + 3} y="1" width={gw - 6} height={H - 2} rx="6" />{/if}
            {/each}
            {#each yTicks as t (t)}
              <line class={t === 0 ? "zero" : "grid"} x1={ml} x2={cw - mr} y1={yAt(t)} y2={yAt(t)} />
              <text class="tick" x={ml - 6} y={yAt(t) + 4} text-anchor="end">{t === 0 ? "$0" : usd(t)}</text>
              {#if base?.generalFund}<text class="tick" x={cw - mr + 6} y={yAt(t) + 4}>{t === 0 ? "0%" : gfShare(t)}</text>{/if}
            {/each}
            {#each years as y, i (y.fy)}
              {@const b = barsOf(y, i)}
              {#if b.forecast}<rect class="fc" x={b.forecast.x} y={b.forecast.y} width={bw} height={b.forecast.h} rx="2" />{/if}
              {#each b.mine as m, j (j)}<rect class="mine" class:light={m.light} x={m.x} y={m.y} width={bw} height={m.h} rx="2" />{/each}
              {#if labels}
                <text class="chg" x={cx(i)} y="17" text-anchor="middle">{changeText(y)}</text>
                <text class="amt" x={cx(i)} y="33" text-anchor="middle">{amountsText(y)}</text>
              {/if}
              <text class="tick" class:on={y.fy === selFy && n > 1} x={cx(i)} y={H - 8} text-anchor="middle">FY{y.fy}</text>
            {/each}
            {#each years as y, i (y.fy)}
              {#if onfy && n > 1}
                <rect
                  class="hit"
                  role="button"
                  tabindex="0"
                  aria-pressed={y.fy === selFy}
                  aria-label={`${yearLabel(y)}. Show this year in the bridge above.`}
                  x={cx(i) - gw / 2}
                  y="0"
                  width={gw}
                  height={H}
                  onclick={() => onfy(y.fy)}
                  onkeydown={(e) => pickKey(e, y.fy)}
                  onmouseenter={(e) => showTip(e, tipLines(y))}
                  onmouseleave={hideTip}
                  onfocus={(e) => showTip(e, tipLines(y))}
                  onblur={hideTip}
                />
              {:else}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <rect class="hit" x={cx(i) - gw / 2} y="0" width={gw} height={H} onmouseenter={(e) => showTip(e, tipLines(y))} onmouseleave={hideTip} />
              {/if}
            {/each}
          </svg>
        {/if}
      </div>
      <div class="legend">
        <span><span class="sw fc"></span>Official forecast, before these measures</span>
        <span><span class="sw mine"></span><span class="sw mine light"></span>With your choices (lighter: the rest of the range)</span>
      </div>
      <p class="fine">
        Taller = a larger shortfall.{#if labels}{" "}Above each year: how much your choices change that year's shortfall, then forecast → with your choices.{/if}{#if base?.generalFund}{" "}The
          right axis is the left one as a share of the adopted FY{base.fy} General Fund, computed here.{/if}{#if onfy && selFy && n > 1}{" "}Shaded: FY{selFy}, the year in the
          bridge above; select a year to show it there.{/if}
      </p>
    </figure>

    <div class="scroll-x"><table class="grid num">
      <thead><tr><th>FY</th><th>Gap</th><th>Forecast</th><th>Your choices</th><th>Result</th></tr></thead>
      <tbody>
        {#each result.generalFund as y (y.fy)}
          <tr
            ><td>FY{y.fy}</td><td><strong>{y.result && y.baseline !== null ? (gapShare(y.baseline, y.delta, "money") ?? "no change") : "—"}</strong></td><td
              >{balance({ low: y.baseline ?? 0, high: y.baseline ?? 0 })}</td
            ><td>{signedRange(y.delta)}</td><td>{y.result ? balance(y.result) : "—"}</td></tr>
        {/each}
      </tbody>
    </table></div>
  {/if}

  <div class="panel list">
    <h3 class="eyebrow">Each measure, in ballot order</h3>
    {#each measures as m (m.ref)}
      {@const v = votes[m.ref]}
      <div class="mrow">
        <span class="vote">
          {#if v === "yes"}<StanceMark mark={MARK["support"]!} />{:else if v === "no"}<StanceMark mark={MARK["oppose"]!} />{:else}<StanceMark mark={MARK["unresearched"]!} />{/if}
          {v ? voteLabel[v] : "Not answered"}
        </span>
        <span class="what"><strong>{m.label}</strong> {titles[m.ref] ?? ""}</span>
        <span class="eff num">
          {#if v === "yes"}
            {@const g = gfOf(m.ref)}
            {#if g.low !== 0 || g.high !== 0}<span
                >General Fund {#if base?.generalFund}<strong>{pctRange(g.low, g.high, base.generalFund)}</strong> ({signedRange(g)}/yr){:else}{signedRange(g)}/yr{/if}</span
              >{/if}
            {#each otherOf(m.ref) as o (o.l)}<span
                >{LANE_LABEL[o.l]} {#if base?.total}<strong>{pctRange(o.r.low, o.r.high, base.total)} of all funds</strong> ({signedRange(o.r)}/yr){:else}{signedRange(o.r)}/yr{/if}</span
              >{/each}
            {#if result.notEstimated.some((x) => x.ref === m.ref)}<span class="muted">not estimated</span>{/if}
            {#if result.minimal.some((x) => x.ref === m.ref)}<span class="muted">minimal or no cost</span>{/if}
          {:else}
            <span class="muted">no change</span>
          {/if}
        </span>
      </div>
    {/each}
  </div>

  <div class="panel list">
    <h3 class="eyebrow">Outside the General Fund, and what the estimates leave out</h3>
    <ul>
      {#each LANES.filter((l) => l !== "general_fund") as l (l)}
        {@const r = result.perYearOnceInEffect[l]}
        {#if r.low !== 0 || r.high !== 0}<li>
            <strong>{LANE_LABEL[l]}:</strong>
            {#if base?.total}<strong>{pctRange(r.low, r.high, base.total)} of all funds</strong> ({signedRange(r)} a year once in effect){:else}{signedRange(r)} a year once in effect{/if}
          </li>{/if}
      {/each}
      {#if result.bonds.principal}
        <li>
          <strong>Bonds:</strong> {#if base?.total}<strong>{pct(result.bonds.principal / base.total)} of all funds</strong> ({usd(result.bonds.principal)}){:else}{usd(
            result.bonds.principal,
          )}{/if} authorized{#if result.bonds.debtServiceTotal}, about {usd(result.bonds.debtServiceTotal)} in total
            debt service{/if}{#if result.bonds.perHundredK}; about ${result.bonds.perHundredK.toFixed(2)} a year per $100,000 of assessed value{/if}, paid
          from property taxes ({result.bonds.labels.join(", ")})
        </li>
      {/if}
      {#each result.oneTime as c (c.ref + c.effectId)}<li><strong>One-time ({c.label}):</strong> {signedRange(c.range)}{c.startFy ? ` in FY${c.startFy}` : ""}</li>{/each}
      {#each result.totals as c (c.ref + c.effectId)}<li><strong>Total over {c.years ?? "several"} years ({c.label}):</strong> {signedRange(c.range)}</li>{/each}
      {#each result.notEstimated as x (x.ref + x.text)}<li><strong>Not estimated ({x.label}):</strong> {x.text}</li>{/each}
      {#each result.conflicts as k (k.refs.join())}<li><strong>Only some can take effect:</strong> {k.labels.join(", ")} compete; the totals span the possible outcomes.</li>{/each}
      {#each result.overlaps as k (k.refs.join())}<li><strong>Partly overlapping:</strong> {k.labels.join(" and ")} both take effect, and one prevails where they conflict; their estimates are added, and may overlap.</li>{/each}
      {#if result.startAssumed.length}<li><strong>Start year not stated ({result.startAssumed.join(", ")}):</strong> counted from the first forecast year.</li>{/if}
    </ul>
    <p class="note">
      Percentages are computed here, to show how big each amount is: a step as a share of the forecast gap; General Fund amounts as a share of the adopted
      FY{base?.fy ?? ""} General Fund; other funds and bonds as a share of the whole adopted budget, all funds.
      The forecast doesn't include these measures. Amounts are the official estimates as published; this page only adds them up.
    </p>
  </div>
</section>

<style>
  .chart {
    padding: 10px 12px;
    margin: 0;
    display: grid;
    gap: 6px;
  }
  .gf,
  .lead {
    margin: 0;
    font-size: var(--step--1);
    color: var(--ink-2);
    max-width: 75ch;
  }
  .lead {
    color: var(--ink);
  }
  .link-note,
  .fine {
    margin: 0;
    font-size: 0.75rem;
    color: var(--ink-2);
  }
  .caps {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 2px 12px;
    font-size: 0.7rem;
    color: var(--muted);
  }
  .yplot {
    min-width: 0;
    width: 100%;
    max-width: 820px;
  }
  .yplot svg {
    display: block;
    overflow: visible;
  }
  .zero {
    stroke: var(--ink-2);
    stroke-width: 1.5;
  }
  .tick {
    font-size: 11px;
    fill: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .tick.on {
    fill: var(--ink);
    font-weight: 700;
  }
  .grid {
    stroke: var(--line);
    stroke-width: 1;
  }
  .sel {
    fill: var(--ink);
    opacity: 0.06;
  }
  .fc {
    fill: var(--muted);
  }
  .mine {
    fill: var(--money);
  }
  .light {
    opacity: 0.38;
  }
  .chg {
    font-size: 12px;
    font-weight: 700;
    fill: var(--ink);
  }
  .amt {
    font-size: 11px;
    fill: var(--ink-2);
    font-variant-numeric: tabular-nums;
  }
  .hit {
    fill: transparent;
    cursor: pointer;
  }
  .hit:focus-visible {
    outline: none;
    stroke: var(--ink);
    stroke-width: 2;
  }
  .legend {
    font-size: 0.72rem;
    color: var(--ink-2);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 12px;
  }
  .sw {
    display: inline-block;
    width: 14px;
    height: 8px;
    border-radius: 2px;
  }
  .legend > span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .sw.fc {
    background: var(--muted);
  }
  .sw.mine {
    background: var(--money);
  }
  .sw.light {
    opacity: 0.38;
  }
  table.grid {
    font-size: var(--step--1);
  }
  caption {
    text-align: left;
    font-size: 0.75rem;
    color: var(--ink-2);
    padding: 0 0 4px;
  }
  @media (max-width: 560px) {
    .steps th,
    .steps td {
      padding: 6px 6px;
    }
  }
  .list {
    padding: 10px 14px;
    display: grid;
    gap: 6px;
  }
  .mrow {
    display: grid;
    grid-template-columns: minmax(0, 7.5rem) minmax(0, 1fr) minmax(0, 1fr);
    gap: 4px 10px;
    align-items: baseline;
    border-top: 1px solid var(--line);
    padding-top: 6px;
    font-size: var(--step--1);
  }
  .vote {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .what,
  .eff {
    overflow-wrap: anywhere;
  }
  .eff {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 10px;
    justify-content: flex-end;
  }
  ul {
    margin: 0;
    padding-left: 18px;
    font-size: var(--step--1);
    display: grid;
    gap: 4px;
  }
  .note {
    color: var(--ink-2);
    font-size: var(--step--1);
  }
  @media (max-width: 560px) {
    .mrow {
      grid-template-columns: minmax(0, 1fr);
    }
    .eff {
      justify-content: flex-start;
    }
  }
</style>
