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
  budget?: { totalSpendingBudget?: number | null; departments?: Record<string, { currentBudget?: { fiscalYear?: number } }> };
}

const CIVLAB_URL = /^https:\/\/graph\.civlab\.org\/([a-z0-9-]+)\/([a-z-]+)\/([a-z0-9_-]+)\/?$/;

export function parseCivlabUrl(url: string): { gov: string; section: string; slug: string } | null {
  const m = CIVLAB_URL.exec(url);
  return m ? { gov: m[1]!, section: m[2]!, slug: m[3]! } : null;
}

/** The buildId-addressed data URL that a CivLab gov page preloads. */
export function buildIdFromHtml(html: string, gov: string): string | null {
  const m = new RegExp(`/_next/data/([^/"]+)/graph/${gov}\\.json`).exec(html) ?? /"buildId":"([^"]+)"/.exec(html);
  return m ? m[1]! : null;
}

export function graphDataUrl(gov: string, buildId: string): string {
  return `https://graph.civlab.org/_next/data/${buildId}/graph/${gov}.json`;
}

/** Accepts the raw Next.js data payload or the bare graph. */
export function graphFromPayload(payload: unknown): CivlabGraph {
  const p = payload as Rec;
  const g = ((p["pageProps"] as Rec | undefined)?.["data"] ?? p) as CivlabGraph;
  if (!g || typeof g !== "object" || !g.nodes || !g.edges) throw new Error("not a CivLab graph payload (expected pageProps.data.nodes/edges)");
  return g;
}

const edgesOf = (g: CivlabGraph): CivlabEdge[] => (Array.isArray(g.edges) ? g.edges : Object.values(g.edges));

function sentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+/g) ?? [text]).map((s) => s.trim()).filter(Boolean);
}

const VERB: Record<string, RegExp> = {
  confirms: /\bconfirms?\b[^,.;]*/i,
  oversees: /\boversees?\b[^,.;]*/i,
};

/** Name of the body an edge lands on, for grouping appointments by body. */
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

export interface CivlabFacts {
  connections: Rec[];
  legalUrl?: string;
  officialUrl?: string;
  seatsCount?: number;
  /** Term length stated in the description ("elected to two-year terms"). */
  term?: { years: number; quote: string };
  /** Description sentences about powers/authority, for an office without `powers`. */
  powers?: string;
}

const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, eight: 8 };

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
  const desc = node.description ?? "";
  const sents = sentences(desc);

  const electedBy = inn.filter((e) => e.type === "elects");
  if (electedBy.length) {
    const n = seats(electedBy);
    const from = uniq(electedBy.map((e) => nameOf(g, e.fromId)));
    conns.push({
      type: "elected_by",
      ...(n ? { count: n } : {}),
      targets: from,
      text: `Elected by ${from.join(", ")}${n ? `: ${plural(n, "seat")}` : ""}`,
      citations: [computed(loc(`${plural(electedBy.length, "elects edge")} to ${nodeId}`))],
    });
  }

  const elects = out.filter((e) => e.type === "elects");
  if (elects.length) {
    const to = uniq(elects.map((e) => nameOf(g, e.toId)));
    conns.push({ type: "elects", targets: to, text: `Elects the ${to.join(", ")}`, citations: [computed(loc(`${plural(elects.length, "elects edge")} from ${nodeId}`))] });
  }

  const appoints = out.filter((e) => e.type === "appoints");
  if (appoints.length) {
    const n = seats(appoints);
    const bodies = uniq(appoints.map((e) => bodyName(g, e)));
    conns.push({
      type: "appoints",
      ...(n ? { count: n } : {}),
      bodies: bodies.length,
      targets: bodies,
      text: `Appoints ${n ? `${plural(n, "seat")} on ` : "members of "}${plural(bodies.length, "board, commission or position", "boards, commissions and positions")}`,
      citations: [computed(loc(`${plural(appoints.length, "appoints edge")} from ${nodeId}, seats summed from seatsAppointed`))],
    });
  }

  for (const type of ["confirms", "oversees"] as const) {
    const edges = out.filter((e) => e.type === type);
    const sentence = sents.find((s) => VERB[type]!.test(s));
    const phrase = sentence ? VERB[type]!.exec(sentence)![0].trim() : null;
    if (!edges.length && !phrase) continue;
    const to = uniq(edges.map((e) => nameOf(g, e.toId)));
    const citations: Rec[] = [];
    if (sentence) citations.push(quoted(sentence));
    if (edges.length) citations.push(computed(loc(`${plural(edges.length, `${type} edge`)} from ${nodeId}`)));
    const text = phrase
      ? phrase.charAt(0).toUpperCase() + phrase.slice(1)
      : `${type === "confirms" ? "Confirms" : "Oversees"} ${plural(to.length, "position or body", "positions or bodies")}`;
    conns.push({ type, ...(edges.length ? { count: edges.length, targets: to } : {}), text, citations });
  }

  const advisedBy = inn.filter((e) => e.type === "advises");
  if (advisedBy.length) {
    const from = uniq(advisedBy.map((e) => nameOf(g, e.fromId)));
    conns.push({ type: "advised_by", count: from.length, targets: from, text: `Advised by ${plural(from.length, "body", "bodies")}`, citations: [computed(loc(`${plural(advisedBy.length, "advises edge")} to ${nodeId}`))] });
  }

  conns.sort((a, b) => CONNECTION_ORDER.indexOf(String(a["type"])) - CONNECTION_ORDER.indexOf(String(b["type"])));

  const facts: CivlabFacts = { connections: conns };
  if (node.legalSourceUrl) facts.legalUrl = node.legalSourceUrl;
  if (node.officialUrl) facts.officialUrl = node.officialUrl;
  if (typeof node.seatsCount === "number" && node.seatsCount > 0) facts.seatsCount = node.seatsCount;
  const termSentence = sents.find((s) => /elected to (?:staggered )?(\w+)-year terms?/i.test(s));
  if (termSentence) {
    const w = /elected to (?:staggered )?(\w+)-year terms?/i.exec(termSentence)![1]!.toLowerCase();
    const years = WORD_NUM[w] ?? Number(w);
    if (Number.isFinite(years) && years > 0) facts.term = { years, quote: termSentence };
  }
  const powers = sents.filter((s) => /\b(power|authority)\b/i.test(s));
  if (powers.length) facts.powers = powers.join(" ");
  return facts;
}

export interface CivlabImport {
  writes: Map<string, string>;
  results: PutResult[];
  report: string[];
}

/**
 * Apply CivLab facts to every office with links.civlab whose gov graph is in
 * `graphs`. Connections of the types CivLab provides are replaced; other
 * types (from other research) are kept. Existing values are never
 * overwritten: mismatches are reported for a human to decide.
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
    const source = src.ref!;
    const computed = (locator: string): Rec => ({ source, locator, unverified: { by: "import:civlab", method: "computed from CivLab graph data", date: opts.today } });
    const quoted = (quote: string): Rec => ({ source, quote, locator: "node description" });
    const facts = civlabFacts(g, parsed.gov, parsed.slug, computed, quoted);

    const next: Rec = { ...office };
    const provided = new Set(facts.connections.map((c) => String(c["type"])));
    const kept = ((office["connections"] as Rec[] | undefined) ?? []).filter((c) => !provided.has(String(c["type"])));
    const connections = [...kept, ...facts.connections];
    if (connections.length) next["connections"] = connections;

    const links = { ...((office["links"] as Rec | undefined) ?? {}) };
    if (facts.officialUrl && !links["official_site"]) links["official_site"] = facts.officialUrl;
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
      else if (t["value"] === facts.term.years) next["term_years"] = { ...t, citations: withCitation(t["citations"] as Rec[], cite) };
      else report.push(`${file}: term_years ${String(t["value"])} vs CivLab "${facts.term.quote}"; kept ours`);
    }

    if (facts.powers) {
      if (!office["powers"]) next["powers"] = { value: facts.powers, citations: [quoted(facts.powers)] };
      else report.push(`${file}: has powers; CivLab says "${facts.powers}" (review by hand)`);
    }

    if (parsed.gov === "sf" && g.budget?.totalSpendingBudget) {
      const fy = Object.values(g.budget.departments ?? {}).map((d) => d.currentBudget?.fiscalYear).find((y) => typeof y === "number");
      report.push(`${file}: CivLab city budget ${g.budget.totalSpendingBudget} (FY${fy ?? "?"}); budget is a human call (does this body adopt it?)`);
    }

    apply(put(working, "office", next, { dataDir: opts.dataDir, mode: "replace", today: opts.today }));
  }
  return { writes, results, report };
}

function withCitation(list: Rec[] | undefined, c: Rec): Rec[] {
  const xs = [...(list ?? [])];
  const same = (a: Rec) => a["source"] === c["source"] && a["quote"] === c["quote"];
  return xs.some(same) ? xs : [...xs, c];
}
