#!/usr/bin/env node
// Tests the review checks added in 1.1 on a small practice site with each problem built in,
// and look-alikes that must NOT be reported:
//   dark mode switched on with the site's own button (and a clear message when it can't be);
//   headings hidden by an entrance animation (slid under a reveal mask, nearly see-through),
//   but not a folded accordion, clamped card text or a sideways slider;
//   labels in a drawing that overlap, are cut off at its edge, or are drawn under 12px;
//   a real wrapped button label, but not an icon stacked above its label;
//   a route meant to 404; and try.mjs ticking a radio hidden behind a styled card.
//
//   node dev/test-review.mjs

import http from "node:http";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const PLUGIN = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const work = mkdtempSync(join(tmpdir(), "acquired-taste-review-"));

const style = `
  body { margin: 0; font: 16px/1.5 system-ui, sans-serif; background: #fbf8f2; color: #1d1a16; }
  html.dark body { background: #14120f; color: #f1ece4; }
  main { max-width: 900px; margin: 0 auto; padding: 24px; }
  section { min-height: 380px; padding: 24px 0; }
  button { font: inherit; padding: 10px 16px; background: #1d1a16; color: #fff; border: 0; border-radius: 8px; }
  html.dark button { background: #f1ece4; color: #14120f; }
  .mask { display: block; overflow: hidden; }
  .mask > span { display: block; transform: translateY(110%); }
  .faint { opacity: 0.05; }
  .fold { max-height: 0; overflow: hidden; }
  .clamp { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; width: 240px; }
  .slider { overflow: hidden; width: 300px; } .slides { display: flex; } .slides > div { flex: 0 0 300px; }
  .stack { display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .narrow { width: 90px; }
  svg { max-width: 100%; height: auto; }
  .card { display: inline-block; position: relative; padding: 16px 24px; border: 2px solid #1d1a16; border-radius: 10px; margin-right: 8px; cursor: pointer; }
  .card input { position: absolute; opacity: 0; inset: 0; margin: 0; pointer-events: none; }
  .card:has(input:checked) { background: #1d1a16; color: #fff; }`;

const page = (body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Practice</title><link rel="icon" href="data:,"><style>${style}</style></head><body><main>
<button type="button" onclick="document.documentElement.classList.toggle('dark')">Dark mode</button>
<button type="button">Fake dark</button>
${body}</main></body></html>`;

const problems = page(`
<h1>Practice bakery</h1>
<section><h2 class="mask"><span>Masked heading</span></h2><p>Words under the masked heading.</p></section>
<section><h2 class="faint">Faint heading</h2><p>Words under the faint heading.</p></section>
<section>
  <svg viewBox="0 0 200 100" width="400" height="200" role="img" aria-label="Map">
    <rect width="200" height="100" fill="#dfe8d8"/>
    <text x="60" y="50" font-size="9">Old Bridge</text>
    <text x="64" y="52" font-size="9">Bakery</text>
    <text x="170" y="80" font-size="9">River Taf</text>
    <text x="10" y="95" font-size="4">tiny caption</text>
  </svg>
</section>
<section>
  <button class="stack" type="button"><svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="currentColor"/></svg><span>Order</span></button>
  <button class="narrow" type="button">Order your celebration cake</button>
</section>
<section>
  <div class="fold"><p>Folded answer</p></div>
  <p class="clamp">Clamped card text that runs on for several lines, far longer than the two lines this card shows, so most of it is cut on purpose.</p>
  <div class="slider"><div class="slides"><div><h3>Slide one</h3></div><div style="transform:translateX(0)"><h3>Slide two</h3></div></div></div>
</section>
<section>
  <form><label class="card"><input type="radio" name="size" value="s"> Small</label><label class="card"><input type="radio" name="size" value="l"> Large</label></form>
</section>`);

const clean = page(`<h1>A clean page</h1><section><h2>Plain heading</h2><p>Nothing wrong here.</p>
<svg viewBox="0 0 200 100" width="400" height="200" role="img" aria-label="Map"><rect width="200" height="100" fill="#dfe8d8"/><text x="20" y="40" font-size="9">Old Bridge</text><text x="20" y="80" font-size="9">Bakery</text></svg></section>`);

const server = http.createServer((req, res) => {
  const path = req.url.split("?")[0];
  const send = (code, html) => { res.writeHead(code, { "content-type": "text/html; charset=utf-8" }); res.end(html); };
  if (path === "/") send(200, problems);
  else if (path === "/good") send(200, clean);
  else if (path === "/oops") send(200, page("<h1>Oops, this exists</h1>"));
  else send(404, page("<h1>Page not found</h1><p>Try the home page.</p>"));
}).listen(0);
const url = `http://localhost:${server.address().port}`;

let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     ${detail}`}`); if (!ok) failed++; };
const run = (script, ...args) => new Promise((done) => {
  // Run off the event loop so this process keeps serving the practice site.
  import("node:child_process").then(({ spawn }) => {
    const p = spawn(process.execPath, [join(PLUGIN, "scripts", script), ...args], { cwd: work, windowsHide: true });
    let out = "";
    p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => done({ code, out }));
  });
});

const outDir = join(work, "review");
const t0 = Date.now();
const r = await run("review.mjs", url, "/good", "/nope=404", "/oops=404", "--widths", "390,1440", "--out", outDir, "--dark", "click:Dark mode");
console.log(`(review took ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
const lines = JSON.parse(readFileSync(join(outDir, "review.json"), "utf8")).problems;
const on = (route) => lines.filter((l) => l.startsWith(`- ${route} @`));
const has = (route, re) => on(route).some((l) => re.test(l));

check("reveal mask: the slid-away heading is reported", has("/", /invisible.*Masked heading/));
check("nearly see-through heading is reported", has("/", /invisible.*Faint heading/));
check("not reported: folded accordion, clamped text, sideways slider",
  !has("/", /Folded answer|Clamped card|Slide two/), on("/").join("\n     "));
check("drawing: overlapping labels reported", has("/", /labels overlapping.*Old Bridge.*Bakery/));
check("drawing: label cut off at the edge reported", has("/", /cut off.*River Taf/));
check("drawing: caption drawn under 12px reported (at its drawn size)", has("/", /drawn under 12px.*tiny caption" 8\.0px/));
check("real wrapped button label reported", has("/", /label wraps: "Order your celebration cake"/));
check("icon stacked above its label not reported", !has("/", /label wraps: "Order" /), on("/").join("\n     "));
check("clean page: no problems in light or dark", on("/good").length === 0, on("/good").join("\n     "));
check("dark mode: switched on with the site's button, screenshots saved",
  existsSync(join(outDir, "home-390-dark-top.png")) && existsSync(join(outDir, "home-1440-dark-full.png")) && !lines.some((l) => /didn't switch|couldn't switch/.test(l)),
  lines.filter((l) => /dark/.test(l)).join("\n     "));
check("route meant to 404: no problem", on("/nope").length === 0, on("/nope").join("\n     "));
check("route meant to 404 that answers 200: reported", has("/oops", /meant to answer 404, but answered 200/));

let d = await run("review.mjs", `${url}/good`, "--widths", "1440", "--out", join(work, "dark2"), "--dark", "click:Fake dark");
check("dark switch that does nothing: says dark mode didn't switch on", /dark mode didn't switch on/.test(d.out), d.out);
d = await run("review.mjs", `${url}/good`, "--widths", "1440", "--out", join(work, "dark3"), "--dark", "click:Night mode");
check("dark switch that isn't there: says it couldn't switch", /couldn't switch to dark mode/.test(d.out), d.out);

const t = await run("try.mjs", url, "goto:/", "check:Large", "expect-js:document.querySelector('input[value=l]').checked");
check("try.mjs ticks a radio hidden behind a styled card", t.code === 0 && /clicking its label/.test(t.out), t.out);

server.close();
rmSync(work, { recursive: true, force: true });
console.log(failed ? `\n${failed} failed` : "\nAll review checks pass");
process.exit(failed ? 1 : 0);
