<script lang="ts">
  import { AFFECT_ICON, FALLBACK_AFFECT_ICON } from "../lib/icons";
  import { MARK } from "../lib/marks";
  import { affectLabel, affectsByEffect, EFFECT_LABEL, EFFECT_MAY, signersBySide, type Effect, type Side } from "../lib/measureGroups";
  import { openDetail } from "../lib/ui.svelte";
  import Badge from "./Badge.svelte";
  import StanceMark from "./StanceMark.svelte";

  /**
   * "Who it affects", Democracy-style but descriptive: the groups the official
   * digest and Controller's statement name, by what the text says they pay,
   * receive or have change (words, never arrows or colors), then how many people
   * and organizations signed the printed arguments on each side (▲/▼ mean
   * for/against only). Never says who benefits.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Rec = Record<string, any>;
  let { affects, args, title }: { affects: Rec[] | undefined; args: Rec[] | undefined; title: string } = $props();

  const rows = $derived(affectsByEffect(affects));
  const signers = $derived(signersBySide(args));
  const ARG: Record<string, string> = {
    proponent: "Proponent's argument",
    opponent: "Opponent's argument",
    "rebuttal-to-proponent": "Rebuttal to the proponent",
    "rebuttal-to-opponent": "Rebuttal to the opponent",
  };
  const argName = (id: string) => ARG[id] ?? id.replace(/^paid-(yes|no)-0*(\d+)$/, (_, s: string, n: string) => `Paid argument ${n} ${s === "yes" ? "for" : "against"}`);
  const NOTE = "From the official digest and Controller's statement. It says what the text says this group pays, receives or has change, not who benefits.";

  function openAffect(a: Rec) {
    const e = a["effect"] as Effect;
    openDetail({
      kicker: `Who it affects · ${a["conditional"] ? EFFECT_MAY[e] : EFFECT_LABEL[e]}`,
      title: affectLabel(a),
      text: a["text"],
      facts: a["figure"] ? [["Amount in the text", String(a["figure"])]] : [],
      citations: a["citations"],
      note: NOTE,
    });
  }
  function openSigners(side: Side) {
    openDetail({
      kicker: side === "yes" ? "Signed the arguments for" : "Signed the arguments against",
      title,
      facts: signers[side].map((s) => [s.name, s.arguments.map(argName).join("; ")] as [string, string]),
      note: "Names as printed in the official voter guide (spelling variants kept as printed); each with the arguments they signed.",
    });
  }
</script>

<div class="who">
  {#each rows as r (r.effect)}
    <div class="row">
      <span class="eff">{EFFECT_LABEL[r.effect]}</span>
      <span class="items">
        {#each r.items as a (`${a["group"]}/${a["label"] ?? ""}`)}
          <button class="grp" onclick={() => openAffect(a)}>
            <Badge icon={AFFECT_ICON[String(a["group"])] ?? FALLBACK_AFFECT_ICON} group="people" size={22} />
            <span class="name">{affectLabel(a)}{#if a["conditional"]}<span class="may"> (may)</span>{/if}</span>
            {#if a["figure"]}<span class="fig num">{a["figure"]}</span>{/if}
          </button>
        {/each}
      </span>
    </div>
  {:else}
    <p class="none">Who it affects: not researched yet.</p>
  {/each}
  {#if signers.yes.length || signers.no.length}
    <div class="row">
      <span class="eff">Signed the arguments</span>
      <span class="items">
        <button class="sig" onclick={() => openSigners("yes")} aria-label={`${signers.yes.length} signed for; list`}>
          <StanceMark mark={MARK["support"]!} size={13} /> <span class="num">{signers.yes.length}</span> for
        </button>
        <button class="sig" onclick={() => openSigners("no")} aria-label={`${signers.no.length} signed against; list`}>
          <StanceMark mark={MARK["oppose"]!} size={13} /> <span class="num">{signers.no.length}</span> against
        </button>
      </span>
    </div>
  {/if}
  {#if rows.length}<p class="note">{NOTE}</p>{/if}
</div>

<style>
  .who {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
  }
  .row {
    display: grid;
    grid-template-columns: 9.5rem minmax(0, 1fr);
    gap: 4px 10px;
    align-items: start;
  }
  .eff {
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
    padding-top: 4px;
  }
  .items {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-width: 0;
  }
  .grp,
  .sig {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    background: var(--surface);
    padding: 2px 10px 2px 3px;
    font-size: var(--step--1);
    color: var(--ink);
    cursor: pointer;
    text-align: left;
  }
  .sig {
    padding-left: 8px;
  }
  .name {
    overflow-wrap: anywhere;
  }
  .may {
    color: var(--muted);
  }
  .fig {
    border-left: 1px solid var(--line);
    padding-left: 6px;
    color: var(--ink-2);
    overflow-wrap: anywhere;
  }
  .none,
  .note {
    color: var(--muted);
    font-size: 0.72rem;
  }
  @media (max-width: 560px) {
    .row {
      grid-template-columns: minmax(0, 1fr);
    }
    .eff {
      padding-top: 0;
    }
  }
</style>
