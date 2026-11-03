<script lang="ts">
  import type { BudgetInput, MeasureInput, Range, TrialResult, Vote } from "../lib/budgetTrial";
  import { LANES } from "../lib/budgetTrial";
  import { MARK } from "../lib/marks";
  import { balance, LANE_LABEL, signedRange, usd } from "../lib/measureChips";
  import { hideTip, showTip } from "../lib/ui.svelte";
  import StanceMark from "./StanceMark.svelte";

  /**
   * The end of the trial: the General Fund per fiscal year (official forecast
   * vs. with the visitor's choices, as a range), each measure's share in
   * ballot order (never sorted by size), the other lanes, and everything the
   * estimates leave out. One axis; a table view of the same numbers.
   */
  let {
    result,
    measures,
    votes,
    titles,
  }: { result: TrialResult; measures: MeasureInput[]; votes: Record<string, Vote>; budget: BudgetInput | null; titles: Record<string, string> } =
    $props();

  // ---- chart geometry
  const W = 640;
  const H = 220;
  const M = { l: 64, r: 40, t: 14, b: 28 };
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

  {#if n}
    <figure class="panel chart">
      <figcaption class="eyebrow">General Fund by fiscal year</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="General Fund by fiscal year: the official forecast and the range with your choices. The same numbers are in the table below.">
        <line class="zero" x1={M.l} x2={W - M.r} y1={yAt(0)} y2={yAt(0)} />
        <text class="tick" x={M.l - 6} y={yAt(0) + 4} text-anchor="end">$0</text>
        <text class="tick" x={M.l - 6} y={yAt(yMin) + 4} text-anchor="end">{yMin < 0 ? `−${usd(yMin)}` : usd(yMin)}</text>
        {#if yMax > 0}<text class="tick" x={M.l - 6} y={yAt(yMax) + 4} text-anchor="end">{usd(yMax)}</text>{/if}
        <polygon class="band" points={band} />
        <path class="base" d={basePath} />
        {#each result.generalFund as y, i (y.fy)}
          <circle class="dot" cx={xAt(i)} cy={yAt(y.baseline ?? 0)} r="4" />
          <text class="tick" x={xAt(i)} y={H - 8} text-anchor={n > 1 && i === n - 1 ? "end" : n > 1 && i === 0 ? "start" : "middle"}>FY{y.fy}</text>
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
      <div class="legend"><span class="sw base"></span> Official forecast <span class="sw band"></span> With your choices (range)</div>
    </figure>

    <div class="scroll-x"><table class="grid num">
      <thead><tr><th>FY</th><th>Forecast</th><th>Your choices</th><th>Result</th></tr></thead>
      <tbody>
        {#each result.generalFund as y (y.fy)}
          <tr><td>FY{y.fy}</td><td>{balance({ low: y.baseline ?? 0, high: y.baseline ?? 0 })}</td><td>{signedRange(y.delta)}</td><td>{y.result ? balance(y.result) : "—"}</td></tr>
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
            {#if g.low !== 0 || g.high !== 0}<span>General Fund {signedRange(g)}/yr</span>{/if}
            {#each otherOf(m.ref) as o (o.l)}<span>{LANE_LABEL[o.l]} {signedRange(o.r)}/yr</span>{/each}
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
        {#if r.low !== 0 || r.high !== 0}<li><strong>{LANE_LABEL[l]}:</strong> {signedRange(r)} a year once in effect</li>{/if}
      {/each}
      {#if result.bonds.principal}
        <li>
          <strong>Bonds:</strong> {usd(result.bonds.principal)} authorized{#if result.bonds.debtServiceTotal}, about {usd(result.bonds.debtServiceTotal)} in total
            debt service{/if}{#if result.bonds.perHundredK}; about ${result.bonds.perHundredK.toFixed(2)} a year per $100,000 of assessed value{/if}, paid
          from property taxes ({result.bonds.labels.join(", ")})
        </li>
      {/if}
      {#each result.oneTime as c (c.ref + c.effectId)}<li><strong>One-time ({c.label}):</strong> {signedRange(c.range)}{c.startFy ? ` in FY${c.startFy}` : ""}</li>{/each}
      {#each result.totals as c (c.ref + c.effectId)}<li><strong>Total over {c.years ?? "several"} years ({c.label}):</strong> {signedRange(c.range)}</li>{/each}
      {#each result.notEstimated as x (x.ref + x.text)}<li><strong>Not estimated ({x.label}):</strong> {x.text}</li>{/each}
      {#each result.conflicts as k (k.refs.join())}<li><strong>Only one can take effect:</strong> {k.labels.join(" and ")} compete; the totals use the range between them.</li>{/each}
      {#if result.startAssumed.length}<li><strong>Start year not stated ({result.startAssumed.join(", ")}):</strong> counted from the first forecast year.</li>{/if}
    </ul>
    <p class="note">
      The city adopts a balanced budget each year; a projected shortfall is the gap the Mayor and Board must close with cuts, new revenue or reserves.
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
  .band {
    fill: var(--money);
    opacity: 0.3;
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
