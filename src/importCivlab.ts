/**
 * Office connections from the CivLab government graph (graph.civlab.org,
 * by Michael Adams). CivLab maps two governments: San Francisco (`sf`) and
 * the U.S. federal government (`us`). It describes each position by its
 * connections (who elects it, what it elects, appoints, confirms, oversees,
 * which bodies advise it) and its legal basis; never by rank.
 *
 * For every office whose `links.civlab` points at a CivLab node page, this
 * computes `connections` from the graph's edges and cites them:
 * - counts computed from graph data: `unverified` (method "computed from
 *   CivLab graph data"), with a locator naming the edges counted;
 * - phrases taken from the node description: verbatim `quote`.
 * CivLab is a secondary source (`reference_work`); primary sources (the
 * charter or constitution it links as `legalSourceUrl`) still need checking.
 *
 * Pure function of (data files, graph JSON, today): same inputs, same bytes.
 * No license or terms were found for CivLab's data, so nothing is copied in
 * bulk: only counts, body names and short quotes, each cited.
 */
import { CONNECTION_ORDER } from "./canonical.js";
import type { FileMap, Rec } from "./dataset.js";
import { cmp } from "./ids.js";
import { put, type PutResult } from "./put.js";

export interface CivlabNode {
  id: string;
  name?: string;
  type?: string;
  description?: string;
  aliases?: string[] | null;
  seatsCount?: number | null;
  legalSourceUrl?: string | null;
  officialUrl?: string | null;
}
export interface CivlabEdge {
  id?: string;
  type: string;
  fromId: string;
  toId: string;
  seatsAppointed?: number | null;
  metadata?: Record<string, unknown> | null;
}
export interface CivlabGraph {
  nodes: Record<string, CivlabNode>;
  edges: CivlabEdge[] | Record<string, CivlabEdge>;
  budget?: { totalSpendingBudget?: number | null; departments?: Record<string, { currentBudget?: { fiscalYear?: number | null } | null }> };
}

const CIVLAB_URL = /^https:\/\/graph\.civlab\.org\/([a-z0-9-]+)\/([a-z-]+)\/([a-z0-9_-]+)\/?$/;

export function parseCivlabUrl(url: string): { gov: string; section: string; slug: string } | null {
  const m = CIVLAB_URL.exec(url);
  return m ? { gov: m[1]!, section: m[2]!, slug: m[3]! } : null;
}

const isCivlabUrl = (url: unknown): boolean => typeof url === "string" && /^https?:\/\/graph\.civlab\.org\//.test(url);

/** The Next.js build id a CivLab gov page preloads its graph data under. */
export function buildIdFromHtml(html: string, gov: string): string | null {
  const m = new RegExp(`/_next/data/([^/"]+)/graph/${gov}\\.json`).exec(html) ?? /"buildId":"([^"]+)"/.exec(html);
  return m ? m[1]! : null;
}

export function graphDataUrl(gov: string, buildId: string): string {
  return `https://graph.civlab.org/_next/data/${buildId}/graph/${gov}.json`;
}

/** Accepts the raw Next.js data payload or the bare graph. */
export function graphFromPayload(payload: unknown): CivlabGraph {
  const p = (payload ?? {}) as Rec;
  const g = ((p["pageProps"] as Rec | undefined)?.["data"] ?? p) as CivlabGraph;
  if (!g || typeof g !== "object" || !g.nodes || !g.edges) throw new Error("not a CivLab graph payload (expected pageProps.data.nodes/edges)");
  return g;
}

const edgesOf = (g: CivlabGraph): CivlabEdge[] => (Array.isArray(g.edges) ? g.edges : Object.values(g.edges));

/** Abbreviations that end in a period without ending a sentence ("U.S.", "Art.", "Sec."). */
const ABBREV = /(?:\b[A-Z]\.|\b(?:art|arts|sec|secs|cl|ch|no|nos|st|mr|mrs|ms|dr|jr|sr|vs|etc|inc|co|corp|dept|gov|e\.g|i\.e)\.)$/i;

/**
 * Sentences of a description, each an exact substring (so it can be quoted
 * verbatim). Splits after . ! ? when the next word starts a new sentence,
 * but not after abbreviations such as "U.S." or "Art.".
 */
export function sentences(text: string): string[] {
  const out: string[] = [];
  const end = /[.!?]+["'”’)\]]*(?=\s+["“(]?[A-Z0-9])/g;
  let start = 0;
  for (let m = end.exec(text); m; m = end.exec(text)) {
    const stop = m.index + m[0].length;
    if (ABBREV.test(text.slice(start, m.index + 1))) continue;
    out.push(text.slice(start, stop).trim());
    start = stop;
  }
  out.push(text.slice(start).trim());
  return out.filter(Boolean);
}

const VERB: Record<"confirms" | "oversees", RegExp> = {
  confirms: /\bconfirms?\b[^,;:]*/i,
  oversees: /\boversees?\b[^,;:]*/i,
};

/**
 * The clause of one sentence that starts with the verb, up to the next , ; or :
 * or the end of the sentence, e.g. "confirms mayoral appointments". Periods
 * inside the clause ("U.S.") are kept; only the closing punctuation is dropped.
 */
export function verbClause(sentence: string, type: "confirms" | "oversees"): string | null {
  const m = VERB[type].exec(sentence);
  return m ? m[0].trim().replace(/[.!?]+["'”’)\]]*$/, "").trim() || null : null;
}

/** Name of the body an appointment edge lands on, for grouping seats by body. */
function bodyName(g: CivlabGraph, e: CivlabEdge): string {
  const m = e.metadata ?? {};
  for (const k of ["advisory_entity", "commission", "commission_name"]) {
    if (typeof m[k] === "string" && m[k]) return String(m[k]);
  }
  const n = g.nodes[e.toId];
  if (n?.name) return n.name;
  const bare = e.toId.replace(/-(member|seat)-\d+$/, "");
  return g.nodes[bare]?.name ?? bare;
}

const nameOf = (g: CivlabGraph, id: string) => g.nodes[id]?.name ?? id;
const seats = (es: CivlabEdge[]) => es.reduce((a, e) => a + (typeof e.seatsAppointed === "number" ? e.seatsAppointed : 0), 0);
const uniq = (xs: string[]) => [...new Set(xs)].sort(cmp);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const withThe = (name: string) => (/^(the|a|an)\s/i.test(name) ? name : `the ${name}`);
const listJoin = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Name of a connected position for a text line. CivLab names some heads
 * "<Title> of The <Body>" even when the title already names the body
 * ("Speaker of the House of The House of Representatives"); that repeated
 * body reference is dropped. `targets` keep CivLab's own names.
 */
export function displayName(g: CivlabGraph, nodeId: string, targetId: string): string {
  const name = nameOf(g, targetId);
  const node = g.nodes[nodeId];
  const refs = [node?.name, ...(node?.aliases ?? [])].filter((x): x is string => !!x);
  for (const r of refs) {
    const suffix = ` of ${r}`;
    if (!name.toLowerCase().endsWith(suffix.toLowerCase())) continue;
    const rest = name.slice(0, -suffix.length);
    if (refs.some((x) => x !== r && new RegExp(`\\b${escapeRe(x)}$`, "i").test(rest))) return rest;
  }
  return name;
}

export interface CivlabFacts {
  connections: Rec[];
  legalUrl?: string;
  officialUrl?: string;
  seatsCount?: number;
  /** Term length stated in the description ("elected to two-year terms"). */
  term?: { years: number; quote: string };
  /** Description sentences about powers or authority, each quotable on its own. */
  powers?: string[];
}

const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const TERM = /\b(?:elected to|serves?|serving)\s+(?:staggered\s+)?(\w+)-year\s+terms?\b/i;

/**
 * Connections for one node. `computed(locator)` and `quoted(sentence)` build
 * citations against the node's source.
 */
export function civlabFacts(g: CivlabGraph, gov: string, nodeId: string, computed: (locator: string) => Rec, quoted: (q: string) => Rec): CivlabFacts {
  const node = g.nodes[nodeId];
  if (!node) throw new Error(`CivLab node not found: ${gov}/${nodeId}`);
  const es = edgesOf(g);
  const out = es.filter((e) => e.fromId === nodeId);
  const inn = es.filter((e) => e.toId === nodeId);
  const loc = (what: string) => `graph/${gov}.json · ${what}`;
  const conns: Rec[] = [];
  const sents = sentences(node.description ?? "");

  const electedBy = inn.filter((e) => e.type === "elects");
  if (electedBy.length) {
    const n = seats(electedBy);
    const from = uniq(electedBy.map((e) => nameOf(g, e.fromId)));
    conns.push({
      type: "elected_by",
      ...(n ? { count: n } : {}),
      targets: from,
      text: `Elected by ${listJoin(from.map(withThe))}${n ? ` (${plural(n, "seat")})` : ""}`,
      citations: [computed(loc(`${plural(electedBy.length, "elects edge")} to ${nodeId}, seats from seatsAppointed`))],
    });
  }

  const elects = out.filter((e) => e.type === "elects");
  if (elects.length) {
    const to = uniq(elects.map((e) => nameOf(g, e.toId)));
    const shown = uniq(elects.map((e) => displayName(g, nodeId, e.toId)));
    conns.push({
      type: "elects",
      ...(to.length > 1 ? { count: to.length } : {}),
      targets: to,
      text: `Elects ${listJoin(shown.map(withThe))}`,
      citations: [computed(loc(`${plural(elects.length, "elects edge")} from ${nodeId}`))],
    });
  }

  const appoints = out.filter((e) => e.type === "appoints");
  if (appoints.length) {
    const n = seats(appoints);
    const bodies = uniq(appoints.map((e) => bodyName(g, e)));
    const where = bodies.length === 1 ? withThe(bodies[0]!) : `${bodies.length} boards, commissions and other posts`;
    conns.push({
      type: "appoints",
      ...(n ? { count: n } : {}),
      bodies: bodies.length,
      targets: bodies,
      text: n ? `Appoints ${plural(n, "seat")} on ${where}` : `Appoints members of ${where}`,
      citations: [computed(loc(`${plural(appoints.length, "appoints edge")} from ${nodeId}; seats summed from seatsAppointed; bodies grouped by metadata.advisory_entity / commission, else the target node`))],
    });
  }

  for (const type of ["confirms", "oversees"] as const) {
    const edges = out.filter((e) => e.type === type);
    const sentence = sents.find((s) => verbClause(s, type) !== null);
    const clause = sentence ? verbClause(sentence, type) : null;
    if (!edges.length && !clause) continue;
    const to = uniq(edges.map((e) => nameOf(g, e.toId)));
    const citations: Rec[] = [];
    if (sentence) citations.push(quoted(sentence));
    if (edges.length) citations.push(computed(loc(`${plural(edges.length, `${type} edge`)} from ${nodeId}`)));
    const verb = type === "confirms" ? "Confirms" : "Oversees";
    const text = clause ? capitalize(clause) : to.length <= 3 ? `${verb} ${listJoin(to.map(withThe))}` : `${verb} ${plural(to.length, "position or body", "positions and bodies")}`;
    conns.push({ type, ...(edges.length ? { count: edges.length, targets: to } : {}), text, citations });
  }

  const advisedBy = inn.filter((e) => e.type === "advises");
  if (advisedBy.length) {
    const from = uniq(advisedBy.map((e) => nameOf(g, e.fromId)));
    conns.push({
      type: "advised_by",
      count: from.length,
      targets: from,
      text: from.length === 1 ? `Advised by ${withThe(from[0]!)}` : `Advised by ${from.length} bodies`,
      citations: [computed(loc(`${plural(advisedBy.length, "advises edge")} to ${nodeId}`))],
    });
  }

  conns.sort((a, b) => CONNECTION_ORDER.indexOf(String(a["type"])) - CONNECTION_ORDER.indexOf(String(b["type"])));

  const facts: CivlabFacts = { connections: conns };
  if (node.legalSourceUrl) facts.legalUrl = node.legalSourceUrl;
  if (node.officialUrl) facts.officialUrl = node.officialUrl;
  if (typeof node.seatsCount === "number" && node.seatsCount > 0) facts.seatsCount = node.seatsCount;
  const termSentence = sents.find((s) => TERM.test(s));
  if (termSentence) {
    const w = TERM.exec(termSentence)![1]!.toLowerCase();
    const years = WORD_NUM[w] ?? Number(w);
    if (Number.isInteger(years) && years > 0) facts.term = { years, quote: termSentence };
  }
  const powers = sents.filter((s) => /\b(powers?|authority)\b/i.test(s));
  if (powers.length) facts.powers = powers;
  return facts;
}

export interface CivlabImport {
  writes: Map<string, string>;
  results: PutResult[];
  report: string[];
}

/** Fiscal year(s) of CivLab's department budgets, e.g. "FY2027". */
function budgetYears(g: CivlabGraph): string {
  const ys = uniq(
    Object.values(g.budget?.departments ?? {})
      .map((d) => d?.currentBudget?.fiscalYear)
      .filter((y): y is number => typeof y === "number")
      .map(String),
  );
  return ys.length ? ys.map((y) => `FY${y}`).join("/") : "FY?";
}

/**
 * Apply CivLab facts to every office with links.civlab whose gov graph is in
 * `graphs`. Existing values are never overwritten; mismatches are reported
 * for a human to decide. Connections:
 * - a connection from other research (no CivLab citation) is kept as is,
 *   even when CivLab has the same type (the CivLab text is reported);
 * - a connection from an earlier CivLab import is recomputed, keeping any
 *   non-CivLab citations someone added; one CivLab no longer supports is
 *   dropped (or, if it has other citations, kept without the CivLab ones);
 * - types CivLab provides that the office lacks are added.
 */
export function importCivlab(files: FileMap, graphs: Record<string, CivlabGraph>, opts: { dataDir: string; today: string }): CivlabImport {
  const working = new Map(files);
  const writes = new Map<string, string>();
  const results: PutResult[] = [];
  const report: string[] = [];
  const apply = (res: PutResult) => {
    results.push(res);
    if (res.content !== undefined) {
      working.set(res.file, res.content);
      writes.set(res.file, res.content);
    }
    return res;
  };
  const isCivlabRef = (ref: unknown): boolean => {
    const text = typeof ref === "string" && ref.startsWith("src:") ? working.get(`sources/${ref.slice(4)}.json`) : undefined;
    return !!text && isCivlabUrl((JSON.parse(text) as Rec)["url"]);
  };
  const citesOf = (v: unknown): Rec[] => ((v as Rec | undefined)?.["citations"] as Rec[] | undefined) ?? [];

  const offices = [...working.keys()].filter((f) => /^offices\/[^/]+\.json$/.test(f)).sort(cmp);
  for (const file of offices) {
    const office = JSON.parse(working.get(file)!) as Rec;
    const url = (office["links"] as Rec | undefined)?.["civlab"] as string | undefined;
    if (!url) continue;
    const parsed = parseCivlabUrl(url);
    if (!parsed) {
      report.push(`${file}: links.civlab is not a CivLab node URL: ${url}`);
      continue;
    }
    const g = graphs[parsed.gov];
    if (!g) {
      report.push(`${file}: no graph loaded for gov "${parsed.gov}"; skipped`);
      continue;
    }
    const node = g.nodes[parsed.slug];
    if (!node) {
      report.push(`${file}: node ${parsed.gov}/${parsed.slug} not in the graph; skipped`);
      continue;
    }
    const src = apply(
      put(
        working,
        "source",
        {
          url,
          kind: "reference_work",
          title: `CivLab · ${node.name ?? parsed.slug}`,
          publisher: "CivLab",
          accessed: opts.today,
          notes:
            "CivLab government graph (graph.civlab.org, by Michael Adams). Secondary source: its legalSourceUrl points to the primary text. No license or terms were found; only counts, body names and short quotes are recorded.",
        },
        { dataDir: opts.dataDir, mode: "create", today: opts.today },
      ),
    );
    if (!src.ref) {
      report.push(`${file}: could not register the CivLab source: ${src.message ?? JSON.stringify(src.problems)}`);
      continue;
    }
    const source = src.ref;
    const computed = (locator: string): Rec => ({ source, locator, unverified: { by: "import:civlab", method: "computed from CivLab graph data", date: opts.today } });
    const quoted = (quote: string): Rec => ({ source, quote, locator: "node description" });
    const facts = civlabFacts(g, parsed.gov, parsed.slug, computed, quoted);
    const next: Rec = { ...office };

    // Connections.
    const fresh = new Map(facts.connections.map((c) => [String(c["type"]), c]));
    const connections: Rec[] = [];
    for (const old of (office["connections"] as Rec[] | undefined) ?? []) {
      const type = String(old["type"]);
      const ours = citesOf(old).filter((c) => !isCivlabRef(c["source"]));
      const civ = fresh.get(type);
      fresh.delete(type);
      if (ours.length === citesOf(old).length) {
        connections.push(old);
        if (civ && civ["text"] !== old["text"]) report.push(`${file}: connections.${type} kept ours ("${String(old["text"])}"); CivLab: "${String(civ["text"])}"`);
      } else if (civ) {
        connections.push({ ...civ, citations: [...citesOf(civ), ...ours] });
      } else if (ours.length) {
        connections.push({ ...old, citations: ours });
        report.push(`${file}: connections.${type} is no longer in CivLab; kept with its other citations`);
      } else {
        report.push(`${file}: connections.${type} is no longer in CivLab; dropped`);
      }
    }
    connections.push(...fresh.values());
    if (connections.length) next["connections"] = connections;
    else delete next["connections"];

    const links = { ...((office["links"] as Rec | undefined) ?? {}) };
    if (facts.officialUrl && !links["official_site"]) links["official_site"] = facts.officialUrl;
    else if (facts.officialUrl && links["official_site"] !== facts.officialUrl) report.push(`${file}: links.official_site differs from CivLab (${facts.officialUrl}); kept ours`);
    next["links"] = links;

    if (facts.legalUrl) {
      const lb = office["legal_basis"] as Rec | undefined;
      if (!lb) next["legal_basis"] = { url: facts.legalUrl, citations: [computed(`graph/${parsed.gov}.json · ${parsed.slug}.legalSourceUrl`)] };
      else if (lb["url"] !== facts.legalUrl) report.push(`${file}: legal_basis.url differs from CivLab (${facts.legalUrl}); kept ours`);
    }

    const ourSeats = (office["seats"] as Rec | undefined)?.["value"];
    if (facts.seatsCount !== undefined && ourSeats !== undefined && ourSeats !== facts.seatsCount) {
      report.push(`${file}: seats ${String(ourSeats)} vs CivLab seatsCount ${facts.seatsCount}; kept ours`);
    }

    if (facts.term) {
      const t = office["term_years"] as Rec | undefined;
      const cite = quoted(facts.term.quote);
      if (!t) next["term_years"] = { value: facts.term.years, citations: [cite] };
      else if (t["value"] === facts.term.years) next["term_years"] = { ...t, citations: withCitation(citesOf(t), cite) };
      else report.push(`${file}: term_years ${String(t["value"])} vs CivLab "${facts.term.quote}"; kept ours`);
    }

    if (facts.powers) {
      const p = office["powers"] as Rec | undefined;
      const quotes = facts.powers.map(quoted);
      if (!p) next["powers"] = { value: facts.powers.join(" "), citations: quotes };
      else if (!quotes.every((q) => citesOf(p).some((c) => c["source"] === q["source"] && c["quote"] === q["quote"]))) {
        report.push(`${file}: has powers; CivLab says "${facts.powers.join(" ")}" (review by hand)`);
      }
    }

    if (g.budget?.totalSpendingBudget) {
      report.push(
        `${file}: CivLab ${parsed.gov} totalSpendingBudget ${g.budget.totalSpendingBudget} (${budgetYears(g)}); not written: whether this body adopts that budget is a human call`,
      );
    }

    apply(put(working, "office", next, { dataDir: opts.dataDir, mode: "replace", today: opts.today }));
  }
  return { writes, results, report };
}

function withCitation(list: Rec[], c: Rec): Rec[] {
  const same = (a: Rec) => a["source"] === c["source"] && a["quote"] === c["quote"];
  return list.some(same) ? list : [...list, c];
}
