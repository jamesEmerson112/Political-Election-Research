/**
 * The comparison model behind both contest layouts (the two-candidate versus
 * spine and the column table used for 1 or 3+ candidates). One pure function
 * of the bundle: categories -> rows -> one cell per candidate, each with a
 * headline (mark / number / 1–3 word label), numeric data for bars, dots and
 * stamps, the sentence-level lines shown when the row is expanded, and the
 * drawer opener. Both layouts read the same cells, so they always agree.
 */
import type { CandidateRollup, Citation, Index, Lead, Rec } from "./data";
import { slugOf } from "./data";
import { date, money, moneyCompact, ORG_TYPE_LABEL } from "./format";
import { CATEGORY, issueIcon, MEASURE_ICON, ROW_ICON, type CategoryKey, type Group, type IconComponent } from "./icons";
import { MARK, stanceMark, type Mark } from "./marks";
import { openDetail, type Detail } from "./ui.svelte";
import { age, isNotFound, openField, openLeads, openPosition, openRel } from "./view";

export type CellState = "value" | "zero" | "not_found" | "lead" | "unresearched";

export interface Line {
  text: string;
  sub?: string;
  /** Citation button: count + what it opens. */
  cite?: { n: number; run: () => void };
  /** A secondary drawer link ("Where we looked", "Leads", "Filings"). */
  more?: { label: string; run: () => void };
  lead?: boolean;
  strike?: boolean;
  bar?: number;
}

export interface Cell {
  state: CellState;
  marks: Array<{ mark: Mark; text?: string }>;
  num?: string;
  unit?: string;
  label?: string;
  /** Tiny count stamps (bill outcomes, endorser types). */
  stamps?: string[];
  /** Number rows: bars on one shared scale per row (both candidates). */
  bars?: Array<{ value: number; text: string; tone: "money" | "people" | "support" | "oppose"; mark?: Mark }>;
  /** Count rows: one dot per item. */
  dots?: number;
  /** Bills: one stamp per bill, by outcome. */
  bills?: Array<{ outcome: string; text: string }>;
  lines: Line[];
  /** One plain sentence for tooltips and aria-labels. */
  summary: string;
  open: () => void;
}

/** How the versus spine draws a row. */
export type RowKind = "value" | "stance" | "bars" | "dots" | "bills" | "lead";

export interface Row {
  key: string;
  kind: RowKind;
  label: string;
  /** 1–3 word label under the spine badge. */
  short: string;
  /** Spine badge. */
  icon: IconComponent;
  group: Group;
  /** Full question text, support/oppose definitions (stance rows). */
  question?: string;
  defs?: [string, string];
  cells: Cell[];
}

export interface Category {
  /** Category number in the maintainer's 11-category structure ("5–6" for the merged policy category). */
  n: number | string;
  key: CategoryKey;
  name: string;
  source: string;
  rows: Row[];
  /** Headline count for the category bar (e.g. how many questions are shared). */
  count?: number;
  empty?: string;
  /** Titled sub-groups after `rows` (e.g. policy areas, "Not yet comparable"). */
  sections?: Array<{ title: string; rows: Row[] }>;
}

export interface Comparison {
  cands: string[];
  categories: Category[];
  counts: { shared: number; differ: number; incomplete: number };
}

const ACTION: Record<string, string> = {
  authored: "Authored",
  coauthored: "Co-authored",
  sponsored: "Sponsored",
  cosponsored: "Co-sponsored",
  voted_yes: "Voted yes",
  voted_no: "Voted no",
  abstained: "Abstained",
  publicly_supported: "Publicly supported",
  publicly_opposed: "Publicly opposed",
};

/** Bill status -> outcome stamp. */
const OUTCOME: Record<string, string> = {
  enacted: "enacted",
  vetoed: "vetoed",
  stalled: "stalled",
  failed: "stalled",
  withdrawn: "stalled",
  introduced: "pending",
  in_committee: "pending",
  passed_one_chamber: "pending",
  passed_legislature: "pending",
  other: "other",
};
const OUTCOME_ORDER = ["enacted", "vetoed", "stalled", "pending", "other"];

/** Endorser type -> short stamp word (singular, plural). */
const ENDORSER_SHORT: Record<string, [string, string]> = {
  labor_union: ["union", "unions"],
  corporation: ["business", "businesses"],
  trade_association: ["trade group", "trade groups"],
  nonprofit_501c3: ["nonprofit", "nonprofits"],
  nonprofit_501c4: ["nonprofit", "nonprofits"],
  political_party: ["party", "parties"],
  candidate_committee: ["committee", "committees"],
  ballot_measure_committee: ["committee", "committees"],
  general_purpose_pac: ["PAC", "PACs"],
  ie_committee: ["PAC", "PACs"],
  lobbying_firm: ["firm", "firms"],
  government_body: ["public body", "public bodies"],
  tribe: ["tribe", "tribes"],
  person: ["person", "people"],
  other: ["group", "groups"],
};

const EXPLICIT = new Set(["support", "oppose", "mixed"]);
const cites = (v: unknown): Citation[] => ((v as Rec | undefined)?.["citations"] as Citation[] | undefined) ?? [];

export function billLabel(id: string): string {
  return /-file-/.test(id)
    ? `${id.split("-file-")[0]!.toUpperCase()} File ${id.split("-file-")[1]}`
    : id.replace(/^(ca|us)-\d+-/, "").replace("-", " ").toUpperCase();
}

/** "frontier-ai-safety-disclosure" -> "Frontier AI safety disclosure". */
export function humanizeId(id: string): string {
  const small = new Set(["ai", "us", "ca", "h1b", "ice", "lgbtq", "sb", "ab", "fec", "irs"]);
  return id
    .split("-")
    .map((w, i) => (small.has(w) ? w.toUpperCase() : i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function buildComparison(ix: Index, contestRef: string): Comparison {
  const cands = ix.candidatesOf(contestRef);
  const agenda = ix.agendas.get(contestRef);
  const electionDate = String(ix.elections.get(`election:${slugOf(contestRef).split("/")[0]}`)?.["date"] ?? ix.b.today);
  const subjects: string[] = agenda ? [...(agenda["questions"] as string[]), ...(agenda["measures"] as string[])] : [];
  const cutoff = (agenda?.["targets"]?.["finance_cutoff"] as string | null) ?? null;

  const profile = (c: string): Rec => (ix.people.get(c)?.["candidate_profile"] as Rec | undefined) ?? {};
  const dossier = (c: string): Rec | undefined => ix.b.dossiers.find((d) => d["actor"] === c);
  const leads = (c: string, topic: string): Lead[] => ix.leadsFor(contestRef, c, topic);
  const exhaustedFor = (c: string, topic: string): Rec | undefined =>
    ((agenda?.["exhausted"] as Rec[] | undefined) ?? []).find((e) => e["task"] === `${slugOf(contestRef)}|${topic}|${c}`);
  const legislation = (c: string): Rec[] =>
    ix
      .ofType("legislative_action")
      .filter((r) => r["person"] === c)
      .sort((a, b) => (a["date"] < b["date"] ? 1 : -1));
  const bill = (id: string): Rec | undefined => ix.b.bills.find((b) => b["id"] === id);
  const offices = (c: string): Rec[] => (profile(c)["offices_held"]?.["items"] as Rec[] | undefined) ?? [];
  const isCurrent = (o: Rec): boolean => Boolean(o["current"] ?? !o["end"]);
  const rollup = (c: string): CandidateRollup | undefined => ix.b.rollups[contestRef]?.[c];
  const who = (c: string) => ix.name(c);

  // ---- generic cells -------------------------------------------------------

  /** Nothing recorded: a closed count task, unverified leads, or not researched. */
  function missing(c: string, topic: string, title: string): Cell {
    const ex = exhaustedFor(c, topic);
    if (ex) {
      const run = () => openField(title, who(c), { as_of: ex["date"], items: [], search_log: ex["search_log"] });
      return {
        state: "zero",
        marks: [{ mark: MARK["none_found"]! }],
        num: "0",
        label: "none found",
        lines: [{ text: `Searched; none found as of ${date(ex["date"])}.`, more: { label: "Where we looked", run } }],
        summary: "None found",
        open: run,
      };
    }
    const ls = leads(c, topic);
    if (ls.length) {
      const run = () => openLeads(title, ls);
      return {
        state: "lead",
        marks: [{ mark: MARK["lead"]! }],
        label: ls.length === 1 ? "Unverified lead" : `${ls.length} unverified leads`,
        lines: [...ls.map((l) => ({ text: `${l.label ? `${l.label}: ` : ""}${l.text}`, lead: true })), { text: "", more: { label: "Lead details", run } }],
        summary: `Unverified lead: ${ls.map((l) => l.text).join("; ")}`,
        open: run,
      };
    }
    return {
      state: "unresearched",
      marks: [{ mark: MARK["unresearched"]! }],
      label: "Not researched",
      lines: [{ text: "Not researched yet." }],
      summary: "Not researched yet",
      open: () => openDetail({ kicker: who(c), title, text: "Not researched yet." }),
    };
  }

  function notFound(c: string, title: string, v: Rec): Cell {
    const run = () => openField(title, who(c), v);
    return {
      state: "not_found",
      marks: [{ mark: MARK["not_found"]! }],
      label: "Not found",
      lines: [{ text: `Not found as of ${date(v["as_of"])}.`, more: { label: "Where we looked", run } }],
      summary: "Not found",
      open: run,
    };
  }

  function noneFound(c: string, title: string, v: Rec): Cell {
    const run = () => openField(title, who(c), v);
    return {
      state: "zero",
      marks: [{ mark: MARK["none_found"]! }],
      num: "0",
      label: "none found",
      lines: [{ text: `Searched; none found as of ${date(v["as_of"])}.`, more: { label: "Where we looked", run } }],
      summary: "None found",
      open: run,
    };
  }

  function citeOf(title: string, kicker: string, list: Citation[]): Line["cite"] {
    return list.length ? { n: list.length, run: () => openDetail({ kicker, title, citations: list }) } : undefined;
  }

  /** A single cited string field. */
  function field(c: string, key: string, title: string): Cell {
    const v = profile(c)[key] as Rec | undefined;
    if (v && isNotFound(v)) return notFound(c, title, v);
    if (v) {
      const value = String(v["value"]);
      return {
        state: "value",
        marks: [],
        label: value,
        lines: [{ text: value, cite: citeOf(title, who(c), cites(v)) }],
        summary: value,
        open: () => openField(title, who(c), v),
      };
    }
    return missing(c, `profile.${key}`, `${title}: ${who(c)}`);
  }

  /** A cited list field (education, career, past offices). */
  function list(
    c: string,
    key: string,
    title: string,
    items: Rec[],
    line: (r: Rec) => string,
    short: (r: Rec) => string,
    unit: [string, string],
    showLeads = true,
  ): Cell {
    const v = profile(c)[key] as Rec | undefined;
    if (!v && !showLeads) {
      return {
        state: "unresearched",
        marks: [{ mark: MARK["unresearched"]! }],
        label: "Not researched",
        lines: [{ text: "Not researched yet." }],
        summary: "Not researched yet",
        open: () => openDetail({ kicker: who(c), title, text: "Not researched yet." }),
      };
    }
    if (!v) return missing(c, `profile.${key}`, `${title}: ${who(c)}`);
    if (items.length === 0) return noneFound(c, title, v);
    return {
      state: "value",
      marks: [],
      num: String(items.length),
      unit: items.length === 1 ? unit[0] : unit[1],
      label: short(items[0]!),
      lines: items.map((it) => ({ text: line(it), cite: citeOf(line(it), who(c), cites(it)) })),
      summary: items.map(line).join("; "),
      open: () =>
        openDetail({
          kicker: who(c),
          title,
          history: items.map((it) => ({ label: line(it), text: "", citations: cites(it) })),
        }),
    };
  }

  /** A dossier section (track record, controversies, promises). */
  function section(c: string, key: string, title: string, unit: [string, string]): Cell {
    const sec = dossier(c)?.[key] as Rec | undefined;
    if (!sec) return missing(c, `dossier.${key}`, `${title}: ${who(c)}`);
    const items = (sec["items"] as Rec[]) ?? [];
    if (items.length === 0) return noneFound(c, title, sec);
    const openItem = (it: Rec) => {
      const history: Detail["history"] = [];
      if (it["response"]) {
        history.push({
          label: "Candidate’s response",
          text: it["response"]["status"] === "not_found" ? "None found." : String(it["response"]["summary"] ?? ""),
          citations: cites(it["response"]),
        });
      }
      if (it["resolution"]) history.push({ label: "Resolution", text: String(it["resolution"]["summary"] ?? ""), citations: cites(it["resolution"]) });
      openDetail({
        kicker: `${who(c)} · ${title}`,
        title: String(it["title"]),
        text: String(it["summary"] ?? ""),
        facts: it["date"] ? [["Date", String(it["date"])]] : [],
        citations: cites(it),
        searchLog: it["response"]?.["search_log"],
        history,
      });
    };
    const lines: Line[] = [];
    for (const it of items) {
      lines.push({
        text: `${it["title"]}${it["date"] ? ` · ${it["date"]}` : ""}`,
        sub: String(it["summary"] ?? ""),
        cite: { n: cites(it).length, run: () => openItem(it) },
      });
      if (it["response"]) {
        lines.push({
          text: `Response: ${it["response"]["status"] === "not_found" ? "none found" : it["response"]["summary"]}`,
          cite: { n: cites(it["response"]).length, run: () => openItem(it) },
        });
      }
      if (it["resolution"]) lines.push({ text: `Resolution: ${it["resolution"]["summary"]}`, cite: { n: cites(it["resolution"]).length, run: () => openItem(it) } });
    }
    return {
      state: "value",
      marks: [],
      num: String(items.length),
      unit: items.length === 1 ? unit[0] : unit[1],
      label: String(items[0]!["title"]),
      dots: items.length,
      lines,
      summary: items.map((it) => String(it["title"])).join("; "),
      open: () => (items.length === 1 ? openItem(items[0]!) : openDetail({
        kicker: who(c),
        title,
        history: items.map((it) => ({ label: String(it["title"]), text: String(it["summary"] ?? ""), citations: cites(it) })),
      })),
    };
  }

  // ---- specific cells --------------------------------------------------------

  function ageCell(c: string): Cell {
    const b = profile(c)["birth_date"] as Rec | undefined;
    if (b && !isNotFound(b)) {
      const a = age(String(b["value"]), electionDate) ?? "?";
      return {
        state: "value",
        marks: [],
        num: a.replace("about ", "~"),
        unit: "yrs",
        label: "on election day",
        lines: [{ text: `Born ${b["value"]}; ${a} on ${date(electionDate)}.`, cite: citeOf("Birth date", who(c), cites(b)) }],
        summary: `${a} years old on election day`,
        open: () => openField("Birth date", who(c), b),
      };
    }
    if (b) return notFound(c, "Birth date", b);
    return missing(c, "profile.birth_date", `Birth date: ${who(c)}`);
  }

  function yearsSpan(o: Rec): number | null {
    const start = (o["start"] ?? o["first_elected"]) as string | undefined;
    if (!start) return null;
    const end = (o["end"] as string | undefined) ?? (isCurrent(o) ? electionDate : undefined);
    if (!end) return null;
    return Math.max(0, Number(end.slice(0, 4)) - Number(start.slice(0, 4)));
  }

  function officeLine(o: Rec): string {
    const start = (o["start"] ?? o["first_elected"]) as string | undefined;
    const span = start ? `${String(start).slice(0, 4)}–${o["end"] ? String(o["end"]).slice(0, 4) : isCurrent(o) ? "now" : "?"}` : "";
    return `${o["office"]}${span ? ` (${span})` : ""}`;
  }

  function yearsInOffice(c: string): Cell {
    const v = profile(c)["offices_held"] as Rec | undefined;
    if (!v) return missing(c, "profile.offices_held", `Offices held: ${who(c)}`);
    const items = offices(c);
    if (items.length === 0) return noneFound(c, "Offices held", v);
    const spans = items.map(yearsSpan);
    const known = spans.filter((x): x is number => x !== null);
    const total = known.reduce((a, b) => a + b, 0);
    const current = items.filter(isCurrent);
    return {
      state: "value",
      marks: [],
      num: known.length ? String(total) : "?",
      unit: total === 1 ? "yr" : "yrs",
      label: current.length ? String(current[0]!["office"]) : "no current office",
      lines: items.map((o) => ({
        text: `${isCurrent(o) ? "Now: " : ""}${officeLine(o)}`,
        cite: citeOf(String(o["office"]), who(c), cites(o)),
      })),
      summary: `${known.length ? `${total} years in office` : "Years unknown"}${current.length ? `; now ${current[0]!["office"]}` : ""}`,
      open: () =>
        openDetail({
          kicker: who(c),
          title: "Offices held",
          facts: [["Years in office (computed)", known.length ? String(total) : "unknown"]],
          history: items.map((o) => ({ label: officeLine(o), text: isCurrent(o) ? "Current office" : "", citations: cites(o) })),
        }),
    };
  }

  function billsCell(c: string): Cell {
    const acts = legislation(c);
    if (!acts.length) return missing(c, "legislation", `Past policies: ${who(c)}`);
    const bills = [...new Set(acts.map((a) => String(a["bill"])))];
    const outcomes = new Map<string, number>();
    for (const id of bills) {
      const b = bill(id);
      const o = b ? (OUTCOME[String(b["status"]["value"])] ?? "other") : "no record";
      outcomes.set(o, (outcomes.get(o) ?? 0) + 1);
    }
    const openAct = (a: Rec) => {
      const b = bill(String(a["bill"]));
      openRel(ix, a, `${billLabel(a["bill"])}${b ? ` · ${b["title"]["value"]}` : ""}`, [
        ["Action", ACTION[a["action"]] ?? String(a["action"])],
        ["Date", date(a["date"])],
        ["Outcome", b ? `${String(b["status"]["value"]).replace(/_/g, " ")} (as of ${date(b["status"]["as_of"])})` : "No bill record yet"],
      ]);
    };
    return {
      state: "value",
      marks: [],
      num: String(bills.length),
      unit: bills.length === 1 ? "bill" : "bills",
      stamps: [...OUTCOME_ORDER, "no record"].filter((o) => outcomes.get(o)).map((o) => `${outcomes.get(o)} ${o}`),
      bills: bills.map((id) => {
        const b = bill(id);
        const o = b ? (OUTCOME[String(b["status"]["value"])] ?? "other") : "no record";
        return { outcome: o, text: `${billLabel(id)}${b ? ` ${b["title"]["value"]}` : ""} · ${b ? String(b["status"]["value"]).replace(/_/g, " ") : "no bill record yet"}` };
      }),
      lines: acts.map((a) => {
        const b = bill(String(a["bill"]));
        return {
          text: `${billLabel(a["bill"])}${b ? ` ${b["title"]["value"]}` : ""}`,
          sub: `${ACTION[a["action"]] ?? a["action"]}${a["date"] ? ` · ${date(a["date"])}` : ""}${b ? ` · ${String(b["status"]["value"]).replace(/_/g, " ")}` : ""}`,
          cite: { n: cites(a).length, run: () => openAct(a) },
        };
      }),
      summary: `${bills.length} bill${bills.length === 1 ? "" : "s"}: ${[...outcomes.entries()].map(([k, n]) => `${n} ${k}`).join(", ")}`,
      open: () =>
        openDetail({
          kicker: who(c),
          title: "Bills authored, voted on or publicly backed",
          history: acts.map((a) => {
            const b = bill(String(a["bill"]));
            return {
              label: `${billLabel(a["bill"])} · ${ACTION[a["action"]] ?? a["action"]}${b ? ` · ${String(b["status"]["value"]).replace(/_/g, " ")}` : ""}`,
              text: b ? String(b["title"]["value"]) : "",
              citations: cites(a),
            };
          }),
        }),
    };
  }

  function stanceCell(c: string, s: string): Cell {
    const p = ix.latest(c, s);
    const ls = leads(c, s);
    const open = () => openPosition(ix, c, s, contestRef);
    if (p) {
      const m = stanceMark(String(p["stance"]));
      const text = p["summary"]
        ? String(p["summary"])
        : p["stance"] === "no_public_position"
          ? `No public position found as of ${date(p["as_of"])}.`
          : `${m.label} as of ${date(p["as_of"])}.`;
      const list = cites(p);
      return {
        state: "value",
        marks: [{ mark: m }],
        label: m.label,
        lines: [
          {
            text,
            cite: list.length ? { n: list.length, run: open } : undefined,
            more: p["search_log"] ? { label: "Where we looked", run: open } : undefined,
          },
        ],
        summary: text,
        open,
      };
    }
    if (ls.length) {
      const hint = ls.find((l) => l.hint)?.hint;
      return {
        state: "lead",
        marks: [{ mark: MARK["lead"]! }],
        label: hint ? `Lead: ${MARK[hint]?.label.toLowerCase() ?? hint}?` : ls.length === 1 ? "Unverified lead" : `${ls.length} leads`,
        lines: [...ls.map((l) => ({ text: `${l.label ? `${l.label}: ` : ""}${l.text}`, lead: true })), { text: "", more: { label: "Lead details", run: open } }],
        summary: `No cited stance. Unverified lead: ${ls.map((l) => l.text).join("; ")}`,
        open,
      };
    }
    return {
      state: "unresearched",
      marks: [{ mark: MARK["unresearched"]! }],
      label: "Not researched",
      lines: [{ text: "Not researched yet." }],
      summary: "Not researched yet",
      open,
    };
  }

  function endorsementsCell(c: string): Cell {
    const ens = ix.endorsementsOf(c);
    if (!ens.length) return missing(c, "endorsements", `Endorsements: ${who(c)}`);
    const active = ens.filter((e) => !e["rescinded"]);
    const typeOf = (e: Rec) => {
      const org = ix.orgs.get(String(e["endorser"]));
      return org ? String(org["org_type"]) : "person";
    };
    const byType = new Map<string, number>();
    for (const e of active) byType.set(typeOf(e), (byType.get(typeOf(e)) ?? 0) + 1);
    const openE = (e: Rec) => {
      const org = ix.orgs.get(String(e["endorser"]));
      openRel(ix, e, ix.name(e["endorser"]), [
        ["Endorser type", org ? (ORG_TYPE_LABEL[org["org_type"]] ?? String(org["org_type"])) : "Person"],
        ["Date", date(e["date"])],
        ...(e["rescinded"] ? ([["Rescinded", date(e["rescinded"]["date"])]] as [string, string][]) : []),
      ]);
    };
    return {
      state: active.length ? "value" : "zero",
      marks: active.length ? [{ mark: MARK["endorses"]! }] : [{ mark: MARK["none_found"]! }],
      num: String(active.length),
      unit: active.length === 1 ? "endorser" : "endorsers",
      bars: [{ value: active.length, text: String(active.length), tone: "people", mark: MARK["endorses"]! }],
      stamps: [
        ...[...byType.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([t, n]) => `${n} ${(ENDORSER_SHORT[t] ?? ENDORSER_SHORT["other"]!)[n === 1 ? 0 : 1]}`),
        ...(ens.length > active.length ? [`${ens.length - active.length} rescinded`] : []),
      ],
      lines: ens.map((e) => {
        const org = ix.orgs.get(String(e["endorser"]));
        return {
          text: ix.name(e["endorser"]),
          sub: `${org ? (ORG_TYPE_LABEL[org["org_type"]] ?? "") : "Individual"}${e["date"] ? ` · ${date(e["date"])}` : ""}${e["rescinded"] ? ` · rescinded ${date(e["rescinded"]["date"])}` : ""}`,
          strike: !!e["rescinded"],
          cite: { n: cites(e).length, run: () => openE(e) },
        };
      }),
      summary: `${active.length} endorser${active.length === 1 ? "" : "s"}${active.length ? `: ${active.map((e) => ix.name(e["endorser"])).join(", ")}` : ""}`,
      open: () =>
        openDetail({
          kicker: who(c),
          title: "Endorsements",
          history: ens.map((e) => ({
            label: `${ix.name(e["endorser"])}${e["rescinded"] ? " · rescinded" : ""}`,
            text: e["date"] ? `Endorsed ${date(e["date"])}` : "",
            citations: cites(e),
          })),
        }),
    };
  }

  function raisedCell(c: string): Cell {
    const r = rollup(c);
    if (!r || !r.committees.length) return missing(c, "contributions", `Campaign financing: ${who(c)}`);
    const committees = new Set(r.committees);
    const contribs = ix.ofType("contribution").filter((x) => committees.has(String(x["recipient"])));
    const openFilings = () =>
      openDetail({
        kicker: `${who(c)} · from filings`,
        title: "Money raised",
        facts: [
          ["Raised (counted)", money(r.receipts_cents)],
          ...(r.loans_cents ? ([["Loans", money(r.loans_cents)]] as [string, string][]) : []),
          ...(r.excluded.transfer_cents ? ([["Transfers, not counted", money(r.excluded.transfer_cents)]] as [string, string][]) : []),
          ["Committees", r.committees.map((x) => ix.name(x)).join(", ")],
          ...(cutoff ? ([["Filings through", date(cutoff)]] as [string, string][]) : []),
        ],
        history: contribs.map((x) => ({
          label: `${ix.name(x["donor"])} → ${ix.name(x["recipient"])} · ${money(x["money"]["amount_cents"])} · ${String(x["form"]).replace(/_/g, " ")}`,
          text: "",
          citations: cites(x),
        })),
      });
    const max = Math.max(1, ...r.top_donors.map((d) => d.amount_cents));
    const lines: Line[] = [
      { text: `${money(r.receipts_cents)} raised${cutoff ? ` through ${date(cutoff)}` : ""}`, sub: r.committees.map((x) => ix.name(x)).join(", "), more: { label: "Filings", run: openFilings } },
      ...r.top_donors.slice(0, 5).map((d) => ({ text: ix.name(d.donor), sub: money(d.amount_cents), bar: d.amount_cents / max })),
    ];
    if (r.excluded.transfer_cents) lines.push({ text: `Not counted: ${money(r.excluded.transfer_cents)} in transfers between committees.` });
    for (const [k, v] of Object.entries(r.via_conduits)) lines.push({ text: `${money(v)} arrived via ${ix.name(k)} (credited to the original donors).` });
    return {
      state: "value",
      marks: [{ mark: MARK["gives"]! }],
      num: moneyCompact(r.receipts_cents),
      label: "raised",
      bars: [{ value: r.receipts_cents, text: moneyCompact(r.receipts_cents), tone: "money", mark: MARK["gives"]! }],
      lines,
      summary: `${money(r.receipts_cents)} raised from ${r.top_donors.length} listed donor${r.top_donors.length === 1 ? "" : "s"}`,
      open: openFilings,
    };
  }

  function outsideCell(c: string): Cell {
    const ie = rollup(c)?.independent_expenditures;
    if (!ie || !ie.spenders.length) return missing(c, "independent_expenditures", `Outside spending: ${who(c)}`);
    const rels = ix.ofType("independent_expenditure").filter((r) => r["target"] === c);
    const openIe = () =>
      openDetail({
        kicker: `${who(c)} · from filings`,
        title: "Outside spending",
        facts: [
          ["Spent for", money(ie.support_cents)],
          ["Spent against", money(ie.oppose_cents)],
        ],
        history: rels.map((r) => ({
          label: `${ix.name(r["spender"])} · ${money(r["money"]["amount_cents"])} ${r["side"] === "support" ? "for" : "against"}`,
          text: "",
          citations: cites(r),
        })),
      });
    const marks: Cell["marks"] = [];
    if (ie.support_cents || !ie.oppose_cents) marks.push({ mark: MARK["ie_support"]!, text: moneyCompact(ie.support_cents) });
    if (ie.oppose_cents) marks.push({ mark: MARK["ie_oppose"]!, text: moneyCompact(ie.oppose_cents) });
    return {
      state: "value",
      marks,
      label: "outside",
      bars: [
        { value: ie.support_cents, text: moneyCompact(ie.support_cents), tone: "support", mark: MARK["ie_support"]! },
        { value: ie.oppose_cents, text: moneyCompact(ie.oppose_cents), tone: "oppose", mark: MARK["ie_oppose"]! },
      ],
      lines: ie.spenders.map((s) => {
        const rel = rels.find((r) => r["spender"] === s.spender && r["side"] === s.side);
        return {
          text: ix.name(s.spender),
          sub: `${money(s.amount_cents)} ${s.side === "support" ? "for" : "against"}`,
          cite: rel ? { n: cites(rel).length, run: () => openRel(ix, rel, ix.name(s.spender), [["Amount", money(s.amount_cents)], ["Side", s.side]]) } : undefined,
        };
      }),
      summary: `${money(ie.support_cents)} spent for, ${money(ie.oppose_cents)} against`,
      open: openIe,
    };
  }

  // ---- rows and categories ---------------------------------------------------

  const row = (cat: CategoryKey, key: string, kind: RowKind, label: string, short: string, cell: (c: string) => Cell, extra: Partial<Row> = {}): Row => ({
    key,
    kind,
    label,
    short,
    icon: ROW_ICON[key] ?? CATEGORY[cat].icon,
    group: CATEGORY[cat].group,
    cells: cands.map(cell),
    ...extra,
  });

  const subjectText = (s: string) => ix.questions.get(s)?.q["text"] ?? `${ix.contestTitle(s)}: should it pass?`;
  const subjectRowLabel = (s: string) => (ix.questions.has(s) ? humanizeId(s.split("/").pop()!) : ix.contestTitle(s));
  const subjectIcon = (s: string) => (ix.questions.has(s) ? issueIcon(ix.questions.get(s)!.issue["id"]) : MEASURE_ICON);
  /** 1–3 words: the tail of the question id ("expand-skilled-work-visas" -> "Skilled work visas"); measures -> "Prop 40". */
  const subjectShort = (s: string) => {
    if (!ix.questions.has(s)) return ix.contestTitle(s).replace(/^Proposition /, "Prop ");
    const words = humanizeId(s.split("/").pop()!).split(" ");
    const tail = words.slice(-3).join(" ");
    return tail.charAt(0).toUpperCase() + tail.slice(1);
  };
  const stanceRow = (s: string): Row => {
    const q = ix.questions.get(s)?.q;
    return row("shared", s, "stance", subjectRowLabel(s), subjectShort(s), (c) => stanceCell(c, s), {
      icon: subjectIcon(s),
      group: "issue",
      question: subjectText(s),
      defs: q ? [String(q["support_means"]), String(q["oppose_means"])] : ["Votes or campaigns for the measure.", "Votes or campaigns against the measure."],
    });
  };

  const compared = subjects.map((s) => {
    const stances = cands.map((c) => (ix.latest(c, s)?.["stance"] as string | undefined) ?? null);
    const kind = stances.length && stances.every((x) => x && EXPLICIT.has(x)) ? (new Set(stances).size === 1 ? "shared" : "differ") : "incomplete";
    return { s, kind };
  });
  const shared = compared.filter((x) => x.kind === "shared").map((x) => stanceRow(x.s));
  const differ = compared.filter((x) => x.kind === "differ").map((x) => stanceRow(x.s));
  const incomplete = compared.filter((x) => x.kind === "incomplete").map((x) => stanceRow(x.s));

  /**
   * Policy rows grouped by the question's policy area (maintainer decision:
   * areas such as Civil rights and Tech), ballot measures last. Inside an
   * area: shared, then different, then not yet comparable; agenda order within each.
   */
  const AREA_ORDER = ["civil_rights", "tech", "economy", "housing", "health", "energy_environment", "transportation", "public_safety", "government", "other", "measure"];
  const AREA_LABEL: Record<string, string> = {
    civil_rights: "Civil rights",
    tech: "Tech",
    economy: "Economy",
    housing: "Housing",
    health: "Health",
    energy_environment: "Energy & environment",
    transportation: "Transportation",
    public_safety: "Public safety",
    government: "Government",
    other: "Other policies",
    measure: "Ballot measures",
  };
  const KIND_ORDER: Record<string, number> = { shared: 0, differ: 1, incomplete: 2 };
  const areaOf = (s: string) => (ix.questions.has(s) ? String(ix.questions.get(s)!.q["area"] ?? "other") : "measure");
  const policySections = AREA_ORDER.map((area) => {
    const items = compared.filter((x) => areaOf(x.s) === area).sort((a, b) => KIND_ORDER[a.kind]! - KIND_ORDER[b.kind]!);
    if (!items.length) return null;
    const n = (k: string) => items.filter((x) => x.kind === k).length;
    const parts = [n("shared") && `${n("shared")} shared`, n("differ") && `${n("differ")} different`, n("incomplete") && `${n("incomplete")} not yet comparable`].filter(Boolean);
    return { title: `${AREA_LABEL[area] ?? area} · ${parts.join(" · ")}`, rows: items.map((x) => stanceRow(x.s)) };
  }).filter((x): x is { title: string; rows: Row[] } => !!x);

  const firstWords = (s: string, n = 3) => s.split(/\s+/).slice(0, n).join(" ");

  const categories: Category[] = [
    {
      n: 1,
      key: "identity",
      name: "Identity",
      source: "Official biography, certified candidate list",
      rows: [
        row("identity", "age", "value", "Age", "Age", ageCell),
        row("identity", "party", "value", "Party", "Party", (c) => field(c, "party_registration", "Party")),
        row("identity", "origin", "value", "From", "From", (c) => field(c, "birthplace", "Place of origin")),
        row("identity", "residence", "value", "Lives in", "Lives in", (c) => field(c, "residence_city", "Residence")),
      ],
    },
    {
      n: 2,
      key: "occupation",
      name: "Occupation",
      source: "Government records, official biography",
      rows: [row("occupation", "occupation", "value", "Occupation", "Occupation", (c) => field(c, "occupation", "Occupation")), row("occupation", "years", "value", "Years in office", "Years in office", yearsInOffice)],
    },
    {
      n: 3,
      key: "qualifications",
      name: "Qualifications",
      source: "University and official biographies",
      rows: [
        row("qualifications", "education", "value", "Education", "Education", (c) =>
          list(
            c,
            "education",
            "Education",
            (profile(c)["education"]?.["items"] as Rec[]) ?? [],
            (e) => [e["degree"], e["institution"], e["year"]].filter(Boolean).join(", "),
            (e) => String(e["degree"] ?? firstWords(String(e["institution"] ?? ""))),
            ["degree", "degrees"],
          ),
        ),
        row("qualifications", "career", "value", "Career", "Career", (c) =>
          list(
            c,
            "career",
            "Professional experience",
            (profile(c)["career"]?.["items"] as Rec[]) ?? [],
            (e) => `${e["role"]}${e["organization"] ? `, ${e["organization"]}` : ""}${e["start"] ? ` (${e["start"]}–${e["end"] ?? ""})` : ""}`,
            (e) => String(e["role"]),
            ["role", "roles"],
          ),
        ),
        row("qualifications", "past-offices", "value", "Past offices", "Past offices", (c) =>
          list(
            c,
            "offices_held",
            "Previous offices",
            offices(c).filter((o) => !isCurrent(o)),
            officeLine,
            (o) => String(o["office"]),
            ["office", "offices"],
            false,
          ),
        ),
      ],
    },
    {
      n: 4,
      key: "past_policies",
      name: "Past policies",
      source: "Legislative records",
      rows: [row("past_policies", "bills", "bills", "Bills", "Bills", billsCell)],
    },
    {
      n: "5–6",
      key: "shared",
      name: "Policies: shared and different",
      source: "By policy area. ▲|▲ = same side, ▲|▼ = different sides; computed from cited stances (platforms, interviews, voting records)",
      rows: [],
      count: compared.length,
      empty: "No stance questions yet.",
      sections: policySections,
    },
    {
      n: 7,
      key: "endorsements",
      name: "Endorsements",
      source: "Endorser’s own announcement",
      rows: [row("endorsements", "endorsements", "bars", "Endorsers", "Endorsers", endorsementsCell)],
    },
    {
      n: 8,
      key: "financing",
      name: "Campaign financing",
      source: cutoff ? `Campaign finance filings through ${date(cutoff)}` : "Campaign finance filings",
      rows: [row("financing", "raised", "bars", "Raised", "Raised", raisedCell), row("financing", "outside", "bars", "Outside spending", "Outside spending", outsideCell)],
    },
    {
      n: 9,
      key: "performance",
      name: "Performance record",
      source: "Government records",
      rows: [row("performance", "track", "dots", "Documented outcomes", "Outcomes", (c) => section(c, "track_record", "Performance record", ["outcome", "outcomes"]))],
    },
    {
      n: 10,
      key: "controversies",
      name: "Controversies",
      source: "Reporting and primary documents · candidate’s response always shown",
      rows: [row("controversies", "controversies", "dots", "Documented", "Controversies", (c) => section(c, "controversies", "Controversies", ["matter", "matters"]))],
    },
    {
      n: 11,
      key: "promises",
      name: "Campaign promises",
      source: "Campaign platforms",
      rows: [row("promises", "promises", "dots", "Proposals", "Proposals", (c) => section(c, "promises", "Campaign promises", ["proposal", "proposals"]))],
    },
  ];

  // Other unverified leads (topic "other"), grouped by label.
  const otherLabels = [...new Set((ix.leads.get(contestRef) ?? []).filter((l) => l.topic === "other").map((l) => l.label ?? "Other"))];
  const otherRows: Row[] = otherLabels.map((label) =>
    row("promises", `other-${label}`, "lead", label, label, (c) => {
      const ls = leads(c, "other").filter((l) => (l.label ?? "Other") === label);
      if (!ls.length) {
        return { state: "unresearched", marks: [], lines: [], summary: "", open: () => undefined };
      }
      const run = () => openLeads(`${label}: ${who(c)}`, ls);
      return {
        state: "lead",
        marks: [{ mark: MARK["lead"]! }],
        label: "Unverified lead",
        lines: [...ls.map((l) => ({ text: l.text, lead: true })), { text: "", more: { label: "Lead details", run } }],
        summary: `Unverified lead: ${ls.map((l) => l.text).join("; ")}`,
        open: run,
      };
    }),
  );
  for (const r of otherRows) {
    r.icon = ROW_ICON["other"] ?? r.icon;
    r.group = "record";
  }
  if (otherRows.length) {
    const last = categories[categories.length - 1]!;
    last.sections = [...(last.sections ?? []), { title: "Other unverified leads", rows: otherRows }];
  }

  return { cands, categories, counts: { shared: shared.length, differ: differ.length, incomplete: incomplete.length } };
}
