<script lang="ts">
  import { MARK, stanceMark } from "../lib/marks";
  import { STANCE_LABEL } from "../lib/format";
  import StanceMark from "./StanceMark.svelte";

  /** stance: a recorded stance, or null when not researched. lead: hint from an unverified lead. */
  let { stance, lead = null, leadCount = 0 }: { stance: string | null; lead?: string | null; leadCount?: number } = $props();
</script>

{#if stance}
  <span class="chip-s {stance}"><StanceMark mark={stanceMark(stance)} />{stanceMark(stance).label}</span>
{:else if leadCount > 0}
  <span class="chip-s lead">
    <StanceMark mark={MARK["lead"]!} />
    {lead ? `Lead: ${STANCE_LABEL[lead]?.toLowerCase() ?? lead}?` : `${leadCount} lead${leadCount === 1 ? "" : "s"}`}
  </span>
{:else}
  <span class="chip-s none"><StanceMark mark={MARK["unresearched"]!} />Not researched</span>
{/if}

<style>
  .chip-s {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: var(--step--1);
    font-weight: 600;
    white-space: nowrap;
    color: var(--ink);
  }
  .no_public_position {
    color: var(--ink-2);
    font-weight: 500;
  }
  .lead {
    color: var(--ink-2);
    font-weight: 500;
    font-style: italic;
    border: 1px dashed var(--warning);
    border-radius: 999px;
    padding: 0 8px 0 4px;
  }
  .none {
    color: var(--muted);
    font-weight: 400;
  }
</style>
