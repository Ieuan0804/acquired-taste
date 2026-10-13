// Starts the browser every checking tool uses, with fallbacks for machines where Playwright's
// own browser couldn't be downloaded (cdn.playwright.dev blocked, offline, locked-down cloud).
//
// Order: ACQUIRED_TASTE_BROWSER (a path the user set), Playwright's own browser, installed
// Chrome, installed Edge, a system Chromium or Chrome, then any older Playwright browser
// already on the machine (newest first). Nothing is downloaded, moved or linked.

import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const PLUGIN = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Which browser was used, for the setup check to report.
export let browserInfo = null;

const SYSTEM_PATHS = {
  linux: ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable",
    "/snap/bin/chromium", "/usr/bin/microsoft-edge"],
  darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"],
  win32: [],
};

// Folders where Playwright keeps browsers on each system, plus common shared ones.
function playwrightFolders() {
  const home = homedir();
  return [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    join(home, ".cache", "ms-playwright"),
    join(home, "Library", "Caches", "ms-playwright"),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "ms-playwright"),
    "/ms-playwright",
    "/opt/pw-browsers",
  ].filter((d) => d && d !== "0" && existsSync(d));
}

const PROGRAM = /^(chrome|chrome\.exe|headless_shell|headless_shell\.exe|chrome-headless-shell|chrome-headless-shell\.exe|Chromium)$/;

// Older Playwright browser builds already on the machine, newest build first; full browsers
// before headless shells of the same build.
function existingBuilds() {
  const found = [];
  for (const root of playwrightFolders()) {
    let builds = [];
    try { builds = readdirSync(root).filter((n) => /^chromium(_headless_shell)?-\d+$/.test(n)); } catch { continue; }
    for (const build of builds) {
      const number = Number(build.split("-").pop());
      const walk = (dir, depth) => {
        if (depth > 4) return;
        let names = [];
        try { names = readdirSync(dir); } catch { return; }
        for (const n of names) {
          const p = join(dir, n);
          let s;
          try { s = statSync(p); } catch { continue; }
          if (s.isFile() && PROGRAM.test(n)) found.push({ path: p, number, shell: build.includes("headless_shell") });
          else if (s.isDirectory()) walk(p, depth + 1);
        }
      };
      walk(join(root, build), 0);
    }
  }
  found.sort((a, b) => b.number - a.number || a.shell - b.shell);
  return found.map((f) => f.path);
}

// A generator, so the disk is only searched when the earlier options have failed.
function* candidates() {
  const own = process.env.ACQUIRED_TASTE_BROWSER;
  if (own) yield { label: `the browser set in ACQUIRED_TASTE_BROWSER (${own})`, options: { executablePath: own } };
  yield { label: "Playwright's own browser", options: {} };
  yield { label: "installed Google Chrome", options: { channel: "chrome" } };
  yield { label: "installed Microsoft Edge", options: { channel: "msedge" } };
  for (const p of SYSTEM_PATHS[process.platform] ?? []) if (existsSync(p)) yield { label: `system browser ${p}`, options: { executablePath: p } };
  for (const p of existingBuilds()) yield { label: `existing Playwright browser ${p}`, options: { executablePath: p } };
}

export const NO_BROWSER = `No browser could be started for checking pages. Any one of these fixes it:
  1. Download Playwright's browser (about 150 MB from cdn.playwright.dev):
       npx --prefix "${PLUGIN}" playwright install chromium
  2. If that download is blocked on this network: install Google Chrome, Microsoft Edge or Chromium.
  3. Or point the plugin at a Chrome, Chromium or Edge program already on this machine:
       set ACQUIRED_TASTE_BROWSER to its full path (e.g. /usr/bin/chromium).
Don't fake, move or link browser folders, and don't change system folders: stop and tell the user.`;

// A real Chrome or Edge asks every site for /favicon.ico by itself (Playwright's own browser
// doesn't), so a site without one logs a 404 console error that isn't the page's doing.
// The checking tools skip it so every browser reports the same.
export const browserNoise = (m) => /\/favicon\.ico(\?|$)/.test(m.location?.()?.url ?? "");

// launchBrowser(chromium, options): like chromium.launch(options), with the fallbacks above.
// On failure prints how to fix it and exits (code 2), unless { exitOnFail: false } is given,
// in which case it returns null.
export async function launchBrowser(chromium, options = {}, { exitOnFail = true } = {}) {
  const errors = [];
  for (const c of candidates()) {
    try {
      const browser = await chromium.launch({ ...options, ...c.options });
      browserInfo = { label: c.label, fallback: c.label !== "Playwright's own browser" };
      return browser;
    } catch (e) {
      errors.push(`${c.label}: ${String(e.message).split("\n")[0].slice(0, 160)}`);
    }
  }
  browserInfo = { label: null, errors };
  if (!exitOnFail) return null;
  console.error(`${NO_BROWSER}\n\nTried:\n  ${errors.join("\n  ")}`);
  process.exit(2);
}
