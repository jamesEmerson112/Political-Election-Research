/**
 * Ballot measures as small chips: the measure's legal form, the vote it
 * needs, who placed it, then one chip per fiscal effect (by lane) as the
 * official statement gives it. Describes; never grades. Pure (no Svelte).
 */
// Type-only imports with .js so tests (NodeNext resolution) can typecheck this file too.
import type { Range } from "./budgetTrial.js";
import type { Chip } from "./officeChips.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = Record<string, any>;

const compactUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: 1 });
const centsUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** $8M, $1.2B, $950K. */
export function usd(n: number): string {
  // Round to the dollar first: float sums like 99999999.99 would print as "$100.0M".
  return compactUsd.format(Math.round(Math.abs(n)));
}
/** $8M–$12M, or $21M when low = high. Unsigned. */
export function usdRange(low: number, high: number): string {
  const a = usd(Math.min(Math.abs(low), Math.abs(high)));
  const b = usd(Math.max(Math.abs(low), Math.abs(high)));
  return a === b ? a : `${a}–${b}`;
}
/** A signed change: "+$28M–$52M", "−$8M–$12M", or "−$12M to +$5M". */
export function signedRange(r: Range): string {
  if (r.low === 0 && r.high === 0) return "$0";
  if (r.low >= 0) return `+${usdRange(r.low, r.high)}`;
  if (r.high <= 0) return `−${usdRange(-r.high, -r.low)}`;
  return `−${usd(-r.low)} to +${usd(r.high)}`;
}
/** A balance in the forecast's own words: shortfall / surplus / balanced, or a range across both. */
export function balance(r: Range): string {
  if (r.low === 0 && r.high === 0) return "balanced";
  if (r.high <= 0) return `shortfall ${usdRange(-r.high, -r.low)}`;
  if (r.low >= 0) return `surplus ${usdRange(r.low, r.high)}`;
  return `between a ${usd(-r.low)} shortfall and a ${usd(r.high)} surplus`;
}

/** The percent-first line of the meter, in parts (for styling) and as one string. */
export interface GapLine {
  /** "Shortfall FY2027-28", "Surplus FY2027-28", or "FY2027-28" when the result crosses zero. */
  head: string;
  /**
   * What leads: "pct" the % change ("≈0.9% larger"), "none" when nothing changed,
   * "cross" when the result crosses zero (no % then; the result is stated in words).
   */
  mode: "pct" | "none" | "cross";
  from: string;
  to: string;
  /** "+$4.1M–$4.2M" (the gap's size), or for a zero crossing the signed General Fund change. */
  change: string;
  /** "≈0.9% larger", computed as the change ÷ the forecast amount; null when it can't be. */
  pct: string | null;
  /** "Shortfall FY2027-28 ≈0.9% larger: $474.3M → $478.4M–$478.5M (+$4.1M–$4.2M)". */
  text: string;
}

const pctNum = (x: number) => {
  const p = Math.abs(x) * 100;
  if (p === 0) return "0";
  if (p < 0.05) return "<0.1";
  return p < 10 ? p.toFixed(1) : p.toFixed(0);
};
/** "≈0.9", "≈21–32", "<0.1" (never "≈<0.1"). */
const approx = (p: string, q: string = p) => `${p.startsWith("<") ? "" : "≈"}${p === q ? p : `${p}–${q}`}`;

/**
 * A change to the General Fund as a share of the forecast gap, in the forecast's
 * words: "≈25% larger", "<0.1% smaller", "≈4.5% smaller to 6.8% larger"; "no
 * change"; null when the forecast is balanced (no gap to compare with).
 */
export function gapShare(baseline: number, delta: Range): string | null {
  if (baseline === 0) return null;
  const s = baseline < 0 ? -1 : 1;
  const size = Math.abs(baseline);
  const a = s * delta.low;
  const b = s * delta.high;
  const c = { low: Math.min(a, b), high: Math.max(a, b) };
  if (c.low === 0 && c.high === 0) return "no change";
  if (c.low >= 0 || c.high <= 0) {
    const p = pctNum(Math.min(Math.abs(c.low), Math.abs(c.high)) / size);
    const q = pctNum(Math.max(Math.abs(c.low), Math.abs(c.high)) / size);
    return `${approx(p, q)}% ${c.low >= 0 ? "larger" : "smaller"}`;
  }
  return `${approx(pctNum(c.low / size))}% smaller to ${pctNum(c.high / size)}% larger`;
}

/**
 * Forecast -> result for one fiscal year, the % change first: "Shortfall
 * FY2027-28 ≈0.9% larger: $474.3M → $478.4M–$478.5M (+$4.1M–$4.2M)". The
 * percentage is the change relative to the forecast amount, computed here.
 * When the result crosses zero (or the forecast is balanced), it uses the
 * forecast's words instead and gives no percentage.
 */
export function gapLine(fy: string, baseline: number, result: Range): GapLine {
  const delta = { low: result.low - baseline, high: result.high - baseline };
  const sameSide = (baseline < 0 && result.high <= 0) || (baseline > 0 && result.low >= 0);
  let head: string;
  let from: string;
  let to: string;
  let change: string;
  let pct: string | null = null;
  let mode: GapLine["mode"] = "cross";
  if (sameSide) {
    const s = baseline < 0 ? -1 : 1;
    // Size of the shortfall (or surplus) and how it changes; positive = larger.
    const size = Math.abs(baseline);
    const a = s * delta.low;
    const b = s * delta.high;
    const c = { low: Math.min(a, b), high: Math.max(a, b) };
    head = `${s < 0 ? "Shortfall" : "Surplus"} FY${fy}`;
    from = usd(size);
    to = usdRange(Math.abs(result.low), Math.abs(result.high));
    if (c.low === 0 && c.high === 0) {
      mode = "none";
      change = "no change";
    } else if (c.low >= 0 || c.high <= 0) {
      mode = "pct";
      const word = c.low >= 0 ? "larger" : "smaller";
      change = `${c.low >= 0 ? "+" : "−"}${usdRange(c.low, c.high)}`;
      const p = pctNum(Math.min(Math.abs(c.low), Math.abs(c.high)) / size);
      const q = pctNum(Math.max(Math.abs(c.low), Math.abs(c.high)) / size);
      pct = `${approx(p, q)}% ${word}`;
    } else {
      mode = "pct";
      change = `−${usd(-c.low)} to +${usd(c.high)}`;
      pct = `${approx(pctNum(c.low / size))}% smaller to ${pctNum(c.high / size)}% larger`;
    }
  } else {
    head = `FY${fy}`;
    from = balance({ low: baseline, high: baseline });
    to = balance(result);
    change = `${signedRange(delta)} a year`;
  }
  const text =
    mode === "pct" ? `${head} ${pct}: ${from} → ${to} (${change})` : mode === "none" ? `${head}: no change (${from})` : `${head}: ${from} → ${to} (${change})`;
  return { head, mode, from, to, change, pct, text };
}

export const MEASURE_TYPE_LABEL: Record<string, string> = {
  charter_amendment: "Charter amendment",
  ordinance: "Ordinance",
  bond: "Bond",
  tax: "Tax",
  declaration_of_policy: "Policy declaration",
  referendum: "Referendum",
  constitutional_amendment: "Constitutional amendment",
  statute: "Statute",
  other: "Measure",
};
export const THRESHOLD_LABEL: Record<string, string> = { majority: "Majority", fifty_five_percent: "55%", two_thirds: "Two-thirds" };
export const PLACED_BY_LABEL: Record<string, string> = {
  governing_body: "Placed by the Board",
  executive: "Placed by the Mayor",
  legislature: "Placed by the Legislature",
  petition: "Placed by petition",
  other: "Placed on the ballot",
};
export const LANE_LABEL: Record<string, string> = {
  general_fund: "General Fund",
  set_aside: "Set-aside",
  dedicated: "Dedicated fund",
  bond_debt: "Bond repayment",
  other_agency: "Other agency",
};
const PER: Record<string, string> = { year: "/yr", one_time: " once", total: " total" };
const WORD: Record<string, string> = { cost: "cost", revenue: "revenue", savings: "savings", none: "" };
/** Short lane names inside a chip, after the percentage. */
const LANE_SHORT: Record<string, string> = { general_fund: "", set_aside: "set-aside", dedicated: "dedicated", bond_debt: "bond", other_agency: "other agency" };

/**
 * What a measure's dollars are compared with, so readers see how big they are:
 * the jurisdiction's first adopted fiscal year (the current budget).
 */
export interface BudgetBase {
  fy: string;
  /** Adopted General Fund, USD. */
  generalFund: number | null;
  /** Adopted budget, all funds, USD. */
  total: number | null;
}
export function budgetBase(budget: Rec | null | undefined): BudgetBase | null {
  const adopted = [...((budget?.["adopted"] as Rec[] | undefined) ?? [])].sort((a, b) => String(a["fy"]).localeCompare(String(b["fy"])));
  const a = adopted[0];
  if (!a) return null;
  const n = (v: unknown) => (typeof v === "number" && v > 0 ? v : null);
  return { fy: String(a["fy"]), generalFund: n(a["general_fund_usd"]), total: n(a["total_usd"]) };
}

/** A share in percent, rounded so small amounts stay visible: "≈12%", "≈1.6%", "≈0.06%", "<0.01%". */
export function pct(share: number): string {
  const p = Math.abs(share) * 100;
  if (p === 0) return "0%";
  if (p < 0.01) return "<0.01%";
  if (p < 1) return `≈${String(Number(p.toFixed(2)))}%`;
  if (p < 10) return `≈${p.toFixed(1)}%`;
  return `≈${Math.round(p)}%`;
}
/** A range of amounts as a share of `base`: "≈0.06–0.08%", or one value when both ends round the same. */
export function pctRange(low: number, high: number, base: number): string {
  const a = pct(Math.min(Math.abs(low), Math.abs(high)) / base);
  const b = pct(Math.max(Math.abs(low), Math.abs(high)) / base);
  return a === b ? a : `${a.replace(/%$/, "")}–${b.replace(/^[≈<]/, "")}`;
}

const unverifiedOnly = (cites: Rec[] | undefined) => !!cites?.length && cites.every((c) => c["unverified"]);

/** Facts chips: legal form, vote needed, who placed it. */
export function measureFactChips(c: Rec): Chip[] {
  const out: Chip[] = [];
  const t = c["measure_type"] as Rec | undefined;
  if (t) out.push({ icon: "measure_type", text: MEASURE_TYPE_LABEL[t["value"]] ?? String(t["value"]), lead: unverifiedOnly(t["citations"]) });
  const v = c["vote_threshold"] as Rec | undefined;
  if (v) out.push({ icon: "threshold", text: THRESHOLD_LABEL[v["value"]] ?? String(v["value"]), lead: unverifiedOnly(v["citations"]), title: "Share of yes votes needed to pass" });
  const p = c["placed_by"] as Rec | undefined;
  if (p) out.push({ icon: "placed_by", text: PLACED_BY_LABEL[p["value"]] ?? String(p["value"]), lead: unverifiedOnly(p["citations"]) });
  return out;
}

/** One chip per fiscal effect, plus the bond, plus competing measures. */
/**
 * One chip per fiscal effect. With a `base` (the jurisdiction's adopted budget) the
 * chip leads with the share, so readers see how big an amount is: General Fund
 * effects as a share of the General Fund ("≈1.6% of GF · cost $120M/yr"), other
 * lanes and bonds as a share of the whole budget ("≈1.0% of all funds · …").
 * The shares are computed here and say so on hover.
 */
export function fiscalChips(c: Rec, labelOf: (ref: string) => string = (r) => r, base: BudgetBase | null = null): Chip[] {
  const fiscal = c["fiscal"] as Rec | undefined;
  if (!fiscal) return [{ icon: "none", text: "Fiscal effect not researched", muted: true }];
  const out: Chip[] = [];
  const share = (lane: string) =>
    lane === "general_fund"
      ? base?.generalFund
        ? { of: base.generalFund, name: "GF", long: `the FY${base.fy} General Fund (${usd(base.generalFund)})` }
        : null
      : base?.total
        ? { of: base.total, name: "all funds", long: `the City's whole FY${base.fy} budget, all funds (${usd(base.total)})` }
        : null;
  for (const e of (fiscal["effects"] as Rec[] | undefined) ?? []) {
    const lane = String(e["lane"]);
    const icon = (LANE_LABEL[lane] ? lane : "none") as Chip["icon"];
    const lead = unverifiedOnly(e["citations"]);
    const prefix = lane === "general_fund" ? "GF" : LANE_LABEL[lane];
    if (e["estimate"] === "minimal") out.push({ icon, text: `${prefix}: minimal or no cost`, lead, title: String(e["text"]) });
    else if (e["estimate"] === "not_estimated") out.push({ icon: "none", text: `${prefix}: not estimated`, lead, title: String(e["text"]) });
    else if (e["estimate"] === "depends_on_future_decisions") out.push({ icon: "none", text: `${prefix}: depends on future decisions`, lead, title: String(e["text"]) });
    else if (e["amount"]) {
      const a = e["amount"] as Rec;
      const word = WORD[String(e["direction"])] ?? "";
      const dollars = `${usdRange(a["low_usd"], a["high_usd"])}${PER[String(e["per"])] ?? ""}`;
      const s = share(lane);
      if (s) {
        const p = pctRange(a["low_usd"], a["high_usd"], s.of);
        const text = `${p} of ${s.name} · ${[LANE_SHORT[lane], word].filter(Boolean).join(" ")} ${dollars}`.replace(/\s+/g, " ");
        out.push({ icon, text, lead, title: `${p} of ${s.long}, computed here. ${String(e["text"])}` });
      } else out.push({ icon, text: `${prefix} ${word} ${dollars}`.replace(/\s+/g, " "), lead, title: String(e["text"]) });
    }
  }
  const bond = fiscal["bond"] as Rec | undefined;
  if (bond) {
    const per = typeof bond["annual_cost_per_100k_assessed_usd"] === "number" ? ` · ~${centsUsd.format(bond["annual_cost_per_100k_assessed_usd"])}/yr per $100k assessed` : "";
    const s = share("bond_debt");
    const p = s ? `${pct(Number(bond["principal_usd"]) / s.of)} of ${s.name} · ` : "";
    out.push({
      icon: "bond_debt",
      text: `${p}Bond ${usd(bond["principal_usd"])}${per}`,
      lead: unverifiedOnly(bond["citations"]),
      ...(s ? { title: `Bond principal as a share of ${s.long}, computed here.` } : {}),
    });
  }
  for (const k of (c["conflicts"] as Rec[] | undefined) ?? []) out.push({ icon: "conflict", text: `Competes with ${labelOf(String(k["contest"]))}`, title: String(k["rule"]) });
  return out.length ? out : [{ icon: "none", text: "No fiscal effect recorded", muted: true }];
}
