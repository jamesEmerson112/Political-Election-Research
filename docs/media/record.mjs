/**
 * Records the README's GIFs from the built site (npm run web:build first):
 *   node docs/media/record.mjs [contest|my-ballot|measures|try-your-ballot ...]
 * Chrome's screencast gives each changed frame with its time; ffmpeg turns the frames into a GIF here in
 * docs/media. Needs Playwright with Chromium and ffmpeg. Re-record after visible changes to these pages.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { serve } from "../../tests/e2e/server.mjs";
const { chromium } = createRequire(import.meta.url)("playwright");
const OUT = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(OUT, "../..");
const ONLY = process.argv.slice(2);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "readme-gifs-"));
const server = await serve(path.join(REPO, "dist/web"), path.join(REPO, "vercel.json"));
const browser = await chromium.launch();
const W = 1024;
const H = 640;

/** A visible cursor (headless Chrome draws none): an arrow that follows the mouse and rings on click. */
const CURSOR = () => {
  addEventListener("DOMContentLoaded", () => {
    const c = document.createElement("div");
    c.id = "fake-cursor";
    c.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l15 10.5-6.5 1.2 3.8 7.3-2.6 1.3-3.8-7.3L5 20z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg><span></span>';
    const s = document.createElement("style");
    s.textContent = `#fake-cursor{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px)}
      #fake-cursor span{position:absolute;left:-12px;top:-12px;width:28px;height:28px;border-radius:50%;border:2px solid #2a78d6;opacity:0;transform:scale(.4);transition:opacity .35s,transform .35s}
      #fake-cursor.down span{opacity:.9;transform:scale(1)}`;
    document.head.append(s);
    document.body.append(c);
    addEventListener("mousemove", (e) => (c.style.transform = `translate(${e.clientX - 3}px,${e.clientY - 2}px)`), true);
    addEventListener("mousedown", () => c.classList.add("down"), true);
    addEventListener("mouseup", () => setTimeout(() => c.classList.remove("down"), 250), true);
  });
};

async function record(name, ds, fn) {
  if (ONLY.length && !ONLY.includes(name)) return;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, colorScheme: "light" });
  await ctx.addInitScript((d) => {
    localStorage.setItem("per-dataset", d);
  }, ds);
  await ctx.addInitScript(CURSOR);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
    frames.push({ data, t: metadata.timestamp });
    await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  const h = {
    page,
    wait: (ms) => page.waitForTimeout(ms),
    async start() {
      await page.mouse.move(W - 60, H - 40);
      await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1, maxWidth: W, maxHeight: H });
      await page.waitForTimeout(100);
    },
    async moveClick(loc, { click = true } = {}) {
      await loc.scrollIntoViewIfNeeded();
      const b = await loc.boundingBox();
      await page.mouse.move(b.x + Math.min(b.width / 2, 40), b.y + b.height / 2, { steps: 22 });
      await page.waitForTimeout(250);
      if (click) {
        await page.mouse.down();
        await page.waitForTimeout(90);
        await page.mouse.up();
        // The page's own handler runs on click; mouse.down/up fire it.
      }
    },
    async scrollBy(dy, ms = 1100) {
      await page.evaluate(
        ([dy, ms]) =>
          new Promise((res) => {
            const y0 = scrollY;
            const t0 = performance.now();
            const step = (t) => {
              const k = Math.min(1, (t - t0) / ms);
              const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
              scrollTo(0, y0 + dy * e);
              if (k < 1) requestAnimationFrame(step);
              else res();
            };
            requestAnimationFrame(step);
          }),
        [dy, ms],
      );
    },
  };
  await fn(h);
  await page.waitForTimeout(200);
  await cdp.send("Page.stopScreencast");
  // Frames -> a concat list with each frame's duration, the last held 2s.
  const dir = path.join(TMP, `${name}-frames`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir);
  const list = [];
  frames.forEach((f, i) => {
    const file = path.join(dir, `f${String(i).padStart(4, "0")}.png`);
    fs.writeFileSync(file, Buffer.from(f.data, "base64"));
    const dur = i + 1 < frames.length ? Math.max(0.02, frames[i + 1].t - f.t) : 2;
    list.push(`file '${file}'`, `duration ${dur.toFixed(3)}`);
  });
  list.push(`file '${path.join(dir, `f${String(frames.length - 1).padStart(4, "0")}.png`)}'`);
  fs.writeFileSync(path.join(dir, "list.txt"), list.join("\n"));
  const gif = path.join(OUT, `${name}.gif`);
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(dir, "list.txt"),
    "-vf", "fps=12,split[s0][s1];[s0]palettegen=max_colors=96:stats_mode=diff[p];[s1][p]paletteuse=dither=none:diff_mode=rectangle",
    "-loop", "0", gif,
  ]);
  console.log(`${name}: ${frames.length} frames, ${(fs.statSync(gif).size / 1e6).toFixed(2)} MB`);
  await ctx.close();
}

const go = async (page, hash) => {
  await page.goto(`${server.url}#${hash}`);
  await page.waitForSelector("main > *");
  await page.waitForTimeout(600);
};

// 1. A contest: the result line, the versus spine, a row's sentences, a citation's verbatim quote.
await record("contest", "draft", async ({ page, wait, start, moveClick, scrollBy }) => {
  await go(page, "c-2026-ca-general--governor");
  await start();
  await wait(1800);
  const vsTop = await page.evaluate(() => document.querySelector(".vs").getBoundingClientRect().top + scrollY - 120);
  await scrollBy(vsTop - (await page.evaluate(() => scrollY)), 1300);
  await wait(1400);
  const row = page.locator("button.row-btn", { hasText: "High speed rail funding" });
  const rowTop = await row.evaluate((el) => el.getBoundingClientRect().top + scrollY - 260);
  await scrollBy(rowTop - (await page.evaluate(() => scrollY)), 1500);
  await wait(600);
  await moveClick(row);
  await wait(1300);
  const id = await row.getAttribute("aria-controls");
  await moveClick(page.locator(`#${id} button.cite`).first());
  await wait(3000);
  await page.keyboard.press("Escape");
  await wait(900);
});

// 2. My ballot: a ZIP code narrows the Overview to that voter's contests.
await record("my-ballot", "draft", async ({ page, wait, start, moveClick, scrollBy }) => {
  await go(page, "overview");
  await start();
  await wait(1500);
  await moveClick(page.locator('button.method[aria-label="ZIP code"]'));
  await wait(500);
  await moveClick(page.locator(".pane input"));
  await page.locator(".pane input").pressSequentially("94110", { delay: 160 });
  await wait(400);
  await moveClick(page.locator(".pane button.apply"));
  await wait(1800);
  await scrollBy(560, 1600);
  await wait(1200);
  await scrollBy(520, 1400);
  await wait(1600);
});

// 3. Measures: yes/no bars from the semi-official count, then one proposition.
await record("measures", "draft", async ({ page, wait, start, moveClick, scrollBy }) => {
  await go(page, "measures");
  await start();
  await wait(1800);
  await scrollBy(330, 1200);
  await wait(1000);
  await moveClick(page.locator('a.mcard[href="#c-2026-ca-general--prop-5"] .title'));
  await page.waitForSelector("header .rb");
  await wait(1400);
  const bar = page.locator("header .rb .bar");
  const b = await bar.boundingBox();
  await page.mouse.move(b.x + b.width * 0.3, b.y + b.height / 2, { steps: 20 });
  await wait(2200);
});

// 4. Try your ballot: votes add up the official fiscal estimates against the budget forecast.
await record("try-your-ballot", "draft", async ({ page, wait, start, moveClick }) => {
  await go(page, "trial");
  await page.waitForSelector("article.card");
  await start();
  await wait(1500);
  for (const v of ["yes", "yes", "no", "yes"]) {
    await moveClick(page.locator(`.votebar button.ans.${v}`));
    await wait(1300);
  }
  await moveClick(page.locator("button.link", { hasText: "Summary" }));
  await wait(2600);
});

await browser.close();
await server.close();
fs.rmSync(TMP, { recursive: true, force: true });
