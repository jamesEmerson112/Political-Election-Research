<script lang="ts">
  import type { Bridge, BridgeDomain, BridgeOmitted, BridgeStep, Range } from "../lib/budgetTrial";
  import { nearFar } from "../lib/budgetTrial";
  import { balance, gapShare, signedRange, usd, usdRange } from "../lib/measureChips";
  import { hideTip, showTip } from "../lib/ui.svelte";
  import { ANSWER_WORDS, type TrialWords } from "../lib/trialWords";

  /**
   * The General Fund bridge (waterfall) for one fiscal year: the official
   * forecast, one step per yes measure in ballot order, and the result. Each
   * step starts where the previous one's nearer end left off; the nearer end
   * is solid, the rest of the range lighter. One hue (--money) for measures,
   * --muted for the forecast and the result.
   *
   * The shortfall is drawn as a positive amount growing right from $0 (a
   * surplus would sit left of $0), like the per-year chart in the summary, so
   * a smaller gap is a shorter bar. The axis always starts at $0 and is never
   * zoomed: bar lengths are the amounts (a 13% smaller shortfall is a 13%
   * shorter bar, not half of it). Direction is position and words, never
   * arrows. The domain is fixed by the caller (bridgeDomain) so it doesn't jump.
   */
  let { bridge, domain, compact = false, words = ANSWER_WORDS }: { bridge: Bridge; domain: BridgeDomain; compact?: boolean; words?: TrialWords } = $props();

  let w = $state(0);
  let hover = $state<number | null>(null);

  const font = $derived(compact ? 11 : 12);
  /** Narrow (phones): each label sits above its bar and the bars use the full width. */
  const stacked = $derived(w < 560);
  const labelH = $derived(stacked ? font + 4 : 0);
  const barH = $derived(compact ? 10 : 14);
  const pitch = $derived(stacked ? labelH + barH + 7 : compact ? 16 : 24);
  const labelW = $derived(stacked ? 0 : Math.min(compact ? 200 : 230, Math.round(w * 0.46)));
  const x0 = $derived(stacked ? 2 : labelW + 6);
  const x1 = $derived(Math.max(x0 + 40, w - 10));
  const n = $derived(bridge.steps.length);
  /** A row above the bars labels the $0 line: where a bar would have to reach for a balanced General Fund (no shortfall). */
  const markH = $derived(font + 8);
  const top = (k: number) => markH + k * pitch;
  const rowsH = $derived(markH + n * pitch);
  const H = $derived(rowsH + 18);
  /** A clean tick step for the width. */
  const step = $derived.by(() => {
    const raw = (domain.hi - domain.lo) / Math.max(2, Math.floor((x1 - x0) / 90));
    const mag = 10 ** Math.floor(Math.log10(raw || 1));
    return ([1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag) || 1;
  });
  /**
   * The plotted axis is the shortfall, the negative of the General Fund balance
   * (a surplus is negative here), rounded out to a fifth of a tick. It always
   * includes $0 (bridgeDomain does).
   */
  const pLo = $derived(Math.floor(-domain.hi / (step / 5)) * (step / 5));
  const pHi = $derived(Math.ceil(-domain.lo / (step / 5)) * (step / 5));
  /** x of a General Fund balance v (negative = shortfall): a larger shortfall sits further right. */
  const x = (v: number) => x0 + ((-v - pLo) / (pHi - pLo || 1)) * (x1 - x0);
  const rowY = (k: number) => top(k) + (stacked ? labelH : (pitch - barH) / 2);
  /** Ticks in plotted units: p > 0 is a shortfall of p, p < 0 a surplus of -p (the side labels say which). */
  const ticks = $derived.by(() => {
    const out: number[] = [];
    for (let p = Math.ceil(pLo / step - 1e-9) * step; p <= pHi + 1e-6; p += step) out.push(Math.round(p) || 0);
    return out;
  });
  const tickX = (p: number) => x(-p);
  const tickAnchor = (p: number) => (tickX(p) > w - 24 ? "end" : stacked && tickX(p) < x0 + 20 ? "start" : "middle");
  const tickLabel = (p: number) => (p === 0 ? "$0" : usd(p));
  /** The Balanced label sits beside the $0 line, on the side with room. */
  const markEnd = $derived(x(0) > x1 - 150);

  interface Seg {
    a: number;
    b: number;
    light: boolean;
  }
  /** A span from a to b in data units, at least 2px wide (grown away from a). */
  function rect(s: Seg) {
    const xa = x(s.a);
    const xb = x(s.b);
    const left = Math.min(xa, xb);
    const width = Math.abs(xb - xa);
    if (width >= 2) return { left, width };
    return { left: xb >= xa ? xa : xa - 2, width: 2 };
  }
  /** Segments for a total (forecast or result): solid from $0 to the nearer end, lighter to the farther end. */
  function totalSegs(r: Range): Seg[] {
    if (r.low < 0 && r.high > 0) return [{ a: r.low, b: r.high, light: true }];
    const [near, far] = Math.abs(r.low) <= Math.abs(r.high) ? [r.low, r.high] : [r.high, r.low];
    const segs: Seg[] = [{ a: 0, b: near, light: false }];
    if (far !== near) segs.push({ a: near, b: far, light: true });
    return segs;
  }
  /** Segments for a measure step: solid for the nearer end of its range, lighter for the rest. */
  function stepSegs(s: BridgeStep): Seg[] {
    const nf = nearFar(s.delta);
    if (nf.spansZero) return [{ a: s.chain + s.delta.low, b: s.chain + s.delta.high, light: true }];
    const segs: Seg[] = [{ a: s.chain, b: s.chain + nf.near, light: false }];
    if (nf.far !== nf.near) segs.push({ a: s.chain + nf.near, b: s.chain + nf.far, light: true });
    return segs;
  }
  const segsOf = (s: BridgeStep) => (s.kind === "start" ? totalSegs(s.after) : s.kind === "end" ? totalSegs(bridge.result) : stepSegs(s));
  /** Where the next step starts (the connector's x). */
  const nextChain = (s: BridgeStep) => (s.kind === "measure" ? s.chain + nearFar(s.delta).near : s.chain);
  /** Percent first (the maintainer's choice): each step and the result as a share of the forecast gap; the forecast itself in dollars, the base of those shares. Dollars for every step are in the tooltip and the summary table. */
  const totalDelta = $derived({ low: bridge.result.low - bridge.baseline, high: bridge.result.high - bridge.baseline });
  const valueText = (s: BridgeStep) =>
    s.kind === "start"
      ? balance({ low: bridge.baseline, high: bridge.baseline })
      : s.kind === "end"
        ? (gapShare(bridge.baseline, totalDelta, "money") ?? signedRange(bridge.result))
        : (gapShare(bridge.baseline, s.delta, "money") ?? signedRange(s.delta));

  const direction = (r: Range) =>
    r.low >= 0 ? "Revenue or savings: moves left, toward surplus" : r.high <= 0 ? "Cost: moves right, toward shortfall" : "Cost or revenue, depending on the outcome";
  function tipLines(s: BridgeStep): string[] {
    if (s.kind === "start") return [`Official forecast, FY${bridge.fy}`, balance(s.after), "Doesn't include ballot measures"];
    if (s.kind === "end") {
      const d = { low: bridge.result.low - bridge.baseline, high: bridge.result.high - bridge.baseline };
      const g = gapShare(bridge.baseline, d, "money");
      const toZero = bridge.result.high < 0 ? [`Still to close for a balanced General Fund ($0): ${usdRange(-bridge.result.high, -bridge.result.low)}`] : [];
      return [`${words.withIt}, FY${bridge.fy}`, balance(bridge.result), `Change from the forecast: ${signedRange(d)} a year`, ...(g ? [`Gap ${g} (share computed here)`] : []), ...toZero];
    }
    const g = gapShare(bridge.baseline, s.delta, "money");
    return [
      s.label,
      ...(g ? [`Gap ${g} (share of the forecast gap, computed here)`] : []),
      `${signedRange(s.delta)} a year to the General Fund in FY${bridge.fy}`,
      direction(s.delta),
      ...(s.exclusive ? [`Only one of ${s.labels.join(", ")} can take effect; the step spans the possible outcomes`] : []),
      `Running total: ${balance(s.after)}`,
    ];
  }

  const sides = $derived(
    pLo >= 0 ? ["← smaller shortfall", "larger shortfall →"] : pHi <= 0 ? ["← larger surplus", "smaller surplus →"] : ["← surplus", "shortfall →"],
  );

  const REASON: Record<BridgeOmitted["reason"], string> = {
    not_in_year: "",
    in_words: "sized in words only",
    not_estimated: "not estimated",
    minimal: "minimal or no cost",
    one_time_only: "one-time or multi-year only",
    other_lanes: "other funds only",
  };
  const propList = (labels: string[]) => (labels.every((l) => l.startsWith("Prop ")) ? `Prop ${labels.map((l) => l.slice(5)).join(", ")}` : labels.join(", "));
  const omittedText = $derived.by(() => {
    const groups = new Map<string, string[]>();
    for (const o of bridge.omitted) {
      const why = o.reason === "not_in_year" ? (o.startFy ? `from FY${o.startFy}` : `not in FY${bridge.fy}`) : REASON[o.reason];
      groups.set(why, [...(groups.get(why) ?? []), o.label]);
    }
    return [...groups].map(([why, labels]) => `${propList(labels)} (${why})`).join(" · ");
  });
  const exclusive = $derived(bridge.steps.filter((s) => s.exclusive));
  const aria = $derived(
    `General Fund bridge for FY${bridge.fy}: ` +
      bridge.steps.map((s) => `${s.label} ${s.kind === "measure" ? `${valueText(s)} (${signedRange(s.delta)})` : balance(s.after)}`).join("; "),
  );
</script>

<div class="bridge" class:compact>
  <div class="plot" bind:clientWidth={w}>
    {#if w > 0}
      <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-label={aria} style:font-size={`${font}px`}>
        {#each ticks as t (t)}
          <line class="grid" x1={tickX(t)} x2={tickX(t)} y1={markH} y2={rowsH} />
          <text class="tick" x={tickX(t)} y={rowsH + 13} text-anchor={tickAnchor(t)}>{tickLabel(t)}</text>
        {/each}
        <line class="zero" x1={x(0)} x2={x(0)} y1="2" y2={rowsH} />
        <text class="mark" x={x(0) + (markEnd ? -5 : 5)} y={font + 1} text-anchor={markEnd ? "end" : "start"}>Balanced: $0 shortfall</text>
        {#if hover !== null}<rect class="hl" x="0" y={top(hover)} width={w} height={pitch} rx="3" />{/if}
        {#each bridge.steps as s, k (k)}
          {@const y = rowY(k)}
          {#each segsOf(s) as seg, j (j)}
            {@const r = rect(seg)}
            <rect class={s.kind === "measure" ? "money" : "total"} class:light={seg.light} x={r.left} {y} width={r.width} height={barH} rx="2" />
          {/each}
          {#if k < n - 1}
            <line class="conn" x1={x(nextChain(s))} x2={x(nextChain(s))} y1={y + barH} y2={rowY(k + 1)} />
          {/if}
        {/each}
        {#each bridge.steps as s, k (k)}
          {#if stacked}
            <text class="halo" x="0" y={top(k) + font}><tspan class="name">{s.label}</tspan><tspan class="val" dx="6">{valueText(s)}</tspan></text>
          {:else}
            <text class="name" x="0" y={rowY(k) + barH / 2} dominant-baseline="central">{s.label}</text>
            <text class="val" x={labelW} y={rowY(k) + barH / 2} dominant-baseline="central" text-anchor="end">{valueText(s)}</text>
          {/if}
        {/each}
        {#each bridge.steps as s, k (k)}
          <!-- Each row is a tab stop: focus shows the same tooltip as hovering (Escape hides it), and the label reads it out. -->
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <rect
            class="hit"
            role="img"
            tabindex="0"
            aria-label={tipLines(s).join(". ")}
            x="0"
            y={top(k)}
            width={w}
            height={pitch}
            onmousemove={(e) => {
              hover = k;
              showTip(e, tipLines(s));
            }}
            onmouseleave={() => {
              hover = null;
              hideTip();
            }}
            onfocus={(e) => {
              hover = k;
              showTip(e, tipLines(s));
            }}
            onblur={() => {
              hover = null;
              hideTip();
            }}
            onkeydown={(e) => {
              if (e.key === "Escape") hideTip();
            }}
          />
        {/each}
      </svg>
    {/if}
  </div>
  <div class="axis" style:padding-left={`${x0}px`}>
    <span>{sides[0]}</span>
    <span>{sides[1]}</span>
  </div>
  <div class="legend">
    <span><span class="sw money"></span>Measure</span>
    <span><span class="sw total"></span>Forecast · result</span>
    <span><span class="sw money light"></span><span class="sw total light"></span>Lighter: the rest of a range</span>
  </div>
  {#if bridge.steps.length === 2 && !bridge.omitted.length}
    <p class="note">Each Yes adds its General Fund step here, in ballot order.</p>
  {/if}
  {#if omittedText}<p class="note"><strong>No General Fund amount in FY{bridge.fy}:</strong> {omittedText}</p>{/if}
  {#each exclusive as s (s.label)}<p class="note"><strong>{s.label}:</strong> only one can take effect; the step spans the possible outcomes.</p>{/each}
</div>

<style>
  .bridge {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 3px;
  }
  .plot {
    min-width: 0;
    width: 100%;
  }
  svg {
    display: block;
    overflow: visible;
  }
  .name {
    fill: var(--ink);
    font-weight: 600;
  }
  .val,
  .tick {
    fill: var(--ink-2);
    font-variant-numeric: tabular-nums;
  }
  .tick {
    fill: var(--muted);
    font-size: 0.92em;
  }
  .grid {
    stroke: var(--line);
    stroke-width: 1;
  }
  .zero {
    stroke: var(--ink);
    stroke-width: 1.5;
  }
  .mark {
    fill: var(--ink-2);
    font-weight: 600;
    font-size: 0.92em;
  }
  .money {
    fill: var(--money);
  }
  .total {
    fill: var(--muted);
  }
  .light {
    opacity: 0.38;
  }
  .conn {
    stroke: var(--ink-2);
    stroke-width: 1;
    opacity: 0.55;
  }
  .hl {
    fill: var(--ink);
    opacity: 0.05;
  }
  .hit {
    fill: transparent;
  }
  .hit:focus {
    outline: none;
  }
  .hit:focus-visible {
    stroke: var(--ink);
    stroke-width: 1.5;
  }
  .halo {
    paint-order: stroke;
    stroke: var(--surface);
    stroke-width: 3px;
    stroke-linejoin: round;
  }
  .axis {
    display: flex;
    justify-content: space-between;
    gap: 2px 10px;
    font-size: 0.7rem;
    color: var(--muted);
  }
  .legend {
    font-size: 0.72rem;
    color: var(--ink-2);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 12px;
  }
  .legend > span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .sw {
    display: inline-block;
    width: 12px;
    height: 8px;
    border-radius: 2px;
  }
  .sw.money {
    background: var(--money);
  }
  .sw.total {
    background: var(--muted);
  }
  .sw.light {
    opacity: 0.38;
  }
  .note {
    font-size: 0.75rem;
    color: var(--ink-2);
    overflow-wrap: anywhere;
  }
</style>
