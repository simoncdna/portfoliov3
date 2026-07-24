"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Real EAN-13 barcode (13 digits, the last a computed check digit). Renders
 * genuine bar modules plus the digits below.
 *
 * On hover, ONE scramble runs over the whole row (same decode/glitch as the
 * nav): every slot flickers through random glyphs and locks left-to-right onto
 * its target — either a letter of `hoverWord` (default "OPEN", centred) or
 * nothing, so non-letter digits simply vanish. Single animation, no phases.
 * Vanished/hole slots keep a non-breaking space so their width stays fixed and
 * the revealed word never shifts.
 *
 * Pass 12 meaningful digits via `code`; the 13th (check) digit is computed.
 */

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&/*+<>";
const NB = "\u00a0"; // non-breaking space: invisible but keeps the slot width

// 7-module encodings
const L = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
const G = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"];
const R = ["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"];
// parity of the 6 left digits, selected by the first digit
const PARITY = ["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"];

function checkDigit(d12: number[]): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += d12[i] * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

function normalize(code: string): number[] {
  const only = code.replace(/\D/g, "").slice(0, 12).padStart(12, "0");
  const d = only.split("").map(Number);
  return [...d, checkDigit(d)];
}

function modules(d: number[]): string {
  const parity = PARITY[d[0]];
  let s = "101"; // start guard
  for (let i = 0; i < 6; i++) s += (parity[i] === "L" ? L : G)[d[i + 1]];
  s += "01010"; // center guard
  for (let i = 0; i < 6; i++) s += R[d[i + 7]];
  s += "101"; // end guard
  return s;
}

export function BarcodeEAN13({
  code,
  className = "",
  gaps = [3, 6, 9],
  hoverWord = "OPEN",
}: {
  code: string;
  className?: string;
  /** 0-based digit positions to blank out (leaves a hole in the number row) */
  gaps?: number[];
  /** word revealed by the hover scramble, centred on the digit row */
  hoverWord?: string;
}) {
  const d = normalize(code);
  const mods = modules(d);
  const digits = d.join("");
  const N = digits.length; // 13
  const hidden = useMemo(() => new Set(gaps), [gaps]);

  // centre the word across the 13 slots → which slot holds which letter
  const letters = useMemo(() => {
    const w = hoverWord.toUpperCase();
    const start = Math.floor((N - w.length) / 2);
    const m = new Map<number, string>();
    w.split("").forEach((ch, k) => m.set(start + k, ch));
    return m;
  }, [hoverWord, N]);

  // per-slot lock thresholds, scattered (NOT positional) so slots settle
  // together in the back half rather than sweeping left-to-right
  const thresholds = useMemo(
    () =>
      Array.from(
        { length: N },
        (_, i) => 0.5 + (Math.abs(Math.sin((i + 1) * 127.1)) % 1) * 0.45
      ),
    [N]
  );

  const [hovering, setHovering] = useState(false);
  const [prog, setProg] = useState(0);
  const raf = useRef(0);

  // measure the slot pitch → exact px offset to centre the (even-length) word,
  // which otherwise lands half a slot off on the 13-slot grid
  const rowRef = useRef<HTMLSpanElement>(null);
  const [centerOffset, setCenterOffset] = useState(0);
  useEffect(() => {
    const measure = () => {
      const el = rowRef.current;
      if (!el || el.children.length < N) return;
      const cx = (i: number) => {
        const r = el.children[i].getBoundingClientRect();
        return r.left + r.width / 2;
      };
      const pitch = (cx(N - 1) - cx(0)) / (N - 1);
      const start = Math.floor((N - hoverWord.length) / 2);
      const groupCenterIdx = start + (hoverWord.length - 1) / 2;
      setCenterOffset(((N - 1) / 2 - groupCenterIdx) * pitch);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [N, hoverWord]);

  const run = useCallback(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setProg(1);
      return;
    }
    cancelAnimationFrame(raf.current);
    const start = performance.now();
    const DUR = 620;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / DUR);
      setProg(p);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, []);

  const onEnter = () => {
    // measure fresh (layout is settled by hover time) → exact centering offset
    const el = rowRef.current;
    if (el && el.children.length >= N) {
      const cx = (i: number) => {
        const r = el.children[i].getBoundingClientRect();
        return r.left + r.width / 2;
      };
      const pitch = (cx(N - 1) - cx(0)) / (N - 1);
      const start = Math.floor((N - hoverWord.length) / 2);
      const groupCenterIdx = start + (hoverWord.length - 1) / 2;
      setCenterOffset(((N - 1) / 2 - groupCenterIdx) * pitch);
    }
    setHovering(true);
    run();
  };
  const onLeave = () => {
    cancelAnimationFrame(raf.current);
    setHovering(false);
    setProg(0);
  };

  let x = 0;
  const rects = mods.split("").map((m, i) => {
    const rect =
      m === "1" ? (
        <rect key={i} x={x} y={0} width={1} height={40} fill="var(--silver-bright)" />
      ) : null;
    x += 1;
    return rect;
  });

  // ONE "casino reel" scramble: all slots spin glyphs at once and stop together
  // (each on its scattered threshold) onto its target — a letter, or NB (the
  // non-letter digits disappear). NB keeps slot width fixed so nothing shifts.
  const slots = digits.split("").map((c, i) => {
    const isLetter = letters.has(i);
    if (hidden.has(i) && !isLetter) return { ch: NB, gl: false, on: false };
    if (!hovering) return { ch: hidden.has(i) ? NB : c, gl: false, on: false };
    const locked = prog >= thresholds[i];
    if (!locked)
      return { ch: GLYPHS[(Math.random() * GLYPHS.length) | 0], gl: true, on: false };
    return { ch: letters.get(i) ?? NB, gl: false, on: isLetter };
  });

  return (
    <span
      className={`inline-flex flex-col gap-1 ${className}`}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
    >
      <svg
        aria-hidden
        viewBox={`0 0 ${mods.length} 40`}
        preserveAspectRatio="none"
        role="presentation"
        className="h-7 w-full"
      >
        {rects}
      </svg>
      {/* 13 fixed-width slots, edge-to-edge; one scramble resolves to OPEN.
          On hover the row nudges half a slot so the word sits dead-centre. */}
      <span
        ref={rowRef}
        aria-label={`Barcode ${digits}`}
        className="flex w-full justify-between font-mono text-[0.58rem] uppercase leading-none text-silver-muted"
        style={{
          // tie the centring nudge to the animation: 0 at the start (digits stay
          // in place), +½ slot only as OPEN forms → no jump before the scramble
          transform: `translateX(${centerOffset * prog}px)`,
        }}
      >
        {slots.map((s, i) => (
          <span
            key={i}
            className={s.gl ? "text-glitch" : ""}
            style={{
              display: "inline-block",
              color: s.on ? "var(--silver-bright)" : undefined,
            }}
          >
            {s.ch}
          </span>
        ))}
      </span>
    </span>
  );
}
