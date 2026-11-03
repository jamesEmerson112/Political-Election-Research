<script lang="ts">
  import { openDetail } from "../lib/ui.svelte";

  type Cmp = {
    title: string;
    columns: string[];
    rows: Array<{ label: string; cells: string[] }>;
    sources: Array<{ verifies: string; citations: never[] }>;
    note?: string;
  };
  let { cmp, measure }: { cmp: Cmp; measure: string } = $props();
  const unverified = $derived(cmp.sources.some((s) => s.citations.some((c: { quote?: string }) => !c.quote)));
</script>

<div class="panel box">
  <div class="top">
    <span class="eyebrow">{cmp.title}</span>
    {#if unverified}<span class="chip warn" title="The cells have not been checked against the sources yet">! Unverified</span>{/if}
  </div>
  <div class="scroll" role="region" aria-label={cmp.title} tabindex="0">
    <table>
      <thead>
        <tr>
          {#each cmp.columns as col, i (i)}<th scope="col">{col}</th>{/each}
        </tr>
      </thead>
      <tbody>
        {#each cmp.rows as r, i (i)}
          <tr>
            <th scope="row">{r.label}</th>
            {#each r.cells as cell, j (j)}<td>{cell}</td>{/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if cmp.note}<p class="muted note">{cmp.note}</p>{/if}
  <span class="eyebrow">Sources</span>
  <ul>
    {#each cmp.sources as s, i (i)}
      <li>
        <span>{s.verifies}</span>
        <button class="cite" onclick={() => openDetail({ kicker: `${cmp.title} · source`, title: s.verifies, citations: s.citations, note: `Named as a source for this table on ${measure}.` })}>
          {s.citations.length}
        </button>
      </li>
    {/each}
  </ul>
</div>

<style>
  .box {
    padding: 14px;
    display: grid;
    gap: 8px;
  }
  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .scroll {
    overflow-x: auto;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    min-width: 560px;
    font-size: var(--step--1);
  }
  th,
  td {
    text-align: left;
    vertical-align: top;
    padding: 6px 8px;
    border-bottom: 1px solid var(--line);
  }
  thead th {
    font-weight: 700;
    border-bottom: 1px solid var(--line-strong);
  }
  tbody th {
    font-weight: 600;
  }
  /* Row labels stay in view while the table scrolls sideways on a phone. */
  th:first-child {
    position: sticky;
    left: 0;
    background: var(--surface);
    max-width: 9.5em;
  }
  .note {
    font-size: var(--step--1);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
    font-size: var(--step--1);
  }
  li {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .cite {
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    border-radius: 4px;
    border: 1px solid var(--line-strong);
    background: var(--surface);
    font-size: 0.7rem;
    font-weight: 700;
    cursor: pointer;
  }
</style>
