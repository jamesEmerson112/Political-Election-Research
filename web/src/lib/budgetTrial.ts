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
 *   "depends_on_future_decisions" are listed and never added.
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
  range: Range;
  startFy: string | null;
  years: number | null;
  startAssumed: boolean;
  text: string;
}

export interface TrialResult {
  years: string[];
  generalFund: Array<{ fy: string; baseline: number | null; delta: Range; result: Range | null }>;
  /** Annual effects of the yes measures once in effect, per lane (conflicts merged). */
  perYearOnceInEffect: Record<Lane, Range>;
  oneTime: Contribution[];
  totals: Contribution[];
  bonds: { principal: number; debtServiceTotal: number; perHundredK: number; labels: string[] };
  notEstimated: Array<{ ref: string; label: string; estimate: string; text: string }>;
  minimal: Array<{ ref: string; label: string; text: string }>;
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

/** Signed range for one effect, or null if it isn't an estimated amount. */
function signed(e: Rec): Range | null {
  if (e["estimate"] !== "estimated") return null;
  const a = e["amount"] as Rec | undefined;
  if (!a) return null;
  const s = SIGN[String(e["direction"])] ?? 0;
  const x = s * Number(a["low_usd"]);
  const y = s * Number(a["high_usd"]);
  return { low: Math.min(x, y) || 0, high: Math.max(x, y) || 0 };
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
  const yes = measures.filter((m) => votes[m.ref] === "yes");
  const perMeasure = new Map(yes.map((m) => [m.ref, contributions(m, firstFy)]));
  const groups = conflictGroups(yes);

  const laneSum = (fy: string | null, lane: Lane): Range =>
    groups.reduce((acc, g) => {
      const rangeOf = (m: MeasureInput) =>
        perMeasure
          .get(m.ref)!
          .filter((c) => c.lane === lane && c.per === "year" && (fy === null || appliesIn(c, fy)))
          .reduce((r, c) => add(r, c.range), ZERO);
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
    generalFund,
    perYearOnceInEffect,
    oneTime: all.filter((c) => c.per === "one_time"),
    totals: all.filter((c) => c.per === "total"),
    bonds,
    notEstimated: listed(["not_estimated", "depends_on_future_decisions"]),
    minimal: listed(["minimal"]).map(({ ref, label, text }) => ({ ref, label, text })),
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

/** A measure contest record -> engine input. Label: "Prop <number>". */
export function measureInput(contest: Rec): MeasureInput {
  const fiscal = (contest["fiscal"] as Rec | undefined) ?? {};
  return {
    ref: `contest:${String(contest["id"])}`,
    label: `Prop ${String(contest["number"])}`,
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
