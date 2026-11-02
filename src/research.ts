/**
 * The research queue. `next` diffs each agenda (what we intend to research)
 * against verified data and returns tasks in a fixed dependency order, so any
 * agent asked to "do the next task" does the same thing.
 * `coverage` renders the same diff as a parity matrix across candidates.
 */
import { DOSSIER_SECTIONS, PROFILE_FIELDS } from "./constants.js";
import type { Dataset, Rec } from "./dataset.js";
import { cmp } from "./ids.js";
import { candidateCommittees } from "./rollup.js";

export const TASK_KINDS = [
  "election",
  "contest",
  "candidacy",
  "person",
  "profile",
  "position",
  "legislation",
  "dossier",
  "endorsements",
  "committee",
  "measure_committees",
  "finance_cutoff",
  "contributions",
  "independent_expenditures",
] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export interface Task {
  /** Stable id: "<contest-id>|<kind>[|<subject>[|<item>]]". */
  id: string;
  contest: string;
  kind: TaskKind;
  /** The person (or measure contest) the task is about. */
  subject?: string;
  /** Profile field, question ref or measure ref. */
  item?: string;
  /** Data-relative file the result is written to (via `npm run put`). */
  file: string;
  /** Which `npm run put -- <kind>` to use. */
  put: string;
  /** Anchor in docs/RESEARCH_GUIDE.md with the procedure for this kind. */
  guide: string;
  detail: string;
  /** Id of a task that must be done first; blocked tasks are hidden by default. */
  blocked_by?: string;
  /** Unverified hints from data/leads that bear on this task. Starting points only. */
  leads?: string[];
}

/** "<contest-id>|<kind>[|<subject>[|<item>]]" — refs contain ":" so "|" separates parts. */
export function taskId(contestId: string, kind: TaskKind, subject?: string, item?: string): string {
  return [contestId, kind, subject, item].filter(Boolean).join("|");
}

function cycleOf(contestRef: string): number {
  return Number(contestRef.replace(/^contest:/, "").slice(0, 4));
}

function slugOf(ref: string): string {
  return ref.slice(ref.indexOf(":") + 1);
}

function endorsementCount(ds: Dataset, endorsee: string, cycle: number): number {
  return ds.relationships.filter(
    (r) => r["type"] === "endorsement" && r["endorsee"] === endorsee && r["cycle"] === cycle && !r["rescinded"],
  ).length;
}

function donorsThrough(ds: Dataset, committees: string[], cutoff: string): number {
  const set = new Set(committees);
  const donors = new Set<string>();
  for (const r of ds.relationships) {
    if (r["type"] !== "contribution" || !set.has(String(r["recipient"]))) continue;
    if (r["form"] !== "monetary" && r["form"] !== "in_kind") continue;
    const end = String(((r["money"] as Rec)["period"] as Rec)["end"]);
    if (end === cutoff) donors.add(String(r["donor"]));
  }
  return donors.size;
}

function legislationCount(ds: Dataset, person: string): number {
  return ds.relationships.filter((r) => r["type"] === "legislative_action" && r["person"] === person).length;
}

function ieCount(ds: Dataset, target: string, cycle: number): number {
  return ds.relationships.filter(
    (r) => r["type"] === "independent_expenditure" && r["target"] === target && r["cycle"] === cycle,
  ).length;
}

function hasPosition(ds: Dataset, actor: string, subject: string): Rec | undefined {
  const file = ds.positions.get(actor);
  const list = ((file?.["positions"] as Rec[] | undefined) ?? []).filter((p) => p["subject"] === subject);
  return list.sort((a, b) => cmp(String(b["as_of"]), String(a["as_of"])))[0];
}

function measureCommittees(ds: Dataset, contestRef: string): string[] {
  return ds.relationships
    .filter(
      (r) =>
        r["type"] === "committee_role" &&
        r["subject"] === contestRef &&
        (r["role"] === "primarily_formed_support" || r["role"] === "primarily_formed_oppose"),
    )
    .map((r) => String(r["committee"]))
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort(cmp);
}

export function nextTasks(ds: Dataset, opts: { contest?: string; includeBlocked?: boolean } = {}): Task[] {
  const tasks: Task[] = [];
  const seen = new Set<string>();
  const agendaIds = [...ds.agendas.keys()].sort(cmp);
  for (const agendaRef of agendaIds) {
    if (opts.contest && agendaRef !== opts.contest && agendaRef !== `contest:${opts.contest}`) continue;
    const agenda = ds.agendas.get(agendaRef)!;
    const contestId = slugOf(agendaRef);
    const electionSlug = contestId.split("/")[0]!;
    const cycle = cycleOf(agendaRef);
    const exhausted = new Set(((agenda["exhausted"] as Rec[] | undefined) ?? []).map((e) => String(e["task"])));
    const targets = agenda["targets"] as Rec;
    const cutoff = (targets["finance_cutoff"] as string | null) ?? null;
    const push = (t: Omit<Task, "id" | "contest" | "guide">, forContest = agendaRef) => {
      const id = taskId(slugOf(forContest), t.kind, t.subject, t.item);
      if (exhausted.has(id) || seen.has(id)) return;
      if (t.blocked_by && !opts.includeBlocked) return;
      seen.add(id);
      tasks.push({ id, contest: forContest, guide: `docs/RESEARCH_GUIDE.md#task-${t.kind.replace(/_/g, "-")}`, ...t });
    };

    if (!ds.elections.has(electionSlug)) {
      push({
        kind: "election",
        file: `elections/${electionSlug}.json`,
        put: "election",
        detail: `Create election:${electionSlug} citing the official election calendar.`,
      });
    }
    const contest = ds.contests.get(contestId);
    const contestTask = () => {
      if (!contest) {
        push({
          kind: "contest",
          file: `contests/${contestId}.json`,
          put: "contest",
          detail: `Create ${agendaRef} from the official certified list / ballot measure list.`,
        });
      }
    };

    if (agenda["kind"] === "office") {
      const candidates = (agenda["candidates"] as Rec[]).map((c) => String(c["person"]));
      const subjects = [...(agenda["questions"] as string[]), ...(agenda["measures"] as string[])];
      // People first: the contest record lists candidates by person ref, which must resolve.
      for (const person of candidates) {
        const slug = slugOf(person);
        if (!ds.people.has(slug)) {
          push({ kind: "person", subject: person, file: `people/${slug}.json`, put: "person", detail: `Create ${person}.` });
        }
      }
      contestTask();
      // Measures asked about must exist before stances on them can be recorded.
      for (const m of agenda["measures"] as string[]) {
        if (!ds.contests.has(slugOf(m))) {
          push(
            {
              kind: "contest",
              file: `contests/${slugOf(m)}.json`,
              put: "contest",
              detail: `Create ${m} from the official ballot measure list (needed for candidate stances).`,
            },
            m,
          );
        }
      }
      // Tasks are interleaved across candidates item by item, so research on one
      // item is done for everyone before moving on (parity even mid-way).
      const people = candidates.map((person) => {
        const slug = slugOf(person);
        const p = ds.people.get(slug);
        return { person, slug, p, profile: (p?.["candidate_profile"] as Rec | undefined) ?? {} };
      });
      for (const { person } of people) {
        if (contest && !((contest["candidates"] as Rec[]) ?? []).some((c) => c["person"] === person)) {
          push({
            kind: "candidacy",
            subject: person,
            file: `contests/${contestId}.json`,
            put: "contest --merge",
            detail: `Verify ${person} is on the certified list; add party and ballot designation exactly as printed.`,
          });
        }
      }
      for (const field of PROFILE_FIELDS) {
        for (const { person, slug, p, profile } of people) {
          if (profile[field] !== undefined) continue;
          push({
            kind: "profile",
            subject: person,
            item: field,
            file: `people/${slug}.json`,
            put: "person --merge",
            detail: `Research candidate_profile.${field} (cited value, or not_found with a search log).`,
            ...(p ? {} : { blocked_by: taskId(contestId, "person", person) }),
          });
        }
      }
      for (const subject of subjects) {
        for (const { person, slug } of people) {
          if (hasPosition(ds, person, subject)) continue;
          const missingMeasure = subject.startsWith("contest:") && !ds.contests.has(slugOf(subject));
          push({
            kind: "position",
            subject: person,
            item: subject,
            file: `positions/people/${slug}.json`,
            put: "position",
            detail: `Find ${person}'s stance on ${subject}.`,
            ...(missingMeasure ? { blocked_by: taskId(slugOf(subject), "contest") } : {}),
          });
        }
      }
      for (const { person } of people) {
        if (legislationCount(ds, person) === 0) {
          push({
            kind: "legislation",
            subject: person,
            file: "relationships/legislative_action/",
            put: "relationship",
            detail: `Record bills ${person} authored, co-authored, voted on or publicly took a side on (plus bill records with outcomes).`,
          });
        }
      }
      for (const section of DOSSIER_SECTIONS) {
        for (const { person, slug } of people) {
          if (ds.dossiers.get(person)?.[section] !== undefined) continue;
          push({
            kind: "dossier",
            subject: person,
            item: section,
            file: `dossiers/people/${slug}.json`,
            put: "dossier --merge",
            detail: `Research ${person}'s ${section.replace("_", " ")} (cited items, or an empty list with a search log).`,
          });
        }
      }
      for (const { person } of people) {
        const target = Number(targets["endorsements_per_candidate"]);
        const have = endorsementCount(ds, person, cycle);
        if (have < target) {
          push({
            kind: "endorsements",
            subject: person,
            file: "relationships/endorsement/",
            put: "relationship",
            detail: `Record notable endorsements of ${person} (${have}/${target}).`,
          });
        }
      }
      for (const { person } of people) {
        if (candidateCommittees(ds, person, agendaRef).length === 0) {
          push({
            kind: "committee",
            subject: person,
            file: "relationships/committee_role/",
            put: "relationship",
            detail: `Identify ${person}'s controlled/authorized committee(s) for ${agendaRef}.`,
          });
        }
      }
      if (!cutoff) {
        push({
          kind: "finance_cutoff",
          file: `agenda/${contestId}.json`,
          put: "agenda --merge",
          detail: "Choose ONE filing-period end date that applies to every candidate (latest period all have filed).",
        });
      } else {
        for (const person of candidates) {
          const committees = candidateCommittees(ds, person, agendaRef);
          const target = Number(targets["top_contributors"]);
          const have = donorsThrough(ds, committees, cutoff);
          if (have < target) {
            push({
              kind: "contributions",
              subject: person,
              file: "relationships/contribution/",
              put: "relationship",
              detail: `Record top contributors to ${committees.join(", ") || "the candidate's committees"} through ${cutoff} (${have}/${target}).`,
              ...(committees.length ? {} : { blocked_by: taskId(contestId, "committee", person) }),
            });
          }
        }
      }
      for (const person of candidates) {
        if (ieCount(ds, person, cycle) === 0) {
          push({
            kind: "independent_expenditures",
            subject: person,
            file: "relationships/independent_expenditure/",
            put: "relationship",
            detail: `Record major independent expenditures supporting or opposing ${person}.`,
          });
        }
      }
    } else {
      contestTask();
      const committees = measureCommittees(ds, agendaRef);
      if (committees.length === 0) {
        push({
          kind: "measure_committees",
          subject: agendaRef,
          file: "relationships/committee_role/",
          put: "relationship",
          detail: `Identify committees primarily formed to support/oppose ${agendaRef}.`,
        });
      }
      const target = Number(targets["endorsements_per_candidate"]);
      const have = endorsementCount(ds, agendaRef, cycle);
      if (have < target) {
        push({
          kind: "endorsements",
          subject: agendaRef,
          file: "relationships/endorsement/",
          put: "relationship",
          detail: `Record notable endorsements on ${agendaRef}, both sides (${have}/${target}).`,
        });
      }
      if (!cutoff) {
        push({
          kind: "finance_cutoff",
          file: `agenda/${contestId}.json`,
          put: "agenda --merge",
          detail: "Choose ONE filing-period end date for all committees on this measure.",
        });
      } else if (committees.length > 0) {
        const t = Number(targets["top_contributors"]);
        const have2 = donorsThrough(ds, committees, cutoff);
        if (have2 < t) {
          push({
            kind: "contributions",
            subject: agendaRef,
            file: "relationships/contribution/",
            put: "relationship",
            detail: `Record top contributors to ${committees.join(", ")} through ${cutoff} (${have2}/${t}).`,
          });
        }
      }
      if (ieCount(ds, agendaRef, cycle) === 0) {
        push({
          kind: "independent_expenditures",
          subject: agendaRef,
          file: "relationships/independent_expenditure/",
          put: "relationship",
          detail: `Record major independent expenditures on ${agendaRef}.`,
        });
      }
    }
  }
  attachLeads(ds, tasks);
  return tasks;
}

/** The leads topic a task answers: profile.<field>, the question/measure ref, or the task kind. */
function leadTopic(t: Task): string {
  if (t.kind === "profile") return `profile.${t.item}`;
  if (t.kind === "position") return String(t.item);
  if (t.kind === "dossier") return `dossier.${t.item}`;
  return t.kind;
}

function attachLeads(ds: Dataset, tasks: Task[]): void {
  for (const t of tasks) {
    const file = ds.leads.get(t.contest);
    if (!file || !t.subject) continue;
    const topic = leadTopic(t);
    const texts = ((file["items"] as Rec[]) ?? [])
      .filter((l) => l["person"] === t.subject && l["topic"] === topic)
      .map((l) => (l["label"] ? `${String(l["label"])}: ${String(l["text"])}` : String(l["text"])));
    if (texts.length) t.leads = texts;
  }
}

// ---------------------------------------------------------------------------
// Coverage / parity
// ---------------------------------------------------------------------------

export interface CoverageRow {
  label: string;
  cells: string[];
  asymmetric: boolean;
}

export interface Coverage {
  contest: string;
  candidates: string[];
  rows: CoverageRow[];
}

const MISSING = "—";

export function coverage(ds: Dataset, contestRef: string): Coverage {
  const ref = contestRef.startsWith("contest:") ? contestRef : `contest:${contestRef}`;
  const agenda = ds.agendas.get(ref);
  if (!agenda) throw new Error(`No agenda for ${ref}`);
  if (agenda["kind"] !== "office") throw new Error("Coverage compares candidates; use it on office contests.");
  const candidates = (agenda["candidates"] as Rec[]).map((c) => String(c["person"]));
  const cycle = cycleOf(ref);
  const targets = agenda["targets"] as Rec;
  const cutoff = (targets["finance_cutoff"] as string | null) ?? null;
  const exhausted = new Set(((agenda["exhausted"] as Rec[] | undefined) ?? []).map((e) => String(e["task"])));
  const contestId = slugOf(ref);
  /** A missing cell whose task was closed as exhausted is a recorded gap, not a hole. */
  const orExhausted = (cell: string, kind: TaskKind, person: string) =>
    cell === MISSING && exhausted.has(taskId(contestId, kind, person)) ? "exhausted" : cell;
  const rows: CoverageRow[] = [];

  const presenceRow = (label: string, cells: string[]) =>
    rows.push({ label, cells, asymmetric: cells.some((c) => c === MISSING) && cells.some((c) => c !== MISSING) });
  const countRow = (label: string, values: number[], target: number, kind: TaskKind) => {
    const done = candidates.map((c, i) => values[i]! >= target || exhausted.has(taskId(contestId, kind, c)));
    rows.push({
      label,
      cells: values.map((v, i) => `${v}/${target}${values[i]! < target && done[i] ? " exhausted" : ""}`),
      // Flag when one candidate is finished and another is not, or when neither
      // is finished but they have been researched to different depths.
      asymmetric:
        (done.some((d) => d) && done.some((d) => !d)) ||
        (!done.some((d) => d) && Math.max(...values) !== Math.min(...values)),
    });
  };

  for (const field of PROFILE_FIELDS) {
    presenceRow(
      `profile.${field}`,
      candidates.map((c) => {
        const v = ((ds.people.get(slugOf(c))?.["candidate_profile"] as Rec | undefined) ?? {})[field] as Rec | undefined;
        if (!v) return MISSING;
        if (v["status"] === "not_found") return "not_found";
        if (Array.isArray(v["items"])) return (v["items"] as unknown[]).length ? `${(v["items"] as unknown[]).length} cited` : "none_found";
        return "cited";
      }),
    );
  }
  for (const subject of [...(agenda["questions"] as string[]), ...(agenda["measures"] as string[])]) {
    presenceRow(
      subject,
      candidates.map((c) => String(hasPosition(ds, c, subject)?.["stance"] ?? MISSING)),
    );
  }
  presenceRow(
    "legislation",
    candidates.map((c) => {
      const n = legislationCount(ds, c);
      return orExhausted(n ? `${n} cited` : MISSING, "legislation", c);
    }),
  );
  for (const section of DOSSIER_SECTIONS) {
    presenceRow(
      `dossier.${section}`,
      candidates.map((c) => {
        const sec = ds.dossiers.get(c)?.[section] as Rec | undefined;
        if (!sec) return MISSING;
        const n = (sec["items"] as unknown[]).length;
        return n ? `${n} cited` : "none_found";
      }),
    );
  }
  countRow(
    "endorsements",
    candidates.map((c) => endorsementCount(ds, c, cycle)),
    Number(targets["endorsements_per_candidate"]),
    "endorsements",
  );
  presenceRow(
    "committees",
    candidates.map((c) => {
      const n = candidateCommittees(ds, c, ref).length;
      return orExhausted(n ? String(n) : MISSING, "committee", c);
    }),
  );
  if (cutoff) {
    countRow(
      `contributors through ${cutoff}`,
      candidates.map((c) => donorsThrough(ds, candidateCommittees(ds, c, ref), cutoff)),
      Number(targets["top_contributors"]),
      "contributions",
    );
  } else {
    rows.push({ label: "finance_cutoff", cells: candidates.map(() => "not chosen"), asymmetric: false });
  }
  presenceRow(
    "independent_expenditures",
    candidates.map((c) => {
      const n = ieCount(ds, c, cycle);
      return orExhausted(n ? String(n) : MISSING, "independent_expenditures", c);
    }),
  );
  return { contest: ref, candidates, rows };
}
