import type { Bundle } from "../../../src/bundle";
import type { Coverage, Task } from "../../../src/research";
import type { CandidateRollup } from "../../../src/rollup";
import type { OfficeType } from "./icons";

export type { Bundle, Coverage, Task, CandidateRollup };
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

const STATES: Record<string, string> = { ca: "California" };

export function slugOf(ref: string): string {
  return ref.slice(ref.indexOf(":") + 1);
}

/** Short place names for local contest slug prefixes. */
const LOCAL_PLACE: Record<string, string> = { sf: "SF" };

/** Readable title for a contest slug that has no verified record yet. */
export function titleFromSlug(contestSlug: string): string {
  const s = contestSlug.split("/").pop() ?? contestSlug;
  const house = /^us-house-([a-z]{2})-(\d+)$/.exec(s);
  if (house) return `U.S. House, ${house[1]!.toUpperCase()}-${house[2]}`;
  const boe = /^board-of-equalization-(\d+)$/.exec(s);
  if (boe) return `Board of Equalization, District ${boe[1]}`;
  const prop = /^prop-(\d+)$/.exec(s);
  if (prop) return `Proposition ${prop[1]}`;
  const local = /^([a-z]+)-prop-([a-z0-9]+)$/.exec(s);
  if (local) return `${LOCAL_PLACE[local[1]!] ?? local[1]!.charAt(0).toUpperCase() + local[1]!.slice(1)} Prop ${local[2]!.toUpperCase()}`;
  const sup = /^sf-supervisor-district-(\d+)$/.exec(s);
  if (sup) return `SF Supervisor, District ${sup[1]}`;
  if (s.startsWith("sf-")) return `SF ${titleFromSlug(s.slice(3))}`;
  const small = new Set(["of", "and", "for", "the", "on"]);
  return s
    .split("-")
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

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
  if (/^[a-z]+-prop-[a-z0-9]+$/.test(s)) return { type: "local_measure", sort: [0, s] };
  if (kind === "measure" || /^prop-\d+$/.test(s)) return { type: "measure", sort: [num(/^prop-(\d+)$/.exec(s)), s] };
  if (s.startsWith("sf-")) return { type: "local", sort: [num(/-(\d+)$/.exec(s)), s] };
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
  readonly b: Bundle;
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
  readonly citedBy = new Map<string, number>();

  constructor(b: Bundle) {
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
    const count = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(count);
      else if (v && typeof v === "object") {
        for (const [k, c] of Object.entries(v as Rec)) {
          if (k === "source" && typeof c === "string") this.citedBy.set(c, (this.citedBy.get(c) ?? 0) + 1);
          else count(c);
        }
      }
    };
    count([b.people, b.organizations, b.contests, b.elections, b.positions, b.relationships]);
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

  claimCount(): number {
    let n = 0;
    for (const v of this.citedBy.values()) n += v;
    return n;
  }
}
