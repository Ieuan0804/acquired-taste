#!/usr/bin/env node
// Checks a running site in a real browser and prints only the problems, one per line.
//
//   node review.mjs <url> [/route ...] [--widths 390,768,1280,1440,1920] [--parallel 4-8, by machine] [--out .acquired-taste/review]
//                   [--login "goto:/login; fill:Email=test@example.com; fill:Password=${TEST_PASSWORD}; click:Sign in"]
//   Saves top-of-page and full-page screenshots (full page at 1440, or the widest width, and the narrowest).
//   --login signs in once with try.mjs-style steps (separated by ";", or a file with one step
//   per line) and checks every route signed in. ${NAME} reads an environment variable.
//
// Per route and width: broken images, failed requests, console errors, horizontal
// overflow (with the element causing it), wrapped button labels, text under 12px,
// images without alt text. Saves screenshots and review.json to the out folder.

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { launchBrowser, browserNoise } from "./lib/browser.mjs";
import { fileURLToPath } from "node:url";
import { availableParallelism } from "node:os";
import { unmangle, parseLogin, signIn, newContext } from "./lib/steps.mjs";
import { workDir } from "./lib/workdir.mjs";

const PLUGIN = resolve(dirname(fileURLToPath(import.meta.url)), "..");

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error(`Playwright isn't installed for Acquired Taste yet. Run this once, then try again:
  npm install --prefix "${PLUGIN}" && npx --prefix "${PLUGIN}" playwright install chromium`);
  process.exit(2);
}

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args.splice(i, 2)[1];
};
const widths = flag("widths", "390,768,1280,1440,1920").split(",").map(Number);
const outDir = resolve(flag("out", join(".acquired-taste", "review")));
// Pages checked at once: half the machine's threads, between 4 and 8. On a 20-page app (16
// threads) 8 at once took 60 s against 113 s at 4 on the production build and 99 s against
// 146-194 s on the dev server, with no false problems and identical screenshots.
const concurrency = Math.max(1, Number(flag("parallel", Math.min(8, Math.max(4, Math.floor(availableParallelism() / 2))))));
const loginArg = flag("login", null);
// --final is accepted for older instructions; full-page shots are always saved now.
if (args.includes("--final")) args.splice(args.indexOf("--final"), 1);
const [url, ...rawRoutes] = args;
const extraRoutes = rawRoutes.map(unmangle);
if (!url) {
  console.error('Usage: node review.mjs <url> [/route ...] [--widths 390,768,1280,1440,1920] [--out dir] [--login "goto:/login; fill:Email=...; fill:Password=${TEST_PASSWORD}; click:Sign in"]');
  process.exit(1);
}
const routes = ["/", ...extraRoutes.filter((r) => r !== "/")];
if (outDir.startsWith(resolve(".acquired-taste"))) workDir();
mkdirSync(outDir, { recursive: true });

// Full-page screenshots at 1440 when checked: at 1920 a whole page shrinks too small to read
// when opened (2026-10-11 a run misread one as "no sections rendering").
const fullWidth = widths.includes(1440) ? 1440 : Math.max(...widths);
// Screenshots wait for running animations to finish (endless ones such as marquees are
// ignored, max 3s): a panel caught mid-slide once looked broken when it wasn't, and a real
// bug can hide the same way.
const settle = (page) => page.evaluate(() => Promise.race([
  Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))),
  new Promise((r) => setTimeout(r, 3000)),
])).catch(() => {});
const HEIGHTS = { 390: 844, 768: 1024, 1440: 900, 1920: 1080 };
const slugOf = (route) => (route === "/" ? "home" : route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "page");
const short = (s, n = 160) => (s.length > n ? `${s.slice(0, n)}…` : s);

const issues = new Map(); // "route | message" -> Set(widths)
const add = (route, width, message) => {
  const key = `${route} | ${message}`;
  if (!issues.has(key)) issues.set(key, new Set());
  issues.get(key).add(width);
};
const screenshots = [];

const browser = await launchBrowser(chromium);

// Apps behind a login: sign in once, then open every page with that saved session.
let login = null;
if (loginArg) {
  try {
    login = await signIn(browser, url, parseLogin(loginArg), outDir);
    console.log(`Signed in (login page ${login.loginPath}).${login.notes.length ? ` Fields ${login.notes.join("; ")}.` : ""}`);
  } catch (e) {
    console.error(`Couldn't sign in, so nothing was checked: ${e.message}`);
    await browser.close();
    process.exit(1);
  }
}
// Every route at every width, plus one pass at the widest width with reduced motion on:
// content must never depend on an animation to become visible.
const jobs = [
  ...routes.flatMap((route) => widths.map((width) => ({ route, width, reduced: false }))),
  ...routes.map((route) => ({ route, width: Math.max(...widths), reduced: true })),
];

async function checkOne({ route, width: w, reduced }) {
    const width = reduced ? `${w} reduced-motion` : w;
    const context = await newContext(browser, login, { viewport: { width: w, height: HEIGHTS[w] ?? Math.round(w * 0.625) }, reducedMotion: reduced ? "reduce" : "no-preference" });
    const page = await context.newPage();
    page.on("console", (m) => m.type() === "error" && !browserNoise(m) && add(route, width, `console error: ${short(m.text())}`));
    page.on("pageerror", (e) => add(route, width, `page error: ${short(e.message)}`));
    // Only real resource failures. Frameworks prefetch links in the background and cancel
    // those requests when the page closes (Next.js `?_rsc=`, net::ERR_ABORTED); that's normal.
    page.on("requestfailed", (r) => {
      const error = r.failure()?.errorText ?? "failed";
      const type = r.resourceType();
      if (/ERR_ABORTED|NS_BINDING_ABORTED/.test(error)) return;
      if (!["document", "image", "font", "stylesheet", "script", "media"].includes(type)) return;
      add(route, width, `${type} failed to load: ${short(r.url(), 120)} (${error})`);
    });
    page.on("response", (r) => {
      const type = r.request().resourceType();
      if (r.status() >= 400 && ["document", "image", "font", "stylesheet", "script", "media"].includes(type)) {
        add(route, width, `${r.status()} for ${type}: ${short(r.url(), 120)}`);
      }
    });

    const target = new URL(route, url).toString();
    try {
      await page.goto(target, { waitUntil: "load", timeout: 30000 });
    } catch (e) {
      add(route, width, `page didn't load: ${short(e.message)}`);
      await context.close();
      return;
    }
    await page.waitForTimeout(1500);
    // Signed in, but the app sent this page back to the login screen (checked after the wait,
    // since client-side apps redirect a moment after load): the screenshots would show the
    // login form, not the screen being reviewed.
    if (login && new URL(route, url).pathname !== login.loginPath && new URL(page.url()).pathname === login.loginPath) {
      add(route, width, `sent back to the login page (${login.loginPath}): the signed-in session didn't carry over, so this route wasn't checked`);
      await context.close();
      return;
    }
    const slug = slugOf(route);
    const fold = join(outDir, `${slug}-${w}${reduced ? "-reduced" : ""}-top.png`);
    await settle(page);
    await page.screenshot({ path: fold });
    screenshots.push(fold);

    // Scroll through so lazy images load and scroll-triggered reveals fire.
    await page.evaluate(async () => {
      const step = Math.round(window.innerHeight * 0.7);
      for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 200));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1200);

    const found = await page.evaluate(() => {
      const out = [];
      const vw = document.documentElement.clientWidth;
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 1 && r.height > 1 && s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
      };
      const name = (el) => {
        let n = el.tagName.toLowerCase();
        if (el.id) return `${n}#${el.id}`;
        const cls = [...el.classList].filter((c) => !c.includes(":")).slice(0, 2).join(".");
        return cls ? `${n}.${cls}` : n;
      };

      // Broken images.
      for (const img of document.images) {
        if (img.complete && img.naturalWidth === 0 && (img.currentSrc || img.src)) out.push(`broken image: ${(img.currentSrc || img.src).slice(0, 120)}`);
        if (!img.hasAttribute("alt") && visible(img)) out.push(`image without alt text: ${(img.currentSrc || img.src).slice(0, 100)}`);
      }

      // Horizontal overflow and its outermost cause.
      const pageWidth = document.documentElement.scrollWidth;
      if (pageWidth > vw + 1) {
        // Outermost elements sticking out past the viewport; confirm each one by hiding it
        // and checking whether the page gets narrower.
        const candidates = [...document.body.querySelectorAll("*")].filter((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.right <= vw + 1) return false;
          const pr = el.parentElement?.getBoundingClientRect();
          return !pr || pr.right <= vw + 1;
        }).slice(0, 25);
        const culprits = [];
        for (const el of candidates) {
          const before = el.style.display;
          el.style.display = "none";
          const narrower = document.documentElement.scrollWidth < pageWidth;
          el.style.display = before;
          if (narrower) culprits.push(el);
          if (culprits.length === 3) break;
        }
        const sameParent = culprits.length > 1 && culprits.every((el) => el.parentElement === culprits[0].parentElement);
        const list = sameParent
          ? [`the children of ${name(culprits[0].parentElement)} (e.g. ${name(culprits[0])}), which run off the right edge`]
          : culprits.map((el) => `${name(el)}${el.parentElement ? ` inside ${name(el.parentElement)}` : ""} (right edge ${Math.round(el.getBoundingClientRect().right)}px)`);
        out.push(`horizontal overflow: page is ${pageWidth}px wide${list.length ? `, caused by ${list.join("; ")}` : ""}`);
      }

      // Button labels that wrap onto more than one line.
      const buttons = document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"], a');
      for (const el of buttons) {
        if (!visible(el)) continue;
        const text = (el.innerText || el.value || "").trim();
        if (!text || text.length > 40 || text.includes("\n")) continue;
        const s = getComputedStyle(el);
        const buttonLike = el.tagName !== "A" || (s.backgroundColor !== "rgba(0, 0, 0, 0)" || parseFloat(s.borderTopWidth) > 0) && s.display !== "inline";
        if (!buttonLike) continue;
        // Count the rendered lines of text (icons and fixed heights don't matter).
        const range = document.createRange();
        range.selectNodeContents(el);
        const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0).sort((a, b) => a.top - b.top);
        const tolerance = (parseFloat(s.fontSize) || 16) * 0.6;
        let lines = 0;
        let lastTop = -Infinity;
        for (const r of rects) if (r.top - lastTop > tolerance) { lines++; lastTop = r.top; }
        if (lines > 1) out.push(`button label wraps: "${text.slice(0, 40)}" is on ${lines} lines (its text, or text beside an icon or swatch, doesn't fit on one line; give it room or white-space: nowrap)`);
      }

      // Text smaller than 12px (ignores visually hidden helper text).
      let tiny = 0;
      const samples = [];
      for (const el of document.body.querySelectorAll("*")) {
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!own || !visible(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width <= 2 || r.height <= 2) continue;
        if (parseFloat(getComputedStyle(el).fontSize) < 12) {
          tiny++;
          if (samples.length < 3) samples.push(el.textContent.trim().slice(0, 30));
        }
      }
      if (tiny) out.push(`text under 12px: ${tiny} elements (e.g. "${samples.join('", "')}")`);

      // Content that's laid out but still transparent after scrolling through: usually an
      // entrance animation that never fired. Menus, dialogs and aria-hidden parts are skipped.
      // Also catches content fully hidden by a clip-path wipe on it or a nearby ancestor.
      const clippedAway = (el) => {
        for (let e = el, depth = 0; e && depth < 5; e = e.parentElement, depth++) {
          if (/inset\([^)]*100%|circle\(0|polygon\(0px 0px, 0px 0px/.test(getComputedStyle(e).clipPath)) return true;
        }
        return false;
      };
      const stuck = [];
      for (const el of document.body.querySelectorAll("h1, h2, h3, h4, p, li, img, a, button, figure, blockquote")) {
        if (el.closest("nav, header, dialog, [role='menu'], [role='dialog'], [aria-hidden='true'], [inert], details:not([open])")) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        if (!el.checkVisibility({ visibilityProperty: true })) continue; // intentionally hidden
        if (!el.checkVisibility({ opacityProperty: true }) || clippedAway(el)) stuck.push((el.textContent || el.getAttribute("alt") || el.tagName).trim().slice(0, 30));
      }
      if (stuck.length) out.push(`content still invisible after scrolling (an entrance animation that didn't fire?): ${stuck.length} elements (e.g. "${stuck.slice(0, 3).join('", "')}")`);
      return out;
    });
    for (const message of found) add(route, width, message);

    // Stretched images: shown bigger than the file really is, so they look soft or pixelated.
    // With srcset, img.naturalWidth is density-adjusted (and Next.js never enlarges past the
    // original), so reload the chosen file on its own to get its true pixel size. Uses the
    // rendered box (including transforms such as a parallax zoom) and object-fit.
    const stretched = await page.evaluate(async () => {
      const out = [];
      for (const img of document.images) {
        const src = img.currentSrc || img.src;
        if (!img.complete || !img.naturalWidth || !src || /\.svg(\?|$)|image\/svg/i.test(src)) continue;
        const r = img.getBoundingClientRect();
        const s = getComputedStyle(img);
        if (r.width < 200 || s.visibility === "hidden" || s.display === "none") continue; // skip icons, avatars, hidden
        const probe = new Image();
        probe.src = src;
        try { await probe.decode(); } catch { continue; }
        const fit = s.objectFit;
        const sx = r.width / probe.naturalWidth, sy = r.height / probe.naturalHeight;
        const scale = fit === "contain" || fit === "scale-down" ? Math.min(sx, sy) : Math.max(sx, sy);
        if (scale > 1.1) {
          let file = src;
          try { const u = new URL(src); file = u.searchParams.get("url") || u.pathname; } catch {}
          out.push(`stretched image: ${file.slice(0, 80)} shown ${scale.toFixed(2)}x its real size (file ${probe.naturalWidth}px wide, needs about ${Math.ceil(probe.naturalWidth * scale)}px)`);
        }
      }
      return out;
    });
    for (const message of stretched) add(route, width, message);

    if (!reduced && (w === fullWidth || w === Math.min(...widths))) {
      const full = join(outDir, `${slug}-${w}-full.png`);
      await settle(page);
      await page.screenshot({ path: full, fullPage: true });
      screenshots.push(full);
    }
    await context.close();
}

// Check several widths at once: each page waits on timers and animations, so running them
// side by side cuts the total time roughly by the concurrency.
const queue = [...jobs];
await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
  while (queue.length) await checkOne(queue.shift());
}));
await browser.close();

const lines = [...issues].map(([key, ws]) => {
  const [route, message] = key.split(" | ");
  return `- ${route} @${[...ws].sort((a, b) => parseInt(a) - parseInt(b)).join(",")}: ${message}`;
});
writeFileSync(join(outDir, "review.json"), JSON.stringify({ url, routes, widths, problems: lines, screenshots }, null, 2));

console.log(lines.length ? `Review of ${url}: ${lines.length} problem${lines.length === 1 ? "" : "s"}` : `Review of ${url}: no problems found`);
for (const line of lines) console.log(line);
console.log(`Screenshots: ${outDir}`);
