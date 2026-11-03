<script lang="ts">
  import type { Cell } from "../lib/compare";
  import { MARK } from "../lib/marks";
  import StanceMark from "./StanceMark.svelte";

  /** The sentence-level detail of one candidate's cell, with citation buttons that open the drawer. */
  let { cell }: { cell: Cell } = $props();
  const leadLines = $derived(cell.lines.filter((l) => l.lead));
  const lines = $derived(cell.lines.filter((l) => !l.lead));
</script>

<div class="detail">
  {#if leadLines.length}
    <div class="leadbox">
      <span class="lead-tag"><StanceMark mark={MARK["lead"]!} size={11} /> Unverified lead</span>
      {#each leadLines as l, i (i)}<span class="lead-text">{l.text}</span>{/each}
    </div>
  {/if}
  {#each lines as l, i (i)}
    {#if l.group && l.group !== lines[i - 1]?.group}<span class="grp">{l.group}</span>{/if}
    <div class="line" class:strike={l.strike} class:barline={l.bar !== undefined} class:point={l.point}>
      {#if l.bar !== undefined}
        <span class="bar-label">{l.text}</span>
        <span class="bar"><span style:width={`${Math.round(l.bar * 100)}%`}></span></span>
        <span class="bar-val num">{l.sub}</span>
      {:else}
        {#if l.text}<span class="t">{l.text}</span>{/if}
        {#if l.cite}
          <button class="cite" onclick={l.cite.run} aria-label={`${l.cite.n} source${l.cite.n === 1 ? "" : "s"}: ${l.text}`}>{l.cite.n}</button>
        {/if}
        {#if l.more}<button class="more-btn" onclick={l.more.run}>{l.more.label} ›</button>{/if}
        {#if l.sub}<span class="s">{l.sub}</span>{/if}
        {#if l.links?.length}
          <span class="links">
            {#each l.links as k (k.href)}<a href={k.href} target="_blank" rel="noopener noreferrer">{k.label} ↗</a>{/each}
          </span>
        {/if}
      {/if}
    </div>
  {/each}
</div>

<style>
  .detail {
    display: grid;
    gap: 6px;
    color: var(--ink-2);
    font-size: var(--step--1);
    min-width: 0;
  }
  .line {
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
  .grp {
    margin-top: 4px;
    color: var(--ink-2);
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .point {
    position: relative;
    padding-left: 14px;
  }
  .point::before {
    content: "";
    position: absolute;
    left: 3px;
    top: 0.6em;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--ink-2);
  }
  .t {
    color: var(--ink);
  }
  .s {
    display: block;
    color: var(--ink-2);
    font-size: 0.75rem;
  }
  .strike .t {
    text-decoration: line-through;
  }
  .barline {
    display: grid;
    grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) auto;
    gap: 6px;
    align-items: center;
    font-size: 0.75rem;
  }
  .bar-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--ink);
  }
  .bar {
    height: 8px;
    background: var(--wash);
    border-radius: 0 3px 3px 0;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--money);
    border-radius: 0 3px 3px 0;
  }
  .cite {
    display: inline-grid;
    place-items: center;
    min-width: 22px;
    height: 22px;
    padding: 0 6px;
    margin-left: 6px;
    border-radius: 4px;
    border: 1px solid var(--line-strong);
    background: var(--surface);
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--ink-2);
    cursor: pointer;
    vertical-align: 1px;
  }
  .cite:hover {
    border-color: var(--ink);
    color: var(--ink);
  }
  .more-btn {
    border: 0;
    background: none;
    padding: 0;
    margin-left: 6px;
    color: var(--ink-2);
    font-weight: 600;
    font-size: 0.75rem;
    text-decoration: underline dotted;
    text-underline-offset: 3px;
    cursor: pointer;
  }
  .line > .more-btn:first-child {
    margin-left: 0;
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 12px;
    font-size: 0.75rem;
    font-weight: 600;
  }
  .leadbox {
    display: grid;
    gap: 4px;
    border: 1px dashed var(--warning);
    border-radius: var(--radius);
    padding: 6px 8px;
  }
  .lead-tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--ink-2);
  }
  .lead-text {
    font-style: italic;
  }
</style>
