<script lang="ts">
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Download from "@lucide/svelte/icons/download";
  import Search from "@lucide/svelte/icons/search";
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
    choiceSummary,
    stateOfChoice,
    type Choice,
    type DistrictKind,
  } from "../lib/ballot";
  import { defaultView, overviewHash, stateLabel, stateName, statesOf, viewOf, viewParam } from "../lib/stateView";
  import { contestRoute, officeOf, slugOf, stateOf, STATES, type Index } from "../lib/data";
  import { plural } from "../lib/format";
  import { BALLOT_ICON, OFFICE_ORDER, OFFICE_TYPE, type OfficeType } from "../lib/icons";
  import Badge from "./Badge.svelte";
  import ResultBar from "./ResultBar.svelte";
  import { countLine, measureOutcome, officeOutcome, pct1, standing, winnerWord } from "../lib/results";
  import { measureLabel } from "../lib/measureLabel";
  import ResultsStrip from "./ResultsStrip.svelte";
  import CountBudget from "./CountBudget.svelte";
  import MyBallot from "./MyBallot.svelte";
  import { loadPicks, picksToText, type ExportContest, type Picks } from "../lib/myPicks";
  import { allTrialVotes } from "../lib/trialStorage";

  let { ix, query = "" }: { ix: Index; query?: string } = $props();
  let q = $state("");

  // "My ballot": districts from the URL hash (a shared link) win over the ones saved on this device. The page shows one
  // state at a time: the link's `view=`, else My ballot's state, else California (lib/stateView.ts).
  let choice = $state<Choice>({});
  let viewWanted = $state<string | null>(null);
  let showAll = $state(false);
  $effect(() => {
    // Reads the query only: anything derived from `ix` would re-run this when the on-demand data arrives, with a query
    // that My ballot's replaceState (below) has already made out of date.
    const fromHash = parseChoice(query);
    choice = isEmptyChoice(fromHash) ? loadChoice() : fromHash;
    viewWanted = viewParam(query);
  });
  function setHash(hash: string) {
    try {
      history.replaceState(null, "", hash);
    } catch {
      /* sandboxed page: the hash just isn't updated */
    }
  }
  function setChoice(c: Choice) {
    choice = normalizeChoice(c);
    // A ballot set by ZIP, location or pick shows its own state.
    viewWanted = null;
    showAll = false;
    saveChoice(choice);
    setHash(overviewHash(defaultView(choice, states), choice, states));
  }
  function forget() {
    const shownSt = viewSt;
    forgetChoice();
    choice = {};
    showAll = false;
    // Stay on the state shown.
    viewWanted = shownSt;
    setHash(overviewHash(shownSt, {}, states));
  }

  /** Every contest, once, with what the index needs; grouped by office type, districts in numeric order. */
  const rows = $derived(
    ix.contestRefs().map((ref) => {
      const kind = ix.kindOf(ref);
      const office = officeOf(ref, kind);
      const cands = ix.candidatesOf(ref);
      const names = cands.map((c) => ix.name(c));
      const p = ix.progress(ref);
      const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
      const tasks = ix.openTaskCount(ref);
      const leads = ix.leadCount(ref);
      const title = ix.listTitle(ref);
      const st = stateOf(ref);
      const district = /-(\d+)$/.exec(slugOf(ref))?.[1];
      const hay = [title, ix.contestTitle(ref), slugOf(ref), STATES[st] ?? st, ...names, district ? `${st}-${district} ${st} ${district} district ${district}` : ""].join(" ").toLowerCase();
      const officeRef = (ix.contests.get(ref)?.["office_ref"] ?? ix.agendas.get(ref)?.["office_ref"]) as string | undefined;
      const place = placeContest(ref, officeRef, kind);
      // After the election: the winner (or leader of a semi-official count) in bold, a measure's yes/no bar.
      const contest = ix.contests.get(ref);
      const outcome = officeOutcome(contest);
      const who = cands.map((c) => ({ name: ix.name(c), st: standing(outcome, c), share: outcome?.rows.find((x) => x.person === c)?.share }));
      const measure = kind === "measure" ? measureOutcome(contest) : null;
      const word = outcome?.winners.size ? winnerWord(outcome) : "";
      const count = outcome?.winners.size ? countLine(outcome) : measure ? countLine(measure) : "";
      return { ref, st, kind, office, names, who, measure, word, count, pct, hasAgenda: p.total > 0, tasks, leads, title, verified: ix.contests.has(ref), hay, place };
    }),
  );
  /** The states with contests, California first, and the one shown (the demo has one place of its own). */
  const states = $derived(statesOf(rows.map((r) => r.st)));
  const viewSt = $derived(viewOf(viewWanted, choice, states));
  const ballotSet = $derived(!isEmptyChoice(choice));
  /** My ballot narrows the list only in its own state; in the other state the list shows every contest. */
  const ballotHere = $derived(ballotSet && stateOfChoice(choice) === viewSt);
  const ballotElsewhere = $derived(ballotSet && !ballotHere && states.includes(stateOfChoice(choice)));
  const ballotOn = $derived(ballotHere && !showAll);
  /** My ballot's "Show all" / "Show my ballot"; from the other state it goes back to the ballot's own (a new page, so Back returns). */
  function toggleAll() {
    if (ballotElsewhere) {
      showAll = false;
      location.hash = overviewHash(stateOfChoice(choice), choice, states);
      return;
    }
    showAll = !showAll;
  }
  /** The switch: each state's contests (Nevada: the ones on Las Vegas ballots). */
  const tabs = $derived(states.map((st) => ({ st, label: stateLabel(st), count: rows.filter((r) => r.st === st).length })));
  const viewCount = $derived(tabs.find((t) => t.st === viewSt)?.count ?? 0);
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
  /** Rows in the office groups: every contest of the state shown, or only this voter's. */
  const filtered = $derived(textFiltered.filter((r) => r.st === viewSt && status(r) === "on"));
  /** Under the list: the other states, with the filter's matches there. */
  const others = $derived(tabs.filter((t) => t.st !== viewSt).map((t) => ({ ...t, matches: textFiltered.filter((r) => r.st === t.st).length })));
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
      if (r.st !== viewSt || status(r) !== "pick" || r.place.scope !== "district") continue;
      by.set(r.place.kind, [...(by.get(r.place.kind) ?? []), r]);
    }
    return [...by.entries()].map(([kind, rs]) => ({ kind, rows: sortRows(rs) }));
  });
  const unmatched = $derived(sortRows(textFiltered.filter((r) => r.st === viewSt && status(r) === "unmatched")));
  const shown = $derived(filtered.length + toPick.reduce((n, g) => n + g.rows.length, 0) + unmatched.length);
  const openTasks = $derived(ix.openTaskTotal());
  /** California Assembly districts with a contest page here, so My ballot doesn't list them as missing. */
  const coveredAssembly = $derived(
    rows.flatMap((r) => {
      const m = r.st === "ca" ? /\/state-assembly-(\d+)$/.exec(r.ref) : null;
      return m ? [Number(m[1])] : [];
    }),
  );
  /** Results first: the state shown's contests with a result (only this voter's when My ballot is set), in Overview order. */
  const resultItems = $derived(
    OFFICE_ORDER.flatMap((type) =>
      sortRows(rows.filter((r) => r.st === viewSt && r.office.type === type && (r.measure || r.word) && status(r) === "on")),
    ).map((r) => ({
      ref: r.ref,
      title: r.title,
      label: r.measure ? measureLabel(ix, r.ref) : undefined,
      leaders: r.who.filter((w) => w.st === "won").map((w) => ({ name: w.name, share: w.share })),
      word: r.word,
      measure: r.measure,
      count: r.count,
      district: ["boe", "house", "legislature"].includes(r.office.type),
    })),
  );
  /** Places on the list whose results aren't recorded yet. */
  const resultsMissing = $derived.by(() => {
    const listed = rows.filter((r) => r.st === viewSt && status(r) === "on" && r.verified && !r.measure && !r.word);
    const measures = rows.filter((r) => r.st === viewSt && status(r) === "on" && r.kind === "measure" && !r.measure);
    const all = [...listed, ...measures];
    const sf = all.some((r) => /\/sf-/.test(r.ref));
    const other = all.filter((r) => !/\/sf-/.test(r.ref)).map((r) => r.title);
    const named = other.length > 3 ? `${other.length} other contests` : other.join(", ");
    const parts = [sf ? "San Francisco's contests and measures" : "", named].filter(Boolean);
    return parts.length ? `No results recorded here yet for ${parts.join(", or for ")}.` : "";
  });

  /**
   * Contests with research to show (any progress, or a recorded result) are listed; the rest of a group, including
   * contests whose only record is the official candidate list, folds behind one "Show N more, not researched yet" row.
   * The filter and My ballot show everything, since both already narrow the list.
   */
  const researched = (r: Row) => r.pct > 0 || r.word !== "" || r.kind === "measure";
  const foldUnresearched = $derived(!ballotOn && q.trim() === "");
  let moreOpen = $state<Record<string, boolean>>({});
  /** Propositions and measures start folded (the Overview is mostly read for candidates); a filter opens them. */
  const FOLDED_TYPES = new Set<OfficeType>(["measure", "local_measure"]);
  let unfolded = $state<Record<string, boolean>>({});
  const isOpen = (key: string, type: OfficeType) => !FOLDED_TYPES.has(type) || q.trim() !== "" || unfolded[key] === true;
</script>

<section class="intro">
  <div class="eyebrow">{ix.b.fictional ? "Fictional demo dataset" : "Research draft"}</div>
  <h1>{states.map(stateName).join(" and ") || "California"} contests</h1>
  <p class="facts num">
    <span><strong>{rows.length}</strong> contests</span>
    <span><strong>{ix.peopleCount()}</strong> people</span>
    <span><strong>{ix.sourceCount()}</strong> sources</span>
    <span><strong>{ix.claimCount()}</strong> citations</span>
    <span><strong>{openTasks}</strong> open tasks</span>
  </p>
  {#if tabs.length > 1}
    <!-- One state at a time: links (#overview?view=nv), so Back, Forward and shared links keep the state. -->
    <nav class="states" aria-label="Contests by state">
      {#each tabs as t (t.st)}
        <a href={overviewHash(t.st, choice, states)} class:on={t.st === viewSt} aria-current={t.st === viewSt ? "page" : undefined}
          >{t.label}<span class="n num">{` ${t.count}`}<span class="sr">{" contests"}</span></span></a
        >
      {/each}
    </nav>
  {/if}
</section>

{#if resultItems.length}
  <ResultsStrip items={resultItems} missing={resultsMissing} narrowed={ballotOn} />
{:else if tabs.length > 1}
  <p class="no-results">No results recorded here yet for {stateName(viewSt)}'s contests.</p>
{/if}
<CountBudget {ix} region={viewSt} />

<MyBallot
  {choice}
  showAll={showAll || (ballotSet && !ballotHere)}
  where={ballotElsewhere ? stateName(viewSt) : ""}
  shownSt={viewSt === "nv" ? "nv" : "ca"}
  {coveredAssembly}
  onCount={onBallotCount}
  total={viewCount}
  onchange={setChoice}
  ontoggle={toggleAll}
  onforget={forget}
/>

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
    <span class="muted num" aria-live="polite">{shown} of {viewCount}</span>
  </div>

  {#if viewSt === "nv"}
    <p class="g-note state-note">
      The contests on City of Las Vegas ballots for November 3, 2026, with the candidates on the Clark County Election Department's official lists.
      Most are not researched yet; each one is in the research queue.
    </p>
  {/if}
  {#each groups as g (g.type)}
    {@const key = `${viewSt}:${g.type}`}
    {@const open = isOpen(key, g.type)}
    <div class="group">
      <h2 class="g-head">
        {#if FOLDED_TYPES.has(g.type)}
          <button type="button" class="fold" aria-expanded={open} onclick={() => (unfolded[key] = !open)}>
            <ChevronDown size={16} aria-hidden="true" class={open ? "chev" : "chev shut"} />
            <Badge icon={OFFICE_TYPE[g.type].icon} group="record" size={22} />
            {groupLabel(viewSt, g.type)}
            <span class="g-count num">{g.rows.length}</span>
          </button>
        {:else}
          <Badge icon={OFFICE_TYPE[g.type].icon} group="record" size={22} />
          {groupLabel(viewSt, g.type)}
          <span class="g-count num">{g.rows.length}</span>
        {/if}
      </h2>
      {#if open}
        {@render groupRows(g.rows, key)}
      {/if}
    </div>
    {#if viewSt === "nv" && g.type === "measure"}<CountBudget {ix} region="nv" line />{/if}
  {:else}
    {#if !toPick.length && !unmatched.length}
      <p class="empty">{q ? `No ${tabs.length > 1 ? `${stateName(viewSt)} ` : ""}contest matches “${q.trim()}”.` : "No contest on this ballot yet."}</p>
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

  <!-- The other state, after the list: with a filter, its matches there (the filter text stays). -->
  {#each others as t (t.st)}
    {#if !q.trim() || t.matches}
      <p class="other">
        <a href={overviewHash(t.st, choice, states)}>
          <span
            >{#if q.trim()}{plural(t.matches, "match", "matches")} for “{q.trim()}” in {t.label}{:else}{t.label}: <span class="num">{t.count}</span> contests{/if}</span
          >
          <ArrowRight size={14} aria-hidden="true" />
        </a>
      </p>
    {/if}
  {/each}
</section>

{#snippet groupRows(rs: Row[], key: string)}
  {@const ready = foldUnresearched ? rs.filter(researched) : rs}
  {@const later = foldUnresearched ? rs.filter((r) => !researched(r)) : []}
  {@const showLater = moreOpen[key] === true}
  <ul class="list">
    {#each ready as r (r.ref)}
      {@render contestRow(r)}
    {/each}
    {#if later.length}
      <li>
        <button type="button" class="more" aria-expanded={showLater} onclick={() => (moreOpen[key] = !showLater)}>
          <ChevronDown size={16} aria-hidden="true" class={showLater ? "chev" : "chev shut"} />
          {showLater ? "Hide" : "Show"} <span class="num">{later.length}</span>
          {ready.length ? (later.length === 1 ? "more contest" : "more contests") : later.length === 1 ? "contest" : "contests"} not researched yet
        </button>
      </li>
      {#if showLater}
        {#each later as r (r.ref)}
          {@render contestRow(r)}
        {/each}
      {/if}
    {/if}
  </ul>
{/snippet}

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
  /* The state switch: two links in one pill, the state shown filled with ink (like About's dataset switch). */
  .states {
    justify-self: start;
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    max-width: 100%;
    margin-top: 4px;
    padding: 3px;
    border: 1px solid var(--line-strong);
    border-radius: 22px;
    background: var(--surface);
  }
  .states a {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    padding: 6px 16px;
    border-radius: 999px;
    color: var(--ink-2);
    font-weight: 700;
    text-decoration: none;
    white-space: nowrap;
  }
  .states a:hover {
    background: var(--wash);
    color: var(--ink);
  }
  .states a.on {
    background: var(--ink);
    color: var(--surface);
  }
  .states .n {
    font-size: var(--step--1);
    font-weight: 600;
    color: var(--muted);
  }
  .states a.on .n {
    color: color-mix(in srgb, var(--surface) 78%, var(--ink));
  }
  .states a:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
  @media (max-width: 420px) {
    .states a {
      gap: 6px;
      padding: 6px 12px;
      font-size: var(--step--1);
    }
  }
  .no-results {
    font-size: var(--step--1);
    color: var(--ink-2);
  }
  /* After the list: the other state (with a filter, its matches there). */
  .other {
    margin: 0;
    font-size: var(--step--1);
  }
  .other a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    color: var(--ink-2);
    font-weight: 600;
  }
  .other a:hover {
    color: var(--ink);
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
  /* The fold row for a group's contests without research yet: a full-width row in muted ink. */
  .more {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 44px;
    padding: 8px 12px;
    border: 0;
    background: none;
    color: var(--ink-2);
    font: inherit;
    font-size: var(--step--1);
    font-weight: 600;
    text-align: left;
    cursor: pointer;
  }
  .more:hover {
    background: color-mix(in srgb, var(--wash) 60%, transparent);
    color: var(--ink);
  }
  .more :global(.chev) {
    transition: transform 0.15s;
  }
  .more :global(.chev.shut) {
    transform: rotate(-90deg);
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
