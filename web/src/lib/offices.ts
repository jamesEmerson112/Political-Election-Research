/**
 * Office scope: neutral, measurable facts about a government position
 * (level, seats, residents per seat, budget, term, powers, salary) and its
 * connections (who elects it, what it elects, appoints, confirms, oversees,
 * which bodies advise it). Describes scope; never ranks offices.
 */
import type { Citation, Index, Rec } from "./data";
import { compact, money } from "./format";
import { allUnverified } from "./officeChips";
import { openDetail } from "./ui.svelte";

const LEVEL: Record<string, string> = { local: "Local", county: "County", state: "State", federal: "Federal" };

/** Connection type -> label in the drawer. */
export const CONNECTION_LABEL: Record<string, string> = {
  elected_by: "Elected by",
  elects: "Elects",
  appoints: "Appoints",
  confirms: "Confirms",
  oversees: "Oversees",
  advised_by: "Advised by",
};

export interface Scope {
  ref: string;
  name: string;
  level: string;
  /** "1 of 11 seats" or "Single office". */
  seatText: string | null;
  residents: number | null;
  /** One-line headline: "Local · 1 of 11 seats · ~79k residents". */
  headline: string;
  unverified: boolean;
}

const cites = (v: unknown): Citation[] => ((v as Rec | undefined)?.["citations"] as Citation[] | undefined) ?? [];

export function scopeOf(ix: Index, ref: string | undefined): Scope | null {
  if (!ref) return null;
  const o = ix.offices.get(ref);
  if (!o) return null;
  const seats = o["seats"]?.["value"] as number | undefined;
  const residents = (o["constituents"]?.["value"] as number | undefined) ?? null;
  const seatText = seats === undefined ? null : seats === 1 ? "Single office" : `1 of ${seats} seats`;
  const parts = [LEVEL[o["level"]] ?? o["level"], seatText, residents ? `~${compact(residents)} residents` : null].filter(Boolean);
  const all = ["seats", "constituents", "term_years", "term_limit", "powers", "budget", "salary"].flatMap((k) => cites(o[k]));
  return {
    ref,
    name: String(o["name"]),
    level: LEVEL[o["level"]] ?? String(o["level"]),
    seatText,
    residents,
    headline: parts.join(" · "),
    unverified: all.some((c) => c.unverified) || all.length === 0,
  };
}

/** Plain lines for the expanded cell and the drawer. */
export function scopeLines(ix: Index, ref: string): Array<{ label: string; text: string; citations: Citation[] }> {
  const o = ix.offices.get(ref);
  if (!o) return [];
  const out: Array<{ label: string; text: string; citations: Citation[] }> = [];
  const add = (label: string, k: string, fmt: (v: Rec) => string) => {
    if (o[k]) out.push({ label, text: fmt(o[k] as Rec), citations: cites(o[k]) });
  };
  add("Body", "seats", (v) => `${o["body"] ?? o["name"]}: ${v["value"]} ${v["value"] === 1 ? "seat" : "seats"}`);
  add("Represents", "constituents", (v) => `~${Number(v["value"]).toLocaleString("en-US")} residents${v["basis"] ? ` (${v["basis"]})` : ""}`);
  add("Budget", "budget", (v) => `${money(Number(v["value"]) * 100)}${v["basis"] ? ` (${v["basis"]})` : ""}`);
  add("Term", "term_years", (v) => `${v["value"]} years`);
  add("Term limit", "term_limit", (v) => String(v["value"]));
  add("Powers", "powers", (v) => String(v["value"]));
  add("Salary", "salary", (v) => `${money(Number(v["value"]) * 100)} a year${v["as_of"] ? ` (${v["as_of"]})` : ""}`);
  return out;
}

export interface ConnectionLine {
  type: string;
  label: string;
  text: string;
  targets: string[];
  citations: Citation[];
  /** Backed only by unverified citations (search summaries, computed counts). */
  unverified: boolean;
}

/** The office's connections, in record (schema) order. */
export function connectionLines(ix: Index, ref: string): ConnectionLine[] {
  const o = ix.offices.get(ref);
  return ((o?.["connections"] as Rec[] | undefined) ?? []).map((c) => ({
    type: String(c["type"]),
    label: CONNECTION_LABEL[String(c["type"])] ?? String(c["type"]),
    text: String(c["text"]),
    targets: (c["targets"] as string[] | undefined) ?? [],
    citations: cites(c),
    unverified: allUnverified(cites(c) as unknown as Rec[]),
  }));
}

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** Legal basis, official site and CivLab page, for the drawer and the expanded cell. */
export function officeLinks(ix: Index, ref: string): Array<{ label: string; href: string; sub?: string }> {
  const o = ix.offices.get(ref);
  if (!o) return [];
  const out: Array<{ label: string; href: string; sub?: string }> = [];
  const lb = o["legal_basis"] as Rec | undefined;
  if (lb?.["url"]) out.push({ label: lb["label"] ? `Legal basis: ${lb["label"]}` : "Legal basis", href: String(lb["url"]), sub: host(String(lb["url"])) });
  const links = (o["links"] as Rec | undefined) ?? {};
  if (links["official_site"]) out.push({ label: "Official site", href: String(links["official_site"]), sub: host(String(links["official_site"])) });
  if (links["civlab"]) out.push({ label: "CivLab government graph", href: String(links["civlab"]), sub: "graph.civlab.org (secondary source)" });
  return out;
}

export function openOffice(ix: Index, ref: string, kicker = "Office scope"): void {
  const o = ix.offices.get(ref);
  if (!o) return;
  const lines = scopeLines(ix, ref);
  const conns = connectionLines(ix, ref);
  const civlab = !!(o["links"] as Rec | undefined)?.["civlab"];
  openDetail({
    kicker,
    title: String(o["name"]),
    text: `${LEVEL[o["level"]] ?? o["level"]} office · ${o["jurisdiction"]}`,
    facts: lines.map((l) => [l.label, l.text] as [string, string]),
    groups: conns.length
      ? {
          title: "Connections",
          items: conns.map((c) => ({ label: c.label, text: c.text, list: c.targets, citations: c.citations })),
        }
      : { title: "Connections", items: [{ label: "Not researched", text: "No connections recorded for this office yet.", citations: [] }] },
    links: officeLinks(ix, ref),
    citations: [...lines.flatMap((l) => l.citations), ...cites(o["legal_basis"])],
    note:
      "Scope, not rank: these numbers describe the office; they don't say which office matters more." +
      (civlab ? " CivLab is a secondary source: its counts stay unverified until checked against the charter or constitution it links." : ""),
  });
}
