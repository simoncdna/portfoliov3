"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PANEL_CLOSE_MS, useBlobOpen } from "@/lib/blobTweak";

/**
 * Real EAN-13 barcode (13 digits, the last a computed check digit): genuine bar
 * modules + the digits below.
 *
 * Interaction tied to the TWEAK control panel:
 *  - hover (panel closed): the digits scramble into `hoverWord` (TWEAK), the
 *    barcode lights up white and breathes (invites a click);
 *  - click → panel opens: the white freezes (breathing stops), TWEAK stays;
 *  - panel closes: it stays lit through the reverse "piano" retract, then — if
 *    the cursor has left the barcode — it turns off and TWEAK scrambles back to
 *    the digits, in sync.
 *
 * Pass 12 meaningful digits via `code`; the 13th (check) digit is computed.
 */

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&/*+<>";
const NB = " "; // non-breaking space: invisible but keeps the slot width

// off-delays. On panel close we hold TWEAK lit long enough to overlap the
// reverse-"piano" retract, then scramble back \u2014 starting the casino slightly
// before the retract fully ends keeps the gap between the two tight. A plain
// hover-out settles quickly.
const CLOSE_GRACE_MS = PANEL_CLOSE_MS - 250;
const HOVER_OFF_MS = 100;

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

type Dir = "tweak" | "digits" | null;

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
  /** word revealed by the scramble, centred on the digit row */
  hoverWord?: string;
}) {
  const d = normalize(code);
  const mods = modules(d);
  const digits = d.join("");
  const N = digits.length; // 13
  const hidden = useMemo(() => new Set(gaps), [gaps]);

  const letters = useMemo(() => {
    const w = hoverWord.toUpperCase();
    const start = Math.floor((N - w.length) / 2);
    const m = new Map<number, string>();
    w.split("").forEach((ch, k) => m.set(start + k, ch));
    return m;
  }, [hoverWord, N]);

  // scattered lock thresholds → slots settle together (not left-to-right)
  const thresholds = useMemo(
    () =>
      Array.from(
        { length: N },
        (_, i) => 0.5 + (Math.abs(Math.sin((i + 1) * 127.1)) % 1) * 0.45
      ),
    [N]
  );

  const open = useBlobOpen();
  const [hovering, setHovering] = useState(false);
  const [on, setOn] = useState(false); // showing TWEAK (hover / panel open / close-grace)
  const [revealed, setRevealed] = useState(false); // steady TWEAK state
  const [anim, setAnim] = useState(0); // 0..1 current scramble
  const [animTo, setAnimTo] = useState<Dir>(null);
  const raf = useRef(0);
  const rowRef = useRef<HTMLSpanElement>(null);
  const [centerOffset, setCenterOffset] = useState(0);

  // bright = white + full opacity. It stays bright through EITHER scramble and
  // only dims once fully settled back on the digits — so the opacity reduction
  // happens at the END of the reverse casino, never at its start.
  const bright = on || animTo !== null;

  const measure = useCallback(() => {
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
  }, [N, hoverWord]);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const runTransition = useCallback(
    (dir: "tweak" | "digits") => {
      measure();
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setRevealed(dir === "tweak");
        setAnimTo(null);
        setAnim(1);
        return;
      }
      cancelAnimationFrame(raf.current);
      setAnimTo(dir);
      const start = performance.now();
      const DUR = 620;
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / DUR);
        setAnim(p);
        if (p < 1) raf.current = requestAnimationFrame(tick);
        else {
          setRevealed(dir === "tweak");
          setAnimTo(null);
        }
      };
      raf.current = requestAnimationFrame(tick);
    },
    [measure]
  );

  // Single edge-driven state machine. `want` (hover or panel open) turning true
  // reveals TWEAK immediately; turning false schedules the scramble-back after a
  // grace delay — long enough to overlap the panel's reverse-"piano" retract when
  // the panel was open, quick otherwise. Deriving it from ONE effect (not a
  // recomputed `active` const) avoids the transient false→true flicker that
  // fired a spurious digit scramble the instant the panel closed.
  const want = hovering || open;
  const prevWant = useRef(false);
  const prevOpen = useRef(false);
  const offTimer = useRef(0);
  useEffect(() => {
    const wasWant = prevWant.current;
    const wasOpen = prevOpen.current;
    prevWant.current = want;
    prevOpen.current = open;

    if (want) {
      clearTimeout(offTimer.current);
      if (!wasWant) {
        setOn(true);
        runTransition("tweak");
      }
      return;
    }
    if (wasWant) {
      const delay = wasOpen ? CLOSE_GRACE_MS : HOVER_OFF_MS;
      clearTimeout(offTimer.current);
      offTimer.current = window.setTimeout(() => {
        setOn(false);
        runTransition("digits");
      }, delay);
    }
  }, [want, open, runTransition]);

  const barFill = bright ? "#ffffff" : "var(--silver-bright)";
  let x = 0;
  const rects = mods.split("").map((m, i) => {
    const rect =
      m === "1" ? (
        <rect key={i} x={x} y={0} width={1} height={40} fill={barFill} />
      ) : null;
    x += 1;
    return rect;
  });

  const tweakCh = (i: number) => letters.get(i) ?? NB;
  const digitCh = (i: number) => (hidden.has(i) ? NB : digits[i]);
  const slots = digits.split("").map((c, i) => {
    if (hidden.has(i) && !letters.has(i)) return { ch: NB, gl: false, on: false };
    if (animTo) {
      if (anim < thresholds[i])
        return { ch: GLYPHS[(Math.random() * GLYPHS.length) | 0], gl: true, on: false };
      return animTo === "tweak"
        ? { ch: tweakCh(i), gl: false, on: letters.has(i) }
        : { ch: digitCh(i), gl: false, on: false };
    }
    if (revealed) return { ch: tweakCh(i), gl: false, on: letters.has(i) };
    return { ch: digitCh(i), gl: false, on: false };
  });

  // how much TWEAK is formed (drives the ½-slot centring nudge)
  const shown =
    animTo === "tweak" ? anim : animTo === "digits" ? 1 - anim : revealed ? 1 : 0;
  const onColor = bright ? "#ffffff" : "var(--silver-bright)";

  // breathe only once the casino reveal has fully settled on TWEAK, while hovered
  // and the panel is closed (starts AFTER the scramble, never during it)
  const breathing = hovering && !open && revealed && !animTo;

  return (
    <span
      className={`inline-flex flex-col gap-1 ${breathing ? "barcode-breath" : ""} ${className}`}
      style={{
        // dim at rest so the white "lit" state reads as a clear brightening.
        // `bright` stays true through the reverse scramble, so this only drops to
        // 0.5 once the casino has fully settled back on the digits. The breathing
        // animation (which starts at opacity 1) overrides this while it runs.
        opacity: bright ? 1 : 0.5,
        transition: "opacity 480ms ease",
      }}
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => setHovering(false)}
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
      <span
        ref={rowRef}
        aria-label={`Barcode ${digits}`}
        className="flex w-full justify-between font-mono text-[0.58rem] uppercase leading-none"
        style={{
          transform: `translateX(${centerOffset * shown}px)`,
          color: bright ? "#f3f5fa" : "var(--silver-muted)",
        }}
      >
        {slots.map((s, i) => (
          <span
            key={i}
            className={s.gl ? "text-glitch" : ""}
            style={{ display: "inline-block", color: s.on ? onColor : undefined }}
          >
            {s.ch}
          </span>
        ))}
      </span>
    </span>
  );
}
