<script lang="ts">
  import { contestRoute, type Index } from "../lib/data";
  import { plural } from "../lib/format";

  let { ix }: { ix: Index } = $props();
  const refs = $derived(ix.contestRefs());
</script>

<section class="intro">
  <div class="eyebrow">{ix.b.fictional ? "Fictional demo dataset" : "Research draft"}</div>
  <h1>Where California candidates stand, who backs them, and who pays.</h1>
  <p>
    Each contest compares candidates side by side: identity, qualifications, past policies, stances, endorsements, campaign money,
    track record, controversies and promises. Every entry opens to its sources, with the exact quote or filing line. Gaps are shown as
    gaps.
  </p>
  <p class="facts num">
    {plural(refs.length, "contest")} · {plural(ix.people.size, "person", "people")} on record · {plural(ix.sources.size, "source")} ·
    {plural(ix.claimCount(), "citation")} · {plural(ix.b.tasks.filter((t) => !t.blocked_by).length, "open research task")}
  </p>
</section>

<section class="section">
  <div class="section-head">
    <h2>Contests</h2>
    <p>Progress counts how much of each contest’s fixed research agenda has a cited answer or a recorded gap.</p>
  </div>
  <div class="cards">
    {#each refs as ref (ref)}
      {@const p = ix.progress(ref)}
      {@const pct = p.total ? Math.round((p.done / p.total) * 100) : 0}
      {@const cands = ix.candidatesOf(ref)}
      {@const verified = ix.contests.has(ref)}
      {@const leads = ix.leads.get(ref)?.length ?? 0}
      {@const tasks = ix.tasksFor(ref).filter((t) => !t.blocked_by).length}
      <a class="card panel" href={`#${contestRoute(ref)}`}>
        <div class="card-top">
          <span class="eyebrow">{ix.kindOf(ref) === "measure" ? "Ballot measure" : "Office race"}</span>
          {#if verified}
            <span class="chip ok">✓ On official list</span>
          {:else}
            <span class="chip warn">! Not yet verified</span>
          {/if}
        </div>
        <h3>{ix.contestTitle(ref)}</h3>
        <p class="who">{cands.length ? cands.map((c) => ix.name(c)).join(" vs. ") : ix.electionOf(ref)}</p>
        {#if p.total}
          <div class="meter" role="img" aria-label={`${pct}% of research agenda done`}>
            <span style:width={`${pct}%`}></span>
          </div>
          <p class="meta num">{pct}% researched · {plural(tasks, "open task")}{leads ? ` · ${plural(leads, "unverified lead")}` : ""}</p>
        {:else}
          <p class="meta">No research agenda yet</p>
        {/if}
      </a>
    {/each}
  </div>
</section>

<style>
  .intro {
    display: grid;
    gap: 12px;
    max-width: 72ch;
  }
  h1 {
    font-size: var(--step-3);
    font-weight: 800;
    letter-spacing: -0.02em;
  }
  .intro p {
    color: var(--ink-2);
  }
  .facts {
    font-size: var(--step--1);
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 14px;
  }
  .card {
    display: grid;
    gap: 8px;
    padding: 16px;
    text-decoration: none;
    align-content: start;
  }
  .card:hover {
    border-color: var(--line-strong);
  }
  .card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  h3 {
    font-size: var(--step-2);
    font-weight: 700;
  }
  .who {
    color: var(--ink-2);
  }
  .meter {
    height: 6px;
    background: var(--wash);
    border-radius: 999px;
    overflow: hidden;
  }
  .meter span {
    display: block;
    height: 100%;
    background: var(--ink);
    border-radius: 999px;
  }
  .meta {
    font-size: var(--step--1);
    color: var(--muted);
  }
</style>
