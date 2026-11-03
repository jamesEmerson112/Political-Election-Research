<script lang="ts">
  import { MARK } from "../lib/marks";
  import { openDetail } from "../lib/ui.svelte";
  import StanceMark from "./StanceMark.svelte";

  /**
   * The official voter guide's arguments, side by side: Yes | No.
   * Printed as submitted by their authors (opinions, not facts), verbatim.
   * Same visual weight for both sides; counts first, full text on click.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Arg = Record<string, any>;
  let { args, title }: { args: Arg[]; title: string } = $props();

  const LABEL: Record<string, string> = {
    proponent: "Proponent's argument",
    opponent: "Opponent's argument",
    rebuttal_to_proponent: "Rebuttal to the proponent",
    rebuttal_to_opponent: "Rebuttal to the opponent",
    paid: "Paid argument",
  };
  const pick = (side: "yes" | "no", kinds: string[]) => args.filter((a) => a["side"] === side && kinds.includes(String(a["kind"])));
  const rows = $derived([
    { yes: pick("yes", ["proponent"]), no: pick("no", ["opponent"]) },
    { yes: pick("yes", ["rebuttal_to_opponent"]), no: pick("no", ["rebuttal_to_proponent"]) },
  ]);
  const paidYes = $derived(pick("yes", ["paid"]));
  const paidNo = $derived(pick("no", ["paid"]));
  const open = (a: Arg) =>
    openDetail({
      kicker: `${a["side"] === "yes" ? "For" : "Against"} · ${LABEL[a["kind"]] ?? a["kind"]}`,
      title: a["heading"] || title,
      text: a["text"],
      facts: [
        ...(a["authors"]?.length ? [["Signed by", a["authors"].join("; ")] as [string, string]] : []),
        ...(a["funds_source"] ? [["Paid for by", a["funds_source"]] as [string, string]] : []),
      ],
      citations: a["citations"],
      note: "Printed in the official voter guide as submitted by its authors, unedited. Arguments are opinions, not verified facts.",
    });
</script>

{#snippet card(a: Arg)}
  <details class="arg panel">
    <summary>
      <span class="kind">{a["side"] === "yes" ? "For" : "Against"} · {LABEL[a["kind"]] ?? a["kind"]}</span>
      {#if a["heading"]}<strong class="head">{a["heading"]}</strong>{/if}
      <span class="lead">{a["text"]}</span>
      <span class="by">{a["authors"]?.slice(0, 3).join("; ")}{a["authors"]?.length > 3 ? ` and ${a["authors"].length - 3} more` : ""}</span>
    </summary>
    <p class="full">{a["text"]}</p>
    {#if a["funds_source"]}<p class="funds"><strong>Paid for by:</strong> {a["funds_source"]}</p>{/if}
    <button class="link" onclick={() => open(a)}>Source and signers ›</button>
  </details>
{/snippet}

<div class="cols head-row">
  <span class="side"><StanceMark mark={MARK["support"]!} /> For (Yes)</span>
  <span class="side"><StanceMark mark={MARK["oppose"]!} /> Against (No)</span>
</div>
{#each rows as r, i (i)}
  {#if r.yes.length || r.no.length}
    <div class="cols">
      <div class="col">{#each r.yes as a (a["id"])}{@render card(a)}{:else}<p class="none">None submitted</p>{/each}</div>
      <div class="col">{#each r.no as a (a["id"])}{@render card(a)}{:else}<p class="none">None submitted</p>{/each}</div>
    </div>
  {/if}
{/each}
{#if paidYes.length || paidNo.length}
  <div class="cols">
    <div class="col">
      <span class="count num">{paidYes.length} paid argument{paidYes.length === 1 ? "" : "s"} for</span>
      {#each paidYes as a (a["id"])}{@render card(a)}{/each}
    </div>
    <div class="col">
      <span class="count num">{paidNo.length} paid argument{paidNo.length === 1 ? "" : "s"} against</span>
      {#each paidNo as a (a["id"])}{@render card(a)}{/each}
    </div>
  </div>
{/if}
<p class="note">Printed in the official voter guide as submitted, unedited (typos included). Arguments are their authors' opinions; this site doesn't check them.</p>

<style>
  .cols {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 10px;
  }
  .col {
    display: grid;
    align-content: start;
    gap: 8px;
    min-width: 0;
  }
  .head-row .side {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 700;
  }
  .arg {
    padding: 8px 12px;
  }
  summary {
    cursor: pointer;
    display: grid;
    gap: 3px;
    list-style: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  .kind,
  .count {
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .head {
    overflow-wrap: anywhere;
  }
  .lead {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    color: var(--ink-2);
    font-size: var(--step--1);
    overflow-wrap: anywhere;
  }
  details[open] .lead {
    display: none;
  }
  .by {
    color: var(--muted);
    font-size: 0.72rem;
    overflow-wrap: anywhere;
  }
  .full,
  .funds {
    font-size: var(--step--1);
    overflow-wrap: anywhere;
    margin-top: 6px;
  }
  .funds {
    color: var(--ink-2);
  }
  .none,
  .note {
    color: var(--muted);
    font-size: var(--step--1);
  }
  .link {
    background: none;
    border: 0;
    padding: 0;
    margin-top: 6px;
    color: var(--ink-2);
    text-decoration: underline;
    cursor: pointer;
    font-size: var(--step--1);
  }
  @media (max-width: 560px) {
    .cols {
      grid-template-columns: minmax(0, 1fr);
    }
    .head-row {
      display: none;
    }
  }
</style>
