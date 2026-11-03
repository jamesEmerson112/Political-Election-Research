<script lang="ts">
  import { build, demo, draft } from "virtual:datasets";
  import AboutView from "./components/AboutView.svelte";
  import ContestView from "./components/ContestView.svelte";
  import Drawer from "./components/Drawer.svelte";
  import IssuesView from "./components/IssuesView.svelte";
  import MeasuresView from "./components/MeasuresView.svelte";
  import TrialBallot from "./components/TrialBallot.svelte";
  import MeasureView from "./components/MeasureView.svelte";
  import Overview from "./components/Overview.svelte";
  import QueueView from "./components/QueueView.svelte";
  import SourcesView from "./components/SourcesView.svelte";
  import Tooltip from "./components/Tooltip.svelte";
  import { contestRoute, Index } from "./lib/data";
  import { plural } from "./lib/format";
  import { loadDatasetChoice, saveDatasetChoice, ui } from "./lib/ui.svelte";

  let datasetKey = $state<"draft" | "demo">(loadDatasetChoice());
  let route = $state(readRoute());

  const bundle = $derived(datasetKey === "demo" ? demo : draft);
  const ix = $derived(new Index(bundle));
  /** Height of the sticky header, for things that stick below it (the trial ballot's meter). */
  let topH = $state(0);
  $effect(() => {
    document.documentElement.style.setProperty("--top-h", `${topH}px`);
  });
  const contestRefs = $derived(ix.contestRefs());
  /** "overview?cd=11&boe=2" -> path "overview", query "cd=11&boe=2" (the Overview's My ballot districts). */
  const routePath = $derived(route.split("?")[0] ?? "");
  const routeQuery = $derived(route.includes("?") ? route.slice(route.indexOf("?") + 1) : "");
  const routeContest = $derived(contestRefs.find((r) => contestRoute(r) === routePath));
  const view = $derived(
    routeContest ? "contest" : ["issues", "sources", "queue", "measures", "trial", "about"].includes(routePath) ? routePath : "overview",
  );

  function readRoute(): string {
    return decodeURIComponent(location.hash.slice(1)) || "overview";
  }

  function choose(key: "draft" | "demo") {
    datasetKey = key;
    saveDatasetChoice(key);
    ui.detail = null;
  }

  $effect(() => {
    const onHash = () => {
      route = readRoute();
      ui.detail = null;
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  });

  const REPO = "https://github.com/jamesEmerson112/Political-Election-Research";
</script>

<header class="top" bind:clientHeight={topH}>
  <div class="wrap top-row">
    <a class="brand" href="#overview">
      <span class="brand-name">Political Election Research</span>
      <span class="brand-sub">California · cited candidate research</span>
    </a>
    <div class="controls">
      {#if bundle.validation.errors > 0}<a class="chip bad" href="#about">✕ {plural(bundle.validation.errors, "validation error")}</a>{/if}
      <a class="beta" href="#about" title="What this beta covers, its open checks, and privacy">Beta</a>
    </div>
  </div>
  <nav class="wrap nav" aria-label="Sections">
    <a href="#overview" class:active={view === "overview"}>Overview</a>
    {#if routeContest}
      <a class="cur" href={`#${contestRoute(routeContest)}`} class:active={true} aria-current="page">{ix.contestTitle(routeContest)}</a>
    {/if}
    <a href="#measures" class:active={view === "measures"}>Measures</a>
    <a href="#trial" class:active={view === "trial"}>Try your ballot</a>
    <a href="#issues" class:active={view === "issues"}>Issues</a>
    <a href="#sources" class:active={view === "sources"}>Sources</a>
    <a href="#queue" class:active={view === "queue"}>Research queue</a>
    <a href="#about" class:active={view === "about"}>About</a>
  </nav>
</header>

{#if bundle.fictional}
  <div class="banner demo">
    <div class="wrap">
      <strong>Fictional demo.</strong> Every person, organization, number and quote on this view is made up (jurisdiction “ZZ”, example.org
      sources). It shows what a fully researched contest looks like. <button class="link" onclick={() => choose("draft")}>Back to the real data</button>
    </div>
  </div>
{:else if ix.claimCount() === 0}
  <div class="banner draft">
    <div class="wrap">
      <strong>Draft.</strong> No cited research has been recorded yet. You’re seeing the research agendas, the questions every candidate
      will be asked, and <em>unverified leads</em>. Switch to <button class="link" onclick={() => choose("demo")}>Fictional demo</button> to
      see a finished contest.
    </div>
  </div>
{/if}

<main class="wrap main">
  {#key datasetKey}
    {#if view === "contest" && routeContest}
      {#if ix.kindOf(routeContest) === "measure"}
        <MeasureView {ix} contestRef={routeContest} />
      {:else}
        <ContestView {ix} contestRef={routeContest} />
      {/if}
    {:else if view === "measures"}
      <MeasuresView {ix} onDemo={() => choose("demo")} />
    {:else if view === "trial"}
      <TrialBallot {ix} onDemo={() => choose("demo")} />
    {:else if view === "issues"}
      <IssuesView {ix} />
    {:else if view === "sources"}
      <SourcesView {ix} />
    {:else if view === "queue"}
      <QueueView {ix} />
    {:else if view === "about"}
      <AboutView {ix} dataset={datasetKey} onchoose={choose} />
    {:else}
      <Overview {ix} query={routeQuery} />
    {/if}
  {/key}
</main>

<footer class="wrap foot">
  <p>Every claim cites a registered source with a verbatim quote or a filing locator. Data checked {bundle.today}.</p>
  <p class="links">
    <a href="#about">About this beta</a>
    <a href={`${REPO}/issues/new?template=correction.yml`} rel="noopener">Report an error</a>
    <a href={REPO} rel="noopener">Source on GitHub</a>
    <span class="mono">{build.sha ?? "local build"}</span>
  </p>
</footer>

<Drawer {ix} />
<Tooltip />

<style>
  .top {
    position: sticky;
    top: env(safe-area-inset-top, 0px);
    z-index: 20;
    background: var(--surface);
    border-bottom: 1px solid var(--line);
  }
  .top-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px 20px;
    padding-block: 12px 8px;
  }
  .brand {
    display: grid;
    text-decoration: none;
    min-width: 0;
  }
  .brand-name {
    font-weight: 800;
    font-size: var(--step-1);
    letter-spacing: -0.01em;
  }
  .brand-sub {
    font-size: var(--step--1);
    color: var(--muted);
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }
  .beta {
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    padding: 2px 10px;
    font-size: var(--step--1);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    text-decoration: none;
    color: var(--ink);
    background: var(--paper);
  }
  .beta:hover {
    border-color: var(--ink);
  }
  a.chip {
    text-decoration: none;
  }
  .nav {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 18px;
    padding-block: 2px 0;
    font-size: var(--step--1);
    font-weight: 600;
  }
  .nav a {
    text-decoration: none;
    color: var(--ink-2);
    padding: 6px 0 8px;
    border-bottom: 2px solid transparent;
  }
  .nav a:hover {
    color: var(--ink);
  }
  .nav a.active {
    color: var(--ink);
    border-bottom-color: var(--ink);
  }
  .nav a.cur {
    max-width: 22ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .banner {
    border-bottom: 1px solid var(--line);
    font-size: var(--step--1);
    padding-block: 10px;
  }
  .banner .wrap {
    max-width: 1180px;
  }
  .banner.demo {
    background: var(--wash);
  }
  .banner.draft {
    background: var(--warning-wash);
  }
  .link {
    border: 0;
    background: none;
    padding: 0;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
    font-weight: 600;
  }
  .main {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 36px;
    padding-block: 28px 48px;
  }
  .foot {
    display: grid;
    gap: 6px;
    padding-block: 18px 40px;
    color: var(--muted);
    font-size: var(--step--1);
    border-top: 1px solid var(--line);
  }
  .foot .links {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
  }
  .foot a {
    color: var(--ink-2);
  }
</style>
