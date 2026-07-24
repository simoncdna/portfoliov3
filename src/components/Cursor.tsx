"use client";

import { useEffect, useRef } from "react";

/**
 * Custom chrome cursor: a silver ring that trails the pointer and grows over
 * interactive elements. Uses mix-blend-mode: difference so it reads on both
 * the black void and bright chrome. Pointer-fine devices only.
 */
export function Cursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!finePointer) return;

    const dot = dotRef.current!;
    const ring = ringRef.current!;

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let ringX = mouseX;
    let ringY = mouseY;
    let hovering = false;
    let visible = false;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      if (!visible) {
        visible = true;
        dot.style.opacity = "1";
        ring.style.opacity = "1";
      }
      dot.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`;

      const interactive = (e.target as HTMLElement)?.closest?.(
        'a, button, [data-cursor="hover"], input, textarea'
      );
      const next = Boolean(interactive);
      if (next !== hovering) {
        hovering = next;
        ring.style.setProperty("--scale", next ? "2.4" : "1");
        ring.style.setProperty(
          "--ring-bg",
          next ? "rgba(214,216,222,0.12)" : "rgba(214,216,222,0)"
        );
      }
    };

    const onLeave = () => {
      visible = false;
      dot.style.opacity = "0";
      ring.style.opacity = "0";
    };

    const loop = () => {
      // ease the ring toward the pointer (organic trail, no bounce)
      const speed = prefersReduced ? 1 : 0.18;
      ringX += (mouseX - ringX) * speed;
      ringY += (mouseY - ringY) * speed;
      ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%) scale(var(--scale, 1))`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[100] hidden md:block">
      <div
        ref={ringRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: 40,
          height: 40,
          borderRadius: "999px",
          border: "1px solid rgba(214,216,222,0.8)",
          background: "var(--ring-bg, rgba(214,216,222,0))",
          mixBlendMode: "difference",
          opacity: 0,
          transition:
            "opacity var(--dur-med) var(--ease-out), border-color var(--dur-med) var(--ease-out)",
          willChange: "transform",
        }}
      />
      <div
        ref={dotRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: 5,
          height: 5,
          borderRadius: "999px",
          background: "var(--spec)",
          mixBlendMode: "difference",
          opacity: 0,
          transition: "opacity var(--dur-med) var(--ease-out)",
          willChange: "transform",
        }}
      />
    </div>
  );
}
