"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { blobTweak } from "@/lib/blobTweak";

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
      // a touch more inertia/resistance than before (heavier, slower settle)
      duration: 1.35,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 0.9,
      touchMultiplier: 1.6,
    });

    // Single clock: drive Lenis from GSAP's ticker so Lenis, ScrollTrigger and
    // every scrubbed animation share the exact same frame → no desync.
    // Also: any real scroll dismisses the blob control panel if it's open.
    const onLenisScroll = () => {
      ScrollTrigger.update();
      if (blobTweak.get().open && Math.abs(lenis.velocity) > 1) {
        blobTweak.set({ open: false });
      }
    };
    lenis.on("scroll", onLenisScroll);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

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
      lenis.off("scroll", onLenisScroll);
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}
