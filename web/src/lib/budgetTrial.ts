/**
 * "Try your ballot": adds up the official fiscal estimates of the measures a
 * visitor votes yes on, lane by lane, against the official budget forecast.
 *
 * Pure and deterministic: (measures, budget, votes) -> result. No network,
 * no storage, no Svelte. The rules (docs/METHODOLOGY.md, "Ballot measures and
 * budgets"):
 * - A yes applies the measure's effects; no and skip mean the status quo.
 * - Amounts are unsigned in the data; cost is negative here, revenue and
 *   savings positive. Ranges stay ranges ({low, high}, low <= high).
 * - Only the general_fund lane moves the headline balance. Set-asides,
 *   dedicated funds, other agencies and bond debt are separate lanes.
 * - Annual effects apply from start_fy for `years` years. Without a stated
 *   start they count from the first forecast year and are flagged.
 * - One-time effects and multi-year totals are listed, never added to
 *   annual sums. "minimal" counts as 0 (listed); "not_estimated" and
 *   "depends_on_future_decisions" are listed and never added. "in_words"
 *   (sized only in the statement's words) is listed with those words and
 *   never converted to a number or added.
 * - Annual effects that start after the forecast's last year add nothing to
 *   the forecast years; they are listed (afterForecast).
 * - Exclusive conflicts ("the one with more yes votes takes effect"): when
 *   several get a yes, the result spans every outcome that can actually
 *   happen (each maximal set of yes measures with no exclusive conflict).
 *   Partial conflicts (both take effect; one prevails where provisions
 *   conflict) are added up and listed, since their estimates may overlap.
 */

export type Vote = "yes" | "no" | "skip";
export type Lane = "general_fund" | "set_aside" | "dedicated" | "bond_debt" | "other_agency";
export const LANES: Lane[] = ["general_fund", "set_aside", "dedicated", "bond_debt", "other_agency"];
type Rec = Record<string, unknown>;

export interface Range {
  low: number;
  high: number;
}
const ZERO: Range = { low: 0, high: 0 };
const add = (a: Range, b: Range): Range => ({ low: a.low + b.low, high: a.high + b.high });

export interface MeasureInput {
  /** Contest ref (or any stable key the votes use). */
  ref: string;
  /** Short label, e.g. "Prop A". */
  label: string;
  /** fiscal.effects as recorded. */
  effects: Rec[];
  /** fiscal.bond as recorded. */
  bond?: Rec;
  /** Refs of measures only one of which can take effect (exclusive conflicts). */
  conflicts: string[];
  /** Refs of measures that both take effect but conflict in part (one prevails where they conflict). */
  overlaps?: string[];
}

export interface BudgetInput {
  adoptedGeneralFund: { fy: string; usd: number } | null;
  /** Forecast years in order; signed: shortfall negative, surplus positive. */
  forecast: Array<{ fy: string; signed: number }>;
}

export interface Contribution {
  ref: string;
  label: string;
  effectId: string;
  lane: Lane;
  per: "year" | "one_time" | "total";
  /** The whole effect's range (every year it lasts); a year's own amount is `rangeIn(c, fy)`. */
  range: Range;
  /** Signed amounts for particular fiscal years, in order, when the statement gives them (effect.schedule). */
  schedule: Array<{ fy: string; range: Range }> | null;
  startFy: string | null;
  years: number | null;
  startAssumed: boolean;
  text: string;
}

export interface TrialResult {
  years: string[];
  /** Refs of the measures voted yes, in ballot order. */
  yes: string[];
  generalFund: Array<{ fy: string; baseline: number | null; delta: Range; result: Range | null }>;
  /** Annual effects of the yes measures once in effect, per lane (conflicts merged). */
  perYearOnceInEffect: Record<Lane, Range>;
  oneTime: Contribution[];
  totals: Contribution[];
  bonds: { principal: number; debtServiceTotal: number; perHundredK: number; labels: string[] };
  notEstimated: Array<{ ref: string; label: string; estimate: string; text: string }>;
  /** Effects the statement sizes only in words ("low tens of millions"): listed with those words, never added. */
  inWords: Array<{ ref: string; label: string; lane: Lane; words: string; text: string }>;
  minimal: Array<{ ref: string; label: string; text: string }>;
  /** Annual effects that start after the forecast's last year, so they add nothing to the years shown. */
  afterForecast: Array<{ ref: string; label: string; lane: Lane; startFy: string; text: string }>;
  conflicts: Array<{ refs: string[]; labels: string[] }>;
  /** Yes measures that conflict in part: both take effect, estimates may overlap. */
  overlaps: Array<{ refs: string[]; labels: string[] }>;
  /** Labels of yes measures with an annual effect whose start year isn't stated. */
  startAssumed: string[];
  /** Annual contributions of each yes measure, before conflicts are merged (for the table view). */
  contributions: Contribution[];
}

const SIGN: Record<string, number> = { cost: -1, revenue: 1, savings: 1, none: 0 };
const fyStart = (fy: string) => Number(fy.slice(0, 4));

/** An unsigned amount ({low_usd, high_usd}) as a signed range for a direction. */
function signedAmount(a: Rec, direction: unknown): Range {
  const s = SIGN[String(direction)] ?? 0;
  const x = s * Number(a["low_usd"]);
  const y = s * Number(a["high_usd"]);
  return { low: Math.min(x, y) || 0, high: Math.max(x, y) || 0 };
}

/** Signed range for one effect, or null if it isn't an estimated amount. */
function signed(e: Rec): Range | null {
  if (e["estimate"] !== "estimated") return null;
  const a = e["amount"] as Rec | undefined;
  return a ? signedAmount(a, e["direction"]) : null;
}

/**
 * A per-year contribution's amount in one fiscal year. Without a schedule it is the whole range. With one: a listed
 * year uses its own amount; a year between two listed years uses the range between them (the statement gives no
 * figure for it); a later year keeps the last amount. Whether the effect applies at all that year is `appliesIn`.
 */
export function rangeIn(c: Contribution, fy: string): Range {
  if (!c.schedule?.length) return c.range;
  const y = fyStart(fy);
  let before: Range | null = null;
  for (const x of c.schedule) {
    const xy = fyStart(x.fy);
    if (xy === y) return x.range;
    if (xy > y) return before ? { low: Math.min(before.low, x.range.low), high: Math.max(before.high, x.range.high) } : x.range;
    before = x.range;
  }
  return before ?? c.range;
}

function contributions(m: MeasureInput, firstFy: string | null): Contribution[] {
  const out: Contribution[] = [];
  for (const e of m.effects) {
    const range = signed(e);
    if (!range) continue;
    const per = String(e["per"]) as Contribution["per"];
    const stated = (e["start_fy"] as string | undefined) ?? null;
    out.push({
      ref: m.ref,
      label: m.label,
      effectId: String(e["id"]),
      lane: String(e["lane"]) as Lane,
      per,
      range,
      schedule:
        per === "year" && Array.isArray(e["schedule"])
          ? (e["schedule"] as Rec[]).map((x) => ({ fy: String(x["fy"]), range: signedAmount(x["amount"] as Rec, e["direction"]) })).sort((a, b) => fyStart(a.fy) - fyStart(b.fy))
          : null,
      startFy: stated ?? (per === "year" ? firstFy : null),
      years: typeof e["years"] === "number" ? (e["years"] as number) : null,
      startAssumed: per === "year" && !stated,
      text: String(e["text"] ?? ""),
    });
  }
  return out;
}

function appliesIn(c: Contribution, fy: string): boolean {
  if (c.per !== "year") return false;
  if (!c.startFy) return true;
  const y = fyStart(fy);
  const s = fyStart(c.startFy);
  return y >= s && (c.years === null || y < s + c.years);
}

/** Groups of yes measures that compete with each other (connected through `conflicts`). */
function conflictGroups(yes: MeasureInput[]): MeasureInput[][] {
  const byRef = new Map(yes.map((m) => [m.ref, m]));
  const seen = new Set<string>();
  const groups: MeasureInput[][] = [];
  for (const m of yes) {
    if (seen.has(m.ref)) continue;
    const group: MeasureInput[] = [];
    const stack = [m];
    seen.add(m.ref);
    while (stack.length) {
      const cur = stack.pop()!;
      group.push(cur);
      const neighbors = [...cur.conflicts, ...yes.filter((o) => o.conflicts.includes(cur.ref)).map((o) => o.ref)];
      for (const r of neighbors) {
        const n = byRef.get(r);
        if (n && !seen.has(r)) {
          seen.add(r);
          stack.push(n);
        }
      }
    }
    const order = new Map(yes.map((x, i) => [x.ref, i]));
    groups.push(group.sort((a, b) => order.get(a.ref)! - order.get(b.ref)!));
  }
  return groups;
}

/**
 * Range of a group of yes measures linked by exclusive conflicts: the span over
 * every outcome that can happen, i.e. each maximal subset with no conflicting pair.
 */
function groupRange(group: MeasureInput[], rangeOf: (m: MeasureInput) => Range): Range {
  if (group.length === 1) return rangeOf(group[0]!);
  const n = group.length;
  const clash = (a: MeasureInput, b: MeasureInput) => a.conflicts.includes(b.ref) || b.conflicts.includes(a.ref);
  const ok = (mask: number) => {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (mask & (1 << i) && mask & (1 << j) && clash(group[i]!, group[j]!)) return false;
    return true;
  };
  const maximal = (mask: number) => {
    for (let i = 0; i < n; i++) if (!(mask & (1 << i)) && ok(mask | (1 << i))) return false;
    return true;
  };
  let low = Infinity;
  let high = -Infinity;
  for (let mask = 1; mask < 1 << n; mask++) {
    if (!ok(mask) || !maximal(mask)) continue;
    const r = group.filter((_, i) => mask & (1 << i)).reduce((a, m) => add(a, rangeOf(m)), ZERO);
    low = Math.min(low, r.low);
    high = Math.max(high, r.high);
  }
  return { low, high };
}

export function runTrial(measures: MeasureInput[], budget: BudgetInput | null, votes: Record<string, Vote>): TrialResult {
  const years = budget?.forecast.map((y) => y.fy) ?? [];
  const firstFy = years[0] ?? null;
  const lastFy = years[years.length - 1] ?? null;
  const yes = measures.filter((m) => votes[m.ref] === "yes");
  const perMeasure = new Map(yes.map((m) => [m.ref, contributions(m, firstFy)]));
  const groups = conflictGroups(yes);

  const laneSum = (fy: string | null, lane: Lane): Range =>
    groups.reduce((acc, g) => {
      const rangeOf = (m: MeasureInput) =>
        perMeasure
          .get(m.ref)!
          .filter((c) => c.lane === lane && c.per === "year" && (fy === null || appliesIn(c, fy)))
          .reduce((r, c) => add(r, fy === null ? c.range : rangeIn(c, fy)), ZERO);
      return add(acc, groupRange(g, rangeOf));
    }, ZERO);

  const generalFund = (budget?.forecast ?? []).map((y) => {
    const delta = laneSum(y.fy, "general_fund");
    return { fy: y.fy, baseline: y.signed, delta, result: { low: y.signed + delta.low, high: y.signed + delta.high } };
  });
  const perYearOnceInEffect = Object.fromEntries(LANES.map((l) => [l, laneSum(null, l)])) as Record<Lane, Range>;

  const all = yes.flatMap((m) => perMeasure.get(m.ref)!);
  const bonds = { principal: 0, debtServiceTotal: 0, perHundredK: 0, labels: [] as string[] };
  for (const m of yes) {
    if (!m.bond) continue;
    bonds.principal += Number(m.bond["principal_usd"] ?? 0);
    bonds.debtServiceTotal += Number(m.bond["debt_service_total_usd"] ?? 0);
    bonds.perHundredK += Number(m.bond["annual_cost_per_100k_assessed_usd"] ?? 0);
    bonds.labels.push(m.label);
  }
  const listed = (estimates: string[]) =>
    yes.flatMap((m) =>
      m.effects
        .filter((e) => estimates.includes(String(e["estimate"])))
        .map((e) => ({ ref: m.ref, label: m.label, estimate: String(e["estimate"]), text: String(e["text"] ?? "") })),
    );

  return {
    years,
    yes: yes.map((m) => m.ref),
    generalFund,
    perYearOnceInEffect,
    oneTime: all.filter((c) => c.per === "one_time"),
    totals: all.filter((c) => c.per === "total"),
    bonds,
    notEstimated: listed(["not_estimated", "depends_on_future_decisions"]),
    inWords: yes.flatMap((m) =>
      m.effects
        .filter((e) => e["estimate"] === "in_words")
        .map((e) => ({ ref: m.ref, label: m.label, lane: String(e["lane"]) as Lane, words: String(e["words"] ?? ""), text: String(e["text"] ?? "") })),
    ),
    minimal: listed(["minimal"]).map(({ ref, label, text }) => ({ ref, label, text })),
    afterForecast: lastFy
      ? all
          .filter((c) => c.per === "year" && c.startFy !== null && fyStart(c.startFy) > fyStart(lastFy))
          .map((c) => ({ ref: c.ref, label: c.label, lane: c.lane, startFy: c.startFy!, text: c.text }))
      : [],
    conflicts: groups.filter((g) => g.length > 1).map((g) => ({ refs: g.map((m) => m.ref), labels: g.map((m) => m.label) })),
    overlaps: yes.flatMap((m) =>
      (m.overlaps ?? [])
        .filter((o) => votes[o] === "yes" && o > m.ref)
        .map((o) => ({ refs: [m.ref, o], labels: [m.label, measures.find((x) => x.ref === o)?.label ?? o] })),
    ),
    startAssumed: [...new Set(all.filter((c) => c.startAssumed).map((c) => c.label))],
    contributions: all.filter((c) => c.per === "year"),
  };
}

// ---- adapters from records -------------------------------------------------

/** A measure contest record -> engine input. Label: "Prop <number>", or "Question <number>" in Nevada (its ballot questions). */
export function measureInput(contest: Rec): MeasureInput {
  const fiscal = (contest["fiscal"] as Rec | undefined) ?? {};
  const st = /^\d{4}-([a-z]{2})-/.exec(String(contest["id"]))?.[1];
  return {
    ref: `contest:${String(contest["id"])}`,
    label: `${st === "nv" ? "Question" : "Prop"} ${String(contest["number"])}`,
    effects: (fiscal["effects"] as Rec[] | undefined) ?? [],
    ...(fiscal["bond"] ? { bond: fiscal["bond"] as Rec } : {}),
    conflicts: ((contest["conflicts"] as Rec[] | undefined) ?? []).filter((c) => c["exclusive"] === true).map((c) => String(c["contest"])),
    overlaps: ((contest["conflicts"] as Rec[] | undefined) ?? []).filter((c) => c["exclusive"] !== true).map((c) => String(c["contest"])),
  };
}

const DIRECTION_SIGN: Record<string, number> = { shortfall: -1, surplus: 1, balanced: 0 };

/** A budget record -> engine input. The latest adopted year gives the current General Fund. */
export function budgetInput(budget: Rec): BudgetInput {
  const adopted = ((budget["adopted"] as Rec[] | undefined) ?? []).filter((a) => typeof a["general_fund_usd"] === "number");
  const latest = adopted.sort((a, b) => String(b["fy"]).localeCompare(String(a["fy"])))[0];
  const forecast = (((budget["forecast"] as Rec | undefined)?.["years"] as Rec[] | undefined) ?? [])
    .map((y) => ({ fy: String(y["fy"]), signed: (DIRECTION_SIGN[String(y["direction"])] ?? 0) * Number(y["amount_usd"]) || 0 }))
    .sort((a, b) => a.fy.localeCompare(b.fy));
  return { adoptedGeneralFund: latest ? { fy: String(latest["fy"]), usd: Number(latest["general_fund_usd"]) } : null, forecast };
}

/** An amount as a fraction of the adopted General Fund (0.01 = 1%), or null without one. */
export function shareOf(usd: number, budget: BudgetInput | null): number | null {
  const gf = budget?.adoptedGeneralFund?.usd;
  return gf ? Math.abs(usd) / gf : null;
}

// ---- the bridge (waterfall) for one fiscal year ----------------------------

export interface BridgeStep {
  kind: "start" | "measure" | "end";
  /** Measures in this step (several for competing measures, of which only one can take effect). */
  refs: string[];
  labels: string[];
  /** "Forecast", "Prop J", "Prop C/E", "Result". */
  label: string;
  /** True for a group of competing measures shown as one step. */
  exclusive: boolean;
  /** Signed General Fund change of this step for the year (0 for start and end). */
  delta: Range;
  /** Running total (as a range) before and after this step. */
  before: Range;
  after: Range;
  /**
   * Where the drawn step starts: the forecast plus the nearer end (smaller in
   * size) of every earlier step. The chart draws the nearer end solid and the
   * rest of the range lighter from here, so a chain of ranges stays readable.
   */
  chain: number;
}

export type BridgeOmitReason = "not_in_year" | "in_words" | "not_estimated" | "minimal" | "one_time_only" | "other_lanes";

export interface BridgeOmitted {
  ref: string;
  label: string;
  reason: BridgeOmitReason;
  /** For not_in_year: the first later fiscal year an annual General Fund estimate applies, if any. */
  startFy: string | null;
}

export interface Bridge {
  fy: string;
  baseline: number;
  /** Start, one step per yes measure (or competing group) with a General Fund amount in `fy`, in ballot order, end. */
  steps: BridgeStep[];
  result: Range;
  /** Yes measures with no General Fund amount in `fy`, in ballot order, and why. */
  omitted: BridgeOmitted[];
}

/** The end of a signed range nearer zero (drawn solid) and the farther one (drawn lighter); a range across zero has no solid part. */
export function nearFar(r: Range): { near: number; far: number; spansZero: boolean } {
  if (r.low >= 0) return { near: r.low, far: r.high, spansZero: false };
  if (r.high <= 0) return { near: r.high, far: r.low, spansZero: false };
  return { near: 0, far: 0, spansZero: true };
}

/** "Prop C/E" for competing measures; other labels are joined with "/". */
function groupLabel(labels: string[]): string {
  if (labels.length === 1) return labels[0]!;
  if (labels.every((l) => l.startsWith("Prop "))) return `Prop ${labels.map((l) => l.slice(5)).join("/")}`;
  return labels.join("/");
}

function omitReason(m: MeasureInput, gfYear: Contribution[], fy: string): BridgeOmitted {
  const base = { ref: m.ref, label: m.label, startFy: null };
  if (gfYear.length) {
    const later = gfYear
      .map((c) => c.startFy)
      .filter((s): s is string => !!s && fyStart(s) > fyStart(fy))
      .sort()[0];
    return { ...base, reason: "not_in_year", startFy: later ?? null };
  }
  const gf = m.effects.filter((e) => e["lane"] === "general_fund");
  const est = (e: Rec) => String(e["estimate"]);
  if (gf.some((e) => est(e) === "in_words")) return { ...base, reason: "in_words" };
  if (gf.some((e) => est(e) === "not_estimated" || est(e) === "depends_on_future_decisions")) return { ...base, reason: "not_estimated" };
  if (gf.some((e) => est(e) === "minimal")) return { ...base, reason: "minimal" };
  if (gf.some((e) => est(e) === "estimated")) return { ...base, reason: "one_time_only" };
  return { ...base, reason: "other_lanes" };
}

/**
 * The bridge from the official forecast to the result for one fiscal year:
 * one step per yes measure in ballot order (competing measures as one step
 * spanning their possible outcomes), with signed ranges and running totals.
 * The running total after the last step equals the year's `generalFund` result.
 */
export function bridgeSteps(result: TrialResult, measures: MeasureInput[], fy: string): Bridge | null {
  const year = result.generalFund.find((y) => y.fy === fy);
  if (!year || year.baseline === null) return null;
  const baseline = year.baseline;
  const yesSet = new Set(result.yes);
  const yes = measures.filter((m) => yesSet.has(m.ref));
  const gfYear = (ref: string) => result.contributions.filter((c) => c.ref === ref && c.lane === "general_fund" && c.per === "year");
  const rangeOf = (m: MeasureInput) =>
    gfYear(m.ref)
      .filter((c) => appliesIn(c, fy))
      .reduce((r, c) => add(r, rangeIn(c, fy)), ZERO);
  const applies = (m: MeasureInput) => gfYear(m.ref).some((c) => appliesIn(c, fy));

  const total: Range = { low: baseline, high: baseline };
  const steps: BridgeStep[] = [{ kind: "start", refs: [], labels: [], label: "Forecast", exclusive: false, delta: ZERO, before: total, after: total, chain: baseline }];
  const omitted: BridgeOmitted[] = [];
  let running = total;
  let chain = baseline;
  // conflictGroups walks the yes measures in ballot order, so a group sits at its first member.
  for (const g of conflictGroups(yes)) {
    if (!g.some(applies)) {
      for (const m of g) omitted.push(omitReason(m, gfYear(m.ref), fy));
      continue;
    }
    const delta = groupRange(g, rangeOf);
    const after = add(running, delta);
    const labels = g.map((m) => m.label);
    steps.push({ kind: "measure", refs: g.map((m) => m.ref), labels, label: groupLabel(labels), exclusive: g.length > 1, delta, before: running, after, chain });
    running = after;
    chain += nearFar(delta).near;
  }
  steps.push({ kind: "end", refs: [], labels: [], label: "Result", exclusive: false, delta: ZERO, before: running, after: running, chain });
  const order = new Map(measures.map((m, i) => [m.ref, i]));
  omitted.sort((a, b) => order.get(a.ref)! - order.get(b.ref)!);
  return { fy, baseline, steps, result: running, omitted };
}

/** Smallest and largest value the drawn bridge reaches: the forecast, each step's start and both ends, the result. */
export function bridgeExtent(b: Bridge): [number, number] {
  const vals = [b.baseline, b.result.low, b.result.high];
  for (const s of b.steps) if (s.kind === "measure") vals.push(s.chain, s.chain + s.delta.low, s.chain + s.delta.high);
  return [Math.min(...vals), Math.max(...vals)];
}

/** The bridge's axis, in General Fund dollars (negative = shortfall). It always reaches $0, so bar lengths are the amounts. */
export interface BridgeDomain {
  lo: number;
  hi: number;
}

/**
 * A fixed axis for one fiscal year, so the bridge doesn't jump while a visitor
 * answers: the span of the all-yes bridge and every single-yes bridge (plus
 * the current one), padded, and always reaching $0. Never zoomed: an axis cut
 * short of $0 makes a bar's length look like its amount when it isn't (a 13%
 * smaller shortfall drawn as half the bar).
 */
export function bridgeDomain(measures: MeasureInput[], budget: BudgetInput | null, fy: string, current?: Bridge | null): BridgeDomain | null {
  const ballots: Array<Record<string, Vote>> = [
    Object.fromEntries(measures.map((m) => [m.ref, "yes" as Vote])),
    ...measures.map((m) => ({ [m.ref]: "yes" as Vote })),
  ];
  const bridges = ballots.map((v) => bridgeSteps(runTrial(measures, budget, v), measures, fy));
  if (current) bridges.push(current);
  let lo = Infinity;
  let hi = -Infinity;
  for (const b of bridges) {
    if (!b) continue;
    const [a, z] = bridgeExtent(b);
    lo = Math.min(lo, a);
    hi = Math.max(hi, z);
  }
  if (!Number.isFinite(lo)) return null;
  const minSpan = Math.max(1_000_000, Math.abs((lo + hi) / 2) * 0.02);
  if (hi - lo < minSpan) {
    const mid = (lo + hi) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  lo = Math.min(lo, 0);
  hi = Math.max(hi, 0);
  const pad = (hi - lo) * 0.06;
  return { lo: lo < 0 ? lo - pad : 0, hi: hi > 0 ? hi + pad : 0 };
}
