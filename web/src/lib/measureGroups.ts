/**
 * Ballot-measure groups, from the official record (pure; no Svelte):
 * - who signed the arguments printed in the voter guide, per side;
 * - who the official digest and Controller's statement say a measure affects,
 *   grouped by what the text says they pay, receive or have change.
 * Describes; never says who benefits or is harmed.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = Record<string, any>;

export type Side = "yes" | "no";

export interface Signer {
  /** As printed (spelling variants are not merged). */
  name: string;
  /** Ids of the arguments this signer signed, in printed order. */
  arguments: string[];
}

export interface SignersBySide {
  yes: Signer[];
  no: Signer[];
}

/**
 * Unique signers per side across the official and paid arguments, in the
 * order they first appear. A rebuttal counts for the side it is printed on
 * (a rebuttal to the proponent is on the "no" side).
 */
export function signersBySide(args: Rec[] | undefined): SignersBySide {
  const out: Record<Side, Map<string, Signer>> = { yes: new Map(), no: new Map() };
  for (const a of args ?? []) {
    const side = a["side"] === "no" ? "no" : a["side"] === "yes" ? "yes" : null;
    if (!side) continue;
    for (const raw of (a["authors"] as string[] | undefined) ?? []) {
      const name = String(raw).replace(/\s+/g, " ").trim();
      if (!name) continue;
      const s = out[side].get(name) ?? { name, arguments: [] };
      if (!s.arguments.includes(String(a["id"]))) s.arguments.push(String(a["id"]));
      out[side].set(name, s);
    }
  }
  return { yes: [...out.yes.values()], no: [...out.no.values()] };
}

export type Effect = "pays" | "receives" | "rules_change" | "other";
export const EFFECT_ORDER: Effect[] = ["pays", "receives", "rules_change", "other"];

/** Row labels, words only (never arrows or colors for an effect). */
export const EFFECT_LABEL: Record<Effect, string> = {
  pays: "Would pay",
  receives: "Would get",
  rules_change: "Rules would change for",
  other: "Other effects",
};
/** The same verb for one conditional entry ("could", "may", "if" in the text). */
export const EFFECT_MAY: Record<Effect, string> = {
  pays: "May pay",
  receives: "May get",
  rules_change: "Rules may change for",
  other: "Other, conditional",
};

/** Group labels for the fixed list in contest.schema.json $defs.Affect (icons live in icons.ts). */
export const AFFECT_GROUP_LABEL: Record<string, string> = {
  tenants: "Tenants",
  property_owners: "Property owners",
  property_buyers_sellers: "Property buyers and sellers",
  businesses: "Businesses",
  workers_unions: "Workers and unions",
  city_employees: "City employees",
  city_departments: "City departments and officials",
  commission_members: "Board and commission members",
  voters_petitioners: "Voters and petition signers",
  transit_riders: "Muni riders",
  drivers: "Drivers",
  park_visitors: "Park visitors",
  people_experiencing_homelessness: "People experiencing homelessness",
  lower_income_households: "Lower-income households",
  families_students: "Families and students",
  seniors: "Seniors and retirees",
  contractors_vendors: "City contractors and vendors",
  other: "Other",
};

export const affectLabel = (a: Rec): string => (a["group"] === "other" && a["label"] ? String(a["label"]) : (AFFECT_GROUP_LABEL[String(a["group"])] ?? String(a["group"])));

/** Entries grouped by effect, in effect order; empty effects left out. Entry order within a row is the record's (canonical group order). */
export function affectsByEffect(affects: Rec[] | undefined): Array<{ effect: Effect; items: Rec[] }> {
  const list = affects ?? [];
  return EFFECT_ORDER.map((effect) => ({ effect, items: list.filter((a) => a["effect"] === effect) })).filter((r) => r.items.length > 0);
}
