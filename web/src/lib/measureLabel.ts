/**
 * Short label for a ballot measure: "Prop 3" in California, "Question 6" in
 * Nevada (Nevada calls its measures ballot questions). No imports, so tests
 * and every component can use it.
 */
export function measureLabel(ix: { contests: Map<string, Record<string, unknown>>; contestTitle(ref: string): string }, ref: string): string {
  const n = String(ix.contests.get(ref)?.["number"] ?? ix.contestTitle(ref));
  const st = /^(?:contest:)?\d{4}-([a-z]{2})-/.exec(ref)?.[1];
  return `${st === "nv" ? "Question" : "Prop"} ${n}`;
}
