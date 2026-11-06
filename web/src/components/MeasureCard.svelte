<script lang="ts">
  import type { Index } from "../lib/data";
  import { contestRoute } from "../lib/data";
  import { measureLabel } from "../lib/measureLabel";
  import { MEASURE_ICON } from "../lib/icons";
  import { budgetBase, fiscalChips, measureFactChips } from "../lib/measureChips";
  import Badge from "./Badge.svelte";
  import OfficeChips from "./OfficeChips.svelte";
  import ResultBar from "./ResultBar.svelte";
  import { measureOutcome } from "../lib/results";

  /** One ballot measure: number, facts and fiscal chips first (or the official written estimate); the measure page on click. */
  let { ix, contestRef }: { ix: Index; contestRef: string } = $props();
  const c = $derived(ix.contests.get(contestRef)!);
  const label = (ref: string) => measureLabel(ix, ref);
  const outcome = $derived(measureOutcome(c));
</script>

<a class="mcard panel" href={`#${contestRoute(contestRef)}`}>
  <span class="top">
    <Badge icon={MEASURE_ICON} group="record" size={26} />
    <span class="letter">{label(contestRef)}</span>
    <OfficeChips chips={measureFactChips(c)} />
  </span>
  {#if outcome}<ResultBar o={outcome} title={ix.contestTitle(contestRef)} compact still />{/if}
  <span class="title">{c["official_title"]?.["value"] ?? ix.contestTitle(contestRef)}</span>
  <span class="sum">{c["summary"]?.["value"] ?? ""}</span>
  <OfficeChips chips={fiscalChips(c, label, budgetBase(ix.budgetFor(contestRef)))} />
  {#if !(c["fiscal"]?.["effects"]?.length) && c["fiscal"]?.["summary"]?.["summary"]}
    <span class="fis"><strong>{c["fiscal"]["statement_by"]}:</strong> {c["fiscal"]["summary"]["summary"]}</span>
  {/if}
</a>

<style>
  .mcard {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
    padding: 12px 14px;
    color: inherit;
    text-decoration: none;
  }
  .mcard:hover,
  .mcard:focus-visible {
    border-color: var(--line-strong);
  }
  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
    min-width: 0;
  }
  .letter {
    font-weight: 700;
    font-size: var(--step-0);
  }
  .title {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .sum {
    color: var(--ink-2);
    font-size: var(--step--1);
    overflow-wrap: anywhere;
  }
  .fis {
    display: -webkit-box;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: var(--step--1);
    color: var(--ink-2);
    overflow-wrap: anywhere;
  }
</style>
