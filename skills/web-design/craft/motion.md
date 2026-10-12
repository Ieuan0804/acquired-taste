# Motion and depth

Motion is what makes a site feel alive and finished, and also the fastest way to make it feel cheap. "Everything fades up 20px on scroll" and "every card lifts on hover" are slop. Premium motion is **a few deliberate moments, choreographed**, with depth that suits the concept.

PLUGIN below means the plugin root, two folders above this skill's base directory.

## How much, by site type

The motion character and intensity come from the design read. Starting points:

| Type | Motion | Use |
|---|---|---|
| Landing, marketing | 6-8 of 10 | 2-3 signature moments; hover and press states everywhere; optional cursor and smooth scroll at the high end |
| Local business | 4-5 | Hero entrance, one scroll moment, tactile buttons |
| E-commerce | 3-4 | Image reveals, quick add-to-basket feedback, gentle hovers. Never slow shoppers down |
| App screens | 2-3, functional only | State transitions, list reordering, confirmations |
| Dashboards | 1-2, functional only | Values tick, new alerts pulse once, rows reorder smoothly. Nothing decorative or looping |

A playful brand (a game studio, a kids' brand) pushes higher; a law firm or a bank sits lower.

## Plan the moments, then build them

In the design read, name the **2-3 signature moments** (marketing types) and how they're choreographed: what moves first, what follows, how long. Tie them to the concept spine (the receipt flying into the ledger, the ride's route drawing itself across the hero), not to generic effects.

Then use the plugin's **tested blocks** instead of writing animation code from scratch. Add only the ones you use:

```bash
node "PLUGIN/scripts/add-blocks.mjs" reveal scroll pointer depth
```

| Block | Gives you | Good for |
|---|---|---|
| `reveal` | `reveal(el, { mode: "words" \| "fade" \| "clip" })` | Headline words rising through a mask; staggered groups; images wiping in |
| `scroll` | `scene(section, tl => …)`, `parallax(section)`, `progress(bar)` | A pinned scroll story; layered depth (`data-depth="0.3"`); reading progress |
| `pointer` | `magnetic(el)`, `tilt(el, { glare })`, `cursor({ selector })` | Tactile CTAs; 3D cards and hero objects; a cursor follower with labels (`data-cursor="Play"`) |
| `counter` | `counter(el, { to, format })` → `.update(v)` | Stats that tick up; live dashboard values |
| `marquee` | `marquee(track)` | A ticker of promises, clients or lines |
| `smooth` | `smoothScroll()` (also `npm i lenis`) | High-motion marketing pages only |
| `depth` | `depth.css`: `--depth-1..3` layered shadows, `.grain`, `.grain-page`, `.glass`, `.lit`, `.lift` | Real depth: tinted layered shadows, film grain, glass over imagery, light from above |

Usage in Next.js: put motion in small `"use client"` components and start each block in an effect, which returns its own cleanup:

```tsx
"use client";
import { useEffect, useRef } from "react";
import { reveal } from "@/lib/motion/reveal";

export function Headline({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => reveal(ref.current!, { mode: "words" }), []);
  return <h1 ref={ref}>{children}</h1>;
}
```

Write custom GSAP for the signature moment itself where the concept needs it (`scene()` gives you the pinned, scrubbed timeline to fill). Keep everything else to the blocks.

## Rules every block already follows (follow them in custom code too)

- **Content is never hidden by CSS waiting for JavaScript.** Hide it in JS right before animating, so if scripts fail it's still there. The review flags anything left invisible.
- **Reduced motion:** with `prefers-reduced-motion`, show the final state with no movement. Pinned scenes don't pin.
- **Phones:** no pinning below 768px; no cursor or tilt effects on touch screens.
- **Performance:** animate `transform` and `opacity` (and `clip-path`) only; never `top`/`left`/`width`. No raw `scroll` listeners; use ScrollTrigger or IntersectionObserver.
- **Never redraw React on every scroll frame.** Scroll-linked visuals (a dial turning, a meter counting, a progress bar) move the DOM directly: a GSAP tween or `ScrollTrigger` scrub on the element, or a ref you write to. If something must be React state, update it only when the shown value actually changes (a whole day, a new digit), never with the raw scroll position. Setting state per frame makes scrolling janky on real phones and starves other animations (a test run's dial left whole sections invisible).
- **Easing:** shared tokens (`ease.out` for entrances, `spring` for tactile UI). Never linear, except marquees.
- **Choreography:** one hero entrance in a deliberate order (headline words, then supporting line, then the visual, then actions), shared timing, everything finished in under ~1.2s.

## Depth

Pick the depth tier that fits the concept and the motion level:
1. **Light and material:** layered tinted shadows (`--depth-2/3`), inner highlights, grain. Fits almost everything, including dashboards (subtly).
2. **Layering and overlap:** elements breaking out of their containers, parallax layers, type over imagery.
3. **Scroll-driven 3D:** tilt, perspective, rotating panels in a pinned scene.
4. **Real 3D (Three.js):** hero moments only, when the brief truly calls for it. Heavy and slow to build.

## Check it

Screenshots can't show motion, so also check the code: each planned moment exists, uses a block or ScrollTrigger, and respects reduced motion. The review script catches content left invisible (with and without reduced motion) and scroll jank.
