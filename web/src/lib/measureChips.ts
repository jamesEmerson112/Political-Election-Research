/**
 * Ballot measures as small chips: the measure's legal form, the vote it
 * needs, who placed it, then one chip per fiscal effect (by lane) as the
 * official statement gives it. Describes; never grades. Pure (no Svelte).
 */
import type { Range } from "./budgetTrial";
import type { Chip } from "./officeChips";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = Record<string, any>;

const compactUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
const centsUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** $8M, $1.2B, $950K. */
export function usd(n: number): string {
  return compactUsd.format(Math.abs(n));
}
/** $8M–$12M, or $21M when low = high. Unsigned. */
export function usdRange(low: number, high: number): string {
  const [a, b] = [Math.abs(low), Math.abs(high)].sort((x, y) => x - y);
  return a === b ? usd(a) : `${usd(a)}–${usd(b)}`;
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
export function fiscalChips(c: Rec, labelOf: (ref: string) => string = (r) => r): Chip[] {
  const fiscal = c["fiscal"] as Rec | undefined;
  if (!fiscal) return [{ icon: "none", text: "Fiscal effect not researched", muted: true }];
  const out: Chip[] = [];
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
      out.push({ icon, text: `${prefix} ${word} ${usdRange(a["low_usd"], a["high_usd"])}${PER[String(e["per"])] ?? ""}`.replace(/\s+/g, " "), lead, title: String(e["text"]) });
    }
  }
  const bond = fiscal["bond"] as Rec | undefined;
  if (bond) {
    const per = typeof bond["annual_cost_per_100k_assessed_usd"] === "number" ? ` · ~${centsUsd.format(bond["annual_cost_per_100k_assessed_usd"])}/yr per $100k assessed` : "";
    out.push({ icon: "bond_debt", text: `Bond ${usd(bond["principal_usd"])}${per}`, lead: unverifiedOnly(bond["citations"]) });
  }
  for (const k of (c["conflicts"] as Rec[] | undefined) ?? []) out.push({ icon: "conflict", text: `Competes with ${labelOf(String(k["contest"]))}`, title: String(k["rule"]) });
  return out.length ? out : [{ icon: "none", text: "No fiscal effect recorded", muted: true }];
}
