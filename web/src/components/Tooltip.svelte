<script lang="ts">
  import { ui } from "../lib/ui.svelte";

  let w = $state(0);
  const pos = $derived.by(() => {
    if (!ui.tip) return null;
    const vw = typeof window === "undefined" ? 1000 : window.innerWidth;
    const left = Math.min(Math.max(8, ui.tip.x + 14), vw - w - 8);
    return { left, top: ui.tip.y + 14 };
  });
</script>

{#if ui.tip && pos}
  <div class="tip" role="tooltip" bind:clientWidth={w} style:left={`${pos.left}px`} style:top={`${pos.top}px`}>
    {#each ui.tip.lines as line, i (i)}
      <div class:first={i === 0}>{line}</div>
    {/each}
  </div>
{/if}

<style>
  .tip {
    position: fixed;
    z-index: 50;
    pointer-events: none;
    max-width: 300px;
    background: var(--raised);
    color: var(--ink);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    padding: 8px 10px;
    font-size: var(--step--1);
    box-shadow: 0 4px 16px color-mix(in srgb, var(--ink) 14%, transparent);
    font-variant-numeric: tabular-nums;
  }
  .first {
    font-weight: 600;
  }
</style>
