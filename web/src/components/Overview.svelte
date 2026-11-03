<script lang="ts">
  import Search from "@lucide/svelte/icons/search";
  import { contestRoute, officeOf, slugOf, type Index } from "../lib/data";
  import { plural } from "../lib/format";
  import { OFFICE_ORDER, OFFICE_TYPE } from "../lib/icons";
  import Badge from "./Badge.svelte";

  let { ix }: { ix: Index } = $props();
  let q = $state("");

  /** Every contest, once, with what the index needs; grouped by office type, districts in numeric order. */
  const rows = $derived(
    ix.contestRefs().map((ref) => {
      const kind = ix.kindOf(ref);
      const office = officeOf(ref, kind);
      const cands = ix.candidatesOf(ref);
      const names = cands.map((c) => ix.name(c));
      const p = ix.progress(ref);
      const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
      const tasks = ix.tasksFor(ref).filter((t) => !t.blocked_by).length;
      const leads = ix.leads.get(ref)?.length ?? 0;
      const title = ix.contestTitle(ref);
      const district = /-(\d+)$/.exec(slugOf(ref))?.[1];
      const hay = [title, slugOf(ref), ...names, district ? `ca-${district} ca ${district} district ${district}` : ""].join(" ").toLowerCase();
      return { ref, kind, office, names, pct, hasAgenda: p.total > 0, tasks, leads, title, verified: ix.contests.has(ref), hay };
    }),
  );
  const filtered = $derived.by(() => {
    const terms = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return terms.length ? rows.filter((r) => terms.every((t) => r.hay.includes(t))) : rows;
  });
  const groups = $derived(
    OFFICE_ORDER.map((type) => ({
      type,
      rows: filtered
        .filter((r) => r.office.type === type)
        .sort((a, b) => a.office.sort[0] - b.office.sort[0] || a.office.sort[1].localeCompare(b.office.sort[1])),
    })).filter((g) => g.rows.length),
  );
  const openTasks = $derived(ix.b.tasks.filter((t) => !t.blocked_by).length);
</script>

<section class="intro">
  <div class="eyebrow">{ix.b.fictional ? "Fictional demo dataset" : "Research draft"}</div>
  <h1>California contests</h1>
  <p class="facts num">
    <span><strong>{rows.length}</strong> contests</span>
    <span><strong>{ix.people.size}</strong> people</span>
    <span><strong>{ix.sources.size}</strong> sources</span>
    <span><strong>{ix.claimCount()}</strong> citations</span>
    <span><strong>{openTasks}</strong> open tasks</span>
  </p>
</section>

<section class="section">
  <div class="filter">
    <label for="contest-filter" class="sr">Filter contests</label>
    <Search size={16} aria-hidden="true" />
    <input id="contest-filter" type="search" placeholder="Filter by candidate, office or district (e.g. CA-27)" bind:value={q} autocomplete="off" />
    <span class="muted num" aria-live="polite">{filtered.length} of {rows.length}</span>
  </div>

  {#each groups as g (g.type)}
    <div class="group">
      <h2 class="g-head">
        <Badge icon={OFFICE_TYPE[g.type].icon} group="record" size={22} />
        {OFFICE_TYPE[g.type].label}
        <span class="g-count num">{g.rows.length}</span>
      </h2>
      <ul class="list">
        {#each g.rows as r (r.ref)}
          <li>
            <a class="crow" href={`#${contestRoute(r.ref)}`}>
              <Badge icon={OFFICE_TYPE[r.office.type].icon} group="record" size={26} />
              <span class="c-main">
                <span class="c-title">{r.title}</span>
                <span class="c-who">{r.names.length ? r.names.join(" · ") : r.kind === "measure" ? "Ballot measure" : "Candidates not set"}</span>
              </span>
              <span class="c-meta num">
                {#if r.hasAgenda}
                  <span class="meter" role="img" aria-label={`${r.pct}% researched`}><span style:width={`${r.pct}%`}></span></span>
                  <span class="pct">{r.pct}%</span>
                {/if}
                <span class="tasks" title={`${plural(r.tasks, "open task")}${r.leads ? `, ${plural(r.leads, "unverified lead")}` : ""}`}>
                  {r.tasks}<span class="unit">{r.tasks === 1 ? "task" : "tasks"}</span>
                </span>
                {#if !r.verified}<span class="unv" title="Candidates not yet verified against the official list">unverified</span>{/if}
              </span>
            </a>
          </li>
        {/each}
      </ul>
    </div>
  {:else}
    <p class="empty">No contest matches “{q}”.</p>
  {/each}
</section>

<style>
  .intro {
    display: grid;
    gap: 8px;
  }
  h1 {
    font-size: var(--step-3);
    font-weight: 800;
    letter-spacing: -0.02em;
  }
  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    font-size: var(--step--1);
    color: var(--ink-2);
  }
  .facts strong {
    color: var(--ink);
    font-size: var(--step-0);
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .filter {
    display: flex;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    background: var(--surface);
    padding: 4px 14px;
    color: var(--muted);
    font-size: var(--step--1);
  }
  .filter input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    font: inherit;
    font-size: var(--step-0);
    color: var(--ink);
    padding: 6px 0;
    outline: none;
  }
  .filter:focus-within {
    border-color: var(--ink);
  }
  .group {
    display: grid;
    gap: 6px;
  }
  .g-head {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--step-0);
    font-weight: 800;
    padding-top: 10px;
  }
  .g-count {
    color: var(--muted);
    font-weight: 600;
    font-size: var(--step--1);
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .list li + li {
    border-top: 1px solid var(--line);
  }
  .crow {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    text-decoration: none;
    min-height: 48px;
  }
  .crow:hover {
    background: color-mix(in srgb, var(--wash) 60%, transparent);
  }
  .c-main {
    display: grid;
    min-width: 0;
  }
  .c-title {
    font-weight: 700;
  }
  .c-who {
    color: var(--ink-2);
    font-size: var(--step--1);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .c-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--step--1);
    color: var(--ink-2);
  }
  .meter {
    display: inline-block;
    width: 48px;
    height: 6px;
    border-radius: 999px;
    background: var(--wash);
    overflow: hidden;
  }
  .meter span {
    display: block;
    height: 100%;
    background: var(--ink);
  }
  .pct {
    min-width: 3ch;
    text-align: right;
  }
  .tasks {
    font-weight: 700;
    color: var(--ink);
    white-space: nowrap;
  }
  .unit {
    font-weight: 400;
    color: var(--ink-2);
    margin-left: 0.25em;
  }
  .unv {
    border: 1px solid var(--warning);
    background: var(--warning-wash);
    color: var(--ink);
    border-radius: 999px;
    padding: 0 7px;
    font-size: 0.7rem;
  }
  @media (max-width: 560px) {
    .crow {
      grid-template-columns: auto minmax(0, 1fr);
      gap: 4px 10px;
    }
    .c-meta {
      grid-column: 2;
    }
  }
</style>
