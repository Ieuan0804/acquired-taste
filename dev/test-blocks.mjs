#!/usr/bin/env node
// Tests every motion block for real: builds them into a fresh project from the starter,
// serves the production build, and checks behaviour in a browser (desktop, phone and
// reduced motion). Run before releasing changes to blocks/.
//
//   node dev/test-blocks.mjs [--keep]

import { mkdtempSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { spawnSync, execFileSync } from "node:child_process";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const PLUGIN = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const keep = process.argv.includes("--keep");
const dir = mkdtempSync(join(tmpdir(), "acquired-taste-blocks-"));
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { cwd: dir, encoding: "utf8", shell: process.platform === "win32", windowsHide: true, ...opts });
  if (r.status !== 0) { console.error(`${cmd} ${args.join(" ")} failed:\n${(r.stdout ?? "") + (r.stderr ?? "")}`.slice(-3000)); process.exit(1); }
  return r.stdout;
};

console.log(`Building the blocks test site in ${dir}`);
run(process.execPath, [join(PLUGIN, "scripts", "new-project.mjs"), ".", "--name", "blocks-test"], { shell: false });
run("npm", ["install", "lenis", "--no-audit", "--no-fund", "--loglevel=error"]);
run(process.execPath, [join(PLUGIN, "scripts", "add-blocks.mjs"), "all"], { shell: false });
appendFileSync(join(dir, "app", "globals.css"), '\n@import "./depth.css";\n');

writeFileSync(join(dir, "app", "page.tsx"), `"use client";
import { useEffect, useRef } from "react";
import { reveal } from "@/lib/motion/reveal";
import { counter } from "@/lib/motion/counter";
import { magnetic, tilt, cursor } from "@/lib/motion/pointer";
import { parallax, scene, progress } from "@/lib/motion/scroll";
import { marquee } from "@/lib/motion/marquee";
import { smoothScroll } from "@/lib/motion/smooth";

export default function Demo() {
  const r = {
    headline: useRef<HTMLHeadingElement>(null), list: useRef<HTMLDivElement>(null), stat: useRef<HTMLSpanElement>(null), stat2: useRef<HTMLSpanElement>(null),
    clip: useRef<HTMLDivElement>(null), para: useRef<HTMLElement>(null), scene: useRef<HTMLElement>(null),
    box: useRef<HTMLDivElement>(null), track: useRef<HTMLDivElement>(null), mag: useRef<HTMLButtonElement>(null),
    tilt: useRef<HTMLDivElement>(null), bar: useRef<HTMLDivElement>(null),
  };
  useEffect(() => {
    const c = counter(r.stat.current!, { to: 3576.22, format: { style: "currency", currency: "GBP" } });
    const c2 = counter(r.stat2.current!, { to: 3100, duration: 2 });
    const cleanups = [
      smoothScroll(),
      reveal(r.headline.current!, { mode: "words" }),
      reveal(r.list.current!, { mode: "fade" }),
      reveal(r.clip.current!, { mode: "clip" }),
      parallax(r.para.current!),
      scene(r.scene.current!, (tl) => { tl.fromTo(r.box.current!, { xPercent: -100, rotate: -8 }, { xPercent: 100, rotate: 8 }); }),
      progress(r.bar.current!),
      marquee(r.track.current!),
      magnetic(r.mag.current!),
      tilt(r.tilt.current!, { glare: true }),
      cursor({ selector: "button, [data-cursor]" }),
    ];
    return () => { c.destroy(); c2.destroy(); cleanups.forEach((f) => f()); };
  }, []);
  return (
    <main style={{ fontFamily: "system-ui", color: "#111", background: "#f4f1ea" }}>
      <div id="bar" ref={r.bar} style={{ position: "fixed", top: 0, left: 0, right: 0, height: 4, background: "#e8622c", zIndex: 10 }} />
      <section style={{ minHeight: "100vh", padding: "15vh 6vw" }}>
        <h1 id="headline" ref={r.headline} style={{ fontSize: "clamp(48px, 9vw, 140px)", lineHeight: 0.95, margin: 0 }}>Kit for the long way home, packed in Sheffield.</h1>
        <button id="mag" ref={r.mag} data-cursor="Go" style={{ marginTop: 40, padding: "16px 28px", fontSize: 18 }}>Shop tyres</button>
      </section>
      <section id="list" ref={r.list} style={{ padding: "10vh 6vw", display: "grid", gap: 24 }}>
        {["Tyres", "Wheelsets", "Bags", "Clothing"].map((t) => <p key={t} className="reveal-item" style={{ fontSize: 32, margin: 0 }}>{t}</p>)}
      </section>
      <section style={{ padding: "10vh 6vw" }}><p style={{ fontSize: 64, margin: 0 }}>VAT so far: <span id="stat" ref={r.stat}>£3,576.22</span></p><p style={{ fontSize: 40, margin: 0 }}>Users: <span id="stat2" ref={r.stat2}>3,100</span></p></section>
      <section style={{ padding: "10vh 6vw" }}><figure style={{ margin: 0 }}><div id="clip" ref={r.clip} className="grain" style={{ height: 360, background: "linear-gradient(135deg,#1f3a2e,#e8622c)", color: "#fff", padding: 24 }}><p style={{ margin: 0 }}>Clip reveal</p></div></figure></section>
      <section id="para" ref={r.para} style={{ position: "relative", height: "90vh", overflow: "hidden", background: "#1f3a2e" }}>
        <div data-depth="0.6" style={{ position: "absolute", left: "10%", top: "30%", width: 200, height: 200, background: "#e8622c" }} />
        <div data-depth="-0.3" className="glass" style={{ position: "absolute", left: "45%", top: "40%", width: 280, height: 160, color: "#fff", padding: 16 }}>Parallax glass</div>
      </section>
      <section id="scene" ref={r.scene} style={{ height: "100vh", display: "grid", placeItems: "center", overflow: "hidden", background: "#111" }}>
        <div id="box" ref={r.box} style={{ width: 220, height: 220, background: "#f4f1ea" }}>Scene</div>
      </section>
      <section style={{ padding: "8vh 0", background: "#e8622c" }}>
        <div id="track" ref={r.track}>{["Free UK delivery over £60", "60-day returns", "Packed in Sheffield", "Ships to the EU"].map((t) => <span key={t} style={{ fontSize: 40, whiteSpace: "nowrap" }}>{t}</span>)}</div>
      </section>
      <section style={{ padding: "15vh 6vw" }}>
        <div id="tilt" ref={r.tilt} className="lift" style={{ width: 320, height: 200, background: "#fff", boxShadow: "var(--depth-3)", padding: 24 }}>Tilt card</div>
      </section>
    </main>
  );
}
`);

console.log("Building (type-checks every block)…");
run("npm", ["run", "build"]);
const url = run(process.execPath, [join(PLUGIN, "scripts", "serve.mjs"), "start", "--", "npm", "run", "start"], { shell: false }).trim().split("\n").pop();
console.log(`Serving at ${url}`);

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`); };

const browser = await chromium.launch();
try {
  // Desktop, full motion
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(800);
  await page.mouse.move(700, 450);

  const frames = await page.evaluate(async () => {
    const deltas = [];
    let last = performance.now();
    let running = true;
    const tick = (t) => { deltas.push(t - last); last = t; if (running) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const max = document.documentElement.scrollHeight;
    for (let y = 0; y <= max; y += 120) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
    await new Promise((r) => setTimeout(r, 1500));
    running = false;
    deltas.sort((a, b) => a - b);
    return { p95: Math.round(deltas[Math.floor(deltas.length * 0.95)]), count: deltas.length };
  });
  check("scroll stays smooth (p95 frame time under 50ms)", frames.p95 < 50, `p95 ${frames.p95}ms over ${frames.count} frames`);

  const hidden = await page.evaluate(() => [...document.querySelectorAll("main h1, main p, main span, main div")]
    .filter((el) => el.textContent.trim() && !el.closest("[aria-hidden='true']") && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true }))
    .map((el) => el.id || el.textContent.trim().slice(0, 30)).slice(0, 5));
  check("reveal: nothing left invisible after scrolling", hidden.length === 0, hidden.join(", "));
  const words = await page.evaluate(() => [...document.querySelectorAll("[data-reveal-word]")].map((w) => getComputedStyle(w).transform));
  check("reveal words: split and settled", words.length > 3 && words.every((t) => t === "none" || /matrix\(1, 0, 0, 1, 0, 0\)/.test(t)), `${words.length} words`);
  check("reveal words: headline keeps its accessible text", (await page.getAttribute("#headline", "aria-label"))?.startsWith("Kit for the long way home") === true);
  check("counter: ends on the exact formatted value", (await page.textContent("#stat")) === "£3,576.22", await page.textContent("#stat"));
  check("scene: pins on desktop", await page.evaluate(() => !!document.querySelector(".pin-spacer")));
  check("progress bar: grows with scroll", await page.evaluate(() => getComputedStyle(document.getElementById("bar")).transform !== "none"));

  const m1 = await page.evaluate(() => getComputedStyle(document.getElementById("track")).transform);
  await page.waitForTimeout(600);
  const m2 = await page.evaluate(() => getComputedStyle(document.getElementById("track")).transform);
  check("marquee: moves", m1 !== m2);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  const mag = await page.locator("#mag").boundingBox();
  await page.mouse.move(mag.x + mag.width / 2 + 30, mag.y + mag.height / 2 + 10, { steps: 5 });
  await page.waitForTimeout(700);
  check("magnetic: leans toward the cursor", await page.evaluate(() => getComputedStyle(document.getElementById("mag")).transform !== "none"));
  check("cursor: follower appears", await page.evaluate(() => [...document.body.children].some((el) => el.getAttribute("aria-hidden") === "true" && getComputedStyle(el).position === "fixed" && getComputedStyle(el).opacity === "1")));

  await page.locator("#tilt").scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const t = await page.locator("#tilt").boundingBox();
  await page.mouse.move(t.x + t.width * 0.85, t.y + t.height * 0.2, { steps: 5 });
  await page.waitForTimeout(800);
  check("tilt: rotates toward the cursor", await page.evaluate(() => /matrix3d/.test(getComputedStyle(document.getElementById("tilt")).transform)));
  check("no console or page errors (desktop)", errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.close();

  // Fast scroll-through (a quick flick, or a menu jump): reveals must still fire.
  const fp = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await fp.goto(url, { waitUntil: "load" });
  await fp.waitForTimeout(800);
  const samples = [];
  await fp.evaluate(async () => { const step = innerHeight * 0.6; for (let y = 0; y < document.documentElement.scrollHeight; y += step) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 250)); } });
  await fp.waitForTimeout(1500);
  const clip = await fp.evaluate(() => getComputedStyle(document.getElementById("clip")).clipPath);
  check("fast scroll: clip reveal still fires", !/100%/.test(clip), clip);
  await fp.close();

  // Jump straight past everything (a "back to bottom" link, or a flick faster than a frame):
  // content that was skipped must still appear, not stay invisible above the screen.
  const jp = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await jp.goto(url, { waitUntil: "load" });
  await jp.waitForTimeout(800);
  await jp.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await jp.waitForTimeout(1500);
  const skipped = await jp.evaluate(() => [...document.querySelectorAll(".reveal-item, #clip")]
    .filter((el) => getComputedStyle(el).opacity === "0" || /100%/.test(getComputedStyle(el).clipPath))
    .map((el) => el.id || el.textContent.trim().slice(0, 20)));
  check("jump past: skipped reveals still appear", skipped.length === 0, skipped.join(", "));
  await jp.close();

  // Sample a whole-number counter while it's counting (fresh page, scroll straight to it).
  const cp = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await cp.goto(url, { waitUntil: "load" });
  await cp.waitForTimeout(500);
  await cp.evaluate(() => document.getElementById("stat2").scrollIntoView({ block: "center" }));
  for (let i = 0; i < 12; i++) { samples.push(await cp.textContent("#stat2")); await cp.waitForTimeout(120); }
  const moving = new Set(samples).size > 2;
  check("counter: whole-number targets never show decimals mid-count", moving && samples.every((t) => !t.includes(".")), [...new Set(samples)].slice(0, 5).join(" → "));
  await cp.close();

  // Reduced motion: everything visible immediately, nothing pinned or moving.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const rp = await ctx.newPage();
  const rErrors = [];
  rp.on("pageerror", (e) => rErrors.push(e.message));
  await rp.goto(url, { waitUntil: "load" });
  await rp.waitForTimeout(600);
  const rHidden = await rp.evaluate(() => [...document.querySelectorAll("main p, main h1")]
    .filter((el) => !el.checkVisibility({ opacityProperty: true })).length);
  check("reduced motion: all content visible without scrolling", rHidden === 0, `${rHidden} hidden`);
  check("reduced motion: counter shows the final value", (await rp.textContent("#stat")) === "£3,576.22");
  check("reduced motion: no pinning", await rp.evaluate(() => !document.querySelector(".pin-spacer")));
  check("reduced motion: no errors", rErrors.length === 0, rErrors.slice(0, 2).join(" | "));
  await ctx.close();

  // Phone: no pinning, no sideways scroll.
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const mp = await mctx.newPage();
  await mp.goto(url, { waitUntil: "load" });
  await mp.waitForTimeout(800);
  check("phone: no pinning", await mp.evaluate(() => !document.querySelector(".pin-spacer")));
  check("phone: no horizontal overflow", await mp.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  await mctx.close();
} finally {
  await browser.close();
  execFileSync(process.execPath, [join(PLUGIN, "scripts", "serve.mjs"), "stop", "--dir", dir], { stdio: "ignore", windowsHide: true });
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed.`);
if (!keep && !failed) {
  // Windows can hold files briefly after the server stops; retry, and never fail the run over it.
  try { rmSync(dir, { recursive: true, force: true, maxRetries: 6, retryDelay: 500 }); }
  catch { console.log(`(Couldn't delete ${dir} yet. It's in the temp folder and safe to remove later.)`); }
} else console.log(`Test site kept at ${dir}`);
process.exit(failed ? 1 : 0);
