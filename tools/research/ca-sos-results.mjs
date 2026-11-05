#!/usr/bin/env node
/**
 * California semi-official results from the Secretary of State's public results data
 * (https://api.sos.ca.gov/returns/<contest> and .../ballot-measures), recorded on the contests
 * through `put` (docs/RESEARCH_GUIDE.md "Contest results"). Fetched with plain curl.
 *
 *   node tools/research/ca-sos-results.mjs [--dry] [--commit --trailers <file>]
 *
 * For each contest: register the source, merge `result` (certified: false, as_of, winners, tallies or
 * yes/no votes; every citation quotes the served text), validate, and with --commit make one commit
 * per contest. Names must match the contest's candidates exactly and proposition titles must match,
 * or it stops. Each run replaces the semi-official result; the certified count is recorded by hand.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RAW = fs.mkdtempSync(path.join(os.tmpdir(), "ca-sos-results-"));
const DRY = process.argv.includes("--dry");
const COMMIT = process.argv.includes("--commit");
const ti = process.argv.indexOf("--trailers");
const TRAILERS = ti > 0 ? fs.readFileSync(process.argv[ti + 1], "utf8").trim() : "";
if (COMMIT && !TRAILERS) throw new Error("--commit needs --trailers <file> (the commit trailers)");
const API = "https://api.sos.ca.gov/returns/";

const OFFICES = {
  governor: "governor",
  "lieutenant-governor": "lieutenant-governor",
  "secretary-of-state": "secretary-of-state",
  controller: "controller",
  treasurer: "treasurer",
  "attorney-general": "attorney-general",
  "insurance-commissioner": "insurance-commissioner",
  "superintendent-of-public-instruction": "superintendent-of-public-instruction",
  "board-of-equalization/district/1": "board-of-equalization-1",
  "board-of-equalization/district/2": "board-of-equalization-2",
  "board-of-equalization/district/3": "board-of-equalization-3",
  "board-of-equalization/district/4": "board-of-equalization-4",
  "us-rep/district/11": "us-house-ca-11",
  "us-rep/district/15": "us-house-ca-15",
  "state-assembly/district/17": "state-assembly-17",
  "state-assembly/district/19": "state-assembly-19",
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function isoOf(reportingTime) {
  const m = /^([A-Z][a-z]+) (\d{1,2}), (\d{4})/.exec(reportingTime);
  if (!m || !MONTHS.includes(m[1])) throw new Error(`unparsed ReportingTime: ${reportingTime}`);
  return `${m[3]}-${String(MONTHS.indexOf(m[1]) + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}
const norm = (s) => s.replace(/\s+/g, " ");
function fetchJson(api, name) {
  const raw = execFileSync("curl", ["-sS", "-m", "60", "--fail", API + api], { encoding: "utf8" });
  fs.writeFileSync(path.join(RAW, `${name}.json`), raw);
  return { raw, json: JSON.parse(raw), flat: norm(raw) };
}
function mustQuote(flat, q, what) {
  if (!flat.includes(q)) throw new Error(`quote not in the served text (${what}): ${q}`);
  return q;
}
function run(args, input) {
  return execFileSync("npm", ["run", "-s", ...args], { cwd: REPO, input, encoding: "utf8", env: { ...process.env, RESEARCH_WRITE_DATA: "1" } });
}
function put(kind, rec, merge = false) {
  if (DRY) return { ref: `src:dry-${kind}` };
  const out = run(["put", "--", kind, ...(merge ? ["--merge"] : [])], JSON.stringify(rec));
  const res = JSON.parse(out.slice(out.indexOf("{")));
  if (res.action === "rejected" || (res.problems && res.problems.length)) throw new Error(`put ${kind} rejected: ${out}`);
  return res;
}
function source(api, title, published) {
  return put("source", { url: API + api, kind: "government_record", title, publisher: "California Secretary of State", published }).ref;
}
function commit(contestId, line) {
  if (DRY) return;
  const v = execFileSync("npm", ["run", "-s", "validate"], { cwd: REPO, encoding: "utf8" }).trim().split("\n").pop();
  if (!/ 0 error/.test(v)) throw new Error(`${contestId}: validate reports errors: ${v}`);
  if (!COMMIT) return;
  execFileSync("git", ["add", "data"], { cwd: REPO });
  const msg = `research(${contestId}): ${contestId}|result (semi-official, ${line})\n\n${TRAILERS}\n`;
  execFileSync("git", ["commit", "-q", "-F", "-"], { cwd: REPO, input: msg });
  process.stdout.write(execFileSync("git", ["log", "--oneline", "-1"], { cwd: REPO, encoding: "utf8" }));
}
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO, "data", rel), "utf8"));

const done = [];
// ---------------------------------------------------------------- offices
for (const [api, slug] of Object.entries(OFFICES)) {
  const id = `2026-ca-general/${slug}`;
  const contest = readJson(`contests/${id}.json`);
  const { json, flat } = fetchJson(api, slug);
  const asOf = isoOf(json.ReportingTime);
  const byName = new Map(contest.candidates.map((c) => [readJson(`people/${c.person.replace("person:", "")}.json`).name, c.person]));
  const tallies = json.candidates.map((c) => {
    const person = byName.get(c.Name);
    if (!person) throw new Error(`${id}: no candidate named ${c.Name}`);
    return { person, votes: Number(String(c.Votes).replace(/,/g, "")), c };
  });
  if (tallies.length !== contest.candidates.length) throw new Error(`${id}: ${tallies.length} tallies for ${contest.candidates.length} candidates`);
  const sorted = [...tallies].sort((a, b) => b.votes - a.votes);
  const seats = contest.vote_for ?? 1;
  if (sorted.length > seats && sorted[seats - 1].votes === sorted[seats].votes) throw new Error(`${id}: tie at the last seat`);
  const winners = sorted.slice(0, seats).map((t) => t.person);
  const src = source(api, json.raceTitle, asOf);
  const reporting = mustQuote(flat, `"Reporting": "${json.Reporting}", "ReportingTime": "${json.ReportingTime}"`, `${id} reporting`);
  const citations = [
    { source: src, quote: reporting, locator: "Reporting, ReportingTime" },
    ...tallies.map((t, i) => ({
      source: src,
      quote: mustQuote(flat, `"Name": "${t.c.Name}", "Party": "${t.c.Party}", "Votes": "${t.c.Votes}", "Percent": "${t.c.Percent}"`, `${id} ${t.c.Name}`),
      locator: `candidates[${i}]`,
    })),
  ];
  put("contest", { id, result: { certified: false, as_of: asOf, winners, tallies: tallies.map(({ person, votes }) => ({ person, votes })), citations } }, true);
  commit(id, json.ReportingTime);
  done.push(`${slug}: ${sorted.map((t) => `${t.c.Name} ${t.c.Percent}%`).join(" | ")} (${json.ReportingTime})`);
}

// ---------------------------------------------------------------- measures
{
  const api = "ballot-measures";
  const { json, flat } = fetchJson(api, api);
  const asOf = isoOf(json.ReportingTime);
  const src = source(api, json.raceTitle, asOf);
  const reporting = mustQuote(flat, `"Reporting": "${json.Reporting}", "ReportingTime": "${json.ReportingTime}"`, "ballot measures reporting");
  for (const m of json["ballot-measures"]) {
    const id = `2026-ca-general/prop-${Number(m.Number)}`;
    const contest = readJson(`contests/${id}.json`);
    const ours = String(contest.official_title?.value ?? "").toLowerCase().replace(/[’']/g, "'");
    const theirs = String(m.Name).toLowerCase().replace(/[’']/g, "'");
    if (ours.slice(0, 18) !== theirs.slice(0, 18)) throw new Error(`${id}: title mismatch "${contest.official_title?.value}" vs "${m.Name}"`);
    const quote = mustQuote(
      flat,
      `"Name": "${m.Name}", "Number": "${m.Number}", "yesVotes": "${m.yesVotes}", "yesPercent": "${m.yesPercent}", "noVotes": "${m.noVotes}", "noPercent": "${m.noPercent}"`,
      `${id} votes`,
    );
    const yes = Number(m.yesVotes);
    const no = Number(m.noVotes);
    put(
      "contest",
      {
        id,
        result: {
          certified: false,
          as_of: asOf,
          yes_votes: yes,
          no_votes: no,
          citations: [
            { source: src, quote: reporting, locator: "Reporting, ReportingTime" },
            { source: src, quote, locator: `ballot-measures, Number ${m.Number}` },
          ],
        },
      },
      true,
    );
    commit(id, json.ReportingTime);
    done.push(`prop-${Number(m.Number)}: yes ${m.yesPercent}% no ${m.noPercent}% (${json.ReportingTime})`);
  }
}
console.log(done.join("\n"));
