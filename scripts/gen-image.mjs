#!/usr/bin/env node
// Generates images through the OpenAI Codex CLI, signed in with the user's ChatGPT plan
// (no API key, no Claude usage). About a minute per image; several run in parallel.
//
//   node gen-image.mjs --spec images.json [--out public/images] [--parallel 3]
//   node gen-image.mjs --prompt "..." --name hero [--aspect 16:9] [--style "..."] [--out public/images]
//
// Spec file: { "style": "one shared style line for every image",
//              (an image may add "refs": ["brand/founder-avatar.png"] to attach reference pictures)
//              "images": [ { "name": "hero", "prompt": "...", "aspect": "16:9" }, ... ] }
// Refine pass: an image with "edit": "public/images/hero-b.png" attaches that picture and
// changes only what the prompt asks for, keeping everything else.
// Aspect: 1:1, 4:3, 3:4, 3:2, 2:3, 16:9, 9:16, 21:9 (passed to the generator as guidance).
// Wide images (16:9, 21:9, 3:2) and any image with "upscale": true are enlarged 2x right
// after generating when the upscaler is installed (see upscale.mjs), so heroes and
// full-width photos stay sharp on big and high-resolution screens. "upscale": false opts out.
//
// Progress is written to <out>/.status.json so it can be checked while it runs in the
// background (merged with entries from other batches into the same folder, such as a refine
// pass started while the first batch is still running). Prints one line per image: done
// (path) or failed (reason).

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, copyFileSync, readdirSync, statSync, rmSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { homedir, tmpdir } from "node:os";
import { findCodex } from "./codex.mjs";
import { findUpscaler, upscale } from "./upscale.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

let spec;
if (opt("spec")) {
  spec = JSON.parse(readFileSync(resolve(opt("spec")), "utf8"));
} else if (opt("prompt")) {
  spec = { style: opt("style", ""), images: [{ name: opt("name", "image"), prompt: opt("prompt"), aspect: opt("aspect", "1:1") }] };
} else {
  console.error('Usage: node gen-image.mjs --spec images.json [--out dir] [--parallel 3]\n       node gen-image.mjs --prompt "..." --name hero [--aspect 16:9] [--style "..."] [--out dir]');
  process.exit(1);
}

const outDir = resolve(opt("out", join("public", "images")));
const parallel = Math.max(1, Number(opt("parallel", 3)));
const timeoutMs = Number(opt("timeout", 300)) * 1000;
mkdirSync(outDir, { recursive: true });

const codex = findCodex();
if (!codex) {
  console.error("Codex CLI not found. Run the plugin's setup check: node <plugin>/scripts/setup.mjs");
  process.exit(2);
}

const statusFile = join(outDir, ".status.json");
const status = Object.fromEntries(spec.images.map((im) => [im.name, { state: "pending" }]));
const saveStatus = () => {
  let others = {};
  try { others = JSON.parse(readFileSync(statusFile, "utf8")); } catch {}
  writeFileSync(statusFile, JSON.stringify({ ...others, ...status }, null, 2));
};
saveStatus();

const safeName = (n) => n.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "image";

function instructions(image) {
  if (image.edit) return [
    `Use your image generation tool to edit the attached image ${basename(image.edit)}, then save the result.`,
    "",
    "Keep everything in the picture the same (subject, characters, composition, colours, light and style) and change only this:",
    image.prompt,
    image.refs?.length ? `Other reference images are attached (${image.refs.map((r) => basename(r)).join(", ")}) for any detail the change names.` : "",
    `Aspect ratio: ${image.aspect ?? "1:1"}.`,
    "No text, letters, numbers, logos, watermarks, signatures or real brand names unless the change above asks for them.",
    "",
    "Save the image in the current folder as image.png. Do nothing else: don't create other files and don't run other commands.",
  ].join("\n");
  return [
    "Use your image generation tool to create exactly one image, then save it.",
    "",
    `Image: ${image.prompt}`,
    image.refs?.length ? `Reference images are attached (${image.refs.map((r) => basename(r)).join(", ")}). Where the description names one, reproduce that person's avatar, product or object faithfully (shape, colours, clothing, accessories), but leave out any logos or text on it.` : "",
    spec.style ? `Style (shared by every image on this website): ${spec.style}` : "",
    `Aspect ratio: ${image.aspect ?? "1:1"}.`,
    "Unless the image description above explicitly asks for it: no text, letters, numbers, logos, watermarks, signatures or real brand names in the image.",
    "",
    "Save the image in the current folder as image.png. Do nothing else: don't create other files and don't run other commands.",
  ].filter((l) => l !== null).join("\n");
}

// The image Codex saved for itself, when it didn't copy it into the work folder. Codex keeps
// each session's images in ~/.codex/generated_images/<session id>, and prints that id when it
// starts. Taking "the newest image since we started" from any session picked up another
// image's file when several generate at once (2026-10-11: van.png came back as the dusk photo,
// contact.png as the 404 art), so look only in this run's own session folder.
const claimed = new Set();
function sessionImage(sessionId, since) {
  if (!sessionId) return null;
  const dir = join(homedir(), ".codex", "generated_images", sessionId);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).map((f) => join(dir, f)).filter((p) => statSync(p).mtimeMs >= since && !claimed.has(p));
  return files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] ?? null;
}
const fingerprints = new Map(); // content hash -> image name, to catch a duplicate that slips through

function generate(image, attempt = 1) {
  return new Promise((done) => {
    const work = mkdtempSync(join(tmpdir(), "acquired-taste-img-"));
    const started = Date.now();
    status[image.name] = { state: "generating", started: new Date(started).toISOString() };
    saveStatus();

    // Reference images (a team member's real avatar, a real product) are attached with -i.
    // A refine pass attaches the picture being edited first.
    const refs = [image.edit, ...(image.refs ?? [])].filter(Boolean).map((r) => resolve(r)).filter((r) => existsSync(r));
    if (image.edit && !existsSync(resolve(image.edit))) {
      status[image.name] = { state: "failed", reason: `the image to edit is missing: ${image.edit}` };
      console.log(`failed: ${image.name}: the image to edit is missing: ${image.edit}`);
      saveStatus();
      rmSync(work, { recursive: true, force: true });
      return done();
    }
    const child = spawn(codex.command, [...codex.args, "exec", "--skip-git-repo-check", "--ephemeral",
      "--ignore-user-config", "-s", "workspace-write", "-C", work, ...refs.flatMap((r) => ["-i", r]), "-"], {
      cwd: work,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let log = "";
    let sessionId = null;
    const read = (d) => {
      log = (log + d).slice(-4000);
      sessionId ??= String(d).match(/session id:\s*([0-9a-f-]{36})/i)?.[1] ?? null;
    };
    child.stdout.on("data", read);
    child.stderr.on("data", read);
    child.stdin.end(instructions(image));
    const timer = setTimeout(() => child.kill(), timeoutMs);

    child.on("close", () => {
      clearTimeout(timer);
      const local = join(work, "image.png");
      const source = existsSync(local) ? local : sessionImage(sessionId, started);
      const target = join(outDir, `${safeName(image.name)}.png`);
      const hash = source ? createHash("sha256").update(readFileSync(source)).digest("hex") : null;
      const twin = hash && fingerprints.get(hash);
      if (twin && twin !== image.name) {
        // Identical to another image in this batch: a mix-up, never a real result.
        rmSync(work, { recursive: true, force: true });
        if (attempt < 2) {
          console.log(`retrying: ${image.name} came back identical to ${twin}`);
          generate(image, attempt + 1).then(done);
        } else {
          status[image.name] = { state: "failed", reason: `came back identical to ${twin} twice` };
          console.log(`failed: ${image.name}: came back identical to ${twin} twice`);
          saveStatus();
          done();
        }
        return;
      }
      if (source) {
        claimed.add(source);
        fingerprints.set(hash, image.name);
        copyFileSync(source, target);
        const wide = ["16:9", "21:9", "3:2"].includes(image.aspect ?? "1:1");
        let note = "";
        if (image.upscale ?? wide) {
          if (findUpscaler()) {
            const up = upscale(target);
            note = up.ok ? ", upscaled 2x" : `, ${up.reason}`;
          } else note = ", not upscaled (upscaler not installed)";
        }
        status[image.name] = { state: "done", path: target, seconds: Math.round((Date.now() - started) / 1000), upscaled: note === ", upscaled 2x" };
        console.log(`done: ${image.name} -> ${target} (${status[image.name].seconds}s${note})`);
      } else {
        const loggedOut = /refresh token|log in|logged out|401|unauthori|session has ended/i.test(log);
        const reason = loggedOut
          ? "ChatGPT ended the sign-in (expired or revoked, sometimes mid-run). The user must sign in again: codex logout, then codex login (choose Sign in with ChatGPT). Retrying before that fails the same way."
          : /rate limit|usage limit|quota/i.test(log)
            ? "ChatGPT image limit reached. Try again later or use placeholders."
            : `no image was produced. Last output: ${log.trim().split("\n").slice(-3).join(" | ").slice(0, 300)}`;
        // ChatGPT's own words, so the cause can be checked later without rerunning.
        const said = log.match(/"message":\s*"([^"]{1,200})"/)?.[1] ?? log.match(/ERROR:\s*(.{1,200})/)?.[1];
        status[image.name] = { state: "failed", reason, ...(said && { chatgpt: said.trim() }) };
        console.log(`failed: ${image.name}: ${reason}${said ? ` (ChatGPT said: "${said.trim()}")` : ""}`);
        if (loggedOut) signedOut = true;
      }
      saveStatus();
      rmSync(work, { recursive: true, force: true });
      done();
    });
  });
}

// Once ChatGPT has signed us out, every later request fails the same way: stop asking.
let signedOut = false;
const queue = [...spec.images];
await Promise.all(Array.from({ length: Math.min(parallel, queue.length) }, async () => {
  while (queue.length) {
    const image = queue.shift();
    if (signedOut) {
      status[image.name] = { state: "failed", reason: "not tried: ChatGPT had signed out. Generate it again after signing in." };
      console.log(`skipped: ${image.name}: ChatGPT had signed out`);
      saveStatus();
      continue;
    }
    await generate(image);
  }
}));

const failed = spec.images.filter((i) => status[i.name]?.state === "failed");
console.log(`${spec.images.length - failed.length} of ${spec.images.length} images generated. Status: ${statusFile}`);
if (signedOut) console.log(`ChatGPT signed out during this batch. Not made: ${failed.map((i) => i.name).join(", ")}. If the user is here, ask them to sign in again (codex logout, then codex login) and rerun a spec with just these; otherwise use clearly marked placeholders and list them in the hand-over.`);
process.exit(failed ? 1 : 0);
