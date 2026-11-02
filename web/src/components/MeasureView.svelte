<script lang="ts">
  import type { Index } from "../lib/data";
  import { money, ROLE_LABEL } from "../lib/format";
  import { openDetail } from "../lib/ui.svelte";
  import { openPosition, openRel } from "../lib/view";
  import StanceChip from "./StanceChip.svelte";

  let { ix, contestRef }: { ix: Index; contestRef: string } = $props();
  const c = $derived(ix.contests.get(contestRef));
  const committees = $derived(ix.committeeRoles(contestRef));
  const endorsements = $derived(ix.endorsementsOf(contestRef));
  const ies = $derived(ix.ofType("independent_expenditure").filter((r) => r["target"] === contestRef));
  const askedIn = $derived(
    [...ix.agendas.entries()].filter(([, a]) => (a["measures"] as string[]).includes(contestRef)).map(([ref]) => ref),
  );
  const funders = (committee: string) => ix.ofType("contribution").filter((r) => r["recipient"] === committee);
</script>

<header class="head">
  <div class="eyebrow">{ix.electionOf(contestRef)} · Ballot measure</div>
  <h1>{ix.contestTitle(contestRef)}</h1>
  {#if c}
    <p class="title">
      {c["official_title"]["value"]}
      <button class="cite" onclick={() => openDetail({ kicker: "Official title", title: c["official_title"]["value"], citations: c["official_title"]["citations"] })}>
        {c["official_title"]["citations"].length}
      </button>
    </p>
    <p class="summary">
      {c["summary"]["value"]}
      <button class="cite" onclick={() => openDetail({ kicker: "Official summary", title: ix.contestTitle(contestRef), citations: c["summary"]["citations"] })}>
        {c["summary"]["citations"].length}
      </button>
    </p>
    <p class="muted">Placed on the ballot by {c["origin"]}.</p>
  {:else}
    <p class="chip warn">! Not yet verified against the official measure list</p>
  {/if}
</header>

<section class="section">
  <div class="section-head"><h2>Committees and their funders</h2><p>Committees formed to support or oppose this measure, from filings.</p></div>
  {#if committees.length}
    <div class="grid2">
      {#each committees as r (r["id"])}
        {@const f = funders(String(r["committee"]))}
        <div class="panel box">
          <span class="eyebrow">{ROLE_LABEL[r["role"]] ?? r["role"]}</span>
          <button class="link-btn strong" onclick={() => openRel(ix, r, ix.name(r["committee"]))}>{ix.name(r["committee"])}</button>
          <ul>
            {#each f as x (x["id"])}
              <li>
                <button class="link-btn" onclick={() => openRel(ix, x, `${ix.name(x["donor"])} → ${ix.name(x["recipient"])}`, [["Amount", money(x["money"]["amount_cents"])]])}>
                  {ix.name(x["donor"])}
                </button>
                <span class="num">{money(x["money"]["amount_cents"])}</span>
              </li>
            {:else}
              <li class="muted">No contributions recorded</li>
            {/each}
          </ul>
        </div>
      {/each}
    </div>
  {:else}
    <p class="empty">No committees recorded yet.</p>
  {/if}
  {#if ies.length}
    <ul class="plain">
      {#each ies as r (r["id"])}
        <li>
          <button class="link-btn" onclick={() => openRel(ix, r, ix.name(r["spender"]))}>{ix.name(r["spender"])}</button>
          spent <strong class="num">{money(r["money"]["amount_cents"])}</strong> {r["side"] === "support" ? "supporting" : "opposing"} (outside spending)
        </li>
      {/each}
    </ul>
  {/if}
</section>

<section class="section">
  <div class="section-head"><h2>Endorsements</h2></div>
  {#if endorsements.length}
    <ul class="plain">
      {#each endorsements as e (e["id"])}
        <li>
          <button class="link-btn" onclick={() => openRel(ix, e, ix.name(e["endorser"]))}>{ix.name(e["endorser"])}</button>
          · {e["side"] === "support" ? "Yes" : "No"}
        </li>
      {/each}
    </ul>
  {:else}
    <p class="empty">No endorsements recorded yet.</p>
  {/if}
</section>

{#if askedIn.length}
  <section class="section">
    <div class="section-head"><h2>Candidate stances on this measure</h2></div>
    <div class="scroll-x">
      <table class="grid">
        <thead><tr><th>Contest</th><th>Candidate</th><th>Stance</th></tr></thead>
        <tbody>
          {#each askedIn as ref (ref)}
            {#each ix.candidatesOf(ref) as p (p)}
              {@const pos = ix.latest(p, contestRef)}
              {@const ls = ix.leadsFor(ref, p, contestRef)}
              <tr>
                <td>{ix.contestTitle(ref)}</td>
                <td>{ix.name(p)}</td>
                <td>
                  <button class="link-btn" onclick={() => openPosition(ix, p, contestRef, ref)}>
                    <StanceChip stance={pos ? String(pos["stance"]) : null} lead={ls.find((l) => l.hint)?.hint ?? null} leadCount={ls.length} />
                  </button>
                </td>
              </tr>
            {/each}
          {/each}
        </tbody>
      </table>
    </div>
  </section>
{/if}

<style>
  .head {
    display: grid;
    gap: 10px;
    max-width: 75ch;
  }
  h1 {
    font-size: var(--step-3);
    font-weight: 800;
  }
  .title {
    font-size: var(--step-1);
    font-weight: 600;
  }
  .summary {
    color: var(--ink-2);
  }
  .grid2 {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 12px;
  }
  .box {
    padding: 14px;
    display: grid;
    gap: 6px;
    align-content: start;
  }
  .box ul,
  .plain {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
    font-size: var(--step--1);
  }
  .box li {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .link-btn {
    border: 0;
    background: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
  }
  .link-btn:hover {
    text-decoration: underline;
  }
  .strong {
    font-weight: 700;
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
