<script lang="ts">
  import { BILL_OUTCOME } from "../lib/icons";

  /** One bill as a small stamp: shape + ink tone by outcome. The outcome word is in the tooltip (and the row's expansion). */
  let { outcome, text = "" }: { outcome: string; text?: string } = $props();
  const st = $derived(BILL_OUTCOME[outcome] ?? BILL_OUTCOME["other"]!);
</script>

<span class="stamp {st.shape}" style:--c={st.color} title={text || st.label} aria-hidden="true"></span>

<style>
  .stamp {
    display: inline-block;
    flex: none;
    width: 12px;
    height: 12px;
    border-radius: 2px;
    box-sizing: border-box;
  }
  .solid {
    background: var(--c);
  }
  .slash {
    background:
      linear-gradient(135deg, transparent 42%, var(--surface) 42%, var(--surface) 58%, transparent 58%),
      var(--c);
  }
  .hollow {
    border: 2px solid var(--c);
  }
  .dashed {
    border: 2px dashed var(--c);
  }
  .dot {
    width: 8px;
    height: 8px;
    margin: 2px;
    border-radius: 50%;
    background: var(--c);
  }
</style>
