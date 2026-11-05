/**
 * Promise tracker: what a contest's winner has done on each campaign promise,
 * from official records only (dossier promise items, `tracking`).
 *
 * A promise's status is its latest update's (by date, then id). Without any
 * tracking it is "Not checked yet" (the placeholder); a tracking record with a
 * search log and no updates is "No action found". The labels describe what the
 * record shows; they never grade the official (no green/red, no kept/broken).
 *
 * No imports, so tests (NodeNext resolution) can typecheck it.
 */
type Rec = Record<string, unknown>;
type Cite = { source: string; quote?: string; locator?: string };

export type PromiseStatus = "not_checked" | "none_found" | "in_progress" | "partly_done" | "done" | "stalled" | "changed";

/** Display order: unchecked first, then by how far the record goes, then the two ends that stop or change it. */
export const STATUS_ORDER: PromiseStatus[] = ["not_checked", "none_found", "in_progress", "partly_done", "done", "stalled", "changed"];

export const STATUS_LABEL: Record<PromiseStatus, string> = {
  not_checked: "Not checked yet",
  none_found: "No action found",
  in_progress: "In progress",
  partly_done: "Partly done",
  done: "Done",
  stalled: "Stalled",
  changed: "Changed by the official",
};

/** What each status means, as the research guide defines it. */
export const STATUS_MEANS: Record<PromiseStatus, string> = {
  not_checked: "Nobody has checked the official record yet.",
  none_found: "The official record was searched and shows no action yet (the search log says where).",
  in_progress: "An official step toward it is documented: introduced, heard, funding requested, staff directed.",
  partly_done: "Part of what the promise names was adopted or carried out; the update says which part.",
  done: "What the promise names was adopted or carried out.",
  stalled: "A documented step failed or stopped: a vote failed, a veto, withdrawn or tabled.",
  changed: "The office-holder revised or dropped it, in their own quoted words.",
};

export interface Update {
  id: string;
  date: string;
  status: PromiseStatus;
  summary: string;
  citations: Cite[];
}
export interface SearchStep {
  where: string;
  query: string;
  date: string;
}
export interface TrackedPromise {
  id: string;
  title: string;
  summary: string;
  topic?: string;
  citations: Cite[];
  status: PromiseStatus;
  /** Updates in date order (oldest first). */
  updates: Update[];
  checked?: string;
  searchLog: SearchStep[];
}

const UPDATE_STATUSES = new Set<string>(["in_progress", "partly_done", "done", "stalled", "changed"]);

export function updatesOf(item: Rec): Update[] {
  const t = item["tracking"] as Rec | undefined;
  return (((t?.["updates"] as Rec[] | undefined) ?? []) as Rec[])
    .filter((u) => UPDATE_STATUSES.has(String(u["status"])))
    .map((u) => ({
      id: String(u["id"]),
      date: String(u["date"]),
      status: String(u["status"]) as PromiseStatus,
      summary: String(u["summary"] ?? ""),
      citations: (u["citations"] as Cite[] | undefined) ?? [],
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function statusOf(item: Rec): PromiseStatus {
  if (!item["tracking"]) return "not_checked";
  const u = updatesOf(item);
  return u.length ? u[u.length - 1]!.status : "none_found";
}

/** A person's campaign promises with their tracking status, in the dossier's order. */
export function trackedPromises(dossier: Rec | undefined): TrackedPromise[] {
  const items = ((dossier?.["promises"] as Rec | undefined)?.["items"] as Rec[] | undefined) ?? [];
  return items.map((it) => {
    const t = it["tracking"] as Rec | undefined;
    return {
      id: String(it["id"]),
      title: String(it["title"] ?? ""),
      summary: String(it["summary"] ?? ""),
      ...(typeof it["topic"] === "string" ? { topic: it["topic"] } : {}),
      citations: (it["citations"] as Cite[] | undefined) ?? [],
      status: statusOf(it),
      updates: updatesOf(it),
      ...(typeof t?.["as_of"] === "string" ? { checked: t["as_of"] } : {}),
      searchLog: ((t?.["search_log"] as SearchStep[] | undefined) ?? []).map((s) => ({ where: s.where, query: s.query, date: s.date })),
    };
  });
}

/** Non-zero status counts in display order. */
export function statusCounts(ps: TrackedPromise[]): Array<[PromiseStatus, number]> {
  return STATUS_ORDER.map((s) => [s, ps.filter((p) => p.status === s).length] as [PromiseStatus, number]).filter(([, n]) => n > 0);
}
