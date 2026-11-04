/**
 * "My picks": the visitor's own choices and notes per contest, kept only in
 * this browser, and a plain-text export of them (a personal ballot to keep or
 * print). The site never suggests a pick; nothing here is sent anywhere.
 *
 * Stored as {v: 1, picks: {<contest ref>: {pick?, note?}}}. A pick is a
 * candidate's person ref, or "yes" / "no" for a measure. Every storage access
 * is wrapped in try/catch: the page works without storage.
 */

const KEY = "per-my-picks";
const REF = /^contest:[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PICK = /^(?:yes|no|person:[a-z0-9]+(?:-[a-z0-9]+)*)$/;
/** Longest note kept, in characters. */
export const NOTE_MAX = 500;

export interface Pick {
  pick?: string;
  note?: string;
}
export type Picks = Record<string, Pick>;

/** Known refs, valid picks and trimmed, length-capped notes only; empty entries dropped; sorted by ref. */
export function cleanPicks(v: unknown): Picks {
  const out: Picks = {};
  if (!v || typeof v !== "object") return out;
  for (const [ref, x] of Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) {
    if (!REF.test(ref) || !x || typeof x !== "object") continue;
    const p = x as Record<string, unknown>;
    const e: Pick = {};
    if (typeof p["pick"] === "string" && PICK.test(p["pick"])) e.pick = p["pick"];
    if (typeof p["note"] === "string" && p["note"].trim()) e.note = p["note"].trim().slice(0, NOTE_MAX);
    if (e.pick || e.note) out[ref] = e;
  }
  return out;
}

export function loadPicks(): Picks {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return {};
    const d = JSON.parse(raw) as { v?: unknown; picks?: unknown };
    return d && d.v === 1 ? cleanPicks(d.picks) : {};
  } catch {
    return {};
  }
}

/** Returns false when storage is unavailable. */
export function savePicks(p: Picks): boolean {
  try {
    const clean = cleanPicks(p);
    if (Object.keys(clean).length) globalThis.localStorage?.setItem(KEY, JSON.stringify({ v: 1, picks: clean }));
    else globalThis.localStorage?.removeItem(KEY);
    return !!globalThis.localStorage;
  } catch {
    return false;
  }
}

/** Sets or clears one contest's entry and saves; returns the new picks. */
export function setPick(ref: string, entry: Pick): Picks {
  const all = loadPicks();
  const clean = cleanPicks({ [ref]: entry })[ref];
  if (clean) all[ref] = clean;
  else delete all[ref];
  savePicks(all);
  return all;
}

export function forgetPicks(): void {
  savePicks({});
}

// ---------------------------------------------------------------- export

export interface ExportContest {
  ref: string;
  title: string;
  group: string;
  kind: "office" | "measure";
  /** Candidates as listed (office contests). */
  candidates: Array<{ ref: string; name: string; party?: string }>;
}

export interface ExportOptions {
  election: string;
  /** e.g. "CA-11 · BOE 2", or "" when no districts are set. */
  districts: string;
  /** Date of the export (YYYY-MM-DD). */
  today: string;
  site: string;
  /** Measure votes from Try your ballot, used when no pick was made here. */
  trialVotes?: Record<string, "yes" | "no" | "skip">;
}

const wrap = (text: string, indent: string, width = 76): string[] => {
  const out: string[] = [];
  for (const para of text.split(/\n+/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (line && (indent + line + " " + word).length > width) {
        out.push(indent + line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    if (line) out.push(indent + line);
  }
  return out;
};

/**
 * The personal ballot as plain text: contests in the order given (grouped),
 * every candidate with a box ([x] for the pick), Yes/No boxes for measures,
 * and the note under each contest. Undecided contests keep empty boxes, so
 * the file doubles as a checklist.
 */
export function picksToText(contests: ExportContest[], picks: Picks, o: ExportOptions): string {
  const lines: string[] = [];
  lines.push(`MY BALLOT NOTES: ${o.election}`);
  lines.push(`Saved ${o.today} from ${o.site}`);
  if (o.districts) lines.push(`Districts: ${o.districts}`);
  lines.push("These are your own picks and notes. The site doesn't recommend anyone.");
  lines.push("Confirm your contests on your official sample ballot.");
  const decided = contests.filter((c) => picks[c.ref]?.pick || (c.kind === "measure" && ["yes", "no"].includes(o.trialVotes?.[c.ref] ?? ""))).length;
  lines.push(`${decided} of ${contests.length} contests decided.`);
  let group = "";
  for (const c of contests) {
    if (c.group !== group) {
      group = c.group;
      lines.push("", group.toUpperCase(), "-".repeat(group.length));
    }
    lines.push("", c.title);
    const p = picks[c.ref];
    if (c.kind === "measure") {
      const trial = o.trialVotes?.[c.ref];
      const v = p?.pick ?? (trial === "yes" || trial === "no" ? trial : undefined);
      lines.push(`  [${v === "yes" ? "x" : " "}] Yes   [${v === "no" ? "x" : " "}] No${!p?.pick && v ? "   (from Try your ballot)" : ""}`);
    } else {
      for (const cand of c.candidates) lines.push(`  [${p?.pick === cand.ref ? "x" : " "}] ${cand.name}${cand.party ? ` (${cand.party})` : ""}`);
      if (!c.candidates.length) lines.push("  (candidates not listed yet)");
    }
    if (p?.note) lines.push(...wrap(`Note: ${p.note}`, "  "));
  }
  return lines.join("\n") + "\n";
}
