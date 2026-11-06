/**
 * Browser checks for the public beta, on the built site served with vercel.json's headers
 * (tests/e2e/server.mjs), or on a deployed site: BASE_URL=https://<deployment>/ node tests/e2e/beta.mjs
 *
 * 4. The security headers are sent (the page may connect to its own site only: connect-src 'self',
 *    for Vercel Web Analytics), and a full visit runs with no console errors and no security-policy
 *    violations.
 * 5. Privacy: during My ballot by (mocked) device location and a San Francisco and a California
 *    trial, the page requests nothing but itself and Google Fonts.
 * 6. California: Yes on Prop 1 makes FY2027-28's shortfall $500M–$600M larger; Yes on Prop 3 moves
 *    no forecast year and is listed from FY2030-31; Prop 44's cost is quoted in words, not added up;
 *    San Francisco's ballot keeps its own answers.
 * 5c. The Overview's county group says every ballot in a county has that county's contests.
 * 5l. A pick and note on a contest page come out in "Export my picks" (.txt).
 * 5j. A Nevada ZIP (89101) narrows the Overview to Nevada contests, with the City of Las Vegas's; a Henderson ZIP (89052) has none of the city's.
 * 5d. The Overview links to the Las Vegas (Nevada) contests.
 * 5e. Vercel Web Analytics loads only on the public site (political-election-research.vercel.app):
 *    on the local server and on preview deployments the page loads no analytics script.
 * 5f. Proposition groups start folded on the Overview.
 * 5g. SF Prop F shows the maintainer's comparison table, marked unverified.
 * 5i. City College campaign promises are grouped by topic: shared topics first, with a count note.
 * 5h. A race with many candidates uses the full page width on desktop, keeps its name row pinned while scrolling, and no page scrolls sideways on a phone.
 * 7. About: the Beta badge opens it; data status and the demo switch work; a bridge row shows its
 *    tooltip on keyboard focus and Escape hides it.
 * 8. Site sweep (2026-11-06), so its bugs stay fixed: every in-site link leads to a page (8a); no sideways
 *    scroll on a phone with everything opened (8b); no "undefined"/"NaN" text (8c); dimmed losers keep 4.5:1
 *    in dark mode (8d); the drawer keeps Tab inside and returns focus (8e); Back returns to the reader's place
 *    (8f); Nevada's questions are on the Measures tab (8g); the Overview title and My ballot's "not covered"
 *    note are right (8h).
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "./server.mjs";
const { chromium } = createRequire(import.meta.url)("playwright");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const server = process.env.BASE_URL ? null : await serve(path.join(ROOT, "dist/web"), path.join(ROOT, "vercel.json"));
const BASE = process.env.BASE_URL ?? server.url;
const ALLOWED_HOSTS = new Set([new URL(BASE).host, "fonts.googleapis.com", "fonts.gstatic.com"]);
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok, detail });
const text = async (loc) => ((await loc.textContent()) ?? "").replace(/\s+/g, " ").trim();
const go = (page, hash) => page.evaluate((h) => (location.hash = h), hash);

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 1000 },
  geolocation: { latitude: 37.7793, longitude: -122.4193, accuracy: 30 }, // San Francisco City Hall
  permissions: ["geolocation"],
});
await ctx.addInitScript(() => {
  window.__csp = [];
  document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
});
const page = await ctx.newPage();
const requests = [];
const errors = [];
page.on("request", (r) => requests.push(r.url()));
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

// 4a. headers
const resp = await page.goto(`${BASE}#overview`);
const h = resp.headers();
const csp = h["content-security-policy"] ?? "";
const directive = (name) => csp.split(";").map((d) => d.trim()).find((d) => d.split(/\s+/)[0] === name) ?? "";
check(
  "4a. security headers are sent",
  directive("connect-src") === "connect-src 'self'" && directive("frame-ancestors") === "frame-ancestors 'none'" && h["x-content-type-options"] === "nosniff" && h["referrer-policy"] === "no-referrer" && (h["permissions-policy"] ?? "").includes("geolocation=(self)"),
  `${directive("connect-src")} · csp: ${csp.slice(0, 90)}…`,
);

// 5 (part). My ballot by device location: matched in the page, nothing sent.
await page.locator('button.method[aria-label="Use my location"]').click();
await page.waitForSelector(".found .frow", { timeout: 15000 });
const rows = await page.locator(".found .frow").allTextContents();
check("5a. My ballot finds districts from the device's location", rows.length > 0, rows.map((r) => r.replace(/\s+/g, " ").trim()).join(" | ").slice(0, 120));

// 5c. The county group (San Francisco's local measures and school boards) says every ballot in the county has them.
await go(page, "#overview");
await page.waitForSelector(".group");
const countyNote = await text(page.locator(".group", { has: page.locator("h2", { hasText: "County: pick your district" }) }).locator(".g-note"));
check("5c. county contests are on every ballot in the county (not one of them)", countyNote.startsWith("Every ballot in a county") , countyNote);

// 5d. Las Vegas is one click from the top of the Overview, and a Nevada ZIP code points there.
await page.locator(".intro .jump button", { hasText: "Nevada · Las Vegas" }).click();
await page.waitForTimeout(800);
const nvInView = await page.evaluate(() => {
  const el = document.getElementById("state-nv");
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.top < window.innerHeight && r.bottom > 0;
});
check("5d. the Overview's Nevada · Las Vegas link scrolls to the Las Vegas contests", nvInView, "");

// 5j. A Nevada ZIP narrows the Overview to that voter's Nevada contests: city contests only inside the City of Las Vegas.
async function zipBallot(zip) {
  await page.evaluate(() => localStorage.removeItem("per-my-ballot"));
  await page.goto(`${BASE}#overview`);
  await page.reload();
  await page.locator('button.method[aria-label="ZIP code"]').click();
  await page.locator(".pane input").fill(zip);
  await page.locator(".pane button.apply").click();
  await page.waitForSelector(".found .frow", { timeout: 15000 });
  await page.waitForTimeout(200);
  const hrefs = await page.locator("a.crow").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
  return {
    title: await text(page.locator(".intro h1")),
    found: (await page.locator(".found").innerText()).replace(/\s+/g, " "),
    nv: hrefs.filter((h) => h.includes("2026-nv-general")).length,
    ca: hrefs.filter((h) => h.includes("2026-ca-general")).length,
    muni: hrefs.some((h) => h.includes("las-vegas-municipal-court")),
  };
}
const lv = await zipBallot("89101");
const hd = await zipBallot("89052");
check(
  "5j. a Nevada ZIP narrows the Overview to Nevada contests; city contests only inside the City of Las Vegas",
  lv.title.startsWith("Nevada") && lv.ca === 0 && lv.nv > 10 && lv.muni && lv.found.includes("City of Las Vegas") && hd.ca === 0 && hd.nv > 10 && !hd.muni,
  `89101: ${lv.nv} NV / ${lv.ca} CA, municipal court ${lv.muni}; 89052: ${hd.nv} NV, municipal court ${hd.muni}`,
);
await page.evaluate(() => localStorage.removeItem("per-my-ballot"));
await page.goto(`${BASE}#overview`);
await page.reload();

// 5k. A Nevada ballot question reads in Nevada's terms: exact small amounts, no San Francisco wording.
await page.goto(`${BASE}#c-2026-nv-general--question-7`);
await page.waitForSelector("main h1", { timeout: 15000 });
await page.waitForTimeout(300);
const q7 = (await page.locator("main").innerText()).replace(/\s+/g, " ");
check(
  "5k. Nevada Question 7 shows its $6,750 cost exactly, a state-level lane name and no Controller's-statement wording",
  q7.includes("$6,750") && q7.includes("State or local agency") && !q7.includes("Controller's statement") && !q7.includes("$6.8K"),
  q7.match(/[^.]{0,40}\$6,750[^.]{0,20}/)?.[0] ?? "no $6,750",
);
await page.goto(`${BASE}#overview`);

// 5l. "My pick" on a contest page, then Export my picks: a .txt of the ballot's contests with the pick and note.
await page.goto(`${BASE}#c-2026-ca-general--us-house-ca-11`);
await page.waitForSelector(".mine .opts button", { timeout: 15000 });
await page.locator(".mine .opts button", { hasText: "Connie Chan" }).click();
await page.locator(".mine textarea").fill("Reread both statements.");
await page.locator(".mine h2").click();
await page.goto(`${BASE}#overview?cd=11`);
await page.reload();
await page.waitForSelector(".export button");
const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), page.locator(".export button").click()]);
const fs = await import("node:fs");
const exported = fs.readFileSync(await dl.path(), "utf8");
check(
  "5l. My pick + Export my picks: a .txt of my ballot's contests with my pick and note",
  /^my-ballot-\d{4}-\d{2}-\d{2}\.txt$/.test(dl.suggestedFilename()) && exported.includes("[x] Connie Chan") && exported.includes("Note: Reread both statements.") && exported.includes("Districts: CA-11") && exported.includes("[ ] Yes   [ ] No"),
  `${dl.suggestedFilename()} · ${exported.split("\n").length} lines`,
);
await page.evaluate(() => {
  localStorage.removeItem("per-my-picks");
  localStorage.removeItem("per-my-ballot");
});
await page.goto(`${BASE}#overview`);
await page.reload();

// 5m. A ballot-measure stance row explains the measure: summary, what Yes and No mean, and a link to it.
await page.goto(`${BASE}#c-2026-ca-general--governor`);
await page.waitForSelector(".spine-lbl", { timeout: 15000 });
await page.locator("button", { has: page.locator(".spine-lbl", { hasText: /^Prop 3$/ }) }).first().click();
await page.waitForSelector(".about-m", { timeout: 5000 }).catch(() => null);
const about = ((await page.locator(".about-m").first().textContent().catch(() => "")) ?? "").replace(/\s+/g, " ");
check("5m. the Prop 3 stance row says what Prop 3 is (summary, Yes/No meaning, link)", about.includes("$371,000") && about.includes("Yes:") && about.includes("No:") && about.includes("Open Proposition 3"), about.slice(0, 120));

// 5n. Results: the leader of the semi-official count is highlighted, the other side dimmed, and the count line says so.
await go(page, "#c-2026-ca-general--governor");
await page.waitForSelector(".vs-head .who");
const wonHead = await text(page.locator(".vs-head .who.won"));
const lostHeads = await page.locator(".vs-head .who.lost").count();
const countText = await text(page.locator(".result-line"));
check(
  "5n. governor: the leader is highlighted (Leading or Elected), the other side dimmed, with the count line",
  /Leading|Elected/.test(wonHead) && wonHead.includes("Becerra") && lostHeads === 1 && /Semi-official count|Certified/.test(countText),
  `${wonHead} | ${countText}`,
);

// 5o. A proposition shows its yes/no bar and which side is ahead.
await go(page, "#c-2026-ca-general--prop-44");
await page.waitForSelector("header .rb");
const bar44 = await text(page.locator("header .rb"));
check("5o. Prop 44 shows its yes/no result bar, No ahead", /No ahead|Failed/.test(bar44) && /Yes \d+\.\d%/.test(bar44) && /No \d+\.\d%/.test(bar44), bar44.slice(0, 120));

// 5p. The promise tracker waits for SF's results; the governor's leader lists promises, "Not checked yet".
await go(page, "#c-2026-ca-general--sf-board-of-education");
await page.waitForSelector("section.tracker");
const waiting = await text(page.locator("section.tracker"));
await go(page, "#c-2026-ca-general--governor");
await page.waitForSelector("section.tracker .winner");
const tracked = await text(page.locator("section.tracker .winner").first());
check(
  "5p. promise tracker: SF Board of Education waits for results; the governor's promises start \"Not checked yet\"",
  waiting.includes("Waiting for results") && tracked.includes("Xavier Becerra") && tracked.includes("Not checked yet"),
  tracked.slice(0, 100),
);

// 5q. Demo: a certified result says "Elected"; a tracked promise's update opens in the drawer.
await page.evaluate(() => localStorage.setItem("per-dataset", "demo"));
await page.goto(`${BASE}#c-2030-zz-general--governor`);
await page.reload(); // a hash-only goto keeps the page (and its dataset)
await page.waitForSelector("section.tracker .winner");
const demoWon = await text(page.locator(".vs-head .who.won"));
const demoCounts = await text(page.locator("section.tracker .counts"));
await page.locator("section.tracker .p-btn", { hasText: "Widget apprenticeships" }).click();
await page.waitForSelector("aside.drawer");
const demoDrawer = await text(page.locator("aside.drawer"));
check(
  "5q. demo: \"Elected\" once certified, statuses counted, a promise's update in the drawer",
  demoWon.includes("Elected") && demoCounts.includes("1 done") && demoCounts.includes("1 not checked yet") && demoDrawer.includes("AB 2031"),
  `${demoWon} | ${demoCounts}`,
);
await page.keyboard.press("Escape");
await page.evaluate(() => localStorage.setItem("per-dataset", "draft"));
await page.goto(`${BASE}#overview`);
await page.reload();
await page.waitForSelector(".group");

// 5f. On the Overview, proposition groups start folded; one click opens them.
await go(page, "#overview");
await page.waitForSelector(".group");
const fold = page.locator("button.fold", { hasText: "State propositions" });
const foldedFirst = (await fold.getAttribute("aria-expanded")) === "false" && (await fold.locator("xpath=../..").locator(".list").count()) === 0;
await fold.click();
await page.waitForTimeout(150);
const opensOnClick = (await fold.getAttribute("aria-expanded")) === "true" && (await fold.locator("xpath=../..").locator(".list li").count()) > 0;
check("5f. proposition groups start folded on the Overview and open on click", foldedFirst && opensOnClick, "");

// 5g. SF Prop F shows its comparison table, labeled unverified.
await go(page, "#c-2026-ca-general--sf-prop-f");
await page.waitForSelector("table");
const cmpRows = await page.locator("table tbody tr").count();
const cmpWarn = await page.locator(".section", { hasText: "How it compares" }).locator(".chip.warn").count();
check("5g. SF Prop F shows the comparison table, marked unverified", cmpRows === 9 && cmpWarn === 1, `${cmpRows} rows`);

// 5h. Many-candidate tables use the full width on desktop; on a phone only the table scrolls, never the page.
const ccsf = "#c-2026-ca-general--sf-community-college-board";
const wide = await ctx.newPage();
await wide.setViewportSize({ width: 1440, height: 900 });
await wide.goto(`${BASE}${ccsf}`);
await wide.waitForSelector("table.ct");
const wideFit = await wide.evaluate(() => { const e = document.querySelector(".scroll-x.bleed"); return !!e && e.scrollWidth <= e.clientWidth && document.documentElement.scrollWidth <= innerWidth; });
const headTop = () => wide.evaluate(() => { scrollTo(0, 1000); return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => {
  const bar = document.querySelector(".top").getBoundingClientRect().bottom;
  const th = (document.querySelector(".float-head th.cand") ?? document.querySelector("thead th.cand")).getBoundingClientRect().top;
  r(Math.abs(th - bar) < 2);
}))); });
const wideSticky = await headTop();
await wide.setViewportSize({ width: 390, height: 844 });
await wide.waitForTimeout(150);
const phoneFit = await wide.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const phoneSticky = await headTop();
await wide.close();
check("5h. 8-candidate table fits at 1440px, names stay pinned while scrolling; no sideways page scroll at 390px", wideFit && phoneFit && wideSticky && phoneSticky, `fit ${wideFit}/${phoneFit}, pinned ${wideSticky}/${phoneSticky}`);

// 5i. Campaign promises grouped by topic, shared topics first.
await go(page, "#c-2026-ca-general--sf-community-college-board");
await page.waitForSelector("table.ct");
const topicRows = await page.locator("tr.r", { has: page.locator(".row-note") }).evaluateAll((rs) =>
  rs.map((r) => ({ label: r.querySelector(".row-label").firstChild.textContent.trim(), note: r.querySelector(".row-note").textContent.trim(), filled: r.querySelectorAll("td.has-items").length })),
);
const downtown = topicRows.find((t) => t.label === "Downtown campus");
const sortedByShare = topicRows.every((t, i) => i === 0 || topicRows[i - 1].filled >= t.filled);
check("5i. City College promises grouped by topic, shared first", !!downtown && downtown.note === "Shared by 3 of 8" && downtown.filled === 3 && sortedByShare && topicRows.length >= 10, `${topicRows.length} topics; Downtown: ${downtown?.note}`);

// 6. California, and San Francisco keeps its own answers.
await go(page, "#trial");
await page.waitForSelector("article.card");
await page.locator(".votebar button.ans.yes").click(); // San Francisco Prop A: yes
await page.waitForTimeout(150);
await page.locator(".trial .seg button", { hasText: "California" }).click();
await page.waitForTimeout(250);
await page.locator(".votebar button.ans.yes").click(); // Prop 1: yes
await page.waitForTimeout(200);
const line1 = await text(page.locator(".meter-wrap .gap"));
check("6a. Yes on Prop 1: FY2027-28 shortfall $500M–$600M larger", line1.includes("FY2027-28") && line1.includes("larger") && line1.includes("+$500M–$600M"), line1);
await page.waitForTimeout(2700); // let the highlight clear
const yearsBefore = await page.locator(".meter-wrap .yr").allTextContents();
await page.locator(".dot", { hasText: /^3$/ }).click();
await page.locator(".votebar button.ans.yes").click(); // Prop 3: yes
await page.waitForTimeout(200);
const yearsAfter = await page.locator(".meter-wrap .yr").allTextContents();
const flagged = await page.locator(".meter-wrap .yr.changed").count();
check("6b. Yes on Prop 3 moves no forecast year", JSON.stringify(yearsBefore) === JSON.stringify(yearsAfter) && flagged === 0, JSON.stringify(yearsAfter));
await page.locator(".dot", { hasText: /^44$/ }).click();
await page.waitForTimeout(150);
const chips44 = (await page.locator("article.card").first().textContent()) ?? "";
check("6c. Prop 44's cost is quoted in the Legislative Analyst's words", chips44.includes("“low tens of millions of dollars per year”"), "");
await page.locator("button.link", { hasText: "Summary" }).click();
await page.waitForTimeout(300);
const outside = (await page.locator(".panel.list ul li").allTextContents()).map((t) => t.replace(/\s+/g, " ").trim());
check(
  "6d. the summary lists Prop 3 from FY2030-31 and adds nothing for words",
  outside.some((t) => t.startsWith("Starts after the forecast (Prop 3, from FY2030-31)")) && !outside.some((t) => /Sized in words, not added up \(Prop 44\)/.test(t)),
  outside.find((t) => t.includes("Prop 3")) ?? "",
);
await page.locator(".trial .seg button", { hasText: "San Francisco" }).click();
await page.waitForTimeout(250);
const sfProgress = await text(page.locator(".progress .num"));
check("6e. San Francisco's ballot keeps its own answers", sfProgress.startsWith("1 of 10"), sfProgress);

// 7. About and keyboard tooltips.
await page.locator("a.beta").click();
await page.waitForSelector(".about");
const status = await text(page.locator(".about .box", { hasText: "Data status" }));
await page.locator("#ds-demo").click();
await page.waitForTimeout(150);
const demoOn = await page.locator(".banner.demo").count();
await page.locator(".banner.demo button.link", { hasText: "Back to the real data" }).click();
await page.waitForTimeout(150);
const demoOff = await page.locator(".banner.demo").count();
check("7a. Beta badge opens About; data status; demo switch and back", status.includes("No errors") && demoOn === 1 && demoOff === 0, status.slice(0, 80));
await go(page, "#trial");
await page.waitForSelector("rect.hit[role=img]");
await page.locator("rect.hit[role=img]").first().focus();
await page.waitForTimeout(100);
const tip = (await page.locator(".tip").count()) ? await text(page.locator(".tip")) : "";
await page.keyboard.press("Escape");
await page.waitForTimeout(50);
check("7b. a bridge row shows its tooltip on keyboard focus; Escape hides it", tip.startsWith("Official forecast") && (await page.locator(".tip").count()) === 0, tip.slice(0, 60));

// 8. Site sweep (2026-11-06): checks over every page, so the bugs it found stay fixed.
async function sweepPage(width, scheme = "light") {
  const c = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, colorScheme: scheme });
  await c.addInitScript(() => localStorage.setItem("per-dataset", "draft"));
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await p.goto(`${BASE}#overview`);
  await p.waitForSelector("main > *", { timeout: 15000 });
  return { c, p };
}
/** Go to a route and open everything folded on it (groups, rows, <details>). */
async function openAll(p, route) {
  await p.evaluate(async (h) => {
    location.hash = h;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    for (const b of document.querySelectorAll('main button[aria-expanded="false"]')) if (!b.closest("details")) b.click();
    for (const d of document.querySelectorAll("main details")) d.open = true;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, route);
}
{
  // 8a, 8c. Every in-site link leads to a page (the site silently shows the Overview for an unknown #route), and no page,
  // with everything opened, shows "undefined", "NaN", "[object Object]" or "Invalid Date".
  const { c, p } = await sweepPage(1280);
  const seen = new Set();
  const queue = ["overview", "measures", "trial", "issues", "sources", "queue", "about"];
  const dead = [];
  const broken = [];
  while (queue.length) {
    const route = queue.shift();
    if (seen.has(route)) continue;
    seen.add(route);
    await openAll(p, route);
    const r = await p.evaluate(() => ({
      active: document.querySelector("nav.nav a.active:not(.cur)")?.getAttribute("href") ?? document.querySelector("nav.nav a.active")?.getAttribute("href"),
      links: [...document.querySelectorAll('a[href^="#"]')].map((a) => decodeURIComponent(a.getAttribute("href").slice(1))),
      bad: ((document.querySelector("main")?.innerText ?? "").match(/.{0,30}(\bundefined\b|\bNaN\b|\[object Object\]|Invalid Date).{0,30}/) ?? [""])[0],
    }));
    if (route.split("?")[0] !== "overview" && r.active === "#overview") dead.push(route);
    if (r.bad) broken.push(`${route}: ${r.bad}`);
    for (const l of r.links) if (!seen.has(l)) queue.push(l);
  }
  check("8a. every in-site link leads to a page", dead.length === 0 && seen.size > 200, dead.join(" ") || `${seen.size} pages`);
  check("8c. no page shows undefined, NaN or [object Object]", broken.length === 0, broken.slice(0, 3).join(" | "));
  await c.close();
}
{
  // 8b. On a phone, opening every folded section never makes the page scroll sideways (long URLs in leads and notes wrap).
  const { c, p } = await sweepPage(390);
  const wide = [];
  for (const route of [
    "overview",
    "measures",
    "trial",
    "about",
    "c-2026-ca-general--governor",
    "c-2026-ca-general--us-house-ca-19",
    "c-2026-ca-general--sf-assessor-recorder",
    "c-2026-ca-general--sf-community-college-board",
    "c-2026-ca-general--sf-supervisor-district-2",
    "c-2026-nv-general--governor",
    "c-2026-nv-general--district-court-dept-1",
    "c-2026-ca-general--prop-5",
    "c-2026-nv-general--question-7",
  ]) {
    await openAll(p, route);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (over > 0) wide.push(`${route} +${over}px`);
  }
  check("8b. no sideways page scroll at 390px with every section opened", wide.length === 0, wide.join(", "));
  await c.close();
}
{
  // 8d. Losers are dimmed by color, not opacity: their text keeps 4.5:1 in dark mode.
  const { c, p } = await sweepPage(1280, "dark");
  await p.evaluate(() => (location.hash = "c-2026-ca-general--governor"));
  await p.waitForSelector(".who.lost");
  const low = await p.evaluate(() => {
    const rgb = (s) => (s.match(/[\d.]+/g) ?? []).map(Number);
    const lum = ([r, g, b]) => {
      const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const out = [];
    for (const el of document.querySelectorAll(".who.lost .who-name, .who.lost .who-sub, .who.lost .who-res")) {
      let op = 1;
      for (let n = el; n; n = n.parentElement) op *= Number(getComputedStyle(n).opacity);
      let bg = [255, 255, 255];
      for (let n = el; n; n = n.parentElement) {
        const c = rgb(getComputedStyle(n).backgroundColor);
        if (c.length === 3 || c[3] > 0) {
          bg = c.slice(0, 3);
          break;
        }
      }
      const fg = rgb(getComputedStyle(el).color);
      const a = (fg[3] ?? 1) * op;
      const mixed = fg.slice(0, 3).map((v, i) => v * a + bg[i] * (1 - a));
      const [x, y] = [lum(mixed), lum(bg)];
      const ratio = (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
      if (ratio < 4.5) out.push(`${el.className.split(" ")[0]} ${ratio.toFixed(2)}`);
    }
    return out;
  });
  check("8d. the dimmed loser's name and details keep 4.5:1 contrast in dark mode", low.length === 0, low.join(", "));
  await c.close();
}
{
  // 8e. The drawer: focus moves in, Tab stays inside, Escape returns focus to the button that opened it.
  const { c, p } = await sweepPage(1280);
  await p.evaluate(() => (location.hash = "c-2026-ca-general--prop-5"));
  const cite = p.locator("main button.cite").first();
  await cite.focus();
  await p.keyboard.press("Enter");
  await p.waitForSelector("aside.drawer");
  const dialog = (await p.locator("aside.drawer").getAttribute("role")) === "dialog";
  let inside = true;
  for (let k = 0; k < 12; k++) {
    await p.keyboard.press("Tab");
    inside &&= await p.evaluate(() => !!document.querySelector("aside.drawer")?.contains(document.activeElement));
  }
  await p.keyboard.press("Escape");
  await p.waitForTimeout(100);
  const back = await cite.evaluate((b) => b === document.activeElement);
  check("8e. the drawer is a dialog that keeps Tab inside and gives focus back on Escape", dialog && inside && back, `dialog ${dialog}, Tab stayed inside ${inside}, focus returned ${back}`);
  await c.close();
}
{
  // 8f. Back from a contest returns to where the reader was on the Overview.
  const { c, p } = await sweepPage(1280);
  await p.evaluate(() => window.scrollTo(0, 2500));
  await p.waitForTimeout(300);
  const before = await p.evaluate(() => Math.round(window.scrollY));
  const idx = await p.evaluate(() => [...document.querySelectorAll("a.crow")].findIndex((a) => a.getBoundingClientRect().top > 160 && a.getBoundingClientRect().bottom < innerHeight - 20));
  await p.locator("a.crow").nth(idx).click();
  await p.waitForSelector("header.head");
  const opened = await p.evaluate(() => Math.round(window.scrollY));
  await p.goBack();
  await p.waitForTimeout(500);
  const after = await p.evaluate(() => Math.round(window.scrollY));
  check("8f. Back returns to the reader's place on the Overview; a new page starts at the top", opened === 0 && Math.abs(after - before) < 5 && before > 2000, `before ${before}, opened ${opened}, after Back ${after}`);
  await c.close();
}
{
  // 8g. Nevada's statewide ballot questions are on the Measures tab, labeled "Question".
  const { c, p } = await sweepPage(1280);
  await p.evaluate(() => (location.hash = "measures"));
  await p.waitForSelector(".mcard");
  const q7 = await p.locator('a.mcard[href="#c-2026-nv-general--question-7"]').count();
  const q7label = q7 ? await text(p.locator('a.mcard[href="#c-2026-nv-general--question-7"] .letter')) : "";
  check("8g. the Measures tab lists Nevada's Question 7", q7 === 1 && q7label === "Question 7", q7label || "missing");
  // 8h. My ballot for a San Francisco ZIP in Assembly District 17 doesn't call that race missing; the title counts both states.
  const title = await p.evaluate(() => ((location.hash = "overview"), new Promise((r) => setTimeout(() => r(document.querySelector(".intro h1")?.textContent?.trim() ?? ""), 300))));
  await p.locator('button.method[aria-label="ZIP code"]').click();
  await p.locator(".pane input").fill("94110");
  await p.locator(".pane button.apply").click();
  await p.waitForSelector(".found .frow", { timeout: 15000 });
  const note = await p.evaluate(() => [...document.querySelectorAll(".mb p")].map((x) => x.textContent ?? "").find((t) => t.startsWith("Also on your ballot")) ?? "");
  check(
    "8h. the Overview title names both states; My ballot doesn't list Assembly District 17 as missing for 94110",
    title === "California and Nevada contests" && note !== "" && !note.includes("Assembly District 17"),
    `${title} | ${note.replace(/\s+/g, " ").slice(0, 120)}`,
  );
  await p.evaluate(() => localStorage.removeItem("per-my-ballot"));
  await c.close();
}

// 9. UI improvements the maintainer picked from the sweep (2026-11-06).
{
  // 9a (U6). A nonpartisan race (the certified list prints no party) says so in the Party row instead of "Not found";
  // a partisan race still shows the party.
  const { c, p } = await sweepPage(1280);
  await p.evaluate(() => (location.hash = "c-2026-ca-general--sf-community-college-board"));
  await p.waitForSelector("table");
  const partyCells = await p.evaluate(() => {
    const tr = [...document.querySelectorAll("tr")].find((r) => (r.querySelector("th")?.textContent ?? "").trim().startsWith("Party"));
    return tr ? [...tr.querySelectorAll("td")].map((td) => (td.textContent ?? "").replace(/\s+/g, " ").trim()) : [];
  });
  await p.evaluate(() => (location.hash = "c-2026-ca-general--governor"));
  await p.waitForSelector(".vs");
  const govParty = await p.evaluate(() => {
    const row = [...document.querySelectorAll("button.row-btn")].find((b) => (b.textContent ?? "").includes("Party"));
    return (row?.textContent ?? "").replace(/\s+/g, " ").trim();
  });
  check(
    "9a. a nonpartisan race says \"Nonpartisan office\" in the Party row; the governor's race still shows parties",
    partyCells.length === 8 && partyCells.every((t) => t.includes("Nonpartisan office") && !t.includes("Not found")) && govParty.includes("Democratic") && govParty.includes("Republican"),
    `${partyCells[0] ?? "no Party row"} (${partyCells.length}) | ${govParty.slice(0, 60)}`,
  );
  await c.close();
}

// 5e. Vercel Web Analytics runs on the public site only; anywhere else the page loads none of it.
const onPublicSite = new URL(BASE).hostname === "political-election-research.vercel.app";
const vaScript = await page.evaluate(() => document.querySelector('script[data-sdkn^="@vercel/analytics"]')?.getAttribute("src") ?? "");
const vaRequests = requests.filter((u) => /\/_vercel\/insights\/|vercel-scripts\.com|vercel-insights\.com/.test(u));
check(
  onPublicSite ? "5e. the public site loads Vercel Web Analytics from its own address" : "5e. no analytics script here (Vercel Web Analytics runs only on the public site)",
  onPublicSite ? vaScript === "/_vercel/insights/script.js" && vaRequests.length > 0 : !vaScript && !vaRequests.length,
  vaScript || vaRequests.join(" ") || "no analytics script, no analytics requests",
);

// 4b and 5: no errors, no policy violations, nothing requested beyond the site and its fonts.
const violations = await page.evaluate(() => window.__csp);
check("4b. no console errors and no security-policy violations", !errors.length && !violations.length, [...errors, ...violations].join(" | ").slice(0, 300));
const offsite = [...new Set(requests.filter((u) => /^https?:/.test(u) && !ALLOWED_HOSTS.has(new URL(u).host)))];
check("5b. nothing requested beyond the site and Google Fonts", offsite.length === 0, offsite.join(" ") || `${requests.length} requests`);

await browser.close();
await server?.close();
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `\n      ${r.detail}` : ""}`);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
process.exitCode = results.every((r) => r.ok) ? 0 : 1;
