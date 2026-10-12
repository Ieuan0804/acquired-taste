// Choreographed entrances when elements come into view. Content is never hidden by CSS:
// it's only hidden by JS right before animating, so if JS fails, or the user prefers
// reduced motion, everything is simply visible.
//
//   reveal(container, { mode: "fade" })   children (or `selector` matches) rise and fade in, staggered
//   reveal(heading,   { mode: "words" })  each word rises through a mask (headlines)
//   reveal(image,     { mode: "clip" })   wipes in from the bottom (images, panels)

import { reducedMotion, ease, noop, type Cleanup } from "./env";

type Mode = "fade" | "words" | "clip";
export interface RevealOptions {
  mode?: Mode;
  selector?: string;   // which descendants to animate in "fade" mode (default: direct children)
  stagger?: number;    // seconds between items
  delay?: number;      // seconds before the first item
  distance?: number;   // px to rise in "fade" mode
  duration?: number;   // seconds per item
  threshold?: number;  // share of the element visible before it plays
}

function splitWords(el: HTMLElement): HTMLElement[] {
  if (el.dataset.revealSplit) return [...el.querySelectorAll<HTMLElement>("[data-reveal-word]")];
  el.dataset.revealSplit = "1";
  el.setAttribute("aria-label", el.textContent?.trim() ?? "");
  const words: HTMLElement[] = [];
  const walk = (node: Node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const parts = (child.textContent ?? "").split(/(\s+)/);
        const frag = document.createDocumentFragment();
        for (const part of parts) {
          if (!part) continue;
          if (/^\s+$/.test(part)) { frag.append(part); continue; }
          const mask = document.createElement("span");
          mask.setAttribute("aria-hidden", "true");
          mask.style.cssText = "display:inline-block;overflow:hidden;vertical-align:top;padding-bottom:0.08em;margin-bottom:-0.08em";
          const word = document.createElement("span");
          word.dataset.revealWord = "1";
          word.style.display = "inline-block";
          word.textContent = part;
          mask.append(word);
          frag.append(mask);
          words.push(word);
        }
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child);
      }
    }
  };
  walk(el);
  return words;
}

// Reveals still waiting to play. One shared listener checks them once per finished scroll
// (`scrollend`; a short debounce where it isn't supported), never on every scroll frame.
const pending = new Set<() => void>();
let listening = false;
function listenForScrollEnd() {
  if (listening) return;
  listening = true;
  const run = () => [...pending].forEach((check) => check());
  if ("onscrollend" in window) addEventListener("scrollend", run, { passive: true });
  else {
    let timer = 0;
    addEventListener("scroll", () => { clearTimeout(timer); timer = window.setTimeout(run, 150); }, { passive: true });
  }
}

export function reveal(root: HTMLElement, options: RevealOptions = {}): Cleanup {
  if (reducedMotion() || typeof IntersectionObserver === "undefined") return noop;
  const { mode = "fade", stagger = mode === "words" ? 0.06 : 0.09, delay = 0, distance = 28, duration = mode === "words" ? 0.9 : 0.8, threshold = 0.2 } = options;

  const targets: HTMLElement[] =
    mode === "words" ? splitWords(root)
      : mode === "clip" ? [root]
        : options.selector ? [...root.querySelectorAll<HTMLElement>(options.selector)]
          : ([...root.children] as HTMLElement[]);
  if (!targets.length) return noop;

  // Group words by line so lines cascade, not every word one by one.
  const lineOf = new Map<HTMLElement, number>();
  if (mode === "words") {
    const tops = [...new Set(targets.map((t) => Math.round(t.getBoundingClientRect().top)))].sort((a, b) => a - b);
    targets.forEach((t) => lineOf.set(t, tops.indexOf(Math.round(t.getBoundingClientRect().top))));
  }

  const from: Keyframe =
    mode === "words" ? { transform: "translateY(105%)" }
      : mode === "clip" ? { clipPath: "inset(0 0 100% 0)" }
        : { opacity: 0, transform: `translateY(${distance}px)` };
  const to: Keyframe =
    mode === "words" ? { transform: "translateY(0)" }
      : mode === "clip" ? { clipPath: "inset(0 0 0% 0)" }
        : { opacity: 1, transform: "translateY(0)" };

  const animations: Animation[] = [];
  const hide = () => targets.forEach((t) => Object.assign(t.style, from as Record<string, string>));
  const play = () => {
    targets.forEach((t, i) => {
      const order = mode === "words" ? (lineOf.get(t) ?? 0) * 2 + i * 0.25 : i;
      const a = t.animate([from, to], { duration: duration * 1000, delay: (delay + order * stagger) * 1000, easing: ease.out, fill: "both" });
      a.onfinish = () => { Object.assign(t.style, to as Record<string, string>); a.cancel(); };
      animations.push(a);
    });
  };

  hide();
  // Watch an element that isn't being hidden: Chrome counts an element fully hidden by its
  // own clip-path as off screen, so a clipped target would never report itself visible.
  const watched = mode === "clip" ? (root.parentElement ?? root) : root;
  let played = false;
  const start = () => { if (played) return; played = true; observer.disconnect(); pending.delete(check); play(); };
  // A section taller than the screen can never be 20% visible, so lower the bar for tall ones.
  const tall = watched.getBoundingClientRect().height;
  const bar = mode === "clip" ? 0 : Math.min(threshold, tall ? (innerHeight * 0.5) / tall : threshold);
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) start();
  }, { threshold: bar, rootMargin: mode === "clip" ? "0px 0px -15% 0px" : "0px" });
  observer.observe(watched);
  // A fast scroll (or a jump link) can carry an element from below the screen to above it
  // without it ever counting as visible, and IntersectionObserver reports nothing for that.
  // When a scroll ends, anything still waiting that is now on or above the screen plays.
  const check = () => { if (watched.getBoundingClientRect().top < innerHeight) start(); };
  pending.add(check);
  listenForScrollEnd();

  return () => {
    observer.disconnect();
    pending.delete(check);
    animations.forEach((a) => a.cancel());
    targets.forEach((t) => Object.assign(t.style, to as Record<string, string>));
  };
}
