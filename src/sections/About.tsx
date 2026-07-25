"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Kicker, Index } from "@/components/Bits";
import { site } from "@/data/site";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * About — first pass. The liquid/DNA form docks LEFT during the Hero→About
 * transition; here the content lives on the RIGHT. As you keep scrolling once
 * the DNA is formed, a line draws itself right→left, the "01 / About" label
 * appears, then the short bio reveals.
 */
export function About() {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        gsap.set(el.querySelectorAll("[data-line], [data-label] > *, [data-bio] > *"), {
          clearProps: "all",
          autoAlpha: 1,
          scaleX: 1,
        });
        return;
      }

      gsap
        .timeline({
          scrollTrigger: {
            trigger: el,
            start: "top 78%",
            end: "top 28%",
            scrub: 1,
          },
        })
        .from("[data-line]", { scaleX: 0, ease: "none" })
        .from(
          "[data-label] > *",
          { autoAlpha: 0, y: 14, stagger: 0.25, ease: "none" },
          "<0.2"
        )
        .from(
          "[data-bio] > *",
          { autoAlpha: 0, y: 18, stagger: 0.18, ease: "none" },
          "<0.3"
        );
    },
    { scope: ref }
  );

  return (
    <section
      ref={ref}
      id="about"
      className="relative min-h-screen py-[var(--section-y)]"
      style={{ scrollMarginTop: "6rem" }}
    >
      <div className="shell grid min-h-screen grid-cols-1 items-center md:grid-cols-12">
        {/* left half kept open for the docked liquid/DNA form */}
        <div className="hidden md:col-span-5 md:block" aria-hidden />

        {/* right column — the drawn line + label + bio */}
        <div className="md:col-span-7 md:pl-6">
          {/* line drawn right → left, with the section label riding above it */}
          <div
            data-label
            className="mb-4 flex items-baseline justify-between"
          >
            <Kicker>About</Kicker>
            <Index>01</Index>
          </div>
          <div
            data-line
            className="h-px w-full bg-silver"
            style={{ transformOrigin: "right center" }}
          />

          <div data-bio className="mt-10 flex max-w-xl flex-col gap-5">
            {site.bio.map((line, i) => (
              <p
                key={i}
                className={
                  i === 0
                    ? "text-[1.05rem] leading-relaxed text-silver-bright"
                    : "text-[0.98rem] leading-relaxed text-silver"
                }
              >
                {line}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
