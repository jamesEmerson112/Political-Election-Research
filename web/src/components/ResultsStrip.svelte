<script lang="ts">
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import { contestRoute } from "../lib/data";
  import { RESULT_ICON } from "../lib/icons";
  import { MARK } from "../lib/marks";
  import { measureWord, pct1, type MeasureOutcome } from "../lib/results";
  import Badge from "./Badge.svelte";
  import StanceMark from "./StanceMark.svelte";

  /**
   * Results first (after the election): one tile per office with a result (who leads, the share, "Leading" until
   * certified) and one chip per measure (the side ahead, ▲ Yes / ▼ No, literal for/against votes). Each links to its
   * contest. Shares are computed from the recorded votes; nothing is ranked or graded.
   */
  type Item = {
    ref: string;
    title: string;
    /** Measures: "Prop 1" / "Question 7". */
    label?: string;
    leaders?: Array<{ name: string; share?: number }>;
    word?: string;
    measure?: MeasureOutcome | null;
    count: string;
    /** District contests (Board of Equalization, House, Legislature) fold unless the list is one voter's ballot. */
    district?: boolean;
  };
  let { items, missing, narrowed = false }: { items: Item[]; missing: string; narrowed?: boolean } = $props();
  const offices = $derived(items.filter((i) => !i.measure));
  let showDistricts = $state(false);
  const shownOffices = $derived(narrowed || showDistricts ? offices : offices.filter((o) => !o.district));
  const folded = $derived(offices.length - shownOffices.length);
  const measures = $derived(items.filter((i) => i.measure));
  /** One count line for the strip when every result shares it ("Semi-official count · Nov 4, 2026"). */
  const counts = $derived([...new Set(items.map((i) => i.count))]);
  /** When every office shares one word ("Leading" until certified), it is said once in the header, not on every tile. */
  const words = $derived([...new Set(offices.map((o) => o.word))]);
  const oneWord = $derived(words.length === 1 ? words[0] : "");
</script>

{#if items.length}
  <section class="results" aria-labelledby="results-h">
    <div class="r-head">
      <h2 id="results-h"><Badge icon={RESULT_ICON} group="record" size={22} /> Results</h2>
      <span class="r-count">
        {#if oneWord}<strong>{oneWord}</strong> ·{/if}
        {counts.length === 1 ? counts[0] : "Counts of different dates"}{items.some((i) => i.count.startsWith("Semi")) ? " · not certified" : ""} · shares computed
        here from the votes
      </span>
    </div>
    {#if offices.length}
      <ul class="tiles">
        {#each shownOffices as o (o.ref)}
          <li>
            <a class="tile" href={`#${contestRoute(o.ref)}`}>
              <span class="t-office">{o.title}</span>
              {#each o.leaders ?? [] as l, i (i)}
                <span class="t-who"><strong>{l.name}</strong>{#if l.share !== undefined}{" "}<span class="num">{pct1(l.share)}</span>{/if}</span>
              {/each}
              {#if !oneWord || counts.length > 1}<span class="t-word">{oneWord ? "" : o.word}{counts.length > 1 ? ` · ${o.count}` : ""}</span>{/if}
            </a>
          </li>
        {/each}
      </ul>
    {/if}
    {#if folded || (showDistricts && !narrowed && offices.some((o) => o.district))}
      <button type="button" class="more" aria-expanded={showDistricts} onclick={() => (showDistricts = !showDistricts)}>
        <ChevronDown size={16} aria-hidden="true" class={showDistricts ? "chev" : "chev shut"} />
        {showDistricts ? "Hide" : "Show"} <span class="num">{offices.filter((o) => o.district).length}</span> district results
        <span class="m-which">({[...new Set(offices.filter((o) => o.district).map((o) => o.title.split(",")[0]))].join(", ")})</span>
      </button>
    {/if}
    {#if measures.length}
      <ul class="props">
        {#each measures as m (m.ref)}
          {@const o = m.measure!}
          {@const yes = o.ahead !== "no"}
          <li>
            <a
              class="prop num"
              href={`#${contestRoute(m.ref)}`}
              aria-label={`${m.label}: ${measureWord(o)}, Yes ${pct1(o.yesShare)}, No ${pct1(o.noShare)}`}
              title={`${m.title}: ${measureWord(o)} · Yes ${pct1(o.yesShare)} · No ${pct1(o.noShare)}`}
            >
              <span class="p-label">{m.label}</span>
              <StanceMark mark={MARK[yes ? "support" : "oppose"]!} size={11} />
              <span>{yes ? "Yes" : "No"} {pct1(yes ? o.yesShare : o.noShare)}</span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
    {#if missing}<p class="r-note">{missing}</p>{/if}
  </section>
{/if}

<style>
  .results {
    display: grid;
    gap: 12px;
  }
  .r-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 4px 16px;
    border-top: 1px solid var(--line-strong);
    padding-top: 12px;
  }
  h2 {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: var(--step-1);
    font-weight: 700;
  }
  .r-count strong {
    color: var(--ink);
  }
  .r-count,
  .r-note {
    font-size: var(--step--1);
    color: var(--ink-2);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 168px), 1fr));
    gap: 8px;
  }
  .tile {
    display: flex;
    flex-direction: column;
    gap: 2px;
    height: 100%;
    padding: 8px 10px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
    color: inherit;
    text-decoration: none;
    min-width: 0;
  }
  .tile:hover {
    border-color: var(--line-strong);
    background: var(--raised);
  }
  .t-office {
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: var(--ink-2);
    overflow-wrap: anywhere;
  }
  .t-who {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 6px;
    font-size: var(--step--1);
  }
  .t-who strong {
    font-weight: 800;
  }
  .t-who .num {
    color: var(--ink);
  }
  .t-word {
    margin-top: auto;
    font-size: 0.75rem;
    color: var(--muted);
  }
  .more {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    justify-self: start;
    min-height: 32px;
    padding: 4px 0;
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
    color: var(--ink);
  }
  .m-which {
    font-weight: 400;
  }
  .more :global(.chev) {
    transition: transform 0.15s;
  }
  .more :global(.chev.shut) {
    transform: rotate(-90deg);
  }
  .props {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .prop {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 32px;
    padding: 4px 10px 4px 8px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--surface);
    color: var(--ink);
    font-size: var(--step--1);
    text-decoration: none;
    white-space: nowrap;
  }
  .prop:hover {
    border-color: var(--line-strong);
  }
  .p-label {
    font-weight: 700;
  }
</style>
