"use client";

import { createElement, useEffect, useRef } from "react";
import type { ElementType, ReactNode } from "react";

type RevealProps = {
  children: ReactNode;
  as?: ElementType;
  /** "fade" = translate+fade, "mask" = clip-path line reveal */
  variant?: "fade" | "mask";
  /** stagger delay in ms */
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
};

/**
 * Reveals its content once when scrolled into view via IntersectionObserver.
 * The hidden->visible states live in globals.css under `.reveal-ready`, so if
 * JS never runs the content is fully visible (no-JS safe).
 */
export function Reveal({
  children,
  as,
  variant = "fade",
  delay = 0,
  className,
  style,
}: RevealProps) {
  const Tag = (as ?? "div") as ElementType;
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      el.classList.add("is-in");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // NOTE: for the "mask" variant the clip-path lives on an INNER wrapper, not
  // on the observed node. Chrome's IntersectionObserver factors the target's
  // own clip-path into the intersection rect — a self-clipped node reports
  // ratio 0 and could never trigger its own reveal (deadlock).
  const style2 = { ...style, ["--reveal-delay" as string]: `${delay}ms` };

  if (variant === "mask") {
    return createElement(
      Tag,
      { ref, className, style: style2, "data-reveal-mask": "" },
      createElement("span", { className: "reveal-mask-inner" }, children)
    );
  }

  return createElement(
    Tag,
    { ref, className, style: style2, "data-reveal": "" },
    children
  );
}
