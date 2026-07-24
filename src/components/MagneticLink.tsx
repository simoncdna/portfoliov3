"use client";

import { useRef } from "react";
import type { ReactNode } from "react";

type Props = {
  href: string;
  children: ReactNode;
  className?: string;
  external?: boolean;
  /** magnetic pull strength in px */
  strength?: number;
  ariaLabel?: string;
};

/**
 * A link with a subtle magnetic pull toward the cursor and an animated
 * underline wipe. Pull is capped and eased — no bounce (per interaction thesis).
 */
export function MagneticLink({
  href,
  children,
  className = "",
  external,
  strength = 6,
  ariaLabel,
}: Props) {
  const ref = useRef<HTMLAnchorElement>(null);

  const onMove = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    const relX = e.clientX - (r.left + r.width / 2);
    const relY = e.clientY - (r.top + r.height / 2);
    el.style.transform = `translate(${(relX / r.width) * strength}px, ${
      (relY / r.height) * strength
    }px)`;
  };

  const reset = () => {
    const el = ref.current;
    if (el) el.style.transform = "translate(0,0)";
  };

  return (
    <a
      ref={ref}
      href={href}
      className={`magnetic ${className}`}
      onPointerMove={onMove}
      onPointerLeave={reset}
      aria-label={ariaLabel}
      {...(external
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
      style={{
        display: "inline-block",
        transition: "transform var(--dur-med) var(--ease-out)",
        willChange: "transform",
      }}
    >
      {children}
    </a>
  );
}
