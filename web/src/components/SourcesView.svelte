<script lang="ts">
  import type { Index } from "../lib/data";
  import { date, SOURCE_KIND_LABEL } from "../lib/format";

  let { ix }: { ix: Index } = $props();
</script>

<header class="head">
  <h1>Sources</h1>
  <p>
    Every source is registered once, with an id derived from its URL, the date we accessed it, and a Wayback snapshot so quotes can be
    checked against the exact text we saw.
  </p>
</header>

{#if ix.b.sources.length}
  <div class="scroll-x">
    <table class="grid">
      <thead>
        <tr><th>Source</th><th>Kind</th><th>Published</th><th>Accessed</th><th>Archived</th><th class="num">Citations</th></tr>
      </thead>
      <tbody>
        {#each ix.b.sources as s (s["id"])}
          <tr>
            <td>
              <a href={s["url"]} target="_blank" rel="noopener noreferrer"><strong>{s["title"]}</strong></a><br />
              <span class="muted">{s["publisher"] ?? ""}</span>
              {#if s["filing"]}<br /><span class="mono muted">{s["filing"]["system"]} · filer {s["filing"]["filer_id"]}{s["filing"]["form"] ? ` · Form ${s["filing"]["form"]}` : ""}</span>{/if}
            </td>
            <td>{SOURCE_KIND_LABEL[s["kind"]] ?? s["kind"]}</td>
            <td class="num">{date(s["published"])}</td>
            <td class="num">{date(s["accessed"])}</td>
            <td>
              {#if s["archive_url"]}
                <a href={s["archive_url"]} target="_blank" rel="noopener noreferrer">Snapshot ↗</a>
              {:else}
                <span class="chip warn">! Not archived</span>
              {/if}
            </td>
            <td class="num">{ix.citedBy.get(`src:${s["id"]}`) ?? 0}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{:else}
  <p class="empty">No sources registered yet. Sources are added with <span class="mono">npm run put -- source</span> as research is done.</p>
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
</style>
