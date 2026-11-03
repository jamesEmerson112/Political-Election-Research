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
