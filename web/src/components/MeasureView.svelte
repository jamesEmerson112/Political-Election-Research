<script lang="ts">
  import type { Index } from "../lib/data";
  import { money, ROLE_LABEL } from "../lib/format";
  import { openDetail } from "../lib/ui.svelte";
  import { openPosition, openRel } from "../lib/view";
  import StanceChip from "./StanceChip.svelte";
  import OfficeChips from "./OfficeChips.svelte";
  import AffectedGroups from "./AffectedGroups.svelte";
  import MeasureArguments from "./MeasureArguments.svelte";
  import MeasureDigest from "./MeasureDigest.svelte";
  import MeasureComparison from "./MeasureComparison.svelte";
  import MyPick from "./MyPick.svelte";
  import ResultBar from "./ResultBar.svelte";
  import { measureOutcome } from "../lib/results";
  import { contestRoute } from "../lib/data";
  import { measureLabel } from "../lib/measureLabel";
  import { budgetBase, fiscalChips, measureFactChips } from "../lib/measureChips";

  let { ix, contestRef }: { ix: Index; contestRef: string } = $props();
  const c = $derived(ix.contests.get(contestRef));
  /** The recorded count (semi-official or certified), if any. */
  const outcome = $derived(measureOutcome(c));
  const committees = $derived(ix.committeeRoles(contestRef));
  const endorsements = $derived(ix.endorsementsOf(contestRef));
  const ies = $derived(ix.ofType("independent_expenditure").filter((r) => r["target"] === contestRef));
  const askedIn = $derived(
    [...ix.agendas.entries()].filter(([, a]) => (a["measures"] as string[]).includes(contestRef)).map(([ref]) => ref),
  );
  const funders = (committee: string) => ix.ofType("contribution").filter((r) => r["recipient"] === committee);
  const label = (ref: string) => measureLabel(ix, ref);
  const cites = (v: unknown) => ((v as { citations?: unknown[] } | undefined)?.citations ?? []) as never[];
</script>

<header class="head">
  <div class="eyebrow">{ix.electionOf(contestRef)} · Ballot measure</div>
  <h1>{ix.contestTitle(contestRef)}</h1>
  {#if outcome}
    <div class="result"><ResultBar o={outcome} title={ix.contestTitle(contestRef)} /></div>
  {/if}
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
    {#if c["jurisdiction"] || c["measure_type"]}
      <p class="facts">
        {#if c["jurisdiction"]}<span class="muted">{c["jurisdiction"]["name"]}</span>{/if}
        <OfficeChips chips={measureFactChips(c)} />
      </p>
    {:else}
      <p class="muted">Placed on the ballot by {c["origin"]}.</p>
    {/if}
  {:else}
    <p class="chip warn">! Not yet verified against the official measure list</p>
  {/if}
  <MyPick {ix} {contestRef} kind="measure" />
</header>

{#if c?.["digest"] || c?.["fiscal"] || c?.["conflicts"]}
  <section class="section">
    <div class="section-head"><h2>What it does, and what it costs</h2><p>The official digest and fiscal statement, as published. Click a number for its source.</p></div>
    {#if c["digest"]}
      <div class="panel box"><MeasureDigest digest={c["digest"]} /></div>
    {/if}
    <div class="panel box">
      <span class="eyebrow">Who it affects</span>
      <AffectedGroups affects={c["affects"]} args={c["arguments"]} title={ix.contestTitle(contestRef)} />
    </div>
    {#if c["fiscal"]}
      {@const f = c["fiscal"]}
      <div class="panel box">
        <span class="eyebrow">{f["statement_by"]} · fiscal statement</span>
        <OfficeChips chips={fiscalChips(c, label, budgetBase(ix.budgetFor(contestRef)))} />
        {#if f["summary"]}
          <p>{f["summary"]["summary"]} <button class="cite" onclick={() => openDetail({ kicker: `${f["statement_by"]} · fiscal statement`, title: ix.contestTitle(contestRef), citations: cites(f["summary"]) })}>{cites(f["summary"]).length}</button></p>
        {/if}
        <ul>
          {#each f["effects"] as e (e["id"])}
            <li>
              {e["text"]}{#if e["estimate"] === "in_words"} <span class="muted">(sized in words; not added up)</span>{/if}
              <button
                class="cite"
                onclick={() =>
                  openDetail({
                    kicker: `${f["statement_by"]} · fiscal statement`,
                    title: e["text"],
                    citations: cites(e),
                    note: e["note"] ? `Recorder's note (how this record reads the statement): ${e["note"]}` : undefined,
                  })}>{cites(e).length}</button
              >
            </li>
          {/each}
        </ul>
        <a href="#trial">Add it to your trial ballot ›</a>
      </div>
    {/if}
    {#each c["conflicts"] ?? [] as k (k["contest"])}
      <p class="chip wrap">Competes with <a href={`#${contestRoute(k["contest"])}`}>{label(k["contest"])}</a>: {k["rule"]}</p>
    {/each}
  </section>
{/if}

{#if c?.["comparison"]}
  <section class="section">
    <div class="section-head"><h2>How it compares</h2><p>A comparison table the site's maintainer supplied. Click a number for its source.</p></div>
    <MeasureComparison cmp={c["comparison"]} measure={ix.contestTitle(contestRef)} />
  </section>
{/if}

{#if c?.["arguments"]?.length}
  <section class="section">
    <div class="section-head"><h2>Arguments, side by side</h2><p>From the official voter guide, as printed. Click an argument to read it in full.</p></div>
    <MeasureArguments args={c["arguments"]} title={ix.contestTitle(contestRef)} />
  </section>
{/if}

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
  .result {
    max-width: 40rem;
    margin: 4px 0 2px;
  }
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
