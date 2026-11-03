<script lang="ts">
  import type { Mark } from "../lib/marks";
  import MarkShape from "./MarkShape.svelte";

  /** An inline mark in running HTML. Decorative: the label next to it (or the parent's aria-label) carries the meaning. */
  let { mark, size = 13 }: { mark: Mark; size?: number } = $props();
</script>

<svg class="mark" width={size} height={size} viewBox="-7 -7 14 14" aria-hidden="true">
  <MarkShape {mark} s={5.6} />
</svg>

<style>
  .mark {
    flex: none;
    display: inline-block;
    vertical-align: -2px;
    overflow: visible;
  }
</style>
