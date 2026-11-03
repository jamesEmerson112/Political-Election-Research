import type { Citation, Index, Lead, Rec } from "./data";
import { date, STANCE_LABEL } from "./format";
import { openDetail, type Detail } from "./ui.svelte";

export function isNotFound(v: unknown): boolean {
  return !!v && typeof v === "object" && (v as Rec)["status"] === "not_found";
}

/** Age in whole years on a date, from a YYYY / YYYY-MM / YYYY-MM-DD birth date. */
export function age(birth: string | undefined, on: string): string | null {
  if (!birth) return null;
  const [by, bm, bd] = birth.split("-").map(Number);
  const [y, m, d] = on.split("-").map(Number);
  if (!by || !y) return null;
  if (!bm || !bd) return `about ${y - by}`;
  let a = y - by;
  if ((m ?? 0) < bm || ((m ?? 0) === bm && (d ?? 0) < bd)) a--;
  return String(a);
}

export function yearsSince(start: string | undefined, on: string): string | null {
  if (!start) return null;
  const n = Number(on.slice(0, 4)) - Number(start.slice(0, 4));
  return n <= 0 ? "less than a year" : `${n} year${n === 1 ? "" : "s"}`;
}

export function openField(title: string, kicker: string, v: Rec | undefined, leads: Lead[] = []): void {
  const d: Detail = { kicker, title };
  if (v && isNotFound(v)) {
    d.text = `Not found as of ${date(v["as_of"])}.`;
    d.searchLog = v["search_log"];
  } else if (v) {
    if (typeof v["value"] === "string") d.text = v["value"];
    d.citations = v["citations"] as Citation[];
    if (Array.isArray(v["items"]) && v["items"].length === 0) {
      d.text = `None found as of ${date(v["as_of"])}.`;
      d.searchLog = v["search_log"];
    }
  } else {
    d.text = "Not researched yet.";
  }
  if (leads.length) d.leads = leads;
  openDetail(d);
}

export function openItems(title: string, kicker: string, items: Rec[], line: (r: Rec) => string): void {
  openDetail({
    kicker,
    title,
    history: items.map((r) => ({ label: line(r), text: String(r["summary"] ?? ""), citations: (r["citations"] as Citation[]) ?? [] })),
  });
}

export function openPosition(ix: Index, actor: string, subject: string, contestRef: string): void {
  const hist = ix.history(actor, subject);
  const cur = hist[0];
  const q = ix.questions.get(subject);
  const leads = ix.leadsFor(contestRef, actor, subject);
  const facts: Array<[string, string]> = [];
  if (q) {
    facts.push(["Supports means", String(q.q["support_means"])]);
    facts.push(["Opposes means", String(q.q["oppose_means"])]);
  }
  if (cur) {
    const labels = new Map(((q?.q["facets"] as Rec[] | undefined) ?? []).map((f) => [String(f["id"]), String(f["label"])]));
    for (const pt of (cur["points"] as Rec[] | undefined) ?? []) facts.push([labels.get(String(pt["facet"])) ?? String(pt["facet"]), String(pt["text"])]);
    if (cur["evidence_type"]) facts.push(["Evidence", String(cur["evidence_type"]).replace(/_/g, " ")]);
    if (cur["bill"]) facts.push(["Bill", String(cur["bill"]).toUpperCase()]);
    facts.push(["As of", date(cur["as_of"])]);
  }
  openDetail({
    kicker: `${ix.name(actor)} · ${cur ? STANCE_LABEL[cur["stance"]] : "Not researched"}`,
    title: q ? String(q.q["text"]) : ix.name(subject),
    text: cur ? String(cur["summary"] ?? "") : leads.length ? "No cited stance yet. Leads below are unverified." : "Not researched yet.",
    facts,
    citations: cur?.["citations"],
    searchLog: cur?.["search_log"],
    leads,
    history: hist.slice(1).map((h) => ({
      label: `${STANCE_LABEL[h["stance"]] ?? h["stance"]} · as of ${date(h["as_of"])}`,
      text: String(h["summary"] ?? ""),
      citations: (h["citations"] as Citation[]) ?? [],
    })),
  });
}

export function openRel(ix: Index, r: Rec, title: string, facts: Array<[string, string]> = []): void {
  openDetail({ kicker: String(r["type"]).replace(/_/g, " "), title, facts, citations: r["citations"] as Citation[] });
}

export function openLeads(title: string, leads: Lead[]): void {
  openDetail({ kicker: "Unverified", title, leads });
}
