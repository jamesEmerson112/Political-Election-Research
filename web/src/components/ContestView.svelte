<script lang="ts">
  import type { Citation, Index, Lead, Rec } from "../lib/data";
  import { slugOf } from "../lib/data";
  import { date, money, ORG_TYPE_LABEL, plural, ROLE_LABEL, TASK_LABEL } from "../lib/format";
  import { openDetail } from "../lib/ui.svelte";
  import { age, isNotFound, openField, openItems, openLeads, openPosition, openRel, yearsSince } from "../lib/view";
  import InfluenceMap from "./InfluenceMap.svelte";
  import StanceChip from "./StanceChip.svelte";

  let { ix, contestRef }: { ix: Index; contestRef: string } = $props();

  const cands = $derived(ix.candidatesOf(contestRef));
  const agenda = $derived(ix.agendas.get(contestRef));
  const contest = $derived(ix.contests.get(contestRef));
  const electionDate = $derived(
    String(ix.elections.get(`election:${slugOf(contestRef).split("/")[0]}`)?.["date"] ?? ix.b.today),
  );
  const subjects = $derived(agenda ? [...(agenda["questions"] as string[]), ...(agenda["measures"] as string[])] : []);
  const cutoff = $derived((agenda?.["targets"]?.["finance_cutoff"] as string | null) ?? null);
  const tasks = $derived(ix.tasksFor(contestRef));
  const openTasks = $derived(tasks.filter((t) => !t.blocked_by));
  const progress = $derived(ix.progress(contestRef));
  const cov = $derived(ix.b.coverage[contestRef]);
  const endorsers = $derived(
    [...new Set(cands.flatMap((c) => ix.endorsementsOf(c).map((e) => String(e["endorser"]))))].filter((r) => r.startsWith("org:")),
  );

  const EXPLICIT = new Set(["support", "oppose", "mixed"]);
  const compared = $derived(
    subjects.map((s) => {
      const stances = cands.map((c) => (ix.latest(c, s)?.["stance"] as string | undefined) ?? null);
      const kind = stances.every((x) => x && EXPLICIT.has(x))
        ? new Set(stances).size === 1
          ? "shared"
          : "differ"
        : "incomplete";
      return { subject: s, kind };
    }),
  );
  const shared = $derived(compared.filter((c) => c.kind === "shared"));
  const differ = $derived(compared.filter((c) => c.kind === "differ"));
  const incomplete = $derived(compared.filter((c) => c.kind === "incomplete"));

  const profile = (c: string): Rec => (ix.people.get(c)?.["candidate_profile"] as Rec | undefined) ?? {};
  const dossier = (c: string): Rec | undefined => ix.b.dossiers.find((d) => d["actor"] === c);
  const leads = (c: string, topic: string): Lead[] => ix.leadsFor(contestRef, c, topic);
  /** A count task closed as "searched, none exist" in the agenda. */
  const exhaustedFor = (c: string, topic: string): Rec | undefined =>
    ((agenda?.["exhausted"] as Rec[] | undefined) ?? []).find((e) => e["task"] === `${slugOf(contestRef)}|${topic}|${c}`);
  const legislation = (c: string): Rec[] =>
    ix.ofType("legislative_action").filter((r) => r["person"] === c).sort((a, b) => (a["date"] < b["date"] ? 1 : -1));
  const bill = (id: string): Rec | undefined => ix.b.bills.find((b) => b["id"] === id);
  const billLabel = (id: string) =>
    /-file-/.test(id) ? `${id.split("-file-")[0]!.toUpperCase()} File ${id.split("-file-")[1]}` : id.replace(/^(ca|us)-\d+-/, "").replace("-", " ").toUpperCase();
  const offices = (c: string): Rec[] => (profile(c)["offices_held"]?.["items"] as Rec[] | undefined) ?? [];
  const rollup = (c: string) => ix.b.rollups[contestRef]?.[c];
  const ACTION: Record<string, string> = {
    authored: "Authored",
    coauthored: "Co-authored",
    sponsored: "Sponsored",
    cosponsored: "Co-sponsored",
    voted_yes: "Voted yes",
    voted_no: "Voted no",
    abstained: "Abstained",
    publicly_supported: "Publicly supported",
    publicly_opposed: "Publicly opposed",
  };

  function subjectText(s: string): string {
    return ix.questions.get(s)?.q["text"] ?? `${ix.contestTitle(s)}: should it pass?`;
  }
  function subjectIssue(s: string): string {
    return ix.questions.get(s)?.issue["name"] ?? "Ballot measure";
  }
</script>

{#snippet cite(title: string, kicker: string, citations: Citation[] | undefined)}
  {#if citations?.length}
    <button class="cite" onclick={() => openDetail({ kicker, title, citations })} aria-label={`Sources for ${title}`}>
      {citations.length}
    </button>
  {/if}
{/snippet}

{#snippet leadBox(list: Lead[], title: string)}
  <button class="lead" onclick={() => openLeads(title, list)}>
    <span class="lead-tag">Unverified lead</span>
    {#each list as l, i (i)}
      <span class="lead-text">{l.text}</span>
    {/each}
  </button>
{/snippet}

{#snippet missing(c: string, topic: string, title: string)}
  {@const ls = leads(c, topic)}
  {@const ex = exhaustedFor(c, topic)}
  {#if ex}
    <button class="gap" onclick={() => openField(title, ix.name(c), { as_of: ex["date"], items: [], search_log: ex["search_log"] })}>
      None found · where we looked
    </button>
  {:else if ls.length}
    {@render leadBox(ls, title)}
  {:else}
    <span class="none">Not researched</span>
  {/if}
{/snippet}

{#snippet field(c: string, key: string, title: string)}
  {@const v = profile(c)[key]}
  {#if v && isNotFound(v)}
    <button class="gap" onclick={() => openField(title, ix.name(c), v)}>Not found · where we looked</button>
  {:else if v}
    <span>{v["value"]}</span>
    {@render cite(title, ix.name(c), v["citations"])}
  {:else}
    {@render missing(c, `profile.${key}`, `${title}: ${ix.name(c)}`)}
  {/if}
{/snippet}

{#snippet list(c: string, key: string, title: string, items: Rec[], line: (r: Rec) => string, showLeads = true)}
  {@const v = profile(c)[key]}
  {#if !v && !showLeads}
    <span class="none">Not researched</span>
  {:else if !v}
    {@render missing(c, `profile.${key}`, `${title}: ${ix.name(c)}`)}
  {:else if items.length === 0}
    <button class="gap" onclick={() => openField(title, ix.name(c), v)}>None found · where we looked</button>
  {:else}
    <ul class="items">
      {#each items as it, i (i)}
        <li><span>{line(it)}</span>{@render cite(line(it), ix.name(c), it["citations"])}</li>
      {/each}
    </ul>
  {/if}
{/snippet}

{#snippet section(c: string, key: string, title: string, render: (it: Rec) => string)}
  {@const sec = dossier(c)?.[key]}
  {#if !sec}
    {@render missing(c, `dossier.${key}`, `${title}: ${ix.name(c)}`)}
  {:else if (sec["items"] as Rec[]).length === 0}
    <button class="gap" onclick={() => openField(title, ix.name(c), sec)}>None found · where we looked</button>
  {:else}
    <ul class="items">
      {#each sec["items"] as it (it["id"])}
        <li>
          <button class="item-btn" onclick={() => openItems(it["title"], `${ix.name(c)} · ${title}`, [it], () => it["title"])}>
            <strong>{it["title"]}</strong>{it["date"] ? ` · ${it["date"]}` : ""}
          </button>
          <span class="sub">{render(it)}</span>
        </li>
      {/each}
    </ul>
  {/if}
{/snippet}

{#snippet catRow(n: number, name: string, source: string)}
  <tr class="cat">
    <th colspan={cands.length + 1}>
      <span class="cat-n num">{n}</span>
      <span class="cat-name">{name}</span>
      <span class="cat-src">{source}</span>
    </th>
  </tr>
{/snippet}

{#snippet stanceRow(s: string)}
  <tr>
    <th scope="row">
      <span class="q">{subjectText(s)}</span>
      <span class="sub">{subjectIssue(s)}</span>
    </th>
    {#each cands as c (c)}
      {@const p = ix.latest(c, s)}
      {@const ls = leads(c, s)}
      {@const hint = ls.find((l) => l.hint)?.hint ?? null}
      <td>
        <button class="stance-btn" onclick={() => openPosition(ix, c, s, contestRef)}>
          <StanceChip stance={p ? String(p["stance"]) : null} lead={hint} leadCount={ls.length} />
          {#if p?.["summary"]}
            <span class="sub">{p["summary"]}</span>
          {:else if !p && ls.length}
            {#each ls as l, i (i)}<span class="sub lead-inline">{l.label ? `${l.label}: ` : ""}{l.text}</span>{/each}
          {/if}
        </button>
      </td>
    {/each}
  </tr>
{/snippet}

<header class="head">
  <div class="eyebrow">{ix.electionOf(contestRef)}</div>
  <h1>{ix.contestTitle(contestRef)}</h1>
  <div class="chips">
    {#if contest}
      <span class="chip ok">✓ On the official certified list</span>
    {:else}
      <span class="chip warn">! Candidates not yet verified against the official list</span>
    {/if}
    {#if progress.total}
      <span class="chip num">{Math.round((progress.done / progress.total) * 100)}% of agenda researched</span>
    {/if}
    <span class="chip num">{plural(openTasks.length, "open task")}</span>
    {#if cutoff}<span class="chip num">Money through {date(cutoff)}</span>{/if}
  </div>
  {#if agenda}
    <p class="note">{agenda["seeded"]["note"]}</p>
  {/if}
</header>

{#if cands.length}
  <div class="scroll-x">
    <table class="compare" style:--n={cands.length}>
      <colgroup>
        <col class="label-col" />
        {#each cands as c (c)}<col />{/each}
      </colgroup>
      <thead>
        <tr>
          <th></th>
          {#each cands as c (c)}
            {@const entry = ix.ballotEntry(contestRef, c)}
            <th class="cand">
              <span class="cand-name">{ix.name(c)}</span>
              {#if entry}
                <span class="sub">{entry["party"]}{entry["ballot_designation"] ? ` · “${entry["ballot_designation"]}”` : ""}</span>
              {:else}
                <span class="sub">Not yet verified on the ballot</span>
              {/if}
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {@render catRow(1, "Identity", "Official biography, certified candidate list")}
        <tr>
          <th scope="row">Full name</th>
          {#each cands as c (c)}<td>{ix.name(c)}</td>{/each}
        </tr>
        <tr>
          <th scope="row">Age on election day</th>
          {#each cands as c (c)}
            {@const b = profile(c)["birth_date"]}
            <td>
              {#if b && !isNotFound(b)}
                <span class="num">{age(b["value"], electionDate)}</span> <span class="sub">born {b["value"]}</span>
                {@render cite("Birth date", ix.name(c), b["citations"])}
              {:else}
                {@render field(c, "birth_date", "Birth date")}
              {/if}
            </td>
          {/each}
        </tr>
        <tr>
          <th scope="row">Party</th>
          {#each cands as c (c)}<td>{@render field(c, "party_registration", "Party")}</td>{/each}
        </tr>
        <tr>
          <th scope="row">Place of origin</th>
          {#each cands as c (c)}<td>{@render field(c, "birthplace", "Place of origin")}</td>{/each}
        </tr>
        <tr>
          <th scope="row">Lives in</th>
          {#each cands as c (c)}<td>{@render field(c, "residence_city", "Residence")}</td>{/each}
        </tr>

        {@render catRow(2, "Occupation", "Government records, official biography")}
        <tr>
          <th scope="row">Occupation</th>
          {#each cands as c (c)}<td>{@render field(c, "occupation", "Occupation")}</td>{/each}
        </tr>
        <tr>
          <th scope="row">Current office · years served</th>
          {#each cands as c (c)}
            <td>
              {@render list(c, "offices_held", "Current office", offices(c).filter((o) => o["current"] ?? !o["end"]), (o) =>
                `${o["office"]}${o["start"] || o["first_elected"] ? ` · ${yearsSince(o["start"] ?? o["first_elected"], electionDate)}${o["start"] ? ` (since ${String(o["start"]).slice(0, 4)})` : ` (first elected ${String(o["first_elected"]).slice(0, 4)})`}` : ""}`,
              )}
            </td>
          {/each}
        </tr>

        {@render catRow(3, "Qualifications", "University and official biographies")}
        <tr>
          <th scope="row">Education</th>
          {#each cands as c (c)}
            <td>
              {@render list(c, "education", "Education", (profile(c)["education"]?.["items"] as Rec[]) ?? [], (e) =>
                [e["degree"], e["institution"], e["year"]].filter(Boolean).join(", "),
              )}
            </td>
          {/each}
        </tr>
        <tr>
          <th scope="row">Professional experience</th>
          {#each cands as c (c)}
            <td>
              {@render list(c, "career", "Professional experience", (profile(c)["career"]?.["items"] as Rec[]) ?? [], (e) =>
                `${e["role"]}, ${e["organization"]}${e["start"] ? ` (${e["start"]}–${e["end"] ?? ""})` : ""}`,
              )}
            </td>
          {/each}
        </tr>
        <tr>
          <th scope="row">Previous offices</th>
          {#each cands as c (c)}
            <td>
              {@render list(c, "offices_held", "Previous offices", offices(c).filter((o) => !(o["current"] ?? !o["end"])), (o) =>
                `${o["office"]}${o["start"] || o["end"] ? ` (${o["start"] ? String(o["start"]).slice(0, 4) : "?"}–${o["end"] ? String(o["end"]).slice(0, 4) : "?"})` : ""}`,
              false)}
            </td>
          {/each}
        </tr>

        {@render catRow(4, "Past policies", "Legislative records")}
        <tr>
          <th scope="row">Bills authored, voted on or publicly backed</th>
          {#each cands as c (c)}
            {@const acts = legislation(c)}
            <td>
              {#if acts.length}
                <ul class="items">
                  {#each acts as a (a["id"])}
                    {@const b = bill(a["bill"])}
                    <li>
                      <button
                        class="item-btn"
                        onclick={() =>
                          openRel(ix, a, `${billLabel(a["bill"])}${b ? ` · ${b["title"]["value"]}` : ""}`, [
                            ["Action", ACTION[a["action"]] ?? a["action"]],
                            ["Date", date(a["date"])],
                            ["Outcome", b ? `${String(b["status"]["value"]).replace(/_/g, " ")} (as of ${date(b["status"]["as_of"])})` : "No bill record yet"],
                          ])}
                      >
                        <strong>{billLabel(a["bill"])}</strong>{b ? ` ${b["title"]["value"]}` : ""}
                      </button>
                      <span class="sub">{ACTION[a["action"]]}{a["date"] ? ` · ${date(a["date"])}` : ""}{b ? ` · ${String(b["status"]["value"]).replace(/_/g, " ")}` : ""}</span>
                    </li>
                  {/each}
                </ul>
              {:else}
                {@render missing(c, "legislation", `Past policies: ${ix.name(c)}`)}
              {/if}
            </td>
          {/each}
        </tr>

        {@render catRow(5, "Shared policies", "Computed from cited stances: both take the same side")}
        {#each shared as s (s.subject)}{@render stanceRow(s.subject)}{/each}
        {#if !shared.length}
          <tr><td class="empty-row" colspan={cands.length + 1}>No question where every candidate has a cited stance on the same side yet.</td></tr>
        {/if}

        {@render catRow(6, "Policy differences", "Computed from cited stances: platforms, interviews, voting records")}
        {#each differ as s (s.subject)}{@render stanceRow(s.subject)}{/each}
        {#if !differ.length}
          <tr><td class="empty-row" colspan={cands.length + 1}>No question where cited stances differ yet.</td></tr>
        {/if}
        {#if incomplete.length}
          <tr class="subcat"><th colspan={cands.length + 1}>Not yet comparable: at least one stance is missing or not explicit</th></tr>
          {#each incomplete as s (s.subject)}{@render stanceRow(s.subject)}{/each}
        {/if}

        {@render catRow(7, "Endorsements", "Endorser’s own announcement")}
        <tr>
          <th scope="row">Endorsed by</th>
          {#each cands as c (c)}
            {@const ens = ix.endorsementsOf(c)}
            <td>
              {#if ens.length}
                <ul class="items">
                  {#each ens as e (e["id"])}
                    {@const org = ix.orgs.get(e["endorser"])}
                    <li class:rescinded={!!e["rescinded"]}>
                      <button
                        class="item-btn"
                        onclick={() =>
                          openRel(ix, e, ix.name(e["endorser"]), [
                            ["Endorser type", org ? (ORG_TYPE_LABEL[org["org_type"]] ?? org["org_type"]) : "Person"],
                            ["Date", date(e["date"])],
                            ...(e["rescinded"] ? ([["Rescinded", date(e["rescinded"]["date"])]] as [string, string][]) : []),
                          ])}
                      >
                        {ix.name(e["endorser"])}
                      </button>
                      <span class="sub">{org ? (ORG_TYPE_LABEL[org["org_type"]] ?? "") : "Individual"}{e["rescinded"] ? " · rescinded" : ""}</span>
                    </li>
                  {/each}
                </ul>
              {:else}
                {@render missing(c, "endorsements", `Endorsements: ${ix.name(c)}`)}
              {/if}
            </td>
          {/each}
        </tr>

        {@render catRow(8, "Campaign financing", cutoff ? `Campaign finance filings through ${date(cutoff)}` : "Campaign finance filings")}
        <tr>
          <th scope="row">Raised by the campaign · top contributors</th>
          {#each cands as c (c)}
            {@const r = rollup(c)}
            <td>
              {#if r && r.committees.length}
                <div class="big num">{money(r.receipts_cents)}</div>
                <span class="sub">{r.committees.map((x) => ix.name(x)).join(", ")}</span>
                {#if r.top_donors.length}
                  {@const max = Math.max(...r.top_donors.map((d) => d.amount_cents))}
                  <ul class="bars">
                    {#each r.top_donors.slice(0, 5) as d (d.donor)}
                      <li>
                        <span class="bar-label">{ix.name(d.donor)}</span>
                        <span class="bar"><span style:width={`${(d.amount_cents / max) * 100}%`}></span></span>
                        <span class="bar-val num">{money(d.amount_cents)}</span>
                      </li>
                    {/each}
                  </ul>
                {/if}
                {#if r.excluded.transfer_cents || Object.keys(r.via_conduits).length}
                  <span class="sub">
                    {r.excluded.transfer_cents ? `Not counted: ${money(r.excluded.transfer_cents)} in transfers between committees. ` : ""}
                    {#each Object.entries(r.via_conduits) as [k, v] (k)}{money(v)} arrived via {ix.name(k)} (credited to the original donors).{/each}
                  </span>
                {/if}
              {:else}
                {@render missing(c, "contributions", `Campaign financing: ${ix.name(c)}`)}
              {/if}
            </td>
          {/each}
        </tr>
        <tr>
          <th scope="row">Outside spending (independent expenditures)</th>
          {#each cands as c (c)}
            {@const r = rollup(c)}
            {@const ie = r?.independent_expenditures}
            <td>
              {#if ie && ie.spenders.length}
                <div class="ie">
                  <span><span class="sw support"></span>Supporting <strong class="num">{money(ie.support_cents)}</strong></span>
                  <span><span class="sw oppose"></span>Opposing <strong class="num">{money(ie.oppose_cents)}</strong></span>
                </div>
                <span class="sub">{ie.spenders.map((s) => ix.name(s.spender)).join(", ")}</span>
              {:else}
                {@render missing(c, "independent_expenditures", `Outside spending: ${ix.name(c)}`)}
              {/if}
            </td>
          {/each}
        </tr>

        {@render catRow(9, "Performance record", "Government records")}
        <tr>
          <th scope="row">Documented outcomes</th>
          {#each cands as c (c)}
            <td>{@render section(c, "track_record", "Performance record", (it) => String(it["summary"]))}</td>
          {/each}
        </tr>

        {@render catRow(10, "Controversies and criticisms", "Reporting and primary documents · candidate’s response always shown")}
        <tr>
          <th scope="row">Documented controversies</th>
          {#each cands as c (c)}
            <td>
              {@render section(c, "controversies", "Controversies", (it) =>
                `${it["summary"]} Response: ${it["response"]?.["status"] === "not_found" ? "none found." : it["response"]?.["summary"]}${it["resolution"] ? ` Resolution: ${it["resolution"]["summary"]}` : ""}`,
              )}
            </td>
          {/each}
        </tr>

        {@render catRow(11, "Campaign promises", "Campaign platforms")}
        <tr>
          <th scope="row">Specific proposals</th>
          {#each cands as c (c)}
            <td>{@render section(c, "promises", "Campaign promises", (it) => String(it["summary"]))}</td>
          {/each}
        </tr>

        {#if cands.some((c) => leads(c, "other").length)}
          <tr class="subcat"><th colspan={cands.length + 1}>Other unverified leads</th></tr>
          {#each [...new Set((ix.leads.get(contestRef) ?? []).filter((l) => l.topic === "other").map((l) => l.label ?? "Other"))] as label (label)}
            <tr>
              <th scope="row">{label}</th>
              {#each cands as c (c)}
                {@const ls = leads(c, "other").filter((l) => (l.label ?? "Other") === label)}
                <td>{#if ls.length}{@render leadBox(ls, `${label}: ${ix.name(c)}`)}{/if}</td>
              {/each}
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>

  <section class="section">
    <div class="section-head">
      <h2>Money and influence map</h2>
      <p>
        Who gives to each campaign’s committees, who endorses, and who spends from outside. Committees that don’t count toward this race
        (leadership PACs, officeholder accounts) are shown but not counted.
      </p>
    </div>
    <InfluenceMap {ix} {contestRef} candidates={cands} />
  </section>

  <section class="section">
    <div class="section-head">
      <h2>Behind the endorsers</h2>
      <p>What each endorsing organization gave, received and spent on lobbying, from filings. Lobbying filings name bills and agencies, not individual politicians. Disclosure is not wrongdoing.</p>
    </div>
    {#if endorsers.length}
      <div class="scroll-x">
        <table class="grid">
          <thead>
            <tr><th>Endorser</th><th>Endorses</th><th class="num">Gave (all recipients)</th><th class="num">Received</th><th>Lobbying</th></tr>
          </thead>
          <tbody>
            {#each endorsers as e (e)}
              {@const gave = ix.ofType("contribution").filter((r) => r["donor"] === e)}
              {@const got = ix.ofType("contribution").filter((r) => r["recipient"] === e)}
              {@const lob = ix.ofType("lobbying").filter((r) => r["client"] === e)}
              <tr>
                <td><strong>{ix.name(e)}</strong><br /><span class="muted">{ORG_TYPE_LABEL[ix.orgs.get(e)?.["org_type"]] ?? ""}</span></td>
                <td>{cands.filter((c) => ix.endorsementsOf(c).some((x) => x["endorser"] === e)).map((c) => ix.name(c)).join(", ")}</td>
                <td class="num">
                  <button class="link-btn" onclick={() => openItems(`Contributions by ${ix.name(e)}`, "From filings", gave, (r) => `${money(r["money"]["amount_cents"])} to ${ix.name(r["recipient"])}`)}>
                    {money(gave.reduce((a, r) => a + r["money"]["amount_cents"], 0))}
                  </button>
                </td>
                <td class="num">{money(got.reduce((a, r) => a + r["money"]["amount_cents"], 0))}</td>
                <td>
                  {#each lob as l (l["id"])}
                    <button class="link-btn" onclick={() => openRel(ix, l, `Lobbying by ${ix.name(e)}`, [
                      ["Paid", money(l["money"]["amount_cents"])],
                      ["Period", `${date(l["money"]["period"]["start"])} – ${date(l["money"]["period"]["end"])}`],
                      ["Firm", l["firm"] ? ix.name(l["firm"]) : "In-house"],
                      ["Bills", (l["targets"]["bills"] as string[]).map(billLabel).join(", ") || "—"],
                      ["Agencies", (l["targets"]["agencies"] as string[]).join(", ") || "—"],
                    ])}>
                      {money(l["money"]["amount_cents"])} on {(l["targets"]["bills"] as string[]).map(billLabel).join(", ") || "agencies"}
                    </button>
                  {:else}
                    <span class="muted">None recorded</span>
                  {/each}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <p class="empty">No endorsing organizations recorded yet.</p>
    {/if}
  </section>
{/if}

<section class="section">
  <div class="section-head">
    <h2>Research progress</h2>
    <p>The deterministic queue from <span class="mono">npm run next</span>. Tasks go item by item for every candidate, so partial research stays balanced.</p>
  </div>
  {#if cov}
    {@const asym = cov.rows.filter((r) => r.asymmetric)}
    {#if asym.length}
      <p class="chip warn">! Uneven research: {asym.map((r) => r.label).join(", ")}</p>
    {:else}
      <p class="chip ok">✓ Every candidate researched to the same depth</p>
    {/if}
  {/if}
  {#if openTasks.length}
    <ol class="tasks">
      {#each openTasks.slice(0, 12) as t (t.id)}
        <li>
          <span class="task-kind">{TASK_LABEL[t.kind] ?? t.kind}</span>
          <span>{t.subject ? ix.name(t.subject) : ""}{t.item ? ` · ${t.item.startsWith("q:") || t.item.startsWith("contest:") ? subjectText(t.item) : t.item.replace(/_/g, " ")}` : ""}</span>
          {#if t.leads?.length}<span class="chip warn">{plural(t.leads.length, "lead")}</span>{/if}
        </li>
      {/each}
    </ol>
    {#if openTasks.length > 12}<p class="muted">…and {openTasks.length - 12} more on the Research queue page.</p>{/if}
  {:else}
    <p class="chip ok">✓ No open tasks</p>
  {/if}
</section>

<style>
  .head {
    display: grid;
    gap: 10px;
  }
  h1 {
    font-size: var(--step-3);
    font-weight: 800;
    letter-spacing: -0.02em;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .note {
    font-size: var(--step--1);
    color: var(--ink-2);
    max-width: 80ch;
  }
  .compare {
    width: 100%;
    min-width: 620px;
    border-collapse: collapse;
    background: var(--surface);
    border: 1px solid var(--line);
    font-size: var(--step--1);
  }
  .label-col {
    width: 22%;
  }
  .compare th,
  .compare td {
    text-align: left;
    vertical-align: top;
    padding: 10px 12px;
    border-bottom: 1px solid var(--line);
  }
  .compare tbody th[scope="row"] {
    font-weight: 600;
    color: var(--ink-2);
  }
  .compare td + td,
  .compare th + td {
    border-left: 1px solid var(--line);
  }
  thead .cand {
    vertical-align: bottom;
    border-bottom: 2px solid var(--ink);
  }
  .cand-name {
    display: block;
    font-size: var(--step-1);
    font-weight: 800;
    color: var(--ink);
  }
  tr.cat th {
    background: var(--wash);
    padding-block: 8px;
    border-top: 1px solid var(--line-strong);
  }
  .cat-n {
    display: inline-grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 1px solid var(--ink);
    font-size: 0.75rem;
    font-weight: 700;
    margin-right: 8px;
  }
  .cat-name {
    font-weight: 800;
    font-size: var(--step-0);
    color: var(--ink);
  }
  .cat-src {
    font-weight: 400;
    color: var(--muted);
    margin-left: 10px;
  }
  tr.subcat th {
    font-weight: 600;
    color: var(--muted);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .empty-row {
    color: var(--muted);
    font-style: italic;
  }
  .q {
    display: block;
    color: var(--ink);
    font-weight: 600;
  }
  .sub {
    display: block;
    color: var(--ink-2);
    font-weight: 400;
    margin-top: 2px;
  }
  .none {
    color: var(--muted);
  }
  .cite {
    display: inline-grid;
    place-items: center;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    margin-left: 6px;
    border-radius: 4px;
    border: 1px solid var(--line-strong);
    background: var(--surface);
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--ink-2);
    cursor: pointer;
    vertical-align: 1px;
  }
  .cite:hover {
    border-color: var(--ink);
    color: var(--ink);
  }
  .gap,
  .item-btn,
  .stance-btn,
  .link-btn {
    border: 0;
    background: none;
    padding: 0;
    text-align: left;
    cursor: pointer;
  }
  .gap {
    color: var(--ink-2);
    text-decoration: underline dotted;
    text-underline-offset: 3px;
  }
  .item-btn:hover,
  .link-btn:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .stance-btn {
    display: grid;
    gap: 2px;
    width: 100%;
  }
  .lead {
    display: grid;
    gap: 4px;
    text-align: left;
    width: 100%;
    border: 1px dashed var(--warning);
    background: transparent;
    border-radius: var(--radius);
    padding: 6px 8px;
    cursor: pointer;
    color: var(--ink-2);
  }
  .lead-tag {
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--warning);
  }
  .lead-text,
  .lead-inline {
    font-style: italic;
  }
  .lead-inline {
    border-left: 2px dashed var(--warning);
    padding-left: 8px;
  }
  .items {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 8px;
  }
  .rescinded .item-btn {
    text-decoration: line-through;
  }
  .big {
    font-size: var(--step-2);
    font-weight: 800;
  }
  .bars {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    display: grid;
    gap: 2px;
  }
  .bars li {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
  }
  .bar-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bar {
    height: 10px;
    background: var(--wash);
    border-radius: 0 4px 4px 0;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--money);
    border-radius: 0 4px 4px 0;
  }
  .ie {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
  }
  .sw {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    margin-right: 6px;
    vertical-align: -1px;
  }
  .sw.support {
    background: var(--support);
  }
  .sw.oppose {
    background: var(--oppose);
  }
  .tasks {
    margin: 0;
    padding-left: 1.6em;
    display: grid;
    gap: 6px;
    font-size: var(--step--1);
  }
  .task-kind {
    font-weight: 600;
    margin-right: 6px;
  }
  .tasks .chip {
    margin-left: 6px;
  }
</style>
