<script lang="ts">
  import type { Bridge, BridgeDomain, MeasureInput, Range, TrialResult, Vote } from "../lib/budgetTrial";
  import { LANES } from "../lib/budgetTrial";
  import { MARK } from "../lib/marks";
  import { balance, gapShare, LANE_LABEL, pct, pctRange, signedRange, usd, usdRange, yearsNote, type BudgetBase, type YearRow } from "../lib/measureChips";
  import { hideTip, showTip } from "../lib/ui.svelte";
  import type { CountStatus } from "../lib/results";
  import { ANSWER_WORDS, type TrialWords } from "../lib/trialWords";
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
    gov = "city",
    words = ANSWER_WORDS,
    status = null,
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
    /** Whose budget it is, for the wording: "city" (San Francisco) or "state" (California). */
    gov?: "city" | "state";
    /** Whose ballot: the visitor's answers (default) or the recorded count. */
    words?: TrialWords;
    /** The count: each measure's result word ("Yes ahead", "Passed" …), shown instead of the visitor's vote. */
    status?: Record<string, CountStatus> | null;
  } = $props();
  const stepWord = (r: Range) => (r.low >= 0 ? "revenue or savings" : r.high <= 0 ? "cost" : "cost or revenue");

  // ---- the General Fund per fiscal year, as its balance ($0 = balanced, below $0 = a shortfall):
  //      the official forecast (dashed line) and the range with your choices (band, red below $0)
  const years = $derived(result.generalFund);
  const n = $derived(years.length);
  const selFy = $derived(bridge?.fy ?? null);
  const note = $derived(yearsNote(years, cumulative, words));
  const uid = $props.id();
  let cw = $state(0);
  const narrow = $derived(cw < 560);
  const H = $derived(narrow ? 240 : 280);
  const ml = $derived(narrow ? 50 : 64);
  const mr = $derived(base?.generalFund ? (narrow ? 50 : 62) : 14);
  /** Width per year (never negative, also while the panel is still being measured). */
  const gw = $derived(Math.max(0, (cw - ml - mr) / Math.max(1, n)));
  /** Point labels and each year's change fit when the years are far enough apart; otherwise they are in the sentence, the tooltip and the table. */
  const labels = $derived(gw >= 150);
  const mt = 8;
  const mb = $derived(labels ? 50 : 26);
  const ys = $derived(years.flatMap((y) => [y.baseline ?? 0, y.result?.low ?? 0, y.result?.high ?? 0]).concat([0]));
  const yMin = $derived(Math.min(...ys));
  const yMax = $derived(Math.max(...ys));
  const pad = $derived((yMax - yMin || 1) * 0.12);
  const lo = $derived(yMin - pad);
  const hi = $derived(yMax + pad);
  const cx = (i: number) => ml + gw * (i + 0.5);
  const yAt = (v: number) => mt + ((hi - v) / (hi - lo || 1)) * (H - mt - mb);
  /** Round gridlines (dollars on the left; the same lines as a share of the adopted General Fund on the right). */
  const yStep = $derived.by(() => {
    const raw = (hi - lo) / 4;
    const mag = 10 ** Math.floor(Math.log10(raw || 1));
    return ([1, 2, 2.5, 5, 10].map((m) => m * mag).find((st) => st >= raw) ?? 10 * mag) || 1;
  });
  const yTicks = $derived.by(() => {
    const out: number[] = [];
    for (let v = Math.ceil(lo / yStep) * yStep; v <= hi + 1e-6; v += yStep) out.push(Math.round(v) || 0);
    return out;
  });
  const gfPct = (v: number) => (base?.generalFund ? `${v < 0 ? "−" : ""}${((Math.abs(v) / base.generalFund) * 100).toFixed(1)}%` : "");
  const basePath = $derived(years.map((y, i) => `${i ? "L" : "M"}${cx(i)},${yAt(y.baseline ?? 0)}`).join(" "));
  /** The band through each year's range; a single year gets a short bar so it stays visible. */
  const band = $derived.by(() => {
    const half = n === 1 ? 12 : 0;
    const top = years.flatMap((y, i) => (half ? [`${cx(i) - half},${yAt(y.result?.high ?? 0)}`, `${cx(i) + half},${yAt(y.result?.high ?? 0)}`] : [`${cx(i)},${yAt(y.result?.high ?? 0)}`]));
    const bottom = years.flatMap((y, i) => (half ? [`${cx(i) - half},${yAt(y.result?.low ?? 0)}`, `${cx(i) + half},${yAt(y.result?.low ?? 0)}`] : [`${cx(i)},${yAt(y.result?.low ?? 0)}`]));
    return [...top, ...bottom.reverse()].join(" ");
  });
  /** Any part of the band above $0 (a surplus) is drawn in --money instead of red. */
  const surplus = $derived(years.some((y) => (y.result?.high ?? 0) > 0));
  const side = (v: number) => (v < 0 ? "Shortfall" : "Surplus");
  const changeText = (y: YearRow) => (y.result && y.baseline ? (gapShare(y.baseline, y.delta, "money") ?? "") : "");
  const pointText = (y: YearRow) =>
    y.baseline === null ? "" : `${balance({ low: y.baseline, high: y.baseline })}${base?.generalFund && y.baseline ? ` · ${gfPct(Math.abs(y.baseline))} of GF` : ""}`;
  const tipLines = (y: YearRow) => [
    `FY${y.fy}${y.fy === selFy ? " · in the bridge above" : ""}`,
    `Official forecast: ${y.baseline === null ? "—" : balance({ low: y.baseline, high: y.baseline })}${y.baseline && base?.generalFund ? ` (${gfPct(Math.abs(y.baseline))} of the General Fund)` : ""}`,
    `${words.column}: ${signedRange(y.delta)} a year`,
    `${words.withIt}: ${y.result ? balance(y.result) : "—"}`,
    ...(changeText(y) && y.baseline ? [`${side(y.baseline)} ${changeText(y)} (share computed here)`] : []),
    ...(y.result && y.result.high < 0 ? [`Still to close for a balanced General Fund ($0): ${usdRange(-y.result.high, -y.result.low)}`] : []),
  ];
  const yearLabel = (y: YearRow) =>
    `FY${y.fy}: official forecast ${y.baseline === null ? "not given" : balance({ low: y.baseline, high: y.baseline })}; ${words.withLower} ${y.result ? balance(y.result) : "not given"}`;
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
    <h2>{words.heading}</h2>
    <p>{words.intro}</p>
  </div>

  <p class="gf">
    <strong>The General Fund</strong> is the {gov}'s main account and its most flexible money, not tied to one purpose{#if base?.generalFund && base?.total}: {usd(
        base.generalFund,
      )} of the {usd(base.total)} adopted for FY{base.fy}, {base.totalLabel}{/if}. <strong>A shortfall</strong> is the official forecast's gap for a coming year: how much
    General Fund costs would exceed its revenue if nothing changed. The {gov} must adopt a balanced budget every year, so each gap is closed before the year starts, with cuts,
    new revenue or reserves; the forecast doesn't say which.
  </p>

  {#if bridge && domain}
    <figure class="panel chart">
      <figcaption class="eyebrow">General Fund bridge, FY{bridge.fy}: forecast, each Yes in ballot order, result</figcaption>
      <BudgetBridge {bridge} {domain} {words} />
      <p class="link-note">
        One year, step by step: its Forecast and Result are FY{bridge.fy}'s dashed-line point and band in the chart below{#if onfy && n > 1}; select another year there to show
          it here{/if}.
      </p>
    </figure>
    <div class="scroll-x"><table class="grid num steps">
      <caption>The bridge as a table: General Fund, FY{bridge.fy}, a year</caption>
      <thead><tr><th>Step</th><th>Change (share of the forecast gap, then dollars)</th><th>Running total</th></tr></thead>
      <tbody>
        {#each bridge.steps as s, k (k)}
          <tr>
            <td>{s.kind === "start" ? "Official forecast" : s.kind === "end" ? words.withIt : s.label}{#if s.exclusive}<span class="muted">{" "}(only one can take effect)</span>{/if}</td>
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
        <span>Dollars: $0 = balanced, below $0 = shortfall</span>
        {#if base?.generalFund}<span>% of the FY{base.fy} General Fund</span>{/if}
      </div>
      <div class="yplot" bind:clientWidth={cw}>
        {#if cw > 0}
          <svg
            width={cw}
            height={H}
            viewBox={`0 0 ${cw} ${H}`}
            role="img"
            aria-label={`Projected General Fund by fiscal year: the official forecast and the range ${words.withLower}, below $0 where there is a shortfall. The same numbers are in the table below.`}
          >
            <defs>
              <clipPath id={`${uid}-below`}><rect x="0" y={yAt(0)} width={cw} height={Math.max(0, H - yAt(0))} /></clipPath>
              <clipPath id={`${uid}-above`}><rect x="0" y="0" width={cw} height={Math.max(0, yAt(0))} /></clipPath>
            </defs>
            {#each years as y, i (y.fy)}
              {#if y.fy === selFy && n > 1}<rect class="sel" x={cx(i) - gw / 2 + 3} y="1" width={Math.max(0, gw - 6)} height={H - 2} rx="6" />{/if}
            {/each}
            {#each yTicks as t (t)}
              <line class={t === 0 ? "zero" : "grid"} x1={ml} x2={cw - mr} y1={yAt(t)} y2={yAt(t)} />
              <text class="tick" x={ml - 6} y={yAt(t) + 4} text-anchor="end">{t === 0 ? "$0" : `${t < 0 ? "−" : ""}${usd(t)}`}</text>
              {#if base?.generalFund}<text class="tick" x={cw - mr + 6} y={yAt(t) + 4}>{t === 0 ? "0%" : gfPct(t)}</text>{/if}
            {/each}
            <!-- The mark: a year whose band reached this line would have no shortfall. -->
            <text class="mark" x={ml + 4} y={yAt(0) - 6}>Balanced: $0 shortfall</text>
            <polygon class="band short" points={band} clip-path={`url(#${uid}-below)`} />
            {#if surplus}<polygon class="band surp" points={band} clip-path={`url(#${uid}-above)`} />{/if}
            <path class="base" d={basePath} />
            {#each years as y, i (y.fy)}
              {#if y.baseline !== null}<circle class="dot" cx={cx(i)} cy={yAt(y.baseline)} r="4" />{/if}
              {#if labels && y.baseline !== null}
                <!-- The year's official forecast on its point, on the side away from the band. -->
                {@const bandAbove = !!y.result && (y.result.low + y.result.high) / 2 > y.baseline}
                <text
                  class="val"
                  x={cx(i)}
                  y={bandAbove ? yAt(Math.min(y.baseline, y.result?.low ?? Infinity)) + 25 : yAt(Math.max(y.baseline, y.result?.high ?? -Infinity)) - 13}
                  text-anchor="middle">{pointText(y)}</text
                >
              {/if}
              {#if labels && changeText(y)}<text class="chg" x={cx(i)} y={H - 26} text-anchor="middle">{changeText(y)}</text>{/if}
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
        <span><span class="sw base"></span>Official forecast, before these measures</span>
        <span><span class="sw short"></span>{words.withIt} (range){surplus ? ", below $0" : ""}</span>
        {#if surplus}<span><span class="sw surp"></span>{words.withIt}, above $0 (a surplus)</span>{/if}
      </div>
      <p class="fine">
        Red marks a shortfall: below $0, General Fund costs would exceed its revenue. It shows the sign of the balance, not a judgment of {words.judgment}. The line at $0 is
        balanced: a year whose band reached it would have no shortfall. The slope comes from the official forecast; what {words.changes} is the distance between the
        dashed line and the band.{#if labels}{" "}Above each year's name: how much {words.changes} that year's shortfall.{/if}{#if base?.generalFund}{" "}The right axis is
          the left one as a share of the adopted FY{base.fy} General Fund, computed here.{/if}{#if onfy && selFy && n > 1}{" "}Shaded: FY{selFy}, the year in the bridge
          above; select a year to show it there.{/if}
      </p>
    </figure>

    <div class="scroll-x"><table class="grid num">
      <thead><tr><th>FY</th><th>Gap</th><th>Forecast</th><th>{words.column}</th><th>Result</th></tr></thead>
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
          {#if status}
            <!-- The count: literal yes and no votes, so ▲/▼ (the side ahead); a measure without a result has none. -->
            {@const st = status[m.ref]}
            {#if st?.outcome.ahead === "yes"}<StanceMark mark={MARK["support"]!} />{:else if st?.outcome.ahead === "no"}<StanceMark mark={MARK["oppose"]!} />{:else}<StanceMark mark={MARK["unresearched"]!} />{/if}
            {st ? `${st.word}${st.short && st.outcome.threshold ? `, under the ${Math.round(st.outcome.threshold.share * 1000) / 10}% needed` : ""}` : "No result yet"}
          {:else}
            {#if v === "yes"}<StanceMark mark={MARK["support"]!} />{:else if v === "no"}<StanceMark mark={MARK["oppose"]!} />{:else}<StanceMark mark={MARK["unresearched"]!} />{/if}
            {v ? voteLabel[v] : "Not answered"}
          {/if}
        </span>
        <span class="what"><strong>{m.label}</strong> {titles[m.ref] ?? ""}</span>
        <span class="eff num">
          {#if v === "yes"}
            {@const g = gfOf(m.ref)}
            {#if g.low !== 0 || g.high !== 0}<span
                >General Fund {#if base?.generalFund}<strong>{pctRange(g.low, g.high, base.generalFund)}</strong> ({signedRange(g)}/yr){:else}{signedRange(g)}/yr{/if}</span
              >{/if}
            {#each otherOf(m.ref) as o (o.l)}<span
                >{LANE_LABEL[o.l]} {#if base?.total}<strong>{pctRange(o.r.low, o.r.high, base.total)} of {base.totalName}</strong> ({signedRange(o.r)}/yr){:else}{signedRange(o.r)}/yr{/if}</span
              >{/each}
            {#each result.afterForecast.filter((x) => x.ref === m.ref) as x (x.startFy + x.text)}<span class="muted">from FY{x.startFy}, after the forecast</span>{/each}
            {#if result.inWords.some((x) => x.ref === m.ref)}<span class="muted">sized in words</span>{/if}
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
            {#if base?.total}<strong>{pctRange(r.low, r.high, base.total)} of {base.totalName}</strong> ({signedRange(r)} a year once in effect){:else}{signedRange(r)} a year once in effect{/if}
          </li>{/if}
      {/each}
      {#if result.bonds.principal}
        <li>
          <strong>Bonds:</strong> {#if base?.total}<strong>{pct(result.bonds.principal / base.total)} of {base.totalName}</strong> ({usd(result.bonds.principal)}){:else}{usd(
            result.bonds.principal,
          )}{/if} authorized{#if result.bonds.debtServiceTotal}, about {usd(result.bonds.debtServiceTotal)} in total
            debt service{/if}{#if result.bonds.perHundredK}; about ${result.bonds.perHundredK.toFixed(2)} a year per $100,000 of assessed value{/if}, paid
          from property taxes ({result.bonds.labels.join(", ")})
        </li>
      {/if}
      {#each result.oneTime as c (c.ref + c.effectId)}<li><strong>One-time ({c.label}):</strong> {signedRange(c.range)}{c.startFy ? ` in FY${c.startFy}` : ""}</li>{/each}
      {#each result.totals as c (c.ref + c.effectId)}<li><strong>Total over {c.years ?? "several"} years ({c.label}):</strong> {signedRange(c.range)}</li>{/each}
      {#each result.afterForecast as x (x.ref + x.startFy + x.text)}<li>
          <strong>Starts after the forecast ({x.label}, from FY{x.startFy}):</strong> {x.text} It adds nothing to the years shown{#if result.years.length}, FY{result.years[0]} to FY{result.years[
              result.years.length - 1
            ]}{/if}.
        </li>{/each}
      {#each result.inWords as x (x.ref + x.text)}<li><strong>Sized in words, not added up ({x.label}):</strong> “{x.words}”. {x.text}</li>{/each}
      {#each result.notEstimated as x (x.ref + x.text)}<li><strong>Not estimated ({x.label}):</strong> {x.text}</li>{/each}
      {#each result.conflicts as k (k.refs.join())}<li><strong>Only some can take effect:</strong> {k.labels.join(", ")} compete; the totals span the possible outcomes.</li>{/each}
      {#each result.overlaps as k (k.refs.join())}<li><strong>Partly overlapping:</strong> {k.labels.join(" and ")} both take effect, and one prevails where they conflict; their estimates are added, and may overlap.</li>{/each}
      {#if result.startAssumed.length}<li><strong>Start year not stated ({result.startAssumed.join(", ")}):</strong> counted from the first forecast year.</li>{/if}
    </ul>
    <p class="note">
      Percentages are computed here, to show how big each amount is: a step as a share of the forecast gap; General Fund amounts as a share of the adopted
      FY{base?.fy ?? ""} General Fund; other funds and bonds as a share of the whole adopted budget, {base?.totalLabel ?? "all funds"}. Amounts the statement gives only in words are
      quoted, never turned into numbers.
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
    stroke: var(--ink);
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
  .band {
    stroke-width: 1.5;
  }
  .band.short {
    fill: var(--shortfall);
    fill-opacity: 0.32;
    stroke: var(--shortfall);
  }
  .band.surp {
    fill: var(--money);
    fill-opacity: 0.32;
    stroke: var(--money);
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
  .mark {
    font-size: 11px;
    font-weight: 600;
    fill: var(--ink-2);
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
    font-size: 11.5px;
    font-weight: 700;
    fill: var(--ink);
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
  .sw.base {
    border-top: 2px dashed var(--muted);
    height: 0;
  }
  .sw.short {
    background: color-mix(in srgb, var(--shortfall) 35%, transparent);
    border: 1.5px solid var(--shortfall);
  }
  .sw.surp {
    background: color-mix(in srgb, var(--money) 35%, transparent);
    border: 1.5px solid var(--money);
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
