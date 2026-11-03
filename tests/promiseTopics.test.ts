import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_DATA_DIR } from "../src/paths.js";
import { deepMerge } from "../src/put.js";

type Rec = Record<string, any>;
const read = (p: string): Rec => JSON.parse(fs.readFileSync(p, "utf8"));

function agendasWithTopics(): Array<[string, Rec]> {
  const out: Array<[string, Rec]> = [];
  const root = path.join(DEFAULT_DATA_DIR, "agenda");
  for (const el of fs.readdirSync(root).sort()) {
    for (const f of fs.readdirSync(path.join(root, el)).filter((x) => x.endsWith(".json")).sort()) {
      const a = read(path.join(root, el, f));
      if (a["promise_topics"]?.length) out.push([`${el}/${f}`, a]);
    }
  }
  return out;
}
const promisesOf = (person: string): Rec[] => {
  const p = path.join(DEFAULT_DATA_DIR, "dossiers", "people", `${person.split(":")[1]}.json`);
  return fs.existsSync(p) ? (read(p)["promises"]?.["items"] ?? []) : [];
};

describe("campaign promise topics", () => {
  it("the City College board groups its promises by topic", () => {
    expect(agendasWithTopics().map(([f]) => f)).toContain("2026-ca-general/sf-community-college-board.json");
  });

  it("every tagged promise names a topic its contest defines, and each topic id is unique", () => {
    for (const [f, a] of agendasWithTopics()) {
      const ids = (a["promise_topics"] as Rec[]).map((t) => t["id"]);
      expect(new Set(ids).size, f).toBe(ids.length);
      for (const cand of a["candidates"] as Array<Rec | string>) {
        const person = typeof cand === "string" ? cand : cand["person"];
        for (const it of promisesOf(person)) {
          if (it["topic"] !== undefined) expect(ids, `${f} ${person} ${it["id"]}`).toContain(it["topic"]);
        }
      }
    }
  });

  it("every City College promise has a topic", () => {
    const a = read(path.join(DEFAULT_DATA_DIR, "agenda", "2026-ca-general", "sf-community-college-board.json"));
    for (const cand of a["candidates"] as Array<Rec | string>) {
      const person = typeof cand === "string" ? cand : cand["person"];
      for (const it of promisesOf(person)) expect(it["topic"], `${person} ${it["id"]}`).toBeTypeOf("string");
    }
  });

  it("put --merge merges promise_topics by id", () => {
    const base = { promise_topics: [{ id: "a", label: "A" }, { id: "b", label: "B" }] };
    const merged = deepMerge(base, { promise_topics: [{ id: "b", label: "B2" }, { id: "c", label: "C" }] }) as Rec;
    expect(merged["promise_topics"]).toEqual([{ id: "a", label: "A" }, { id: "b", label: "B2" }, { id: "c", label: "C" }]);
  });
});
