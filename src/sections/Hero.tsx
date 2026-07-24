"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { BarcodeEAN13 } from "@/components/BarcodeEAN13";
import { site } from "@/data/site";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export function Hero() {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const lines = el.querySelectorAll<HTMLElement>("[data-hero-line]");

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        gsap.set(lines, { yPercent: 0, opacity: 1, clipPath: "none" });
        return;
      }

      // pin the hero; the headline composes as you scroll through the pin
      gsap
        .timeline({
          scrollTrigger: {
            trigger: el,
            start: "top top",
            end: "+=110%",
            pin: true,
            scrub: 1,
          },
        })
        .from(lines, {
          yPercent: 120,
          opacity: 0,
          clipPath: "inset(0 0 100% 0)",
          stagger: 0.25,
          ease: "none",
        })
        .to({}, { duration: 0.35 }); // brief hold before release
    },
    { scope: ref }
  );

  return (
    <section
      ref={ref}
      id="top"
      className="relative flex min-h-[100svh] flex-col justify-between overflow-hidden pt-28 pb-8"
    >
      <h1 className="sr-only">
        {site.name} — {site.role}
      </h1>

      {/* Pinned headline — composes over the morphing blob */}
      <div aria-hidden className="shell relative z-20 mix-blend-difference">
        <div className="flex flex-col">
          <span
            data-hero-line
            className="font-display fs-mega block text-chrome"
            style={{ willChange: "transform, clip-path" }}
          >
            Frontend
          </span>
          <span
            data-hero-line
            className="font-display fs-mega block self-end text-right text-chrome"
            style={{ willChange: "transform, clip-path" }}
          >
            Developer
          </span>
        </div>
      </div>

      {/* Bottom row: [ PORTFOLIO ] tag (left) + edit no. & barcode (right) */}
      <div className="shell relative z-20 flex items-end justify-between">
        <span className="font-mono text-[0.72rem] uppercase tracking-[0.2em] text-silver-muted">
          [ Portfolio ]
        </span>
        {/* hidden cipher — A=01..Z=26 → "CHROME" (03 08 18 15 13 05) */}
        <BarcodeEAN13 code="030818151305" className="w-40 opacity-90" />
      </div>
    </section>
  );
}
