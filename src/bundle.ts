/**
 * A read-only snapshot of a data directory for consumers (the web app, the
 * SQLite export): every record plus everything the tooling computes from them
 * (validation, research queue, parity coverage, funding rollups). Consumers
 * never re-implement this logic.
 */
import { readDataDir, type Rec } from "./dataset.js";
import { cmp } from "./ids.js";
import { coverage, nextTasks, type Coverage, type Task } from "./research.js";
import { rollupCandidate, type CandidateRollup } from "./rollup.js";
import { validateFiles, type Problem } from "./validate.js";

export interface Bundle {
  label: string;
  fictional: boolean;
  today: string;
  validation: { errors: number; warnings: number; problems: Problem[] };
  config: Rec | null;
  elections: Rec[];
  contests: Rec[];
  agendas: Rec[];
  leads: Rec[];
  issues: Rec[];
  people: Rec[];
  organizations: Rec[];
  bills: Rec[];
  offices: Rec[];
  dossiers: Rec[];
  positions: Rec[];
  relationships: Rec[];
  sources: Rec[];
  tasks: Task[];
  /** contest ref -> parity matrix (office agendas only). */
  coverage: Record<string, Coverage>;
  /** contest ref -> person ref -> computed funding (through the agenda's finance cutoff when set). */
  rollups: Record<string, Record<string, CandidateRollup>>;
}

function strip(rec: Rec): Rec {
  const { $schema: _schema, ...rest } = rec;
  return rest;
}

function values(m: Map<string, Rec>): Rec[] {
  return [...m.entries()].sort(([a], [b]) => cmp(a, b)).map(([, v]) => strip(v));
}

export function buildBundle(dataDir: string, opts: { label: string; fictional: boolean; today: string }): Bundle {
  const res = validateFiles(readDataDir(dataDir), { dataDir, today: opts.today });
  const ds = res.dataset;
  const covs: Record<string, Coverage> = {};
  const rollups: Record<string, Record<string, CandidateRollup>> = {};
  for (const [ref, agenda] of [...ds.agendas.entries()].sort(([a], [b]) => cmp(a, b))) {
    if (agenda["kind"] !== "office") continue;
    covs[ref] = coverage(ds, ref);
    const through = ((agenda["targets"] as Rec)["finance_cutoff"] as string | null) ?? null;
    rollups[ref] = {};
    for (const c of agenda["candidates"] as Rec[]) {
      const person = String(c["person"]);
      rollups[ref][person] = rollupCandidate(ds, person, ref, { through });
    }
  }
  return {
    label: opts.label,
    fictional: opts.fictional,
    today: opts.today,
    validation: { errors: res.errors, warnings: res.warnings, problems: res.problems },
    config: ds.config ? strip(ds.config) : null,
    elections: values(ds.elections),
    contests: values(ds.contests),
    agendas: values(ds.agendas),
    leads: values(ds.leads),
    issues: values(ds.issues),
    people: values(ds.people),
    organizations: values(ds.orgs),
    bills: values(ds.bills),
    offices: values(ds.offices),
    dossiers: values(ds.dossiers),
    positions: values(ds.positions),
    relationships: [...ds.relationships].sort((a, b) => cmp(String(a["id"]), String(b["id"]))).map(strip),
    sources: values(ds.sources),
    tasks: nextTasks(ds, { includeBlocked: true }),
    coverage: covs,
    rollups,
  };
}
