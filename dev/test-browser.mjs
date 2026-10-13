#!/usr/bin/env node
// Tests the browser fallbacks (scripts/lib/browser.mjs): a normal machine uses Playwright's own
// browser; when it's missing (as on networks that block cdn.playwright.dev) an installed Chrome
// or Edge is used; a path in ACQUIRED_TASTE_BROWSER comes first; older Playwright builds already
// on the machine are found newest first; and with nothing usable the message says what to do.
//
//   node dev/test-browser.mjs

import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const PLUGIN = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HELPER = pathToFileURL(join(PLUGIN, "scripts", "lib", "browser.mjs")).href;
const work = mkdtempSync(join(tmpdir(), "acquired-taste-browser-"));

let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n${detail}`}`); if (!ok) failed++; };

// Real browsers, each in its own process (Playwright reads its browser folder setting at start).
const real = (env) => spawnSync(process.execPath, ["--input-type=module", "-e", `
  import { chromium } from "playwright";
  import { launchBrowser, browserInfo } from ${JSON.stringify(HELPER)};
  const b = await launchBrowser(chromium);
  const p = await b.newPage(); await p.setContent("<h1>hi</h1>");
  console.log("USED:" + browserInfo.label + "|" + await p.textContent("h1"));
  await b.close();`], { cwd: PLUGIN, encoding: "utf8", windowsHide: true, env: { ...process.env, ...env }, timeout: 120000 });

let r = real({});
check("normal machine: Playwright's own browser", /USED:Playwright's own browser\|hi/.test(r.stdout), r.stdout + r.stderr);

const empty = join(work, "no-browsers");
mkdirSync(empty);
r = real({ PLAYWRIGHT_BROWSERS_PATH: empty });
check("own browser missing: falls back to an installed browser and renders a page",
  /USED:(?!Playwright's own)[^|]+\|hi/.test(r.stdout), r.stdout + r.stderr);
console.log(`     (used: ${(r.stdout.match(/USED:([^|]+)/) || [])[1] ?? "none"})`);

// The order and the folder search, with a stand-in for Playwright that accepts chosen options.
const helper = await import(HELPER);
const { launchBrowser } = helper;
const fake = (accept) => ({ launch: async (o) => { if (accept(o)) return { close() {}, options: o }; throw new Error("cannot start"); } });

const shared = join(work, "ms-playwright");
const program = process.platform === "win32" ? "chrome.exe" : "chrome";
for (const [build, sub, file] of [["chromium-9998", "chrome-linux", program], ["chromium-9999", "chrome-linux64", program],
  ["chromium_headless_shell-9999", "chrome-headless-shell-linux64", "chrome-headless-shell"]]) {
  mkdirSync(join(shared, build, sub), { recursive: true });
  writeFileSync(join(shared, build, sub, file), "");
}
const saved = { ...process.env };
process.env.PLAYWRIGHT_BROWSERS_PATH = shared;
delete process.env.ACQUIRED_TASTE_BROWSER;

let b = await launchBrowser(fake((o) => o.executablePath?.startsWith(shared)), {}, { exitOnFail: false });
check("older builds: newest full browser picked first", b?.options.executablePath === join(shared, "chromium-9999", "chrome-linux64", program),
  JSON.stringify(b?.options));

process.env.ACQUIRED_TASTE_BROWSER = join(work, "my-chrome");
b = await launchBrowser(fake(() => true), {}, { exitOnFail: false });
check("ACQUIRED_TASTE_BROWSER is tried first", b?.options.executablePath === process.env.ACQUIRED_TASTE_BROWSER && /ACQUIRED_TASTE_BROWSER/.test(helper.browserInfo.label),
  JSON.stringify(helper.browserInfo));

b = await launchBrowser(fake(() => false), {}, { exitOnFail: false });
check("nothing usable: returns null and lists every try", b === null && helper.browserInfo.errors.length >= 5 && helper.browserInfo.errors.some((e) => e.includes("9999")),
  JSON.stringify(helper.browserInfo));
process.env = saved;

// The exit message (code 2, says what to do, warns off system folders).
r = spawnSync(process.execPath, ["--input-type=module", "-e", `
  import { launchBrowser } from ${JSON.stringify(HELPER)};
  await launchBrowser({ launch: async () => { throw new Error("cannot start"); } });`],
  { encoding: "utf8", windowsHide: true, env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: empty } });
check("nothing usable in a tool: exits 2 with the fixes", r.status === 2 && /playwright install chromium/.test(r.stderr)
  && /ACQUIRED_TASTE_BROWSER/.test(r.stderr) && /don't change system folders/.test(r.stderr), `${r.status}\n${r.stderr}`);

rmSync(work, { recursive: true, force: true });
console.log(failed ? `\n${failed} failed` : "\nAll browser fallback checks pass");
process.exit(failed ? 1 : 0);
