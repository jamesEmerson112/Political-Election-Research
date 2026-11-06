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
  // Nevada placeholders (Las Vegas ballots): fixed slug patterns, see docs/RESEARCH_GUIDE.md.
  if (s === "us-senate") return "U.S. Senate";
  const districted: Array<[RegExp, string]> = [
    [/^state-senate-(\d+)$/, "State Senate, District $1"],
    [/^state-assembly-(\d+)$/, "State Assembly, District $1"],
    [/^assembly-(\d+)$/, "Assembly, District $1"],
    [/^board-of-regents-(\d+)$/, "Board of Regents, District $1"],
    [/^state-board-of-education-(\d+)$/, "State Board of Education, District $1"],
    [/^supreme-court-seat-([a-z])$/, "Supreme Court, Seat $1"],
    [/^court-of-appeals-dept-(\d+)$/, "Court of Appeals, Department $1"],
    [/^district-court-dept-(\d+)$/, "District Court, Department $1"],
    [/^district-court-family-dept-([a-z])$/, "District Court Family Division, Department $1"],
    [/^las-vegas-municipal-court-dept-(\d+)$/, "Las Vegas Municipal Court, Department $1"],
    [/^question-(\d+)$/, "Question $1"],
    [/^clark-county-commission-([a-z])$/, "Clark County Commission, District $1"],
    [/^clark-county-question-(\d+)$/, "Clark County Question $1"],
    [/^ccsd-trustee-([a-z])$/, "CCSD Trustee, District $1"],
    [/^las-vegas-council-ward-(\d+)$/, "Las Vegas City Council, Ward $1"],
    [/^las-vegas-question-(\d+)$/, "Las Vegas Question $1"],
  ];
  for (const [re, title] of districted) {
    const m = re.exec(s);
    if (m) return title.replace("$1", /^[a-z]$/.test(m[1]!) ? m[1]!.toUpperCase() : m[1]!);
  }
  const small = new Set(["of", "and", "for", "the", "on"]);
  return s
    .split("-")
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}
