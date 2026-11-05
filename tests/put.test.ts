import { describe, expect, it } from "vitest";
import type { FileMap } from "../src/dataset.js";
import { put, type PutMode } from "../src/put.js";
import { validateFiles } from "../src/validate.js";
import { FIXTURE_TODAY, VALID_DIR, validFiles } from "./helpers.js";

const opts = (mode: PutMode = "create") => ({ dataDir: VALID_DIR, mode, today: FIXTURE_TODAY });

function apply(files: FileMap, res: ReturnType<typeof put>): FileMap {
  const out = new Map(files);
  if (res.content !== undefined) out.set(res.file, res.content);
  return out;
}

describe("put", () => {
  it("derives source id and path from the URL", () => {
    const res = put(new Map(), "source", { url: "https://www.example.org/page/", kind: "news_report", title: "T" }, opts());
    expect(res.action).toBe("created");
    expect(res.file).toMatch(/^sources\/example-org-[0-9a-f]{10}\.json$/);
    expect(res.ref).toBe(`src:${res.file.slice("sources/".length, -".json".length)}`);
    expect(JSON.parse(res.content!).accessed).toBe(FIXTURE_TODAY);
  });

  it("reuses an existing source instead of duplicating it", () => {
    const files = validFiles();
    const res = put(files, "source", { url: "http://news.example.com/2030/09/widgets-debate", kind: "news_report", title: "Other title" }, opts());
    expect(res.action).toBe("unchanged");
    expect(res.ref).toBe("src:news-example-com-e70a5fe80d");
    expect(res.content).toBeUndefined();
  });

  it("computes relationship ids and writes to relationships/<type>/", () => {
    const res = put(
      validFiles(),
      "relationship",
      {
        type: "endorsement",
        endorser: "org:example-food-bank",
        endorsee: "person:avery-sample",
        cycle: 2030,
        citations: [{ source: "src:news-example-com-e70a5fe80d", quote: "x" }],
      },
      opts(),
    );
    expect(res.action).toBe("created");
    expect(res.file).toBe("relationships/endorsement/endorsement--org.example-food-bank--person.avery-sample--2030.json");
  });

  it("rejects schema-invalid records without writing", () => {
    const res = put(new Map(), "person", { name: "No Fields", candidate_profile: { occupation: { value: "x", citations: [] } } }, opts());
    expect(res.action).toBe("rejected");
    expect(res.content).toBeUndefined();
    expect(res.problems.length).toBeGreaterThan(0);
  });

  it("refuses to overwrite in create mode, deep-merges with --merge", () => {
    const files = validFiles();
    const patch = { id: "pat-donor", aliases: ["P. Donor"] };
    expect(put(files, "person", { ...patch, name: "Pat Donor" }, opts()).action).toBe("rejected");
    const res = put(files, "person", patch, opts("merge"));
    expect(res.action).toBe("updated");
    const rec = JSON.parse(res.content!);
    expect(rec.name).toBe("Pat Donor");
    expect(rec.aliases).toEqual(["P. Donor"]);
  });

  it("keeps a person's ids and aliases when a merge patch leaves them out", () => {
    const files = validFiles();
    const withIds = apply(files, put(files, "person", { id: "pat-donor", aliases: ["P. Donor"], ids: [{ system: "wikidata", id: "Q1" }] }, opts("merge")));
    const res = put(withIds, "person", { id: "pat-donor", links: { official_site: "https://example.org/pat" } }, opts("merge"));
    const rec = JSON.parse(res.content!);
    expect(rec.aliases).toEqual(["P. Donor"]);
    expect(rec.ids).toEqual([{ system: "wikidata", id: "Q1" }]);
    expect(rec.links.official_site).toBe("https://example.org/pat");
  });

  it("merges a question's facets by id, so two researchers' facets add up", () => {
    const files = validFiles();
    const issue = JSON.parse(files.get("issues/widgets.json")!);
    const q = issue.questions[0];
    const before = (q.facets ?? []).map((f: { id: string }) => f.id);
    const a = apply(files, put(files, "issue", { id: "widgets", questions: [{ id: q.id, facets: [{ id: "facet-a", label: "Facet A" }] }] }, opts("merge")));
    const b = put(a, "issue", { id: "widgets", questions: [{ id: q.id, facets: [{ id: "facet-b", label: "Facet B" }] }] }, opts("merge"));
    const ids = JSON.parse(b.content!).questions[0].facets.map((f: { id: string }) => f.id);
    expect(ids).toEqual([...before, "facet-a", "facet-b"]);
  });

  it("accepts a nonpartisan ballot entry with no party", () => {
    const files = validFiles();
    const contest = JSON.parse(files.get("contests/2030-zz-general/governor.json")!);
    const { party: _p, ...entry } = contest.candidates[0];
    const res = put(files, "contest", { ...contest, candidates: [entry, ...contest.candidates.slice(1)] }, opts("replace"));
    expect(res.action).toBe("updated");
    expect(validateFiles(apply(files, res), { dataDir: VALID_DIR, today: FIXTURE_TODAY }).errors).toBe(0);
  });

  it("merges contest candidates by person instead of replacing the list", () => {
    const files = validFiles();
    const res = put(
      files,
      "contest",
      {
        id: "2030-zz-general/governor",
        candidates: [
          {
            person: "person:pat-donor",
            party: "No Party",
            ballot_designation: "",
            incumbent: false,
            citations: [{ source: "src:sos-example-gov-dfeadf2ddd", quote: "Pat Donor" }],
          },
        ],
      },
      opts("merge"),
    );
    expect(res.action).toBe("updated");
    expect(JSON.parse(res.content!).candidates.map((c: { person: string }) => c.person)).toEqual([
      "person:avery-sample",
      "person:jordan-example",
      "person:pat-donor",
    ]);
  });

  it("adds a promise tracking update by id without resending the promise", () => {
    const files = validFiles();
    const update = (id: string, date: string, status: string, summary: string) => ({
      actor: "person:avery-sample",
      promises: {
        items: [
          {
            id: "state-widget-grant-fund",
            tracking: { as_of: "2031-02-28", updates: [{ id, date, status, summary, citations: [{ source: "src:budget-example-gov-76f2a25b5e", quote: "Widget Manufacturing Grant Fund" }] }] },
          },
        ],
      },
    });
    const first = put(files, "dossier", update("budget-adopted", "2031-02-20", "done", "The adopted budget funds it."), opts("merge"));
    expect(first.action).toBe("updated");
    const second = put(apply(files, first), "dossier", update("budget-adopted", "2031-02-20", "partly_done", "The adopted budget funds half of it."), opts("merge"));
    const items = JSON.parse(second.content!).promises.items as Array<{ id: string; title: string; tracking?: { updates: Array<{ id: string; status: string }> } }>;
    const grant = items.find((i) => i.id === "state-widget-grant-fund")!;
    // The promise keeps its campaign text; the update was added once, then replaced by id, after the earlier update (date order).
    expect(grant.title).toBe("State widget grant fund");
    expect(grant.tracking!.updates.map((u) => [u.id, u.status])).toEqual([
      ["proposed-budget-2031-32", "in_progress"],
      ["budget-adopted", "partly_done"],
    ]);
    expect(items).toHaveLength(4);
  });

  it("appends position history, rejects silent overwrites, keeps the dataset valid", () => {
    const files = validFiles();
    const later = {
      subject: "q:widgets/subsidize-widgets",
      stance: "mixed",
      summary: "Later said subsidies should be temporary.",
      evidence_type: "interview",
      cycle: 2030,
      as_of: "2030-10-20",
      citations: [{ source: "src:news-example-com-e70a5fe80d", quote: "\"The state should invest in widgets,\" Sample said." }],
    };
    const res = put(files, "position", { actor: "person:avery-sample", position: later }, opts());
    expect(res.action).toBe("updated");
    const next = apply(files, res);
    expect(JSON.parse(next.get(res.file)!).positions).toHaveLength(3);
    expect(validateFiles(next, { dataDir: VALID_DIR, today: FIXTURE_TODAY, strict: true }).problems).toEqual([]);

    const clash = put(next, "position", { actor: "person:avery-sample", position: { ...later, stance: "oppose" } }, opts());
    expect(clash.action).toBe("rejected");
    expect(put(next, "position", { actor: "person:avery-sample", position: { ...later, stance: "oppose" } }, opts("replace")).action).toBe(
      "updated",
    );
  });
});
