// Scroll-driven moments, built on GSAP ScrollTrigger (never raw scroll listeners).
//
//   parallax(section)                         children with data-depth="0.3" drift at that
//                                             speed relative to the scroll (negative = opposite)
//   scene(section, (tl) => { tl.to(...) })    pins the section and scrubs a timeline through
//                                             the scroll distance: a scroll-driven story.
//                                             On small screens (default < 768px) or with reduced
//                                             motion it doesn't pin: it shows the final state.
//   progress(bar)                             a reading-progress bar (scaleX 0 -> 1)

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { reducedMotion, noop, type Cleanup } from "./env";

let registered = false;
const register = () => { if (!registered) { gsap.registerPlugin(ScrollTrigger); registered = true; } };

export function parallax(root: HTMLElement, { selector = "[data-depth]", range = 200 } = {}): Cleanup {
  if (reducedMotion()) return noop;
  register();
  const ctx = gsap.context(() => {
    root.querySelectorAll<HTMLElement>(selector).forEach((el) => {
      const depth = Number(el.dataset.depth ?? 0.2);
      gsap.fromTo(el, { y: -range * depth / 2 }, {
        y: range * depth / 2, ease: "none",
        scrollTrigger: { trigger: root, start: "top bottom", end: "bottom top", scrub: true },
      });
    });
  }, root);
  return () => ctx.revert();
}

export function scene(root: HTMLElement, build: (tl: gsap.core.Timeline) => void, { length = "+=150%", minWidth = 768, scrub = 0.6 } = {}): Cleanup {
  register();
  // Media queries follow the real CSS layout (window.innerWidth can briefly report a
  // desktop width on phones at load) and re-run if the window is resized or rotated.
  const mm = gsap.matchMedia(root);
  mm.add({
    pin: `(min-width: ${minWidth}px) and (prefers-reduced-motion: no-preference)`,
    still: `(max-width: ${minWidth - 0.02}px), (prefers-reduced-motion: reduce)`,
  }, (context) => {
    const { pin } = context.conditions as { pin: boolean };
    const tl = gsap.timeline(pin
      ? { defaults: { ease: "none" }, scrollTrigger: { trigger: root, start: "top top", end: length, pin: true, scrub, anticipatePin: 1 } }
      : { paused: true });
    build(tl);
    if (!pin) tl.progress(1); // final state, no pinning
  });
  return () => mm.revert();
}

export function progress(bar: HTMLElement): Cleanup {
  if (reducedMotion()) return noop;
  register();
  const ctx = gsap.context(() => {
    gsap.fromTo(bar, { scaleX: 0, transformOrigin: "0 50%" }, {
      scaleX: 1, ease: "none",
      scrollTrigger: { start: 0, end: "max", scrub: 0.2 },
    });
  });
  return () => ctx.revert();
}

// Call after fonts or images change the page height, so trigger positions stay right.
export const refresh = () => { register(); ScrollTrigger.refresh(); };
