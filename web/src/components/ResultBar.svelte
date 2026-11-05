<script lang="ts">
  import { MARK } from "../lib/marks";
  import { countLine, measureWord, pct1, votes, type MeasureOutcome } from "../lib/results";
  import { THRESHOLD_LABEL } from "../lib/measureChips";
  import { hideTip, openDetail, showTip } from "../lib/ui.svelte";
  import StanceMark from "./StanceMark.svelte";

  /**
   * A measure's yes/no count as one bar: ▲ Yes (support teal) from the left, ▼ No (oppose orange) from the right,
   * a tick at the share needed to pass. The side ahead is drawn in full and the other side dimmed. Labels are
   * ink, and say "Yes ahead" / "No ahead" until the count is certified (then "Passed" / "Failed").
   */
  /** `compact`: the small bar for cards and rows; `still`: inside a link, so no focus stop or tooltip of its own. */
  let { o, title, compact = false, still = false }: { o: MeasureOutcome; title: string; compact?: boolean; still?: boolean } = $props();

  const word = $derived(measureWord(o));
  const need = $derived(o.threshold?.share ?? 0.5);
  const needText = $derived(
    o.threshold && o.threshold.value !== "majority" ? `${THRESHOLD_LABEL[o.threshold.value] ?? o.threshold.value} of the vote needed to pass` : "More than half needed to pass",
  );
  const tip = $derived([`Yes ${votes(o.yes)} votes (${pct1(o.yesShare)})`, `No ${votes(o.no)} votes (${pct1(o.noShare)})`, `${word} · ${countLine(o)}`, `${needText}; shares computed here`]);
  const aria = $derived(`${title}: Yes ${pct1(o.yesShare)}, No ${pct1(o.noShare)}. ${word}, ${countLine(o)}.`);

  function open() {
    openDetail({
      kicker: countLine(o),
      title: `${title}: ${word}`,
      facts: [
        ["Yes", `${votes(o.yes)} votes · ${pct1(o.yesShare)}`],
        ["No", `${votes(o.no)} votes · ${pct1(o.noShare)}`],
        ["Needed to pass", o.threshold ? (THRESHOLD_LABEL[o.threshold.value] ?? o.threshold.value) : "Not recorded here"],
        ["Certified", o.certified ? "Yes" : "Not yet"],
      ],
      citations: o.citations,
      note: o.certified
        ? "Shares are computed here from the certified votes."
        : "Semi-official: counting continues until the result is certified, so the side ahead can still change. Shares are computed here from the votes.",
    });
  }
</script>

<span class="rb" class:compact>
  <span class="rb-top">
    <span class="word">{word}</span>
    {#if !compact}<span class="count">{countLine(o)}</span><button class="link-btn" onclick={open}>Votes and source</button>{/if}
  </span>
  {#if still}
    <span class="bar" role="img" aria-label={aria}>
      <span class="seg yes" class:dim={o.ahead === "no"} style:width={`${(o.yesShare * 100).toFixed(2)}%`}></span>
      <span class="seg no" class:dim={o.ahead === "yes"} style:width={`${(o.noShare * 100).toFixed(2)}%`}></span>
      <span class="tick" style:left={`${(need * 100).toFixed(2)}%`} aria-hidden="true"></span>
    </span>
  {:else}
    <span
      class="bar"
      role="img"
      tabindex="0"
      aria-label={aria}
      onmousemove={(e) => showTip(e, tip)}
      onmouseleave={hideTip}
      onfocus={(e) => showTip(e, tip)}
      onblur={hideTip}
      onkeydown={(e) => {
        if (e.key === "Escape") hideTip();
      }}
    >
      <span class="seg yes" class:dim={o.ahead === "no"} style:width={`${(o.yesShare * 100).toFixed(2)}%`}></span>
      <span class="seg no" class:dim={o.ahead === "yes"} style:width={`${(o.noShare * 100).toFixed(2)}%`}></span>
      <span class="tick" style:left={`${(need * 100).toFixed(2)}%`} aria-hidden="true"></span>
    </span>
  {/if}
  <span class="labels num" aria-hidden={still ? "true" : undefined}>
    <span class="lab" class:lead={o.ahead === "yes"}><StanceMark mark={MARK["support"]!} size={12} /> Yes {pct1(o.yesShare)}{#if !compact}<span class="v"> · {votes(o.yes)}</span>{/if}</span>
    {#if !compact && need === 0.5}<span class="half" aria-hidden="true" title="More than half needed to pass">50%</span>{/if}
    <span class="lab right" class:lead={o.ahead === "no"}>No {pct1(o.noShare)}{#if !compact}<span class="v"> · {votes(o.no)}</span>{/if} <StanceMark mark={MARK["oppose"]!} size={12} /></span>
  </span>
  {#if !compact && o.threshold && o.threshold.value !== "majority"}<span class="note">The tick marks the {THRESHOLD_LABEL[o.threshold.value]?.toLowerCase() ?? o.threshold.value} needed to pass.</span>{/if}
</span>

<style>
  .rb {
    display: grid;
    gap: 6px;
    min-width: 0;
  }
  .compact {
    gap: 3px;
  }
  .rb-top {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 10px;
    font-size: var(--step--1);
  }
  .word {
    font-weight: 800;
    color: var(--ink);
  }
  .count {
    color: var(--ink-2);
  }
  .bar {
    position: relative;
    display: flex;
    gap: 2px;
    height: 14px;
    border-radius: 4px;
    outline-offset: 3px;
  }
  .compact .bar {
    height: 8px;
  }
  .seg {
    display: block;
    height: 100%;
    min-width: 2px;
  }
  .seg.yes {
    background: var(--support);
    border-radius: 4px 0 0 4px;
  }
  .seg.no {
    background: var(--oppose);
    border-radius: 0 4px 4px 0;
  }
  .seg.dim {
    opacity: 0.4;
  }
  .tick {
    position: absolute;
    top: -3px;
    bottom: -3px;
    width: 2px;
    margin-left: -1px;
    background: var(--ink);
    border-radius: 1px;
    box-shadow: 0 0 0 1px var(--surface);
  }
  .labels {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: baseline;
    gap: 8px;
    font-size: var(--step--1);
    color: var(--ink-2);
  }
  .lab.right {
    grid-column: 3;
    justify-self: end;
  }
  .half {
    grid-column: 2;
    font-size: 0.7rem;
    color: var(--muted);
  }
  @media (max-width: 480px) {
    .lab .v {
      display: none;
    }
  }
  .lab {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }
  .lab.lead {
    color: var(--ink);
    font-weight: 800;
  }
  .lab .v {
    font-weight: 400;
    color: var(--ink-2);
  }
  .compact .labels {
    font-size: 0.75rem;
  }
  .note {
    font-size: 0.75rem;
    color: var(--ink-2);
  }
  .link-btn {
    border: 0;
    background: none;
    padding: 0;
    font: inherit;
    font-size: var(--step--1);
    color: var(--ink-2);
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }
  .link-btn:hover {
    color: var(--ink);
  }
</style>
