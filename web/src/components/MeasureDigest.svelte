<script lang="ts">
  import { MARK } from "../lib/marks";
  import { openDetail } from "../lib/ui.svelte";
  import StanceMark from "./StanceMark.svelte";

  /**
   * The official digest, as printed in the voter guide under the heading it
   * prints (`digest.label`: "Digest by the Ballot Simplification Council" in San
   * Francisco, "What your vote means" in California's guide): the way it is now,
   * the proposal, and what a YES or a NO vote means. Every part keeps its source count. `clamp` (trial card): the
   * two long parts show four lines first, with "Read more".
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Rec = Record<string, any>;
  let { digest, clamp = false }: { digest: Rec; clamp?: boolean } = $props();

  const LABEL = $derived(String(digest["label"] ?? "Official digest"));
  const PARTS = [
    ["way_it_is_now", "The way it is now"],
    ["proposal", "The proposal"],
  ] as const;
  let expanded = $state<Record<string, boolean>>({});
  /** Whether a clamped part is actually cut off at the current width (so "Read more" only shows when it does something). */
  let over = $state<Record<string, boolean>>({});
  function overflow(node: HTMLElement, key: string) {
    const check = () => {
      const o = node.scrollHeight > node.clientHeight + 1;
      if (over[key] !== o) over = { ...over, [key]: o };
    };
    const ro = new ResizeObserver(check);
    ro.observe(node);
    check();
    return { destroy: () => ro.disconnect() };
  }
  const cites = (v: Rec | undefined) => (v?.["citations"] ?? []) as never[];
  /** Printed bullets (" • ") start new lines; nothing else about the text changes. */
  const lines = (s: string) => String(s).split(/\s(?=•\s)/);
  const source = (title: string, v: Rec) => openDetail({ kicker: LABEL, title, text: v["value"], citations: cites(v) });
</script>

<div class="digest">
  <span class="eyebrow">{LABEL}</span>
  {#each PARTS as [k, t] (k)}
    {#if digest[k]}
      {@const v = digest[k]}
      {@const folded = clamp && !expanded[k]}
      <div class="part">
        <p class:clamp={folded} use:overflow={k}>
          <strong>{t}:</strong>
          {#each lines(v["value"]) as ln, i (i)}{#if i}<br />{/if}{ln}{/each}
          <button class="cite" onclick={() => source(t, v)} aria-label={`${cites(v).length} source${cites(v).length === 1 ? "" : "s"}: ${t}`}>{cites(v).length}</button>
        </p>
        {#if clamp && (expanded[k] || over[k])}
          <button class="more" aria-expanded={!folded} onclick={() => (expanded = { ...expanded, [k]: folded })}>{folded ? "Read more" : "Show less"}</button>
        {/if}
      </div>
    {/if}
  {/each}
  <div class="means">
    {#each [["yes_means", "A YES vote means", "support"], ["no_means", "A NO vote means", "oppose"]] as const as [k, t, m] (k)}
      {#if digest[k]}
        <p>
          <StanceMark mark={MARK[m]!} />
          <span
            ><strong>{t}:</strong>
            {digest[k]["value"]}
            <button class="cite" onclick={() => source(t, digest[k])} aria-label={`${cites(digest[k]).length} source${cites(digest[k]).length === 1 ? "" : "s"}: ${t}`}
              >{cites(digest[k]).length}</button
            ></span
          >
        </p>
      {/if}
    {/each}
  </div>
</div>

<style>
  .digest {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }
  .part p,
  .means p {
    overflow-wrap: anywhere;
    font-size: var(--step--1);
  }
  .clamp {
    display: -webkit-box;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .more {
    background: none;
    border: 0;
    padding: 0;
    color: var(--ink-2);
    text-decoration: underline;
    cursor: pointer;
    font-size: var(--step--1);
  }
  .means {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 10px;
  }
  .means p {
    display: flex;
    gap: 6px;
    align-items: baseline;
  }
  .cite {
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    margin-left: 4px;
    border-radius: 4px;
    border: 1px solid var(--line-strong);
    background: var(--surface);
    font-size: 0.7rem;
    font-weight: 700;
    cursor: pointer;
    vertical-align: baseline;
  }
  @media (max-width: 560px) {
    .means {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
