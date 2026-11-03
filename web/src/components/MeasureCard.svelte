<script lang="ts">
  import type { Index } from "../lib/data";
  import { contestRoute } from "../lib/data";
  import { MEASURE_ICON } from "../lib/icons";
  import { budgetBase, fiscalChips, measureFactChips } from "../lib/measureChips";
  import Badge from "./Badge.svelte";
  import OfficeChips from "./OfficeChips.svelte";

  /** One local measure: letter, facts and fiscal chips first; the measure page on click. */
  let { ix, contestRef }: { ix: Index; contestRef: string } = $props();
  const c = $derived(ix.contests.get(contestRef)!);
  const label = (ref: string) => `Prop ${String(ix.contests.get(ref)?.["number"] ?? ix.contestTitle(ref))}`;
</script>

<a class="mcard panel" href={`#${contestRoute(contestRef)}`}>
  <span class="top">
    <Badge icon={MEASURE_ICON} group="record" size={26} />
    <span class="letter">Prop {c["number"]}</span>
    <OfficeChips chips={measureFactChips(c)} />
  </span>
  <span class="title">{c["official_title"]?.["value"] ?? ix.contestTitle(contestRef)}</span>
  <span class="sum">{c["summary"]?.["value"] ?? ""}</span>
  <OfficeChips chips={fiscalChips(c, label, budgetBase(ix.budgetFor(contestRef)))} />
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
</style>
