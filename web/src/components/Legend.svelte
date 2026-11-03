<script lang="ts">
  import { BILL_OUTCOME, CATEGORY, GROUP_LABEL, type Group } from "../lib/icons";
  import { LEGEND } from "../lib/marks";
  import Badge from "./Badge.svelte";
  import BillStamp from "./BillStamp.svelte";
  import StanceMark from "./StanceMark.svelte";

  const groups: Array<[Group, keyof typeof CATEGORY]> = [
    ["issue", "differ"],
    ["money", "financing"],
    ["people", "endorsements"],
    ["record", "past_policies"],
  ];
  const outcomes = ["enacted", "vetoed", "stalled", "pending"];
</script>

<div class="legend" role="note" aria-label="Legend">
  <span class="grp">
    {#each LEGEND as m (m.label)}<span class="lg"><StanceMark mark={m} size={12} />{m.label}</span>{/each}
  </span>
  <span class="grp">
    {#each groups as [g, cat] (g)}<span class="lg"><Badge icon={CATEGORY[cat].icon} group={g} size={16} />{GROUP_LABEL[g]}</span>{/each}
  </span>
  <span class="grp">
    <span class="lg muted">Bills:</span>
    {#each outcomes as o (o)}<span class="lg"><BillStamp outcome={o} />{BILL_OUTCOME[o]!.label.split(" /")[0]}</span>{/each}
  </span>
</div>

<style>
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 22px;
    font-size: 0.75rem;
    color: var(--ink-2);
  }
  .grp {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
  }
  .lg {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
  }
</style>
