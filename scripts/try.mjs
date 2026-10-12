#!/usr/bin/env node
// Walks through user journeys in a real browser and reports each step. Use it to check
// that things work (book, add to basket, filter, save, delete) without writing a test
// script: never write your own browser script; if a step can't be said here, use js: or
// expect-js: for that one step.
//
// One journey, steps on the command line:
//   node try.mjs <url> [--mobile] [--login "<steps>"] "<step>" ["<step>" ...]
//
// Many journeys, from a file (for apps; write it once, rerun it on every pass):
//   node try.mjs <url> --journeys .acquired-taste/journeys.txt [--failed | --only "name|name"]
//
//   login: goto:/login; fill:Email=test@example.com; fill:Password=${TEST_PASSWORD}; click:Sign in
//
//   == Add a place, then remove it
//   goto:/settings
//   fill:Place name=Test lobby {run}
//   click:Add place
//   expect:Test lobby {run}
//   click:Remove in "Test lobby {run}"
//   expect-gone:Test lobby {run}
//
//   == Rename the project, then put it back
//   goto:/settings
//   fill:Name=Renamed {run}
//   click:Save
//   expect:Renamed {run}
//   always:
//   goto:/settings
//   fill:Name=Pet Kingdom
//   click:Save
//
//   == Wrong password shows an error [signed out]
//   == Phone menu opens [phone]
//
// "== Name" starts a journey; [signed out] and [phone] start it signed out or at phone
// width. Steps under "always:" run even when the journey fails: put back whatever it
// changed. {run} is a tag unique to each run, so test records never clash with leftovers ({num}
// is a six-digit one, for fields that only take numbers).
// Each journey starts in a fresh tab (signed in, from the login line or --login); if a
// journey ends the session (signing out), the next one signs in again by itself.
// --failed reruns only the journeys that failed last time; --only runs journeys whose
// names contain any of the given words. While fixing, rerun only failures; before
// handing over, run them all once more.
//
// Steps (full list in lib/steps.mjs):
//   goto:/path            open a page
//   click:Text            click a button or link by its visible name (falls back to any text)
//   fill:Label=value      type into the field with that label (or placeholder; if the label
//                         isn't linked to its box: its name or id, the box after the words,
//                         or the only email/password box)
//   select:Label=Option   choose an option in a select
//   check:Label           tick a checkbox or radio
//   press:Enter           press a key
//   expect:Text           pass if this text is visible
//   expect-gone:Text      pass once this text has gone
//   expect-url:/part      pass once the address contains this
//   expect-value:Label=v  pass once that field holds this value
//   shot:name             save a screenshot to .acquired-taste/review/try-<name>.png
// Pick one of several with "(2nd)", "(last)" or in "words nearby": click:Remove in "Test lobby"
// Every step waits for the page to finish loading what it started, so wait: is rarely needed.
//
// ${NAME} in a step reads the environment variable NAME (for test passwords).
// --login signs in first, the same way as review.mjs --login (steps separated by ";",
// or a file with one step per line); the journey then starts signed in.
//
// Example: node try.mjs http://localhost:4300 "goto:/tyres/ridgeback-45" "click:700c"
//          "click:Add to basket" "expect:1 item"

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { runStep, parseLogin, signIn, newContext } from "./lib/steps.mjs";
import { workDir } from "./lib/workdir.mjs";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("Playwright isn't installed for Acquired Taste yet. Run the plugin's setup check: node <plugin>/scripts/setup.mjs");
  process.exit(2);
}

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(`--${name}`); return i === -1 ? null : args.splice(i, 2)[1]; };
const bool = (name) => { const i = args.indexOf(`--${name}`); if (i === -1) return false; args.splice(i, 1); return true; };
const mobile = bool("mobile");
const failedOnly = bool("failed");
const loginArg = flag("login");
const journeysFile = flag("journeys");
const only = flag("only");
const [url, ...steps] = args;
if (!url || (!steps.length && !journeysFile)) {
  console.error('Usage: node try.mjs <url> [--mobile] [--login "<steps>"] "goto:/path" "click:Text" "fill:Label=value" "expect:Text" ...\n   or: node try.mjs <url> --journeys <file> [--failed | --only "name|name"]');
  process.exit(1);
}

const outDir = join(".acquired-taste", "review");
workDir();
mkdirSync(outDir, { recursive: true });
const PHONE = { width: 390, height: 844 }, DESKTOP = { width: 1440, height: 900 };
const run = Date.now().toString(36).slice(-5);
const num = String(Date.now()).slice(-6);
const firstLine = (e) => e.message.split("\n")[0].slice(0, 200);
const noise = (e) => /Download the React DevTools/.test(e);

if (journeysFile) await journeys();
else await single();

async function startSignedIn(browser, steps) {
  try {
    const login = await signIn(browser, url, parseLogin(steps), outDir);
    console.log(`ok   signed in${login.notes.length ? ` (fields ${login.notes.join("; ")})` : ""}`);
    return login;
  } catch (e) {
    console.log(`FAIL sign-in: ${e.message}`);
    await browser.close();
    process.exit(1);
  }
}

function listen(page, errors) {
  page.on("pageerror", (e) => errors.push(e.message.split("\n")[0]));
  page.on("console", (m) => m.type() === "error" && !noise(m.text()) && errors.push(m.text().slice(0, 160)));
}

// One journey from the command line (the original behaviour).
async function single() {
  const browser = await chromium.launch();
  const login = loginArg ? await startSignedIn(browser, loginArg) : null;
  const context = await newContext(browser, login, { viewport: mobile ? PHONE : DESKTOP });
  const page = await context.newPage();
  const errors = [];
  listen(page, errors);
  await page.goto(url, { waitUntil: "load", timeout: 30000 });

  let failed = 0;
  for (const step of steps) {
    let ok = true, note = "";
    try {
      note = await runStep(page, url, step, outDir, { run, num });
    } catch (e) {
      ok = false;
      failed++;
      note = firstLine(e);
      const p = join(outDir, `try-failed-${failed}.png`);
      await page.screenshot({ path: p }).catch(() => {});
      note += ` (screenshot: ${p})`;
    }
    console.log(`${ok ? "ok  " : "FAIL"} ${step}${note ? `: ${note}` : ""}`);
    if (!ok) break;
  }
  await browser.close();
  if (errors.length) console.log(`console errors during the journey: ${[...new Set(errors)].slice(0, 5).join(" | ")}`);
  console.log(failed ? "Journey failed at the step above." : "Journey works.");
  process.exit(failed ? 1 : 0);
}

function parseJourneys(text) {
  const out = { login: null, list: [] };
  let cur = null;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const head = line.match(/^==\s*(.+?)\s*(?:\[([^\]]+)\])?$/);
    if (head) {
      const tags = (head[2] ?? "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
      const bad = tags.find((t) => !["signed out", "phone"].includes(t));
      if (bad) throw new Error(`line ${i + 1}: unknown tag [${bad}] (use [signed out], [phone] or [signed out, phone])`);
      cur = { name: head[1], signedOut: tags.includes("signed out"), phone: tags.includes("phone") || mobile, steps: [], always: [], inAlways: false };
      out.list.push(cur);
    } else if (!cur && /^login:/i.test(line)) out.login = line.slice(6).trim();
    else if (!cur) throw new Error(`line ${i + 1}: steps go under a "== Journey name" line`);
    else if (/^always:$/i.test(line)) cur.inAlways = true;
    else (cur.inAlways ? cur.always : cur.steps).push(line);
  });
  const names = out.list.map((j) => j.name);
  const dupe = names.find((n, i) => names.indexOf(n) !== i);
  if (dupe) throw new Error(`two journeys are called "${dupe}"; names must be unique`);
  return out;
}

// Many named journeys from a file; remembers which failed so --failed can rerun just those.
async function journeys() {
  const file = resolve(journeysFile);
  if (!existsSync(file)) { console.error(`No journeys file at ${file}`); process.exit(1); }
  let spec;
  try { spec = parseJourneys(readFileSync(file, "utf8")); } catch (e) { console.error(`${journeysFile}: ${e.message}`); process.exit(1); }
  const lastPath = join(outDir, "journeys-last.json");
  const last = existsSync(lastPath) ? JSON.parse(readFileSync(lastPath, "utf8")) : null;

  let chosen = spec.list;
  if (failedOnly) {
    if (!last || last.file !== file) { console.error("No earlier run of this journeys file to take failures from; run it once without --failed."); process.exit(1); }
    chosen = spec.list.filter((j) => last.failed.includes(j.name));
    if (!chosen.length) { console.log("Nothing failed last time. Run them all once more before handing over."); process.exit(0); }
  } else if (only) {
    const words = only.split("|").map((w) => w.trim().toLowerCase()).filter(Boolean);
    const missing = words.filter((w) => !spec.list.some((j) => j.name.toLowerCase().includes(w)));
    if (missing.length) { console.error(`No journey name contains: ${missing.join(", ")}`); process.exit(1); }
    chosen = spec.list.filter((j) => words.some((w) => j.name.toLowerCase().includes(w)));
  }

  const browser = await chromium.launch();
  const loginSteps = loginArg ?? spec.login;
  const needsLogin = loginSteps && chosen.some((j) => !j.signedOut);
  let login = needsLogin ? await startSignedIn(browser, loginSteps) : null;
  const started = Date.now();
  const results = [];

  const attempt = async (j) => {
    const context = await newContext(browser, j.signedOut ? null : login, { viewport: j.phone ? PHONE : DESKTOP });
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(url).origin }).catch(() => {});
    const page = await context.newPage();
    const errors = [], notes = [];
    listen(page, errors);
    const slug = j.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    let failure = null, putBack = null;
    try {
      if (!/^goto:/.test(j.steps[0] ?? "")) await page.goto(url, { waitUntil: "load", timeout: 30000 });
      for (const [i, step] of j.steps.entries()) {
        try {
          const note = await runStep(page, url, step, outDir, { run, num });
          if (note) notes.push(note);
          // Opened a page but landed on the login page: say so now rather than time out later.
          if (login && !j.signedOut && step.startsWith("goto:") && new URL(page.url()).pathname === login.loginPath && new URL(step.slice(5).trim(), url).pathname !== login.loginPath) {
            throw new Error("sent back to the login page");
          }
        } catch (e) {
          const shot = join(outDir, `journey-${slug}-failed.png`);
          await page.screenshot({ path: shot }).catch(() => {});
          let at = "";
          try { at = new URL(page.url()).pathname; } catch {}
          failure = { step: i + 1, text: step, why: firstLine(e), shot, at };
          break;
        }
      }
      for (const step of j.always) {
        try { await runStep(page, url, step, outDir, { run, num }); }
        catch (e) { putBack = `put-back step "${step}" failed: ${firstLine(e)}`; break; }
      }
    } finally {
      await context.close();
    }
    return { failure, putBack, errors: [...new Set(errors)], notes: [...new Set(notes)] };
  };

  for (const j of chosen) {
    const t0 = Date.now();
    let r = await attempt(j);
    // Sent back to the login page: an earlier journey ended the session. Sign in again once.
    if (r.failure && login && !j.signedOut && r.failure.at === login.loginPath && !j.steps.some((s) => s.includes(login.loginPath))) {
      login = await signIn(browser, url, parseLogin(loginSteps), outDir).catch(() => login);
      r = await attempt(j);
      r.notes.unshift("signed in again (an earlier journey ended the session)");
    }
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const ok = !r.failure && !r.putBack;
    results.push({ name: j.name, ok, errors: r.errors });
    let line = `${ok ? "ok  " : "FAIL"} ${j.name} (${secs} s)`;
    if (r.failure) line += `\n     step ${r.failure.step} "${r.failure.text}": ${r.failure.why} [at ${r.failure.at}] (screenshot: ${r.failure.shot})`;
    if (r.putBack) line += `\n     ${r.putBack}; check the app for leftovers`;
    if (r.notes.length) line += `\n     note: ${r.notes.join("; ")}`;
    console.log(line);
  }
  await browser.close();

  const failed = results.filter((r) => !r.ok).map((r) => r.name);
  const ran = results.map((r) => r.name);
  const stillFailing = chosen.length === spec.list.length || !last || last.file !== file ? failed
    : [...new Set([...last.failed.filter((n) => !ran.includes(n) && spec.list.some((j) => j.name === n)), ...failed])];
  writeFileSync(lastPath, JSON.stringify({ file, when: new Date().toISOString(), failed: stillFailing, total: spec.list.length }, null, 2));

  const withErrors = results.filter((r) => r.errors.length);
  if (withErrors.length) console.log(`console errors: ${withErrors.map((r) => `${r.name}: ${r.errors.slice(0, 2).join(" | ")}`).join("\n                ")}`);
  const secs = Math.round((Date.now() - started) / 1000);
  const passed = results.length - failed.length;
  if (chosen.length === spec.list.length) {
    console.log(`${passed} of ${results.length} journeys passed in ${secs} s.${failed.length ? " Fix, then rerun only the failures with --failed; run them all once more at the end." : ""}`);
  } else {
    const others = stillFailing.filter((n) => !ran.includes(n));
    console.log(`${passed} of ${results.length} passed in ${secs} s (ran ${results.length} of ${spec.list.length}).${others.length ? ` Still failing from earlier: ${others.join(", ")}.` : ""} Run them all once more before handing over.`);
  }
  process.exit(failed.length ? 1 : 0);
}
