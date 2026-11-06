<script lang="ts">
  import { build } from "virtual:datasets";
  import type { Index } from "../lib/data";
  import { plural } from "../lib/format";

  /**
   * About this beta: what it covers, the data's open checks (from `npm run
   * validate`), privacy, how to report an error, the build, and the switch to
   * the fictional demo (moved here from the header for the public beta).
   */
  let { ix, dataset, onchoose }: { ix: Index; dataset: "draft" | "demo"; onchoose: (key: "draft" | "demo") => void } = $props();

  const REPO = "https://github.com/jamesEmerson112/Political-Election-Research";
  const v = $derived(ix.b.validation);
  const byCode = $derived(
    v.problems.reduce<Record<string, number>>((acc, p) => {
      acc[p.code] = (acc[p.code] ?? 0) + 1;
      return acc;
    }, {}),
  );
  const OPEN_CHECKS: Array<[string, string]> = [
    ["UNVERIFIED_CITATION", "citations seen only indirectly (e.g. a search summary), not yet verified"],
    ["QUOTE_PENDING", "citations a maintainer checked that still need their exact quote"],
    ["ARCHIVE_REQUIRED", "sources without an archived copy in the Wayback Machine"],
    ["ORPHAN_SOURCE", "sources no record cites yet"],
  ];
  const otherWarnings = $derived(v.warnings - OPEN_CHECKS.reduce((n, [code]) => n + (byCode[code] ?? 0), 0));
  const local = $derived(ix.localMeasureGroups());
  const state = $derived(ix.stateMeasures("ca"));
  const openTasks = $derived(ix.b.tasks.filter((t) => !t.blocked_by).length);
  const agendas = $derived(ix.b.agendas.length);
</script>

<section class="section about">
  <div class="section-head">
    <h1>About this beta</h1>
    <p>
      An open, cited archive of the November 3, 2026 ballot, starting with San Francisco and California. Every claim links to the source it came from, with
      the exact words quoted. It describes; it doesn't recommend how to vote.
    </p>
  </div>

  <div class="grid">
    <div class="panel box">
      <span class="eyebrow">What's in it</span>
      <ul>
        {#each local as g (g.jurisdiction)}
          <li>
            <strong>{g.jurisdiction}:</strong>
            {plural(g.refs.length, "measure")}, each with the official digest, the fiscal statement, who it affects, and every argument printed in the voter guide.
          </li>
        {/each}
        {#if state.length}
          <li>
            <strong>California:</strong>
            {plural(state.length, "statewide proposition")}, each with the official title and summary, what a yes and a no vote mean, and the Legislative
            Analyst's fiscal estimate.
          </li>
        {/if}
        <li>
          <a href="#trial">Try your ballot</a>: vote on each measure and see the official estimates added up against that government's budget forecast.
        </li>
        <li>
          <strong>Candidates:</strong> research agendas for {plural(agendas, "contest")}, with {openTasks.toLocaleString("en-US")} research
          {openTasks === 1 ? "task" : "tasks"} still open (<a href="#queue"
            >Research queue</a
          >). Nevada (Las Vegas) contests are placeholders for now.
        </li>
      </ul>
    </div>

    <div class="panel box">
      <span class="eyebrow">Data status</span>
      <p>
        {#if v.errors === 0}<strong>No errors.</strong>{:else}<strong>{plural(v.errors, "error")}.</strong>{/if}
        Open checks before a 1.0 release:
      </p>
      <ul class="num">
        {#each OPEN_CHECKS as [code, what] (code)}
          {#if byCode[code]}<li><strong>{byCode[code]}</strong> {what}</li>{/if}
        {/each}
        {#if otherWarnings > 0}<li><strong>{otherWarnings}</strong> other warnings</li>{/if}
      </ul>
      <p class="muted">Checked {ix.b.today} with <span class="mono">npm run validate</span>; the rules are in the methodology.</p>
    </div>

    <div class="panel box">
      <span class="eyebrow">Privacy</span>
      <ul>
        <li>No accounts and no cookies.</li>
        <li>
          Your trial-ballot answers and the district numbers you pick for My ballot stay in this browser; "Forget my answers" and "Forget" clear them.
        </li>
        <li>If you use your device's location to find your districts, it is matched in this browser; coordinates are never stored or sent.</li>
        <li>
          Page views on the public site are counted with Vercel Web Analytics. Each one reports the page's address without anything after “#” or “?”, so
          your answers, your districts and your device's location are never in it.
        </li>
        <li>
          <a href="https://vercel.com/docs/analytics#how-visitors-are-determined" rel="noopener">According to Vercel</a>, Web Analytics stores only
          anonymized data and uses no cookies; it tells visitors apart by a hash of the request that resets every day.
          <a href="https://vercel.com/docs/analytics/privacy-policy#data-point-information" rel="noopener">Vercel's list</a> of what it may record with a
          page view includes the time, the page's address, the page that linked you here (if your browser shares it), the country, region and city of
          your connection, and your browser, operating system and device type.
        </li>
        <li>
          Nothing you enter is sent anywhere: apart from the page view, the page has no code that sends data, and the public site's security policy blocks
          it from sending data to other servers. Its fonts load from Google Fonts.
        </li>
      </ul>
    </div>

    <div class="panel box">
      <span class="eyebrow">Corrections and source</span>
      <p><a href={`${REPO}/issues/new?template=correction.yml`} rel="noopener">Report an error</a> (a GitHub form; it needs a free GitHub account).</p>
      <p>
        Data and code: <a href={REPO} rel="noopener">GitHub</a>. How the research is done:
        <a href={`${REPO}/blob/main/docs/METHODOLOGY.md`} rel="noopener">methodology</a>.
      </p>
      <p>
        Code: <a href={`${REPO}/blob/main/LICENSE`} rel="noopener">MIT</a>. Data and docs:
        <a href={`${REPO}/blob/main/LICENSE-DATA`} rel="noopener">CC BY 4.0</a> (credit the project); quoted sources keep their owners' terms.
      </p>
      <p class="muted mono">Build {build.sha ?? "local"} · {build.date}</p>
    </div>

    <div class="panel box">
      <span class="eyebrow">See a finished contest</span>
      <p>
        The fictional demo shows what a fully researched contest looks like. Every person, organization, number and quote in it is made up (jurisdiction “ZZ”,
        example.org sources).
      </p>
      <div class="seg" role="group" aria-label="Dataset">
        <button id="ds-draft" class:on={dataset === "draft"} aria-pressed={dataset === "draft"} onclick={() => onchoose("draft")}>Real data</button>
        <button id="ds-demo" class:on={dataset === "demo"} aria-pressed={dataset === "demo"} onclick={() => onchoose("demo")}>Fictional demo</button>
      </div>
    </div>
  </div>
</section>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
    gap: 14px;
  }
  .box {
    display: grid;
    gap: 8px;
    align-content: start;
    padding: 14px 16px;
    font-size: var(--step--1);
  }
  .box ul {
    margin: 0;
    padding-left: 18px;
    display: grid;
    gap: 6px;
  }
  .box p {
    margin: 0;
  }
  .seg {
    justify-self: start;
    display: inline-flex;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    padding: 2px;
    background: var(--paper);
  }
  .seg button {
    border: 0;
    background: transparent;
    padding: 4px 12px;
    border-radius: 999px;
    font-size: var(--step--1);
    font-weight: 600;
    color: var(--ink-2);
    cursor: pointer;
  }
  .seg button.on {
    background: var(--ink);
    color: var(--surface);
  }
</style>
