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
 * 5d. The Overview links to the Las Vegas (Nevada) contests.
 * 5e. Vercel Web Analytics loads only on the public site (political-election-research.vercel.app):
 *    on the local server and on preview deployments the page loads no analytics script.
 * 5f. Proposition groups start folded on the Overview.
 * 7. About: the Beta badge opens it; data status and the demo switch work; a bridge row shows its
 *    tooltip on keyboard focus and Escape hides it.
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

// 5f. On the Overview, proposition groups start folded; one click opens them.
await go(page, "#overview");
await page.waitForSelector(".group");
const fold = page.locator("button.fold", { hasText: "State propositions" });
const foldedFirst = (await fold.getAttribute("aria-expanded")) === "false" && (await fold.locator("xpath=../..").locator(".list").count()) === 0;
await fold.click();
await page.waitForTimeout(150);
const opensOnClick = (await fold.getAttribute("aria-expanded")) === "true" && (await fold.locator("xpath=../..").locator(".list li").count()) > 0;
check("5f. proposition groups start folded on the Overview and open on click", foldedFirst && opensOnClick, "");

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
