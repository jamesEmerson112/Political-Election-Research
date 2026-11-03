<script lang="ts">
  import type { Bridge, BridgeDomain, BridgeOmitted, BridgeStep, Range } from "../lib/budgetTrial";
  import { nearFar } from "../lib/budgetTrial";
  import { balance, gapShare, signedRange, usd } from "../lib/measureChips";
  import { hideTip, showTip } from "../lib/ui.svelte";

  /**
   * The General Fund bridge (waterfall) for one fiscal year: the official
   * forecast, one step per yes measure in ballot order, and the result. Each
   * step starts where the previous one's nearer end left off; the nearer end
   * is solid, the rest of the range lighter. One hue (--money) for measures,
   * --muted for the forecast and the result. Direction is position (left =
   * shortfall side) and words, never arrows. When $0 is far from the numbers
   * the axis is zoomed in, with a break mark and a note saying where the bars
   * start; the domain is fixed by the caller (bridgeDomain) so it doesn't jump.
   */
  let { bridge, domain, compact = false }: { bridge: Bridge; domain: BridgeDomain; compact?: boolean } = $props();

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
  const rowsH = $derived(n * pitch);
  const H = $derived(rowsH + 18);
  /** A clean tick step for the width. The axis ends are rounded out to a fifth of it (never across $0 when zoomed), so the zoom note names a round amount. */
  const step = $derived.by(() => {
    const raw = (domain.hi - domain.lo) / Math.max(2, Math.floor((x1 - x0) / 90));
    const mag = 10 ** Math.floor(Math.log10(raw || 1));
    return ([1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag) || 1;
  });
  const lo = $derived.by(() => {
    const v = Math.floor(domain.lo / (step / 5)) * (step / 5);
    return !domain.zero && domain.lo > 0 && v <= 0 ? domain.lo : v;
  });
  const hi = $derived.by(() => {
    const v = Math.ceil(domain.hi / (step / 5)) * (step / 5);
    return !domain.zero && domain.hi < 0 && v >= 0 ? domain.hi : v;
  });
  const x = (v: number) => x0 + ((v - lo) / (hi - lo || 1)) * (x1 - x0);
  const rowY = (k: number) => k * pitch + (stacked ? labelH : (pitch - barH) / 2);
  /** Totals are drawn from $0, or from the axis edge nearest $0 when the axis is zoomed in (with a break mark). */
  const anchor = $derived(domain.zero ? 0 : hi < 0 ? hi : lo);
  const ticks = $derived.by(() => {
    const out: number[] = [];
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-6; v += step) out.push(Math.round(v));
    return out;
  });
  const tickAnchor = (t: number) => (x(t) > w - 24 ? "end" : stacked && x(t) < x0 + 20 ? "start" : "middle");
  const tickLabel = (v: number) => (v === 0 ? "$0" : `${v < 0 ? "−" : ""}${usd(v)}`);

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
  /** Segments for a total (forecast or result): solid from the anchor to the nearer end, lighter to the farther end. */
  function totalSegs(r: Range): Seg[] {
    if (domain.zero && r.low < 0 && r.high > 0) return [{ a: r.low, b: r.high, light: true }];
    const [near, far] = Math.abs(r.low - anchor) <= Math.abs(r.high - anchor) ? [r.low, r.high] : [r.high, r.low];
    const segs: Seg[] = [{ a: anchor, b: near, light: false }];
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
        ? (gapShare(bridge.baseline, totalDelta) ?? signedRange(bridge.result))
        : (gapShare(bridge.baseline, s.delta) ?? signedRange(s.delta));

  const direction = (r: Range) =>
    r.low >= 0 ? "Revenue or savings: moves toward surplus (right)" : r.high <= 0 ? "Cost: moves toward shortfall (left)" : "Cost or revenue, depending on the outcome";
  function tipLines(s: BridgeStep): string[] {
    if (s.kind === "start") return [`Official forecast, FY${bridge.fy}`, balance(s.after), "Doesn't include ballot measures"];
    if (s.kind === "end") {
      const d = { low: bridge.result.low - bridge.baseline, high: bridge.result.high - bridge.baseline };
      const g = gapShare(bridge.baseline, d);
      return [`With your choices, FY${bridge.fy}`, balance(bridge.result), `Change from the forecast: ${signedRange(d)} a year`, ...(g ? [`Gap ${g} (share computed here)`] : [])];
    }
    const g = gapShare(bridge.baseline, s.delta);
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
    hi <= 0 ? ["← larger shortfall", "smaller shortfall →"] : lo >= 0 ? ["← smaller surplus", "larger surplus →"] : ["← shortfall", "surplus →"],
  );
  const zoomNote = $derived(
    domain.zero ? null : hi < 0 ? `Zoomed axis: bars start at a ${usd(hi)} shortfall, not at $0` : `Zoomed axis: bars start at a ${usd(lo)} surplus, not at $0`,
  );

  const REASON: Record<BridgeOmitted["reason"], string> = {
    not_in_year: "",
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
          <line class="grid" x1={x(t)} x2={x(t)} y1="0" y2={rowsH} />
          <text class="tick" x={x(t)} y={rowsH + 13} text-anchor={tickAnchor(t)}>{tickLabel(t)}</text>
        {/each}
        {#if domain.zero}<line class="zero" x1={x(0)} x2={x(0)} y1="0" y2={rowsH} />{/if}
        {#if hover !== null}<rect class="hl" x="0" y={hover * pitch} width={w} height={pitch} rx="3" />{/if}
        {#each bridge.steps as s, k (k)}
          {@const y = rowY(k)}
          {#each segsOf(s) as seg, j (j)}
            {@const r = rect(seg)}
            <rect class={s.kind === "measure" ? "money" : "total"} class:light={seg.light} x={r.left} {y} width={r.width} height={barH} rx="2" />
          {/each}
          {#if s.kind !== "measure" && !domain.zero}
            {@const bx = x(anchor) + (anchor === hi ? -7 : 7)}
            <!-- break mark: the bar continues to $0 off the chart -->
            <path class="break" d={`M${bx - 3},${y + barH + 2} L${bx + 1},${y - 2} M${bx + 1},${y + barH + 2} L${bx + 5},${y - 2}`} />
          {/if}
          {#if k < n - 1}
            <line class="conn" x1={x(nextChain(s))} x2={x(nextChain(s))} y1={y + barH} y2={rowY(k + 1)} />
          {/if}
        {/each}
        {#each bridge.steps as s, k (k)}
          {#if stacked}
            <text class="halo" x="0" y={k * pitch + font}><tspan class="name">{s.label}</tspan><tspan class="val" dx="6">{valueText(s)}</tspan></text>
          {:else}
            <text class="name" x="0" y={rowY(k) + barH / 2} dominant-baseline="central">{s.label}</text>
            <text class="val" x={labelW} y={rowY(k) + barH / 2} dominant-baseline="central" text-anchor="end">{valueText(s)}</text>
          {/if}
        {/each}
        {#each bridge.steps as s, k (k)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <rect
            class="hit"
            x="0"
            y={k * pitch}
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
          />
        {/each}
        {#if !domain.zero}
          {@const bx = x(anchor) + (anchor === hi ? -7 : 7)}
          <path class="axisbreak" d={`M${bx - 3},${rowsH + 2} L${bx + 1},${rowsH - 6} M${bx + 1},${rowsH + 2} L${bx + 5},${rowsH - 6}`} />
        {/if}
      </svg>
    {/if}
  </div>
  <div class="axis" class:stacked style:padding-left={`${x0}px`}>
    <span class="l">{sides[0]}</span>
    {#if zoomNote}<span class="zoom"><span class="brk" aria-hidden="true">//</span> {zoomNote}</span>{/if}
    <span class="r">{sides[1]}</span>
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
    stroke: var(--ink-2);
    stroke-width: 1;
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
  .break {
    stroke: var(--surface);
    stroke-width: 2;
    fill: none;
  }
  .axisbreak {
    stroke: var(--ink-2);
    stroke-width: 1.25;
    fill: none;
  }
  .hl {
    fill: var(--ink);
    opacity: 0.05;
  }
  .hit {
    fill: transparent;
  }
  .halo {
    paint-order: stroke;
    stroke: var(--surface);
    stroke-width: 3px;
    stroke-linejoin: round;
  }
  .axis {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas: "l z r";
    gap: 2px 10px;
    font-size: 0.7rem;
    color: var(--muted);
  }
  .axis.stacked {
    grid-template-columns: auto auto;
    grid-template-areas: "l r" "z z";
    justify-content: space-between;
  }
  .l {
    grid-area: l;
  }
  .r {
    grid-area: r;
    text-align: right;
  }
  .zoom {
    grid-area: z;
    text-align: center;
    color: var(--ink-2);
  }
  .axis.stacked .zoom {
    text-align: left;
  }
  .brk {
    font-weight: 700;
    letter-spacing: -1px;
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
