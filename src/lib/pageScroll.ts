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

/* ---------------------------------------------------------------------------
 * The modal lock
 * ------------------------------------------------------------------------- */

let locked = false;

/**
 * Hold the page still for a modal (the section menu).
 *
 * A stopped Lenis swallows wheel and touch and preventDefaults them, so stopping it IS
 * the lock — no overflow:hidden, and therefore no scrollbar-width reflow of the whole
 * document behind the overlay. Under prefers-reduced-motion Lenis never starts, so the
 * fallback has to be the blunt one.
 *
 * The flag is readable because SmoothScroll ALSO drives Lenis for the blob panel, on a
 * delayed start: without a shared source of truth, that timer could land while a menu
 * is open and hand the page back underneath it. See isPageLocked's caller.
 */
export function lockPageScroll(next: boolean) {
  locked = next;
  if (lenis) {
    if (next) lenis.stop();
    else lenis.start();
    return;
  }
  document.documentElement.style.overflow = next ? "hidden" : "";
}

export function isPageLocked() {
  return locked;
}
