# Type: choosing fonts for this brief

Left alone, the model reaches for the same few fonts (Archivo on 5 of 7 test sites, whatever the business). Choose fonts the way a designer would: from what the brief needs, by looking at real options set in the real headline.

PLUGIN means the plugin root, two folders above this skill's base directory.

## Order of priority

1. **Brand fonts win.** If the business has fonts (named in the brief, or files in `brand/`), use them (`craft/brand.md`). A user-supplied font file from anywhere (including DaFont) is fine once the user has checked its licence; check it has the characters the site needs (£ € é).
2. **Returning project:** keep the fonts in `.acquired-taste/design-system.md`.
3. **Otherwise, search.** Fit to the brief comes first. Variety only decides between fonts that fit equally well.

## Search

Turn the brief's look into what the type must do ("professional but cartoon / Roblox themed" → chunky, rounded, playful headlines; very readable body), then search for each role:

```bash
node "PLUGIN/scripts/fonts.mjs" search --tags playful,rounded --category display --fresh --not "<fonts memory says to avoid>"
node "PLUGIN/scripts/fonts.mjs" search --tags calm,competent --category sans --min-weights 3
```

- **Tags** are Google's own 0-100 personality scores. Useful ones: playful, happy, cute, childlike, calm, sincere, business, competent, rugged, stiff, loud, excited, active, futuristic, innovative, techno, vintage, fancy, artistic, wacky; and shapes: rounded, geometric, humanist, grotesque, neo grotesque, transitional, handwritten. Fontshare fonts carry their own tags.
- `--fresh` skips the 60 most popular Google fonts (the ones every site already uses). Use it for display faces; a very common body face is fine if it's the best reader.
- `--not` takes the fonts the memory summary says to avoid (the previous project's, and anything the user rejected).
- Sources are free for commercial use only: Google Fonts (open licences) and Fontshare (ITF Free Font License). Never use fonts from sites where licences vary per font (DaFont and similar) unless the user supplies the file.

## Compare, then choose

Shortlist **3-4 pairings** that all fit (from the search, plus fonts you know fit). Then set the real headline in each:

```bash
node "PLUGIN/scripts/fonts.mjs" specimen --headline "<the real headline>" --body "<a real paragraph>" --pair "Display A / Body A" --pair "Display B / Body B" --pair "..." --out .acquired-taste/fonts.png
```

**Apps and dashboards:** add `--ui` (and `--rows "Name;Detail;Status|..."` with real rows from the brief), so each pairing is shown as a real interface: page title, big numbers, buttons, a table with status pills. Include at least one pairing that is a single modern sans with no mono, and use mono only as an accent for codes and IDs. Pick what looks most current and readable in the interface, not in a headline.

Open the sheet. Check the headline's character, how the pairing reads together, the body at reading size, and the £ € é line for missing characters. **With a logo or a described wordmark, the headlines must look like they belong with it** (it doesn't have to be the same font: matching weight, width or attitude is enough). Put the logo beside the headline on the sheet in your head: if one is squeezed narrow and the other stretched wide, they'll clash on every page. A set-in-type wordmark stays readable at header size; never squeeze it until the letters crowd. Pick the best fit; if the memory's recently used font is genuinely the best, you may pick it, and say why. Show the sheet at the checkpoint with your pick marked; the user chooses.

**Bold display faces are welcome; make sure they still read small.** A characterful display face carries the big headlines. Wherever else it appears (prices, card titles, small headings, buttons, labels), it must read at a glance at phone size. Many expressive faces do; heavy, extended or decorative ones often turn shouty or hard to read at 14-20px (a run set every price in a heavy extended face, and the prices got harder to read). When it doesn't read well small, use the body face there and keep the display face for the moments it's made for. This is a readability check, not a limit on bold choices.

## Install

```bash
node "PLUGIN/scripts/fonts.mjs" install "Family" [--weights 400,700]
```

It prints the `next/font` code: Google fonts through `next/font/google` (self-hosted at build), Fontshare fonts downloaded to `public/fonts` and loaded with `next/font/local`. At most two families plus an optional mono.
