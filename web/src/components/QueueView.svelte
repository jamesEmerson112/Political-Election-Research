<script lang="ts">
  import type { Index } from "../lib/data";
  import { plural, TASK_LABEL } from "../lib/format";
  import { need, parts } from "../lib/parts.svelte";

  let { ix }: { ix: Index } = $props();
  // The full task list is fetched once, when this page opens (lib/parts.svelte.ts).
  $effect(() => need(ix.b.lazy, "tasks"));
  let showBlocked = $state(false);
  let contest = $state("all");
  const refs = $derived([...new Set(ix.b.tasks.map((t) => t.contest))]);
  const tasks = $derived(ix.b.tasks.filter((t) => (showBlocked || !t.blocked_by) && (contest === "all" || t.contest === contest)));

  function item(i: string | undefined): string {
    if (!i) return "";
    if (i.startsWith("q:")) return ix.questions.get(i)?.q["text"] ?? i;
    if (i.startsWith("contest:")) return ix.listTitle(i);
    return i.replace(/_/g, " ");
  }
</script>

<header class="head">
  <h1>Research queue</h1>
  <p>
    The same list <span class="mono">npm run next</span> gives an agent: the agenda minus what has been verified, in a fixed order. Agents
    take the first open task. Leads are unverified notes attached to the task they bear on.
  </p>
</header>

<div class="filters">
  <label for="q-contest">Contest</label>
  <select id="q-contest" bind:value={contest}>
    <option value="all">All contests</option>
    {#each refs as r (r)}<option value={r}>{ix.listTitle(r)}</option>{/each}
  </select>
  <label class="check"><input id="q-blocked" type="checkbox" bind:checked={showBlocked} /> Show blocked tasks</label>
  <span class="muted">{plural(tasks.length, "task")}</span>
</div>

{#if !ix.ready("tasks")}
  <p class="empty" aria-busy={!parts.failed.includes("tasks")}>
    {parts.failed.includes("tasks") ? "The task list couldn't load. Reload the page to try again." : `Loading ${plural(ix.openTaskTotal(), "open task")}…`}
  </p>
{:else if tasks.length}
  <div class="scroll-x" tabindex="0" role="region" aria-label="Open research tasks (scrolls sideways)">
    <table class="grid">
      <thead><tr><th class="num">#</th><th>Task</th><th>Subject</th><th>Writes to</th><th>Leads</th></tr></thead>
      <tbody>
        {#each tasks as t, i (t.id)}
          <tr class:blocked={!!t.blocked_by}>
            <td class="num">{i + 1}</td>
            <td><strong>{TASK_LABEL[t.kind] ?? t.kind}</strong><br /><span class="muted">{ix.listTitle(t.contest)}</span></td>
            <td>
              {t.subject ? ix.name(t.subject) : ""}{t.item ? ` · ${item(t.item)}` : ""}
              {#if t.blocked_by}<br /><span class="chip">Waits for: {t.blocked_by.split("|").slice(1).join(" ")}</span>{/if}
            </td>
            <td><span class="mono">{t.file}</span></td>
            <td>
              {#each t.leads ?? [] as l, j (j)}<div class="lead">{l}</div>{/each}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{:else}
  <p class="empty">No open tasks.</p>
{/if}

<style>
  .head {
    display: grid;
    gap: 10px;
    max-width: 72ch;
  }
  h1 {
    font-size: var(--step-3);
    font-weight: 800;
  }
  .head p {
    color: var(--ink-2);
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 14px;
    font-size: var(--step--1);
  }
  select {
    font: inherit;
    padding: 4px 8px;
    border-radius: var(--radius);
    border: 1px solid var(--line-strong);
    background: var(--surface);
    color: var(--ink);
  }
  .check {
    display: inline-flex;
    gap: 6px;
    align-items: center;
  }
  tr.blocked td {
    color: var(--muted);
  }
  .lead {
    font-style: italic;
    color: var(--ink-2);
    border-left: 2px dashed var(--warning);
    padding-left: 8px;
    margin-bottom: 4px;
  }
</style>
