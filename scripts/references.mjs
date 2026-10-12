#!/usr/bin/env node
// Studies reference sites the user likes: screenshots them and records how they're built,
// so their qualities can be borrowed (not their looks copied).
//
//   node references.mjs <url|image> [url|image ...] [--out .acquired-taste/references]
//
// For each URL: top-of-page, 35% and 70% scroll screenshots, plus signals (fonts, motion
// libraries, smooth scroll, WebGL, video, custom cursor, running animations). Local images
// (screenshots the user sent) are included as they are. Writes signals.json and one
// contact sheet (sheet.png) to review everything in a single look.

import { mkdirSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { join, resolve, basename, extname } from "node:path";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("Playwright isn't installed for Acquired Taste yet. Run the plugin's setup check: node <plugin>/scripts/setup.mjs");
  process.exit(2);
}

const args = process.argv.slice(2);
const outAt = args.indexOf("--out");
const outDir = resolve(outAt === -1 ? join(".acquired-taste", "references") : args.splice(outAt, 2)[1]);
if (!args.length) {
  console.error("Usage: node references.mjs <url|image> [url|image ...] [--out dir]");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const results = [];
const tiles = [];

for (const item of args) {
  if (!/^https?:\/\//i.test(item)) {
    if (!existsSync(item)) { results.push({ source: item, error: "file not found" }); continue; }
    const target = join(outDir, `image-${basename(item)}`);
    copyFileSync(item, target);
    results.push({ source: item, kind: "image", path: target });
    tiles.push({ label: basename(item), path: target });
    continue;
  }

  const host = new URL(item).hostname.replace(/^www\./, "");
  const dir = join(outDir, host);
  mkdirSync(dir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(item, { waitUntil: "load", timeout: 45000 });
    await page.waitForTimeout(3500); // let intros and preloaders finish
    // Dismiss common cookie banners so they don't cover the design.
    for (const label of ["Accept all", "Accept", "Allow all", "Agree", "Got it", "OK"]) {
      const button = page.getByRole("button", { name: label, exact: true });
      if (await button.count().catch(() => 0)) { await button.first().click({ timeout: 1000 }).catch(() => {}); break; }
    }
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(dir, "top.png") });
    tiles.push({ label: `${host} (top)`, path: join(dir, "top.png") });

    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (const [name, frac] of [["mid", 0.35], ["lower", 0.7]]) {
      await page.mouse.wheel(0, Math.round(height * frac));
      await page.waitForTimeout(1500);
      await page.screenshot({ path: join(dir, `${name}.png`) });
      tiles.push({ label: `${host} (${name})`, path: join(dir, `${name}.png`) });
      await page.mouse.wheel(0, -Math.round(height * frac));
    }

    const signals = await page.evaluate(() => {
      const scripts = [...document.scripts].map((s) => s.src).join(" ").toLowerCase();
      const w = window;
      const family = (el) => getComputedStyle(el).fontFamily.split(",")[0].replace(/["']/g, "").trim();
      const pick = (sel) => [...new Set([...document.querySelectorAll(sel)].slice(0, 80).map(family))];
      const h1 = document.querySelector("h1");
      return {
        title: document.title,
        headingFonts: pick("h1, h2, h3"),
        bodyFonts: pick("p, li"),
        h1Size: h1 ? getComputedStyle(h1).fontSize : null,
        gsap: !!w.gsap || /gsap|scrolltrigger/.test(scripts),
        smoothScroll: !!w.lenis || /lenis|locomotive/.test(scripts) || document.documentElement.classList.contains("lenis"),
        threeOrWebgl: !!w.THREE || /three/.test(scripts) || !!document.querySelector("canvas"),
        builtWith: /webflow/.test(scripts) || document.documentElement.dataset.wfPage ? "Webflow"
          : /framer/.test(scripts) || document.querySelector("[data-framer-name]") ? "Framer"
          : /_next\//.test(scripts) ? "Next.js" : "unknown",
        videos: document.querySelectorAll("video").length,
        images: document.querySelectorAll("img").length,
        customCursor: getComputedStyle(document.body).cursor === "none" || !!document.querySelector('[class*="cursor" i]'),
        runningAnimations: document.getAnimations().length,
        pageHeight: document.documentElement.scrollHeight,
      };
    });
    results.push({ source: item, kind: "site", host, ...signals });
    console.log(`${host}: ok`);
  } catch (e) {
    results.push({ source: item, kind: "site", host, error: e.message.split("\n")[0] });
    console.log(`${host}: couldn't load (${e.message.split("\n")[0]})`);
  }
  await page.close();
}

// One contact sheet of everything.
const { readFileSync } = await import("node:fs");
const mime = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
const html = `<!doctype html><style>
  body { margin: 0; background: #1b1b1b; color: #eee; font: 500 13px system-ui, sans-serif; }
  .grid { display: grid; grid-template-columns: repeat(3, 460px); gap: 12px; padding: 12px; }
  figure { margin: 0; } img { width: 100%; display: block; } figcaption { margin-top: 4px; }
</style><div class="grid">${tiles.map((t) => `<figure><img src="data:${mime[extname(t.path).toLowerCase()] ?? "image/png"};base64,${readFileSync(t.path).toString("base64")}"><figcaption>${t.label}</figcaption></figure>`).join("")}</div>`;
const sheetPage = await browser.newPage({ viewport: { width: 3 * 472 + 12, height: 400 } });
await sheetPage.setContent(html, { waitUntil: "load" });
await sheetPage.screenshot({ path: join(outDir, "sheet.png"), fullPage: true });
await browser.close();

writeFileSync(join(outDir, "signals.json"), JSON.stringify(results, null, 2));
for (const r of results.filter((r) => r.kind === "site" && !r.error)) {
  const motion = [r.gsap && "GSAP", r.smoothScroll && "smooth scroll", r.threeOrWebgl && "WebGL/3D", r.customCursor && "custom cursor", r.videos && `${r.videos} videos`].filter(Boolean).join(", ") || "little motion tooling";
  console.log(`- ${r.host}: headings ${r.headingFonts.slice(0, 2).join(" / ") || "?"}, body ${r.bodyFonts.slice(0, 1).join("") || "?"}, h1 ${r.h1Size ?? "?"}; ${motion}; built with ${r.builtWith}`);
}
console.log(`Contact sheet: ${join(outDir, "sheet.png")}\nDetails: ${join(outDir, "signals.json")}`);
