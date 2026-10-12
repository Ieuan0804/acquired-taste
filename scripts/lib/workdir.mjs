// The plugin's working folder in a project (.acquired-taste: screenshots, notes, journeys,
// and sometimes a test account's password). Creating it also keeps it out of the project's
// git history without touching the project's own files: it's listed in .git/info/exclude,
// git's private ignore list on this machine, so it can't be committed or pushed by mistake.

import { existsSync, readFileSync, appendFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

// Returns { dir, excluded }: excluded is "added" (listed just now), "already", "project"
// (the project's .gitignore handles it), "failed" (git's folder couldn't be written; said
// so) or "" (not in a git project).
export function workDir(projectDir = ".") {
  const dir = resolve(projectDir, ".acquired-taste");
  mkdirSync(dir, { recursive: true });
  let excluded = "";
  try { excluded = exclude(dir); } catch {
    excluded = "failed";
    console.log("Couldn't list .acquired-taste/ in .git/info/exclude: keep it out of every commit by hand (it can hold a test password).");
  }
  if (excluded === "added") console.log("Kept .acquired-taste/ out of git (listed in .git/info/exclude; the project's own files are unchanged).");
  return { dir, excluded };
}

function exclude(dir) {
  let root = dirname(dir);
  while (!existsSync(join(root, ".git"))) {
    const up = dirname(root);
    if (up === root) return "";
    root = up;
  }
  let gitDir = join(root, ".git");
  if (statSync(gitDir).isFile()) {
    // A worktree or submodule: .git is a file pointing at the real git folder.
    gitDir = resolve(root, /gitdir:\s*(.+)/.exec(readFileSync(gitDir, "utf8"))[1].trim());
    const common = join(gitDir, "commondir");
    if (existsSync(common)) gitDir = resolve(gitDir, readFileSync(common, "utf8").trim());
  }
  // A project whose own .gitignore already mentions the folder decides for itself (the
  // plugin's starter keeps design-system.md for later visits and ignores the rest).
  const own = join(root, ".gitignore");
  if (existsSync(own) && readFileSync(own, "utf8").includes(".acquired-taste")) return "project";
  const line = "/" + relative(root, dir).split(sep).join("/") + "/";
  const file = join(gitDir, "info", "exclude");
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  const listed = new Set([line, line.slice(1), line.slice(0, -1), ".acquired-taste/", ".acquired-taste", "/.acquired-taste"]);
  if (text.split(/\r?\n/).some((l) => listed.has(l.trim()))) return "already";
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${text && !text.endsWith("\n") ? "\n" : ""}# Acquired Taste working files (screenshots, notes, test account)\n${line}\n`);
  return "added";
}
