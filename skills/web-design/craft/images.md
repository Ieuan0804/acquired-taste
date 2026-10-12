# Images and the signature visual

Missing or wrong images were the biggest reason AI-built sites looked unfinished in testing: empty grey boxes everywhere, or random stock photos (a pug illustrating bike wheels). Treat imagery as design, not decoration.

PLUGIN below means the plugin root, two folders above this skill's base directory.

## Never

- **Random photo services:** Picsum, `source.unsplash.com` keywords, random placeholder APIs. Their seeds and keywords don't match meaning.
- **Hotlinked stock** you haven't seen.
- **Generic phone or laptop mockups as the hero.**
- **Generated images of real people, real brands, logos or readable text.** Generators get these wrong, and they mislead. The one exception is the business's own team, from a real reference picture and with their OK (recipe step 4). A business's own team, premises and products need real photos from the business.
- **Another brand's signature look:** toy bricks and minifigures (LEGO), voxel blocks (Minecraft), Pixar-style 3D characters and similar. Don't name these brands or their trademark features in prompts, and steer away from them when a subject drifts that way (for "built brick by brick", show the craft, not plastic toy bricks).
- **A style other than the one the brief asked for.** The style line starts from the brief's stated look, not from the concept.

## Plan the images in the design read

Decide which slots need imagery and what kind, and keep the set small and strong:
- a landing page: a hero plus 2-5 others
- a local business: a hero plus 3-6
- a shop: category and product imagery
- dashboards and app screens: usually none

Write **one style line** shared by every image on the site: medium (documentary photo, studio product shot, cut-paper illustration…), light, palette with hex codes from the design system, mood, texture and lens. It's what makes the set feel art-directed rather than collected.

## The hero recipe: make it theirs

A familiar idea filled with the business's own details is unique; filled with generic details it's AI filler. Image generators have stock answers: floating islands and sky dioramas (anything "games", "worlds" or "magic"), isometric toy towns, glowing crystals and portals, abstract 3D blobs, neon cyber cities, robot or astronaut mascots, a laptop on a desk, a handshake. People spot them instantly (a studio founder on a floating-island hero: "AI always makes those… always the same"). None of them is banned and ambition is never capped: what makes a hero unique is specificity. In the design read (a few lines in the design system, not an essay):

1. **Ingredients:** list 8-12 things only this business has: its products, games or dishes by name, its people, place, tools, customers, rituals, history, in-jokes.
2. **Story ideas:** write 4-6 one-sentence heroes built from those ingredients, across different kinds (a moment, a character, a place, an object, a metaphor, type-led). Keep 3, and check each against the **swap test** before anything is generated: could a competitor use this picture unchanged? If yes (an empty barber chair, a laptop on a desk), replace it with another idea from your list. Never spend a candidate slot on the stock picture.
3. **Art-direct each:** brand hexes, light, lens, and a composition spec (where the subject sits, where the text goes and that area kept empty). Describe what's there, not how impressive it is: no "epic, magical, cinematic, glowing, vibrant, futuristic", which pull every image towards the same look.
4. **Real references:** attach the real thing with `refs` wherever it exists (the team's avatars, real products, real game thumbnails, the premises). Real people only for the business's own team, and only with their OK. Logos, names and lettering are added in code, never generated.
5. **Generate the 3 as candidates**, pick the winner on the contact sheet by asking, in order: does it carry the concept? does it leave room for the headline? would it only make sense for this business? On a close call, go with your pick and name the runner-up in the hand-over with its one-line swap ("Prefer B? Use `hero-b.png` in the hero"); never add a pause for it. Then **refine the winner with a second pass** (`"edit"`, below) to fix what's off: a composition rule it ignored, a stray logo, a wrong detail. Keep the first version if the refine isn't better.
6. **Build the hero in layers:** the image is one layer; the real headline, live data (player counts, opening hours, the next slot), code-built shapes and motion go on top. For parallax, a subject generated on a plain backdrop can be a separate layer.
7. **Remember it:** put the winning story's kind, story and composition in the memory record's `hero` field (`"moment: team piling out of the minibus; full-bleed, text left"`), so the next project of this type tries a different kind.

Example, a two-person Roblox studio: ingredients include its two real games and the founders' avatars; the default "fantasy floating islands" becomes islands made from scenes of *its* games with the founders' real avatars crossing a bridge between them (an islands hero, but only theirs). Example, a minibus hire company: not a van on an open road, but a muddy Sunday-league team piling out of the minibus at a rainy village pitch.

## Generating images (when available)

The plugin generates images through the Codex CLI, signed in with the user's ChatGPT plan. That doesn't use their Claude usage, and it takes about a minute per image (several run in parallel).

1. **Check it's available:** `node "PLUGIN/scripts/setup.mjs" --cached` (instant when it passed recently). If image generation isn't ready, use the code-built approach below and tell the user how to enable it (the setup skill explains). If it says the **upscaler** isn't installed, ask the user once whether to install it (a one-off ~45 MB download from the official Real-ESRGAN release; it keeps heroes sharp on high-resolution screens), and if they agree run `node "PLUGIN/scripts/upscale.mjs" --install`. Without it everything still works; large images are just slightly soft on big screens.
2. **Write a spec file** (`.acquired-taste/images.json`), the 3 hero candidates first:
   ```json
   { "style": "<the style line>",
     "images": [ { "name": "hero-a", "prompt": "<subject, composition, where to leave space for text>", "aspect": "16:9", "refs": ["brand/founder-avatar.png"] } ] }
   ```
   Describe each subject concretely. Say where to leave empty space for overlaid text. Match the aspect to the slot (hero 16:9 or 21:9, portrait cards 3:4, squares 1:1).
3. **Everything generates in the background; never wait on an image.** Image work must not add time to the build. Start `node "PLUGIN/scripts/gen-image.mjs" --spec .acquired-taste/images.json --out public/images` as a background task the moment the design read is written (before scaffolding; the folder can exist first), and carry on. Check `public/images/.status.json` for progress, and tell the user it's running.
   - **Interactive:** the 3 hero candidates are the checkpoint's hero options; they generate while you make the font sheet. Show them with your pick marked; the user's pick sets the hero and the style line. Right after "go", start the refine pass and the remaining images as one background batch, then build.
   - **No one to reply:** generate the candidates and the other images in the first batch. Build the page (the hero's code layers too) while they run; when they land, pick the winner, start its refine pass in the background, and keep building. Swap the refined hero in before the final review.
   - **Refine pass:** a spec with one image, `{ "name": "hero", "edit": "public/images/hero-b.png", "prompt": "<only what to change>", "aspect": "16:9" }`. The edit keeps everything else in the picture.
4. **Review the set in one look:** `node "PLUGIN/scripts/contact-sheet.mjs" .acquired-taste/review/images.png --dir public/images`, then open that one sheet. Check each image against three questions first: **does it match the style the brief asked for?**, **could someone mistake it for another brand's look (LEGO, Minecraft, Pixar…)?** and **is it a stock AI picture** (the stock answers in the recipe above) when you didn't choose that on purpose? Regenerate (once) any image that fails, with a more specific subject rather than the same idea reworded, or that's off-brand, inconsistent with the set, distorted, or contains stray text. If the whole set leans towards another brand's look, change the style line, not just the prompts. Don't regenerate for small preferences.
5. **Use them well:** `next/image` with real `alt` text and `sizes`. Art-direct the crop with `object-position`. Layer type, shapes or motion over them where the concept calls for it. A generated image plus code-built detail often makes the strongest signature moment.
6. **Tell the user** in the hand-over which images are generated, and that real photos of their team, premises and products should replace any stand-ins.

## The signature visual without a generator (or alongside one)

Build it from code. That's often stronger anyway, because it's sharp, light and animatable:
- **Illustration in inline SVG** drawn for the business, in one committed style.
- **Type as image:** oversized, cropped or layered lettering with texture or motion.
- **The product itself, live:** a real working fragment of the feature in HTML, animated.
- **Generative or data art** driven by something meaningful to the business.
- **Depth and material:** layered shapes, grain, light and shadow that suit the concept.

## When a real photo is needed and you can't generate it

- Design layouts that **don't depend on photos**. Never let empty boxes dominate a page.
- Make each placeholder intentional: the correct aspect ratio, tinted to the palette, with a short note of the shot to take ("Photo: chair 2, mid-fade, side light").
- List every placeholder in the hand-over.

## Every image

- **Never show an image bigger than its real size.** Stretched images look soft or pixelated, and the review script flags them ("stretched image"). Fix by giving the browser the right size (below), by upscaling it (`node "PLUGIN/scripts/upscale.mjs" <file>`, 2x in a few seconds, original kept in `.acquired-taste/originals/`), or by showing it smaller. Generated images come out about 1670px wide; `gen-image.mjs` already upscales wide ones (16:9, 21:9, 3:2) when the upscaler is installed. Add `"upscale": true` in the spec for any other image shown large.
- **Tell the browser the size it's really shown at.** `sizes="100vw"` is wrong for a full-bleed `object-cover` image: on tall screens the crop is wider than the screen, so the browser downloads a tiny version and blows it up (4.5x on phones in testing). For a 16:9 image filling the viewport use `sizes="(max-aspect-ratio: 16/9) 178vh, 100vw"`, and scale both up by any zoom you add for parallax (`scale-110` means 196vh / 110vw).
- **Heroes and key art use `quality={90}`** (75 is the default and visibly blurs detailed art). The starter's `next.config.ts` allows 90; in an existing project add 90 to `images.qualities`, or Next.js 16 silently serves 75.
- Set width and height or an `aspect-ratio`, so the layout doesn't jump.
- Write alt text that describes the content (`alt=""` only for decorative images).
- Make sure it loads. The review script fails broken images.
- Optimise it: `next/image`, and nothing shipped over about 300 KB without a reason.
