<script lang="ts">
  import {
    COUNTY_FIPS,
    choiceSummary,
    DISTRICT_COUNT,
    DISTRICT_NAME,
    districtLabel,
    isEmptyChoice,
    normalizeChoice,
    OFFICIAL_LINKS,
    senateSeatUp2026,
    type Choice,
    type DistrictKind,
  } from "../lib/ballot";
  import { lookupPoint, lookupZip, type Kind } from "../lib/geo";
  import { loadDistricts } from "../lib/geoData";
  import { BALLOT_ICON } from "../lib/icons";
  import { plural } from "../lib/format";
  import Badge from "./Badge.svelte";

  let {
    choice,
    showAll,
    onCount,
    total,
    onchange,
    ontoggle,
    onforget,
  }: {
    choice: Choice;
    showAll: boolean;
    onCount: number;
    total: number;
    onchange: (c: Choice) => void;
    ontoggle: () => void;
    onforget: () => void;
  } = $props();

  type Method = "pick" | "zip" | "locate";
  let method = $state<Method | null>(null);
  /** The input methods are open (always when nothing is set yet). */
  let changing = $state(false);
  const set = $derived(!isEmptyChoice(choice));
  const showMethods = $derived(!set || changing);
  const RESULT_KINDS: DistrictKind[] = ["cd", "boe"];

  /** One district (or several, when the lookup can't tell) per kind, from a ZIP or a location. */
  interface Found {
    source: "zip" | "locate";
    /** Possible districts per kind, with share of homes for ZIPs. */
    layers: Partial<Record<Kind, Array<{ n: number; share: number | null }>>>;
    /** Districts that hold part of the ZIP's land but none of its 2020 homes. */
    landOnly: Partial<Record<Kind, number[]>>;
    note: string[];
  }
  let found = $state<Found | null>(null);
  let busy = $state(false);
  let error = $state("");

  // ---- (a) pick districts directly
  let pickCd = $state(0);
  let pickBoe = $state(0);
  let pickSf = $state(false);
  let pickSup = $state(0);
  const SF = COUNTY_FIPS["san-francisco"]!;
  $effect(() => {
    // Mirror the current choice into the picker when it opens.
    if (method === "pick") {
      pickCd = choice.cd?.length === 1 ? choice.cd[0]! : 0;
      pickBoe = choice.boe?.length === 1 ? choice.boe[0]! : 0;
      pickSf = !!choice.county?.includes(SF);
      pickSup = choice.sfsup?.length === 1 ? choice.sfsup[0]! : 0;
    }
  });
  function applyPick() {
    onchange(
      normalizeChoice({
        cd: pickCd ? [pickCd] : [],
        boe: pickBoe ? [pickBoe] : [],
        county: pickSf ? [SF] : [],
        sfsup: pickSf && pickSup ? [pickSup] : [],
      }),
    );
    found = null;
    method = null;
    changing = false;
  }

  // ---- (b) ZIP code
  let zip = $state("");
  async function lookupZipCode(e: Event) {
    e.preventDefault();
    error = "";
    found = null;
    const z = zip.trim();
    if (!/^\d{5}$/.test(z)) {
      error = "Enter a 5-digit ZIP code.";
      return;
    }
    busy = true;
    try {
      const { file } = await loadDistricts();
      const r = lookupZip(file, z);
      if (!r) {
        error = `No California ZIP area ${z} in the 2020 census tables (PO-box-only and newer ZIP codes have none). Pick your districts instead.`;
        return;
      }
      const layers: Found["layers"] = {};
      const landOnly: Found["landOnly"] = {};
      for (const [k, list] of Object.entries(r.layers) as Array<[Kind, Array<{ n: number; share: number | null }>]>) {
        const homes = list.filter((d) => d.share === null || d.share > 0);
        layers[k] = homes.length ? homes : list;
        const rest = homes.length ? list.filter((d) => d.share === 0).map((d) => d.n) : [];
        if (rest.length) landOnly[k] = rest;
      }
      const note: string[] = [];
      if ((layers.cd?.length ?? 0) > 1) {
        note.push(`ZIP ${z} is split between ${layers.cd!.length} House districts. Your home address decides which one is yours, so all are shown until you choose.`);
      }
      if (r.crossesState) note.push(`ZIP ${z} also covers an area outside California; only its California part is described.`);
      found = { source: "zip", layers, landOnly, note };
      apply(found);
    } catch {
      error = "The ZIP table couldn't be loaded. Pick your districts instead.";
    } finally {
      busy = false;
    }
  }

  /** Show why a lookup failed and fall back to picking districts directly. */
  function fail(message: string) {
    error = message;
    method = "pick";
  }

  // ---- (c) device location (only on click; coordinates never leave this function)
  const canLocate = typeof navigator !== "undefined" && "geolocation" in navigator;
  function locate() {
    error = "";
    found = null;
    if (!canLocate) {
      fail("This browser doesn't offer location. Pick your districts or enter a ZIP code.");
      return;
    }
    busy = true;
    try {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const accuracy = pos.coords.accuracy;
            if (!(accuracy <= 20000)) {
              fail("Your device's location is too imprecise to tell districts apart. Enter a ZIP code or pick your districts.");
              return;
            }
            const { decoded } = await loadDistricts();
            const r = lookupPoint(decoded, pos.coords.longitude, pos.coords.latitude, accuracy);
            if (!r.inState) {
              fail("That location is outside California's districts. Pick your districts or enter a ZIP code.");
              return;
            }
            const layers: Found["layers"] = {};
            for (const [k, hit] of Object.entries(r.layers) as Array<[Kind, { possible: number[] }]>) {
              if (hit.possible.length) layers[k] = hit.possible.map((n) => ({ n, share: null }));
            }
            const note: string[] = [];
            if (Object.values(layers).some((l) => l.length > 1)) {
              note.push(
                `You're within about ${Math.round(r.marginM).toLocaleString("en-US")} m of a district boundary (map detail plus your device's accuracy), so every district you could be in is shown. Your registered home address decides.`,
              );
            }
            note.push("This is where your device is now. Your ballot follows your registered home address.");
            found = { source: "locate", layers, landOnly: {}, note };
            apply(found);
          } catch {
            fail("The district map couldn't be loaded. Pick your districts instead.");
          } finally {
            busy = false;
          }
        },
        (err) => {
          busy = false;
          fail(
            err.code === 1
              ? "Location permission was denied (or this page isn't allowed to ask). Pick your districts or enter a ZIP code."
              : err.code === 3
                ? "Finding your location took too long. Pick your districts or enter a ZIP code."
                : "Your device couldn't determine a location. Pick your districts or enter a ZIP code.",
          );
        },
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
      );
    } catch {
      busy = false;
      fail("Location isn't available here. Pick your districts or enter a ZIP code.");
    }
  }

  /** Apply every possible district from a lookup; keep a BOE district picked by hand when the lookup has none. */
  function apply(f: Found) {
    const next: Choice = {};
    for (const k of ["cd", "boe", "sd", "ad"] as DistrictKind[]) {
      const l = f.layers[k];
      next[k] = l?.length ? l.map((d) => d.n) : k === "boe" ? (choice.boe ?? []) : [];
    }
    // County and supervisor district aren't in the boundary data yet: keep what was picked.
    next.county = choice.county ?? [];
    next.sfsup = choice.sfsup ?? [];
    onchange(normalizeChoice(next));
  }

  function toggleDistrict(kind: DistrictKind, n: number) {
    const cur = new Set(choice[kind] ?? []);
    if (cur.has(n)) cur.delete(n);
    else cur.add(n);
    onchange(normalizeChoice({ ...choice, [kind]: [...cur] }));
  }
  function setBoe(n: number) {
    onchange(normalizeChoice({ ...choice, boe: n ? [n] : [] }));
  }

  function open(m: Method) {
    method = method === m ? null : m;
    changing = true;
    error = "";
    if (m === "locate" && method === "locate") locate();
  }
  function toggleChanging() {
    changing = !changing;
    if (!changing) {
      method = null;
      found = null;
      error = "";
    }
  }

  const methods: Array<{ id: Method; label: string; short: string; icon: typeof BALLOT_ICON.pick }> = [
    { id: "pick", label: "Pick districts", short: "Pick", icon: BALLOT_ICON.pick },
    { id: "zip", label: "ZIP code", short: "ZIP", icon: BALLOT_ICON.zip },
    { id: "locate", label: "Use my location", short: "Locate", icon: BALLOT_ICON.locate },
  ];

  const ad = $derived(choice.ad ?? []);
  const sdUp = $derived((choice.sd ?? []).filter(senateSeatUp2026));
  const senateOff = $derived((choice.sd ?? []).filter((n) => !senateSeatUp2026(n)));
  const alsoOnBallot = $derived(
    [
      ad.length ? `State Assembly ${ad.map((n) => `District ${n}`).join(" or ")}` : "State Assembly",
      sdUp.length
        ? `State Senate ${sdUp.map((n) => `District ${n}`).join(" or ")}`
        : senateOff.length
          ? null
          : "State Senate (even-numbered districts only in 2026)",
      ...(choice.county?.includes(COUNTY_FIPS["san-francisco"]!)
        ? [choice.sfsup?.length ? null : "your Supervisor race (pick your district)", "other local contests, e.g. special districts"]
        : ["county, city, school and special-district contests", "local measures"]),
    ]
      .filter(Boolean)
      .join("; "),
  );
  const PickIcon = BALLOT_ICON.pick;
  const InfoIcon = BALLOT_ICON.info;
  const AllIcon = BALLOT_ICON.all;
  const ChangeIcon = BALLOT_ICON.change;
  const ForgetIcon = BALLOT_ICON.forget;
</script>

<section class="mb" aria-labelledby="mb-title">
  <div class="mb-head">
    <Badge icon={set ? BALLOT_ICON.set : BALLOT_ICON.panel} group="record" size={28} />
    <div class="mb-text">
      <h2 id="mb-title">My ballot</h2>
      {#if set}
        <p class="mb-sum num" aria-live="polite">
          <span class="muted">Your ballot:</span>
          <strong>{choiceSummary({ cd: choice.cd, boe: choice.boe })}</strong>
          {#if !choice.cd?.length}<span class="muted">House district not set</span>{/if}
          <span>· {plural(onCount, "contest")}</span>
          {#if showAll}<span class="muted">(showing all {total})</span>{/if}
        </p>
      {:else}
        <p class="muted">Narrow the list to the contests on your ballot.</p>
      {/if}
    </div>
    {#if set}
      <div class="mb-actions">
        <button class="tb" onclick={ontoggle} aria-pressed={showAll} title={showAll ? "Show only your contests" : "Show every contest"}>
          <AllIcon size={15} aria-hidden="true" />
          <span>{#if showAll}Show my ballot{:else}Show all<span class="wide">{" contests"}</span>{/if}</span>
        </button>
        <button class="tb" onclick={toggleChanging} aria-expanded={changing}>
          <ChangeIcon size={15} aria-hidden="true" /> Change
        </button>
        <button
          class="tb"
          onclick={() => {
            found = null;
            method = null;
            changing = false;
            error = "";
            onforget();
          }}
          title="Remove the saved districts from this device"
        >
          <ForgetIcon size={15} aria-hidden="true" /> Forget
        </button>
      </div>
    {/if}
  </div>

  {#if showMethods}
    <div class="methods" role="group" aria-label="How to find your districts">
      {#each methods as m (m.id)}
        {@const Icon = m.icon}
        <button class="method" class:on={method === m.id} aria-expanded={method === m.id} aria-label={m.label} onclick={() => open(m.id)}>
          <Icon size={16} aria-hidden="true" />
          <span class="wide-only" aria-hidden="true">{m.label}</span><span class="narrow-only" aria-hidden="true">{m.short}</span>
        </button>
      {/each}
    </div>
  {/if}

  {#if !showMethods}
    <!-- collapsed: nothing to choose -->
  {:else if method === "pick"}
    <div class="pane">
      <label class="field">
        <span>U.S. House</span>
        <select bind:value={pickCd}>
          <option value={0}>Not sure</option>
          {#each Array.from({ length: DISTRICT_COUNT.cd }, (_, i) => i + 1) as n (n)}
            <option value={n}>{districtLabel("cd", n)}</option>
          {/each}
        </select>
      </label>
      <div class="field">
        <span id="boe-pick">Board of Equalization</span>
        <div class="seg" role="group" aria-labelledby="boe-pick">
          {#each [1, 2, 3, 4] as n (n)}
            <button class:on={pickBoe === n} aria-pressed={pickBoe === n} onclick={() => (pickBoe = pickBoe === n ? 0 : n)}>{n}</button>
          {/each}
        </div>
      </div>
      <div class="field">
        <span id="sf-pick">San Francisco</span>
        <div class="seg" role="group" aria-labelledby="sf-pick">
          <button class:on={pickSf} aria-pressed={pickSf} onclick={() => (pickSf = !pickSf)}>I vote in San Francisco</button>
        </div>
      </div>
      {#if pickSf}
        <div class="field">
          <span id="sup-pick">Supervisor district <small>(2, 4, 6, 8 and 10 are on the 2026 ballot)</small></span>
          <div class="seg" role="group" aria-labelledby="sup-pick">
            {#each Array.from({ length: DISTRICT_COUNT.sfsup }, (_, i) => i + 1) as n (n)}
              <button class:on={pickSup === n} aria-pressed={pickSup === n} onclick={() => (pickSup = pickSup === n ? 0 : n)}>{n}</button>
            {/each}
          </div>
        </div>
      {/if}
      <button class="apply" onclick={applyPick} disabled={!pickCd && !pickBoe && !pickSf}><PickIcon size={15} aria-hidden="true" /> Show my contests</button>
      <p class="hint">
        Your county's sample ballot lists your contests;
        <a href={OFFICIAL_LINKS.voterStatus.url} target="_blank" rel="noopener noreferrer">{OFFICIAL_LINKS.voterStatus.label}</a> shows your registration.
      </p>
    </div>
  {:else if method === "zip"}
    <form class="pane" onsubmit={lookupZipCode}>
      <label class="field">
        <span>ZIP code of your home address</span>
        <input bind:value={zip} inputmode="numeric" autocomplete="off" maxlength="5" placeholder="e.g. 95814" />
      </label>
      <button class="apply" type="submit" disabled={busy}>Find districts</button>
      <p class="hint">Looked up in this page; the ZIP code isn't sent anywhere or saved. ZIP areas are the Census Bureau's 2020 ZIP Code Tabulation Areas.</p>
    </form>
  {:else if method === "locate"}
    <div class="pane">
      {#if !canLocate}
        <p class="hint">This browser doesn't offer location. Pick your districts or enter a ZIP code.</p>
      {:else}
        <button class="apply" onclick={locate} disabled={busy}>{busy ? "Locating…" : "Locate again"}</button>
        <p class="hint">Asks your browser once. Your position is matched to districts in this page and then discarded; only district numbers are saved.</p>
      {/if}
    </div>
  {/if}

  {#if error}
    <p class="msg" role="status">{error}</p>
  {/if}

  {#if found}
    <div class="found" aria-live="polite">
      {#each found.note as line, i (i)}<p class="msg">{line}</p>{/each}
      {#each RESULT_KINDS as k (k)}
        {#if found.layers[k]}
          <div class="frow">
            <span class="flabel">{DISTRICT_NAME[k]}</span>
            <span class="chips">
              {#each found.layers[k] as d (d.n)}
                {@const on = choice[k]?.includes(d.n) ?? false}
                <button
                  class="dchip num"
                  class:on
                  aria-pressed={on}
                  title={found.layers[k].length > 1 ? (on ? "Click to drop this district" : "Click to include this district") : ""}
                  onclick={() => toggleDistrict(k, d.n)}
                >
                  {districtLabel(k, d.n)}{#if d.share !== null}<span class="share">{d.share}% of homes</span>{/if}
                </button>
              {/each}
            </span>
          </div>
          {#if found.landOnly[k]}
            <p class="hint">
              Also touches {found.landOnly[k].map((n) => districtLabel(k, n)).join(", ")} (no homes counted there in 2020).
            </p>
          {/if}
        {/if}
      {/each}
      {#if !found.layers.boe}
        <div class="frow">
          <span class="flabel">Board of Equalization</span>
          <span class="seg" role="group" aria-label="Board of Equalization district">
            {#each [1, 2, 3, 4] as n (n)}
              <button class:on={choice.boe?.includes(n)} aria-pressed={choice.boe?.includes(n) ?? false} onclick={() => setBoe(choice.boe?.includes(n) ? 0 : n)}>{n}</button>
            {/each}
          </span>
          <span class="hint">BOE boundaries aren't loaded yet: pick it from your sample ballot.</span>
        </div>
      {/if}
    </div>
  {/if}

  <div class="notes">
    <InfoIcon size={15} aria-hidden="true" />
    <div>
      <p>
        Districts follow your <strong>registered home address</strong>, not where you vote or drop off your ballot. Confirm them on your official
        sample ballot, at <a href={OFFICIAL_LINKS.voterStatus.url} target="_blank" rel="noopener noreferrer">{OFFICIAL_LINKS.voterStatus.label}</a>
        or with your <a href={OFFICIAL_LINKS.countyOffices.url} target="_blank" rel="noopener noreferrer">county elections office</a>.
      </p>
      <p>Also on your ballot, not covered here yet: {alsoOnBallot}.</p>
      {#if senateOff.length}
        <p>
          No State Senate contest for {senateOff.map((n) => `District ${n}`).join(" or ")} this year: only even-numbered Senate districts are on the 2026
          ballot.
        </p>
      {/if}
    </div>
  </div>
</section>

<style>
  .mb {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
    background: var(--surface);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    padding: 12px 14px;
  }
  .mb-head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
  }
  .mb-text {
    display: grid;
    min-width: 0;
  }
  h2 {
    font-size: var(--step-0);
    font-weight: 800;
  }
  .mb-sum {
    display: flex;
    flex-wrap: wrap;
    gap: 0 6px;
    font-size: var(--step--1);
  }
  .mb-head > .mb-text > p.muted {
    font-size: var(--step--1);
  }
  .mb-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    justify-content: flex-end;
  }
  .tb,
  .method,
  .apply,
  .dchip,
  .seg button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--line-strong);
    background: var(--surface);
    color: var(--ink);
    border-radius: 999px;
    font-size: var(--step--1);
    font-weight: 600;
    padding: 4px 11px;
    cursor: pointer;
    min-height: 32px;
  }
  .tb:hover,
  .method:hover,
  .dchip:hover,
  .seg button:hover {
    background: var(--wash);
  }
  .tb[aria-pressed="true"] {
    background: var(--wash);
  }
  .methods {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .method.on {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--surface);
  }
  .pane {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 8px 12px;
    padding: 10px 12px;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }
  .field {
    display: grid;
    gap: 3px;
    font-size: var(--step--1);
    color: var(--ink-2);
    font-weight: 600;
  }
  select,
  input {
    font: inherit;
    font-size: var(--step-0);
    color: var(--ink);
    background: var(--surface);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    padding: 4px 8px;
    min-height: 32px;
  }
  input {
    width: 8.5em;
  }
  .seg {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .seg button {
    padding: 4px 10px;
    min-width: 32px;
    justify-content: center;
  }
  .seg button.on,
  .dchip.on {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--surface);
  }
  .apply {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--surface);
  }
  .apply:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .hint {
    flex-basis: 100%;
    font-size: var(--step--1);
    color: var(--ink-2);
    margin: 0;
  }
  .msg {
    font-size: var(--step--1);
    color: var(--ink);
    border-left: 3px solid var(--line-strong);
    padding-left: 8px;
  }
  .found {
    display: grid;
    gap: 8px;
  }
  .frow {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
  }
  .frow .hint {
    flex-basis: auto;
  }
  .flabel {
    font-size: var(--step--1);
    font-weight: 700;
    min-width: 11ch;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .dchip:not(.on) {
    border-style: dashed;
    color: var(--ink-2);
  }
  .share {
    font-weight: 400;
    opacity: 0.85;
  }
  .notes {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 8px;
    align-items: start;
    border-top: 1px solid var(--line);
    padding-top: 8px;
    font-size: var(--step--1);
    color: var(--ink-2);
  }
  .notes :global(svg) {
    margin-top: 2px;
  }
  .notes div {
    display: grid;
    gap: 4px;
  }
  .narrow-only {
    display: none;
  }
  @media (max-width: 560px) {
    .wide,
    .wide-only {
      display: none;
    }
    .narrow-only {
      display: inline;
    }
    .mb-head {
      grid-template-columns: auto minmax(0, 1fr);
    }
    .mb-actions {
      grid-column: 1 / -1;
      justify-content: flex-start;
    }
  }
</style>
