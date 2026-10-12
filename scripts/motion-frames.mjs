#!/usr/bin/env node
// Captures motion as a flip-book, because single screenshots can't show it (a drifting
// cloud over a headline looks like a bug in a still). Produces one sheet to review:
//   row 1: the top of the page over the first few seconds (entrance + ambient motion)
//   row 2: the cursor moving over the hero (pointer effects)
//   rows 3+: a slow scroll through the page, frame by frame (scroll moments, reveals)
//
//   node motion-frames.mjs <url> [--route /] [--width 1440] [--out .acquired-taste/review/motion.png]

import { mkdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { unmangle } from "./lib/steps.mjs";
import { workDir } from "./lib/workdir.mjs";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("Playwright isn't installed for Acquired Taste yet. Run the plugin's setup check: node <plugin>/scripts/setup.mjs");
  process.exit(2);
}

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args.splice(i, 2)[1]; };
const width = Number(opt("width", 1440));
const route = unmangle(opt("route", "/"));
const out = resolve(opt("out", join(".acquired-taste", "review", "motion.png")));
const [url] = args;
if (!url) { console.error("Usage: node motion-frames.mjs <url> [--route /] [--width 1440] [--out file.png]"); process.exit(1); }
const height = width < 768 ? 844 : 900;
if (out.startsWith(resolve(".acquired-taste"))) workDir();
mkdirSync(dirname(out), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height } });
const frames = [];
const grab = async (label) => frames.push({ label, data: (await page.screenshot({ type: "jpeg", quality: 60 })).toString("base64") });

await page.goto(new URL(route, url).toString(), { waitUntil: "load", timeout: 30000 });
// Row 1: entrance and ambient motion over ~3s.
for (const t of [0, 400, 900, 1600, 2400, 3200]) {
  await page.waitForTimeout(t - (frames.length ? [0, 400, 900, 1600, 2400, 3200][frames.length - 1] : 0));
  await grab(`top ${(t / 1000).toFixed(1)}s`);
}
// Row 2: pointer over the hero.
const points = [[0.2, 0.35], [0.45, 0.5], [0.7, 0.4], [0.85, 0.6], [0.55, 0.7], [0.3, 0.6]];
for (const [x, y] of points) {
  await page.mouse.move(width * x, height * y, { steps: 8 });
  await page.waitForTimeout(350);
  await grab(`cursor ${Math.round(x * 100)}%,${Math.round(y * 100)}%`);
}
// Rows 3+: slow scroll, a frame every ~half viewport.
const total = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
const steps = Math.min(24, Math.max(6, Math.ceil(total / (height * 0.5))));
for (let i = 1; i <= steps; i++) {
  const y = Math.round((total * i) / steps);
  await page.evaluate(async (target) => {
    const start = scrollY, t0 = performance.now();
    await new Promise((done) => { const f = (t) => { const p = Math.min(1, (t - t0) / 450); scrollTo(0, start + (target - start) * p); p < 1 ? requestAnimationFrame(f) : done(); }; requestAnimationFrame(f); });
  }, y);
  await page.waitForTimeout(500);
  await grab(`scroll ${Math.round((y / Math.max(1, total)) * 100)}%`);
}

const tile = 300;
const html = `<!doctype html><style>
  body { margin: 0; background: #161616; color: #ddd; font: 500 11px system-ui, sans-serif; }
  .g { display: grid; grid-template-columns: repeat(6, ${tile}px); gap: 8px; padding: 8px; }
  figure { margin: 0; } img { width: 100%; display: block; } figcaption { margin-top: 2px; }
</style><div class="g">${frames.map((f) => `<figure><img src="data:image/jpeg;base64,${f.data}"><figcaption>${f.label}</figcaption></figure>`).join("")}</div>`;
const sheet = await browser.newPage({ viewport: { width: 6 * (tile + 8) + 8, height: 400 } });
await sheet.setContent(html, { waitUntil: "load" });
await sheet.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(`Motion sheet: ${out} (${frames.length} frames: 6 entrance, 6 cursor, ${steps} scroll)`);
