<script lang="ts">
  import type { Index, Rec } from "../lib/data";
  import { date, money, ROLE_LABEL } from "../lib/format";
  import { hideTip, showTip } from "../lib/ui.svelte";
  import { openRel } from "../lib/view";
  import { MARK } from "../lib/marks";
  import MarkShape from "./MarkShape.svelte";
  import StanceMark from "./StanceMark.svelte";

  let { ix, contestRef, candidates }: { ix: Index; contestRef: string; candidates: string[] } = $props();
  let picked = $state<string | null>(null);
  const cand = $derived(picked && candidates.includes(picked) ? picked : (candidates[0] ?? ""));

  const COUNTED = new Set(["principal_campaign", "authorized", "ca_controlled"]);
  const W = 900;
  const XL = 300;
  const XM = 560;
  const XC = 840;
  const ROW = 46;

  interface Edge {
    d: string;
    kind: "contribution" | "transfer" | "endorsement" | "ie-support" | "ie-oppose" | "role" | "role-uncounted";
    rel: Rec;
    tip: string[];
    title: string;
    facts: Array<[string, string]>;
    /** For / against mark at the edge midpoint (outside spending). */
    mid?: { x: number; y: number };
  }

  const graph = $derived.by(() => {
    const roles = ix.committeeRoles(cand);
    const committees = roles.map((r) => ({
      ref: String(r["committee"]),
      rel: r,
      counted: COUNTED.has(String(r["role"])) && r["contest"] === contestRef,
    }));
    const midSet = new Set(committees.map((c) => c.ref));
    const leftTotals = new Map<string, number>();
    const add = (ref: string, cents: number) => leftTotals.set(ref, (leftTotals.get(ref) ?? 0) + cents);
    const contribs = ix.ofType("contribution").filter((r) => midSet.has(String(r["recipient"])));
    const endorsements = ix.endorsementsOf(cand).filter((r) => !r["rescinded"]);
    const ies = ix.ofType("independent_expenditure").filter((r) => r["target"] === cand);
    for (const r of contribs) if (!midSet.has(String(r["donor"]))) add(String(r["donor"]), r["money"]["amount_cents"]);
    for (const r of ies) add(String(r["spender"]), r["money"]["amount_cents"]);
    for (const r of endorsements) add(String(r["endorser"]), 0);
    const left = [...leftTotals.entries()]
      .sort((a, b) => b[1] - a[1] || ix.name(a[0]).localeCompare(ix.name(b[0])))
      .map(([ref]) => ref);
    const rows = Math.max(left.length, committees.length, 1);
    const H = rows * ROW + 64;
    const yL = (i: number) => 52 + i * ROW + ((rows - left.length) * ROW) / 2;
    const yM = (i: number) => 52 + i * ROW + ((rows - committees.length) * ROW) / 2;
    const yC = 52 + ((rows - 1) * ROW) / 2;
    const leftY = new Map(left.map((r, i) => [r, yL(i)]));
    const midY = new Map(committees.map((c, i) => [c.ref, yM(i)]));
    const curve = (x1: number, y1: number, x2: number, y2: number) =>
      `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`;
    const edges: Edge[] = [];
    for (const r of contribs) {
      const donor = String(r["donor"]);
      const to = String(r["recipient"]);
      const amount = money(r["money"]["amount_cents"]);
      const facts: Array<[string, string]> = [
        ["Amount", amount],
        ["Period", `${date(r["money"]["period"]["start"])} – ${date(r["money"]["period"]["end"])}`],
        ["Election", String(r["election_designation"])],
        ["Form", String(r["form"]).replace("_", "-")],
      ];
      if (r["conduit"]) facts.push(["Via", ix.name(r["conduit"])]);
      if (midSet.has(donor)) {
        const y1 = midY.get(donor)!;
        const y2 = midY.get(to)!;
        edges.push({
          d: `M${XM},${y1} C${XM + 60},${y1} ${XM + 60},${y2} ${XM},${y2}`,
          kind: "transfer",
          rel: r,
          title: `${ix.name(donor)} → ${ix.name(to)}`,
          tip: [`${ix.name(donor)} → ${ix.name(to)}`, `${amount} ${r["form"]} (not counted)`],
          facts,
        });
      } else {
        edges.push({
          d: curve(XL, leftY.get(donor)!, XM, midY.get(to)!),
          kind: "contribution",
          rel: r,
          title: `${ix.name(donor)} → ${ix.name(to)}`,
          tip: [`${ix.name(donor)} → ${ix.name(to)}`, `${amount} (${r["election_designation"]}${r["conduit"] ? `, via ${ix.name(r["conduit"])}` : ""})`],
          facts,
        });
      }
    }
    for (const r of ies) {
      const side = String(r["side"]);
      const amount = money(r["money"]["amount_cents"]);
      const y1 = leftY.get(String(r["spender"]))!;
      edges.push({
        mid: { x: (XL + XC) / 2, y: (y1 + yC) / 2 },
        d: curve(XL, y1, XC, yC),
        kind: side === "support" ? "ie-support" : "ie-oppose",
        rel: r,
        title: `${ix.name(r["spender"])}: outside spending ${side === "support" ? "supporting" : "opposing"} ${ix.name(cand)}`,
        tip: [ix.name(r["spender"]), `${amount} ${side === "support" ? "supporting" : "opposing"} (outside spending)`],
        facts: [["Amount", amount], ["Side", side]],
      });
    }
    for (const r of endorsements) {
      edges.push({
        d: curve(XL, leftY.get(String(r["endorser"]))!, XC, yC),
        kind: "endorsement",
        rel: r,
        title: `${ix.name(r["endorser"])} endorses ${ix.name(cand)}`,
        tip: [ix.name(r["endorser"]), `Endorsement${r["date"] ? `, ${date(r["date"])}` : ""}`],
        facts: [["Date", date(r["date"])]],
      });
    }
    for (const c of committees) {
      edges.push({
        d: curve(XM, midY.get(c.ref)!, XC, yC),
        kind: c.counted ? "role" : "role-uncounted",
        rel: c.rel,
        title: `${ix.name(c.ref)}: ${ROLE_LABEL[c.rel["role"]] ?? c.rel["role"]}`,
        tip: [ix.name(c.ref), `${ROLE_LABEL[c.rel["role"]] ?? c.rel["role"]}${c.counted ? "" : " · not counted for this race"}`],
        facts: [["Role", ROLE_LABEL[c.rel["role"]] ?? String(c.rel["role"])], ["Counted for this race", c.counted ? "Yes" : "No"]],
      });
    }
    return { left, leftTotals, committees, leftY, midY, yC, H, edges };
  });
</script>

{#if candidates.length > 1}
  <div class="tabs" role="tablist" aria-label="Candidate">
    {#each candidates as c (c)}
      <button role="tab" aria-selected={c === cand} class:on={c === cand} onclick={() => (picked = c)}>{ix.name(c)}</button>
    {/each}
  </div>
{/if}

{#if graph.left.length === 0 && graph.committees.length === 0}
  <p class="empty">No committee, contribution, endorsement or outside-spending records for {ix.name(cand)} yet.</p>
{:else}
  <div class="legend">
    <span><i class="ln money"></i>Contribution</span>
    <span><i class="ln endorse"></i>Endorsement</span>
    <span><i class="ln support"></i><StanceMark mark={MARK["ie_support"]!} size={11} /> Outside spending for</span>
    <span><i class="ln oppose"></i><StanceMark mark={MARK["ie_oppose"]!} size={11} /> Outside spending against</span>
    <span><i class="ln role"></i>Committee counted for this race</span>
    <span><i class="ln uncounted"></i>Committee not counted</span>
  </div>
  <div class="scroll-x panel">
    <svg viewBox={`0 0 ${W} ${graph.H}`} width={W} height={graph.H} role="img" aria-label={`Money and influence around ${ix.name(cand)}`}>
      <text class="col" x={XL} y="18" text-anchor="end">Donors · endorsers · outside spenders</text>
      <text class="col" x={XM} y="18" text-anchor="middle">Committees</text>
      <text class="col" x={XC} y="18" text-anchor="middle">Candidate</text>
      {#each graph.edges as e, i (i)}
        <g class="edge {e.kind}">
          <path d={e.d} class="stroke" fill="none" />
          {#if e.mid}
            <g transform={`translate(${e.mid.x},${e.mid.y})`}>
              <MarkShape mark={e.kind === "ie-support" ? MARK["ie_support"]! : MARK["ie_oppose"]!} s={7} />
            </g>
          {/if}
          <path
            d={e.d}
            class="hit"
            fill="none"
            role="button"
            tabindex="0"
            aria-label={e.title}
            onmousemove={(ev) => showTip(ev, e.tip)}
            onmouseleave={hideTip}
            onfocus={(ev) => showTip(ev, e.tip)}
            onblur={hideTip}
            onclick={() => openRel(ix, e.rel, e.title, e.facts)}
            onkeydown={(ev) => ev.key === "Enter" && openRel(ix, e.rel, e.title, e.facts)}
          />
        </g>
      {/each}
      {#each graph.left as ref (ref)}
        {@const y = graph.leftY.get(ref)!}
        {@const t = graph.leftTotals.get(ref) ?? 0}
        <circle cx={XL} cy={y} r="5" class="node" />
        <text x={XL - 12} y={y - 2} text-anchor="end" class="lbl">{ix.name(ref)}</text>
        <text x={XL - 12} y={y + 12} text-anchor="end" class="val">{t ? money(t) : "endorser"}</text>
      {/each}
      {#each graph.committees as c (c.ref)}
        {@const y = graph.midY.get(c.ref)!}
        <rect x={XM - 6} y={y - 6} width="12" height="12" rx="2" class="node" class:uncounted={!c.counted} />
        <text x={XM} y={y - 12} text-anchor="middle" class="lbl halo">{ix.name(c.ref)}</text>
      {/each}
      <circle cx={XC} cy={graph.yC} r="9" class="node cand" />
      <text x={XC} y={graph.yC + 28} text-anchor="middle" class="lbl strong halo">{ix.name(cand)}</text>
    </svg>
  </div>
{/if}

<style>
  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .tabs button {
    border: 1px solid var(--line-strong);
    background: var(--surface);
    border-radius: 999px;
    padding: 3px 12px;
    font-size: var(--step--1);
    font-weight: 600;
    cursor: pointer;
  }
  .tabs button.on {
    background: var(--ink);
    color: var(--surface);
    border-color: var(--ink);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
    font-size: var(--step--1);
    color: var(--ink-2);
  }
  .ln {
    display: inline-block;
    width: 22px;
    height: 0;
    border-top: 2px solid;
    margin-right: 6px;
    vertical-align: middle;
  }
  .ln.money {
    border-color: var(--money);
  }
  .ln.endorse {
    border-top-style: dashed;
    border-color: var(--ink-2);
  }
  .ln.support {
    border-color: var(--support);
  }
  .ln.oppose {
    border-color: var(--oppose);
  }
  .ln.role {
    border-color: var(--ink);
  }
  .ln.uncounted {
    border-top-style: dotted;
    border-color: var(--muted);
  }
  svg {
    display: block;
    font-family: var(--font-ui);
  }
  .col {
    fill: var(--muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .lbl {
    fill: var(--ink);
    font-size: 12px;
  }
  .halo {
    paint-order: stroke;
    stroke: var(--surface);
    stroke-width: 5px;
    stroke-linejoin: round;
  }
  .lbl.strong {
    font-weight: 800;
    font-size: 13px;
  }
  .val {
    fill: var(--ink-2);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .node {
    fill: var(--ink);
    stroke: var(--surface);
    stroke-width: 2;
  }
  .node.uncounted {
    fill: var(--surface);
    stroke: var(--muted);
  }
  .stroke {
    stroke-width: 2;
  }
  .hit {
    stroke: transparent;
    stroke-width: 12;
    cursor: pointer;
  }
  .hit:focus-visible {
    outline: none;
    stroke: color-mix(in srgb, var(--ink) 15%, transparent);
  }
  .edge:hover .stroke {
    stroke-width: 3;
  }
  .contribution .stroke {
    stroke: var(--money);
  }
  .transfer .stroke {
    stroke: var(--money);
    stroke-dasharray: 2 4;
  }
  .endorsement .stroke {
    stroke: var(--ink-2);
    stroke-dasharray: 5 4;
  }
  .ie-support .stroke {
    stroke: var(--support);
  }
  .ie-oppose .stroke {
    stroke: var(--oppose);
  }
  .role .stroke {
    stroke: var(--ink);
  }
  .role-uncounted .stroke {
    stroke: var(--muted);
    stroke-dasharray: 1 4;
  }
</style>
