// Numbers that tick to their value: stats on marketing pages (when they scroll into view)
// and live values on dashboards (call `update` whenever the data changes).
//
//   const c = counter(el, { to: 3576.22, format: { style: "currency", currency: "GBP" } });
//   c.update(3612.5);   // ticks from the current value to the new one
//   c.destroy();
//
// The element keeps its final text for screen readers and when motion is reduced.

import { reducedMotion } from "./env";

export interface CounterOptions {
  to: number;
  from?: number;
  duration?: number; // seconds
  locale?: string;   // default "en-GB"
  format?: Intl.NumberFormatOptions;
  onView?: boolean;  // wait until visible (default true)
}

export function counter(el: HTMLElement, options: CounterOptions) {
  const { from = 0, duration = 1.2, locale = "en-GB", format = {}, onView = true } = options;
  // In-between values use the target's precision: counting to 3,100 never shows 3,094.984.
  const decimals = (String(options.to).split(".")[1] ?? "").length;
  const fmt = new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals, ...format });
  el.style.fontVariantNumeric = "tabular-nums";
  let current = from;
  let frame = 0;

  const render = (v: number) => { el.textContent = fmt.format(v); };
  const tween = (target: number) => {
    cancelAnimationFrame(frame);
    if (reducedMotion()) { current = target; render(target); return; }
    const start = current, startTime = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / (duration * 1000));
      const eased = 1 - Math.pow(1 - t, 4);
      current = start + (target - start) * eased;
      render(current);
      if (t < 1) frame = requestAnimationFrame(step);
      else { current = target; render(target); }
    };
    frame = requestAnimationFrame(step);
  };

  let observer: IntersectionObserver | null = null;
  if (onView && typeof IntersectionObserver !== "undefined" && !reducedMotion()) {
    render(from);
    observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { observer?.disconnect(); tween(options.to); }
    }, { threshold: 0.4 });
    observer.observe(el);
  } else {
    tween(options.to);
  }

  return {
    update: (value: number) => tween(value),
    destroy: () => { cancelAnimationFrame(frame); observer?.disconnect(); render(options.to); },
  };
}
