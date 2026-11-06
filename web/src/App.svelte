<script lang="ts">
  import { tick } from "svelte";
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
  import { need, parts, withParts } from "./lib/parts.svelte";
  import type { LazyPart } from "./lib/data";

  let datasetKey = $state<"draft" | "demo">(loadDatasetChoice());
  let route = $state(readRoute());

  /** The draft's on-demand parts (tasks, leads) join it as they arrive; pages that need them ask (lib/parts.svelte.ts). */
  const bundle = $derived(datasetKey === "demo" ? demo : withParts(draft, parts.loaded));
  const ix = $derived(new Index(bundle));
  /** Height of the sticky header, for things that stick below it (the trial ballot's meter). */
  let topH = $state(0);
  /** On a phone the section links are one row that scrolls sideways: keep the current one in view. */
  let navEl = $state<HTMLElement | null>(null);
  $effect(() => {
    void route;
    const nav = navEl;
    if (!nav || nav.scrollWidth <= nav.clientWidth) return;
    requestAnimationFrame(() => {
      const a = nav.querySelector<HTMLElement>("a.active");
      if (!a) return;
      const left = a.offsetLeft - nav.offsetLeft;
      if (left < nav.scrollLeft || left + a.offsetWidth > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = Math.max(0, left - 24);
    });
  });
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

  /**
   * What each page needs beyond the page itself (lib/parts.svelte.ts): contest and measure pages the records and the
   * leads; Issues, Sources and Try your ballot the records. The Overview, Measures and About need neither.
   */
  const wants = $derived<LazyPart[]>(
    view === "contest" ? ["records", "leads"] : view === "queue" ? ["tasks"] : ["issues", "sources", "trial"].includes(view) ? ["records"] : [],
  );
  $effect(() => {
    need(bundle.lazy, ...wants);
  });
  const waiting = $derived(wants.filter((p) => !ix.ready(p)));
  const loadFailed = $derived(waiting.some((p) => parts.failed.includes(p)));
  // Once the first page is up and the browser is idle, fetch the rest, so the next page opens at once.
  $effect(() => {
    const lazy = draft.lazy;
    const later = () => need(lazy, "records", "leads", "tasks");
    const t = setTimeout(() => ("requestIdleCallback" in window ? window.requestIdleCallback(later, { timeout: 4000 }) : later()), 2000);
    return () => clearTimeout(t);
  });

  function readRoute(): string {
    return decodeURIComponent(location.hash.slice(1)) || "overview";
  }

  function choose(key: "draft" | "demo") {
    datasetKey = key;
    saveDatasetChoice(key);
    ui.detail = null;
  }

  /**
   * Each page in the browser's history keeps the reader's scroll position: Back and Forward return there, and a newly
   * opened page starts at the top. The position is saved into the current history entry just before a link is
   * followed and shortly after scrolling stops.
   */
  $effect(() => {
    history.scrollRestoration = "manual";
    const save = () => {
      try {
        history.replaceState({ ...(history.state ?? {}), y: Math.round(window.scrollY) }, "");
      } catch {
        // History unavailable (sandboxed frame): Back then starts at the top.
      }
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(save, 150);
    };
    const onHash = async () => {
      const y = (history.state as { y?: unknown } | null)?.y;
      route = readRoute();
      ui.detail = null;
      if (typeof y !== "number") {
        window.scrollTo({ top: 0 });
        return;
      }
      await tick();
      requestAnimationFrame(() => window.scrollTo({ top: y }));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("click", save, true);
    window.addEventListener("hashchange", onHash);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("click", save, true);
      window.removeEventListener("hashchange", onHash);
    };
  });

  const REPO = "https://github.com/jamesEmerson112/Political-Election-Research";
</script>

<header class="top" bind:clientHeight={topH}>
  <div class="wrap top-row">
    <a class="brand" href="#overview">
      <span class="brand-name">Political Election Research</span>
      <span class="brand-sub">California and Nevada · cited candidate research</span>
    </a>
    <div class="controls">
      {#if bundle.validation.errors > 0}<a class="chip bad" href="#about">✕ {plural(bundle.validation.errors, "validation error")}</a>{/if}
      <a class="beta" href="#about" title="What this beta covers, its open checks, and privacy">Beta</a>
    </div>
  </div>
  <nav class="wrap nav" aria-label="Sections" bind:this={navEl}>
    <a href="#overview" class:active={view === "overview"}>Overview</a>
    {#if routeContest}
      <a class="cur" href={`#${contestRoute(routeContest)}`} class:active={true} aria-current="page">{ix.listTitle(routeContest)}</a>
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
  <aside class="banner demo" aria-label="About this dataset">
    <div class="wrap">
      <strong>Fictional demo.</strong> Every person, organization, number and quote on this view is made up (jurisdiction “ZZ”, example.org
      sources). It shows what a fully researched contest looks like. <button class="link" onclick={() => choose("draft")}>Back to the real data</button>
    </div>
  </aside>
{:else if ix.claimCount() === 0}
  <aside class="banner draft" aria-label="About this dataset">
    <div class="wrap">
      <strong>Draft.</strong> No cited research has been recorded yet. You’re seeing the research agendas, the questions every candidate
      will be asked, and <em>unverified leads</em>. Switch to <button class="link" onclick={() => choose("demo")}>Fictional demo</button> to
      see a finished contest.
    </div>
  </aside>
{/if}

<main class="wrap main">
  {#key datasetKey}
    {#if waiting.length}
      <p class="loading" aria-busy={!loadFailed}>{loadFailed ? "This page's data couldn't load. Reload the page to try again." : "Loading…"}</p>
    {:else if view === "contest" && routeContest}
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
  .loading {
    min-height: 50vh;
    color: var(--ink-2);
    font-size: var(--step--1);
  }
  .main {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 36px;
    padding-block: 28px 48px;
  }
  /* Phones: the brand and the Beta badge on one line, the section links in one row that scrolls sideways (with a
     fade at the edge), so the sticky header takes about 80px instead of 177px. */
  @media (max-width: 600px) {
    .top-row {
      flex-wrap: nowrap;
      padding-block: 8px 2px;
    }
    .brand-name {
      font-size: var(--step-0);
    }
    .brand-sub {
      display: none;
    }
    .nav {
      flex-wrap: nowrap;
      gap: 0 16px;
      overflow-x: auto;
      scrollbar-width: none;
      overscroll-behavior-x: contain;
      mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent);
    }
    .nav::-webkit-scrollbar {
      display: none;
    }
    .nav a {
      flex: none;
      white-space: nowrap;
    }
    .nav a:last-child {
      padding-right: 24px;
    }
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
