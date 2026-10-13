#!/usr/bin/env node
// Tiles images into one labelled sheet so a whole set can be reviewed in a single look
// (much cheaper than opening each image).
//
//   node contact-sheet.mjs <out.png> <image> [image ...] [--columns 3] [--tile 420]
//   node contact-sheet.mjs <out.png> --dir public/images [--columns 3]

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve, basename, extname } from "node:path";
import { launchBrowser } from "./lib/browser.mjs";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("Playwright isn't installed for Acquired Taste yet. Run the plugin's setup check: node <plugin>/scripts/setup.mjs");
  process.exit(2);
}

const args = process.argv.slice(2);
const take = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args.splice(i, 2)[1];
};
const columns = Number(take("columns", 3));
const tile = Number(take("tile", 420));
const dir = take("dir", null);
const [out, ...listed] = args;
const images = dir
  ? readdirSync(dir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).map((f) => join(dir, f))
  : listed;
if (!out || !images.length) {
  console.error("Usage: node contact-sheet.mjs <out.png> <image> [image ...] [--columns 3] [--tile 420]");
  process.exit(1);
}

const mime = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
const tiles = images.map((p) => {
  const data = readFileSync(resolve(p)).toString("base64");
  return `<figure><img src="data:${mime[extname(p).toLowerCase()]};base64,${data}"><figcaption>${basename(p)}</figcaption></figure>`;
});
const html = `<!doctype html><style>
  body { margin: 0; background: #1b1b1b; color: #eee; font: 500 13px system-ui, sans-serif; }
  .grid { display: grid; grid-template-columns: repeat(${columns}, ${tile}px); gap: 12px; padding: 12px; align-items: start; }
  figure { margin: 0; } img { width: 100%; display: block; } figcaption { margin-top: 4px; }
</style><div class="grid">${tiles.join("")}</div>`;

const browser = await launchBrowser(chromium);
const page = await browser.newPage({ viewport: { width: columns * (tile + 12) + 12, height: 400 } });
await page.setContent(html, { waitUntil: "load" });
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(`Wrote ${resolve(out)} (${images.length} images)`);
