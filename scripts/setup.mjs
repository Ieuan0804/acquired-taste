#!/usr/bin/env node
// Checks everything Acquired Taste needs and prints a fix for anything missing.
//
//   node setup.mjs            quick checks (makes one tiny real Codex request)
//   node setup.mjs --image    also generates one small test image (about a minute)
//
// Exit code 0 when everything needed for the review loop works (images are optional).

import { spawnSync } from "node:child_process";
import { mkdtempSync, existsSync, rmSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir, homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { findCodex } from "./codex.mjs";
import { findUpscaler } from "./upscale.mjs";
import { launchBrowser, browserInfo, NO_BROWSER } from "./lib/browser.mjs";

const PLUGIN = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const withImage = process.argv.includes("--image");

// --cached: reuse a passing result from the last 12 hours (the full check takes ~20s and
// makes a real Codex request). Failures are never cached.
const cacheFile = join(homedir(), ".acquired-taste", "setup.json");
if (process.argv.includes("--cached") && existsSync(cacheFile)) {
  const cached = JSON.parse(readFileSync(cacheFile, "utf8"));
  if (Date.now() - cached.at < 12 * 3600 * 1000 && cached.reviewReady) {
    console.log(`Acquired Taste setup: ${cached.imagesReady ? "Ready" : "Ready (pictures off)"} (checked ${Math.round((Date.now() - cached.at) / 60000)} min ago)`);
    console.log(`Review loop: ready\nImage generation: ${cached.imagesReady ? "ready" : "not available, so sites will use code-built visuals and labelled placeholders"}`);
    console.log(`Upscaler: ${findUpscaler() ? "ready" : "not installed (optional; ask the user before: node upscale.mjs --install)"}`);
    process.exit(0);
  }
}
const results = [];
const check = (name, ok, fix = "") => results.push({ name, ok, fix });

// 1. Node
const major = Number(process.versions.node.split(".")[0]);
check("Node.js 18 or newer", major >= 18, `You have Node ${process.versions.node}. Install Node 20 or newer from https://nodejs.org`);

// 2. Playwright and its browser (the review loop)
let playwright = null;
try {
  playwright = await import("playwright");
  check("Playwright installed in the plugin", true);
} catch {
  check("Playwright installed in the plugin", false, `npm install --prefix "${PLUGIN}"`);
}
if (playwright) {
  const browser = await launchBrowser(playwright.chromium, {}, { exitOnFail: false });
  if (browser) {
    await browser.close();
    check(`Browser for the review loop (${browserInfo.label})`, true);
  } else {
    check("Browser for the review loop", false, `${NO_BROWSER.split("\n").slice(1).join("\n           ")}\n           Tried: ${browserInfo.errors.join("; ").slice(0, 400)}`);
  }
}

// 3. Codex CLI signed in with ChatGPT (image generation, optional)
const codex = findCodex();
check("Codex CLI installed (for image generation)", !!codex, "npm install -g @openai/codex");
if (codex) {
  const status = spawnSync(codex.command, [...codex.args, "login", "status"], { encoding: "utf8", windowsHide: true });
  const text = `${status.stdout}${status.stderr}`;
  const chatgpt = /ChatGPT/i.test(text);
  check("Codex signed in with ChatGPT", chatgpt,
    /API key/i.test(text)
      ? "Codex is using an API key (pay per image). To use your ChatGPT plan instead: codex logout, then codex login and choose Sign in with ChatGPT."
      : "codex login (choose Sign in with ChatGPT; a Plus plan or higher is needed for images)");

  if (chatgpt) {
    // "Logged in" can be stale (a revoked refresh token), so make one tiny real request.
    const work = mkdtempSync(join(tmpdir(), "acquired-taste-setup-"));
    const ping = spawnSync(codex.command, [...codex.args, "exec", "--skip-git-repo-check", "--ephemeral", "--ignore-user-config",
      "-s", "read-only", "-C", work, "Reply with the single word OK and do nothing else."],
      { encoding: "utf8", windowsHide: true, timeout: 120000 });
    const out = `${ping.stdout}${ping.stderr}`;
    check("Codex login actually works", ping.status === 0 && /\bOK\b/.test(out),
      /refresh token|log in|401|unauthori/i.test(out)
        ? "The login has expired: codex logout, then codex login (choose Sign in with ChatGPT)."
        : `Codex couldn't answer a test request. Last output: ${out.trim().split("\n").slice(-2).join(" | ").slice(0, 200)}`);
    rmSync(work, { recursive: true, force: true });

    if (withImage && results.at(-1).ok) {
      const dir = mkdtempSync(join(tmpdir(), "acquired-taste-setup-img-"));
      const gen = spawnSync(process.execPath, [join(PLUGIN, "scripts", "gen-image.mjs"), "--prompt",
        "A single small red circle on a plain white background", "--name", "test", "--out", dir],
        { encoding: "utf8", windowsHide: true, timeout: 360000 });
      check("Image generation works on this ChatGPT plan", existsSync(join(dir, "test.png")),
        `${gen.stdout}${gen.stderr}`.trim().split("\n").slice(-1)[0] || "No image was produced. Image generation may need a Plus plan or higher.");
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

// 4. Upscaler (optional): keeps generated heroes sharp on big and high-resolution screens.
check("Upscaler for sharp large images (optional)", !!findUpscaler(),
  `Ask the user first (one-off ~45 MB download from the official Real-ESRGAN release), then: node "${join(PLUGIN, "scripts", "upscale.mjs")}" --install`);

// Report. Node, Playwright and a browser are needed; images and the upscaler are optional,
// so a missing optional part is shown as [optional], never as a failure.
const core = (r) => /Node|Playwright|Browser/.test(r.name);
const reviewReady = results.filter(core).every((r) => r.ok);
const imagesReady = results.filter((r) => /Codex|Image/.test(r.name)).every((r) => r.ok);
const headline = !reviewReady ? "NOT READY: fix the [fix] lines below"
  : imagesReady ? "Ready" : "Ready (pictures off: sites use code-built visuals and labelled placeholders)";
console.log(`Acquired Taste setup check: ${headline}\n`);
for (const r of results) {
  const tag = r.ok ? "[ok]       " : core(r) ? "[fix]      " : "[optional] ";
  console.log(`${tag}${r.name}${r.ok ? "" : `\n           ${r.fix}`}`);
}
if (reviewReady) {
  mkdirSync(dirname(cacheFile), { recursive: true });
  writeFileSync(cacheFile, JSON.stringify({ at: Date.now(), reviewReady, imagesReady }, null, 2));
}
console.log(`\nReview loop: ${reviewReady ? "ready" : "needs the fixes above"}`);
console.log(`Upscaler: ${findUpscaler() ? "ready" : "not installed (optional; large images will be slightly soft on high-resolution screens)"}`);
console.log(`Image generation: ${imagesReady ? (withImage ? "ready" : "ready (run with --image to test a real image)") : "not available, so sites will use code-built visuals and labelled placeholders"}`);
process.exit(reviewReady ? 0 : 1);
