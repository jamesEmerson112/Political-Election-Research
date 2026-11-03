<script lang="ts">
  import type { Index, Rec } from "../lib/data";
  import { contestRoute } from "../lib/data";
  import { date } from "../lib/format";

  let { ix }: { ix: Index } = $props();
  const usedIn = (qref: string) =>
    [...ix.agendas.entries()].filter(([, a]) => (a["questions"] as string[]).includes(qref)).map(([ref]) => ref);
</script>

<header class="head">
  <h1>Issues and questions</h1>
  <p>
    Each question is fixed before any stance research starts and defines exactly what “supports” and “opposes” mean, so every candidate is
    measured against the same wording. Questions considered and rejected are kept with the reason.
  </p>
</header>

{#each ix.b.issues as issue (issue["id"])}
  <section class="section">
    <div class="section-head"><h2>{issue["name"]}</h2><p>{issue["description"]}</p></div>
    <div class="qs">
      {#each issue["questions"] as q (q["id"])}
        {@const ref = `q:${issue["id"]}/${q["id"]}`}
        <article class="panel q">
          <h3>{q["text"]}</h3>
          <dl>
            <dt><span class="dot support"></span>Supports means</dt>
            <dd>{q["support_means"]}</dd>
            <dt><span class="dot oppose"></span>Opposes means</dt>
            <dd>{q["oppose_means"]}</dd>
          </dl>
          {#if q["notes"]}<p class="muted">{q["notes"]}</p>{/if}
          <p class="meta">
            <span class="mono">{ref}</span> · added {date(q["added"])}
            {#each usedIn(ref) as c (c)} · <a href={`#${contestRoute(c)}`}>{ix.contestTitle(c)}</a>{/each}
          </p>
        </article>
      {/each}
    </div>
    {#if (issue["rejected_questions"] as Rec[]).length}
      <details>
        <summary>Rejected questions</summary>
        <ul>
          {#each issue["rejected_questions"] as r, i (i)}<li>{r["text"]}: <span class="muted">{r["reason"]}</span></li>{/each}
        </ul>
      </details>
    {/if}
  </section>
{/each}

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
  .qs {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 12px;
  }
  .q {
    padding: 14px 16px;
    display: grid;
    gap: 10px;
    align-content: start;
  }
  h3 {
    font-size: var(--step-0);
    font-weight: 700;
  }
  dl {
    margin: 0;
    display: grid;
    gap: 2px;
    font-size: var(--step--1);
  }
  dt {
    font-weight: 600;
  }
  dd {
    margin: 0 0 6px;
    color: var(--ink-2);
  }
  .dot {
    display: inline-block;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    margin-right: 6px;
  }
  .dot.support {
    background: var(--support);
  }
  .dot.oppose {
    background: var(--oppose);
  }
  .meta {
    font-size: var(--step--1);
    color: var(--muted);
  }
  details {
    font-size: var(--step--1);
  }
</style>
