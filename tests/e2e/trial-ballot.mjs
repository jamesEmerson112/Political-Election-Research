/**
 * Browser checks for "Try your ballot" on the built single-file site (real San Francisco data), served
 * with vercel.json's headers (tests/e2e/server.mjs), or on a deployed site with BASE_URL. Not part of
 * `npm run check`: it needs Playwright with Chromium (preinstalled in Claude Code cloud sessions).
 *
 *   npm run web:build && node tests/e2e/trial-ballot.mjs [screenshot-dir]
 *   BASE_URL=https://<deployment>/ node tests/e2e/trial-ballot.mjs
 *
 * 1. Changing an answer (skip → yes, yes → no) and opening Summary at once equals a fresh load of the same answers.
 * 2. A vote that only moves later years (Prop C starts FY2028-29) shows on those years' buttons, highlighted, then clears.
 * 3. Year buttons (click and Enter) move the meter, the bridge and the per-year chart; no sideways scroll; no errors.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "./server.mjs";
const { chromium } = createRequire(import.meta.url)("playwright");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = process.argv[2] ?? fs.mkdtempSync(path.join(os.tmpdir(), "trial-e2e-"));
const server = process.env.BASE_URL ? null : await serve(path.join(ROOT, "dist/web"), path.join(ROOT, "vercel.json"));
const URL = (process.env.BASE_URL ?? server.url) + "#trial";
const browser = await chromium.launch();
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok, detail });

const snap = (page) =>
  page.evaluate(() => {
    const t = (sel) => [...document.querySelectorAll(sel)].map((e) => (e.getAttribute("aria-label") || e.textContent || "").replace(/\s+/g, " ").trim());
    return {
      meter: t(".meter-wrap .gap"),
      years: t(".meter-wrap .yr"),
      bridge: t('svg[aria-label^="General Fund bridge"]'),
      steps: t("table.steps tbody tr"),
      perYear: t("section.section table.grid.num:not(.steps) tbody tr"),
      lead: t("p.lead"),
      perMeasure: t(".mrow"),
      outside: t(".panel.list ul li"),
    };
  });
const vote = (page, v) => page.locator(v === "skip" ? ".votebar button.ans:not(.yes):not(.no)" : ".votebar button.ans." + v).click();
async function answerAll(page, plan) {
  for (const [L, v] of Object.entries(plan)) {
    await page.locator(".dot", { hasText: new RegExp(`^${L}$`) }).click();
    await vote(page, v);
    await page.waitForTimeout(60);
  }
}
const summary = (page) => page.locator("button.link", { hasText: "Summary" }).click();

// 1. Change an answer (skipped → yes, yes → no) and open Summary at once: it equals a fresh load of the same saved answers.
for (const [L, from, to] of [["C", "skip", "yes"], ["I", "skip", "yes"], ["J", "yes", "no"]]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(URL);
  await page.waitForSelector("article.card");
  const plan = { A: "yes", B: "yes", C: "no", D: "yes", E: "yes", F: "yes", G: "no", H: "yes", I: "no", J: "yes", [L]: from };
  await answerAll(page, plan);
  await summary(page);
  await page.waitForTimeout(250);
  await page.locator(".dot", { hasText: new RegExp(`^${L}$`) }).click();
  await vote(page, to);
  await summary(page);
  await page.waitForTimeout(250);
  const live = await snap(page);
  const row = live.perMeasure.find((r) => r.includes(`Prop ${L} `)) ?? "";
  await page.reload();
  await page.waitForTimeout(400);
  await summary(page);
  await page.waitForTimeout(400);
  const fresh = await snap(page);
  const diffs = Object.keys(live).filter((k) => k !== "years" && JSON.stringify(live[k]) !== JSON.stringify(fresh[k]));
  check(`1. ${L}: ${from} → ${to}, Summary at once = fresh reload`, !diffs.length && row.startsWith(to === "yes" ? "Yes" : "No") && !errors.length, diffs.length ? `differs: ${diffs.join(", ")}` : `row: ${row.slice(0, 60)}`);
  await ctx.close();
}

// 2. A vote that only moves later years shows on those years' buttons, highlighted, and the shown year stays as it was.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.waitForSelector("article.card");
  await answerAll(page, { A: "yes", B: "yes", C: "skip", D: "yes", E: "yes", F: "yes", G: "no", H: "yes", I: "no", J: "yes" });
  await summary(page);
  await page.waitForTimeout(2700); // let the last vote's highlight clear first
  const before = (await snap(page)).years;
  await page.locator(".dot", { hasText: /^C$/ }).click();
  await vote(page, "yes");
  await page.waitForTimeout(150);
  const after = (await snap(page)).years;
  const flagged = await page.locator(".meter-wrap .yr.changed").allTextContents();
  await page.locator(".meter-wrap").first().screenshot({ path: `${OUT}/meter-after-C-1280.png` });
  const ok = before.length === 3 && before[0] === after[0] && before[1] !== after[1] && before[2] !== after[2] && flagged.length === 2 && !flagged.some((t) => t.includes("FY2027-28"));
  check("2. Prop C (starts FY2028-29): FY2027-28 unchanged; FY2028-29 and FY2029-30 change and highlight", ok, `before ${JSON.stringify(before)} after ${JSON.stringify(after)} highlighted ${JSON.stringify(flagged)}`);
  await page.waitForTimeout(2700);
  check("2b. the highlight clears", (await page.locator(".meter-wrap .yr.changed").count()) === 0);
  await ctx.close();
}

// 3. Year buttons (click and keyboard) move the meter's line, the summary bridge and the per-year chart together; phone width has no sideways scroll.
for (const [w, scheme] of [[1280, "dark"], [390, "light"]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: scheme });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(URL);
  await page.waitForSelector("article.card");
  await answerAll(page, { A: "yes", B: "yes", C: "no", D: "yes", E: "yes", F: "yes", G: "no", H: "yes", I: "no", J: "yes" });
  await summary(page);
  await page.waitForTimeout(300);
  await page.locator(".meter-wrap .yr", { hasText: "FY2029-30" }).click();
  await page.waitForTimeout(200);
  const s1 = await snap(page);
  await page.locator(".meter-wrap .yr", { hasText: "FY2028-29" }).focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  const s2 = await snap(page);
  const shaded = await page.locator("text.tick.on").allTextContents();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await page.locator(".meter-wrap").first().screenshot({ path: `${OUT}/meter-summary-${w}-${scheme}.png` });
  const ok = s1.meter[0]?.includes("FY2029-30") && s1.bridge[0]?.includes("FY2029-30") && s2.meter[0]?.includes("FY2028-29") && s2.bridge[0]?.includes("FY2028-29") && shaded.join() === "FY2028-29" && overflow === 0 && !errors.length;
  check(`3. ${w}px ${scheme}: year buttons (click, Enter) move meter, bridge and chart; no sideways scroll`, ok, `overflow ${overflow}, shaded ${shaded}, errors ${errors.length}`);
  await ctx.close();
}

await browser.close();
await server?.close();
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `\n      ${r.detail}` : ""}`);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
process.exitCode = results.every((r) => r.ok) ? 0 : 1;
