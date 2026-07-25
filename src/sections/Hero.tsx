"use client";

import { useEffect, useRef } from "react";
import { BarcodeEAN13 } from "@/components/BarcodeEAN13";
import { blobTweak } from "@/lib/blobTweak";
import { site } from "@/data/site";

export function Hero() {
  const rowRef = useRef<HTMLDivElement>(null);

  // On scroll, the bottom row ([ Portfolio ] + barcode) rises and fades out over
  // the first ~45% of a viewport of scroll (and fades back in on the way up).
  useEffect(() => {
    let ticking = false;
    const update = () => {
      ticking = false;
      const el = rowRef.current;
      if (!el) return;
      const p = Math.min(1, window.scrollY / (window.innerHeight * 0.3));
      el.style.opacity = String(1 - p);
      el.style.transform = `translateY(${(-p * 44).toFixed(1)}px)`;
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section
      id="top"
      className="relative flex min-h-[100svh] flex-col justify-between overflow-hidden pt-28 pb-8"
    >
      <h1 className="sr-only">
        {site.name} — {site.role}
      </h1>

      {/* Bottom row: [ Portfolio ] tag (left) + edit no. & barcode (right).
          mt-auto pins it to the bottom now that the headline above is gone. */}
      <div
        ref={rowRef}
        className="shell relative z-20 mt-auto flex items-end justify-between"
        style={{ willChange: "opacity, transform" }}
      >
        <span className="font-mono text-[0.72rem] uppercase tracking-[0.2em] text-silver-muted">
          [ Portfolio ]
        </span>
        {/* hidden cipher — A=01..Z=26 → "CHROME" (03 08 18 15 13 05);
            hover reveals TWEAK; click opens the blob control panel */}
        <button
          type="button"
          onClick={() => blobTweak.toggle()}
          aria-label="Open blob controls"
          className="cursor-none"
        >
          <BarcodeEAN13
            code="030818151305"
            hoverWord="TWEAK"
            className="w-40 opacity-90"
          />
        </button>
      </div>
    </section>
  );
}
