/**
 * Whose ballot the budget pages add up: the visitor's own answers in "Try your
 * ballot", or the recorded count ("Count so far": the measures ahead in the
 * semi-official count, or the ones that passed once it is certified). The
 * charts and sentences are the same; only these words change. Describes,
 * never grades. No imports, so tests and every component can use it.
 */
export type Basis = "answers" | "count";

export interface TrialWords {
  basis: Basis;
  /** Subject of a sentence: "Your choices add $1M a year …". */
  subject: string;
  /** "With your choices: …" (a result line or legend). */
  withIt: string;
  /** Lower case, inside a sentence. */
  withLower: string;
  heading: string;
  intro: string;
  /** The meter without a forecast: "Your choices so far (General Fund)". */
  soFar: string;
  /** Table column for the change. */
  column: string;
  /** "… not a judgment of your choices." */
  judgment: string;
  /** "… what your choices change is …" */
  changes: string;
}

export const ANSWER_WORDS: TrialWords = {
  basis: "answers",
  subject: "Your choices",
  withIt: "With your choices",
  withLower: "with your choices",
  heading: "Your trial ballot: budget effects",
  intro: "If every choice you made became law, using the official estimates. Ranges stay ranges; nothing here says how to vote.",
  soFar: "Your choices so far (General Fund)",
  column: "Your choices",
  judgment: "your choices",
  changes: "your choices change",
};

/** Words for the recorded count: "ahead" until certified, "passed" after (the site's rule for results). */
export function countWords(certified: boolean): TrialWords {
  const who = certified ? "The measures that passed" : "The measures ahead in the count";
  return {
    basis: "count",
    subject: who,
    withIt: certified ? "With the measures that passed" : "If the count holds",
    withLower: certified ? "with the measures that passed" : "if the count holds",
    heading: certified ? "The certified result: budget effects" : "If the semi-official count holds: budget effects",
    intro: certified
      ? "The measures that passed take effect, the others don't, using the official estimates. Ranges stay ranges."
      : "If every measure ahead in the semi-official count became law and the others did not, using the official estimates. The count isn't certified yet; ranges stay ranges.",
    soFar: `${who} (General Fund)`,
    column: certified ? "Passed measures" : "The count",
    judgment: "the vote",
    changes: certified ? "the measures that passed change" : "the measures ahead change",
  };
}
