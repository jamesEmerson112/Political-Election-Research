<script lang="ts">
  import type { Bridge, BridgeDomain, MeasureInput, Range, TrialResult, Vote } from "../lib/budgetTrial";
  import { LANES } from "../lib/budgetTrial";
  import { MARK } from "../lib/marks";
  import { balance, gapShare, LANE_LABEL, pct, pctRange, signedRange, usd, type BudgetBase } from "../lib/measureChips";
  import { hideTip, showTip } from "../lib/ui.svelte";
  import BudgetBridge from "./BudgetBridge.svelte";
  import StanceMark from "./StanceMark.svelte";

  /**
   * The end of the trial: the bridge for the selected fiscal year (forecast,
   * each yes measure, result) with its table, the General Fund per fiscal
   * year (official forecast vs. with the visitor's choices, as a range), each
   * measure's share in ballot order (never sorted by size), the other lanes,
   * and everything the estimates leave out. One axis per chart; table views of
   * the same numbers.
   */
  let {
    result,
    measures,
    votes,
    titles,
    bridge,
    domain,
    base = null,
  }: {
    result: TrialResult;
    measures: MeasureInput[];
    votes: Record<string, Vote>;
    titles: Record<string, string>;
    bridge: Bridge | null;
    domain: BridgeDomain | null;
    /** The adopted budget the amounts are compared with (percent first, dollars after). */
    base?: BudgetBase | null;
  } = $props();
  const stepWord = (r: Range) => (r.low >= 0 ? "revenue or savings" : r.high <= 0 ? "cost" : "cost or revenue");

  // ---- chart geometry
  const W = 640;
  const H = 270;
  const M = { l: 64, r: 62, t: 34, b: 50 };
  const ys = $derived(
    result.generalFund.flatMap((y) => [y.baseline ?? 0, y.result?.low ?? 0, y.result?.high ?? 0]).concat([0]),
  );
  const yMin = $derived(Math.min(...ys));
  const yMax = $derived(Math.max(...ys));
  const pad = $derived((yMax - yMin || 1) * 0.12);
  const lo = $derived(yMin - pad);
  const hi = $derived(yMax + pad);
  const n = $derived(result.generalFund.length);
  const xAt = (i: number) => M.l + (n <= 1 ? (W - M.l - M.r) / 2 : (i * (W - M.l - M.r)) / (n - 1));
  const yAt = (v: number) => M.t + ((hi - v) / (hi - lo || 1)) * (H - M.t - M.b);
  /** Round gridlines (dollars on the left; the same lines as a share of the adopted General Fund on the right). */
  const yStep = $derived.by(() => {
    const raw = (hi - lo) / 4;
    const mag = 10 ** Math.floor(Math.log10(raw || 1));
    return ([1, 2, 2.5, 5, 10].map((m) => m * mag).find((st) => st >= raw) ?? 10 * mag) || 1;
  });
  const yTicks = $derived.by(() => {
    const out: number[] = [];
    for (let v = Math.ceil(lo / yStep) * yStep; v <= hi + 1e-6; v += yStep) out.push(Math.round(v));
    return out;
  });
  const gfPct = (v: number) => (base?.generalFund ? `${v < 0 ? "−" : ""}${((Math.abs(v) / base.generalFund) * 100).toFixed(1)}%` : "");
  const xAnchor = (i: number) => (n > 1 && i === n - 1 ? "end" : n > 1 && i === 0 ? "start" : "middle");
  const basePath = $derived(result.generalFund.map((y, i) => `${i ? "L" : "M"}${xAt(i)},${yAt(y.baseline ?? 0)}`).join(" "));
  const band = $derived(
    [
      ...result.generalFund.map((y, i) => `${xAt(i)},${yAt(y.result?.high ?? 0)}`),
      ...result.generalFund
        .map((y, i) => `${xAt(i)},${yAt(y.result?.low ?? 0)}`)
        .reverse(),
    ].join(" "),
  );
  const tip = (e: MouseEvent | FocusEvent, i: number) => {
    const y = result.generalFund[i]!;
    showTip(e, [`FY${y.fy}`, `Official forecast: ${balance({ low: y.baseline ?? 0, high: y.baseline ?? 0 })}`, `Your choices: ${signedRange(y.delta)}`, `With your choices: ${y.result ? balance(y.result) : "—"}`]);
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

  {#if bridge && domain}
    <figure class="panel chart">
      <figcaption class="eyebrow">General Fund bridge, FY{bridge.fy}: forecast, each Yes in ballot order, result</figcaption>
      <BudgetBridge {bridge} {domain} />
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
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Projected General Fund shortfall by fiscal year: the official forecast and the range with your choices. The same numbers are in the table below.">
        {#each yTicks as t (t)}
          <line class={t === 0 ? "zero" : "grid"} x1={M.l} x2={W - M.r} y1={yAt(t)} y2={yAt(t)} />
          <text class="tick" x={M.l - 6} y={yAt(t) + 4} text-anchor="end">{t === 0 ? "$0" : `${t < 0 ? "−" : ""}${usd(t)}`}</text>
          {#if base?.generalFund}<text class="tick" x={W - M.r + 6} y={yAt(t) + 4} text-anchor="start">{t === 0 ? "0%" : gfPct(t)}</text>{/if}
        {/each}
        {#if base?.generalFund}<text class="cap" x={W - 2} y="11" text-anchor="end">% of FY{base.fy} General Fund</text>{/if}
        <text class="cap" x="2" y="11">Dollars: $0 = balanced, below $0 = shortfall</text>
        <polygon class="band" points={band} />
        <path class="base" d={basePath} />
        {#each result.generalFund as y, i (y.fy)}
          <circle class="dot" cx={xAt(i)} cy={yAt(y.baseline ?? 0)} r="4" />
          <!-- The year's official shortfall on its point; under the band, how much your choices change it. -->
          {@const bandAbove = !!y.result && (y.result.low + y.result.high) / 2 > (y.baseline ?? 0)}
          <text
            class="val"
            x={xAt(i)}
            y={bandAbove ? yAt(Math.min(y.baseline ?? 0, y.result?.low ?? Infinity)) + 17 : yAt(Math.max(y.baseline ?? 0, y.result?.high ?? -Infinity)) - 9}
            text-anchor={xAnchor(i)}
            >{`${balance({ low: y.baseline ?? 0, high: y.baseline ?? 0 })}${base?.generalFund && y.baseline ? ` · ${gfPct(Math.abs(y.baseline))} of GF` : ""}`}</text
          >
          {#if y.result && y.baseline}
            <text class="chg" x={xAt(i)} y={H - 26} text-anchor={xAnchor(i)}
              >{gapShare(y.baseline, y.delta, "money") ?? ""}</text
            >
          {/if}
          <text class="tick" x={xAt(i)} y={H - 8} text-anchor={xAnchor(i)}>FY{y.fy}</text>
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <rect
            class="hit"
            x={xAt(i) - 28}
            y={M.t}
            width="56"
            height={H - M.t - M.b}
            onmouseenter={(e) => tip(e, i)}
            onmouseleave={hideTip}
          />
        {/each}
      </svg>
      <div class="legend">
        <span class="sw base"></span> Official forecast <span class="sw band"></span> With your choices (range)
        <span class="muted"
          >· The line falls because the official forecast's shortfall grows each year (costs rising faster than revenue, before these measures); your choices move each year by
          about the same amount, so the band runs alongside it. Above each year's name: how much your choices change that year's shortfall. The right axis is the left one as
          a share of the adopted General Fund, computed here.</span
        >
      </div>
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
      The city adopts a balanced budget each year; a projected shortfall is the gap the Mayor and Board must close with cuts, new revenue or reserves.
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
  .chart svg {
    width: 100%;
    max-width: 760px;
    height: auto;
  }
  .zero {
    stroke: var(--ink-2);
    stroke-width: 1.5;
  }
  .tick {
    font-size: 11px;
    fill: var(--muted);
  }
  .grid {
    stroke: var(--line);
    stroke-width: 1;
  }
  .cap {
    font-size: 10px;
    fill: var(--muted);
    letter-spacing: 0.03em;
  }
  .val {
    font-size: 11px;
    font-weight: 600;
    fill: var(--ink);
    paint-order: stroke;
    stroke: var(--surface);
    stroke-width: 3px;
  }
  .chg {
    font-size: 11px;
    fill: var(--ink-2);
    paint-order: stroke;
    stroke: var(--surface);
    stroke-width: 3px;
  }
  /* Phones: the chart is scaled down, so its labels would be unreadably small; the table below has the same numbers. */
  @media (max-width: 560px) {
    .val,
    .chg {
      display: none;
    }
  }
  .band {
    fill: var(--money);
    opacity: 0.45;
    stroke: var(--money);
    stroke-width: 1.5;
  }
  .base {
    fill: none;
    stroke: var(--muted);
    stroke-width: 2;
    stroke-dasharray: 5 4;
  }
  .dot {
    fill: var(--muted);
    stroke: var(--surface);
    stroke-width: 2;
  }
  .hit {
    fill: transparent;
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
    width: 14px;
    height: 8px;
    border-radius: 2px;
  }
  .sw.base {
    border-top: 2px dashed var(--muted);
    height: 0;
  }
  .sw.band {
    background: var(--money);
    opacity: 0.35;
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
