"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { blobTweak, PANEL_CLOSE_MS } from "@/lib/blobTweak";
import { isPageLocked, setPageScroller } from "@/lib/pageScroll";

// Keys that would scroll the page natively. Lenis governs wheel and touch but not
// the keyboard, so these are caught by hand while the panel holds the lock.
const SCROLL_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  " ",
  "Spacebar",
]);

gsap.registerPlugin(ScrollTrigger);

export function SmoothScroll({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    // Enable reveal transitions only after hydration (no FOUC / no hidden content for no-JS).
    document.documentElement.classList.add("reveal-ready");

    if (prefersReduced) return;

    const lenis = new Lenis({
      // Lerp mode, not duration mode. The two are exclusive: `duration` + `easing`
      // gives every scroll a fixed length and a fixed curve, which lands the page in a
      // predictable time but always ARRIVES — the movement has an end you can feel.
      // `lerp` closes a fraction of the remaining distance every frame instead, so the
      // tail is long and never quite finishes. That is the weight; there is no duration
      // to tune, only how much of the gap is eaten per frame (0.075 ≈ 8 frames to be
      // half way, ~30 to be 90% there, framerate-independent).
      lerp: 0.075,
      smoothWheel: true,
      // THE resistance, and the one number that actually produces the sensation: a
      // wheel notch is worth half its native distance. You push and the page gives you
      // less than you asked for, so covering ground takes gesture — which is what lets
      // a scrubbed sequence be READ rather than flicked past. Work's putting-away is
      // ~680px of scroll: at 0.9 that was one and a half wheel gestures (i.e. the four
      // beats played as one), at 0.5 it is three.
      // Below ~0.4 it stops reading as weight and starts reading as a page that is
      // fighting you — this whole document is ~12 screens tall.
      wheelMultiplier: 0.5,
      touchMultiplier: 1.6,
    });

    // Lent out to anything that needs to MOVE the page rather than watch it (Work's
    // plate numbers): while Lenis runs, it is the only thing allowed to write the
    // scroll position — see pageScroll.
    setPageScroller(lenis);
    // TEMPORAIRE — hublot de test pour la tâche du tunnel, à retirer avant la fin.
    if (process.env.NODE_ENV === "development")
      (window as unknown as Record<string, unknown>).__lenis = lenis;

    // Single clock: drive Lenis from GSAP's ticker so Lenis, ScrollTrigger and
    // every scrubbed animation share the exact same frame → no desync.
    const onLenisScroll = () => ScrollTrigger.update();
    lenis.on("scroll", onLenisScroll);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    // While the blob control panel is open, the page is LOCKED: a scroll gesture
    // closes the panel instead of moving the page, and the page only starts
    // moving once the panel's close animation has finished — so the Hero's
    // furniture-fade and the section handovers never begin underneath an open
    // panel. A stopped Lenis swallows wheel/touch and preventDefaults them (see
    // its onVirtualScroll), so stopping it IS the lock; we only have to catch the
    // scroll intent ourselves to trigger the close, since a stopped Lenis fires
    // no scroll event to hang the old close-on-scroll off.
    let startTimer = 0;
    let prevOpen = blobTweak.get().open;
    if (prevOpen) lenis.stop();
    const onPanel = () => {
      const open = blobTweak.get().open;
      if (open === prevOpen) return; // only react to the open→closed edges
      prevOpen = open;
      clearTimeout(startTimer);
      if (open) lenis.stop();
      // Held closed for the reverse-piano retract, THEN the page is handed back —
      // whether the panel was dismissed by a scroll, the ✕, or the barcode. Unless
      // something else is holding the page: this start is on a 1.2s delay, so the
      // section menu can perfectly well open inside that window, and handing the scroll
      // back under an open overlay would let the page slide about behind it.
      else
        startTimer = window.setTimeout(() => {
          if (!isPageLocked()) lenis.start();
        }, PANEL_CLOSE_MS);
    };
    const unsubscribePanel = blobTweak.subscribe(onPanel);

    // The scroll gesture that dismisses the panel. The page can't move (Lenis is
    // stopped), so this only has to flip `open`.
    const closePanel = () => {
      if (blobTweak.get().open) blobTweak.set({ open: false });
    };
    const onKey = (e: KeyboardEvent) => {
      if (!blobTweak.get().open || !SCROLL_KEYS.has(e.key)) return;
      // leave the panel's own controls (dials, colour, buttons) alone
      if ((e.target as HTMLElement)?.closest?.('[role="dialog"],input,button')) return;
      e.preventDefault();
      blobTweak.set({ open: false });
    };
    window.addEventListener("wheel", closePanel, { passive: true });
    window.addEventListener("touchmove", closePanel, { passive: true });
    window.addEventListener("keydown", onKey);

    // Bridge Lenis to anchor links + expose scrollTo
    const onAnchor = (e: Event) => {
      const target = (e.target as HTMLElement)?.closest?.(
        'a[href^="#"]'
      ) as HTMLAnchorElement | null;
      if (!target) return;
      const id = target.getAttribute("href");
      if (!id || id === "#") return;
      const el = document.querySelector(id);
      if (el) {
        e.preventDefault();
        lenis.scrollTo(el as HTMLElement, { offset: 0 });
      }
    };
    document.addEventListener("click", onAnchor);

    return () => {
      gsap.ticker.remove(tick);
      document.removeEventListener("click", onAnchor);
      window.removeEventListener("wheel", closePanel);
      window.removeEventListener("touchmove", closePanel);
      window.removeEventListener("keydown", onKey);
      clearTimeout(startTimer);
      unsubscribePanel();
      lenis.off("scroll", onLenisScroll);
      setPageScroller(null);
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}
