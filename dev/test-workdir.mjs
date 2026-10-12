#!/usr/bin/env node
// Tests that the plugin's working folder (.acquired-taste, which can hold a test password)
// is kept out of git without touching the project's own files: in a normal repo, in a git
// worktree, outside git, and when the journey tool creates the folder itself.
//
//   node dev/test-workdir.mjs

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const PLUGIN = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const work = mkdtempSync(join(tmpdir(), "acquired-taste-workdir-"));
const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8" });
const node = (cwd, script, ...a) => spawnSync(process.execPath, [join(PLUGIN, "scripts", script), ...a], { cwd, encoding: "utf8", windowsHide: true });

let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n${detail}`}`); if (!ok) failed++; };

// A normal repo with its own .gitignore, which must stay untouched.
const repo = join(work, "app");
mkdirSync(repo);
git(repo, "init", "-q");
writeFileSync(join(repo, ".gitignore"), "node_modules\n");
writeFileSync(join(repo, "index.html"), "<h1>Hi</h1>");
let r = node(repo, "workdir.mjs");
writeFileSync(join(repo, ".acquired-taste", "test-account.env"), "TEST_PASSWORD=secret\n");
const status = git(repo, "status", "--porcelain", "--untracked-files=all");
check("normal repo: the folder is listed in .git/info/exclude and git ignores its files",
  /Kept \.acquired-taste\/ out of git/.test(r.stdout) && readFileSync(join(repo, ".git", "info", "exclude"), "utf8").includes("/.acquired-taste/") && !status.includes(".acquired-taste"), r.stdout + status);
check("the project's own .gitignore is untouched", readFileSync(join(repo, ".gitignore"), "utf8") === "node_modules\n");
r = node(repo, "workdir.mjs");
check("running it again adds nothing", /already kept out of git/.test(r.stdout) && readFileSync(join(repo, ".git", "info", "exclude"), "utf8").split("/.acquired-taste/").length === 2, r.stdout);

// A git worktree: .git is a file; the exclude list lives in the main repo's git folder.
git(repo, "add", "-A");
git(repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init");
rmSync(join(repo, ".git", "info", "exclude"));
const tree = join(work, "tree");
git(repo, "worktree", "add", "-q", tree);
r = node(tree, "workdir.mjs");
writeFileSync(join(tree, ".acquired-taste", "notes.md"), "x");
check("worktree: kept out of git there too", /Kept/.test(r.stdout) && !git(tree, "status", "--porcelain", "--untracked-files=all").includes(".acquired-taste"), r.stdout + r.stderr);

// Not a git project: just creates the folder.
const plain = join(work, "plain");
mkdirSync(plain);
r = node(plain, "workdir.mjs");
check("outside git: creates the folder and says there's nothing to exclude", existsSync(join(plain, ".acquired-taste")) && /not a git project/.test(r.stdout), r.stdout);

// A project built by the plugin: its own .gitignore (from the starter) decides; the design
// notes stay committable for later visits, the password file doesn't.
const built = join(work, "built");
mkdirSync(built);
git(built, "init", "-q");
writeFileSync(join(built, ".gitignore"), readFileSync(join(PLUGIN, "templates", "next", "gitignore.txt"), "utf8"));
r = node(built, "workdir.mjs");
writeFileSync(join(built, ".acquired-taste", "design-system.md"), "# Design");
writeFileSync(join(built, ".acquired-taste", "test-account.env"), "TEST_PASSWORD=secret\n");
const builtStatus = git(built, "status", "--porcelain", "--untracked-files=all");
check("plugin-built project: its .gitignore decides (design notes kept, password file ignored)",
  /own \.gitignore decides/.test(r.stdout) && builtStatus.includes("design-system.md") && !builtStatus.includes("test-account.env")
  && (!existsSync(join(built, ".git", "info", "exclude")) || !readFileSync(join(built, ".git", "info", "exclude"), "utf8").includes("acquired-taste")), r.stdout + builtStatus);

// The journey tool creates the folder itself in a fresh repo (no server needed).
const fresh = join(work, "fresh");
mkdirSync(fresh);
git(fresh, "init", "-q");
r = node(fresh, "try.mjs", "about:blank", "expect-js:true");
check("try.mjs keeps the folder out of git when it creates it", /Journey works/.test(r.stdout) && /Kept/.test(r.stdout) && !git(fresh, "status", "--porcelain", "--untracked-files=all").includes(".acquired-taste"), r.stdout + r.stderr);

git(repo, "worktree", "remove", "--force", tree);
rmSync(work, { recursive: true, force: true });
console.log(failed ? `${failed} failed` : "All working-folder tests passed.");
process.exit(failed ? 1 : 0);
