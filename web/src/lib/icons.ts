/**
 * Every icon and badge-color mapping on the site lives here.
 *
 * Glyphs are Lucide icons (ISC license, see web/THIRD_PARTY_NOTICES.md).
 * Rules (maintainer decisions):
 * - Badges are a white glyph in a circle colored by CATEGORY GROUP, never by
 *   stance. Stance is carried by the ▲ / ▼ / ◐ / ⊘ / ○ marks (StanceMark).
 * - No valence glyphs: no thumbs, no checkmarks for performance, no warning
 *   triangles, nothing that reads as good or bad.
 * - Unknown ids fall back to a neutral glyph, so new issues added to data/
 *   render without a code change.
 */
import type { Component } from "svelte";
import Banknote from "@lucide/svelte/icons/banknote";
import Bed from "@lucide/svelte/icons/bed";
import BrainCircuit from "@lucide/svelte/icons/brain-circuit";
import Briefcase from "@lucide/svelte/icons/briefcase";
import Building2 from "@lucide/svelte/icons/building-2";
import Calendar from "@lucide/svelte/icons/calendar";
import CalendarClock from "@lucide/svelte/icons/calendar-clock";
import CircleDashed from "@lucide/svelte/icons/circle-dashed";
import ClipboardList from "@lucide/svelte/icons/clipboard-list";
import Cog from "@lucide/svelte/icons/cog";
import Cpu from "@lucide/svelte/icons/cpu";
import Earth from "@lucide/svelte/icons/earth";
import Equal from "@lucide/svelte/icons/equal";
import EqualNot from "@lucide/svelte/icons/equal-not";
import ExternalLink from "@lucide/svelte/icons/external-link";
import Gavel from "@lucide/svelte/icons/gavel";
import GitCompareArrows from "@lucide/svelte/icons/git-compare-arrows";
import PiggyBank from "@lucide/svelte/icons/piggy-bank";
import FileText from "@lucide/svelte/icons/file-text";
import GraduationCap from "@lucide/svelte/icons/graduation-cap";
import HandCoins from "@lucide/svelte/icons/hand-coins";
import House from "@lucide/svelte/icons/house";
import IdCard from "@lucide/svelte/icons/id-card";
import Landmark from "@lucide/svelte/icons/landmark";
import MapIcon from "@lucide/svelte/icons/map";
import MapPin from "@lucide/svelte/icons/map-pin";
import MapPinHouse from "@lucide/svelte/icons/map-pin-house";
import Megaphone from "@lucide/svelte/icons/megaphone";
import MessagesSquare from "@lucide/svelte/icons/messages-square";
import MoveRight from "@lucide/svelte/icons/move-right";
import NotebookPen from "@lucide/svelte/icons/notebook-pen";
import Percent from "@lucide/svelte/icons/percent";
import Scale from "@lucide/svelte/icons/scale";
import ScrollText from "@lucide/svelte/icons/scroll-text";
import Shapes from "@lucide/svelte/icons/shapes";
import Stamp from "@lucide/svelte/icons/stamp";
import Stethoscope from "@lucide/svelte/icons/stethoscope";
import TrainFront from "@lucide/svelte/icons/train-front";
import UserPlus from "@lucide/svelte/icons/user-plus";
import UsersRound from "@lucide/svelte/icons/users-round";
import Users from "@lucide/svelte/icons/users";
import Vote from "@lucide/svelte/icons/vote";
import Zap from "@lucide/svelte/icons/zap";
import type { ChipIcon } from "./officeChips";

export type IconComponent = Component<Record<string, unknown>>;
const I = (c: unknown) => c as IconComponent;

/**
 * Category groups. Each is one badge color (CSS tokens in app.css):
 * - money:  --money (existing blue)
 * - people: --cat-people (plum; the only new hue that passes the palette
 *           validator, all pairs, against --support / --oppose / --money)
 * - issue:  --cat-issue (ink circle: no further hue passes)
 * - record: --cat-record (gray circle: same reason)
 */
export type Group = "issue" | "money" | "people" | "record";

export const GROUP_COLOR: Record<Group, string> = {
  issue: "var(--cat-issue)",
  money: "var(--money)",
  people: "var(--cat-people)",
  record: "var(--cat-record)",
};

export const GROUP_LABEL: Record<Group, string> = {
  issue: "Issues",
  money: "Money",
  people: "Endorsements",
  record: "Record",
};

/** issue id (data/issues/<id>.json) -> glyph. */
export const ISSUE_ICON: Record<string, IconComponent> = {
  housing: I(House),
  homelessness: I(Bed),
  taxes: I(Percent),
  energy: I(Zap),
  immigration: I(Earth),
  transportation: I(TrainFront),
  ai: I(BrainCircuit),
  technology: I(Cpu),
  healthcare: I(Stethoscope),
  widgets: I(Cog), // fictional fixture issue
};
/** Any issue not listed above. */
export const FALLBACK_ISSUE_ICON: IconComponent = I(Shapes);
/** A ballot measure on an office agenda (asked of every candidate). */
export const MEASURE_ICON: IconComponent = I(ScrollText);

export function issueIcon(issueId: string | undefined): IconComponent {
  return (issueId && ISSUE_ICON[issueId]) || FALLBACK_ISSUE_ICON;
}

/** The maintainer's 11 comparison categories (docs/METHODOLOGY.md §2a). */
export type CategoryKey =
  | "identity"
  | "occupation"
  | "qualifications"
  | "past_policies"
  | "shared"
  | "differ"
  | "endorsements"
  | "financing"
  | "performance"
  | "controversies"
  | "promises";

export interface CategoryStyle {
  icon: IconComponent;
  group: Group;
}

/** category -> glyph + color group. */
export const CATEGORY: Record<CategoryKey, CategoryStyle> = {
  identity: { icon: I(IdCard), group: "record" },
  occupation: { icon: I(Briefcase), group: "record" },
  qualifications: { icon: I(GraduationCap), group: "record" },
  past_policies: { icon: I(FileText), group: "record" },
  shared: { icon: I(Equal), group: "issue" },
  differ: { icon: I(EqualNot), group: "issue" },
  endorsements: { icon: I(Megaphone), group: "people" },
  financing: { icon: I(Banknote), group: "money" },
  performance: { icon: I(ClipboardList), group: "record" },
  controversies: { icon: I(MessagesSquare), group: "record" },
  promises: { icon: I(NotebookPen), group: "issue" },
};
export const FALLBACK_CATEGORY: CategoryStyle = { icon: I(Landmark), group: "record" };

export function categoryStyle(key: string): CategoryStyle {
  return CATEGORY[key as CategoryKey] ?? FALLBACK_CATEGORY;
}

/**
 * Comparison row -> glyph (the spine badge). Rows not listed use their
 * category's glyph; the badge color is always the category's group.
 */
export const ROW_ICON: Record<string, IconComponent> = {
  age: I(Calendar),
  party: I(UsersRound),
  origin: I(MapPin),
  residence: I(MapPinHouse),
  occupation: I(Briefcase),
  years: I(CalendarClock),
  education: I(GraduationCap),
  career: I(Building2),
  "past-offices": I(Landmark),
  scope: I(Users),
  bills: I(FileText),
  endorsements: I(Megaphone),
  raised: I(Banknote),
  outside: I(HandCoins),
  track: I(ClipboardList),
  controversies: I(MessagesSquare),
  promises: I(NotebookPen),
  /** "Other unverified leads" rows. */
  other: I(Shapes),
};

/**
 * Bill outcome -> stamp. Outcomes carry no for/against meaning, so they get
 * no stance or valence colors: one ordinal ink ramp (--outcome-*), a distinct
 * shape per outcome, and the outcome word in the tooltip and expansion.
 */
export type StampShape = "solid" | "slash" | "hollow" | "dashed" | "dot";
export const BILL_OUTCOME: Record<string, { shape: StampShape; color: string; label: string }> = {
  enacted: { shape: "solid", color: "var(--outcome-enacted)", label: "Enacted" },
  vetoed: { shape: "slash", color: "var(--outcome-vetoed)", label: "Vetoed" },
  stalled: { shape: "hollow", color: "var(--outcome-stalled)", label: "Stalled / failed" },
  pending: { shape: "dashed", color: "var(--outcome-pending)", label: "Pending" },
  other: { shape: "dot", color: "var(--outcome-stalled)", label: "Other" },
  "no record": { shape: "dot", color: "var(--outcome-pending)", label: "No bill record yet" },
};

/**
 * Office scope chips (Occupation category) -> glyph. Plain verbs and counts;
 * never ▲ / ▼, which mean support / oppose.
 */
export const CHIP_ICON: Record<ChipIcon, IconComponent> = {
  seeking: I(MoveRight),
  seats: I(Users),
  elected_by: I(Vote),
  appoints: I(UserPlus),
  confirms: I(Stamp),
  budget: I(Landmark),
  link: I(ExternalLink),
  none: I(CircleDashed),
  measure_type: I(ScrollText),
  threshold: I(Percent),
  placed_by: I(Gavel),
  general_fund: I(Landmark),
  set_aside: I(PiggyBank),
  dedicated: I(HandCoins),
  bond_debt: I(Banknote),
  other_agency: I(Building2),
  conflict: I(GitCompareArrows),
};

/** Office type (contest index groups, in display order) -> glyph. Badges use the neutral record color. */
export type OfficeType = "statewide" | "boe" | "house" | "legislature" | "local" | "other" | "measure" | "local_measure";
export const OFFICE_TYPE: Record<OfficeType, { label: string; icon: IconComponent }> = {
  statewide: { label: "Statewide", icon: I(Landmark) },
  boe: { label: "Board of Equalization", icon: I(Scale) },
  house: { label: "U.S. House", icon: I(MapIcon) },
  legislature: { label: "State Legislature", icon: I(Building2) },
  local: { label: "Local offices", icon: I(Building2) },
  other: { label: "Other offices", icon: I(Shapes) },
  measure: { label: "State propositions", icon: I(ScrollText) },
  local_measure: { label: "Local measures", icon: I(ScrollText) },
};
export const OFFICE_ORDER: OfficeType[] = ["statewide", "boe", "house", "legislature", "local", "other", "measure", "local_measure"];

/** "My ballot" panel (Overview). Neutral glyphs; badges use the record color. */
import BallotInfo from "@lucide/svelte/icons/info";
import BallotList from "@lucide/svelte/icons/list";
import BallotListChecks from "@lucide/svelte/icons/list-checks";
import BallotLocateFixed from "@lucide/svelte/icons/locate-fixed";
import BallotMailbox from "@lucide/svelte/icons/mailbox";
import BallotMapPinCheck from "@lucide/svelte/icons/map-pin-check";
import BallotPencil from "@lucide/svelte/icons/pencil";
import BallotX from "@lucide/svelte/icons/x";
export const BALLOT_ICON = {
  panel: I(MapPin),
  set: I(BallotMapPinCheck),
  pick: I(BallotListChecks),
  zip: I(BallotMailbox),
  locate: I(BallotLocateFixed),
  all: I(BallotList),
  change: I(BallotPencil),
  forget: I(BallotX),
  info: I(BallotInfo),
};

/** Policy area -> glyph (past policies grouped by area). Unknown areas use the bill glyph. */
export const AREA_ICON: Record<string, IconComponent> = {
  civil_rights: I(Scale),
  tech: I(Cpu),
  economy: I(Banknote),
  housing: I(House),
  government: I(Landmark),
  other: I(Shapes),
};
