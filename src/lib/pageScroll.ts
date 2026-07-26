"use client";

import type Lenis from "lenis";

/**
 * The page's scroller, borrowable.
 *
 * Lenis owns the scroll position while it is running: it keeps its own
 * `animatedScroll` and writes it to the document every frame. So a component that
 * wants to move the page CANNOT call window.scrollTo — the document would jump, and
 * the next wheel event would snap it back to wherever Lenis still believed it was.
 * It has to ask Lenis instead, which is what this exists for.
 *
 * A module singleton rather than context, because the callers are not always React
 * children of the provider (and because there is exactly one page).
 */
let lenis: Lenis | null = null;

export function setPageScroller(instance: Lenis | null) {
  lenis = instance;
}

/**
 * Scroll the page to an absolute document y.
 *
 * Falls back to the native scroll when Lenis is absent — which is the real state of
 * the page under prefers-reduced-motion, where SmoothScroll never starts it.
 */
export function scrollPageTo(y: number, smooth = true) {
  if (lenis) {
    lenis.scrollTo(y, { immediate: !smooth });
    return;
  }
  window.scrollTo({ top: y, behavior: smooth ? "smooth" : "auto" });
}
