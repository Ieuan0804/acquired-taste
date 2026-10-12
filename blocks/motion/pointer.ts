// Pointer-driven moments for mouse users. All are off on touch screens and when the user
// prefers reduced motion.
//
//   magnetic(button, { strength: 0.35 })   the element leans toward the cursor, springs back
//   tilt(card, { max: 8 })                 3D tilt toward the cursor, with optional glare
//   cursor({ selector: "[data-cursor]" })  a follower dot that grows over interactive things
//                                          and shows data-cursor="View" labels. Native cursor
//                                          stays visible unless hideNative is set.

import { gsap } from "gsap";
import { reducedMotion, coarsePointer, noop, type Cleanup } from "./env";

const off = () => reducedMotion() || coarsePointer();

export function magnetic(el: HTMLElement, { strength = 0.35, radius = 1.4 } = {}): Cleanup {
  if (off()) return noop;
  const x = gsap.quickTo(el, "x", { duration: 0.5, ease: "power3.out" });
  const y = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3.out" });
  const move = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const dx = e.clientX - cx, dy = e.clientY - cy;
    const reach = (Math.max(r.width, r.height) / 2) * radius;
    if (Math.hypot(dx, dy) > reach) { x(0); y(0); return; }
    x(dx * strength); y(dy * strength);
  };
  const leave = () => { x(0); y(0); };
  window.addEventListener("pointermove", move, { passive: true });
  el.addEventListener("pointerleave", leave);
  return () => { window.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); gsap.set(el, { x: 0, y: 0 }); };
}

export function tilt(el: HTMLElement, { max = 8, perspective = 900, glare = false } = {}): Cleanup {
  if (off()) return noop;
  gsap.set(el, { transformPerspective: perspective, transformStyle: "preserve-3d" });
  const rx = gsap.quickTo(el, "rotationX", { duration: 0.6, ease: "power3.out" });
  const ry = gsap.quickTo(el, "rotationY", { duration: 0.6, ease: "power3.out" });
  let shine: HTMLElement | null = null;
  if (glare) {
    shine = document.createElement("span");
    shine.setAttribute("aria-hidden", "true");
    shine.style.cssText = "position:absolute;inset:0;pointer-events:none;border-radius:inherit;opacity:0;transition:opacity .3s;background:radial-gradient(circle at var(--gx,50%) var(--gy,50%),rgba(255,255,255,.35),transparent 55%)";
    if (getComputedStyle(el).position === "static") el.style.position = "relative";
    el.append(shine);
  }
  const move = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
    ry(px * max * 2); rx(-py * max * 2);
    if (shine) { shine.style.opacity = "1"; shine.style.setProperty("--gx", `${(px + 0.5) * 100}%`); shine.style.setProperty("--gy", `${(py + 0.5) * 100}%`); }
  };
  const leave = () => { rx(0); ry(0); if (shine) shine.style.opacity = "0"; };
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerleave", leave);
  return () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); shine?.remove(); gsap.set(el, { rotationX: 0, rotationY: 0 }); };
}

export function cursor({ selector = "a, button, [data-cursor]", size = 12, hoverSize = 56, color = "currentColor", hideNative = false } = {}): Cleanup {
  if (off()) return noop;
  const dot = document.createElement("div");
  dot.setAttribute("aria-hidden", "true");
  dot.style.cssText = `position:fixed;left:0;top:0;width:${size}px;height:${size}px;margin:${-size / 2}px 0 0 ${-size / 2}px;border-radius:999px;background:${color};pointer-events:none;z-index:2147483646;mix-blend-mode:difference;display:grid;place-items:center;font:600 11px/1 system-ui,sans-serif;color:#fff;transition:width .3s,height .3s,margin .3s,opacity .3s;opacity:0`;
  document.body.append(dot);
  if (hideNative) document.documentElement.style.cursor = "none";
  const x = gsap.quickTo(dot, "x", { duration: 0.35, ease: "power3.out" });
  const y = gsap.quickTo(dot, "y", { duration: 0.35, ease: "power3.out" });
  const move = (e: PointerEvent) => {
    dot.style.opacity = "1";
    x(e.clientX); y(e.clientY);
    const target = (e.target as Element | null)?.closest?.(selector) as HTMLElement | null;
    const s = target ? hoverSize : size;
    dot.style.width = dot.style.height = `${s}px`;
    dot.style.margin = `${-s / 2}px 0 0 ${-s / 2}px`;
    dot.textContent = target?.dataset.cursor ?? "";
  };
  const hide = () => { dot.style.opacity = "0"; };
  window.addEventListener("pointermove", move, { passive: true });
  document.addEventListener("pointerleave", hide);
  return () => { window.removeEventListener("pointermove", move); document.removeEventListener("pointerleave", hide); dot.remove(); document.documentElement.style.cursor = ""; };
}
