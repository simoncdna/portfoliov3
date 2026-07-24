"use client";

import { useCallback, useRef, useState } from "react";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&/*+<>";

/**
 * Hover "decode" effect: the word's letters flicker through random glyphs and
 * resolve left-to-right back to the original, while the word vibrates slightly.
 * Monospace keeps the width stable (no layout shift). Respects reduced-motion.
 */
export function ScrambleText({
  text,
  prefix = "",
  suffix = "",
  className = "",
}: {
  text: string;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const [display, setDisplay] = useState(text);
  const [glitching, setGlitching] = useState(false);
  const raf = useRef(0);

  const run = useCallback(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    cancelAnimationFrame(raf.current);
    const start = performance.now();
    const DUR = 520;
    setGlitching(true);
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / DUR);
      const revealed = p * text.length;
      let out = "";
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === " ") out += " ";
        else if (i < revealed) out += ch;
        else out += GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      setDisplay(out);
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else {
        setDisplay(text);
        setGlitching(false);
      }
    };
    raf.current = requestAnimationFrame(tick);
  }, [text]);

  return (
    <span className={className} onPointerEnter={run} onFocus={run}>
      {prefix}
      <span
        className={glitching ? "text-glitch" : ""}
        style={{ display: "inline-block" }}
      >
        {display}
      </span>
      {suffix}
    </span>
  );
}
