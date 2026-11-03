/**
 * The visitor's trial-ballot answers, kept only in this browser.
 * Versioned payload {v: 1, ballots: {<budget id>: {<contest ref>: vote}}},
 * every access wrapped in try/catch: the page works without storage.
 */
import type { Vote } from "./budgetTrial.js";

const KEY = "per-trial-ballot";
const VOTES = new Set<Vote>(["yes", "no", "skip"]);
const REF = /^contest:[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

type Stored = { v: 1; ballots: Record<string, Record<string, Vote>> };

function read(): Stored {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return { v: 1, ballots: {} };
    const d = JSON.parse(raw) as Stored;
    if (!d || d.v !== 1 || typeof d.ballots !== "object" || d.ballots === null) return { v: 1, ballots: {} };
    return d;
  } catch {
    return { v: 1, ballots: {} };
  }
}

/** Clean votes: known refs and vote values only. */
export function cleanVotes(v: unknown): Record<string, Vote> {
  const out: Record<string, Vote> = {};
  if (!v || typeof v !== "object") return out;
  for (const [k, x] of Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) {
    if (REF.test(k) && VOTES.has(x as Vote)) out[k] = x as Vote;
  }
  return out;
}

export function loadVotes(ballot: string): Record<string, Vote> {
  return cleanVotes(read().ballots[ballot]);
}

/** Returns false when storage is unavailable. */
export function saveVotes(ballot: string, votes: Record<string, Vote>): boolean {
  try {
    const d = read();
    const clean = cleanVotes(votes);
    if (Object.keys(clean).length) d.ballots[ballot] = clean;
    else delete d.ballots[ballot];
    if (Object.keys(d.ballots).length) globalThis.localStorage?.setItem(KEY, JSON.stringify(d));
    else globalThis.localStorage?.removeItem(KEY);
    return !!globalThis.localStorage;
  } catch {
    return false;
  }
}

export function forgetVotes(ballot: string): void {
  saveVotes(ballot, {});
}
