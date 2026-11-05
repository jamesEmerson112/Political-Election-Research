import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { STATUS_LABEL, statusCounts, statusOf, trackedPromises } from "../web/src/lib/tracker.js";
import { VALID_DIR } from "./helpers.js";

const cite = [{ source: "src:x", quote: "x" }];

describe("promise tracker status", () => {
  it("is not checked without tracking, and no action found with only a search log", () => {
    expect(statusOf({ id: "p" })).toBe("not_checked");
    expect(statusOf({ id: "p", tracking: { as_of: "2031-02-28", search_log: [{ where: "w", query: "q", date: "2031-02-28" }] } })).toBe("none_found");
  });

  it("is the latest update's status, by date then id", () => {
    const item = {
      id: "p",
      tracking: {
        as_of: "2031-03-01",
        updates: [
          { id: "b", date: "2031-02-01", status: "done", summary: "s", citations: cite },
          { id: "a", date: "2031-01-01", status: "in_progress", summary: "s", citations: cite },
          { id: "c", date: "2031-02-01", status: "stalled", summary: "s", citations: cite },
        ],
      },
    };
    expect(statusOf(item)).toBe("stalled");
  });

  it("reads the fixture's tracked promises and counts them in display order", () => {
    const d = JSON.parse(fs.readFileSync(path.join(VALID_DIR, "dossiers/people/avery-sample.json"), "utf8"));
    const ps = trackedPromises(d);
    expect(ps.map((p) => [p.id, p.status])).toEqual([
      ["state-widget-grant-fund", "in_progress"],
      ["widget-apprenticeships", "done"],
      ["widget-permits-90-days", "none_found"],
      ["regional-widget-hubs", "not_checked"],
    ]);
    expect(statusCounts(ps).map(([s, n]) => `${n} ${STATUS_LABEL[s]}`)).toEqual(["1 Not checked yet", "1 No action found", "1 In progress", "1 Done"]);
  });
});
