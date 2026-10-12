// Shared helpers for Acquired Taste motion blocks.
// Every block is a plain function: call it on an element in the browser, get a cleanup back.
// In React: `useEffect(() => reveal(ref.current!, { mode: "words" }), [])` in a "use client" component.

export const inBrowser = typeof window !== "undefined";

export const reducedMotion = (): boolean =>
  inBrowser && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const coarsePointer = (): boolean =>
  inBrowser && window.matchMedia("(pointer: coarse)").matches;

// Shared easing and timing, so every moment on a page feels like one hand made it.
export const ease = {
  out: "cubic-bezier(0.16, 1, 0.3, 1)", // confident deceleration (default)
  inOut: "cubic-bezier(0.65, 0, 0.35, 1)",
  spring: "cubic-bezier(0.34, 1.56, 0.64, 1)", // slight overshoot for tactile UI
  gsapOut: "expo.out",
  gsapInOut: "power3.inOut",
};

export const duration = { quick: 0.25, base: 0.6, slow: 1.1 };

export type Cleanup = () => void;
export const noop: Cleanup = () => {};
