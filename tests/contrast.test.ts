import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The site's text color tokens (--ink, --ink-2, --muted) must stay readable on every background token
 * (--paper, --surface, --raised, --wash) in both themes: WCAG AA, 4.5:1 for normal-size text.
 */
const css = fs.readFileSync(path.join(__dirname, "../web/src/app.css"), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block in app.css`);
  const body = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1]!, m[2]!]));
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

const THEMES = { light: block(":root"), dark: block(':root[data-theme="dark"]') };
const TEXT = ["--ink", "--ink-2", "--muted"];
const BACKGROUNDS = ["--paper", "--surface", "--raised", "--wash"];

describe("text contrast of the color tokens", () => {
  for (const [theme, tokens] of Object.entries(THEMES)) {
    for (const fg of TEXT) {
      for (const bg of BACKGROUNDS) {
        it(`${theme}: ${fg} on ${bg} is at least 4.5:1`, () => {
          expect(tokens[fg], `${fg} in ${theme}`).toBeDefined();
          expect(tokens[bg], `${bg} in ${theme}`).toBeDefined();
          expect(contrast(tokens[fg]!, tokens[bg]!)).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  }

  it("the dark theme is the same under prefers-color-scheme and data-theme", () => {
    const start = css.indexOf("@media (prefers-color-scheme: dark)");
    const media = css.slice(start, css.indexOf(':root[data-theme="dark"]', start));
    const auto = Object.fromEntries([...media.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1]!, m[2]!]));
    expect(auto).toEqual(THEMES.dark);
  });
});
