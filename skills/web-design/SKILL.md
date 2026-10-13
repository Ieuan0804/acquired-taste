---
name: web-design
description: Use whenever you build, design, redesign, restyle or extend any website or web UI, including landing pages, marketing sites, online shops and product pages, web app screens, dashboards and admin panels, and sites for local businesses. Use it before writing any page, layout or UI code, even for a "quick" site or a single page. It makes the result premium, original and finished, and checks it in a real browser.
---

# Acquired Taste: web design

You are building a website someone would be proud to launch. Plain Opus already gets the basics right (sensible palettes, real copy, working mobile layouts). What it misses is **finish**: a signature visual made for the brand, type with character, purposeful motion and depth, real images, small alive details, and no rough edges. Two runs of the same brief also tend to come out nearly identical. This skill exists to close those gaps.

Work through the steps in order. Files mentioned are relative to this skill's folder; scripts are in the plugin's `scripts/` folder (two levels up from this file).

**Change files only with your file-writing and file-editing tools**: any file, including your own notes and scripts, quick one-off fixes and the same change across many files (edit each one). Never use shell find-and-replace, heredocs or a script that edits files (`sed -i`, PowerShell `-replace`, `cat > file <<EOF`, inline Python or Node): backslashes, `$` and backticks get mangled silently, and a script edit can do nothing without saying so (a real run lost time this way). If an edit fails, retry with the file-editing tool, never with a script.

**If a tool or browser the plugin needs is missing or won't start, never work around it on the machine.** Don't fake, move or link browser folders, don't write to system folders (`/opt`, `/usr`, `C:\Program Files` and the like), and don't install system packages unasked. Run the setup check (`node scripts/setup.mjs`), then tell the user plainly what's missing and the fix it prints. Without a working browser, build the site anyway and say clearly in the hand-over that the browser checks didn't run.

**Keep the user posted.** A build takes a while, and silence feels broken. Post one short line when you start each step and before anything slow (installs, builds, image generation, review passes), saying what's happening and roughly how long. Report review results as they come in ("Review pass 1: 3 problems, mobile overflow in the pricing section and 2 broken images, fixing them"). Keep it to a line or two; save the detail for the hand-over.

## 1. Existing project?

Look for `.acquired-taste/design-system.md` in the project. If it exists, this is a returning project: read it, keep the brand (colours, type, radius, motion feel, logo), extend the existing codebase in its own framework, and only add what's asked. Skip to step 3 for the new parts.

## 2. Intake

Read the whole brief first. People often include everything already, especially briefs written with another AI.

- Look for anything the user supplied: a `brand/` folder or attached logo, colour or font files, and reference sites or screenshots they like.
- List what's actually missing that you'd need to do this well: real business name, offer and prices, audience, what visitors must do (book, buy, sign up), location and hours, existing logo, colours or fonts, real testimonials or numbers. If they haven't mentioned sites they like, you can ask once whether they have any (optional, never required).
- **Screens behind a login** (an existing app, or one you build with sign-in): find a test account yourself first, in the project's seed or fixture files, README, `.env.example` or test setup, or a local test sign-up you create in the app's own test mode. Only if there's none, add one question: a **test** account for local use (never their real password for anything), with the password kept in an environment variable (e.g. `TEST_PASSWORD`) rather than typed into chat. The review then signs in with it (`craft/review.md`).
- Ask only for those, in one short message (at most 4 questions). If nothing important is missing, ask nothing.
- If no one can answer (non-interactive run, or the user says "just build it"), make sensible choices, keep going, and list every assumption in the hand-over.

## 3. Load what this brief needs

Classify the request into one or more site types and read **each** matching file before designing:

| Type | Read |
|---|---|
| Landing page, marketing site, product launch | `types/landing.md` |
| Online shop, category or product pages | `types/ecommerce.md` |
| Web app screens, flows, settings, onboarding | `types/app-screens.md` |
| Dashboard, admin panel, monitoring, analytics | `types/dashboard.md` |
| Local business: barber, café, salon, trades, gym, restaurant | `types/local-business.md` |

A mixed brief loads several (a landing page with a staff dashboard loads `landing.md` and `dashboard.md`).

Read these when they apply:
- `craft/brand.md` whenever the business has an existing logo, brand colours or fonts.
- `craft/references.md` whenever the user shares sites or screenshots they like.
- `craft/charts.md` before drawing any chart, sparkline or map (always for dashboards and app screens with data).

Always read these craft files too:
- `craft/honesty.md` before writing any copy, testimonial, number or logo.
- `craft/images.md` before placing any image or hero visual.
- `craft/motion.md` before adding any animation, hover effect, scroll effect or depth.
- `craft/type.md` before choosing fonts.
- `craft/stack.md` before creating the project.
- `craft/review.md` before you call anything finished.

## 4. Design read and design system

First, two quick commands (a second each), so this site doesn't repeat earlier ones:

```bash
node "PLUGIN/scripts/memory.mjs" summary --type <site type>
node "PLUGIN/scripts/seed.mjs" --type <site type>
```

The **memory summary** lists what recent projects used (fonts, concepts, heroes) and what the user kept or rejected: avoid repeating them when something else fits as well, never reuse the previous project's fonts or concept unless the brief clearly needs them, and lean towards what the user kept. The **seed** gives real random starting picks (hero composition, type direction and scale, colour, rhythm, motion, radius): start from each one, and change it only when it fights the brief, saying why. Both skip for a returning project. PLUGIN is the plugin root, two folders above this skill's base directory.

Then decide the direction and write it down in `.acquired-taste/design-system.md`, including the seed line and any picks you changed:

- **One-line read:** who this is for and how it should feel ("Cardiff barbers: confident, crafted, a bit of swagger, not a moody template").
- **Concept spine:** one idea the whole site hangs on (a metaphor, material or motif from the business itself). In apps and dashboards it lives in one signature component; the rest follows the modern product baseline (`types/dashboard.md`).
- **Signature moment:** the one thing a visitor will remember (a hero visual, an interaction, a scroll moment). Dashboards: one beautiful thing that is also the most useful (a live map, a status board, the big numbers), never a gimmick.
- **Concept sections (marketing types):** 3-4 sections below the hero that carry the concept spine into the page, so the idea doesn't stop at the hero. For each, one line on what it shows and why it belongs to this business, usually a real feature or offer told through the concept. Example for an invoicing app built on the carbon-copy invoice pad: "a working quote demo drawn on the pad", "a live invoice card that chases a late payer", "VAT that adds itself up as receipts land". Images and motion serve these sections; they never replace them.
- **Type:** chosen with `craft/type.md` (search for this brief, compare 3-4 pairings set in the real headline, then install): a pairing with a reason, plus one deliberate twist (an italic serif accent word, a mono label system, an unusually large scale). Free-for-commercial fonts only.
- **Colour:** a palette with roles (background, surface, text, accent, status) and why it fits. Respect any brand colours given.
- **Shape and motion feel:** one corner-radius rule, one motion character (snappy, calm, mechanical, playful) and its intensity for this type, the 2-3 signature moments and how they're choreographed (marketing types), and the depth tier (see `craft/motion.md`).
- **Image plan:** which slots get generated images, code-built visuals or labelled photo placeholders, plus the one style line every image shares, and the hero recipe's ingredients and 3 hero candidates (see `craft/images.md`). Start generating as soon as this is written.
- **What to avoid for this brief:** the template this type usually falls into (a dark moody barber site, the standard SaaS section order, a row of KPI cards).

Make choices that are specific to this business. If the obvious choice is the one every similar site makes, choose differently and say why.

**The brief's stated style always wins.** If the brief names a look ("cartoon, Roblox themed", "clean and Scandinavian"), the concept spine, images and type must work inside that look. A clever concept may never replace it. Check: would the person who wrote the brief recognise the style they asked for in the first screen?

**Never borrow another brand's signature look**, in images or in the design: LEGO bricks and minifigures, Minecraft voxels, Pixar-style characters, Apple product shots, a well-known site's layout. It reads as a knock-off, it's a trademark risk, and it hides the client's own identity. If a concept needs that look to work, choose a different concept.

## 5. Checkpoint

Show the user the one-line read, the concept spine, the signature moment, the concept sections, your type and colour picks with one line of reasoning each, and the font sheet (`.acquired-taste/fonts.png`) with your pick marked. If image generation is available, show the 3 hero candidates from the hero recipe too (`craft/images.md`; started in the background as soon as the design read was written), with your pick marked. Then stop and wait for "go" or changes. One pause, not several.

Skip the pause when the user has said to just build it, or when no one can reply. Use your picks and log them.

## 6. Build

Follow `craft/stack.md`. If the image plan uses generated images, they are already generating in the background (`craft/images.md`); build while they run and never wait on them. Build the real thing with real content from the brief. Every section should earn its place: no filler sections, no generic component-kit look, and no section layout repeated more than twice in a row.

## 7. Review and fix

Follow `craft/review.md`: start the site with the plugin's server script, run the review script, fix every issue it reports, then look at the screenshots it saves and compare them honestly against the finish bar. At most two review passes; polish mode always runs both.

## 8. Hand-over

Tell the user:
- what you built and how to run it (also write `HOW-TO-RUN.md`)
- every assumption you made and anything they must replace or fill in (placeholder images, draft quotes, every marked gap for a fact the brief didn't give)
- what the review checked and the final result, including any screens it couldn't check because they need a sign-in you didn't have
- **show it:** if you can open a browser panel beside the chat (Claude's desktop app has a preview tool that opens a URL), leave the finished production site running and open it there, and say it's running and how to stop it (`node "PLUGIN/scripts/serve.mjs" stop`). Always give its plain link too (`http://localhost:<port>`), and say "if the browser panel is closed, click the globe icon at the top right": the panel can be hidden even when the page loaded in it. In a terminal-only or headless session, stop the server as usual.
- then ask: "Keep this direction (fonts, palette, layout)?" and note their answer in `.acquired-taste/decisions.md`

**Remember it.** Write `.acquired-taste/memory.json` (`{"project", "type", "fonts": [...], "palette": {...}, "concept", "hero", "seed": {...}}`) and run `node "PLUGIN/scripts/memory.mjs" add .acquired-taste/memory.json`. When the user answers, record each verdict: `node "PLUGIN/scripts/memory.mjs" verdict --project <name> --keep|--reject --what "fonts: X + Y" --reason "<their words>"` (one per thing they comment on). If no one can answer, record the project only. If the summary said it's time to condense, rewrite the rules file it named.

## Modes

- **Polish (default):** every step, both review passes.
- **Quick draft:** only when the user asks. Skip the checkpoint and the second review pass, and say that it's a draft.
