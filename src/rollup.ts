/**
 * Candidate funding rollup: a pure function of the dataset. Never typed by hand.
 *
 * - Only committees linked to the candidate by a committee_role whose role is
 *   principal_campaign | authorized | ca_controlled AND whose contest is this
 *   contest count. Officeholder accounts, leadership PACs and committees for
 *   other races are excluded.
 * - monetary + in_kind contributions count as receipts; loans are reported
 *   separately; transfers and refunds are excluded (double counting).
 * - Conduit (ActBlue/WinRed) gifts are attributed to the original donor; the
 *   conduit is reported only as a pass-through total.
 * - Independent expenditures are kept separate from receipts, split by side.
 * - Optional `through` date limits contributions to periods ending on/before it
 *   (use the agenda's finance_cutoff for parity across candidates).
 */
import { COUNTED_COMMITTEE_ROLES, COUNTED_CONTRIBUTION_FORMS } from "./constants.js";
import type { Dataset, Rec } from "./dataset.js";
import { cmp } from "./ids.js";

export interface DonorTotal {
  donor: string;
  amount_cents: number;
}

export interface CandidateRollup {
  candidate: string;
  contest: string;
  through: string | null;
  committees: string[];
  receipts_cents: number;
  loans_cents: number;
  excluded: { transfer_cents: number; refund_cents: number };
  by_designation: Record<string, number>;
  top_donors: DonorTotal[];
  via_conduits: Record<string, number>;
  independent_expenditures: {
    support_cents: number;
    oppose_cents: number;
    spenders: Array<{ spender: string; side: string; amount_cents: number }>;
  };
  /** Latest money.period.end among counted contributions (for parity checks). */
  latest_period_end: string | null;
}

function money(rec: Rec): { amount: number; end: string } {
  const m = rec["money"] as Rec;
  return { amount: Number(m["amount_cents"]), end: String((m["period"] as Rec)["end"]) };
}

export function candidateCommittees(ds: Dataset, candidate: string, contest: string): string[] {
  return ds.relationships
    .filter(
      (r) =>
        r["type"] === "committee_role" &&
        r["subject"] === candidate &&
        r["contest"] === contest &&
        COUNTED_COMMITTEE_ROLES.has(String(r["role"])),
    )
    .map((r) => String(r["committee"]))
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort(cmp);
}

export function rollupCandidate(
  ds: Dataset,
  candidate: string,
  contest: string,
  opts: { through?: string | null; top?: number } = {},
): CandidateRollup {
  const through = opts.through ?? null;
  const committees = candidateCommittees(ds, candidate, contest);
  const committeeSet = new Set(committees);
  const out: CandidateRollup = {
    candidate,
    contest,
    through,
    committees,
    receipts_cents: 0,
    loans_cents: 0,
    excluded: { transfer_cents: 0, refund_cents: 0 },
    by_designation: {},
    top_donors: [],
    via_conduits: {},
    independent_expenditures: { support_cents: 0, oppose_cents: 0, spenders: [] },
    latest_period_end: null,
  };
  const donors = new Map<string, number>();

  for (const r of ds.relationships) {
    if (r["type"] !== "contribution" || !committeeSet.has(String(r["recipient"]))) continue;
    const { amount, end } = money(r);
    if (through && end > through) continue;
    const form = String(r["form"]);
    if (form === "transfer") {
      out.excluded.transfer_cents += amount;
      continue;
    }
    if (form === "refund") {
      out.excluded.refund_cents += amount;
      continue;
    }
    if (form === "loan") {
      out.loans_cents += amount;
      continue;
    }
    if (!COUNTED_CONTRIBUTION_FORMS.has(form)) continue;
    out.receipts_cents += amount;
    const d = String(r["election_designation"]);
    out.by_designation[d] = (out.by_designation[d] ?? 0) + amount;
    const donor = String(r["donor"]);
    donors.set(donor, (donors.get(donor) ?? 0) + amount);
    if (typeof r["conduit"] === "string") {
      out.via_conduits[r["conduit"]] = (out.via_conduits[r["conduit"]] ?? 0) + amount;
    }
    if (!out.latest_period_end || end > out.latest_period_end) out.latest_period_end = end;
  }

  out.top_donors = [...donors.entries()]
    .map(([donor, amount_cents]) => ({ donor, amount_cents }))
    .sort((a, b) => b.amount_cents - a.amount_cents || cmp(a.donor, b.donor))
    .slice(0, opts.top ?? Infinity);

  for (const r of ds.relationships) {
    if (r["type"] !== "independent_expenditure" || r["target"] !== candidate) continue;
    const { amount, end } = money(r);
    if (through && end > through) continue;
    const side = String(r["side"]);
    if (side === "support") out.independent_expenditures.support_cents += amount;
    else out.independent_expenditures.oppose_cents += amount;
    out.independent_expenditures.spenders.push({ spender: String(r["spender"]), side, amount_cents: amount });
  }
  out.independent_expenditures.spenders.sort(
    (a, b) => b.amount_cents - a.amount_cents || cmp(a.spender, b.spender) || cmp(a.side, b.side),
  );
  return out;
}
