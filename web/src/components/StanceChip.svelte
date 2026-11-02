<script lang="ts">
  import { STANCE_LABEL } from "../lib/format";

  /** stance: a recorded stance, or null when not researched. lead: hint from an unverified lead. */
  let { stance, lead = null, leadCount = 0 }: { stance: string | null; lead?: string | null; leadCount?: number } = $props();
</script>

{#if stance}
  <span class="chip-s {stance}">
    <span class="dot" aria-hidden="true"></span>
    {STANCE_LABEL[stance] ?? stance}
  </span>
{:else if leadCount > 0}
  <span class="chip-s lead">
    <span class="dot" aria-hidden="true"></span>
    {lead ? `Lead: ${STANCE_LABEL[lead]?.toLowerCase() ?? lead}` : `${leadCount} lead${leadCount === 1 ? "" : "s"}`}
  </span>
{:else}
  <span class="chip-s none"><span class="dot" aria-hidden="true"></span>Not researched</span>
{/if}

<style>
  .chip-s {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: var(--step--1);
    font-weight: 600;
    white-space: nowrap;
    color: var(--ink);
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex: none;
    border: 2px solid transparent;
  }
  .support .dot {
    background: var(--support);
  }
  .oppose .dot {
    background: var(--oppose);
  }
  .mixed .dot {
    background: linear-gradient(90deg, var(--support) 50%, var(--oppose) 50%);
  }
  .declined_to_answer .dot {
    border-color: var(--ink-2);
  }
  .no_public_position {
    color: var(--ink-2);
    font-weight: 500;
  }
  .no_public_position .dot {
    border-color: var(--muted);
  }
  .lead {
    color: var(--ink-2);
    font-weight: 500;
    font-style: italic;
  }
  .lead .dot {
    border: 2px dashed var(--warning);
  }
  .none {
    color: var(--muted);
    font-weight: 400;
  }
  .none .dot {
    border: 2px dashed var(--line-strong);
  }
</style>
