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

/**
 * Hold the page still — for a modal (the section menu) or for the Work terminal's
 * retenue (see tubeGate).
 *
 * A stopped Lenis swallows wheel and touch and preventDefaults them, so stopping it IS
 * the lock — no overflow:hidden, and therefore no scrollbar-width reflow of the whole
 * document behind the overlay. Under prefers-reduced-motion Lenis never starts, so the
 * fallback has to be the blunt one.
 *
 * NOMINATIF DEPUIS QUE LE TERMINAL EXISTE. C'était un simple booléen, correct tant
 * qu'un seul verrouilleur existait (le menu). Il y en a désormais deux, et un booléen
 * ne peut pas dire QUI le tient : si le menu et la retenue du terminal étaient
 * ouverts en même temps, le premier des deux à relâcher (`lockPageScroll(false)`)
 * relâchait la page pour l'autre aussi — le commentaire d'origine de ce fichier
 * anticipait déjà la même faille pour le panneau ("without a shared source of truth,
 * that timer could land while a menu is open…") sans la résoudre, parce qu'il n'y
 * avait alors rien à confondre. `owner` est donc un nom, l'état un Set : la page
 * n'est rendue que si CE Set est vide, donc relâcher son propre nom ne peut jamais
 * relâcher celui d'un autre.
 */
const lockedBy = new Set<string>();

export function lockPageScroll(owner: string, next: boolean) {
  if (next) lockedBy.add(owner);
  else lockedBy.delete(owner);
  const locked = lockedBy.size > 0;
  if (lenis) {
    if (locked) lenis.stop();
    else lenis.start();
    return;
  }
  document.documentElement.style.overflow = locked ? "hidden" : "";
}

/**
 * Readable because SmoothScroll ALSO drives Lenis for the blob panel, on a delayed
 * start: without a shared source of truth, that timer could land while a menu (or the
 * terminal's retenue) is open and hand the page back underneath it. See this
 * function's caller in SmoothScroll.
 */
export function isPageLocked() {
  return lockedBy.size > 0;
}
