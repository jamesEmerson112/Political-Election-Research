<script lang="ts">
  import {
    COUNTY_FIPS,
    choiceSummary,
    DISTRICT_COUNT,
    DISTRICT_NAME,
    districtCount,
    districtLabel,
    isEmptyChoice,
    LETTER_KINDS,
    letterOf,
    normalizeChoice,
    NV_COUNTY_FIPS,
    NV_OFFICIAL_LINKS,
    OFFICIAL_LINKS,
    senateSeatUp2026,
    stateOfChoice,
    type BallotState,
    type Choice,
    type DistrictKind,
  } from "../lib/ballot";
  import { lookupPoint, lookupZip, type Kind } from "../lib/geo";
  import { loadDistricts, stateOfZip } from "../lib/geoData";
  import { BALLOT_ICON } from "../lib/icons";
  import { plural } from "../lib/format";
  import Badge from "./Badge.svelte";

  let {
    choice,
    showAll,
    coveredAssembly = [],
    onCount,
    total,
    onchange,
    ontoggle,
    onforget,
  }: {
    choice: Choice;
    showAll: boolean;
    /** California Assembly districts that have a contest page on this site. */
    coveredAssembly?: number[];
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
  /** The state of the saved choice (California unless it says Nevada). */
  const st = $derived(stateOfChoice(choice));
  const RESULT_KINDS: Record<BallotState, DistrictKind[]> = { ca: ["cd", "boe", "county"], nv: ["cd", "sd", "ad", "county", "city"] };
  /** Nevada kinds not in the boundary data: picked by hand from the sample ballot. */
  const NV_HAND_KINDS: DistrictKind[] = ["ward", "comm", "ccsd", "regent"];
  const CLARK = NV_COUNTY_FIPS["clark"]!;

  /** One district (or several, when the lookup can't tell) per kind, from a ZIP or a location. */
  interface Found {
    st: BallotState;
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
  let pickSt = $state<BallotState>("ca");
  let pickCd = $state(0);
  let pickBoe = $state(0);
  let pickSf = $state(false);
  let pickSup = $state(0);
  // Nevada: House, Senate, Assembly; City of Las Vegas (1 in, 0 elsewhere in Clark County, -1 not sure); local districts.
  let pickSd = $state(0);
  let pickAd = $state(0);
  let pickCity = $state(-1);
  let pickNv = $state<Record<string, number>>({});
  const SF = COUNTY_FIPS["san-francisco"]!;
  const one = (v: number[] | undefined) => (v?.length === 1 ? v[0]! : 0);
  $effect(() => {
    // Mirror the current choice into the picker when it opens.
    if (method === "pick") {
      pickSt = st;
      pickCd = one(choice.cd);
      pickBoe = one(choice.boe);
      pickSf = !!choice.county?.includes(SF);
      pickSup = one(choice.sfsup);
      pickSd = one(choice.sd);
      pickAd = one(choice.ad);
      pickCity = choice.city?.length === 1 ? choice.city[0]! : -1;
      pickNv = Object.fromEntries(NV_HAND_KINDS.map((k) => [k, one(choice[k])]));
    }
  });
  const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
  function applyPick() {
    onchange(
      normalizeChoice(
        pickSt === "nv"
          ? {
              st: "nv",
              cd: pickCd ? [pickCd] : [],
              sd: pickSd ? [pickSd] : [],
              ad: pickAd ? [pickAd] : [],
              county: [CLARK],
              city: pickCity >= 0 ? [pickCity] : [],
              ...Object.fromEntries(NV_HAND_KINDS.map((k) => [k, pickNv[k] && !(k === "ward" && pickCity === 0) ? [pickNv[k]] : []])),
            }
          : {
              cd: pickCd ? [pickCd] : [],
              boe: pickBoe ? [pickBoe] : [],
              county: pickSf ? [SF] : [],
              sfsup: pickSf && pickSup ? [pickSup] : [],
            },
      ),
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
      const zst = stateOfZip(z);
      const { file } = await loadDistricts(zst);
      const r = lookupZip(file, z);
      if (!r) {
        error = `No ${zst === "nv" ? "Nevada" : "California"} ZIP area ${z} in the 2020 census tables (PO-box-only and newer ZIP codes have none). Pick your districts instead.`;
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
      if (zst === "ca" && (layers.county?.length ?? 0) > 1) {
        note.push(`ZIP ${z} is split between ${layers.county!.length} counties. Your home address decides which county's local contests are yours.`);
      }
      if (zst === "nv" && (layers.city?.length ?? 0) > 1) {
        note.push(`ZIP ${z} is partly inside the City of Las Vegas. City contests (Municipal Court, City Council) are on your ballot only if your home is inside the city.`);
      } else if (zst === "nv" && layers.city?.[0]?.n === 0) {
        note.push(`ZIP ${z} is outside the City of Las Vegas (a Las Vegas mailing address can be in unincorporated Clark County or another city), so the city's contests are not on your ballot.`);
      }
      if (r.crossesState) note.push(`ZIP ${z} also covers an area outside ${zst === "nv" ? "Nevada" : "California"}; only its ${zst === "nv" ? "Nevada" : "California"} part is described.`);
      found = { st: zst, source: "zip", layers, landOnly, note };
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
            let lst: BallotState = "ca";
            let r = lookupPoint((await loadDistricts("ca")).decoded, pos.coords.longitude, pos.coords.latitude, accuracy);
            if (!r.inState) {
              lst = "nv";
              r = lookupPoint((await loadDistricts("nv")).decoded, pos.coords.longitude, pos.coords.latitude, accuracy);
            }
            if (!r.inState) {
              fail("That location is outside California's and Nevada's districts. Pick your districts or enter a ZIP code.");
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
            found = { st: lst, source: "locate", layers, landOnly: {}, note };
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

  /** Apply every possible district from a lookup; keep districts picked by hand (same state) when the lookup has none. */
  function apply(f: Found) {
    const same = f.st === st;
    if (f.st === "nv") {
      const next: Choice = { st: "nv" };
      for (const k of RESULT_KINDS.nv) next[k] = (f.layers[k as Kind] ?? []).map((d) => d.n);
      // Ward, commission, trustee and regent districts aren't in the boundary data: keep what was picked.
      for (const k of NV_HAND_KINDS) next[k] = same ? (choice[k] ?? []) : [];
      if (next.city?.length && !next.city.includes(1)) next.ward = [];
      onchange(normalizeChoice(next));
      return;
    }
    const next: Choice = {};
    for (const k of ["cd", "boe", "sd", "ad"] as DistrictKind[]) {
      const l = f.layers[k as Kind];
      next[k] = l?.length ? l.map((d) => d.n) : k === "boe" && same ? (choice.boe ?? []) : [];
    }
    // County from the lookup (or what was picked); supervisor districts aren't in the boundary data yet: keep the pick
    // while San Francisco is still a possible county.
    const counties = f.layers.county?.map((d) => d.n);
    next.county = counties?.length ? counties : same ? (choice.county ?? []) : [];
    next.sfsup = same && next.county.includes(SF) ? (choice.sfsup ?? []) : [];
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
  /** Set (or clear) one hand-picked district. */
  function setKind(kind: DistrictKind, n: number) {
    onchange(normalizeChoice({ ...choice, [kind]: n ? [n] : [] }));
  }
  const handLabel = (k: DistrictKind, n: number) => (LETTER_KINDS.has(k) ? letterOf(n) : String(n));

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

  const links = $derived(
    st === "nv"
      ? { status: NV_OFFICIAL_LINKS.voterLookup, office: NV_OFFICIAL_LINKS.election }
      : { status: OFFICIAL_LINKS.voterStatus, office: OFFICIAL_LINKS.countyOffices },
  );
  /** Nevada's hand-picked kinds still unset (the ward only inside the City of Las Vegas). */
  const nvHandOpen = $derived(NV_HAND_KINDS.filter((k) => !(k === "ward" && choice.city?.length && !choice.city.includes(1))));
  const ad = $derived(choice.ad ?? []);
  const sdUp = $derived((choice.sd ?? []).filter(senateSeatUp2026));
  const senateOff = $derived((choice.sd ?? []).filter((n) => !senateSeatUp2026(n)));
  /** The Assembly part of "not covered here yet": only districts without a contest page here. */
  function assemblyNote(mine: number[], covered: number[]): string | null {
    const has = new Set(covered);
    if (mine.length) {
      const missing = mine.filter((n) => !has.has(n));
      return missing.length ? `State Assembly ${missing.map((n) => `District ${n}`).join(" or ")}` : null;
    }
    const list = [...has].sort((a, b) => a - b);
    return list.length ? `State Assembly (except ${list.length === 1 ? "District" : "Districts"} ${list.join(" and ")})` : "State Assembly";
  }
  const alsoOnBallot = $derived(
    st === "nv"
      ? [
          choice.city?.length === 1 && choice.city[0] === 1 ? null : "contests of the city, town or township you live in, if it isn't the City of Las Vegas",
          "anything not on the City of Las Vegas contest list this site starts from",
        ]
          .filter(Boolean)
          .join("; ")
      : [
      assemblyNote(ad, coveredAssembly),
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
          <strong>{st === "nv" ? choiceSummary({ st, cd: choice.cd, sd: choice.sd, ad: choice.ad, city: choice.city }) : choiceSummary({ cd: choice.cd, boe: choice.boe })}</strong>
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
      <div class="field full">
        <span id="st-pick">State</span>
        <div class="seg" role="group" aria-labelledby="st-pick">
          {#each [["ca", "California"], ["nv", "Nevada (Las Vegas)"]] as [code, name] (code)}
            <button
              class:on={pickSt === code}
              aria-pressed={pickSt === code}
              onclick={() => {
                if (pickSt !== code) {
                  pickSt = code as BallotState;
                  pickCd = pickSd = pickAd = 0;
                }
              }}>{name}</button
            >
          {/each}
        </div>
      </div>
      <label class="field">
        <span>U.S. House</span>
        <select bind:value={pickCd}>
          <option value={0}>Not sure</option>
          {#each range(districtCount(pickSt, "cd")) as n (n)}
            <option value={n}>{districtLabel("cd", n, pickSt)}</option>
          {/each}
        </select>
      </label>
      {#if pickSt === "nv"}
        <label class="field">
          <span>State Senate</span>
          <select bind:value={pickSd}>
            <option value={0}>Not sure</option>
            {#each range(districtCount("nv", "sd")) as n (n)}<option value={n}>District {n}</option>{/each}
          </select>
        </label>
        <label class="field">
          <span>State Assembly</span>
          <select bind:value={pickAd}>
            <option value={0}>Not sure</option>
            {#each range(districtCount("nv", "ad")) as n (n)}<option value={n}>District {n}</option>{/each}
          </select>
        </label>
        <div class="field full">
          <span id="city-pick">Where you live in Clark County</span>
          <div class="seg" role="group" aria-labelledby="city-pick">
            {#each [[1, "City of Las Vegas"], [0, "Elsewhere in Clark County"], [-1, "Not sure"]] as [v, name] (v)}
              <button class:on={pickCity === v} aria-pressed={pickCity === v} onclick={() => (pickCity = v as number)}>{name}</button>
            {/each}
          </div>
        </div>
        {#each NV_HAND_KINDS.filter((k) => !(k === "ward" && pickCity === 0)) as k (k)}
          <div class="field">
            <span id={`pick-${k}`}>{DISTRICT_NAME[k]}</span>
            <div class="seg" role="group" aria-labelledby={`pick-${k}`}>
              {#each range(districtCount("nv", k)) as n (n)}
                <button class:on={pickNv[k] === n} aria-pressed={pickNv[k] === n} onclick={() => (pickNv[k] = pickNv[k] === n ? 0 : n)}>{handLabel(k, n)}</button>
              {/each}
            </div>
          </div>
        {/each}
        <button class="apply" onclick={applyPick}><PickIcon size={15} aria-hidden="true" /> Show my contests</button>
        <p class="hint">
          Clark County's sample ballot lists your contests;
          <a href={NV_OFFICIAL_LINKS.voterLookup.url} target="_blank" rel="noopener noreferrer">{NV_OFFICIAL_LINKS.voterLookup.label}</a> shows your registration and districts.
        </p>
      {:else}
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
      {/if}
    </div>
  {:else if method === "zip"}
    <form class="pane" onsubmit={lookupZipCode}>
      <label class="field">
        <span>ZIP code of your home address</span>
        <input bind:value={zip} inputmode="numeric" autocomplete="off" maxlength="5" placeholder="e.g. 95814 or 89101" />
      </label>
      <button class="apply" type="submit" disabled={busy}>Find districts</button>
      <p class="hint">California and Nevada ZIP codes. Looked up in this page; the ZIP code isn't sent anywhere or saved. ZIP areas are the Census Bureau's 2020 ZIP Code Tabulation Areas.</p>
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
      {#each RESULT_KINDS[found.st] as k (k)}
        {@const lk = k as Kind}
        {#if found.layers[lk]}
          <div class="frow">
            <span class="flabel">{k === "city" ? "City" : DISTRICT_NAME[k]}</span>
            <span class="chips">
              {#each found.layers[lk] as d (d.n)}
                {@const on = choice[k]?.includes(d.n) ?? false}
                <button
                  class="dchip num"
                  class:on
                  aria-pressed={on}
                  title={found.layers[lk].length > 1 ? (on ? "Click to drop this one" : "Click to include this one") : ""}
                  onclick={() => toggleDistrict(k, d.n)}
                >
                  {districtLabel(k, d.n, found.st)}{#if d.share !== null}<span class="share">{d.share}% of homes</span>{/if}
                </button>
              {/each}
            </span>
          </div>
          {#if found.landOnly[lk]}
            <p class="hint">
              Also touches {found.landOnly[lk].map((n) => districtLabel(k, n, found.st)).join(", ")} (no homes counted there in 2020).
            </p>
          {/if}
        {/if}
      {/each}
      {#if found.st === "nv"}
        {#each nvHandOpen as k (k)}
          <div class="frow">
            <span class="flabel">{DISTRICT_NAME[k]}</span>
            <span class="seg" role="group" aria-label={DISTRICT_NAME[k]}>
              {#each Array.from({ length: districtCount("nv", k) }, (_, i) => i + 1) as n (n)}
                {@const on = choice[k]?.includes(n) ?? false}
                <button class:on aria-pressed={on} onclick={() => setKind(k, on ? 0 : n)}>{handLabel(k, n)}</button>
              {/each}
            </span>
          </div>
        {/each}
        <p class="hint">
          Ward, commission, school trustee and regent districts aren't in our boundary data yet: pick them from your sample ballot or the
          <a href={NV_OFFICIAL_LINKS.voterLookup.url} target="_blank" rel="noopener noreferrer">{NV_OFFICIAL_LINKS.voterLookup.label}</a>.
        </p>
      {:else}
        {#if choice.county?.includes(SF)}
          <div class="frow">
            <span class="flabel">{DISTRICT_NAME.sfsup}</span>
            <span class="seg" role="group" aria-label={DISTRICT_NAME.sfsup}>
              {#each range(11) as n (n)}
                {@const on = choice.sfsup?.includes(n) ?? false}
                <button class:on aria-pressed={on} onclick={() => setKind("sfsup", on ? 0 : n)}>{n}</button>
              {/each}
            </span>
            <span class="hint">Supervisor districts aren't in our boundary data yet: pick yours from your sample ballot.</span>
          </div>
        {/if}
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
      {/if}
    </div>
  {/if}

  <div class="notes">
    <InfoIcon size={15} aria-hidden="true" />
    <div>
      <p>
        Districts follow your <strong>registered home address</strong>, not where you vote or drop off your ballot. Confirm them on your official
        sample ballot, at <a href={links.status.url} target="_blank" rel="noopener noreferrer">{links.status.label}</a>
        or with the <a href={links.office.url} target="_blank" rel="noopener noreferrer">{st === "nv" ? links.office.label : "county elections office"}</a>.
      </p>
      <p>Also on your ballot, not covered here yet: {alsoOnBallot}.</p>
      {#if st === "ca" && senateOff.length}
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
  .field.full {
    flex-basis: 100%;
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
