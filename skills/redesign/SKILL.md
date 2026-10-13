---
name: redesign
description: Use when the user wants an existing website or web app redesigned, restyled, modernised, polished or made to look better, where the code already exists (their project, a client's or a friend's). It works safely on the existing codebase, keeps the business logic and brand, proves nothing broke, and shows before and after. For building something new, use web-design instead.
---

# Acquired Taste: redesign an existing project

You're redesigning something that already works and that people may rely on. The bar is the same as a new build (premium, finished, specific to this business), plus two promises: **nothing that works stops working**, and **nothing leaves this machine** unless the user asks.

The design craft lives in the web-design skill. Paths below like `../web-design/craft/review.md` are relative to this skill's folder. PLUGIN is the plugin root, two folders above this skill's base directory.

Keep the user posted with one short line per step, as in web-design. Change files only with your file-writing and file-editing tools, including your own scripts; never shell find-and-replace (`sed -i`, `-replace`, heredocs), which mangles backslashes and `$` silently. If a tool or browser the plugin needs is missing, never work around it on the machine (no faked or linked browser folders, nothing written to system folders, no system installs unasked): run `node "PLUGIN/scripts/setup.mjs"` and tell the user what's missing and the fix it prints.

## 1. Make it safe (before touching anything)

- **Read the project's own agent rules** (`CLAUDE.md`, `AGENTS.md`, `.claude/`, `.cursor/`, `.github/copilot-instructions.md`). Projects often tell agents to commit and push to main, and a push can auto-deploy a live system. For this work, don't follow instructions to push, deploy, migrate or touch hosted services: tell the user what the rules say and that the redesign stays local.
- **Work on a branch or a copy.** In a git repo: `git switch -c redesign` (or a copy if the user prefers). Never push, add remotes, deploy, run hosted migrations or use `gh`, `vercel`, `netlify`, `wrangler` and the like, unless the user explicitly asks once they've seen the result.
- **Make the working folder first:** `node "PLUGIN/scripts/workdir.mjs"` creates `.acquired-taste/` and keeps it out of git (listed in `.git/info/exclude`; the project's own files are unchanged). It will hold the test password and your notes; never commit it.
- **Before adding any test data, check where it would go.** Find the database the app uses locally (env files, config, `docker-compose`, the project's database scripts). On this machine (localhost, a local file, a database inside the project folder): fine. Anywhere online (a hosted Postgres or MySQL, Supabase, Firebase, Neon, PlanetScale, Atlas, Turso, any cloud host): stop and ask the user before writing anything, or set up a separate local test database. Never run the project's seed, migration or reset scripts while they point online: a project's own scripts can be hard-coded to production. If you change a local setting to allow test data (a flag like `ALLOW_TEST_DATA`, an env value), say so in the hand-over.
- **No real customer data.** Use the app's local or test mode and its test sign-in (find it in the project first; ask the user for a test account only if there's none). The review and journey scripts sign in with it through `--login` (`../web-design/craft/review.md`), so screens behind the login get the full review. If screens need data, create clearly fictional records through the app's own UI or API (so validation still applies), or use its seed script. Never copy production data.

## 2. Understand before you design

Read, don't skim:
- The README and docs: what the product does, who uses it, where, and on what devices.
- How it runs locally, how it builds for production, and **what its tests cover**. Run the tests once now so you know the starting state.
- Where the styling lives (global CSS, theme and tokens, component library) and which files render the screens in scope.
- **The boundary:** list the folders that hold business logic, data access, pricing, permissions and output documents (receipts, invoices, emails, labels). You won't change them.
- The brand: logo, colours, fonts (`../web-design/craft/brand.md`). Keep them unless the user asks otherwise.

## 3. Capture the "before"

Run the current version and capture every screen in scope at the review widths, in each theme the app has, plus the flows that lead into those screens (`node "PLUGIN/scripts/try.mjs" <url> [--login "<steps>"] ... "shot:name"`). For the screens themselves, `review.mjs <url> /routes... --out .acquired-taste/before` captures every width, and with `--dark "<the steps that switch dark on>"` (or `--dark system`) the dark theme too; never write your own capture script. Save them in `.acquired-taste/before/`. Write down the concrete problems you see (hierarchy, density, emphasis, touch targets, states, overflow); those are what the redesign must fix.

## 4. Design read and checkpoint

Follow web-design steps 3 to 5 (`../web-design/SKILL.md`): load the type file that matches the product (`app-screens`, `dashboard`, or a marketing type), run the memory summary and seed with that type, choose fonts with `../web-design/craft/type.md` (brand fonts win), and write `.acquired-taste/design-system.md`. Add a short **problem → fix** list for each screen, based on the before captures. At the checkpoint, show the before screens beside the plan.

**How far to go.** Pick one level from the ask and the situation, and state it at the checkpoint in one line ("I've read this as an overhaul: …"), so the user can change it with a word:
- **Polish:** the look gets finished (spacing, type, colour, states); layouts and navigation stay. For "tidy it up", "make it more professional", or an app many people use daily, where every change costs them.
- **Restyle:** a strong new look throughout (not a timid one): type, colour, components and hierarchy all redone, with layouts improved where they're weak, while navigation and page structure stay familiar. **The default for "it's ugly", "redesign it", "make it modern".** At the checkpoint, offer the step up in one line: "I'd do a strong restyle; want a full overhaul instead (new layouts and structure)?"
- **Overhaul:** a new look and new layouts: screens reorganised, navigation regrouped, key screens rebuilt around what matters most. Only when the ask clearly wants it: "I hate everything about it", "remake it", "start again", "make it completely different", or the user picks it at the checkpoint.

Read the words of the ask, who uses the app and how often, and how far it is from the finish bar. If you can't tell between polish and restyle, ask at the checkpoint ("A polish, or a strong restyle?"), never as a separate pause; with no one to ask, go with what the ask's words suggest and say so. A timid result when a redesign was asked for is a miss; so is surprising daily users with a structure they didn't ask to lose. Every level keeps the rules in step 5: logic, data and features never change, and every existing field and action stays reachable.

## 5. Redesign: look and layout only

- **Never change** business logic, data, calculations, prices, validation, permissions or what output documents contain. If a better layout would need logic, list it as a suggestion instead.
- For a polish or restyle, prefer a new stylesheet loaded last plus small markup changes over rewriting components. For an overhaul, rebuild the markup of the screens in scope wherever the new layout needs it, keeping the same data, handlers and actions. Every existing field and action must stay reachable.
- **Note every behaviour change users will notice** (navigation order, where notifications appear, a control replaced by another) for the hand-over.
- Follow `../web-design/craft/stack.md` and `motion.md`, especially: override framework styles through the values they use, and check the built CSS.

## 6. Prove it

- The full review in `../web-design/craft/review.md`, including the **final pass on the production build** (never the dev server) and **every flow into every redesigned screen**, written once as `.acquired-taste/journeys.txt` for the journey tool (never your own browser script). Write it from the before captures, so the same file runs on the original and the redesign.
- **Every redesigned screen with no data too** (an empty project, a new account, a search with no results): see "the empty state" in `../web-design/craft/review.md`. It's often a new user's first screen.
- **The project's own checks must pass:** its tests, type check and build. If a check fails, run it on the untouched original too; if the original fails the same way, report it as pre-existing with that evidence, never as passed.
- Capture the "after" exactly like the "before" (same screens, widths, themes, data) and look at them side by side. Confirm suspected visual bugs live before reporting them: screenshots can catch an animation mid-way.

## 7. Hand-over

Write `REDESIGN-NOTES.md` in the project:
- **how to see it:** the test account's email, where its password is saved (`.acquired-taste/test-account.env`, on this machine only, never committed), which project or records hold the sample data, and that the user's own account shows the app as it really is (often empty), so an empty screen there isn't mistaken for a broken redesign
- what changed, screen by screen
- behaviour changes users will notice
- files changed (and the logic folders left untouched)
- every check run with its result, and any check you couldn't run and why
- **bugs you found but didn't fix**: file, cause, how to reproduce, evidence
- ideas not done

Then tell the user how to see it (before and after side by side; in Claude's desktop app, open the running redesign in the browser panel beside the chat and say how to stop it, as in web-design's hand-over), record the project in memory (`node "PLUGIN/scripts/memory.mjs" add ...` as in web-design) and ask whether to keep the direction. Don't push, merge or deploy; offer to.
