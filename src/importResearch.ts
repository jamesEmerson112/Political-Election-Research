/**
 * Import a research batch (agent web-research output, see
 * docs/RESEARCH_BATCH_FORMAT.md) as research agendas + unverified leads.
 *
 * Deterministic: person refs come from slugify(name), never from the batch;
 * lead text is built from the batch fields in a fixed order; existing agendas
 * are never modified (differences are reported instead); leads are appended
 * with de-duplication. Nothing here becomes a cited claim.
 */
import type { FileMap, Rec } from "./dataset.js";
import { slugify } from "./ids.js";
import { put, type PutResult } from "./put.js";

export interface BatchSource {
  url: string;
  publisher?: string;
  seen?: string;
  tier?: string;
}
export interface BatchFact {
  topic: string;
  label?: string;
  text: string;
  /** Stance the source states explicitly (stance topics only). A hint, never a finding. */
  hint?: "support" | "oppose" | "mixed" | null;
  sources?: BatchSource[];
}
export interface BatchCandidate {
  name: string;
  party?: string | null;
  ballot_designation?: string | null;
  incumbent?: boolean | null;
  facts?: BatchFact[];
}
export interface BatchContest {
  contest: string;
  office?: string;
  district?: number | null;
  candidate_list_sources?: BatchSource[];
  candidates: BatchCandidate[];
  notes?: string;
}

export interface ImportReport {
  contest: string;
  agenda: "created" | "kept";
  candidates: string[];
  agendaDiffers?: string;
  leadsAdded: number;
  results: PutResult[];
}

const TOPIC_RE =
  /^(?:profile\.(?:party_registration|birth_date|birthplace|occupation|residence_city|offices_held|education|career)|dossier\.(?:track_record|promises|controversies)|q:[a-z0-9-]+\/[a-z0-9-]+|contest:[a-z0-9-]+\/[a-z0-9-]+|legislation|endorsements|committee|contributions|independent_expenditures|other)$/;

function cite(sources: BatchSource[] | undefined): string {
  if (!sources?.length) return " (no source given)";
  return (
    " (sources: " +
    sources
      .map((s) => `${s.publisher ?? "source"} ${s.url} [${s.seen ?? "search summary"}, ${s.tier ?? "unrated"}]`)
      .join("; ") +
    ")"
  );
}

function leadsFor(c: BatchContest): Rec[] {
  const items: Rec[] = [];
  for (const cand of c.candidates) {
    const person = `person:${slugify(cand.name)}`;
    const listSrc = cite(c.candidate_list_sources);
    if (c.candidate_list_sources?.length) {
      items.push({ person, topic: "other", label: "On the ballot", text: `Listed as a candidate for this contest.${listSrc}` });
    }
    if (cand.party) {
      items.push({ person, topic: "profile.party_registration", label: "Party", text: `${cand.party}${listSrc}` });
    }
    if (cand.ballot_designation) {
      items.push({ person, topic: "other", label: "Ballot designation", text: `"${cand.ballot_designation}"${listSrc}` });
    }
    if (cand.incumbent === true || cand.incumbent === false) {
      items.push({ person, topic: "other", label: "Incumbent", text: `${cand.incumbent ? "Yes" : "No"}${listSrc}` });
    }
    for (const f of cand.facts ?? []) {
      const topic = TOPIC_RE.test(f.topic) ? f.topic : "other";
      const lead: Rec = { person, topic, label: f.label ?? f.topic, text: `${f.text}${cite(f.sources)}` };
      if (f.hint && (topic.startsWith("q:") || topic.startsWith("contest:"))) lead["hint"] = f.hint;
      items.push(lead);
    }
  }
  return items;
}

export function importBatch(files: FileMap, batch: BatchContest[], opts: { dataDir: string; today: string }): {
  writes: Map<string, string>;
  reports: ImportReport[];
} {
  const working = new Map(files);
  const writes = new Map<string, string>();
  const reports: ImportReport[] = [];
  const apply = (res: PutResult) => {
    if (res.content !== undefined) {
      working.set(res.file, res.content);
      writes.set(res.file, res.content);
    }
    return res;
  };

  for (const c of batch) {
    const contestId = c.contest.replace(/^contest:/, "");
    const candidates = c.candidates.map((x) => ({ person: `person:${slugify(x.name)}`, name: x.name }));
    const report: ImportReport = { contest: c.contest, agenda: "kept", candidates: candidates.map((x) => x.person), leadsAdded: 0, results: [] };

    const agendaPath = `agenda/${contestId}.json`;
    const existing = working.get(agendaPath);
    if (existing === undefined) {
      report.results.push(
        apply(
          put(
            working,
            "agenda",
            {
              contest: c.contest,
              kind: "office",
              candidates,
              questions: [],
              measures: [],
              targets: { endorsements_per_candidate: 5, top_contributors: 10, finance_cutoff: null },
              seeded: {
                date: opts.today,
                note: `Candidates seeded from a research agent's web-search summaries (see data/leads); unverified until the contest file cites the Secretary of State certified list. No stance questions set yet.${c.notes ? ` Research notes: ${c.notes}` : ""}`,
              },
            },
            { dataDir: opts.dataDir, mode: "create", today: opts.today },
          ),
        ),
      );
      report.agenda = "created";
    } else {
      const have = ((JSON.parse(existing) as Rec)["candidates"] as Rec[]).map((x) => String(x["person"])).sort();
      const got = [...report.candidates].sort();
      if (JSON.stringify(have) !== JSON.stringify(got)) {
        report.agendaDiffers = `agenda has ${have.join(", ")}; batch has ${got.join(", ")}`;
      }
    }

    const leadsPath = `leads/${contestId}.json`;
    const current = working.get(leadsPath);
    const prev: Rec = current
      ? (JSON.parse(current) as Rec)
      : {
          contest: c.contest,
          provided: {
            by: "research agent (web search summaries)",
            date: opts.today,
            note: "Basic candidate information found through web search summaries; pages were not opened. Each item names its sources for the maintainer to verify before anything is recorded with citations.",
          },
          items: [],
        };
    const seen = new Set((prev["items"] as Rec[]).map((i) => `${i["person"]}|${i["topic"]}|${i["text"]}`));
    const fresh = leadsFor(c).filter((i) => !seen.has(`${i["person"]}|${i["topic"]}|${i["text"]}`));
    report.leadsAdded = fresh.length;
    if (fresh.length) {
      const { $schema: _s, ...rest } = prev;
      report.results.push(
        apply(
          put(working, "leads", { ...rest, items: [...(prev["items"] as Rec[]), ...fresh] }, {
            dataDir: opts.dataDir,
            mode: current ? "replace" : "create",
            today: opts.today,
          }),
        ),
      );
    }
    reports.push(report);
  }
  return { writes, reports };
}
