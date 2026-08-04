"use client";

import { useEffect, useRef } from "react";
import { BarcodeEAN13 } from "@/components/BarcodeEAN13";
import { blobTweak } from "@/lib/blobTweak";
import { site } from "@/data/site";

export function Hero() {
  const rowRef = useRef<HTMLDivElement>(null);

  // On scroll, the bottom row (the barcode) fades out where it stands
  // — no rise, so nothing competes with the form for the eye's attention (and it
  // fades back in on the way up).
  //
  // It has to be gone BEFORE the form starts changing shape, not during: the
  // blob→skull handover opens at roughly 0.16 vh of scroll (HANDOVER_IN in
  // formChoreo, read against the About presence ramp in ChromeCanvas), so the
  // window is sized just under that. Opacity falls as the square of the progress
  // on top of it, so the eye reads the row as gone by the first third of even that
  // window: the Hero's furniture leaves the frame before the metal moves.
  useEffect(() => {
    let ticking = false;
    const update = () => {
      ticking = false;
      const el = rowRef.current;
      if (!el) return;
      const p = Math.min(1, window.scrollY / (window.innerHeight * 0.14));
      el.style.opacity = String((1 - p) * (1 - p));
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

      {/* Bottom row: the barcode alone, on the right. mt-auto pins it to the bottom now that
          the headline above is gone.
          `justify-end` rather than `justify-between`: the "[ Portfolio ]" tag that used to
          hold the left end is gone, and between-with-one-child would have thrown the barcode
          against the left gutter. */}
      <div
        ref={rowRef}
        className="shell relative z-20 mt-auto flex items-end justify-end"
        style={{ willChange: "opacity" }}
      >
        {/* hidden cipher — A=01..Z=26 → "CHROME" (03 08 18 15 13 05);
            hover reveals TWEAK; click opens the blob control panel */}
        <button
          type="button"
          // The panel is fetched and mounted on the REACH, not on the click (see
          // blobTweak.arm): hovering is what reveals the word TWEAK, so by the time
          // the click lands the chunk is in and the panel is sitting there closed,
          // ready to play its cascade. A tap with no hover still works — arm and
          // open land in the same tick, and the panel covers that itself.
          onPointerEnter={() => blobTweak.arm()}
          onFocus={() => blobTweak.arm()}
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
