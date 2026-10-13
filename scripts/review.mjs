#!/usr/bin/env node
// Checks a running site in a real browser and prints only the problems, one per line.
//
//   node review.mjs <url> [/route ...] [--widths 390,768,1280,1440,1920] [--parallel 4-8, by machine] [--out .acquired-taste/review]
//                   [--login "goto:/login; fill:Email=test@example.com; fill:Password=${TEST_PASSWORD}; click:Sign in"]
//   Saves top-of-page and full-page screenshots (full page at 1440, or the widest width, and the narrowest).
//   --login signs in once with try.mjs-style steps (separated by ";", or a file with one step
//   per line) and checks every route signed in. ${NAME} reads an environment variable.
//   --dark "click:Dark mode" also checks every route in dark mode (at the narrowest width and
//   1440), switched on the way a visitor does it, with try.mjs-style steps run on each page;
//   --dark system for sites that only follow the device's dark setting.
//   A route like /nope=404 is meant to answer 404 (or any status given): that status isn't a
//   problem, any other is.
//
// Per route and width: broken images, failed requests, console errors, horizontal
// overflow (with the element causing it), wrapped button labels, text under 12px,
// images without alt text, content still hidden by an entrance animation, and text inside
// drawings and maps (SVG) that overlaps, is cut off at the drawing's edge, or is under 12px.
// Saves screenshots and review.json to the out folder.

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { launchBrowser, browserNoise } from "./lib/browser.mjs";
import { fileURLToPath } from "node:url";
import { availableParallelism } from "node:os";
import { unmangle, parseLogin, signIn, newContext, runStep } from "./lib/steps.mjs";
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
const darkArg = flag("dark", null);
// --final is accepted for older instructions; full-page shots are always saved now.
if (args.includes("--final")) args.splice(args.indexOf("--final"), 1);
const [url, ...rawRoutes] = args;
// "/nope=404": a route meant to answer with that status.
const expected = new Map();
const extraRoutes = rawRoutes.map(unmangle).map((r) => {
  const m = String(r).match(/^(.*)=(\d{3})$/);
  if (!m) return r;
  expected.set(m[1], Number(m[2]));
  return m[1];
});
if (!url) {
  console.error('Usage: node review.mjs <url> [/route ...] [/missing=404] [--widths 390,768,1280,1440,1920] [--out dir] [--login "goto:/login; fill:Email=...; fill:Password=${TEST_PASSWORD}; click:Sign in"] [--dark "click:Dark mode" | --dark system]');
  process.exit(1);
}
const routes = ["/", ...extraRoutes.filter((r) => r !== "/")];
const darkSteps = darkArg && darkArg !== "system" ? parseLogin(darkArg) : null;
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
// With --dark, every route again in dark mode at the narrowest width and the full-page width.
const darkWidths = [...new Set([Math.min(...widths), fullWidth])];
const jobs = [
  ...routes.flatMap((route) => widths.map((width) => ({ route, width, reduced: false }))),
  ...routes.map((route) => ({ route, width: Math.max(...widths), reduced: true })),
  ...(darkArg ? routes.flatMap((route) => darkWidths.map((width) => ({ route, width, dark: true }))) : []),
];

async function checkOne({ route, width: w, reduced, dark }) {
    const width = reduced ? `${w} reduced-motion` : dark ? `${w} dark` : w;
    const context = await newContext(browser, login, { viewport: { width: w, height: HEIGHTS[w] ?? Math.round(w * 0.625) }, reducedMotion: reduced ? "reduce" : "no-preference",
      colorScheme: dark && !darkSteps ? "dark" : "light" });
    const page = await context.newPage();
    const target = new URL(route, url).toString();
    const wantStatus = expected.get(route);
    // A route meant to 404: the browser's own note about the page's status isn't a problem.
    const expectedNote = (m) => wantStatus && m.location?.()?.url === target && /status of \d{3}/.test(m.text());
    page.on("console", (m) => m.type() === "error" && !browserNoise(m) && !expectedNote(m) && add(route, width, `console error: ${short(m.text())}`));
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
      if (wantStatus && type === "document" && r.url() === target) return; // compared after loading
      if (r.status() >= 400 && ["document", "image", "font", "stylesheet", "script", "media"].includes(type)) {
        add(route, width, `${r.status()} for ${type}: ${short(r.url(), 120)}`);
      }
    });

    let response;
    try {
      response = await page.goto(target, { waitUntil: "load", timeout: 30000 });
    } catch (e) {
      add(route, width, `page didn't load: ${short(e.message)}`);
      await context.close();
      return;
    }
    if (wantStatus && response && response.status() !== wantStatus) add(route, width, `meant to answer ${wantStatus}, but answered ${response.status()}`);
    await page.waitForTimeout(1500);
    // Signed in, but the app sent this page back to the login screen (checked after the wait,
    // since client-side apps redirect a moment after load): the screenshots would show the
    // login form, not the screen being reviewed.
    if (login && new URL(route, url).pathname !== login.loginPath && new URL(page.url()).pathname === login.loginPath) {
      add(route, width, `sent back to the login page (${login.loginPath}): the signed-in session didn't carry over, so this route wasn't checked`);
      await context.close();
      return;
    }
    // Dark mode switched on the way a visitor does it, then confirmed by the page's background.
    if (dark && darkSteps) {
      try {
        for (const step of darkSteps) await runStep(page, url, step, outDir);
      } catch (e) {
        add(route, width, `couldn't switch to dark mode, so it wasn't checked here: ${short(e.message)}`);
        await context.close();
        return;
      }
    }
    if (dark) {
      // Five spots across the first screen, each read from the first solid background behind
      // it; mostly light means dark mode didn't switch on.
      const light = await page.evaluate(() => {
        const spots = [[0.5, 0.5], [0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]];
        let lightSpots = 0, read = 0;
        for (const [x, y] of spots) {
          for (let e = document.elementFromPoint(innerWidth * x, innerHeight * y); e; e = e.parentElement) {
            const m = getComputedStyle(e).backgroundColor.match(/[\d.]+/g)?.map(Number);
            if (m && (m[3] ?? 1) > 0.5) { read++; if ((0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255 > 0.5) lightSpots++; break; }
          }
        }
        return read ? lightSpots > read / 2 : null;
      }).catch(() => null);
      if (light) add(route, width, `dark mode didn't switch on (the page background is still light); check the --dark steps`);
    }
    const slug = slugOf(route);
    const variant = reduced ? "-reduced" : dark ? "-dark" : "";
    const fold = join(outDir, `${slug}-${w}${variant}-top.png`);
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
        // Count the rendered lines of the words only: an icon stacked above or beside the label
        // is a design choice, not a wrap (icons and fixed heights don't matter).
        const rects = [];
        const words = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = words.nextNode(); n; n = words.nextNode()) {
          if (!n.textContent.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(n);
          rects.push(...[...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0));
        }
        // Icons and swatches still count when they sit in a row with the words (one pushed onto
        // its own line is a real wrap), but not when the button stacks them on purpose (a
        // column flex or a grid).
        for (const icon of el.querySelectorAll("svg, img, i, span:empty")) {
          let stacked = false;
          for (let p = icon.parentElement; p && el.contains(p); p = p.parentElement) {
            const ps = getComputedStyle(p);
            if (/grid/.test(ps.display) || (/flex/.test(ps.display) && ps.flexDirection.startsWith("column"))) { stacked = true; break; }
          }
          const r = icon.getBoundingClientRect();
          if (!stacked && r.width > 0 && r.height > 0) rects.push(r);
        }
        rects.sort((a, b) => a.top - b.top);
        const tolerance = (parseFloat(s.fontSize) || 16) * 0.6;
        let lines = 0;
        let lastTop = -Infinity;
        for (const r of rects) if (r.top - lastTop > tolerance) { lines++; lastTop = r.top; }
        if (lines > 1) out.push(`button label wraps: "${text.slice(0, 40)}" is on ${lines} lines (its words don't fit on one line; give it room or white-space: nowrap)`);
      }

      // Text smaller than 12px (ignores visually hidden helper text).
      let tiny = 0;
      const samples = [];
      for (const el of document.body.querySelectorAll("*")) {
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!own || !visible(el) || el.closest("svg")) continue; // drawings: checked below at their drawn size
        const r = el.getBoundingClientRect();
        if (r.width <= 2 || r.height <= 2) continue;
        if (parseFloat(getComputedStyle(el).fontSize) < 12) {
          tiny++;
          if (samples.length < 3) samples.push(el.textContent.trim().slice(0, 30));
        }
      }
      if (tiny) out.push(`text under 12px: ${tiny} elements (e.g. "${samples.join('", "')}")`);

      // Text inside drawings and maps (SVG), at the size it's actually drawn: labels on top of
      // each other, labels cut off at the drawing's edge, and captions under 12px. (Labels
      // sitting on shapes are left to the eye check.)
      const overlaps = [], cut = [], small = [];
      for (const svg of document.querySelectorAll("svg")) {
        if (!visible(svg) || svg.parentElement?.closest("svg")) continue;
        const box = svg.getBoundingClientRect();
        const clips = getComputedStyle(svg).overflow !== "visible";
        const labels = [...svg.querySelectorAll("text")].filter((t) => t.textContent.trim() && t.checkVisibility({ opacityProperty: true, visibilityProperty: true }))
          .map((t) => ({ t, r: t.getBoundingClientRect(), words: t.textContent.trim().slice(0, 24) }))
          .filter(({ r }) => r.width > 0 && r.height > 0);
        for (const { t, r, words } of labels) {
          const ctm = t.getScreenCTM();
          const drawn = parseFloat(getComputedStyle(t).fontSize) * (ctm ? Math.hypot(ctm.a, ctm.b) : 1);
          if (drawn < 11.5) small.push(`"${words}" ${drawn.toFixed(1)}px`);
          if (clips && (r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1)) cut.push(`"${words}"`);
        }
        for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
          const a = labels[i].r, b = labels[j].r;
          const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (w > 0 && h > 0 && w * h > 0.2 * Math.min(a.width * a.height, b.width * b.height)) overlaps.push(`"${labels[i].words}" and "${labels[j].words}"`);
        }
      }
      if (overlaps.length) out.push(`labels overlapping inside a drawing or map: ${overlaps.length} (e.g. ${overlaps.slice(0, 2).join("; ")})`);
      if (cut.length) out.push(`labels cut off at the edge of a drawing or map: ${cut.length} (e.g. ${cut.slice(0, 3).join(", ")})`);
      if (small.length) out.push(`text inside a drawing or map drawn under 12px: ${small.length} (e.g. ${small.slice(0, 3).join(", ")})`);
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

    // Content still hidden after scrolling through: usually an entrance animation that never
    // fired, or one that hides content again once it's scrolled past. Checked right before the
    // full-page screenshot, so what it reports is what the screenshot shows. Catches content
    // (nearly) see-through on itself or a parent, wiped away by a clip-path, or text still
    // slid under a reveal mask (a parent that hides overflow, with the words below or above
    // it). Menus, dialogs and aria-hidden parts are skipped, and so are sideways sliders.
    const takeFull = !reduced && (w === fullWidth || w === Math.min(...widths));
    if (takeFull) await settle(page);
    const stuck = await page.evaluate(() => {
      const clippedAway = (el) => {
        for (let e = el, depth = 0; e && depth < 5; e = e.parentElement, depth++) {
          if (/inset\([^)]*100%|circle\(0|polygon\(0px 0px, 0px 0px/.test(getComputedStyle(e).clipPath)) return true;
        }
        return false;
      };
      const faint = (el) => {
        let o = 1;
        for (let e = el; e && e !== document.documentElement; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity);
        return o < 0.1;
      };
      // A reveal mask: words slid (transformed) out of a parent that hides overflow and is
      // still full height. Under 30% of the words' height showing counts as hidden. Not a
      // mask: a folded-up accordion (the parent has no height), clamped card text (nothing
      // slid), or a sideways slider (the words are off to the side of the parent).
      const masked = (el) => {
        let total = 0, shown = 0, mask = false;
        const words = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = words.nextNode(); n; n = words.nextNode()) {
          if (!n.textContent.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(n);
          const r = range.getBoundingClientRect();
          if (r.height < 2) continue;
          let top = r.top, bottom = r.bottom, moved = false;
          for (let e = n.parentElement; e && e !== document.body; e = e.parentElement) {
            const s = getComputedStyle(e);
            if (/hidden|clip/.test(s.overflowY) || /hidden|clip/.test(s.overflow)) {
              const b = e.getBoundingClientRect();
              if (r.right <= b.left || r.left >= b.right) return false;
              if (moved && b.height >= r.height * 0.5) mask = true;
              top = Math.max(top, b.top); bottom = Math.min(bottom, b.bottom);
            }
            if (s.transform !== "none") moved = true;
          }
          total += r.height;
          shown += Math.max(0, bottom - top);
        }
        return mask && total > 0 && shown / total < 0.3;
      };
      const out = [];
      for (const el of document.body.querySelectorAll("h1, h2, h3, h4, p, li, img, a, button, figure, blockquote")) {
        if (el.closest("nav, header, dialog, [role='menu'], [role='dialog'], [aria-hidden='true'], [inert], details:not([open])")) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        if (!el.checkVisibility({ visibilityProperty: true })) continue; // intentionally hidden
        const text = /^H[1-4]$|^P$/.test(el.tagName) && el.textContent.trim();
        if (!el.checkVisibility({ opacityProperty: true }) || faint(el) || clippedAway(el) || (text && masked(el))) {
          out.push((el.textContent || el.getAttribute("alt") || el.tagName).trim().slice(0, 30));
        }
      }
      return out;
    }).catch(() => []);
    if (stuck.length) add(route, width, `content still invisible after scrolling (an entrance animation that didn't fire, or one that hides it again once scrolled past?): ${stuck.length} elements (e.g. "${stuck.slice(0, 3).join('", "')}")`);

    if (takeFull) {
      const full = join(outDir, `${slug}-${w}${variant}-full.png`);
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
