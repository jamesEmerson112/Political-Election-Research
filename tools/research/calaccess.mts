/**
 * Read-only helper for California state campaign finance, from the Secretary
 * of State's official CAL-ACCESS raw data export (dbwebexport.zip, published
 * daily at https://campaignfinance.cdn.sos.ca.gov/dbwebexport.zip). The
 * CAL-ACCESS web pages answer automated requests with a bot check; the export
 * is the same filed data, published for download.
 *
 * It never writes data/. It prints proposals (JSON) that a researcher records
 * through `run.mts put`, so the usual review and integration apply:
 *
 *   npx tsx tools/research/calaccess.mts committees <name words...>           Form 410 statements of organization since 2024
 *   npx tsx tools/research/calaccess.mts filings <filer id>                    campaign statements (460/496/497) since 2025
 *   npx tsx tools/research/calaccess.mts contributions <filer id> --through YYYY-MM-DD [--start 2023-01-01] [--top 10] [--primary YYYY-MM-DD]
 *   npx tsx tools/research/calaccess.mts ies <candidate last name> [--first <first>] --through YYYY-MM-DD [--start 2025-01-01]
 *
 * Every row it reports carries its filing id, amendment, schedule and line item,
 * so a citation can point at the filing (source url
 * https://cal-access.sos.ca.gov/PDFGen/pdfgen.prg?filingid=<id>&amendid=<n>,
 * kind campaign_finance_filing) with a schedule/line locator. Only the latest
 * amendment of each filing counts.
 *
 * Contributions: Form 460 Schedule A (monetary) and C (non-monetary), from
 * statements covering start..through. Late reports (497) repeat that money and
 * are not added. The export has no election-designation column: with
 * --primary <date>, money received on or before that date is reported as
 * "primary" and later money as "general". Individuals are listed only for a
 * designation whose total reaches data/config.json's privacy threshold (as
 * validate requires per record).
 * Independent expenditures: Form 496 late IE reports naming the candidate.
 *
 * Export location: --zip <path> or .cache/calaccess/dbwebexport.zip.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const argv = process.argv.slice(2);
const flag = (k: string): string | undefined => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const positional = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1]!.startsWith("--")));
const [cmd, ...rest] = positional;
const ZIP = path.resolve(flag("zip") ?? path.join(ROOT, ".cache/calaccess/dbwebexport.zip"));
const CACHE = path.dirname(ZIP);

function die(msg: string): never {
  console.error(msg);
  process.exit(2);
}
if (!fs.existsSync(ZIP)) die(`No export at ${ZIP}. Download https://campaignfinance.cdn.sos.ca.gov/dbwebexport.zip there (about 1.6 GB).`);

type Row = Record<string, string>;

/** Streams one table of the export, calling fn for every row (header-keyed). A `pre` test on the raw line skips parsing. */
async function scan(table: string, fn: (r: Row) => void, pre?: (line: string) => boolean): Promise<void> {
  const child = spawn("unzip", ["-p", ZIP, `CalAccess/DATA/${table}.TSV`], { stdio: ["ignore", "pipe", "inherit"] });
  const rl = readline.createInterface({ input: child.stdout.setEncoding("latin1"), crlfDelay: Infinity });
  let head: string[] | null = null;
  for await (const line of rl) {
    if (!head) {
      head = line.split("\t");
      continue;
    }
    if (pre && !pre(line)) continue;
    const cells = line.split("\t");
    const r: Row = {};
    head.forEach((h, i) => (r[h] = (cells[i] ?? "").trim()));
    fn(r);
  }
}

/** "1/20/2000 12:00:00 AM" -> "2000-01-20". */
function isoDate(s: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  return m ? `${m[3]}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}` : "";
}
const cents = (s: string) => Math.round(Number(s || 0) * 100);
const filingUrl = (id: string, amend: string) => `https://cal-access.sos.ca.gov/PDFGen/pdfgen.prg?filingid=${id}&amendid=${amend}`;
const out = (v: unknown) => process.stdout.write(JSON.stringify(v, null, 2) + "\n");

interface Cover {
  filing_id: string;
  amend_id: number;
  form: string;
  filer_id: string;
  filer_name: string;
  from: string;
  thru: string;
  rpt_date: string;
  cand_last: string;
  cand_first: string;
  office: string;
  district: string;
  sup_opp: string;
}

/** Campaign-statement covers (460, 496, 497, 465, 461) dated 2023 or later, cached as JSON after the first read. */
async function covers(): Promise<Cover[]> {
  const file = path.join(CACHE, `covers-since-2023.${fs.statSync(ZIP).mtimeMs}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as Cover[];
  const list: Cover[] = [];
  await scan(
    "CVR_CAMPAIGN_DISCLOSURE_CD",
    (r) => {
      const rpt = isoDate(r["RPT_DATE"]!);
      if (rpt < "2023-01-01") return;
      list.push({
        filing_id: r["FILING_ID"]!,
        amend_id: Number(r["AMEND_ID"]),
        form: r["FORM_TYPE"]!,
        filer_id: r["FILER_ID"]!,
        filer_name: [r["FILER_NAMF"], r["FILER_NAML"]].filter(Boolean).join(" "),
        from: isoDate(r["FROM_DATE"]!),
        thru: isoDate(r["THRU_DATE"]!),
        rpt_date: rpt,
        cand_last: r["CAND_NAML"]!,
        cand_first: r["CAND_NAMF"]!,
        office: r["OFFIC_DSCR"] || r["OFFICE_CD"]!,
        district: r["DIST_NO"]!,
        sup_opp: r["SUP_OPP_CD"]!,
      });
    },
    (line) => /\tF(460|496|497|465|461)\t/.test(line),
  );
  fs.writeFileSync(file, JSON.stringify(list));
  return list;
}

/** The latest amendment of each filing. */
function latest(cs: Cover[]): Map<string, Cover> {
  const m = new Map<string, Cover>();
  for (const c of cs) if (!m.has(c.filing_id) || m.get(c.filing_id)!.amend_id < c.amend_id) m.set(c.filing_id, c);
  return m;
}

const PRIVACY_MIN_CENTS = (() => {
  try {
    return Number(JSON.parse(fs.readFileSync(path.join(ROOT, "data/config.json"), "utf8")).privacy.individual_donor_min_cents) || 0;
  } catch {
    return 0;
  }
})();

if (cmd === "committees") {
  const words = rest.map((w) => w.toUpperCase());
  if (!words.length) die("committees <name words...>");
  // Recipient committees whose name has every word (or whose filer id is given), from the filer table.
  const filers = new Map<string, { filer_id: string; name: string; status: string; since: string }>();
  await scan("FILERNAME_CD", (r) => {
    const name = `${r["NAMF"]} ${r["NAML"]}`.trim();
    if (!/RECIPIENT COMMITTEE/.test(r["FILER_TYPE"]!)) return;
    if (!words.every((w) => name.toUpperCase().includes(w) || r["FILER_ID"] === w)) return;
    filers.set(r["FILER_ID"]!, { filer_id: r["FILER_ID"]!, name, status: r["STATUS"]!, since: isoDate(r["EFFECT_DT"]!) });
  });
  // Each one's latest campaign statement since 2025: its cover names the candidate and office (cite it for committee_role).
  const cs = await covers();
  out(
    [...filers.values()].map((f) => {
      const mine = [...latest(cs.filter((c) => c.filer_id === f.filer_id && c.form === "F460")).values()].sort((a, b) => b.thru.localeCompare(a.thru));
      const c = mine[0];
      return {
        ...f,
        statements_since_2025: mine.length,
        latest_460: c
          ? {
              filing_id: c.filing_id,
              amend_id: c.amend_id,
              from: c.from,
              thru: c.thru,
              candidate: [c.cand_first, c.cand_last].filter(Boolean).join(" "),
              office: c.office,
              district: c.district,
              source_url: filingUrl(c.filing_id, String(c.amend_id)),
              locator: `Form 460 cover page (filing ${c.filing_id}, amendment ${c.amend_id}): committee, candidate and office`,
            }
          : null,
      };
    }),
  );
} else if (cmd === "filings") {
  const filer = rest[0] ?? die("filings <filer id>");
  const all = [...latest((await covers()).filter((c) => c.filer_id === filer)).values()].sort((a, b) => a.thru.localeCompare(b.thru));
  out(all.map((c) => ({ ...c, source_url: filingUrl(c.filing_id, String(c.amend_id)) })));
} else if (cmd === "contributions") {
  const filer = rest[0] ?? die("contributions <filer id> --through YYYY-MM-DD");
  const through = flag("through") ?? die("--through YYYY-MM-DD is required (the contest's finance cutoff)");
  const start = flag("start") ?? "2023-01-01";
  const top = Number(flag("top") ?? 10);
  const primary = flag("primary");
  const desig = (date: string) => (primary ? (date && date <= primary ? "primary" : "general") : "general");
  const f460 = [...latest((await covers()).filter((c) => c.filer_id === filer && c.form === "F460")).values()].filter(
    (c) => c.from >= start && c.thru <= through,
  );
  const want = new Map(f460.map((c) => [c.filing_id, c]));
  type Item = { schedule: string; line: string; date: string; cents: number; filing_id: string; amend_id: string };
  const donors = new Map<string, { entity: string; name: string; committee_id: string; employer: string; occupation: string; items: Item[] }>();
  await scan(
    "RCPT_CD",
    (r) => {
      const c = want.get(r["FILING_ID"]!);
      if (!c || Number(r["AMEND_ID"]) !== c.amend_id || !["A", "C"].includes(r["FORM_TYPE"]!)) return;
      const name = [r["CTRIB_NAMF"], r["CTRIB_NAML"]].filter(Boolean).join(" ");
      const key = `${r["ENTITY_CD"]}|${name.toUpperCase()}|${r["CMTE_ID"]}`;
      const d = donors.get(key) ?? { entity: r["ENTITY_CD"]!, name, committee_id: r["CMTE_ID"]!, employer: r["CTRIB_EMP"]!, occupation: r["CTRIB_OCC"]!, items: [] };
      d.items.push({ schedule: r["FORM_TYPE"]!, line: r["LINE_ITEM"]!, date: isoDate(r["RCPT_DATE"]!), cents: cents(r["AMOUNT"]!), filing_id: c.filing_id, amend_id: String(c.amend_id) });
      donors.set(key, d);
    },
    (line) => want.has(line.slice(0, line.indexOf("\t"))),
  );
  const ranked = [...donors.values()]
    .map((d) => {
      const by: Record<string, number> = {};
      for (const i of d.items) by[`${desig(i.date)}|${i.schedule}`] = (by[`${desig(i.date)}|${i.schedule}`] ?? 0) + i.cents;
      // Individuals: keep only designation × schedule totals at or above the privacy threshold.
      const keep = Object.fromEntries(Object.entries(by).filter(([, c]) => c > 0 && (d.entity !== "IND" || c >= PRIVACY_MIN_CENTS)));
      return { ...d, total_cents: Object.values(keep).reduce((s, c) => s + c, 0), by_designation_schedule: keep };
    })
    .filter((d) => d.total_cents > 0)
    .sort((a, b) => b.total_cents - a.total_cents || a.name.localeCompare(b.name));
  out({
    filer_id: filer,
    period: { start, end: through },
    statements: f460.map((c) => ({ filing_id: c.filing_id, amend_id: c.amend_id, from: c.from, thru: c.thru, source_url: filingUrl(c.filing_id, String(c.amend_id)) })),
    privacy_min_cents_individuals: PRIVACY_MIN_CENTS,
    donors_total: donors.size,
    top: ranked.slice(0, top).map((d) => ({
      ...d,
      items: d.items.map((i) => ({ ...i, designation: desig(i.date), source_url: filingUrl(i.filing_id, i.amend_id) })),
      locators: d.items.map((i) => `Form 460 Schedule ${i.schedule}, line ${i.line} (${i.date}, $${(i.cents / 100).toFixed(2)}); filing ${i.filing_id} amendment ${i.amend_id}`),
    })),
  });
} else if (cmd === "ies") {
  const last = (rest[0] ?? die("ies <candidate last name> --through YYYY-MM-DD")).toUpperCase();
  const first = flag("first")?.toUpperCase();
  const through = flag("through") ?? die("--through YYYY-MM-DD is required");
  const start = flag("start") ?? "2023-01-01";
  const f496 = [...latest((await covers()).filter((c) => c.form === "F496")).values()].filter(
    (c) => c.cand_last.toUpperCase() === last && (!first || c.cand_first.toUpperCase().startsWith(first)) && c.rpt_date >= start && c.rpt_date <= through,
  );
  const want = new Map(f496.map((c) => [c.filing_id, c]));
  const rows: Array<{ c: Cover; r: Row }> = [];
  await scan(
    "S496_CD",
    (r) => {
      const c = want.get(r["FILING_ID"]!);
      if (c && Number(r["AMEND_ID"]) === c.amend_id) rows.push({ c, r });
    },
    (line) => want.has(line.slice(0, line.indexOf("\t"))),
  );
  const by = new Map<string, { spender: string; filer_id: string; side: string; total_cents: number; locators: string[] }>();
  for (const { c, r } of rows) {
    const side = c.sup_opp === "O" ? "oppose" : c.sup_opp === "S" ? "support" : `unknown (${c.sup_opp})`;
    const k = `${c.filer_id}|${side}`;
    const e = by.get(k) ?? { spender: c.filer_name, filer_id: c.filer_id, side, total_cents: 0, locators: [] };
    e.total_cents += cents(r["AMOUNT"]!);
    e.locators.push(`Form 496 line ${r["LINE_ITEM"]} (${isoDate(r["EXP_DATE"]!)}, $${Number(r["AMOUNT"]).toFixed(2)}, ${r["EXPN_DSCR"]}); filing ${c.filing_id} amendment ${c.amend_id} ${filingUrl(c.filing_id, String(c.amend_id))}`);
    by.set(k, e);
  }
  out({
    candidate: { last, first: first ?? null },
    period: { start, end: through },
    reports: f496.length,
    spenders: [...by.values()].sort((a, b) => b.total_cents - a.total_cents || a.spender.localeCompare(b.spender)),
  });
} else {
  die("usage: calaccess.mts committees|filings|contributions|ies … (see the header of this file)");
}
