/**
 * Office scope: neutral, measurable facts about a government position
 * (level, seats, residents per seat, budget, term, powers, salary).
 * Describes scope; never ranks offices.
 */
import type { Citation, Index, Rec } from "./data";
import { compact, money } from "./format";
import { openDetail } from "./ui.svelte";

const LEVEL: Record<string, string> = { local: "Local", county: "County", state: "State", federal: "Federal" };

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

export function openOffice(ix: Index, ref: string, kicker = "Office scope"): void {
  const o = ix.offices.get(ref);
  if (!o) return;
  const lines = scopeLines(ix, ref);
  openDetail({
    kicker,
    title: String(o["name"]),
    text: `${LEVEL[o["level"]] ?? o["level"]} office · ${o["jurisdiction"]}`,
    facts: lines.map((l) => [l.label, l.text] as [string, string]),
    citations: lines.flatMap((l) => l.citations),
    note: "Scope, not rank: these numbers describe the office; they don't say which office matters more.",
  });
}
