// Lenis smooth scrolling kept in sync with GSAP ScrollTrigger. Marketing pages with high
// motion only, never dashboards or app screens. Needs the lenis package: npm i lenis
//
//   useEffect(() => smoothScroll(), []);

import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { reducedMotion, noop, type Cleanup } from "./env";

export function smoothScroll(): Cleanup {
  if (reducedMotion()) return noop;
  gsap.registerPlugin(ScrollTrigger);
  const lenis = new Lenis({ lerp: 0.1 });
  lenis.on("scroll", ScrollTrigger.update);
  const tick = (time: number) => lenis.raf(time * 1000);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);
  return () => { gsap.ticker.remove(tick); lenis.destroy(); };
}
