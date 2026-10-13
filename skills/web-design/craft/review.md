# Review: check it in a real browser

Never call a site finished from reading the code. Run it, check it with the script, look at it, fix it.

The plugin root is two folders above this skill's base directory (`<skill dir>/../..`). Below, `PLUGIN` means that path.

## 1. Start the site

**Pass 1 runs on the development server.** It reloads changes by itself, so fixing and re-checking never needs a rebuild:

```bash
node "PLUGIN/scripts/serve.mjs" start -- npm run dev
```

**The final pass runs once on the production build** (it catches build-only problems):

```bash
node "PLUGIN/scripts/serve.mjs" stop
npm run build
node "PLUGIN/scripts/serve.mjs" start -- npm run start
```

**Never substitute the development server for this pass.** Production builds minify and reorder CSS and can drop rules that worked in development: a redesign's detail panel was fine in dev and stuck half off-screen in production. If the project's own production server can't run locally (it needs hosting secrets, a platform runtime, or writes somewhere it shouldn't), build the front end and serve the built folder instead: Vite `npx vite preview --port {port}`, otherwise `node "PLUGIN/scripts/serve.mjs" start -- node "PLUGIN/scripts/static.mjs" <dist folder> --spa`. If no production build can be checked at all, say so in the hand-over as a check you couldn't run; never report it as passed.

`serve.mjs start` prints the local URL. It picks a free port, passes it as `PORT`, and runs the server hidden. For tools that need the port as an argument, write `{port}`, e.g. `-- npx vite preview --port {port}`. Stop it with `node "PLUGIN/scripts/serve.mjs" stop`. Never stop servers any other way.

Don't rebuild for small fixes during pass 1: save the file, wait a moment for the reload, and run the checks again.

## 2. Run the checks

```bash
node "PLUGIN/scripts/review.mjs" <url> [/other /routes] [--widths 390,768,1280,1440,1920]
```

It loads every route at each width (several at once), scrolls through, and prints **only the problems, one per line**:
- broken images and failed requests
- console errors
- horizontal overflow, with the element causing it
- buttons whose label wraps
- text below 12px
- images with no alt text
- images shown bigger than their real size (they look soft or pixelated)
- content still invisible after scrolling (an entrance animation that never fired, one that hides content again once scrolled past, text still slid under a reveal mask, or nearly see-through), including in a pass with reduced motion switched on. It's checked at the moment the full-page screenshot is taken, so a clean report means the screenshot shows it. Decorative watermark text should be `aria-hidden="true"`.
- text inside drawings and maps (SVG) at the size it's actually drawn: labels overlapping each other, labels cut off at the drawing's edge, captions under 12px (a map scaled down on phones often needs bigger labels or fewer of them there). Labels sitting on top of shapes are for your eye in step 4.

**Dark mode:** if the site has one, add `--dark` with the steps a visitor uses to switch it on (the same steps as `try.mjs`), e.g. `--dark "click:Dark mode"`, or `--dark system` when it only follows the device's setting. Every route is then also checked in dark at the narrowest width and 1440, with `-dark-` screenshots, and it confirms dark really switched on. Never write your own dark-mode capture script. If the switch sits in a phone menu, include opening the menu in the steps.

**Pages meant to be missing:** list them as `/nope=404`. That status is then expected, not a problem; any other status is reported.

It saves top-of-page and full-page screenshots to `.acquired-taste/review/` (you choose which to open, see step 4). **Fix in batches:** collect every reported problem first, then fix them together in as few edits as possible (one edit per file, not one per problem), then run it again until it's clean. **Re-check only what changed:** the first run checks every page at every width; after fixing, re-run with just the routes whose files you changed (`review.mjs <url> /settings /players`), still at every width. If a fix touched anything shared (the layout or app shell, navigation, global CSS or theme tokens, a component used on many pages), re-run every route. The final pass always checks every route at every width. Each separate step re-reads the whole conversation, so twenty one-line fixes cost far more than three grouped ones. 1920 is checked by default, because many desktop monitors are that wide and stretched images often only show there.

If it says Playwright is missing, run the install command it prints, once.

**Screens behind a login:** add `--login` with the sign-in steps (the same steps as `try.mjs` below, separated by `;`). It signs in once and checks every route signed in:

```bash
node "PLUGIN/scripts/review.mjs" <url> /dashboard /settings --login "goto:/login; fill:Email=test@example.com; fill:Password=${TEST_PASSWORD}; click:Sign in"
```

Use the test account from intake (SKILL.md step 2), never real credentials. `${NAME}` reads an environment variable, so the password stays out of the command and the report; in Bash, single-quote the steps so the shell leaves `${...}` for the script. If a value contains `;`, put one step per line in a file and pass its path. A route reported as "sent back to the login page" wasn't checked: fix the steps or the route, or list it in the hand-over as unchecked. Without a test account, review the pages you can reach and say which ones you couldn't. `try.mjs` takes the same `--login`, so journeys and before/after captures start signed in.

## 3. Check the main journey works

Walk through the one or two things a visitor must be able to do (book, add to basket, filter, submit a form) with the plugin's journey tool. **For app screens and redesigns, also walk every flow that ends on a screen you designed or changed** (after booking, after checkout, after saving a record, from a search result) and check what opens at the end, on the final production pass too. A screen can look right when opened directly and break when a flow opens it: a redesign's repair panel was fine from the list and stuck off-screen after booking.

**Never write your own browser or test script for journeys** (no Playwright files of your own). A real redesign wrote a 311-line script and then spent ~25 minutes fixing its own selectors, timing and leftover data. The journey tool already waits for each action to finish, picks the right one of several buttons and tidies up. If one check can't be said with its steps, use `js:` or `expect-js:` for that single step.

A website's journey or two, on the command line:

```bash
node "PLUGIN/scripts/try.mjs" <url> "goto:/tyres/ridgeback-45" "click:700c" "click:Add to basket" "expect:1 item"
```

**Apps (more than a couple of journeys): write them once in `.acquired-taste/journeys.txt`** and rerun that file on every pass:

```
login: goto:/login; fill:Email=test@example.com; fill:Password=${TEST_PASSWORD}; click:Sign in

== Add a place, then remove it
goto:/settings
fill:Place name=Test lobby {run}
click:Add place
expect:Test lobby {run}
click:Remove in "Test lobby {run}"
expect-gone:Test lobby {run}

== Rename the project, then put it back
goto:/settings
fill:Name=Renamed {run}
click:Save
expect:Renamed {run}
always:
goto:/settings
fill:Name=<the original name>
click:Save

== Wrong password shows an error [signed out]
== Menu opens a page [phone]
```

```bash
node "PLUGIN/scripts/try.mjs" <url> --journeys .acquired-taste/journeys.txt
```

- Steps: `goto:/path`, `click:Text`, `fill:Label=value`, `select:Label=Option`, `check:Label` (styled radios and checkboxes hidden behind a card are ticked by clicking their label), `press:Enter`, `expect:Text`, `expect-gone:Text`, `expect-url:/part`, `expect-value:Label=value`, `shot:name`. Pick one of several with `(2nd)`, `(last)` or `in "words in the same row"`. Every step waits for what it started to finish loading, so don't add `wait:` steps.
- **Leave the app as you found it:** give test records `{run}` (a tag unique to each run; `{num}` for number-only fields) and remove them in the journey; anything a journey changes (a name, a setting) is put back under `always:`, which runs even when the journey fails. Screenshots taken after a journey that forgot this show the wrong data.
- `[signed out]` and `[phone]` start a journey signed out or at phone width; if a journey signs out, the next one signs in again by itself. "Are you sure?" pop-ups are accepted.
- It prints one line per journey and a summary ("28 of 30 journeys passed"), with the failing step, the reason and a screenshot. **While fixing, rerun only what failed** (`--failed`, or `--only "name|name"`), never the whole file after each fix. **Run them all once more on the final pass**: that full run is never skipped.
- A failure that might be pre-existing (redesigns): run the same journey (`--only`) against the untouched original before investigating further.

Add `--mobile` to walk everything at phone width, and `--login "<steps>"` to start signed in (overrides the file's `login:` line). Run the journeys once in pass 1 and once on the final pass.

## 4. Look at it against the finish bar

**Judge motion from frames, never from a single still.** A still can't tell a drifting cloud from a layout bug, or a reveal mid-animation from broken content. For marketing pages, capture a flip-book once per pass and look at that one sheet:

```bash
node "PLUGIN/scripts/motion-frames.mjs" <url> [--route /] [--width 1440]
```

It shows the top of the page over ~3 seconds (entrance and ambient motion), the cursor moving over the hero (pointer effects) and a slow scroll through the page. Check that the planned signature moments actually happen, in order, and that nothing jumps, overlaps for long, or stays hidden.

**Look at whole pages in pass 1, not just at the end.** Open the full-page screenshot of each page at 1440, the **top of the home page at 1440** (`home-1440-top.png`: the hero at real size, where small text over a photo and labels spilling out of their box show up; the full-page shot is too small to judge them), and the home page at 390, in pass 1. Whole-page problems (a missing or placeholder image, a weak section, a repeated layout) must be found while the dev server can still take changes, not after the production build. Judge honestly, as a designer seeing it for the first time. Write down every gap worth fixing, fix them together, then do the final pass.

**Open a screenshot only when it can show you something new.** Every image you open stays in the conversation and is re-read on every later step, so screenshots are expensive. Open one when: you haven't seen that page yet, it changed visibly since you last looked, or the problem is visual and the script can't describe it in words. Within pass 1, don't re-open pages that were fine and haven't changed, and don't open a screenshot to confirm a fix the script already reports as clean. The final pass is the exception: it always gets one last full look (see step 5). If you need one, take it; just don't take it by habit.

**Every type, first:**
- Does it look like the style the brief asked for? Would the brief's author recognise it on the first screen?
- Does anything (images, illustrations, layout) look like another brand's signature look? If so, it's a bug, not a style choice: fix it.
- At phone size, can you read a price, a card title and a button at a glance? If the display face makes them shouty or hard to read, use the body face there (`craft/type.md`; bold faces stay where they read well).
- Rows and panels that scroll sideways or inside the page: no plain grey browser scrollbar (Windows shows arrows and a grey track). Style it to match the design, or hide it and keep a visible "scroll for more" cue.

**Marketing pages (landing, shop, local business):**
- Is there a signature visual above the fold, made for this brand? Not a mockup or an empty box.
- Look closely at the hero and the signature moment: does anything spill out of its box (a row of tiles, a label, a badge wider than its card)? The script only catches overflow that scrolls the page, not overflow inside a component.
- Were the concept sections from the design system actually built, each still recognisably part of the concept? If one became a generic section (a plain feature grid, a stock testimonial row), rebuild it as planned.
- Does the headline have personality, and does it pass the swap test (a competitor couldn't use it unchanged)? Does the type have its deliberate twist?
- Any big zeros or empty stats? Unreleased things show their status; live counts that can be zero have a friendly zero state.
- Is there purposeful motion: an entrance, one scroll moment, hover and press states? Check the code too, since screenshots can't show motion.
- Is there depth (layering, light, texture) that suits the concept?
- Are placeholders few and intentional, never dominating?
- Do any sections look like a default template or component kit? Are any layouts repeated?
- Spacing rhythm, alignment, one radius rule, one colour system?
- Small alive details: micro labels, states, a considered footer?

**Dashboards and app screens:**
- Can you answer "is anything wrong, and where?" in five seconds, at the intended viewing distance?
- Is there one clear focal point, and is hierarchy ranked by urgency?
- Are numbers tabular and aligned, with readable sizes?
- Are empty, loading, error and alert states designed?
- **The empty state, seen, not assumed:** open each screen once with no data (an empty project, a new account, a search with no results). It shows a friendly line and the next step ("Connect your game to see players here"), never rows of 0, — or NaN, and no sentence with a blank where a number should be ("— of sessions in this range"). It's often a new user's first screen, so it gets the same finish as the full one. A real redesign shipped a page of zeros and dashes because nobody opened it empty.
- Is it dense without clutter, with functional motion only?
- **The 2026 test:** next to `craft/product-references.png`, does it look as current and refined (soft corners, space instead of lines, real-sized controls, modern type)? Or older, plainer, more cramped?
- Does it look calm and precise, with colour only where it means something, and would someone *want* it open all day (modern, expensive, a clear signature moment)? Or like a default admin kit (heavy cards, rainbow charts, gradients), or merely correct?
- Were the normal and problem states (and stale, empty, loading) each loaded with `?state=` and seen? Is the 1920 screenshot still readable at half size?

## 5. Stop

Spend time where a visitor would notice it. Once the checks are clean, the main journey works and the finish bar is met, stop: list smaller polish ideas in the hand-over instead of chasing them.

Two passes: pass 1 on the dev server (checks, whole-page look, batched fixes, re-check until clean), then the final pass on the production build (checks, plus **one last full look**: the full-page screenshot of every page at 1440 and the home page at 390, judged against the finish bar. The final visual review is never skipped or shortened). Anything new you want to add (an image, a section) belongs in pass 1; after the production build, only fix real problems.

**Final pass order: find everything first, then fix once.** Run the checks, the journeys and the motion sheet, and do the full look (including the top of the home page at 1440), all *before* changing any code. Then fix everything you found together, rebuild once and run the checks again, re-opening only the screens you changed. Fixing each problem as you find it means a rebuild per problem: a shop run rebuilt three times this way. If the re-check finds something new, fixing it and rebuilding again is fine; never leave a real problem to save a rebuild. Then write the hand-over, including the final review result, and stop the server unless you'll open the site in a browser panel beside the chat (SKILL.md, hand-over).
