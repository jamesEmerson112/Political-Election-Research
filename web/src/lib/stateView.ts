import { isEmptyChoice, serializeChoice, stateOfChoice, type Choice } from "./ballot.js";

/**
 * The Overview shows one state's contests at a time (California, or Nevada: the contests on Las Vegas ballots),
 * picked with the switch under its title. The state is part of the page address (`#overview?view=nv`), so Back,
 * Forward and shared links keep it; with no `view=`, the Overview opens on My ballot's state, else the first state.
 */

/** State names by code (`STATES` in data.ts). */
export const STATE_NAMES: Record<string, string> = { ca: "California", nv: "Nevada" };

/** The states that have contests, California first, then the others by code (the demo has only its own). */
export function statesOf(codes: Iterable<string>): string[] {
  return [...new Set(codes)].filter(Boolean).sort((a, b) => Number(b === "ca") - Number(a === "ca") || a.localeCompare(b));
}

/** The state's name ("Nevada"; an unknown code in capitals, like the demo's "ZZ"). */
export function stateName(st: string): string {
  return STATE_NAMES[st] ?? st.toUpperCase();
}

/** The switch's label: Nevada's contests are the ones on Las Vegas ballots. */
export function stateLabel(st: string): string {
  return st === "nv" ? `${stateName(st)} · Las Vegas` : stateName(st);
}

/** The state a link asks for (`view=nv`), or null. My ballot's own `st=nv` is a ballot, not a view. */
export function viewParam(query: string): string | null {
  return /(?:^|[?&#])view=([a-z]{2})(?:&|$)/.exec(query)?.[1] ?? null;
}

/** With no `view=`: My ballot's state when one is set (and has contests here), else the first state. */
export function defaultView(choice: Choice, states: string[]): string {
  const st = stateOfChoice(choice);
  return !isEmptyChoice(choice) && states.includes(st) ? st : (states[0] ?? "ca");
}

/** The state shown: the link's, when it has contests here, else the default. */
export function viewOf(param: string | null, choice: Choice, states: string[]): string {
  return param && states.includes(param) ? param : defaultView(choice, states);
}

/**
 * The Overview's address for a state and a ballot: `view=` only when it isn't the default, then My ballot's own
 * parameters ("#overview", "#overview?view=nv", "#overview?cd=11", "#overview?view=ca&st=nv&cd=1").
 */
export function overviewHash(view: string, choice: Choice, states: string[]): string {
  const ballot = isEmptyChoice(choice) ? "" : serializeChoice(choice);
  const qs = [view !== defaultView(choice, states) ? `view=${view}` : "", ballot].filter(Boolean).join("&");
  return qs ? `#overview?${qs}` : "#overview";
}
