// An endless ticker.
//
//   marquee(track, { speed: 40 })   an endless horizontal ticker of the track's children;
//                                   pauses on hover and stops (static) with reduced motion

import { reducedMotion, noop, type Cleanup } from "./env";

export function marquee(track: HTMLElement, { speed = 40, gap = "3rem" } = {}): Cleanup {
  if (reducedMotion()) return noop;
  const items = [...track.children] as HTMLElement[];
  const clones = items.map((el) => { const c = el.cloneNode(true) as HTMLElement; c.setAttribute("aria-hidden", "true"); return c; });
  track.append(...clones);
  Object.assign(track.style, { display: "flex", gap, width: "max-content" });
  track.parentElement!.style.overflow = "hidden";
  const distance = track.scrollWidth / 2;
  const anim = track.animate([{ transform: "translateX(0)" }, { transform: `translateX(-${distance}px)` }], {
    duration: (distance / speed) * 1000, iterations: Infinity, easing: "linear",
  });
  const pause = () => anim.pause();
  const resume = () => anim.play();
  track.addEventListener("pointerenter", pause);
  track.addEventListener("pointerleave", resume);
  return () => { anim.cancel(); clones.forEach((c) => c.remove()); track.removeEventListener("pointerenter", pause); track.removeEventListener("pointerleave", resume); };
}
