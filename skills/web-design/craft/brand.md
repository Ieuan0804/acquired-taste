# The business's own brand

When a business already has a logo, colours or fonts, the site is built **around** them. Their brand is fixed; your job is to make it look its best.

PLUGIN below means the plugin root, two folders above this skill's base directory.

## Gather it

- Ask for brand files in intake if the brief mentions a logo or brand but none are attached. Ask the user to put them in a `brand/` folder in the project, or to give you the file paths: logo (SVG is best), any square mark or monogram, brand guidelines, colour codes, font files or names.
- Inspect them: `node "PLUGIN/scripts/brand.mjs" brand`. It reports each image's format, size, transparency, the colours actually in it, and whether it reads on light and dark backgrounds. Read any notes or guideline files in the folder too.

## Use it

- **The logo file is used as it is.** Never redraw it, retype it, recolour it, crop into it, or generate a "version" of it with AI. If it needs a light version for dark backgrounds and none was supplied, use a light backdrop behind it, or ask for one. Note it in the hand-over.
- **Brand colours are fixed points.** Use the exact hex values (from the user, or from `brand.mjs`). Build the rest of the palette around them: neutrals, surfaces, status colours. Check text contrast whenever brand colours sit behind or under text.
- **Brand fonts:** use supplied font files (self-host them in `public/fonts`) or the named fonts if they're free to use. If a named font needs a licence you can't confirm, use the closest free alternative and say so.
- **Favicons from the real logo:** prefer a square mark or monogram. `node "PLUGIN/scripts/brand.mjs" brand --favicon <mark-file> --out app` writes `app/icon.png` and `app/apple-icon.png`. If there's only a wide wordmark, the favicon will be tiny, so tell the user a square mark would work better.
- **Signature visual and images** take their cue from the brand: its colours in the image style line, its shapes and personality in the concept spine. Never put the logo inside generated images.

## No brand yet

If the business has no logo, don't invent one that looks official. Set the name in the site's display type as a clean wordmark, and suggest in the hand-over that they get a proper logo designed.
