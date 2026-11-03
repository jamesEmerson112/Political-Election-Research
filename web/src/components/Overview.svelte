<script lang="ts">
  import ArrowDown from "@lucide/svelte/icons/arrow-down";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Search from "@lucide/svelte/icons/search";
  import { tick } from "svelte";
  import {
    BALLOT_STATE,
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
    type Choice,
    type DistrictKind,
  } from "../lib/ballot";
  import { contestRoute, officeOf, slugOf, stateOf, STATES, type Index } from "../lib/data";
  import { plural } from "../lib/format";
  import { BALLOT_ICON, OFFICE_ORDER, OFFICE_TYPE, type OfficeType } from "../lib/icons";
  import Badge from "./Badge.svelte";
  import MyBallot from "./MyBallot.svelte";

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
      return { ref, st, kind, office, names, pct, hasAgenda: p.total > 0, tasks, leads, title, verified: ix.contests.has(ref), hay, place };
    }),
  );
  /** Other states' contests (Nevada: Las Vegas placeholders) get their own section; "My ballot" places California contests only. */
  const otherStates = $derived.by(() => {
    if (ballotOn) return [];
    const by = new Map<string, Row[]>();
    for (const r of textFiltered) if (r.st !== BALLOT_STATE) by.set(r.st, [...(by.get(r.st) ?? []), r]);
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
  const onBallotCount = $derived(rows.filter((r) => ballotStatus(r.place, choice) === "on").length);
  const textFiltered = $derived.by(() => {
    const terms = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return terms.length ? rows.filter((r) => terms.every((t) => r.hay.includes(t))) : rows;
  });
  const status = (r: Row) => (ballotOn ? ballotStatus(r.place, choice) : "on");
  /** Rows in the normal office groups: every California contest, or only this voter's. */
  const filtered = $derived(textFiltered.filter((r) => r.st === BALLOT_STATE && status(r) === "on"));
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
  const unmatched = $derived(sortRows(textFiltered.filter((r) => r.st === BALLOT_STATE && status(r) === "unmatched")));
  const shown = $derived(
    filtered.length + toPick.reduce((n, g) => n + g.rows.length, 0) + unmatched.length + otherStates.reduce((n, s) => n + s.count, 0),
  );
  const openTasks = $derived(ix.b.tasks.filter((t) => !t.blocked_by).length);
  /** Other states' contest counts (Nevada: Las Vegas), for the jump link under the title. */
  const elsewhere = $derived(
    [...new Set(rows.map((r) => r.st).filter((st) => st !== BALLOT_STATE))].sort().map((st) => ({ st, name: STATES[st] ?? st.toUpperCase(), count: rows.filter((r) => r.st === st).length })),
  );
  /** Propositions and measures start folded (the Overview is mostly read for candidates); a filter opens them. */
  const FOLDED_TYPES = new Set<OfficeType>(["measure", "local_measure"]);
  let unfolded = $state<Record<string, boolean>>({});
  const isOpen = (key: string, type: OfficeType) => !FOLDED_TYPES.has(type) || q.trim() !== "" || unfolded[key] === true;
  async function jumpTo(st: string) {
    // My ballot narrows the list to California; show everything so the other state's section exists.
    if (ballotOn) showAll = true;
    q = "";
    await tick();
    document.getElementById(`state-${st}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
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
  {#each elsewhere as e (e.st)}
    <p class="jump">
      <button type="button" class="link" onclick={() => jumpTo(e.st)}>
        <ArrowDown size={14} aria-hidden="true" />{e.st === "nv" ? `${e.name} · Las Vegas` : e.name}: <span class="num">{e.count}</span> contests, after California's
      </button>
    </p>
  {/each}
</section>

<MyBallot {choice} {showAll} onCount={onBallotCount} total={rows.length} onchange={setChoice} ontoggle={() => (showAll = !showAll)} onforget={forget} />

<section class="section">
  <div class="filter">
    <label for="contest-filter" class="sr">Filter contests</label>
    <Search size={16} aria-hidden="true" />
    <input id="contest-filter" type="search" placeholder="Filter by candidate, office or district (e.g. CA-27)" bind:value={q} autocomplete="off" />
    <span class="muted num" aria-live="polite">{shown} of {rows.length}</span>
  </div>

  {#each groups as g (g.type)}
    {@const open = isOpen(g.type, g.type)}
    <div class="group">
      <h2 class="g-head">
        {#if FOLDED_TYPES.has(g.type)}
          <button type="button" class="fold" aria-expanded={open} onclick={() => (unfolded[g.type] = !open)}>
            <ChevronDown size={16} aria-hidden="true" class={open ? "chev" : "chev shut"} />
            <Badge icon={OFFICE_TYPE[g.type].icon} group="record" size={22} />
            {OFFICE_TYPE[g.type].label}
            <span class="g-count num">{g.rows.length}</span>
          </button>
        {:else}
          <Badge icon={OFFICE_TYPE[g.type].icon} group="record" size={22} />
          {OFFICE_TYPE[g.type].label}
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
      <p class="g-note">These contests couldn't be placed on a California ballot, so they are listed here rather than hidden.</p>
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
