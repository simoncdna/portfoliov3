"use client";

import { useEffect, useRef } from "react";

/**
 * Custom crosshair / reticle cursor: a thin silver "+" that tracks the pointer
 * precisely and grows over interactive elements. mix-blend-mode: difference so
 * it reads on both the black void and bright chrome. Pointer-fine devices only.
 */
export function Cursor() {
  const posRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const finePointer = window.matchMedia(
      "(hover: hover) and (pointer: fine)"
    ).matches;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    // reduced-motion users keep the native cursor (see globals.css)
    if (!finePointer || reduced) return;

    const pos = posRef.current!;
    let visible = false;

    const onMove = (e: PointerEvent) => {
      if (!visible) {
        visible = true;
        pos.style.opacity = "1";
      }
      // precise: the reticle snaps to the pointer (no trail, constant size)
      pos.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) translate(-50%, -50%)`;
    };

    const onLeave = () => {
      visible = false;
      pos.style.opacity = "0";
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  const line: React.CSSProperties = {
    position: "absolute",
    background: "rgba(220,222,228,0.95)",
  };

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[100] hidden md:block"
    >
      <div
        ref={posRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: 22,
          height: 22,
          opacity: 0,
          mixBlendMode: "difference",
          transition: "opacity var(--dur-med) var(--ease-out)",
          willChange: "transform",
        }}
      >
        <div style={{ position: "absolute", inset: 0, opacity: 0.9 }}>
          {/* horizontal + vertical hairlines forming the crosshair */}
          <span style={{ ...line, top: "50%", left: 0, width: "100%", height: 1, transform: "translateY(-50%)" }} />
          <span style={{ ...line, left: "50%", top: 0, height: "100%", width: 1, transform: "translateX(-50%)" }} />
        </div>
      </div>
    </div>
  );
}
