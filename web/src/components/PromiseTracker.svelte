<script lang="ts">
  import Info from "@lucide/svelte/icons/info";
  import type { Index } from "../lib/data";
  import { date, plural } from "../lib/format";
  import { PROMISE_STATUS_ICON, TRACKER_ICON } from "../lib/icons";
  import { countLine, officeOutcome, pct1, winnerWord } from "../lib/results";
  import { STATUS_LABEL, STATUS_MEANS, STATUS_ORDER, statusCounts, trackedPromises, type TrackedPromise } from "../lib/tracker";
  import { openDetail } from "../lib/ui.svelte";
  import { openOfficeCount } from "../lib/view";
  import Badge from "./Badge.svelte";

  /**
   * After the election: each winner's campaign promises with what the official record shows since.
   * Statuses come only from cited official records; until someone checks, a promise is "Not checked yet".
   */
  let { ix, contestRef }: { ix: Index; contestRef: string } = $props();

  type Rec = Record<string, any>;
  const contest = $derived(ix.contests.get(contestRef) as Rec | undefined);
  const outcome = $derived(officeOutcome(contest));
  const dossierOf = (person: string) => ix.b.dossiers.find((d: Rec) => d["actor"] === person) as Rec | undefined;
  const cands = $derived(ix.candidatesOf(contestRef));
  const promiseCount = (person: string) => trackedPromises(dossierOf(person)).length;
  const total = $derived(cands.reduce((a, c) => a + promiseCount(c), 0));
  const withPromises = $derived(cands.filter((c) => promiseCount(c) > 0).length);
  const winners = $derived(outcome ? outcome.rows.filter((r) => r.won) : []);
  const topicLabel = $derived(
    new Map((((ix.agendas.get(contestRef) as Rec | undefined)?.["promise_topics"] as Rec[] | undefined) ?? []).map((t) => [String(t["id"]), String(t["label"])])),
  );

  function openPromise(person: string, p: TrackedPromise) {
    const latest = p.updates[p.updates.length - 1];
    openDetail({
      kicker: `${ix.name(person)} · Promise tracker`,
      title: p.title,
      facts: [
        ["Status", `${STATUS_LABEL[p.status]}${latest ? ` (${date(latest.date)})` : ""}`],
        ["Record checked", p.checked ? date(p.checked) : "Not yet"],
        ...(p.topic && topicLabel.get(p.topic) ? ([["Topic", topicLabel.get(p.topic)!]] as Array<[string, string]>) : []),
      ],
      text: `Campaign promise: ${p.summary}`,
      citations: p.citations,
      history: [...p.updates].reverse().map((u) => ({ label: `${date(u.date)} · ${STATUS_LABEL[u.status]}`, text: u.summary, citations: u.citations })),
      searchLog: p.searchLog,
      note:
        p.status === "not_checked"
          ? "Not checked yet: tracking starts after the office-holder takes office. A status changes only with an official record (a bill, vote, budget, order or minutes)."
          : STATUS_MEANS[p.status],
    });
  }
  const openCount = () => outcome && openOfficeCount(ix, contestRef, outcome);
</script>

<section class="section tracker" aria-labelledby="tracker-h">
  <div class="section-head">
    <h2 id="tracker-h"><Badge icon={TRACKER_ICON} group="record" size={22} /> Promise tracker</h2>
    <details class="about">
      <summary><Info size={14} aria-hidden="true" /> How statuses are set</summary>
      <ul class="means">
        {#each STATUS_ORDER as s (s)}
          {@const I = PROMISE_STATUS_ICON[s]!}
          <li><span class="st"><I size={14} aria-hidden="true" /> {STATUS_LABEL[s]}</span> {STATUS_MEANS[s]}</li>
        {/each}
      </ul>
      <p>Only the winner's promises are tracked. A status changes only with an official record (bill status, vote record, adopted budget, order or minutes); news stories are leads.</p>
    </details>
  </div>

  {#if !total}
    <p class="empty">No campaign promises recorded for this contest yet.</p>
  {:else if !winners.length}
    <p class="wait">
      <strong>Waiting for results.</strong> When the official count names a winner, their campaign promises appear here, each starting at
      “{STATUS_LABEL.not_checked}”. Recorded so far: {plural(total, "promise")} from {plural(withPromises, "candidate")}.
    </p>
  {:else}
    {#each winners as w (w.person)}
      {@const ps = trackedPromises(dossierOf(w.person))}
      <article class="winner">
        <header class="w-head">
          <span class="w-name">{ix.name(w.person)}</span>
          <button class="w-count" onclick={openCount} title="Votes and source">
            {winnerWord(outcome!)}{outcome!.certified ? "" : " in the semi-official count"} · {pct1(w.share)} · {countLine(outcome!).replace(/^Semi-official count · /, "")}
          </button>
        </header>
        {#if ps.length}
          <p class="counts num" aria-label="Promises by status">
            <span class="total">{plural(ps.length, "promise")}</span>
            {#each statusCounts(ps) as [s, n] (s)}
              {@const I = PROMISE_STATUS_ICON[s]!}
              <span class="cnt"><I size={14} aria-hidden="true" /> {n} {STATUS_LABEL[s].toLowerCase()}</span>
            {/each}
          </p>
          <ul class="list">
            {#each ps as p (p.id)}
              {@const I = PROMISE_STATUS_ICON[p.status]!}
              {@const latest = p.updates[p.updates.length - 1]}
              <li>
                <button class="p-btn" class:unchecked={p.status === "not_checked"} onclick={() => openPromise(w.person, p)}>
                  <span class="st"><I size={15} aria-hidden="true" /> {STATUS_LABEL[p.status]}</span>
                  <span class="p-title">{p.title}</span>
                  {#if latest}<span class="p-date num">{date(latest.date)}</span>{:else if p.checked}<span class="p-date num">checked {date(p.checked)}</span>{/if}
                </button>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="empty">No campaign promises recorded for {ix.name(w.person)}.</p>
        {/if}
      </article>
    {/each}
    {#if !outcome?.certified}
      <p class="hint">Tracking starts after the winner takes office. The count is semi-official until certified, so the leader can still change.</p>
    {/if}
  {/if}
</section>

<style>
  .tracker {
    display: grid;
    gap: 12px;
  }
  .about {
    font-size: var(--step--1);
    color: var(--ink-2);
    max-width: 80ch;
  }
  .about summary {
    cursor: pointer;
    color: var(--muted);
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    list-style: none;
  }
  .about summary::-webkit-details-marker {
    display: none;
  }
  .about p {
    margin: 6px 0 0;
  }
  .means {
    display: grid;
    gap: 4px;
    margin: 8px 0;
    padding: 0;
    list-style: none;
    font-size: var(--step--1);
  }
  .means .st {
    font-weight: 700;
    margin-right: 4px;
  }
  .st {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
    color: var(--ink);
  }
  .wait,
  .empty {
    margin: 0;
    font-size: var(--step--1);
    color: var(--ink-2);
  }
  .winner {
    display: grid;
    gap: 8px;
    padding: 12px 14px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .w-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 12px;
  }
  .w-name {
    font-size: var(--step-1);
    font-weight: 800;
  }
  .w-count {
    border: 0;
    background: none;
    padding: 0;
    font: inherit;
    font-size: var(--step--1);
    color: var(--ink-2);
    text-decoration: underline;
    text-decoration-color: var(--line-strong);
    text-underline-offset: 3px;
    cursor: pointer;
  }
  .w-count:hover {
    color: var(--ink);
  }
  .counts {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    margin: 0;
    font-size: var(--step--1);
    color: var(--ink-2);
  }
  .counts .total {
    font-weight: 800;
    color: var(--ink);
  }
  .cnt {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .list {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
    border-top: 1px solid var(--line);
  }
  .list li {
    border-bottom: 1px solid var(--line);
  }
  .p-btn {
    display: grid;
    grid-template-columns: 11.5rem minmax(0, 1fr) auto;
    align-items: baseline;
    gap: 4px 12px;
    width: 100%;
    padding: 8px 2px;
    border: 0;
    background: none;
    font: inherit;
    text-align: left;
    color: var(--ink);
    cursor: pointer;
  }
  .p-btn:hover {
    background: var(--wash);
  }
  .p-btn .st {
    font-size: var(--step--1);
    font-weight: 700;
  }
  .p-btn.unchecked .st {
    color: var(--ink-2);
    font-weight: 600;
  }
  .p-title {
    font-weight: 600;
  }
  .p-date {
    font-size: 0.75rem;
    color: var(--ink-2);
    white-space: nowrap;
  }
  .hint {
    margin: 0;
    font-size: var(--step--1);
    color: var(--ink-2);
  }
  @media (max-width: 560px) {
    .p-btn {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .p-btn .st {
      grid-column: 1 / -1;
    }
  }
</style>
