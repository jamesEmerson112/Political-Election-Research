<script lang="ts">
  import ArrowDown from "@lucide/svelte/icons/arrow-down";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Download from "@lucide/svelte/icons/download";
  import Search from "@lucide/svelte/icons/search";
  import { tick } from "svelte";
  import {
    ballotStatus,
    DISTRICT_NAME,
    forgetChoice,
    isEmptyChoice,
    loadChoice,
    normalizeChoice,
    parseChoice,
    placeContest,
    saveChoice,
    serializeChoice,
    choiceSummary,
    stateOfChoice,
    type Choice,
    type DistrictKind,
  } from "../lib/ballot";
  import { contestRoute, officeOf, slugOf, stateOf, STATES, type Index } from "../lib/data";
  import { plural } from "../lib/format";
  import { BALLOT_ICON, OFFICE_ORDER, OFFICE_TYPE, type OfficeType } from "../lib/icons";
  import Badge from "./Badge.svelte";
  import ResultBar from "./ResultBar.svelte";
  import { measureOutcome, officeOutcome, pct1, standing } from "../lib/results";
  import MyBallot from "./MyBallot.svelte";
  import { loadPicks, picksToText, type ExportContest, type Picks } from "../lib/myPicks";
  import { allTrialVotes } from "../lib/trialStorage";

  let { ix, query = "" }: { ix: Index; query?: string } = $props();
  let q = $state("");

  // "My ballot": districts from the URL hash (a shared link) win over the ones saved on this device.
  let choice = $state<Choice>({});
  let showAll = $state(false);
  $effect(() => {
    const fromHash = parseChoice(query);
    choice = isEmptyChoice(fromHash) ? loadChoice() : fromHash;
  });
  function setHash(qs: string) {
    try {
      history.replaceState(null, "", qs ? `#overview?${qs}` : "#overview");
    } catch {
      /* sandboxed page: the hash just isn't updated */
    }
  }
  function setChoice(c: Choice) {
    choice = normalizeChoice(c);
    showAll = false;
    saveChoice(choice);
    setHash(serializeChoice(choice));
  }
  function forget() {
    forgetChoice();
    choice = {};
    showAll = false;
    setHash("");
  }
  const ballotOn = $derived(!isEmptyChoice(choice) && !showAll);
  /** The state listed first, in the normal office groups: the voter's (when My ballot narrows the list) or California. */
  const ballotSt = $derived(ballotOn ? stateOfChoice(choice) : "ca");

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
      const st = stateOf(ref);
      const district = /-(\d+)$/.exec(slugOf(ref))?.[1];
      const hay = [title, slugOf(ref), STATES[st] ?? st, ...names, district ? `${st}-${district} ${st} ${district} district ${district}` : ""].join(" ").toLowerCase();
      const officeRef = (ix.contests.get(ref)?.["office_ref"] ?? ix.agendas.get(ref)?.["office_ref"]) as string | undefined;
      const place = placeContest(ref, officeRef, kind);
      // After the election: the winner (or leader of a semi-official count) in bold, a measure's yes/no bar.
      const contest = ix.contests.get(ref);
      const outcome = officeOutcome(contest);
      const who = cands.map((c) => ({ name: ix.name(c), st: standing(outcome, c), share: outcome?.rows.find((x) => x.person === c)?.share }));
      const measure = kind === "measure" ? measureOutcome(contest) : null;
      return { ref, st, kind, office, names, who, measure, pct, hasAgenda: p.total > 0, tasks, leads, title, verified: ix.contests.has(ref), hay, place };
    }),
  );
  /** Other states' contests (Nevada: Las Vegas placeholders) get their own section while the list isn't narrowed to one voter's ballot. */
  const otherStates = $derived.by(() => {
    if (ballotOn) return [];
    const by = new Map<string, Row[]>();
    for (const r of textFiltered) if (r.st !== ballotSt) by.set(r.st, [...(by.get(r.st) ?? []), r]);
    return [...by.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([st, rs]) => ({
        st,
        name: STATES[st] ?? st.toUpperCase(),
        count: rs.length,
        groups: OFFICE_ORDER.map((type) => ({ type, rows: sortRows(rs.filter((r) => r.office.type === type)) })).filter((g) => g.rows.length),
      }));
  });
  /** Group labels where another state's words differ (Nevada calls its measures "ballot questions"). */
  const groupLabel = (st: string, type: OfficeType) =>
    st === "nv" && type === "measure" ? "State ballot questions" : st === "nv" && type === "local_measure" ? "Local ballot questions" : OFFICE_TYPE[type].label;
  type Row = (typeof rows)[number];

  // "My picks" export: the visitor's own picks and notes as a text file (kept only in this browser).
  let picks = $state<Picks>({});
  $effect(() => {
    picks = loadPicks();
  });
  const pickCount = $derived(Object.keys(picks).length);
  /** My ballot's contests (in Overview order) when districts are set; otherwise only the contests with a pick or note. */
  const exportRows = $derived.by(() => {
    if (ballotOn) return groups.flatMap((g) => g.rows.map((r) => ({ r, group: groupLabel(r.st, g.type) })));
    return OFFICE_ORDER.flatMap((type) =>
      sortRows(rows.filter((r) => r.office.type === type && picks[r.ref])).map((r) => ({ r, group: groupLabel(r.st, type) })),
    );
  });
  function exportPicks() {
    const contests: ExportContest[] = exportRows.map(({ r, group }) => ({
      ref: r.ref,
      title: r.title,
      group,
      kind: r.kind === "measure" ? "measure" : "office",
      candidates: ix.candidatesOf(r.ref).map((p) => {
        const party = ix.ballotEntry(r.ref, p)?.["party"];
        return { ref: p, name: ix.name(p), ...(typeof party === "string" && party ? { party } : {}) };
      }),
    }));
    const today = new Date().toLocaleDateString("en-CA");
    const text = picksToText(contests, picks, {
      election: contests.length ? ix.electionOf(contests[0]!.ref) : "November 3, 2026",
      districts: ballotOn ? choiceSummary(choice) : "",
      today,
      site: "political-election-research.vercel.app",
      trialVotes: allTrialVotes(),
    });
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `my-ballot-${today}.txt`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const onBallotCount = $derived(rows.filter((r) => ballotStatus(r.place, choice) === "on").length);
  const textFiltered = $derived.by(() => {
    const terms = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return terms.length ? rows.filter((r) => terms.every((t) => r.hay.includes(t))) : rows;
  });
  const status = (r: Row) => (ballotOn ? ballotStatus(r.place, choice) : "on");
  /** Rows in the normal office groups: every California contest, or only this voter's. */
  const filtered = $derived(textFiltered.filter((r) => r.st === ballotSt && status(r) === "on"));
  const sortRows = (rs: Row[]) =>
    rs.sort((a, b) => a.office.sort[0] - b.office.sort[0] || a.office.sort[1].localeCompare(b.office.sort[1]));
  const groups = $derived(
    OFFICE_ORDER.map((type) => ({
      type,
      rows: sortRows(filtered.filter((r) => r.office.type === type)),
    })).filter((g) => g.rows.length),
  );
  /** District contests of a kind the voter hasn't set (e.g. Board of Equalization), by kind. */
  const toPick = $derived.by(() => {
    const by = new Map<DistrictKind, Row[]>();
    for (const r of textFiltered) {
      if (status(r) !== "pick" || r.place.scope !== "district") continue;
      by.set(r.place.kind, [...(by.get(r.place.kind) ?? []), r]);
    }
    return [...by.entries()].map(([kind, rs]) => ({ kind, rows: sortRows(rs) }));
  });
  const unmatched = $derived(sortRows(textFiltered.filter((r) => r.st === ballotSt && status(r) === "unmatched")));
  const shown = $derived(
    filtered.length + toPick.reduce((n, g) => n + g.rows.length, 0) + unmatched.length + otherStates.reduce((n, s) => n + s.count, 0),
  );
  const openTasks = $derived(ix.b.tasks.filter((t) => !t.blocked_by).length);
  /** Other states' contest counts (Nevada: Las Vegas), for the jump link under the title. */
  const elsewhere = $derived(
    [...new Set(rows.map((r) => r.st).filter((st) => st !== "ca"))].sort().map((st) => ({ st, name: STATES[st] ?? st.toUpperCase(), count: rows.filter((r) => r.st === st).length })),
  );
  /** California Assembly districts with a contest page here, so My ballot doesn't list them as missing. */
  const coveredAssembly = $derived(
    rows.flatMap((r) => {
      const m = r.st === "ca" ? /\/state-assembly-(\d+)$/.exec(r.ref) : null;
      return m ? [Number(m[1])] : [];
    }),
  );
  /** Propositions and measures start folded (the Overview is mostly read for candidates); a filter opens them. */
  const FOLDED_TYPES = new Set<OfficeType>(["measure", "local_measure"]);
  let unfolded = $state<Record<string, boolean>>({});
  const isOpen = (key: string, type: OfficeType) => !FOLDED_TYPES.has(type) || q.trim() !== "" || unfolded[key] === true;
  async function jumpTo(st: string) {
    // My ballot narrows the list to one state; show everything so the other state's section exists.
    if (ballotOn) showAll = true;
    q = "";
    await tick();
    document.getElementById(`state-${st}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
</script>

<section class="intro">
  <div class="eyebrow">{ix.b.fictional ? "Fictional demo dataset" : "Research draft"}</div>
  <h1>
    {ballotSt === "nv"
      ? "Nevada contests: your Las Vegas-area ballot"
      : !ballotOn && elsewhere.length
        ? `California and ${elsewhere.map((e) => e.name).join(" and ")} contests`
        : "California contests"}
  </h1>
  <p class="facts num">
    <span><strong>{rows.length}</strong> contests</span>
    <span><strong>{ix.people.size}</strong> people</span>
    <span><strong>{ix.sources.size}</strong> sources</span>
    <span><strong>{ix.claimCount()}</strong> citations</span>
    <span><strong>{openTasks}</strong> open tasks</span>
  </p>
  {#each ballotSt === "ca" ? elsewhere : [] as e (e.st)}
    <p class="jump">
      <button type="button" class="link" onclick={() => jumpTo(e.st)}>
        <ArrowDown size={14} aria-hidden="true" />{e.st === "nv" ? `${e.name} · Las Vegas` : e.name}: <span class="num">{e.count}</span> contests, after California's
      </button>
    </p>
  {/each}
</section>

<MyBallot {choice} {showAll} {coveredAssembly} onCount={onBallotCount} total={rows.length} onchange={setChoice} ontoggle={() => (showAll = !showAll)} onforget={forget} />

<div class="export">
  <button type="button" class="exp" onclick={exportPicks} disabled={!exportRows.length}>
    <Download size={15} aria-hidden="true" /> Export my picks (.txt)
  </button>
  <span class="muted num">
    {#if ballotOn}{plural(pickCount, "pick or note", "picks or notes")} saved · the file lists your ballot's {exportRows.length} contests{:else if pickCount}{plural(pickCount, "contest")} with a pick or note · set My ballot to list all your contests{:else}Mark “My pick” on any contest page; picks stay in this browser.{/if}
  </span>
</div>

<section class="section">
  <div class="filter">
    <label for="contest-filter" class="sr">Filter contests</label>
    <Search size={16} aria-hidden="true" />
    <input id="contest-filter" type="search" placeholder="Filter by candidate, office or district (e.g. CA-27)" bind:value={q} autocomplete="off" />
    <span class="muted num" aria-live="polite">{shown} of {rows.length}</span>
  </div>

  {#if ballotSt === "nv"}
    <p class="g-note">
      Placeholders: the contests on City of Las Vegas ballots for November 3, 2026, from the Clark County Election Department's official lists. Not
      researched yet: no candidates, questions or positions.
    </p>
  {/if}
  {#each groups as g (g.type)}
    {@const open = isOpen(g.type, g.type)}
    <div class="group">
      <h2 class="g-head">
        {#if FOLDED_TYPES.has(g.type)}
          <button type="button" class="fold" aria-expanded={open} onclick={() => (unfolded[g.type] = !open)}>
            <ChevronDown size={16} aria-hidden="true" class={open ? "chev" : "chev shut"} />
            <Badge icon={OFFICE_TYPE[g.type].icon} group="record" size={22} />
            {groupLabel(ballotSt, g.type)}
            <span class="g-count num">{g.rows.length}</span>
          </button>
        {:else}
          <Badge icon={OFFICE_TYPE[g.type].icon} group="record" size={22} />
          {groupLabel(ballotSt, g.type)}
          <span class="g-count num">{g.rows.length}</span>
        {/if}
      </h2>
      {#if open}
        <ul class="list">
          {#each g.rows as r (r.ref)}
            {@render contestRow(r)}
          {/each}
        </ul>
      {/if}
    </div>
  {:else}
    {#if !toPick.length && !unmatched.length}
      <p class="empty">{q ? `No contest matches “${q}”.` : "No contest on this ballot yet."}</p>
    {/if}
  {/each}

  {#each toPick as g (g.kind)}
    <div class="group">
      <h2 class="g-head">
        <Badge icon={BALLOT_ICON.pick} group="record" size={22} />
        {DISTRICT_NAME[g.kind]}: pick your district
        <span class="g-count num">{g.rows.length}</span>
      </h2>
      <p class="g-note">
        {g.kind === "county"
          ? "Every ballot in a county has all of that county's contests. Set your county under My ballot."
          : g.kind === "city"
            ? "Every ballot inside the City of Las Vegas has all of these; ballots outside the city have none. Set it under My ballot."
            : "One of these is on your ballot. Your sample ballot shows which; set it under My ballot."}
      </p>
      <ul class="list">
        {#each g.rows as r (r.ref)}
          {@render contestRow(r)}
        {/each}
      </ul>
    </div>
  {/each}

  {#if unmatched.length}
    <div class="group small">
      <h2 class="g-head">
        <Badge icon={OFFICE_TYPE.other.icon} group="record" size={22} />
        Not matched to a district
        <span class="g-count num">{unmatched.length}</span>
      </h2>
      <p class="g-note">These contests couldn't be placed on a ballot by district, so they are listed here rather than hidden.</p>
      <ul class="list">
        {#each unmatched as r (r.ref)}
          {@render contestRow(r)}
        {/each}
      </ul>
    </div>
  {/if}

  {#each otherStates as s (s.st)}
    <div class="state" id={`state-${s.st}`}>
      <h2 class="s-head">{s.st === "nv" ? `${s.name} · Las Vegas` : s.name} <span class="g-count num">{s.count}</span></h2>
      {#if s.st === "nv"}
        <p class="g-note">
          Placeholders: the contests on City of Las Vegas ballots for November 3, 2026, from the Clark County Election Department's official lists. Not researched yet: no
          candidates, questions or positions. Each one is in the research queue.
        </p>
      {/if}
      {#each s.groups as g (g.type)}
        {@const key = `${s.st}:${g.type}`}
        {@const open = isOpen(key, g.type)}
        <div class="group">
          <h3 class="g-head">
            {#if FOLDED_TYPES.has(g.type)}
              <button type="button" class="fold" aria-expanded={open} onclick={() => (unfolded[key] = !open)}>
                <ChevronDown size={16} aria-hidden="true" class={open ? "chev" : "chev shut"} />
                <Badge icon={OFFICE_TYPE[g.type].icon} group="record" size={22} />
                {groupLabel(s.st, g.type)}
                <span class="g-count num">{g.rows.length}</span>
              </button>
            {:else}
              <Badge icon={OFFICE_TYPE[g.type].icon} group="record" size={22} />
              {groupLabel(s.st, g.type)}
              <span class="g-count num">{g.rows.length}</span>
            {/if}
          </h3>
          {#if open}
            <ul class="list">
              {#each g.rows as r (r.ref)}
                {@render contestRow(r)}
              {/each}
            </ul>
          {/if}
        </div>
      {/each}
    </div>
  {/each}
</section>

{#snippet contestRow(r: Row)}
  <li>
    <a class="crow" href={`#${contestRoute(r.ref)}`} title={r.place.scope === "unmatched" ? r.place.reason : undefined}>
      <Badge icon={OFFICE_TYPE[r.office.type].icon} group="record" size={26} />
      <span class="c-main">
        <span class="c-title">{r.title}</span>
        {#if r.measure}
          <span class="c-bar"><ResultBar o={r.measure} title={r.title} compact still /></span>
        {:else if r.who.some((w) => w.st)}
          <span class="c-who">
            {#each r.who as w, i (i)}{#if i}<span aria-hidden="true">{" · "}</span>{/if}<span class:won={w.st === "won"} class:lost={w.st === "lost"}
                >{w.name}{#if w.st === "won" && w.share !== undefined}&nbsp;{pct1(w.share)}{/if}</span
              >{/each}
          </span>
        {:else}
          <span class="c-who">{r.names.length ? r.names.join(" · ") : r.kind === "measure" ? "Ballot measure" : "Candidates not set"}</span>
        {/if}
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
{/snippet}

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
  .jump {
    margin: 0;
    font-size: var(--step--1);
  }
  .jump .link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: 0;
    padding: 0;
    color: var(--ink-2);
    text-decoration: underline;
    cursor: pointer;
    font: inherit;
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
  .fold {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: none;
    border: 0;
    padding: 0;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .fold :global(.chev) {
    transition: transform 0.15s;
  }
  .fold :global(.chev.shut) {
    transform: rotate(-90deg);
  }
  .g-head {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--step-0);
    font-weight: 800;
    padding-top: 10px;
  }
  .g-note {
    font-size: var(--step--1);
    color: var(--ink-2);
  }
  /* Another state's contests (Nevada: Las Vegas placeholders), below California's. */
  .state {
    display: grid;
    gap: 8px;
    margin-top: 18px;
    padding-top: 12px;
    border-top: 2px solid var(--line-strong);
  }
  .s-head {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: var(--step-1);
    font-weight: 800;
  }
  .group.small .g-head {
    font-size: var(--step--1);
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
  .c-who .won {
    color: var(--ink);
    font-weight: 700;
  }
  .c-who .lost {
    color: var(--muted);
  }
  .c-bar {
    display: block;
    max-width: 22rem;
    padding-top: 2px;
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
  .export {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    margin-top: 8px;
    font-size: var(--step--1);
  }
  .exp {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    padding: 4px 11px;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    background: var(--surface);
    color: var(--ink);
    font-size: var(--step--1);
    font-weight: 600;
    cursor: pointer;
  }
  .exp:hover:not(:disabled) {
    background: var(--wash);
  }
  .exp:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
