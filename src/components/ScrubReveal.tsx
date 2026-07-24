"use client";

import { createElement, useRef } from "react";
import type { ElementType, ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

type Props = {
  children: ReactNode;
  as?: ElementType;
  className?: string;
};

/**
 * Cinematic scroll-scrubbed reveal: the content is masked + pushed down, and
 * un-masks/rises tied 1:1 to the scroll as the element enters the viewport
 * (GSAP ScrollTrigger scrub). Reduced-motion → shown instantly.
 */
export function ScrubReveal({ children, as, className }: Props) {
  const Tag = (as ?? "div") as ElementType;
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const inner = el.querySelector("[data-scrub-inner]") as HTMLElement;
      if (!inner) return;

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        gsap.set(inner, { clipPath: "none", yPercent: 0, opacity: 1 });
        return;
      }

      gsap.fromTo(
        inner,
        { yPercent: 45, opacity: 0, clipPath: "inset(0 0 100% 0)" },
        {
          yPercent: 0,
          opacity: 1,
          clipPath: "inset(-12% 0 -12% 0)",
          ease: "none",
          scrollTrigger: {
            trigger: el,
            start: "top 90%",
            end: "top 42%",
            scrub: true,
          },
        }
      );
    },
    { scope: ref }
  );

  return createElement(
    Tag,
    { ref, className },
    createElement(
      "span",
      {
        "data-scrub-inner": "",
        style: { display: "block", willChange: "transform, clip-path" },
      },
      children
    )
  );
}
