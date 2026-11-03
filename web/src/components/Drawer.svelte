<script lang="ts">
  import type { Citation, Index } from "../lib/data";
  import { date, SOURCE_KIND_LABEL } from "../lib/format";
  import { ui } from "../lib/ui.svelte";

  let { ix }: { ix: Index } = $props();
  const d = $derived(ui.detail);
  let panel = $state<HTMLElement | null>(null);
  /** Longer target lists start collapsed. */
  const LIST_OPEN = 6;

  $effect(() => {
    if (d && panel) panel.focus();
  });

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape" && ui.detail) ui.detail = null;
  }
</script>

<svelte:window onkeydown={onKey} />

{#snippet citations(list: Citation[])}
  <ol class="cites">
    {#each list as c, i (i)}
      {@const s = ix.sources.get(c.source)}
      <li>
        {#if c.quote}
          <blockquote>{c.quote}</blockquote>
        {:else if c.unverified}
          <span class="chip warn wrap">Unverified · seen as {c.unverified.method} by {c.unverified.by}, {date(c.unverified.date)}</span>
        {:else if c.verified_by}
          <span class="chip warn wrap">Quote pending · verified by {c.verified_by.by}, {date(c.verified_by.date)}</span>
        {/if}
        {#if s}
          <div class="src">
            <a href={s["url"]} target="_blank" rel="noopener noreferrer">{s["title"]}</a>
            <span class="meta">
              {s["publisher"] ?? ""}{s["publisher"] ? " · " : ""}{SOURCE_KIND_LABEL[s["kind"]] ?? s["kind"]}{s["published"]
                ? ` · published ${date(s["published"])}`
                : ""} · accessed {date(s["accessed"])}
            </span>
            {#if c.locator}<span class="meta">Locator: <span class="mono">{c.locator}</span></span>{/if}
            {#if s["filing"]}
              <span class="meta mono">
                {s["filing"]["system"]} filer {s["filing"]["filer_id"]}{s["filing"]["filing_id"] ? ` · filing ${s["filing"]["filing_id"]}` : ""}{s[
                  "filing"
                ]["form"]
                  ? ` · Form ${s["filing"]["form"]}`
                  : ""}
              </span>
            {/if}
            {#if s["archive_url"]}
              <a class="meta" href={s["archive_url"]} target="_blank" rel="noopener noreferrer">Archived snapshot ↗</a>
            {:else}
              <span class="chip warn">! Not archived yet</span>
            {/if}
          </div>
        {:else}
          <div class="src mono">{c.source}</div>
        {/if}
      </li>
    {/each}
  </ol>
{/snippet}

{#if d}
  <div class="scrim" role="presentation" onclick={() => (ui.detail = null)}></div>
  <aside class="drawer" aria-label="Details and citations" tabindex="-1" bind:this={panel}>
    <div class="head">
      <div>
        {#if d.kicker}<div class="eyebrow">{d.kicker}</div>{/if}
        <h2>{d.title}</h2>
      </div>
      <button class="close" aria-label="Close" onclick={() => (ui.detail = null)}>✕</button>
    </div>
    <div class="body">
      {#if d.text}<p class="text">{d.text}</p>{/if}
      {#if d.facts?.length}
        <dl class="facts">
          {#each d.facts as [k, v] (k)}
            <dt>{k}</dt>
            <dd>{v}</dd>
          {/each}
        </dl>
      {/if}
      {#if d.note}<p class="note">{d.note}</p>{/if}

      {#if d.groups}
        <h3>{d.groups.title}</h3>
        {#each d.groups.items as g, i (i)}
          <section class="group">
            <div class="eyebrow">{g.label}</div>
            <p class="g-text">{g.text}</p>
            {#if g.list?.length && g.list.length > LIST_OPEN}
              <details class="targets">
                <summary>{g.list.length} named</summary>
                <ul>{#each g.list as t (t)}<li>{t}</li>{/each}</ul>
              </details>
            {:else if g.list?.length}
              <ul class="targets">{#each g.list as t (t)}<li>{t}</li>{/each}</ul>
            {/if}
            {#if g.citations.length}{@render citations(g.citations)}{/if}
          </section>
        {/each}
      {/if}

      {#if d.links?.length}
        <h3>Links</h3>
        <ul class="links">
          {#each d.links as l (l.href)}
            <li><a href={l.href} target="_blank" rel="noopener noreferrer">{l.label} ↗</a>{#if l.sub}<span class="meta">{l.sub}</span>{/if}</li>
          {/each}
        </ul>
      {/if}

      {#if d.citations?.length}
        <h3>Citations</h3>
        {@render citations(d.citations)}
      {/if}

      {#if d.searchLog?.length}
        <h3>Where we looked</h3>
        <p class="sub">Recorded research gap: nothing was found in these places. This is a fact about our research, not about the candidate.</p>
        <table class="grid">
          <thead><tr><th>Date</th><th>Where</th><th>Query</th></tr></thead>
          <tbody>
            {#each d.searchLog as s, i (i)}
              <tr><td class="num">{date(s.date)}</td><td>{s.where}</td><td>{s.query}</td></tr>
            {/each}
          </tbody>
        </table>
      {/if}

      {#if d.leads?.length}
        <h3>Unverified leads</h3>
        <p class="sub">
          Notes supplied to the project without sources. They are starting points for research and are <strong>not</strong> part of the
          cited dataset until confirmed in a primary source.
        </p>
        <ul class="leads">
          {#each d.leads as l, i (i)}
            <li>
              {#if l.label}<span class="eyebrow">{l.label}</span>{/if}
              <span>{l.text}</span>
              {#if l.hint}<span class="chip warn wrap">Suggests: {l.hint}</span>{/if}
            </li>
          {/each}
        </ul>
      {/if}

      {#if d.history?.length}
        <h3>Earlier entries</h3>
        {#each d.history as h, i (i)}
          <div class="hist">
            <div class="eyebrow">{h.label}</div>
            <p>{h.text}</p>
            {@render citations(h.citations)}
          </div>
        {/each}
      {/if}
    </div>
  </aside>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: color-mix(in srgb, var(--ink) 18%, transparent);
    z-index: 40;
  }
  .drawer {
    position: fixed;
    z-index: 41;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(520px, 100%);
    background: var(--surface);
    border-left: 1px solid var(--line-strong);
    display: flex;
    flex-direction: column;
    padding-top: env(safe-area-inset-top, 0px);
    padding-bottom: env(safe-area-inset-bottom, 0px);
    padding-right: env(safe-area-inset-right, 0px);
    outline: none;
  }
  .head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 18px 20px 12px;
    border-bottom: 1px solid var(--line);
  }
  .head h2 {
    font-size: var(--step-1);
  }
  .close {
    border: 1px solid var(--line-strong);
    background: var(--surface);
    border-radius: 999px;
    width: 32px;
    height: 32px;
    flex: none;
    cursor: pointer;
  }
  .body {
    overflow-y: auto;
    padding: 16px 20px 32px;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
    align-content: start;
  }
  h3 {
    font-size: var(--step--1);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    margin-top: 6px;
  }
  .text {
    font-size: var(--step-0);
  }
  .sub,
  .note {
    font-size: var(--step--1);
    color: var(--ink-2);
  }
  .facts {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 6px 14px;
    margin: 0;
    font-size: var(--step--1);
  }
  .facts dt {
    color: var(--muted);
  }
  .facts dd {
    margin: 0;
  }
  .cites {
    margin: 0;
    padding-left: 1.4em;
    display: grid;
    gap: 16px;
  }
  .cites li::marker {
    color: var(--muted);
    font-size: var(--step--1);
  }
  blockquote {
    margin: 0 0 6px;
    font-family: var(--font-quote);
    font-size: 1.02rem;
    line-height: 1.45;
    padding-left: 12px;
    border-left: 2px solid var(--line-strong);
  }
  .src {
    display: grid;
    gap: 2px;
    font-size: var(--step--1);
    justify-items: start;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .src > a:first-child {
    font-weight: 600;
  }
  .meta {
    color: var(--ink-2);
  }
  .leads {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 10px;
  }
  .leads li {
    display: grid;
    gap: 4px;
    justify-items: start;
    border: 1px dashed var(--warning);
    border-radius: var(--radius);
    padding: 10px 12px;
    font-size: var(--step--1);
  }
  .group {
    display: grid;
    gap: 6px;
    border-top: 1px solid var(--line);
    padding-top: 10px;
    min-width: 0;
  }
  .g-text {
    font-size: var(--step-0);
  }
  .targets {
    font-size: var(--step--1);
    color: var(--ink-2);
  }
  ul.targets,
  .targets ul {
    margin: 4px 0 0;
    padding-left: 1.2em;
    display: grid;
    gap: 2px;
  }
  .targets summary {
    cursor: pointer;
    font-weight: 600;
    color: var(--ink-2);
  }
  .links {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 6px;
    font-size: var(--step--1);
  }
  .links li {
    display: grid;
    gap: 1px;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .links a {
    font-weight: 600;
  }
  .hist {
    display: grid;
    gap: 6px;
    border-top: 1px solid var(--line);
    padding-top: 10px;
  }
  @media (max-width: 640px) {
    .drawer {
      top: auto;
      left: 0;
      width: 100%;
      max-height: 85%;
      border-left: 0;
      border-top: 1px solid var(--line-strong);
      border-radius: 12px 12px 0 0;
      padding-left: env(safe-area-inset-left, 0px);
    }
  }
</style>
