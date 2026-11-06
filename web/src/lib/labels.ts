/** Labels made from record ids. No imports, so tests and every component can use them. */

/** "frontier-ai-safety-disclosure" -> "Frontier AI safety disclosure". */
export function humanizeId(id: string): string {
  const small = new Set(["ai", "us", "ca", "h1b", "ice", "lgbtq", "sb", "ab", "fec", "irs"]);
  return id
    .split("-")
    .map((w, i) => (small.has(w) ? w.toUpperCase() : i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

const CONNECTORS = new Set(["and", "or", "for", "over", "of", "to", "with", "in", "on"]);
/** Hyphenated words that ids split in two ("high-speed-rail-funding"): a label never starts in the middle of one. */
const COMPOUNDS = new Set(["high-speed", "drug-use", "self-preferencing", "8th-grade"]);

/**
 * A row's short label: the last three words of a question id, widened so it never starts mid-phrase.
 * "expand-skilled-work-visas" -> "Skilled work visas"; "high-speed-rail-funding" -> "High speed rail funding";
 * "bike-lanes-over-parking" -> "Bike lanes over parking"; "sfusd-close-or-merge-schools" -> "Close or merge schools".
 */
export function shortQuestionLabel(id: string): string {
  const words = humanizeId(id).split(" ");
  const lower = words.map((w) => w.toLowerCase());
  let start = Math.max(0, words.length - 3);
  while (
    start > 0 &&
    (CONNECTORS.has(lower[start]!) || CONNECTORS.has(lower[start + 1] ?? "") || COMPOUNDS.has(`${lower[start - 1]}-${lower[start]}`))
  ) {
    start--;
    if (!CONNECTORS.has(lower[start]!) && !COMPOUNDS.has(`${lower[start - 1] ?? ""}-${lower[start]}`)) break;
  }
  const tail = words.slice(start).join(" ");
  return tail.charAt(0).toUpperCase() + tail.slice(1);
}
