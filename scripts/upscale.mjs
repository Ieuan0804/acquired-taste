#!/usr/bin/env node
// Makes large generated images sharp on big and high-resolution screens by enlarging them
// 2x with Real-ESRGAN (the "animevideov3" model: fast, and keeps illustrated and 3D-render
// art unchanged apart from the extra detail). Generated images are only ~1670px wide, but a
// full-width hero on a high-resolution screen needs ~3800px.
//
//   node upscale.mjs <image.png> [more.png ...]   enlarge in place (originals kept in .acquired-taste/originals/)
//   node upscale.mjs --check                      exit 0 if the upscaler is installed
//   node upscale.mjs --install                    one-off download (~45 MB) from the official GitHub release.
//                                                 Ask the user before running this.
//
// gen-image.mjs calls this automatically for wide images when the upscaler is installed.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync, renameSync, rmSync, statSync, readdirSync } from "node:fs";
import { join, basename, resolve, dirname } from "node:path";
import { homedir, platform } from "node:os";
import { fileURLToPath } from "node:url";

const TOOLS = join(homedir(), ".acquired-taste", "tools", "realesrgan");
const RELEASE = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0";
const ZIP = { win32: "realesrgan-ncnn-vulkan-20220424-windows.zip", darwin: "realesrgan-ncnn-vulkan-20220424-macos.zip", linux: "realesrgan-ncnn-vulkan-20220424-ubuntu.zip" }[platform()];
const MODEL = "realesr-animevideov3";

// Finds the executable wherever the zip put it.
export function findUpscaler() {
  if (!existsSync(TOOLS)) return null;
  const exe = platform() === "win32" ? "realesrgan-ncnn-vulkan.exe" : "realesrgan-ncnn-vulkan";
  const walk = (dir, depth) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (f === exe) return p;
      if (depth < 2 && statSync(p).isDirectory()) { const hit = walk(p, depth + 1); if (hit) return hit; }
    }
    return null;
  };
  const bin = walk(TOOLS, 0);
  return bin && existsSync(join(dirname(bin), "models", `${MODEL}-x2.param`)) ? bin : null;
}

// Enlarges one image 2x in place. Returns { ok, reason }.
export function upscale(file, { keepOriginalIn = join(".acquired-taste", "originals") } = {}) {
  const bin = findUpscaler();
  if (!bin) return { ok: false, reason: "upscaler not installed (node upscale.mjs --install, with the user's OK)" };
  const tmp = `${file}.upscaled.png`;
  const run = spawnSync(bin, ["-i", file, "-o", tmp, "-n", MODEL, "-s", "2", "-m", join(dirname(bin), "models")],
    { encoding: "utf8", windowsHide: true, timeout: 180000 });
  if (run.status !== 0 || !existsSync(tmp)) {
    rmSync(tmp, { force: true });
    return { ok: false, reason: `upscaler failed: ${`${run.stderr}${run.stdout}`.trim().split("\n").slice(-1)[0]?.slice(0, 200) ?? "no output"}` };
  }
  mkdirSync(keepOriginalIn, { recursive: true });
  copyFileSync(file, join(keepOriginalIn, basename(file)));
  renameSync(tmp, file);
  return { ok: true };
}

function install() {
  if (!ZIP) { console.error(`No upscaler build for ${platform()}.`); process.exit(1); }
  if (findUpscaler()) { console.log(`Already installed: ${findUpscaler()}`); return; }
  mkdirSync(TOOLS, { recursive: true });
  const zip = join(TOOLS, ZIP);
  console.log(`Downloading ${ZIP} (~45 MB) from the official Real-ESRGAN release...`);
  const dl = spawnSync("curl", ["-fsSL", "-o", zip, `${RELEASE}/${ZIP}`], { stdio: "inherit", windowsHide: true });
  if (dl.status !== 0 || !existsSync(zip) || statSync(zip).size < 20e6) { console.error("Download failed."); process.exit(1); }
  const unzip = platform() === "win32"
    ? spawnSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -Force -LiteralPath '${zip}' -DestinationPath '${TOOLS}'`], { stdio: "inherit", windowsHide: true })
    : spawnSync("unzip", ["-q", "-o", zip, "-d", TOOLS], { stdio: "inherit" });
  rmSync(zip, { force: true });
  if (unzip.status !== 0 || !findUpscaler()) { console.error("Couldn't unpack the upscaler."); process.exit(1); }
  if (platform() !== "win32") spawnSync("chmod", ["+x", findUpscaler()]);
  console.log(`Installed: ${findUpscaler()}`);
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes("--install")) install();
  else if (args.includes("--check")) { const b = findUpscaler(); console.log(b ? `Upscaler ready: ${b}` : "Upscaler not installed."); process.exit(b ? 0 : 1); }
  else if (!args.length) { console.error("Usage: node upscale.mjs <image.png> [...] | --check | --install"); process.exit(1); }
  else {
    let failed = 0;
    for (const f of args) {
      const t = Date.now();
      const r = upscale(f);
      console.log(r.ok ? `upscaled: ${f} (${Math.round((Date.now() - t) / 1000)}s)` : `not upscaled: ${f}: ${r.reason}`);
      if (!r.ok) failed++;
    }
    process.exit(failed ? 1 : 0);
  }
}
