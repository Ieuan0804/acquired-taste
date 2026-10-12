#!/usr/bin/env node
// Inspects a business's own brand files (logo, marks, fonts) so the site is built around
// them, and makes favicons from the real logo.
//
//   node brand.mjs [brand-dir]                      inspect (default: ./brand)
//   node brand.mjs [brand-dir] --favicon <logo> --out app   also write icon.png + apple-icon.png
//
// For each image: format, size, transparency, the colours actually in it (as hex, by share
// of visible pixels), and whether it reads on light and on dark backgrounds.

import { readdirSync, readFileSync, statSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { workDir } from "./lib/workdir.mjs";
import { join, resolve, extname, basename } from "node:path";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("Playwright isn't installed for Acquired Taste yet. Run the plugin's setup check: node <plugin>/scripts/setup.mjs");
  process.exit(2);
}

const args = process.argv.slice(2);
const take = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args.splice(i, 2)[1];
};
const faviconFrom = take("favicon");
const faviconOut = take("out") ?? "app";
const dir = resolve(args[0] ?? "brand");
if (!existsSync(dir)) {
  console.error(`No brand folder at ${dir}. Put the business's logo, marks and font files there (or pass another folder).`);
  process.exit(1);
}

const files = readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile());
const images = files.filter((f) => /\.(svg|png|jpe?g|webp)$/i.test(f));
const fonts = files.filter((f) => /\.(woff2?|ttf|otf)$/i.test(f));
const other = files.filter((f) => !images.includes(f) && !fonts.includes(f));
const mime = { ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
const dataUrl = (f) => `data:${mime[extname(f).toLowerCase()]};base64,${readFileSync(join(dir, f)).toString("base64")}`;

const browser = await chromium.launch();
const page = await browser.newPage();
const report = { folder: dir, images: [], fonts, other };

for (const f of images) {
  const info = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const w = img.naturalWidth || 512;
    const h = img.naturalHeight || 512;
    const scale = Math.min(1, 400 / Math.max(w, h));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * scale));
    c.height = Math.max(1, Math.round(h * scale));
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    const buckets = new Map();
    let visible = 0, transparent = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) { transparent++; continue; }
      visible++;
      // Group similar pixels, but report each group's true average colour.
      const key = [0, 1, 2].map((k) => Math.round(data[i + k] / 24)).join(",");
      const b = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      b.n++; b.r += data[i]; b.g += data[i + 1]; b.b += data[i + 2];
      buckets.set(key, b);
    }
    const hex = (rgb) => "#" + rgb.split(",").map((v) => Math.min(255, Number(v)).toString(16).padStart(2, "0")).join("");
    const lum = (rgb) => {
      const [r, g, b] = rgb.split(",").map((v) => { const s = Math.min(255, Number(v)) / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const colours = [...buckets.values()].sort((a, b) => b.n - a.n).slice(0, 6)
      .map((b) => [`${Math.round(b.r / b.n)},${Math.round(b.g / b.n)},${Math.round(b.b / b.n)}`, b.n])
      .map(([rgb, n]) => ({ hex: hex(rgb), share: Math.round((n / visible) * 100), lum: lum(rgb) }))
      .filter((c) => c.share >= 2);
    const contrast = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const transparentBg = transparent / (visible + transparent) > 0.15;
    // Weighted by share: how well the mark's colours stand off white and off near-black.
    const avg = (bg) => colours.reduce((a, c) => a + contrast(c.lum, bg) * c.share, 0) / Math.max(1, colours.reduce((a, c) => a + c.share, 0));
    return { width: w, height: h, transparentBg, colours: colours.map(({ hex, share }) => ({ hex, share })), onLight: +avg(1).toFixed(1), onDark: +avg(0.012).toFixed(1) };
  }, dataUrl(f));
  report.images.push({ file: f, format: extname(f).slice(1).toLowerCase(), ...info });
}

if (faviconFrom) {
  const src = existsSync(faviconFrom) ? faviconFrom : join(dir, faviconFrom);
  const url = `data:${mime[extname(src).toLowerCase()]};base64,${readFileSync(src).toString("base64")}`;
  mkdirSync(resolve(faviconOut), { recursive: true });
  for (const [name, size] of [["icon.png", 512], ["apple-icon.png", 180]]) {
    const png = await page.evaluate(async ({ url, size }) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const ctx = c.getContext("2d");
      const w = img.naturalWidth || size, h = img.naturalHeight || size;
      const s = (size * 0.86) / Math.max(w, h);
      ctx.drawImage(img, (size - w * s) / 2, (size - h * s) / 2, w * s, h * s);
      return c.toDataURL("image/png").split(",")[1];
    }, { url, size });
    writeFileSync(join(resolve(faviconOut), name), Buffer.from(png, "base64"));
  }
  report.favicons = [join(faviconOut, "icon.png"), join(faviconOut, "apple-icon.png")];
}
await browser.close();

workDir();
writeFileSync(join(".acquired-taste", "brand.json"), JSON.stringify(report, null, 2));

console.log(`Brand files in ${dir}:`);
for (const im of report.images) {
  const reads = [im.onLight >= 3 ? "reads on light" : "weak on light", im.onDark >= 3 ? "reads on dark" : "weak on dark"].join(", ");
  console.log(`- ${im.file}: ${im.format.toUpperCase()} ${im.width}×${im.height}${im.transparentBg ? ", transparent background" : ", solid background"}; colours ${im.colours.map((c) => `${c.hex} (${c.share}%)`).join(", ")}; ${reads}`);
}
if (fonts.length) console.log(`- fonts: ${fonts.join(", ")}`);
if (other.length) console.log(`- other files (read these too): ${other.join(", ")}`);
if (report.favicons) console.log(`Favicons written: ${report.favicons.join(", ")}`);
console.log("Details: .acquired-taste/brand.json");
