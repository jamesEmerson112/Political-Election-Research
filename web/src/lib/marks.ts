/**
 * For / against marks. Shape carries the meaning; color is secondary.
 *   ▲ up    supports · gives money · endorses
 *   ▼ down  opposes · spends against
 *   ◐ half  mixed
 *   ⊘ slash declined to answer
 *   ○ hollow no public position / searched, none found
 *   dashed  not researched
 *   lead    unverified lead (dashed amber; never an arrow)
 * Tones: teal (--support) / orange (--oppose) for for/against, blue (--money)
 * for money given. Never green/red, never party colors.
 */
export type Shape = "up" | "down" | "half" | "slash" | "hollow" | "dashed" | "lead";
export type Tone = "support" | "oppose" | "money" | "ink";

export interface Mark {
  shape: Shape;
  tone: Tone;
  /** 1–3 word label, always shown next to the mark or in its aria-label. */
  label: string;
}

export const MARK: Record<string, Mark> = {
  support: { shape: "up", tone: "support", label: "Supports" },
  oppose: { shape: "down", tone: "oppose", label: "Opposes" },
  mixed: { shape: "half", tone: "ink", label: "Mixed" },
  declined_to_answer: { shape: "slash", tone: "ink", label: "Declined" },
  no_public_position: { shape: "hollow", tone: "ink", label: "No position" },
  none_found: { shape: "hollow", tone: "ink", label: "None found" },
  not_found: { shape: "hollow", tone: "ink", label: "Not found" },
  unresearched: { shape: "dashed", tone: "ink", label: "Not researched" },
  lead: { shape: "lead", tone: "ink", label: "Unverified lead" },
  gives: { shape: "up", tone: "money", label: "Gives money" },
  ie_support: { shape: "up", tone: "support", label: "Spends for" },
  ie_oppose: { shape: "down", tone: "oppose", label: "Spends against" },
  endorses: { shape: "up", tone: "support", label: "Endorses" },
};

export function stanceMark(stance: string | null | undefined): Mark {
  return (stance && MARK[stance]) || MARK["unresearched"]!;
}

/** Legend order. */
export const LEGEND: Mark[] = [
  { shape: "up", tone: "support", label: "For · endorses" },
  { shape: "down", tone: "oppose", label: "Against" },
  { shape: "up", tone: "money", label: "Gives money" },
  MARK["mixed"]!,
  MARK["declined_to_answer"]!,
  { shape: "hollow", tone: "ink", label: "No position · none found" },
  MARK["unresearched"]!,
  MARK["lead"]!,
];
