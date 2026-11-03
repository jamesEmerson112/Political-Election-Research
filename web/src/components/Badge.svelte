<script lang="ts">
  import { GROUP_COLOR, type Group, type IconComponent } from "../lib/icons";

  /**
   * Circular badge: a white Lucide glyph in a circle colored by category group.
   * Pass `label` when the badge stands alone (it becomes an image with that name);
   * omit it when visible text next to the badge already names it.
   */
  let { icon, group, size = 22, label = "" }: { icon: IconComponent; group: Group; size?: number; label?: string } = $props();
  const Icon = $derived(icon);
</script>

<span
  class="badge"
  style:--bg={GROUP_COLOR[group]}
  style:width={`${size}px`}
  style:height={`${size}px`}
  role={label ? "img" : undefined}
  aria-label={label || undefined}
  aria-hidden={label ? undefined : "true"}
>
  <Icon size={Math.round(size * 0.58)} strokeWidth={2.25} aria-hidden="true" />
</span>

<style>
  .badge {
    display: inline-grid;
    place-items: center;
    flex: none;
    border-radius: 50%;
    background: var(--bg);
    color: var(--on-badge);
    vertical-align: middle;
  }
  .badge :global(svg) {
    display: block;
  }
</style>
