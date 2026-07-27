"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The default pool the letters churn through. Uppercase plus a handful of operators:
 * enough noise to read as interference, all of it drawn from the same technical
 * alphabet as the rest of the page.
 *
 * Callers should pass a narrower `pool` when the churn happens at display size — see
 * the prop.
 */
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&/*+<>";

/**
 * How often a churning slot draws a new glyph (ms). Deliberately decoupled from the
 * frame rate: at 60 fps every-frame churn is a grey blur with no legible letters in
 * it, and on a 120 Hz screen it would be twice as fast for no reason. 40 ms is the
 * rate at which the eye still catches individual letters going past.
 */
const TICK = 40;

/**
 * How long every letter churns together before the first one locks (ms). This is the
 * beat the old hover version was missing — it resolved letter 0 immediately, so the
 * word never looked jammed, only progressively typed. The name has to break up
 * completely first; that is what makes it read as brouillage.
 */
const LEAD = 330;

/** Delay between two consecutive letters locking (ms). */
const LOCK_STEP = 70;

/*
 * LEAD and LOCK_STEP move WITH Work's DWELL or not at all. The dwell floor exists so
 * every plate is held until its own name has finished decoding: at 330 + 8 locks of 70
 * the longest name settles in ~890ms, inside the 900ms dwell. They were 620/90 against a
 * 1400ms dwell — same invariant, slower room. Speeding one side up without the other
 * either churns names over each other or holds plates for a decode already done.
 */

/**
 * A name that scrambles itself when it changes.
 *
 * Driven by the `text` prop rather than by pointer events: in Work the plate is
 * chosen by the scroll (and by the 01–04 picks), so the trigger has to be the value
 * arriving, not a cursor. Mounting does not scramble — the first name is simply
 * there.
 *
 * Monospace at the call site keeps the width stable while the letters churn.
 */
export function ScrambleText({
  text,
  pool = GLYPHS,
  className = "",
}: {
  text: string;
  /**
   * The glyphs to churn through. Worth narrowing to the letters that actually appear
   * in the words being swapped: on a condensed display face the churn's width is the
   * word's width, and a pool full of `W`s and `#`s makes a four-letter name lurch
   * sideways while it decodes.
   */
  pool?: string;
  className?: string;
}) {
  // The noise currently on screen, or null when there is none — in which case the
  // render shows `text` itself. Holding the churn rather than "the string to display"
  // is what keeps the effect below free of any setState: arriving at a new name with
  // nothing to animate (reduced motion) needs no state change at all, it just renders
  // the new prop.
  const [churn, setChurn] = useState<string | null>(null);
  const raf = useRef(0);
  // The name we are currently churning toward. A ref, not state: comparing against
  // it must not itself schedule a render, and the effect below has to be able to
  // tell "the prop changed" from "we re-rendered mid-churn".
  const shown = useRef(text);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    if (shown.current === text) return;
    const from = shown.current;
    shown.current = text;
    if (reduced.current) return;

    cancelAnimationFrame(raf.current);
    const start = performance.now();
    // The outgoing name's slots churn too, and only disappear when their turn to
    // lock comes: going from a nine-letter name to a four-letter one, the word
    // shortens letter by letter from the right instead of snapping short on frame
    // one — the churn stays one continuous event rather than two.
    const width = Math.max(from.length, text.length);
    // The whole word churns for LEAD, then slots lock left to right.
    const end = LEAD + Math.max(0, width - 1) * LOCK_STEP;
    // Slots are churned at TICK, not per frame — so the output only changes when a
    // slot actually draws a new glyph, and React re-renders at 25 Hz rather than 60.
    let lastTick = -Infinity;

    const tick = (now: number) => {
      const t = now - start;
      // How many slots have locked. Fractional would let one flip between locked and
      // churning on rounding; floor keeps each lock final.
      const locked = t < LEAD ? 0 : Math.floor((t - LEAD) / LOCK_STEP) + 1;

      if (now - lastTick >= TICK) {
        lastTick = now;
        let out = "";
        for (let i = 0; i < width; i++) {
          const ch = text[i];
          // Locked slots show the target letter — or nothing, if the new name is the
          // shorter one. Spaces and punctuation never churn: they are the word's
          // skeleton, and scrambling them makes it unreadable rather than jammed.
          if (i < locked) out += ch ?? "";
          else if (ch === " " || ch === "." || ch === "-") out += ch;
          else out += pool[(Math.random() * pool.length) | 0];
        }
        setChurn(out);
      }

      if (t < end) raf.current = requestAnimationFrame(tick);
      // …and hand the name back to the prop, so nothing keeps a stale copy of it.
      else setChurn(null);
    };
    raf.current = requestAnimationFrame(tick);
  }, [text, pool]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return (
    <span className={className}>
      {/* The churn is noise, so it is hidden from assistive tech; the real name is
          announced once, from the live region beside it. Reading the strip aloud
          would spell out random glyphs on every plate change. */}
      <span aria-hidden="true">{churn ?? text}</span>
      <span className="sr-only" aria-live="polite">
        {text}
      </span>
    </span>
  );
}
