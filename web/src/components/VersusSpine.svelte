<script lang="ts">
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import type { Category, Cell, Comparison, Row } from "../lib/compare";
  import type { Index } from "../lib/data";
  import { categoryStyle, GROUP_COLOR } from "../lib/icons";
  import { MARK } from "../lib/marks";
  import Badge from "./Badge.svelte";
  import BillStamp from "./BillStamp.svelte";
  import CellDetail from "./CellDetail.svelte";
  import Equal from "@lucide/svelte/icons/equal";
  import OfficeChips from "./OfficeChips.svelte";
  import StanceMark from "./StanceMark.svelte";

  /**
   * Two candidates, mirrored around a center spine of category / issue badges.
   * Candidate A (agenda order) reads right-to-left toward the spine, B left-to-right,
   * so agreement reads ▲|▲ and disagreement ▲|▼. Neither side is privileged:
   * same type, same weight, same scale per row.
   */
  let { ix, contestRef, cmp }: { ix: Index; contestRef: string; cmp: Comparison } = $props();

  let open = $state<Record<string, boolean>>({});
  const toggle = (k: string) => (open[k] = !open[k]);
  const rowsOf = (cat: Category) => [...cat.rows, ...(cat.sections ?? []).flatMap((x) => x.rows)];
  const catOpen = (cat: Category) => rowsOf(cat).length > 0 && rowsOf(cat).every((r) => open[r.key]);
  function toggleCat(cat: Category) {
    const to = !catOpen(cat);
    for (const r of rowsOf(cat)) open[r.key] = to;
  }
  const names = $derived(cmp.cands.map((c) => ix.name(c)));
  const initials = (name: string) =>
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  const domId = (r: Row) => `vs-${r.key.replace(/[^a-z0-9]+/gi, "-")}`;
  /** One shared scale per row, across both candidates and all bars. */
  const rowMax = (r: Row) => Math.max(1, ...r.cells.flatMap((c) => (c.bars ?? []).map((b) => b.value)));
  const MAX_DOTS = 12;
  /** The stance categories are hidden when the agenda sets no stance questions. */
  const STANCE_CATS = new Set(["shared", "differ"]);
  const noQuestions = $derived(cmp.categories.filter((c) => STANCE_CATS.has(c.key)).every((c) => rowsOf(c).length === 0));
  const shown = $derived(cmp.categories.filter((c) => !(noQuestions && STANCE_CATS.has(c.key))));
</script>

{#snippet side(r: Row, cell: Cell, i: number)}
  <span class="side {i === 0 ? 'a' : 'b'} {cell.state}">
    <span class="sr">{names[i]}: </span>
    {#if cell.state === "lead"}
      <span class="ln leadpill"><StanceMark mark={MARK["lead"]!} size={13} /><span class="lbl">{cell.label}</span></span>
    {:else if cell.state === "unresearched"}
      {#if cell.lines.length}<span class="ln faint"><StanceMark mark={MARK["unresearched"]!} size={13} /><span class="lbl">Not researched</span></span>{/if}
    {:else if cell.state === "zero" || cell.state === "not_found"}
      <span class="ln faint">
        <StanceMark mark={MARK["none_found"]!} size={13} />{#if cell.num}<span class="v">{cell.num}</span>{/if}<span class="lbl">{cell.label}</span>
      </span>
    {:else if r.kind === "stance"}
      {@const m = cell.marks[0]}
      <span class="ln stance">{#if m}<StanceMark mark={m.mark} size={16} />{/if}<span class="lbl strong">{cell.label}</span></span>
    {:else if r.kind === "bars" && cell.bars}
      {@const max = rowMax(r)}
      {#each cell.bars as b, j (j)}
        <span class="ln barln">
          <span
            class="bar {b.tone}"
            style:width={b.value ? `max(3px, calc((100% - 78px) * ${(b.value / max).toFixed(4)}))` : "0px"}
          ></span>
          <span class="bar-val">{#if b.mark}<StanceMark mark={b.mark} size={11} />{/if}<span class="v">{b.text}</span></span>
        </span>
      {/each}
    {:else if r.kind === "dots" && cell.dots !== undefined}
      <span class="ln dotln">
        <span class="dots">
          {#if cell.glyphs}
            {#each cell.glyphs.slice(0, MAX_DOTS) as g, j (j)}{@const G = g.icon}<span class="glyph" title={g.text}><G size={13} aria-hidden="true" /></span>{/each}
          {:else}
            {#each Array.from({ length: Math.min(cell.dots, MAX_DOTS) }) as _, j (j)}<span class="dot" style:--bg={GROUP_COLOR[r.group]}></span>{/each}
          {/if}
        </span>
        <span class="v">{cell.dots}</span>
      </span>
    {:else if r.kind === "bills" && cell.bills}
      <span class="ln dotln">
        <span class="dots">{#each cell.bills as b, j (j)}<BillStamp outcome={b.outcome} text={b.text} />{/each}</span>
        <span class="v">{cell.bills.length}</span>
      </span>
      {#if cell.stamps?.length}<span class="ln stamps">{cell.stamps.join(" · ")}</span>{/if}
    {:else}
      {#if cell.num}
        <span class="ln"><span class="big">{cell.num}</span>{#if cell.unit}<span class="unit">{cell.unit}</span>{/if}</span>
        {#if cell.label}<span class="ln"><span class="lbl sub">{cell.label}</span></span>{/if}
      {:else if cell.label && cell.chips?.length}
        <span class="ln"><span class="lbl sub">{cell.label}</span></span>
      {:else if cell.label}
        <span class="ln"><span class="lbl strong">{cell.label}</span></span>
      {/if}
      {#if cell.chips?.length}<OfficeChips chips={cell.chips} align={i === 0 ? "end" : "start"} inButton />{/if}
    {/if}
  </span>
{/snippet}

{#snippet rowView(r: Row)}
  {@const isOpen = !!open[r.key]}
  <div class="row" class:open={isOpen}>
    <button class="row-btn" aria-expanded={isOpen} aria-controls={domId(r)} onclick={() => toggle(r.key)}>
      {@render side(r, r.cells[0]!, 0)}
      <span class="spine">
        <Badge icon={r.icon} group={r.group} size={26} />
        <span class="spine-lbl">{r.short}</span>
      </span>
      {@render side(r, r.cells[1]!, 1)}
    </button>
    {#if isOpen}
      <div class="detail" id={domId(r)}>
        {#if r.question}
          <div class="q">
            <p class="q-text">{r.question}</p>
            {#if r.defs}
              <p class="def"><StanceMark mark={MARK["support"]!} size={11} /> {r.defs[0]}</p>
              <p class="def"><StanceMark mark={MARK["oppose"]!} size={11} /> {r.defs[1]}</p>
            {/if}
            {#if r.shared?.length}
              <div class="both">
                <span class="both-tag"><Equal size={12} aria-hidden="true" /> Both say</span>
                {#each r.shared as sp (sp.label)}<button class="both-pt" onclick={sp.run}>{sp.label}</button>{/each}
              </div>
            {/if}
          </div>
        {/if}
        <div class="dcols">
          {#each r.cells as cell, i (i)}
            <div class="dcol">
              <span class="dname">{names[i]}</span>
              {#if cell.lines.length}<CellDetail {cell} />{:else}<span class="muted">Nothing recorded.</span>{/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
{/snippet}

<div class="vs" aria-label={`${ix.contestTitle(contestRef)}: ${names[0]} and ${names[1]} compared`} role="region">
  <div class="vs-head">
    {#each cmp.cands as c, i (c)}
      {@const entry = ix.ballotEntry(contestRef, c)}
      {#if i === 1}<span class="vs-mid" aria-hidden="true">vs</span>{/if}
      <div class="who {i === 0 ? 'a' : 'b'}">
        <span class="ini" aria-hidden="true">{initials(names[i]!)}</span>
        <span class="who-txt">
          <span class="who-name">{names[i]}</span>
          <span class="who-sub">
            {#if entry}{[entry["party"], entry["ballot_designation"]].filter(Boolean).join(" · ")}{:else}Ballot not verified{/if}
          </span>
        </span>
      </div>
    {/each}
  </div>

  {#each shown as cat (cat.key)}
    {@const st = categoryStyle(cat.key)}
    {@const allOpen = catOpen(cat)}
    <section class="cat" aria-label={cat.name}>
      <h3 class="cat-h">
        <button class="cat-btn" aria-expanded={allOpen} onclick={() => toggleCat(cat)} title={cat.source} disabled={!rowsOf(cat).length}>
          <Badge icon={st.icon} group={st.group} size={22} />
          <span class="cat-n num" aria-hidden="true">{cat.n}</span>
          <span class="cat-name">{cat.name}</span>
          {#if cat.count !== undefined}<span class="cat-count num">{cat.count}</span>{/if}
          {#if rowsOf(cat).length}<span class="chev" aria-hidden="true"><ChevronDown size={14} /></span>{/if}
        </button>
      </h3>
      {#if allOpen}<p class="cat-src">{cat.source}</p>{/if}
      {#each cat.rows as r (r.key)}{@render rowView(r)}{/each}
      {#if !rowsOf(cat).length && cat.empty}<p class="empty-row">{cat.empty}</p>{/if}
      {#each cat.sections ?? [] as sec (sec.title)}
        <h4 class="subcat">{sec.title}</h4>
        {#each sec.rows as r (r.key)}{@render rowView(r)}{/each}
      {/each}
    </section>
    {#if noQuestions && cat.key === "past_policies"}
      <section class="cat" aria-label="Stances">
        <p class="empty-row">No stance questions set yet for this contest.</p>
      </section>
    {/if}
  {/each}
</div>

<style>
  .vs {
    --spine: 190px;
    --gap: 14px;
    position: relative;
    background:
      linear-gradient(var(--line-strong), var(--line-strong)) center top / 2px 100% no-repeat,
      var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    font-size: var(--step--1);
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  /* header */
  .vs-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--spine) minmax(0, 1fr);
    align-items: center;
    padding: 14px 12px 12px;
    border-bottom: 2px solid var(--ink);
    background: var(--surface);
    border-radius: var(--radius) var(--radius) 0 0;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .who.a {
    flex-direction: row-reverse;
    text-align: right;
    grid-column: 1;
    grid-row: 1;
  }
  .who.b {
    grid-column: 3;
    grid-row: 1;
  }
  .vs-mid {
    grid-column: 2;
    grid-row: 1;
    justify-self: center;
    font-weight: 800;
    color: var(--muted);
    font-size: var(--step--1);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    background: var(--surface);
    padding: 2px 8px;
  }
  .ini {
    display: grid;
    place-items: center;
    flex: none;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    border: 2px solid var(--ink);
    font-weight: 800;
    font-size: 0.8rem;
    background: var(--surface);
  }
  .who-txt {
    display: grid;
    min-width: 0;
  }
  .who-name {
    font-size: var(--step-1);
    font-weight: 800;
    line-height: 1.15;
    color: var(--ink);
  }
  .who-sub {
    font-size: 0.75rem;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* category header */
  .cat-h {
    margin: 0;
    padding: 14px 10px 6px;
    display: flex;
    justify-content: center;
    font-size: inherit;
  }
  .cat-btn {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    background: var(--wash);
    padding: 3px 12px 3px 4px;
    cursor: pointer;
    color: var(--ink);
  }
  .cat-btn:disabled {
    cursor: default;
  }
  .cat-n {
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--muted);
  }
  .cat-name {
    font-weight: 800;
    font-size: var(--step--1);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .cat-count {
    display: inline-grid;
    place-items: center;
    min-width: 20px;
    height: 18px;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--ink);
    color: var(--surface);
    font-size: 0.72rem;
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
    text-align: center;
    color: var(--ink-2);
    padding: 0 16px 6px;
  }
  .cat-src,
  .empty-row,
  .subcat {
    position: relative;
  }
  .subcat {
    margin: 8px auto 2px;
    width: fit-content;
    padding: 1px 10px;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--muted);
    background: var(--surface);
  }
  .empty-row {
    margin: 2px auto 8px;
    width: fit-content;
    max-width: 80%;
    text-align: center;
    padding: 4px 12px;
    color: var(--muted);
    font-style: italic;
    background: var(--surface);
    border: 1px dashed var(--line-strong);
    border-radius: 999px;
  }
  /* rows */
  .row {
    border-top: 1px solid var(--line);
  }
  .row-btn {
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--spine) minmax(0, 1fr);
    align-items: center;
    width: 100%;
    min-height: 48px;
    padding: 6px 12px;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: inherit;
    cursor: pointer;
  }
  .row-btn:hover {
    background: color-mix(in srgb, var(--wash) 55%, transparent);
  }
  .row.open .row-btn {
    background: var(--wash);
  }
  .spine {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    justify-self: center;
    max-width: 100%;
    padding: 3px 9px 3px 3px;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--line);
  }
  .spine-lbl {
    font-weight: 700;
    color: var(--ink);
    font-size: 0.78rem;
    line-height: 1.15;
    min-width: 0;
    text-align: left;
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    padding: 0 var(--gap);
  }
  .side.a {
    align-items: flex-end;
    text-align: right;
  }
  .side.b {
    align-items: flex-start;
    text-align: left;
  }
  .ln {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    max-width: 100%;
  }
  .side.a .ln {
    flex-direction: row-reverse;
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
  }
  .side.a .unit {
    order: -1;
  }
  .lbl {
    min-width: 0;
    overflow-wrap: anywhere;
    color: var(--ink-2);
  }
  .lbl.strong {
    color: var(--ink);
    font-weight: 700;
  }
  .lbl.sub {
    font-size: 0.75rem;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .v {
    font-weight: 800;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .faint .lbl {
    color: var(--muted);
  }
  .faint .v {
    color: var(--ink-2);
  }
  .leadpill {
    border: 1px dashed var(--warning);
    border-radius: 999px;
    padding: 1px 9px 1px 5px;
  }
  .side.a .leadpill {
    padding: 1px 5px 1px 9px;
  }
  .leadpill .lbl {
    font-style: italic;
  }
  /* bars grow outward from the spine */
  .barln {
    width: 100%;
  }
  .bar {
    display: block;
    flex: none;
    height: 12px;
    border-radius: 0 3px 3px 0;
  }
  .side.a .bar {
    border-radius: 3px 0 0 3px;
  }
  .bar.money {
    background: var(--money);
  }
  .bar.people {
    background: var(--cat-people);
  }
  .bar.support {
    background: var(--support);
  }
  .bar.oppose {
    background: var(--oppose);
  }
  .bar-val {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
  .side.a .bar-val {
    flex-direction: row-reverse;
  }
  .dots {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    min-width: 0;
  }
  .side.a .dots {
    flex-direction: row-reverse;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--bg);
  }
  .stamps {
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--ink-2);
  }
  /* expanded detail: both candidates side by side */
  .detail {
    position: relative;
    display: grid;
    gap: 10px;
    padding: 4px 12px 14px;
    background: var(--wash);
  }
  .q {
    justify-self: center;
    max-width: 62ch;
    display: grid;
    gap: 3px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 8px 12px;
  }
  .q-text {
    font-weight: 600;
    color: var(--ink);
  }
  .def {
    color: var(--ink-2);
    font-size: 0.75rem;
  }
  .dcols {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--gap) 28px;
  }
  .dcol {
    display: grid;
    gap: 6px;
    align-content: start;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 8px 10px;
    min-width: 0;
  }
  .dname {
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--muted);
  }
  @media (max-width: 640px) {
    .vs {
      --spine: 76px;
      --gap: 6px;
    }
    .row-btn,
    .vs-head {
      padding-left: 4px;
      padding-right: 4px;
    }
    .spine {
      flex-direction: column;
      gap: 2px;
      padding: 3px 2px;
      border: 0;
      border-radius: 8px;
      width: 100%;
    }
    .spine-lbl {
      font-size: 0.64rem;
      text-align: center;
      overflow-wrap: normal;
      hyphens: auto;
    }
    .who.a,
    .who.b {
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 4px;
    }
    .who-name {
      font-size: var(--step-0);
    }
    .who-sub {
      white-space: normal;
    }
    .ini {
      width: 30px;
      height: 30px;
      font-size: 0.7rem;
    }
    .vs-mid {
      padding: 2px 4px;
    }
    .big {
      font-size: var(--step-0);
    }
    .dcols {
      gap: 8px;
    }
    .detail {
      padding-left: 6px;
      padding-right: 6px;
    }
    .cat-btn {
      padding-right: 10px;
    }
    .cat-name {
      font-size: 0.72rem;
    }
  }
  .both {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--line);
  }
  .both-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--ink-2);
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .both-pt {
    font: inherit;
    font-size: var(--step--1);
    color: var(--ink);
    background: var(--wash);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 2px 10px;
    cursor: pointer;
    max-width: 100%;
    overflow-wrap: anywhere;
    text-align: left;
  }
  .both-pt:hover,
  .both-pt:focus-visible {
    border-color: var(--ink-2);
  }
  .glyph {
    display: inline-grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--cat-issue);
    color: var(--on-badge);
  }
</style>
