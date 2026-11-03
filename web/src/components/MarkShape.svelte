<svelte:options namespace="svg" />

<script lang="ts">
  import type { Mark } from "../lib/marks";

  /** Draws a mark centered on (0,0) with half-size `s`. Use inside an <svg>. */
  let { mark, s = 6 }: { mark: Mark; s?: number } = $props();
  const r = $derived(s * 0.82);
</script>

{#if mark.shape === "up"}
  <path class="tri {mark.tone}" d={`M0,${-s} L${s},${s * 0.78} L${-s},${s * 0.78} Z`} />
{:else if mark.shape === "down"}
  <path class="tri {mark.tone}" d={`M0,${s} L${s},${-s * 0.78} L${-s},${-s * 0.78} Z`} />
{:else if mark.shape === "half"}
  <circle class="ring" {r} />
  <path class="fill-ink" d={`M0,${-r} A${r},${r} 0 0 0 0,${r} Z`} />
{:else if mark.shape === "slash"}
  <circle class="ring" {r} />
  <line class="stroke-ink" x1={-r * 0.68} y1={r * 0.68} x2={r * 0.68} y2={-r * 0.68} />
{:else if mark.shape === "hollow"}
  <circle class="ring hollow" {r} />
{:else if mark.shape === "dashed"}
  <circle class="ring dashed" {r} />
{:else}
  <circle class="ring lead" {r} />
{/if}

<style>
  .tri {
    stroke: var(--surface);
    stroke-width: 1.2;
    paint-order: stroke;
    stroke-linejoin: round;
  }
  .tri.support {
    fill: var(--support);
  }
  .tri.oppose {
    fill: var(--oppose);
  }
  .tri.money {
    fill: var(--money);
  }
  .tri.ink {
    fill: var(--ink-2);
  }
  .ring {
    fill: var(--surface);
    stroke: var(--ink-2);
    stroke-width: 1.6;
  }
  .ring.hollow {
    stroke: var(--muted);
  }
  .ring.dashed {
    stroke: var(--muted);
    stroke-dasharray: 2 2;
  }
  .ring.lead {
    stroke: var(--warning);
    stroke-dasharray: 2.4 1.8;
  }
  .fill-ink {
    fill: var(--ink-2);
  }
  .stroke-ink {
    stroke: var(--ink-2);
    stroke-width: 1.6;
    stroke-linecap: round;
  }
</style>
