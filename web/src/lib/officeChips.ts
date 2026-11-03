/**
 * Office scope as a row of small chips (the Occupation category): what the
 * candidate is seeking, then the scope of the office they hold now, as
 * neutral counts and verbs. Describes scope; never ranks offices.
 *
 * Pure (no Svelte, no imports) so tests can run it on plain records. The
 * glyph for each `icon` key lives in icons.ts (CHIP_ICON).
 */

// Records are schema-validated JSON; read loosely here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = Record<string, any>;

export type ChipIcon = "seeking" | "seats" | "elected_by" | "appoints" | "confirms" | "budget" | "link" | "none";

export interface Chip {
  icon: ChipIcon;
  text: string;
  /** Every citation behind it was seen only indirectly (unverified). */
  lead?: boolean;
  /** External page (opens in a new tab). */
  href?: string;
  /** Placeholder for something not researched yet. */
  muted?: boolean;
  /** Longer text for the tooltip. */
  title?: string;
}

export interface ChipInput {
  /** The office the candidate holds now (data/offices record). */
  held: Rec;
  /** The candidate's offices_held item text, e.g. "San Francisco District 1 Supervisor". */
  heldText?: string;
  heldCitations?: Rec[];
  /** The office the contest elects (agenda or contest office_ref), if any. */
  seeking?: Rec | null;
}

const compactNum = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const compactUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
/** Whose budget a multi-seat body adopts, by level. Single offices just say "budget" (the basis explains). */
const BUDGET_NOUN: Record<string, string> = { local: "city", county: "county", state: "state", federal: "federal" };
const CHIP_MAX = 40;
/** Keeps short units together when a chip wraps ("District 11", "1 of 435"). */
const NB = "\u00a0";

const citesOf = (v: unknown): Rec[] => ((v as Rec | undefined)?.["citations"] as Rec[] | undefined) ?? [];
/** Unverified when nothing stronger than a search summary or computed count backs it. */
export const allUnverified = (cs: Rec[]): boolean => cs.length === 0 || cs.every((c) => !!c["unverified"] && !c["quote"] && !c["verified_by"]);
const valueOf = (o: Rec, k: string): number | undefined => (typeof o[k]?.["value"] === "number" ? (o[k]["value"] as number) : undefined);
const connection = (o: Rec, type: string): Rec | undefined => ((o["connections"] as Rec[] | undefined) ?? []).find((c) => c["type"] === type);

/** "U.S. Representative from California" -> "U.S. Representative". */
export function shortOfficeName(name: string): string {
  return name.replace(/\s+from\s+[A-Z][\w.' -]*$/, "");
}

/** "California State Senator, District 11" -> 11. */
export function districtOf(text: string | undefined): number | null {
  const m = /\bDistrict\s+(\d+)\b/i.exec(text ?? "");
  return m ? Number(m[1]) : null;
}

export function officeChips({ held, heldText, heldCitations = [], seeking }: ChipInput): Chip[] {
  const chips: Chip[] = [];

  if (seeking) {
    const n = valueOf(seeking, "seats");
    chips.push({
      icon: "seeking",
      text: `Seeking ${shortOfficeName(String(seeking["name"]))}${n && n > 1 ? ` · 1${NB}of${NB}${n}` : ""}`,
      lead: n !== undefined && allUnverified(citesOf(seeking["seats"])),
      title: String(seeking["name"]),
    });
  }

  const seats = valueOf(held, "seats");
  const residents = valueOf(held, "constituents");
  if (seats !== undefined || residents !== undefined) {
    const parts = [seats === undefined ? null : seats === 1 ? "Single office" : `1 of ${seats} seats`, residents ? `~${compactNum.format(residents)} residents` : null];
    chips.push({
      icon: "seats",
      text: parts.filter(Boolean).join(" · "),
      lead: allUnverified([...citesOf(held["seats"]), ...citesOf(held["constituents"])]),
      title: [held["body"] ?? held["name"], held["constituents"]?.["basis"]].filter(Boolean).join(": "),
    });
  }

  const district = districtOf(heldText);
  if (district !== null) chips.push({ icon: "elected_by", text: `Elected by District${NB}${district}`, lead: allUnverified(heldCitations), title: heldText });

  const appoints = connection(held, "appoints");
  if (appoints) {
    const n = appoints["count"] as number | undefined;
    const b = appoints["bodies"] as number | undefined;
    chips.push({
      icon: "appoints",
      text: n ? `Appoints ${n} ${n === 1 ? "seat" : "seats"}` : b ? `Appoints to ${b} ${b === 1 ? "body" : "bodies"}` : "Appoints board members",
      lead: allUnverified(citesOf(appoints)),
      title: String(appoints["text"]),
    });
  }

  const confirms = connection(held, "confirms");
  if (confirms) {
    const text = String(confirms["text"]);
    chips.push({ icon: "confirms", text: text.length <= CHIP_MAX ? text : "Confirmation votes", lead: allUnverified(citesOf(confirms)), title: text });
  }

  const budget = valueOf(held, "budget");
  if (budget !== undefined) {
    const noun = seats !== undefined && seats > 1 ? BUDGET_NOUN[String(held["level"])] : undefined;
    chips.push({
      icon: "budget",
      text: `${compactUsd.format(budget)} ${noun ? `${noun} ` : ""}budget`,
      lead: allUnverified(citesOf(held["budget"])),
      title: held["budget"]?.["basis"],
    });
  }

  const civlab = held["links"]?.["civlab"] as string | undefined;
  if (civlab) chips.push({ icon: "link", text: "CivLab", href: civlab, title: "This office on the CivLab government graph (opens in a new tab)" });

  if (!((held["connections"] as Rec[] | undefined) ?? []).length) chips.push({ icon: "none", text: "Connections not researched", muted: true });

  return chips;
}
