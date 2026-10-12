#!/usr/bin/env node
// Creates the project's .acquired-taste working folder and keeps it out of git (listed in
// .git/info/exclude, so the project's own files are unchanged). Run it before writing
// anything there, especially a test account's password. The review, journey and server
// scripts do the same when they create the folder.
//
//   node workdir.mjs [project-dir]

import { workDir } from "./lib/workdir.mjs";

const { dir, excluded } = workDir(process.argv[2] ?? ".");
if (excluded === "already") console.log(`${dir} is ready and already kept out of git.`);
else if (excluded === "project") console.log(`${dir} is ready; the project's own .gitignore decides what in it is kept (check a test password file would be ignored).`);
else if (!excluded) console.log(`${dir} is ready (not a git project, so nothing to keep it out of).`);
