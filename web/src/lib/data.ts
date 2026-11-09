import type { Bundle } from "../../../src/bundle";
import type { Coverage, Task } from "../../../src/research";
import type { CandidateRollup } from "../../../src/rollup";
import type { OfficeType } from "./icons";
import { titleFromSlug } from "./labels";
import { STATE_NAMES } from "./stateView";
export { titleFromSlug };

export type { Bundle, Coverage, Task, CandidateRollup };

/**
 * The draft's on-demand parts (web/vite.config.ts): each part's file path until it is loaded (then the key is gone),
 * and the counts the page needs before that.
 */
export interface Lazy {
  tasks?: string;
  leads?: string;
  /** People's full records, organizations, positions, relationships, sources, dossiers, bills, rollups. */
  records?: string;
  openTasks: Record<string, number>;
  openTaskTotal: number;
  leadCounts: Record<string, number>;
  problemCounts: Record<string, number>;
  counts: { people: number; sources: number; citations: number };
}
export type LazyPart = "tasks" | "leads" | "records";
// Records are schema-validated JSON; the UI reads them loosely.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Rec = Record<string, any>;

export interface Citation {
  source: string;
  quote?: string;
  locator?: string;
  verified_by?: { by: string; date: string; note?: string };
  unverified?: { by: string; method: string; date: string };
}
export interface SearchEntry {
  where: string;
  query: string;
  date: string;
}
export interface Lead {
  person: string;
  topic: string;
  label?: string;
  text: string;
  hint?: "support" | "oppose" | "mixed";
}

export const STATES: Record<string, string> = STATE_NAMES;

/** Two-letter state code of a contest ref or slug (from its election id, e.g. 2026-nv-general -> "nv"). */
export function stateOf(ref: string): string {
  const election = slugOf(ref).split("/")[0] ?? "";
  return election.split("-")[1] ?? "";
}

/** Local-government prefixes in contest slugs (San Francisco; Clark County, Las Vegas and its school district). */
const LOCAL_PREFIX = /^(sf|clark-county|las-vegas|ccsd)-/;

export function slugOf(ref: string): string {
  return ref.slice(ref.indexOf(":") + 1);
}

/** Offices named by their numbered district in lists (see Index.listTitle). */
const DISTRICT_SHORT = /^(us-house-[a-z]{2}-\d+|board-of-equalization-\d+|state-assembly-\d+|assembly-\d+|state-senate-\d+)$/;

/** Statewide offices in California ballot order; others sort after them alphabetically. */
const STATEWIDE_ORDER = [
  "governor",
  "lieutenant-governor",
  "secretary-of-state",
  "controller",
  "treasurer",
  "attorney-general",
  "insurance-commissioner",
  "superintendent-of-public-instruction",
];

/** Contest index group + a sort key (numeric district order: CA-2 before CA-10). */
export function officeOf(contestRef: string, kind: "office" | "measure"): { type: OfficeType; sort: [number, string] } {
  const s = slugOf(contestRef).split("/").pop() ?? "";
  const num = (m: RegExpExecArray | null) => (m ? Number(m[m.length - 1]) : 0);
  if (/^[a-z]+-prop-[a-z0-9]+$/.test(s) || /^(clark-county|las-vegas)-question-\d+$/.test(s)) return { type: "local_measure", sort: [num(/-(\d+)$/.exec(s)), s] };
  if (kind === "measure" || /^prop-\d+$/.test(s) || /^question-\d+$/.test(s)) return { type: "measure", sort: [num(/^(?:prop|question)-(\d+)$/.exec(s)), s] };
  // Judges (Nevada): supreme court, court of appeals, district court (then its family division), municipal court; numeric and letter order.
  const court = /^(supreme-court-seat|court-of-appeals-dept|district-court-dept|district-court-family-dept|las-vegas-municipal-court-dept)-([a-z0-9]+)$/.exec(s);
  if (court) {
    const rank = ["supreme-court-seat", "court-of-appeals-dept", "district-court-dept", "district-court-family-dept", "las-vegas-municipal-court-dept"].indexOf(court[1]!);
    const n = /^\d+$/.test(court[2]!) ? Number(court[2]) : court[2]!.charCodeAt(0) - 96;
    return { type: "courts", sort: [rank * 1000 + n, s] };
  }
  if (LOCAL_PREFIX.test(s)) return { type: "local", sort: [num(/-(\d+)$/.exec(s)), s] };
  if (/^us-house-[a-z]{2}-\d+$/.test(s)) return { type: "house", sort: [num(/-(\d+)$/.exec(s)), s] };
  if (/^board-of-equalization-\d+$/.test(s)) return { type: "boe", sort: [num(/-(\d+)$/.exec(s)), s] };
  if (/^(state-senate|state-assembly|assembly|senate)-\d+$/.test(s)) return { type: "legislature", sort: [num(/-(\d+)$/.exec(s)), s] };
  const i = STATEWIDE_ORDER.indexOf(s);
  if (i >= 0) return { type: "statewide", sort: [i, s] };
  if (!/\d/.test(s)) return { type: "statewide", sort: [STATEWIDE_ORDER.length, s] };
  return { type: "other", sort: [0, s] };
}

export function electionFromSlug(slug: string): string {
  const [year, st, ...type] = slug.split("-");
  return `${year} ${STATES[st ?? ""] ?? (st ?? "").toUpperCase()} ${type.join(" ")} election`;
}

/** Route name for a contest ref: contest:2026-ca-general/governor -> c-2026-ca-general--governor */
export function contestRoute(ref: string): string {
  return `c-${slugOf(ref).replace("/", "--")}`;
}

export class Index {
  readonly b: Bundle & { lazy?: Lazy };
  readonly people = new Map<string, Rec>();
  readonly orgs = new Map<string, Rec>();
  readonly offices = new Map<string, Rec>();
  readonly budgets = new Map<string, Rec>();
  readonly contests = new Map<string, Rec>();
  readonly elections = new Map<string, Rec>();
  readonly sources = new Map<string, Rec>();
  readonly questions = new Map<string, { q: Rec; issue: Rec }>();
  readonly agendas = new Map<string, Rec>();
  readonly leads = new Map<string, Lead[]>();
  readonly leadsMeta = new Map<string, Rec>();
  readonly positions = new Map<string, Rec[]>();
  private citedByCache: Map<string, number> | null = null;

  constructor(b: Bundle & { lazy?: Lazy }) {
    this.b = b;
    for (const r of b.people) this.people.set(`person:${r["id"]}`, r);
    for (const r of b.organizations) this.orgs.set(`org:${r["id"]}`, r);
    for (const r of b.offices ?? []) this.offices.set(`office:${r["id"]}`, r);
    for (const r of (b as { budgets?: Rec[] }).budgets ?? []) this.budgets.set(String(r["id"]), r);
    for (const r of b.contests) this.contests.set(`contest:${r["id"]}`, r);
    for (const r of b.elections) this.elections.set(`election:${r["id"]}`, r);
    for (const r of b.sources) this.sources.set(`src:${r["id"]}`, r);
    for (const issue of b.issues) {
      for (const q of issue["questions"] as Rec[]) this.questions.set(`q:${issue["id"]}/${q["id"]}`, { q, issue });
    }
    for (const a of b.agendas) this.agendas.set(String(a["contest"]), a);
    for (const l of b.leads) {
      this.leads.set(String(l["contest"]), l["items"] as Lead[]);
      this.leadsMeta.set(String(l["contest"]), l["provided"] as Rec);
    }
    for (const p of b.positions) this.positions.set(String(p["actor"]), p["positions"] as Rec[]);
  }

  /** Citations per source (every "source" key in these records), counted on first use: only Sources and the counts need it. */
  get citedBy(): Map<string, number> {
    if (this.citedByCache) return this.citedByCache;
    const m = new Map<string, number>();
    const count = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(count);
      else if (v && typeof v === "object") {
        for (const [k, c] of Object.entries(v as Rec)) {
          if (k === "source" && typeof c === "string") m.set(c, (m.get(c) ?? 0) + 1);
          else count(c);
        }
      }
    };
    count([this.b.people, this.b.organizations, this.b.contests, this.b.elections, this.b.positions, this.b.relationships]);
    return (this.citedByCache = m);
  }

  get rels(): Rec[] {
    return this.b.relationships;
  }

  name(ref: string | undefined | null): string {
    if (!ref) return "";
    if (ref.startsWith("person:")) return this.people.get(ref)?.["name"] ?? this.agendaName(ref) ?? slugOf(ref);
    if (ref.startsWith("org:")) return this.orgs.get(ref)?.["name"] ?? slugOf(ref);
    if (ref.startsWith("contest:")) return this.contestTitle(ref);
    if (ref.startsWith("q:")) return this.questions.get(ref)?.q["text"] ?? ref;
    return ref;
  }

  private agendaName(ref: string): string | undefined {
    for (const a of this.agendas.values()) {
      const c = (a["candidates"] as Rec[]).find((x) => x["person"] === ref);
      if (c) return String(c["name"]);
    }
    return undefined;
  }

  contestTitle(ref: string): string {
    return this.contests.get(ref)?.["name"] ?? titleFromSlug(slugOf(ref));
  }

  /**
   * The name in lists (the Overview, the header, Issues, the research queue). Numbered-district offices use their short
   * district form ("U.S. House, CA-11"), so a list reads in one style whether or not the contest's official record
   * exists yet ("United States Representative, District 11"). Other contests keep their official name. The contest
   * page shows the official name.
   */
  listTitle(ref: string): string {
    const slug = slugOf(ref);
    return DISTRICT_SHORT.test(slug.split("/").pop() ?? "") ? titleFromSlug(slug) : this.contestTitle(ref);
  }

  electionOf(ref: string): string {
    const slug = slugOf(ref).split("/")[0]!;
    return this.elections.get(`election:${slug}`)?.["name"] ?? electionFromSlug(slug);
  }

  /** Contests to show: researched agendas first (in order), then other verified contests. */
  contestRefs(): string[] {
    const refs = [...this.agendas.keys()];
    for (const ref of this.contests.keys()) if (!refs.includes(ref)) refs.push(ref);
    return refs;
  }

  /**
   * Local (non-state) ballot measures with records, grouped by jurisdiction,
   * each with the budget record for that jurisdiction if there is one.
   */
  localMeasureGroups(): Array<{ jurisdiction: string; refs: string[]; budget: Rec | null }> {
    const groups = new Map<string, string[]>();
    for (const [ref, c] of this.contests) {
      const j = c["jurisdiction"] as Rec | undefined;
      if (c["kind"] !== "measure" || !j || j["level"] === "state") continue;
      const name = String(j["name"]);
      groups.set(name, [...(groups.get(name) ?? []), ref]);
    }
    const num = (ref: string) => String(this.contests.get(ref)?.["number"] ?? "");
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([jurisdiction, refs]) => ({
        jurisdiction,
        refs: refs.sort((a, b) => num(a).localeCompare(num(b), "en", { numeric: true }) || a.localeCompare(b)),
        budget: [...this.budgets.values()].find((bu) => bu["jurisdiction"] === jurisdiction) ?? null,
      }));
  }

  /**
   * The ballots "Try your ballot" offers: each local jurisdiction's measures with
   * its budget (as localMeasureGroups), then California's statewide propositions
   * with the state budget, then Nevada's ballot questions (no Nevada budget is recorded, so they show
   * their official fiscal notes only). Local groups come first, so San Francisco stays the default.
   */
  trialGroups(): Array<{ jurisdiction: string; level: "local" | "state"; refs: string[]; budget: Rec | null }> {
    const groups: Array<{ jurisdiction: string; level: "local" | "state"; refs: string[]; budget: Rec | null }> = this.localMeasureGroups().map((g) => ({
      ...g,
      level: "local" as const,
    }));
    for (const [st, fallback] of [
      ["ca", "State of California"],
      ["nv", "State of Nevada"],
    ] as const) {
      const state = this.stateMeasures(st);
      if (!state.length) continue;
      const name = String((this.contests.get(state[0]!)?.["jurisdiction"] as Rec | undefined)?.["name"] ?? fallback);
      groups.push({ jurisdiction: name, level: "state", refs: state, budget: [...this.budgets.values()].find((b) => b["jurisdiction"] === name) ?? null });
    }
    return groups;
  }

  /** Statewide propositions with records for one state's election ("ca"), in number order. */
  stateMeasures(state = "ca"): string[] {
    const num = (ref: string) => Number(String(this.contests.get(ref)?.["number"] ?? "").replace(/\D/g, "")) || 0;
    return [...this.contests.entries()]
      .filter(([ref, c]) => c["kind"] === "measure" && stateOf(ref) === state && ((c["jurisdiction"] as Rec | undefined)?.["level"] === "state" || /^prop-\d+$/.test(slugOf(ref).split("/").pop() ?? "")))
      .map(([ref]) => ref)
      .sort((a, b) => num(a) - num(b) || a.localeCompare(b));
  }

  /** The adopted budget recorded for a local measure's jurisdiction (what its dollars are compared with), if any. */
  budgetFor(ref: string): Rec | null {
    const name = (this.contests.get(ref)?.["jurisdiction"] as Rec | undefined)?.["name"];
    return name ? ([...this.budgets.values()].find((b) => b["jurisdiction"] === name) ?? null) : null;
  }

  kindOf(ref: string): "office" | "measure" {
    return (this.contests.get(ref)?.["kind"] ??
      this.agendas.get(ref)?.["kind"] ??
      (/(?:\/|-)prop-[a-z0-9]+$/.test(slugOf(ref)) ? "measure" : "office")) as
      | "office"
      | "measure";
  }

  candidatesOf(ref: string): string[] {
    const a = this.agendas.get(ref);
    if (a) return (a["candidates"] as Rec[]).map((c) => String(c["person"]));
    return ((this.contests.get(ref)?.["candidates"] as Rec[] | undefined) ?? []).map((c) => String(c["person"]));
  }

  ballotEntry(contestRef: string, person: string): Rec | undefined {
    return ((this.contests.get(contestRef)?.["candidates"] as Rec[] | undefined) ?? []).find((c) => c["person"] === person);
  }

  history(actor: string, subject: string): Rec[] {
    return (this.positions.get(actor) ?? [])
      .filter((p) => p["subject"] === subject)
      .sort((a, b) => (a["as_of"] < b["as_of"] ? 1 : -1));
  }

  latest(actor: string, subject: string): Rec | undefined {
    return this.history(actor, subject)[0];
  }

  leadsFor(contestRef: string, person: string, topic: string): Lead[] {
    return (this.leads.get(contestRef) ?? []).filter((l) => l.person === person && l.topic === topic);
  }

  ofType(type: string): Rec[] {
    return this.rels.filter((r) => r["type"] === type);
  }

  endorsementsOf(ref: string): Rec[] {
    return this.ofType("endorsement").filter((r) => r["endorsee"] === ref);
  }

  committeeRoles(subject: string): Rec[] {
    return this.ofType("committee_role").filter((r) => r["subject"] === subject);
  }

  /** Whether an on-demand part is here (always, for a dataset without on-demand parts). */
  ready(part: LazyPart): boolean {
    return !this.b.lazy?.[part];
  }

  /** Open (unblocked) research tasks for a contest; counted ahead of time while the task list isn't loaded. */
  openTaskCount(contestRef: string): number {
    return this.ready("tasks") ? this.tasksFor(contestRef).filter((t) => !t.blocked_by).length : (this.b.lazy!.openTasks[contestRef] ?? 0);
  }

  openTaskTotal(): number {
    return this.ready("tasks") ? this.b.tasks.filter((t) => !t.blocked_by).length : this.b.lazy!.openTaskTotal;
  }

  /** Unverified leads for a contest; counted ahead of time while the leads aren't loaded. */
  leadCount(contestRef: string): number {
    return this.ready("leads") ? (this.leads.get(contestRef)?.length ?? 0) : (this.b.lazy!.leadCounts[contestRef] ?? 0);
  }

  /** Validation problems by rule code (the page carries only these counts for the draft). */
  problemCounts(): Record<string, number> {
    if (this.b.lazy) return this.b.lazy.problemCounts;
    return this.b.validation.problems.reduce<Record<string, number>>((acc, p) => ((acc[p.code] = (acc[p.code] ?? 0) + 1), acc), {});
  }

  tasksFor(contestRef: string): Task[] {
    return this.b.tasks.filter((t) => t.contest === contestRef);
  }

  /** Researched share of a contest's parity matrix (cells that are not missing). */
  progress(contestRef: string): { done: number; total: number } {
    const cov = this.b.coverage[contestRef];
    if (!cov) return { done: 0, total: 0 };
    let done = 0;
    let total = 0;
    for (const row of cov.rows) {
      for (const cell of row.cells) {
        total++;
        const m = /^(\d+)\/(\d+)/.exec(cell);
        if (m) done += Number(m[1]) >= Number(m[2]) || cell.includes("exhausted") ? 1 : 0;
        else if (cell !== "—" && cell !== "not chosen") done++;
      }
    }
    return { done, total };
  }

  /** People and sources in the dataset (counted ahead of time while the records aren't loaded). */
  peopleCount(): number {
    return this.ready("records") ? this.people.size : this.b.lazy!.counts.people;
  }

  sourceCount(): number {
    return this.ready("records") ? this.sources.size : this.b.lazy!.counts.sources;
  }

  claimCount(): number {
    if (!this.ready("records")) return this.b.lazy!.counts.citations;
    let n = 0;
    for (const v of this.citedBy.values()) n += v;
    return n;
  }
}
