<script lang="ts">
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import type { Category, Cell, Comparison, Row } from "../lib/compare";
  import type { Index } from "../lib/data";
  import { categoryStyle } from "../lib/icons";
  import { MARK } from "../lib/marks";
  import Badge from "./Badge.svelte";
  import CellDetail from "./CellDetail.svelte";
  import OfficeChips from "./OfficeChips.svelte";
  import StanceMark from "./StanceMark.svelte";

  let { ix, contestRef, cmp }: { ix: Index; contestRef: string; cmp: Comparison } = $props();

  /* Sticky name row. When the table fits the width, the wrapper stops being a scroll box and the
     row sticks under the site's sticky header; when it doesn't (phones), the wrapper scrolls both
     ways inside one screen height and the row sticks to its top. */
  let wrap = $state<HTMLDivElement>();
  let table = $state<HTMLTableElement>();
  let fits = $state(true);
  let headerH = $state(0);
  $effect(() => {
    if (!wrap || !table) return;
    const top = document.querySelector<HTMLElement>(".top");
    const measure = () => {
      fits = table!.offsetWidth <= wrap!.clientWidth + 1;
      headerH = top?.offsetHeight ?? 0;
    };
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    if (top) ro.observe(top);
    measure();
    return () => ro.disconnect();
  });

  /* When the table is wider than the page it scrolls sideways, so CSS sticky can't pin its name row
     to the window; a fixed copy is shown instead while the table passes under the site header. */
  let float = $state<{ left: number; width: number; tableW: number; scrollLeft: number } | null>(null);
  $effect(() => {
    if (!wrap || !table || fits) {
      float = null;
      return;
    }
    const w = wrap;
    const t = table;
    let frame = 0;
    const update = () => {
      frame = 0;
      const r = w.getBoundingClientRect();
      const headH = t.tHead?.offsetHeight ?? 0;
      const passing = r.top < headerH && r.bottom > headerH + headH;
      const pad = parseFloat(getComputedStyle(w).paddingLeft) || 0;
      float = passing ? { left: r.left + w.clientLeft, width: w.clientWidth, tableW: t.offsetWidth, scrollLeft: w.scrollLeft - pad } : null;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    w.addEventListener("scroll", schedule, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      w.removeEventListener("scroll", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  });

  /** row key -> expanded. A click on any cell of a row expands the row (every candidate's cell) inline. */
  // Campaign proposals start expanded; every other row starts folded.
  let open = $state<Record<string, boolean>>({ promises: true });
  const toggle = (k: string) => (open[k] = !open[k]);
  const rowsOf = (cat: Category) => [...cat.rows, ...(cat.sections ?? []).flatMap((x) => x.rows)];
  const catOpen = (cat: Category) => rowsOf(cat).length > 0 && rowsOf(cat).every((r) => open[r.key]);
  function toggleCat(cat: Category) {
    const to = !catOpen(cat);
    for (const r of rowsOf(cat)) open[r.key] = to;
  }
  const initials = (name: string) =>
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  /** Agendas with no stance questions: hide the two stance categories, show one compact row instead. */
  const STANCE_CATS = new Set(["shared", "differ"]);
  const noQuestions = $derived(cmp.categories.filter((c) => STANCE_CATS.has(c.key)).every((c) => rowsOf(c).length === 0));
  const shown = $derived(cmp.categories.filter((c) => !(noQuestions && STANCE_CATS.has(c.key))));
  const id = (r: Row, i: number) => `x-${r.key.replace(/[^a-z0-9]+/gi, "-")}-${i}`;
</script>

{#snippet head(cell: Cell)}
  <span class="head">
    {#each cell.marks as m, i (i)}
      <span class="mk"><StanceMark mark={m.mark} size={14} />{#if m.text}<span class="mk-t num">{m.text}</span>{/if}</span>
    {/each}
    {#if cell.num}
      <span class="big">{cell.num}</span>{#if cell.unit}<span class="unit">{cell.unit}</span>{/if}
    {/if}
    {#if cell.label}<span class="lbl">{cell.label}</span>{/if}
  </span>
  {#if cell.stamps?.length}
    <span class="stamps">{#each cell.stamps as s (s)}<span class="stamp">{s}</span>{/each}</span>
  {/if}
  {#if cell.chips?.length}<OfficeChips chips={cell.chips} inButton />{/if}
{/snippet}

{#snippet rowView(r: Row)}
  {@const isOpen = !!open[r.key]}
  <tr class="r" class:open={isOpen}>
    <th scope="row">
      <button class="row-btn" aria-expanded={isOpen} aria-controls={cmp.cands.map((_, i) => id(r, i)).join(" ")} onclick={() => toggle(r.key)}>
        <Badge icon={r.icon} group={r.group} size={20} />
        <span class="row-label">{r.label}</span>
        <span class="chev" aria-hidden="true"><ChevronDown size={14} /></span>
      </button>
      {#if isOpen && r.question}
        <div class="q-more">
          <p class="q">{r.question}</p>
          {#if r.defs}
            <p class="def"><StanceMark mark={MARK["support"]!} size={11} /> {r.defs[0]}</p>
            <p class="def"><StanceMark mark={MARK["oppose"]!} size={11} /> {r.defs[1]}</p>
          {/if}
        </div>
      {/if}
    </th>
    {#each r.cells as cell, i (i)}
      <td class="cell {cell.state}">
        {#if cell.lines.length || cell.marks.length}
          <button class="cell-btn" aria-expanded={isOpen} aria-controls={id(r, i)} onclick={() => toggle(r.key)}>
            <span class="sr">{ix.name(cmp.cands[i])}, {r.label}: </span>
            {@render head(cell)}
          </button>
          {#if isOpen}<div class="more" id={id(r, i)}><CellDetail {cell} /></div>{/if}
        {/if}
      </td>
    {/each}
  </tr>
{/snippet}

{#snippet headRow(copy: boolean)}
      <tr>
        <td class="corner"></td>
        {#each cmp.cands as c (c)}
          {@const entry = ix.ballotEntry(contestRef, c)}
          <th class="cand" scope={copy ? undefined : "col"}>
            <span class="ini" aria-hidden="true">{initials(ix.name(c))}</span>
            <span class="cand-txt">
              <span class="cand-name">{ix.name(c)}</span>
              <span class="cand-sub">
                {#if entry}{[entry["party"], entry["ballot_designation"]].filter(Boolean).join(" · ")}{:else}Ballot not verified{/if}
              </span>
            </span>
          </th>
        {/each}
      </tr>
{/snippet}

<div class="scroll-x" class:bleed={cmp.cands.length > 4} class:fits style:--head-top={fits ? `${headerH}px` : "0px"} bind:this={wrap}>
  <table class="ct" bind:this={table} style:--n={cmp.cands.length} aria-label={`${ix.contestTitle(contestRef)}: candidates compared`}>
    <colgroup>
      <col class="label-col" />
      {#each cmp.cands as c (c)}<col />{/each}
    </colgroup>
    <thead>
      {@render headRow(false)}
    </thead>
    {#each shown as cat (cat.key)}
      {@const st = categoryStyle(cat.key)}
      {@const allOpen = catOpen(cat)}
      <tbody>
        <tr class="cat">
          <th colspan={cmp.cands.length + 1} scope="colgroup">
            <button class="cat-btn" aria-expanded={allOpen} onclick={() => toggleCat(cat)} title={cat.source}>
              <Badge icon={st.icon} group={st.group} size={24} />
              <span class="cat-n num" aria-hidden="true">{cat.n}</span>
              <span class="cat-name">{cat.name}</span>
              {#if cat.count !== undefined}<span class="cat-count num" aria-label={`${cat.count} questions`}>{cat.count}</span>{/if}
              <span class="chev" aria-hidden="true"><ChevronDown size={14} /></span>
            </button>
            {#if allOpen}<span class="cat-src">{cat.source}</span>{/if}
          </th>
        </tr>
        {#each cat.rows as r (r.key)}{@render rowView(r)}{/each}
        {#if !rowsOf(cat).length && cat.empty}
          <tr><td class="empty-row" colspan={cmp.cands.length + 1}>{cat.empty}</td></tr>
        {/if}
        {#each cat.sections ?? [] as sec (sec.title)}
          <tr class="subcat"><th colspan={cmp.cands.length + 1} scope="colgroup">{sec.title}</th></tr>
          {#each sec.rows as r (r.key)}{@render rowView(r)}{/each}
        {/each}
        {#if noQuestions && cat.key === "past_policies"}
          <tr><td class="empty-row" colspan={cmp.cands.length + 1}>No stance questions set yet for this contest.</td></tr>
        {/if}
      </tbody>
    {/each}
  </table>
</div>
{#if float}
  <!-- A copy of the name row, pinned under the site header while a wide table scrolls sideways. -->
  <div class="float-head" aria-hidden="true" style:top={`${headerH}px`} style:left={`${float.left}px`} style:width={`${float.width}px`}>
    <table class="ct" style:--n={cmp.cands.length} style:width={`${float.tableW}px`} style:transform={`translateX(${-float.scrollLeft}px)`}>
      <colgroup>
        <col class="label-col" />
        {#each cmp.cands as c (c)}<col />{/each}
      </colgroup>
      <thead>{@render headRow(true)}</thead>
    </table>
  </div>
{/if}

<style>
  /* Races with many candidates use the full page width instead of the 1180px column
     (body is an inline-size container, so 100cqw excludes the scrollbar). */
  .bleed {
    margin-inline: min(0px, calc(50% - 50cqw));
    padding-inline: max(16px, env(safe-area-inset-left, 0px));
  }
  .ct {
    width: 100%;
    border-collapse: collapse;
    background: var(--surface);
    border: 1px solid var(--line);
    font-size: var(--step--1);
    table-layout: fixed;
    min-width: calc(112px + var(--n) * 140px);
  }
  .label-col {
    width: clamp(112px, 24%, 230px);
  }
  th,
  td {
    text-align: left;
    vertical-align: top;
    padding: 0;
    border-bottom: 1px solid var(--line);
  }
  td + td,
  th + td {
    border-left: 1px solid var(--line);
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  /* candidate header */
  thead th.cand {
    padding: 10px 12px;
    vertical-align: bottom;
    border-bottom: 2px solid var(--ink);
  }
  thead .corner {
    border-bottom: 2px solid var(--ink);
  }
  /* sticky name row; the underline is a shadow because collapsed borders don't travel with sticky cells */
  thead th.cand,
  thead .corner {
    position: sticky;
    top: var(--head-top, 0px);
    z-index: 3;
    background: var(--surface);
    box-shadow: inset 0 -2px 0 var(--ink);
  }
  .scroll-x.fits {
    overflow: visible;
  }
  .float-head {
    position: fixed;
    z-index: 15;
    overflow: hidden;
    pointer-events: none;
  }
  .float-head .ct {
    min-width: 0;
    border-bottom: 0;
  }
  .cand {
    display: table-cell;
  }
  .ini {
    float: left;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: 1.5px solid var(--ink);
    font-size: 0.72rem;
    font-weight: 800;
    margin-right: 8px;
    letter-spacing: 0.02em;
  }
  .cand-txt {
    display: grid;
    min-width: 0;
  }
  .cand-name {
    font-size: var(--step-0);
    font-weight: 800;
    color: var(--ink);
    line-height: 1.2;
  }
  .cand-sub {
    color: var(--muted);
    font-weight: 400;
    font-size: 0.75rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* category bar */
  tr.cat th {
    background: var(--wash);
    border-top: 1px solid var(--line-strong);
    padding: 6px 10px;
  }
  .cat-btn,
  .row-btn,
  .cell-btn {
    border: 0;
    background: none;
    padding: 0;
    margin: 0;
    text-align: left;
    cursor: pointer;
    color: inherit;
    width: 100%;
  }
  .cat-btn {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .cat-n {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--muted);
  }
  .cat-name {
    font-weight: 800;
    font-size: var(--step-0);
    color: var(--ink);
  }
  .cat-count {
    display: inline-grid;
    place-items: center;
    min-width: 22px;
    height: 20px;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--ink);
    color: var(--surface);
    font-size: 0.75rem;
    font-weight: 700;
  }
  .chev {
    display: inline-grid;
    color: var(--muted);
    transition: transform 0.12s;
  }
  [aria-expanded="true"] > .chev {
    transform: rotate(180deg);
  }
  .cat-src {
    display: block;
    color: var(--ink-2);
    font-weight: 400;
    padding: 4px 0 2px 32px;
  }
  tr.subcat th {
    padding: 6px 10px;
    font-weight: 600;
    color: var(--muted);
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: var(--surface);
  }
  .empty-row {
    padding: 8px 12px;
    color: var(--muted);
    font-style: italic;
  }
  /* rows */
  tbody th[scope="row"] {
    font-weight: 600;
    color: var(--ink-2);
  }
  .row-btn {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 9px 10px 9px 12px;
    min-height: 44px;
  }
  .row-label {
    flex: 1;
    min-width: 0;
    line-height: 1.25;
  }
  .row-btn .chev {
    opacity: 0;
  }
  tr.r:hover .chev,
  tr.r.open .chev,
  .row-btn:focus-visible .chev {
    opacity: 1;
  }
  tr.r:hover td,
  tr.r:hover th {
    background: color-mix(in srgb, var(--wash) 45%, transparent);
  }
  .q-more {
    display: grid;
    gap: 4px;
    padding: 0 12px 10px;
    font-weight: 400;
  }
  .q {
    color: var(--ink);
    font-weight: 600;
  }
  .def {
    color: var(--ink-2);
    font-size: 0.75rem;
  }
  .cell-btn {
    display: grid;
    gap: 4px;
    padding: 9px 12px;
    min-height: 44px;
    align-content: center;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 6px;
    min-width: 0;
  }
  .mk {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    align-self: center;
  }
  .mk-t {
    font-weight: 700;
    font-size: var(--step-0);
    color: var(--ink);
  }
  .big {
    font-size: var(--step-1);
    font-weight: 800;
    color: var(--ink);
    line-height: 1.1;
  }
  .unit {
    color: var(--ink-2);
    font-weight: 600;
    margin-left: -3px;
  }
  .lbl {
    color: var(--ink);
    font-weight: 600;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .big ~ .lbl,
  .mk-t ~ .lbl {
    color: var(--ink-2);
    font-weight: 500;
  }
  .stamps {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .stamp {
    border: 1px solid var(--line-strong);
    border-radius: 3px;
    padding: 0 5px;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--ink-2);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  /* states */
  .cell.unresearched .lbl,
  .cell.zero .lbl,
  .cell.not_found .lbl {
    color: var(--muted);
    font-weight: 500;
  }
  .cell.zero .big {
    color: var(--ink-2);
  }
  .cell.lead .head {
    border: 1px dashed var(--warning);
    border-radius: 999px;
    padding: 1px 9px 1px 5px;
    width: fit-content;
    align-items: center;
  }
  .cell.lead .lbl {
    color: var(--ink-2);
    font-style: italic;
    font-weight: 500;
  }
  /* expanded detail */
  .more {
    padding: 0 12px 12px;
  }
  @media (max-width: 560px) {
    .ct {
      min-width: calc(96px + var(--n) * 128px);
    }
    .label-col {
      width: 96px;
    }
    .row-btn {
      padding-left: 8px;
      padding-right: 6px;
      gap: 5px;
    }
    .cell-btn,
    .more,
    .q-more {
      padding-left: 8px;
      padding-right: 8px;
    }
    thead th.cand {
      padding: 8px;
    }
    .ini {
      display: none;
    }
    .row-btn .chev {
      display: none;
    }
  }
</style>
