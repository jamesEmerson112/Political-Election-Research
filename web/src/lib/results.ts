/**
 * Election results as recorded on contests (`result`): who won or leads an office
 * race, and a measure's yes and no votes. Shares are computed here from the
 * recorded votes. Until a count is certified the site says "Leading" and
 * "Yes ahead" / "No ahead", never "won" or "passed" (maintainer, 2026-11-04);
 * the certified count says "Elected", "Passed" or "Failed".
 *
 * No runtime imports except format.js, so tests (NodeNext resolution) can typecheck it.
 */
import { date } from "./format.js";

type Rec = Record<string, unknown>;
/** A record citation, as stored (see data.ts Citation). */
type Cite = { source: string; quote?: string; locator?: string };

export interface Count {
  certified: boolean;
  /** Date of a semi-official count. */
  asOf?: string;
  certifiedDate?: string;
  citations: Cite[];
}
export interface OfficeRow {
  person: string;
  votes: number;
  share: number;
  won: boolean;
}
export interface OfficeOutcome extends Count {
  /** Candidates by votes, most first. */
  rows: OfficeRow[];
  total: number;
  winners: Set<string>;
}
export interface MeasureOutcome extends Count {
  yes: number;
  no: number;
  total: number;
  yesShare: number;
  noShare: number;
  ahead: "yes" | "no" | "tie";
  passed?: boolean;
  /** The recorded vote threshold and the share of yes votes it needs. */
  threshold?: { value: string; share: number };
}

/** Share of yes votes each recorded threshold needs (majority: more than half). */
export const THRESHOLD_SHARE: Record<string, number> = { majority: 0.5, fifty_five_percent: 0.55, two_thirds: 2 / 3 };

const countOf = (r: Rec): Count => ({
  certified: r["certified"] === true,
  ...(typeof r["as_of"] === "string" ? { asOf: r["as_of"] } : {}),
  ...(typeof r["certified_date"] === "string" ? { certifiedDate: r["certified_date"] } : {}),
  citations: (r["citations"] as Cite[] | undefined) ?? [],
});

export function officeOutcome(contest: Rec | undefined): OfficeOutcome | null {
  const r = contest?.["result"] as Rec | undefined;
  if (!r || contest?.["kind"] !== "office") return null;
  const winners = new Set(((r["winners"] as string[] | undefined) ?? []).map(String));
  const tallies = ((r["tallies"] as Rec[] | undefined) ?? []).map((t) => ({ person: String(t["person"]), votes: Number(t["votes"]) || 0 }));
  const total = tallies.reduce((a, t) => a + t.votes, 0);
  const rows = tallies
    .map((t) => ({ ...t, share: total ? t.votes / total : 0, won: winners.has(t.person) }))
    .sort((a, b) => b.votes - a.votes || (a.person < b.person ? -1 : a.person > b.person ? 1 : 0));
  return { ...countOf(r), rows, total, winners };
}

export function measureOutcome(contest: Rec | undefined): MeasureOutcome | null {
  const r = contest?.["result"] as Rec | undefined;
  if (!r || contest?.["kind"] !== "measure") return null;
  const yes = Number(r["yes_votes"]) || 0;
  const no = Number(r["no_votes"]) || 0;
  const total = yes + no;
  const t = ((contest?.["vote_threshold"] as Rec | undefined)?.["value"] as string | undefined) ?? undefined;
  return {
    ...countOf(r),
    yes,
    no,
    total,
    yesShare: total ? yes / total : 0,
    noShare: total ? no / total : 0,
    ahead: yes > no ? "yes" : no > yes ? "no" : "tie",
    ...(typeof r["passed"] === "boolean" ? { passed: r["passed"] } : {}),
    ...(t && THRESHOLD_SHARE[t] !== undefined ? { threshold: { value: t, share: THRESHOLD_SHARE[t]! } } : {}),
  };
}

export type Standing = "won" | "lost" | "";
/** "won" for a winner (or the leader of a semi-official count), "lost" for the others, "" without a result. */
export function standing(o: OfficeOutcome | null, person: string): Standing {
  if (!o || !o.winners.size) return "";
  return o.winners.has(person) ? "won" : "lost";
}

/** "Leading" until the count is certified, then "Elected". */
export const winnerWord = (o: Count): string => (o.certified ? "Elected" : "Leading");

/** "Yes ahead" / "No ahead" until certified, then "Passed" / "Failed". */
export function measureWord(o: MeasureOutcome): string {
  if (o.certified && o.passed !== undefined) return o.passed ? "Passed" : "Failed";
  return o.ahead === "tie" ? "Tied" : o.ahead === "yes" ? "Yes ahead" : "No ahead";
}

/**
 * Whether the yes votes reach the threshold (majority: more than half; 55% and two-thirds: at least that share).
 * The same rule as `measurePasses` in src/validate.ts, which checks a certified `passed` against the votes.
 */
export function passesThreshold(threshold: string | undefined, yes: number, no: number): boolean {
  const total = yes + no;
  if (threshold === "two_thirds") return 3 * yes >= 2 * total;
  if (threshold === "fifty_five_percent") return 100 * yes >= 55 * total;
  return 2 * yes > total;
}

export type CountVote = "yes" | "no" | "skip";
export interface CountStatus {
  outcome: MeasureOutcome;
  /** "Yes ahead" / "No ahead" / "Tied", or "Passed" / "Failed" once certified. */
  word: string;
  /** Yes is ahead but under the recorded threshold (e.g. two-thirds): not counted as passing. */
  short: boolean;
}
export interface CountBallot {
  /** One vote per measure: "yes" if it passes on the recorded count, "no" if not, "skip" without a result. */
  votes: Record<string, CountVote>;
  status: Record<string, CountStatus>;
  /** Measures with no recorded result. */
  missing: string[];
  /** The latest count among the measures (certified only when every recorded result is). */
  count: Count | null;
}

/**
 * The recorded results as a ballot, for the budget forecast "if the count holds". A certified count
 * uses `passed`; otherwise the votes are compared with the recorded threshold (majority without one).
 * Nothing here is stored: the visitor's own answers stay separate.
 */
export function countVotes(measures: Array<[string, Rec | undefined]>): CountBallot {
  const votes: Record<string, CountVote> = {};
  const status: Record<string, CountStatus> = {};
  const missing: string[] = [];
  const counts: MeasureOutcome[] = [];
  for (const [ref, contest] of measures) {
    const o = measureOutcome(contest);
    if (!o) {
      votes[ref] = "skip";
      missing.push(ref);
      continue;
    }
    const passes = o.certified && o.passed !== undefined ? o.passed : passesThreshold(o.threshold?.value, o.yes, o.no);
    votes[ref] = passes ? "yes" : "no";
    status[ref] = { outcome: o, word: measureWord(o), short: !o.certified && o.ahead === "yes" && !passes };
    counts.push(o);
  }
  return { votes, status, missing, count: summarize(counts) };
}

/** One count line for several measures: the latest date, certified only when every count is; citations once each. */
function summarize(counts: MeasureOutcome[]): Count | null {
  if (!counts.length) return null;
  const when = (c: Count) => c.certifiedDate ?? c.asOf ?? "";
  const latest = counts.reduce((a, b) => (when(b) > when(a) ? b : a));
  const citations: Cite[] = [];
  for (const c of counts.flatMap((o) => o.citations)) if (!citations.some((d) => d.source === c.source && d.quote === c.quote)) citations.push(c);
  return {
    certified: counts.every((o) => o.certified),
    ...(latest.asOf ? { asOf: latest.asOf } : {}),
    ...(latest.certifiedDate ? { certifiedDate: latest.certifiedDate } : {}),
    citations,
  };
}

/** "Semi-official count · Nov 4, 2026" or "Certified Dec 11, 2026". */
export function countLine(o: Count): string {
  return o.certified ? `Certified ${date(o.certifiedDate)}`.trim() : `Semi-official count · ${date(o.asOf)}`;
}

/** One decimal: "63.9%". */
export const pct1 = (share: number): string => `${(share * 100).toFixed(1)}%`;

const intFmt = new Intl.NumberFormat("en-US");
export const votes = (n: number): string => intFmt.format(n);
