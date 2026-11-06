<script lang="ts">
  import { openOffice, scopeOf } from "../lib/offices";
  import { ROW_ICON } from "../lib/icons";
  import Info from "@lucide/svelte/icons/info";
  import { billLabel, buildComparison } from "../lib/compare";
  import type { Index } from "../lib/data";
  import { date, money, ORG_TYPE_LABEL, plural, TASK_LABEL } from "../lib/format";
  import { CATEGORY } from "../lib/icons";
  import { openItems, openRel } from "../lib/view";
  import Badge from "./Badge.svelte";
  import CompareTable from "./CompareTable.svelte";
  import InfluenceMap from "./InfluenceMap.svelte";
  import Legend from "./Legend.svelte";
  import VersusSpine from "./VersusSpine.svelte";
  import MyPick from "./MyPick.svelte";
  import PromiseTracker from "./PromiseTracker.svelte";
  import { RESULT_ICON } from "../lib/icons";
  import { countLine, officeOutcome, pct1, winnerWord } from "../lib/results";
  import { openOfficeCount } from "../lib/view";

  let { ix, contestRef }: { ix: Index; contestRef: string } = $props();

  const cmp = $derived(buildComparison(ix, contestRef));
  const cands = $derived(cmp.cands);
  const agenda = $derived(ix.agendas.get(contestRef));
  const contest = $derived(ix.contests.get(contestRef));
  const cutoff = $derived((agenda?.["targets"]?.["finance_cutoff"] as string | null) ?? null);
  const tasks = $derived(ix.tasksFor(contestRef));
  const openTasks = $derived(tasks.filter((t) => !t.blocked_by));
  const progress = $derived(ix.progress(contestRef));
  const pct = $derived(progress.total ? Math.round((progress.done / progress.total) * 100) : 0);
  const cov = $derived(ix.b.coverage[contestRef]);
  const leadCount = $derived(ix.leads.get(contestRef)?.length ?? 0);
  const endorsers = $derived(
    [...new Set(cands.flatMap((c) => ix.endorsementsOf(c).map((e) => String(e["endorser"]))))].filter((r) => r.startsWith("org:")),
  );
  const subjectText = (s: string) => ix.questions.get(s)?.q["text"] ?? `${ix.contestTitle(s)}: should it pass?`;
  /** The office this contest elects (agenda or contest office_ref). */
  const sought = $derived(scopeOf(ix, (contest?.["office_ref"] ?? agenda?.["office_ref"]) as string | undefined));
  /** The recorded count (semi-official or certified), if any. */
  const outcome = $derived(officeOutcome(contest));
  const leaders = $derived(outcome ? outcome.rows.filter((r) => r.won) : []);
</script>

<header class="head">
  <div class="eyebrow">{ix.electionOf(contestRef)}</div>
  <h1>{ix.contestTitle(contestRef)}</h1>
  <div class="chips">
    {#if contest}
      <span class="chip ok">✓ Official list</span>
    {:else}
      <span class="chip warn" title="Candidates not yet verified against the official certified list">! Candidates unverified</span>
    {/if}
    {#if progress.total}
      <span class="chip num" title="Share of the fixed research agenda with a cited answer or a recorded gap">
        <span class="meter" aria-hidden="true"><span style:width={`${pct}%`}></span></span>{pct}% researched
      </span>
    {/if}
    <span class="chip num">{plural(openTasks.length, "open task")}</span>
    {#if leadCount}<span class="chip lead-chip num">{plural(leadCount, "unverified lead")}</span>{/if}
    {#if cutoff}<span class="chip num">$ through {date(cutoff)}</span>{/if}
  </div>
  {#if outcome && leaders.length}
    {@const RI = RESULT_ICON}
    <p class="result-line">
      <RI size={16} aria-hidden="true" />
      <span><strong>{winnerWord(outcome)}:</strong> {leaders.map((r) => `${ix.name(r.person)} (${pct1(r.share)})`).join(", ")}</span>
      <span class="muted">{countLine(outcome)}{outcome.certified ? "" : " · not certified"}</span>
      <button class="link-btn" onclick={() => openOfficeCount(ix, contestRef, outcome)}>Votes and source</button>
    </p>
  {/if}
  {#if sought}
    <button class="sought" onclick={() => openOffice(ix, sought.ref, "Office on the ballot")}>
      <Badge icon={ROW_ICON["scope"]} group="record" size={20} />
      <span><strong>{sought.name}</strong> · {sought.headline}</span>
      {#if sought.unverified}<span class="chip lead-chip">unverified</span>{/if}
    </button>
  {/if}
  {#if agenda}
    <details class="about">
      <summary><Info size={14} aria-hidden="true" /> About this agenda</summary>
      <p>{agenda["seeded"]["note"]}</p>
    </details>
  {/if}
  <MyPick {ix} {contestRef} kind="office" />
</header>

{#if cands.length}
  <section class="section compare">
    {#if cmp.counts.shared + cmp.counts.differ + cmp.counts.incomplete > 0}
    <div class="bar">
      <p class="tally num" aria-label="Agenda questions compared">
        <span><Badge icon={CATEGORY.shared.icon} group="issue" size={18} /> {cmp.counts.shared} shared</span>
        <span><Badge icon={CATEGORY.differ.icon} group="issue" size={18} /> {cmp.counts.differ} differ</span>
        <span class="muted">{cmp.counts.incomplete} not yet comparable</span>
      </p>
    </div>
    {/if}
    <Legend />
    {#if cands.length === 2}
      <VersusSpine {ix} {contestRef} {cmp} />
    {:else}
      <CompareTable {ix} {contestRef} {cmp} />
    {/if}
    <p class="hint">Tap a row for the sentences; the numbered buttons open their sources.</p>
  </section>

  <PromiseTracker {ix} {contestRef} />

  <section class="section">
    <div class="section-head">
      <h2><Badge icon={CATEGORY.financing.icon} group="money" size={22} /> Money and influence map</h2>
      <details class="about">
        <summary><Info size={14} aria-hidden="true" /> How to read</summary>
        <p>
          Who gives to each campaign’s committees, who endorses, and who spends from outside. Committees that don’t count toward this race
          (leadership PACs, officeholder accounts) are shown but not counted.
        </p>
      </details>
    </div>
    <InfluenceMap {ix} {contestRef} candidates={cands} />
  </section>

  <section class="section">
    <div class="section-head">
      <h2><Badge icon={CATEGORY.endorsements.icon} group="people" size={22} /> Behind the endorsers</h2>
      <details class="about">
        <summary><Info size={14} aria-hidden="true" /> How to read</summary>
        <p>
          What each endorsing organization gave, received and spent on lobbying, from filings. Lobbying filings name bills and agencies, not
          individual politicians. Disclosure is not wrongdoing.
        </p>
      </details>
    </div>
    {#if endorsers.length}
      <div class="scroll-x">
        <table class="grid">
          <thead>
            <tr><th>Endorser</th><th>Endorses</th><th class="num">Gave</th><th class="num">Received</th><th>Lobbying</th></tr>
          </thead>
          <tbody>
            {#each endorsers as e (e)}
              {@const gave = ix.ofType("contribution").filter((r) => r["donor"] === e)}
              {@const got = ix.ofType("contribution").filter((r) => r["recipient"] === e)}
              {@const lob = ix.ofType("lobbying").filter((r) => r["client"] === e)}
              <tr>
                <td><strong>{ix.name(e)}</strong><br /><span class="muted">{ORG_TYPE_LABEL[ix.orgs.get(e)?.["org_type"]] ?? ""}</span></td>
                <td>{cands.filter((c) => ix.endorsementsOf(c).some((x) => x["endorser"] === e)).map((c) => ix.name(c)).join(", ")}</td>
                <td class="num">
                  <button
                    class="link-btn"
                    onclick={() => openItems(`Contributions by ${ix.name(e)}`, "From filings", gave, (r) => `${money(r["money"]["amount_cents"])} to ${ix.name(r["recipient"])}`)}
                  >
                    {money(gave.reduce((a, r) => a + r["money"]["amount_cents"], 0))}
                  </button>
                </td>
                <td class="num">{money(got.reduce((a, r) => a + r["money"]["amount_cents"], 0))}</td>
                <td>
                  {#each lob as l (l["id"])}
                    <button
                      class="link-btn"
                      onclick={() =>
                        openRel(ix, l, `Lobbying by ${ix.name(e)}`, [
                          ["Paid", money(l["money"]["amount_cents"])],
                          ["Period", `${date(l["money"]["period"]["start"])} – ${date(l["money"]["period"]["end"])}`],
                          ["Firm", l["firm"] ? ix.name(l["firm"]) : "In-house"],
                          ["Bills", (l["targets"]["bills"] as string[]).map(billLabel).join(", ") || "—"],
                          ["Agencies", (l["targets"]["agencies"] as string[]).join(", ") || "—"],
                        ])}
                    >
                      {money(l["money"]["amount_cents"])} on {(l["targets"]["bills"] as string[]).map(billLabel).join(", ") || "agencies"}
                    </button>
                  {:else}
                    <span class="muted">None recorded</span>
                  {/each}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <p class="empty">No endorsing organizations recorded yet.</p>
    {/if}
  </section>
{/if}

<section class="section">
  <div class="section-head">
    <h2>Research progress</h2>
    <span class="chip num"><span class="meter" aria-hidden="true"><span style:width={`${pct}%`}></span></span>{pct}% · {plural(openTasks.length, "open task")}</span>
  </div>
  {#if cov}
    {@const asym = cov.rows.filter((r) => r.asymmetric)}
    {#if asym.length}
      <p class="chip warn wrap">
        ! Uneven research: {asym.map((r) => (r.label.startsWith("q:") || r.label.startsWith("contest:") ? ix.name(r.label) : r.label.replace(/[._]/g, " "))).join(" · ")}
      </p>
    {:else}
      <p class="chip ok">✓ Every candidate researched to the same depth</p>
    {/if}
  {/if}
  {#if openTasks.length}
    <details class="tasks-box">
      <summary>Next tasks from <span class="mono">npm run next</span></summary>
      <ol class="tasks">
        {#each openTasks.slice(0, 12) as t (t.id)}
          <li>
            <span class="task-kind">{TASK_LABEL[t.kind] ?? t.kind}</span>
            <span>{t.subject ? ix.name(t.subject) : ""}{t.item ? ` · ${t.item.startsWith("q:") || t.item.startsWith("contest:") ? subjectText(t.item) : t.item.replace(/_/g, " ")}` : ""}</span>
            {#if t.leads?.length}<span class="chip lead-chip">{plural(t.leads.length, "lead")}</span>{/if}
          </li>
        {/each}
      </ol>
      {#if openTasks.length > 12}<p class="muted">…and {openTasks.length - 12} more on the <a href="#queue">Research queue</a> page.</p>{/if}
    </details>
  {:else}
    <p class="chip ok">✓ No open tasks</p>
  {/if}
</section>

<style>
  .sought {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--line);
    background: var(--surface);
    border-radius: var(--radius);
    padding: 6px 10px;
    text-align: left;
    cursor: pointer;
    font-size: var(--step--1);
    justify-self: start;
  }
  .sought:hover {
    border-color: var(--line-strong);
  }
  .head {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }
  h1 {
    font-size: var(--step-3);
    font-weight: 800;
    letter-spacing: -0.02em;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .meter {
    display: inline-block;
    width: 36px;
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
  .lead-chip {
    border-style: dashed;
    border-color: var(--warning);
    font-style: italic;
  }
  .result-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 10px;
    margin: 0;
    font-size: var(--step--1);
    color: var(--ink);
  }
  .result-line .link-btn {
    border: 0;
    background: none;
    padding: 0;
    font: inherit;
    color: var(--ink-2);
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
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
    margin-top: 6px;
    overflow-wrap: anywhere; /* notes can hold long URLs */
  }
  .compare {
    gap: 12px;
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 16px;
  }
  .tally {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    font-size: var(--step--1);
    font-weight: 600;
  }
  .tally span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .hint {
    font-size: 0.75rem;
    color: var(--muted);
  }
  .section > .chip {
    justify-self: start;
  }
  .section-head h2 {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .link-btn {
    border: 0;
    background: none;
    padding: 0;
    text-align: left;
    cursor: pointer;
  }
  .link-btn:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .tasks-box summary {
    cursor: pointer;
    font-size: var(--step--1);
    font-weight: 600;
    color: var(--ink-2);
  }
  .tasks {
    margin: 8px 0 0;
    padding-left: 1.6em;
    display: grid;
    gap: 6px;
    font-size: var(--step--1);
  }
  .task-kind {
    font-weight: 600;
    margin-right: 6px;
  }
  .tasks .chip {
    margin-left: 6px;
  }
</style>
