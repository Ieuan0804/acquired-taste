#!/usr/bin/env node
// Finds, compares and installs fonts that suit a brief, from free-for-commercial libraries only:
// Google Fonts (open licences; personality and quality scores from Google's own tag data) and
// Fontshare (Indian Type Foundry's free licence). Plain Opus reaches for the same few fonts
// (Archivo on 5 of 7 test sites), so search per brief instead.
//
//   node fonts.mjs search --tags playful,rounded [--category display|sans|serif|mono|handwriting]
//                        [--not "Archivo,Inter"] [--fresh] [--min-weights 2] [--limit 25]
//       Ranks fonts by how strongly they carry the tags (Google's 0-100 scores, e.g. playful,
//       calm, business, rugged, futuristic, vintage, rounded, geometric, humanist, techno).
//       --fresh skips the 60 most popular Google fonts (the ones every site already uses).
//   node fonts.mjs specimen --headline "..." [--body "..."] --pair "Display / Body" [--pair ...] [--ui [--rows "Name;Detail;Status|..."]]
//       --ui (apps and dashboards): shows each pairing as a real interface: title, big numbers, buttons, a table with status pills.
//                          [--out .acquired-taste/fonts.png]
//       Sets the real headline and copy in each pairing, side by side, with a £ € é 0-9 line to
//       catch missing characters. Look at the sheet; show it at the checkpoint.
//   node fonts.mjs install "Family" [--weights 400,700] [--dir public/fonts]
//       Google fonts: prints the next/font/google import (self-hosted at build, nothing to fetch).
//       Fontshare fonts: downloads the woff2 files and prints the next/font/local import.
//
// The catalogue is cached for a week in ~/.acquired-taste/cache/fonts.json.

import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { launchBrowser } from "./lib/browser.mjs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const PLUGIN = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(homedir(), ".acquired-taste", "cache", "fonts.json");
const TAGS_URL = "https://cdn.jsdelivr.net/gh/google/fonts@main/tags/all/families.csv";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1]; };
const all = (n) => args.flatMap((a, i) => (a === `--${n}` ? [args[i + 1]] : []));

// Retries: font services occasionally reset a connection, and one blip shouldn't stop a build.
async function getJson(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return await r.text();
    } catch (e) {
      if (i >= tries) throw new Error(`${e.cause?.code ?? e.message} (${url})`);
      await new Promise((res) => setTimeout(res, 1000 * i));
    }
  }
}

async function buildCatalogue() {
  const gfText = await getJson("https://fonts.google.com/metadata/fonts");
  const gf = JSON.parse(gfText.slice(gfText.indexOf("{"))).familyMetadataList;
  // families.csv: Family,axes,/Group/Tag,score. Keep each family's highest score per tag.
  const tags = {};
  for (const line of (await getJson(TAGS_URL)).split(/\r?\n/)) {
    const m = line.match(/^(.*?),(?:"[^"]*"|[^,]*),\/([^,]+),(\d+(?:\.\d+)?)$/);
    if (!m) continue;
    const [, family, tag, score] = m;
    const key = tag.split("/").pop().toLowerCase();
    (tags[family] ??= {})[key] = Math.max(tags[family][key] ?? 0, Number(score));
  }
  // Latin-first families only: skips script editions of the same design (IBM Plex Sans JP, Arabic…).
  const fonts = gf.filter((f) => f.isOpenSource !== false && !f.isNoto && (f.subsets ?? []).includes("latin") && (!f.primaryScript || f.primaryScript === "Latn")).map((f, i) => ({
    family: f.family, source: "google", category: f.category, stroke: f.stroke ?? "",
    weights: [...new Set(Object.keys(f.fonts ?? {}).map((k) => parseInt(k, 10)).filter(Boolean))].sort((a, b) => a - b),
    variable: (f.axes ?? []).length > 0, axes: (f.axes ?? []).map((a) => a.tag), popularity: f.popularity ?? i, tags: tags[f.family] ?? {},
  }));
  // Fontshare: free for commercial use under the ITF Free Font License.
  for (let page = 1; page <= 5; page++) {
    const r = JSON.parse(await getJson(`https://api.fontshare.com/v2/fonts?limit=100&page=${page}`));
    for (const f of r.fonts ?? []) {
      if (f.license_type !== "itf_ffl") continue;
      fonts.push({
        family: f.name, slug: f.slug, source: "fontshare", category: f.category ?? "", stroke: "",
        weights: [...new Set((f.styles ?? []).filter((s) => !s.is_italic).map((s) => s.weight?.weight).filter(Boolean))].sort((a, b) => a - b),
        variable: (f.styles ?? []).some((s) => s.is_variable), axes: [], popularity: null,
        tags: Object.fromEntries((f.font_tags ?? []).map((t) => [String(t.name ?? t).toLowerCase(), 60])),
      });
    }
    if (!r.has_more) break;
  }
  mkdirSync(dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, JSON.stringify({ at: Date.now(), fonts }));
  return fonts;
}

async function catalogue() {
  if (existsSync(CACHE) && Date.now() - statSync(CACHE).mtimeMs < 7 * 864e5) return JSON.parse(readFileSync(CACHE, "utf8")).fonts;
  return buildCatalogue();
}

const CATEGORY = { display: /display/i, sans: /sans/i, serif: /^serif|slab/i, mono: /mono/i, handwriting: /handwrit|script/i };

async function search() {
  const want = (opt("tags", "") || "").toLowerCase().split(",").map((t) => t.trim()).filter(Boolean);
  const category = opt("category");
  const not = new Set((opt("not", "") || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  const minWeights = Number(opt("min-weights", 1));
  const limit = Number(opt("limit", 25));
  const fonts = await catalogue();
  const popular = new Set(fonts.filter((f) => f.source === "google").sort((a, b) => a.popularity - b.popularity).slice(0, 60).map((f) => f.family));

  const rows = fonts.filter((f) => {
    if (not.has(f.family.toLowerCase())) return false;
    if (args.includes("--fresh") && popular.has(f.family)) return false;
    if (category && !(CATEGORY[category] ?? new RegExp(category, "i")).test(`${f.category} ${f.stroke}`)) return false;
    return f.weights.length >= minWeights || f.variable;
  }).map((f) => {
    const scores = want.map((t) => f.tags[t] ?? 0);
    const quality = ["drawing", "spacing", "concept"].map((q) => f.tags[q]).filter((x) => x != null);
    const q = quality.length ? quality.reduce((a, b) => a + b, 0) / quality.length : null;
    return { f, match: want.length ? scores.reduce((a, b) => a + b, 0) / want.length : 0, q, scores };
  }).filter((r) => !want.length || r.match > 0)
    .sort((a, b) => b.match - a.match || (b.q ?? 0) - (a.q ?? 0));

  if (!rows.length) return console.log("No fonts matched. Try fewer or different tags, or drop --category.");
  console.log(`${rows.length} fonts match${want.length ? ` (${want.join(", ")})` : ""}. Top ${Math.min(limit, rows.length)}:`);
  for (const { f, match, q, scores } of rows.slice(0, limit)) {
    const w = f.variable ? `variable ${f.weights[0] ?? ""}-${f.weights.at(-1) ?? ""}` : f.weights.join(",");
    console.log(`- ${f.family} [${f.source}] ${f.category}${f.stroke && f.stroke !== f.category ? `/${f.stroke}` : ""} | ${w}${f.axes.length ? ` (${f.axes.join(",")})` : ""} | match ${Math.round(match)}${want.length > 1 ? ` (${scores.map(Math.round).join("/")})` : ""}${q != null ? ` | quality ${Math.round(q)}` : ""}${popular.has(f.family) ? " | very common" : ""}`);
  }
  console.log("\nShortlist 3-4 pairings from these (and fonts you know fit), then compare them with: node fonts.mjs specimen ...");
}

function cssFor(family, fonts) {
  const f = fonts.find((x) => x.family.toLowerCase() === family.toLowerCase());
  if (f?.source === "fontshare") return `https://api.fontshare.com/v2/css?f[]=${f.slug}@${(f.weights.length ? f.weights : [400, 700]).join(",")}&display=swap`;
  const fam = (f?.family ?? family).replace(/ /g, "+");
  const wghts = f?.variable && f.axes.includes("wght") ? `:wght@${f.weights[0] ?? 100}..${f.weights.at(-1) ?? 900}` : f?.weights.length ? `:wght@${f.weights.join(";")}` : "";
  return `https://fonts.googleapis.com/css2?family=${fam}${wghts}&display=swap`;
}

async function specimen() {
  const pairs = all("pair").map((p) => p.split("/").map((s) => s.trim()));
  const headline = opt("headline");
  if (!pairs.length || !headline) { console.error('Usage: node fonts.mjs specimen --headline "..." [--body "..."] --pair "Display / Body" [--pair ...]'); process.exit(1); }
  const body = opt("body", "We built it for people who'd rather be doing the work than the paperwork. Snap it, send it, sorted, and the numbers add themselves up while you get on with the job.");
  const out = resolve(opt("out", join(".acquired-taste", "fonts.png")));
  const fonts = await catalogue();
  const families = [...new Set(pairs.flat())];
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  // --ui: judge the pairing where an app or dashboard actually uses it (page title, a big number,
  // buttons, labels, a table with status), set in a neutral modern frame. A headline alone hid
  // that a mono-heavy pairing made a rota app look like a 2010 spreadsheet (2026-10-11).
  const ui = args.includes("--ui");
  const rows = (opt("rows", "") || "").split("|").map((r) => r.split(";").map((c) => c.trim())).filter((r) => r.length >= 3);
  const tableRows = rows.length ? rows : [["Maya Okafor", "Sat 09:00–15:00", "Waiting"], ["Tom Reyes", "Thu 07:00–15:00", "Approved"], ["Grace Lin", "Fri 12:00–17:00", "Gap"]];
  const pill = (s) => `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;background:${/gap|late|fail|down/i.test(s) ? "#fde8e6;color:#b42318" : /wait|pend|risk/i.test(s) ? "#fdf1dc;color:#93590b" : "#e5f3ea;color:#1d6b3e"}">${esc(s)}</span>`;
  const uiSample = (d, b) => `<div style="font-family:'${b}';font-feature-settings:'tnum'">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px"><div style="font-family:'${d}';font-size:28px;font-weight:650;letter-spacing:-.01em">${esc(headline)}</div>
<div style="display:flex;gap:8px"><span style="padding:8px 14px;border:1px solid #e3e1dc;border-radius:8px;font-size:14px;font-weight:500">Export</span><span style="padding:8px 14px;background:#151515;color:#fff;border-radius:8px;font-size:14px;font-weight:600">Publish</span></div></div>
<div style="display:flex;gap:28px;margin-bottom:18px"><div><div style="font-size:12px;color:#777;font-weight:500">Hours this week</div><div style="font-family:'${d}';font-size:36px;font-weight:650;letter-spacing:-.02em">174.5<span style="font-size:16px;color:#777;font-weight:500"> h</span></div></div>
<div><div style="font-size:12px;color:#777;font-weight:500">Gaps to fill</div><div style="font-family:'${d}';font-size:36px;font-weight:650;color:#b42318">2</div></div><div><div style="font-size:12px;color:#777;font-weight:500">Wages</div><div style="font-family:'${d}';font-size:36px;font-weight:650">£1,926.40</div></div></div>
<div style="border:1px solid #ecebe7;border-radius:10px;overflow:hidden;font-size:14px">${tableRows.map((r, k) => `<div style="display:grid;grid-template-columns:1.3fr 1.3fr .8fr;padding:11px 14px;align-items:center;${k ? "border-top:1px solid #f0efeb" : ""}"><span style="font-weight:600">${esc(r[0])}</span><span style="color:#555">${esc(r[1])}</span><span>${pill(r[2])}</span></div>`).join("")}</div>
<p style="font-size:14px;line-height:1.5;color:#555;margin:14px 0 0;max-width:60ch">${esc(body)}</p></div>`;
  const html = `<!doctype html><html><head><meta charset="utf-8">${families.map((f) => `<link rel="stylesheet" href="${cssFor(f, fonts)}">`).join("")}
<style>body{margin:0;background:#f4f2ee;color:#151515;font-family:system-ui;display:grid;grid-template-columns:repeat(${Math.min(pairs.length, 2)},1fr);gap:16px;padding:16px}
.card{background:#fff;border-radius:10px;padding:28px 32px}.label{font:600 12px/1.4 system-ui;color:#777;letter-spacing:.04em;text-transform:uppercase;margin-bottom:18px}
h1{font-size:54px;line-height:1.02;margin:0 0 14px;font-weight:800}.sub{font-size:22px;margin:0 0 14px;font-weight:600}p{font-size:17px;line-height:1.55;margin:0 0 14px;max-width:46ch}.chars{font-size:15px;color:#555}</style></head><body>
${pairs.map(([d, b = d], i) => `<div class="card"><div class="label">${i + 1}. ${esc(d)}${b !== d ? ` + ${esc(b)}` : ""}</div>${ui ? uiSample(d, b) : `<h1 style="font-family:'${d}'">${esc(headline)}</h1><div class="sub" style="font-family:'${d}'">Aa Bb Cc 1234567890</div><p style="font-family:'${b}'">${esc(body)}</p><p class="chars" style="font-family:'${b}'">£12.50 · €14 · café, naïve, Zoë · “quotes” — 0123456789 <b>bold</b> <i>italic</i></p>`}</div>`).join("")}
</body></html>`;
  let chromium;
  try { ({ chromium } = await import("playwright")); } catch {
    console.error(`Playwright isn't installed for Acquired Taste yet: npm install --prefix "${PLUGIN}" && npx --prefix "${PLUGIN}" playwright install chromium`); process.exit(2);
  }
  const browser = await launchBrowser(chromium);
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "networkidle", timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  const missing = await page.evaluate((fams) => fams.filter((f) => !document.fonts.check(`16px '${f}'`) || ![...document.fonts].some((ff) => ff.family.replace(/['"]/g, "") === f && ff.status === "loaded")), families);
  mkdirSync(dirname(out), { recursive: true });
  await page.screenshot({ path: out, fullPage: true });
  await browser.close();
  console.log(`Specimen: ${out}`);
  if (missing.length) console.log(`Didn't load (name wrong, or not in Google Fonts/Fontshare): ${missing.join(", ")}`);
}

async function install() {
  const family = args[1];
  if (!family || family.startsWith("--")) { console.error('Usage: node fonts.mjs install "Family" [--weights 400,700] [--dir public/fonts]'); process.exit(1); }
  const fonts = await catalogue();
  const f = fonts.find((x) => x.family.toLowerCase() === family.toLowerCase());
  if (!f) { console.error(`"${family}" isn't in Google Fonts or Fontshare. Check the name with: node fonts.mjs search`); process.exit(1); }
  const ident = f.family.replace(/[^A-Za-z0-9]+/g, "_").replace(/^(\d)/, "_$1");
  const varName = f.family.replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : "")).replace(/^./, (c) => c.toLowerCase());
  if (f.source === "google") {
    const weights = opt("weights");
    console.log(`Google font: next/font/google self-hosts it at build. In app/layout.tsx:\n`);
    console.log(`import { ${ident} } from "next/font/google";\nconst ${varName} = ${ident}({ subsets: ["latin"], ${f.variable && !weights ? "" : `weight: [${(weights ? weights.split(",") : f.weights.map(String)).map((w) => `"${w}"`).join(", ")}], `}display: "swap", variable: "--font-${varName.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}" });`);
    return;
  }
  const weights = (opt("weights") ?? (f.weights.length ? f.weights.join(",") : "400,700")).split(",").map(Number);
  const dir = resolve(opt("dir", join("public", "fonts")));
  const css = await getJson(`https://api.fontshare.com/v2/css?f[]=${f.slug}@${weights.join(",")}&display=swap`);
  const faces = [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map((m) => ({
    url: m[1].match(/url\('([^']+\.woff2)'\)/)?.[1], weight: Number(m[1].match(/font-weight:\s*(\d+)/)?.[1] ?? 400), style: m[1].match(/font-style:\s*(\w+)/)?.[1] ?? "normal",
  })).filter((x) => x.url);
  if (!faces.length) { console.error("Fontshare returned no files for those weights."); process.exit(1); }
  mkdirSync(dir, { recursive: true });
  const saved = [];
  for (const face of faces) {
    const file = `${f.slug}-${face.weight}${face.style === "italic" ? "-italic" : ""}.woff2`;
    const r = await fetch(face.url.startsWith("//") ? `https:${face.url}` : face.url);
    if (!r.ok) { console.error(`Couldn't download ${file}`); continue; }
    writeFileSync(join(dir, file), Buffer.from(await r.arrayBuffer()));
    saved.push({ file, ...face });
  }
  const rel = (p) => `../${join(opt("dir", join("public", "fonts")), p).replace(/\\/g, "/")}`;
  console.log(`Saved ${saved.length} files to ${dir} (Fontshare, ITF Free Font License: free for commercial use). In app/layout.tsx:\n`);
  console.log(`import localFont from "next/font/local";\nconst ${varName} = localFont({ src: [\n${saved.map((s) => `  { path: "${rel(s.file)}", weight: "${s.weight}", style: "${s.style}" },`).join("\n")}\n], display: "swap", variable: "--font-${f.slug}" });`);
}

const [command] = args;
try {
  if (command === "search") await search();
  else if (command === "specimen") await specimen();
  else if (command === "install") await install();
  else { console.error("Usage: node fonts.mjs search|specimen|install ... (see the top of this file)"); process.exit(1); }
} catch (e) {
  console.error(`Font lookup failed: ${e.message}. Check the internet connection; if it keeps failing, choose fonts you know are on Google Fonts and use next/font/google.`);
  process.exit(1);
}
