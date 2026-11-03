<script lang="ts">
  import { CHIP_ICON } from "../lib/icons";
  import type { Chip } from "../lib/officeChips";

  /**
   * Office scope chips: a wrapping row of neutral icon + text chips. Inside a
   * row button (`inButton`) the CivLab chip is not a nested link: a mouse
   * click opens it in a new tab, and the expanded row and the drawer carry
   * the real, keyboard-reachable link.
   */
  let { chips, align = "start", inButton = false }: { chips: Chip[]; align?: "start" | "end"; inButton?: boolean } = $props();

  function openLink(e: MouseEvent, href: string) {
    e.stopPropagation();
    window.open(href, "_blank", "noopener,noreferrer");
  }
</script>

<span class="chips" class:end={align === "end"}>
  {#each chips as c, i (i)}
    {@const Icon = CHIP_ICON[c.icon]}
    {#if c.href && !inButton}
      <a class="ochip link" href={c.href} target="_blank" rel="noopener noreferrer" title={c.title}><Icon size={12} aria-hidden="true" /><span>{c.text}</span></a>
    {:else if c.href}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <span class="ochip link" title={c.title} onclick={(e) => openLink(e, c.href!)}><Icon size={12} aria-hidden="true" /><span>{c.text}</span></span>
    {:else}
      <span class="ochip" class:lead={c.lead} class:muted={c.muted} title={c.lead ? `${c.title ?? c.text} (unverified)` : c.title}
        ><Icon size={12} aria-hidden="true" /><span>{c.text}</span>{#if c.lead}<span class="sr"> (unverified)</span>{/if}</span
      >
    {/if}
  {/each}
</span>

<style>
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    min-width: 0;
    max-width: 100%;
  }
  .chips.end {
    justify-content: flex-end;
  }
  .ochip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    max-width: 100%;
    padding: 1px 7px;
    border: 1px solid var(--line-strong);
    border-radius: 9px;
    background: var(--surface);
    color: var(--ink-2);
    font-size: 0.72rem;
    font-weight: 600;
    line-height: 1.3;
    text-align: left;
    white-space: normal;
    overflow-wrap: break-word;
    text-decoration: none;
  }
  .ochip > span {
    min-width: 0;
  }
  .ochip :global(svg) {
    flex: none;
    color: var(--muted);
  }
  .ochip.lead {
    border-style: dashed;
  }
  .ochip.muted {
    border-style: dashed;
    border-color: var(--line);
    color: var(--muted);
    font-weight: 500;
    font-style: italic;
  }
  .ochip.link {
    cursor: pointer;
    color: var(--ink);
    background: var(--wash);
  }
  .ochip.link:hover {
    border-color: var(--ink-2);
  }
  @media (max-width: 640px) {
    .chips {
      gap: 3px;
    }
    .ochip {
      gap: 3px;
      padding: 1px 5px;
      font-size: 0.68rem;
    }
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
</style>
