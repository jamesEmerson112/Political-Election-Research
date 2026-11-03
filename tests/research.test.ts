import { describe, expect, it } from "vitest";
import { coverage, nextTasks } from "../src/research.js";
import { validateFiles } from "../src/validate.js";
import { applyPatches, datasetOf, FIXTURE_TODAY, VALID_DIR, validDataset, validFiles } from "./helpers.js";

describe("next (research queue)", () => {
  it("is empty when the agenda is fully researched", () => {
    expect(nextTasks(validDataset())).toEqual([]);
  });

  it("emits tasks for missing research, interleaved across candidates, in a fixed order", () => {
    const files = applyPatches(validFiles(), VALID_DIR, [
      { file: "people/avery-sample.json", remove: ["/candidate_profile/occupation"] },
      { file: "people/jordan-example.json", remove: ["/candidate_profile/occupation"] },
      { file: "positions/people/avery-sample.json", remove: ["/positions/1"] },
      { file: "agenda/2030-zz-general/governor.json", set: { "/targets/top_contributors": 3 } },
    ]);
    const tasks = nextTasks(datasetOf(files));
    expect(tasks.map((t) => t.id)).toEqual([
      "2030-zz-general/governor|profile|person:avery-sample|occupation",
      "2030-zz-general/governor|profile|person:jordan-example|occupation",
      "2030-zz-general/governor|position|person:avery-sample|q:widgets/subsidize-widgets",
      "2030-zz-general/governor|contributions|person:avery-sample",
      "2030-zz-general/governor|contributions|person:jordan-example",
    ]);
    expect(tasks[2]!.file).toBe("positions/people/avery-sample.json");
    expect(JSON.stringify(nextTasks(datasetOf(files)))).toBe(JSON.stringify(tasks));
  });

  it("starts from election, people and contest creation when nothing is verified yet", () => {
    const files = new Map([...validFiles()].filter(([rel]) => rel.startsWith("agenda/") || rel.startsWith("issues/") || rel === "config.json"));
    const res = validateFiles(files, { dataDir: VALID_DIR, today: FIXTURE_TODAY });
    expect(res.errors).toBe(0);
    const ids = nextTasks(res.dataset).map((t) => t.id);
    // People before the contest: the contest lists candidates by person ref, which must resolve.
    expect(ids.slice(0, 5)).toEqual([
      "2030-zz-general/governor|election",
      "2030-zz-general/governor|person|person:avery-sample",
      "2030-zz-general/governor|person|person:jordan-example",
      "2030-zz-general/governor|contest",
      "2030-zz-general/prop-1|contest",
    ]);
    // Stances on a measure wait for the measure's contest record.
    const all = nextTasks(res.dataset, { includeBlocked: true });
    const blocked = all.find((t) => t.id.endsWith("|contest:2030-zz-general/prop-1"));
    expect(blocked?.blocked_by).toBe("2030-zz-general/prop-1|contest");
    expect(ids).not.toContain(blocked!.id);
  });

  it("attaches unverified leads to the task they bear on", () => {
    const files = applyPatches(validFiles(), VALID_DIR, [
      { file: "people/avery-sample.json", remove: ["/candidate_profile/occupation"] },
      { file: "positions/people/jordan-example.json", remove: ["/positions/1"] },
    ]);
    const tasks = nextTasks(datasetOf(files));
    expect(tasks.find((t) => t.id.endsWith("|profile|person:avery-sample|occupation"))?.leads).toEqual([
      "Job: Engineer at a widget plant",
    ]);
    expect(tasks.find((t) => t.id.endsWith("|position|person:jordan-example|q:widgets/subsidize-widgets"))?.leads).toEqual([
      "Widgets: Said at a town hall they oppose subsidies",
    ]);
  });

  it("closes count tasks recorded as exhausted", () => {
    const ids = nextTasks(validDataset()).map((t) => t.id);
    expect(ids).not.toContain("2030-zz-general/governor|independent_expenditures|person:jordan-example");
  });
});

describe("coverage (parity)", () => {
  it("shows no asymmetry when both candidates are researched to the same depth", () => {
    const cov = coverage(validDataset(), "2030-zz-general/governor");
    expect(cov.rows.filter((r) => r.asymmetric)).toEqual([]);
    expect(cov.rows.find((r) => r.label === "q:widgets/subsidize-widgets")!.cells).toEqual(["support", "no_public_position"]);
  });

  it("flags rows where one candidate was researched and the other was not", () => {
    const files = applyPatches(validFiles(), VALID_DIR, [{ file: "positions/people/jordan-example.json", remove: ["/positions/1"] }]);
    const cov = coverage(datasetOf(files), "2030-zz-general/governor");
    expect(cov.rows.filter((r) => r.asymmetric).map((r) => r.label)).toEqual(["q:widgets/subsidize-widgets"]);
  });
});
