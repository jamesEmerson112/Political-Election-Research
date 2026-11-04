<script lang="ts">
  import NotebookPen from "@lucide/svelte/icons/notebook-pen";
  import type { Index } from "../lib/data";
  import { loadPicks, NOTE_MAX, setPick, type Pick } from "../lib/myPicks";

  /** The visitor's own pick and note for one contest, kept only in this browser (exported from the Overview). */
  let { ix, contestRef, kind }: { ix: Index; contestRef: string; kind: "office" | "measure" } = $props();

  let entry = $state<Pick>({});
  let note = $state("");
  $effect(() => {
    // Read the saved entry once per contest (a local, so the effect doesn't depend on its own writes).
    const saved = loadPicks()[contestRef] ?? {};
    entry = saved;
    note = saved.note ?? "";
  });
  const options = $derived(
    kind === "measure"
      ? [
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
        ]
      : ix.candidatesOf(contestRef).map((p) => {
          const party = ix.ballotEntry(contestRef, p)?.["party"];
          return { value: p, label: ix.name(p), party: typeof party === "string" ? party : "" };
        }),
  );
  function choose(value: string) {
    entry = setPick(contestRef, { ...entry, pick: entry.pick === value ? undefined : value })[contestRef] ?? {};
  }
  function saveNote() {
    entry = setPick(contestRef, { ...entry, note })[contestRef] ?? {};
  }
</script>

<section class="mine" aria-labelledby={`mine-${contestRef}`}>
  <h2 id={`mine-${contestRef}`}><NotebookPen size={16} aria-hidden="true" /> My pick</h2>
  {#if options.length}
    <div class="opts" role="group" aria-labelledby={`mine-${contestRef}`}>
      {#each options as o (o.value)}
        <button class:on={entry.pick === o.value} aria-pressed={entry.pick === o.value} onclick={() => choose(o.value)}>
          {o.label}{#if "party" in o && o.party}<span class="party">{o.party}</span>{/if}
        </button>
      {/each}
    </div>
  {:else}
    <p class="hint">Candidates aren't listed yet; you can still write a note.</p>
  {/if}
  <label class="note">
    <span>Note <small>(optional)</small></span>
    <textarea bind:value={note} onblur={saveNote} maxlength={NOTE_MAX} rows="2" placeholder="Why, or what to check before voting"></textarea>
  </label>
  <p class="hint">Saved in this browser only, never sent anywhere. Export all your picks as a text file from the Overview, under My ballot. Click a pick again to clear it.</p>
</section>

<style>
  .mine {
    display: grid;
    gap: 8px;
    margin-top: 12px;
    padding: 10px 12px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    background: var(--surface);
  }
  h2 {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--step-0);
    font-weight: 800;
  }
  .opts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .opts button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    padding: 4px 11px;
    border: 1px dashed var(--line-strong);
    border-radius: 999px;
    background: var(--surface);
    color: var(--ink);
    font-size: var(--step--1);
    font-weight: 600;
    cursor: pointer;
  }
  .opts button:hover {
    background: var(--wash);
  }
  .opts button.on {
    border-style: solid;
    border-color: var(--ink);
    background: var(--ink);
    color: var(--surface);
  }
  .party {
    font-weight: 400;
    opacity: 0.85;
  }
  .note {
    display: grid;
    gap: 3px;
    font-size: var(--step--1);
    font-weight: 600;
    color: var(--ink-2);
  }
  textarea {
    font: inherit;
    font-size: var(--step--1);
    color: var(--ink);
    background: var(--surface);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    padding: 6px 8px;
    resize: vertical;
  }
  .hint {
    font-size: var(--step--1);
    color: var(--ink-2);
    margin: 0;
  }
</style>
