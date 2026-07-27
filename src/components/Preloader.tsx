"use client";

import { useEffect, useRef, useState } from "react";
import { useProgress } from "@react-three/drei";
import { stageLoad } from "@/lib/stageLoad";

/**
 * Editorial preloader. Counts 001→100 while the hero form loads, then the curtain lifts —
 * backdrop (z190, under the stage) and readout (z220, over it) leaving together. Plays once
 * per session, skipped under reduced motion.
 *
 * IT NOW MEASURES SOMETHING. It used to count a flat 4000ms of wall clock, which is not a
 * progress bar, it is an animation wearing one — the readout hit 100 whether anything had
 * loaded or not. Measured on a WARM cache: the canvas does not exist until 3223ms, and the
 * HDRI that gives the form its chrome finishes at 3774ms against a lift starting at ~4000ms.
 * 226ms of margin, with both heavy assets served from cache. On a first visit that order
 * inverts and the curtain rises on a dull grey form that turns chrome half a second later.
 *
 * So the gate is the real one — three.js's own loading manager, via drei's useProgress — with
 * the clock kept only as a FLOOR so a warm cache does not flash the intro past in 300ms, and
 * a CEILING so a failed asset cannot strand anyone on a black screen.
 *
 * The readout is min(clock, real): never ahead of what has actually loaded, never faster than
 * the floor. On a warm cache it paces; on a cold one it genuinely waits.
 *
 * The furniture is one rule and one number, on the bottom margin. It used to carry a
 * "[ Loading ]" label, a "[ PORTFOLIO ]" tag and a 600px ChromeCounter in the middle of the
 * screen — three things competing with the only thing worth watching. What is left says the
 * same amount.
 *
 * 001, not 0 — zero-padded to three digits, the page's own way of numbering (N°003, the
 * 01/02/03 of the sections).
 */

/** Minimum time on screen. Without it a cached load is a 300ms flicker, which reads as a
 *  glitch rather than as an intro. */
const FLOOR_MS = 4000;

/** Hard maximum. A 404 on the HDRI, a dead WebGL context, an asset that never settles — none
 *  of those should leave a visitor looking at a black screen for ever. */
const CEILING_MS = 9000;

export function Preloader() {
  const [count, setCount] = useState(0);
  const [phase, setPhase] = useState<"load" | "wipe" | "done">("load");

  /* drei's useProgress reads three.js's DefaultLoadingManager, so it sees the glb and the HDRI
     without either of them knowing about it. The `total > 0` guard is the trap in this API:
     before anything has been queued it reports progress 100 of 0 items, which as a gate would
     mean "ready" on the very first frame. */
  const { active, progress, total } = useProgress();
  const readyRef = useRef(false);
  const realRef = useRef(100);
  useEffect(() => {
    readyRef.current = total > 0 && !active;
    realRef.current = total > 0 ? progress : 100;
  }, [active, progress, total]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // prod: once per session; dev: replay on every reload so it's testable
    const seen =
      process.env.NODE_ENV === "production" &&
      sessionStorage.getItem("introShown");
    if (reduced || seen) {
      setPhase("done");
      return;
    }
    sessionStorage.setItem("introShown", "1");
    document.body.style.overflow = "hidden";

    let raf = 0;
    let start = 0;
    const timers: number[] = [];

    /* LINEAR, and capped at 099 until the gate actually opens.
       Both halves fix the same fault: the readout used to reach 100 and then sit there. It was
       eased (cubic-out), so it crossed 99.5 at 83% of the floor — 3316ms of 4000 — and the
       curtain could not move until 4000. That is two thirds of a second of a loader claiming to
       be finished while nothing happens, which is the worst thing a progress readout can do.
       Linear spends the floor evenly, and the 99 cap means 100 is now a statement rather than a
       prediction: it appears on the same frame the curtain starts. */
    const step = (ts: number) => {
      if (!start) start = ts;
      const elapsed = ts - start;
      const clock = Math.min(elapsed / FLOOR_MS, 1) * 100;

      const open =
        (elapsed >= FLOOR_MS && readyRef.current) || elapsed >= CEILING_MS;

      if (!open) {
        // Never ahead of what has actually loaded, never faster than the floor, and never 100.
        // On a cold cache the clock is pinned and this sits on the real figure, waiting — which
        // is the whole point of the gate.
        setCount(Math.max(1, Math.min(99, Math.round(Math.min(clock, realRef.current)))));
        raf = requestAnimationFrame(step);
        return;
      }

      setCount(100);
      setPhase("wipe");

      /* The lift is a full-screen transform, and this page has already been bitten once by
         exactly that: a moving full-screen layer composited against a WebGL canvas that repaints
         every frame starves the compositor (see stageLoad for the frame counts). The menu's
         curtain solves it by stopping the form's loop for the worst of the overlap; this one has
         the same conflict and had no such guard, which is why the lift stuttered.
         260ms covers the interval where the plane still covers most of the screen — and while it
         does, the form behind it cannot be seen standing still. */
      stageLoad.set("paused");
      timers.push(window.setTimeout(() => stageLoad.set("live"), 260));

      // Just past the 1300ms lift, so the plane is fully off screen before it is unmounted —
      // cut short, it would vanish mid-travel.
      timers.push(
        window.setTimeout(() => {
          setPhase("done");
          document.body.style.overflow = "";
        }, 1400)
      );
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      document.body.style.overflow = "";
      stageLoad.set("live");
    };
  }, []);

  if (phase === "done") return null;

  const lift = phase === "wipe" ? "translateY(-101%)" : "translateY(0)";
  /* The same GESTURE as the section menu's curtain, on the same --ease-out: this page has one
     way for "a black plane leaves upward and gives you the page", and it should not be spelled
     two ways. --ease-out is front-loaded, so the plane commits immediately and the last third
     is a settle nobody waits through; the cubic-bezier(0.76, 0, 0.24, 1) that was here before
     eased IN, which on a departure reads as reluctance.
     Longer than the menu's 980ms, though — this one is the page arriving for the first time and
     it is allowed to take its time. (See .nav-veil in globals.css, and the note there on why the
     ENTRANCE uses the opposite curve.) */
  const ease = "transform 1300ms var(--ease-out)";

  return (
    /* ONE layer, not two. There used to be a backdrop at z190 and the readout at z220, split so
       the form could sit between them — and nothing does that any more. Two full-screen
       composited planes animating the same transform in lockstep is twice the work for an
       identical picture, on the one gesture this page cannot afford to drop frames in. */
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 190,
        background: "var(--void)",
        pointerEvents: "none",
        transform: lift,
        transition: ease,
        willChange: "transform",
      }}
    >
        {/* A fifth of the screen up from the bottom. Sitting on the margin it read as browser
            chrome rather than as part of the page; on vh the offset stays the same fraction of
            whatever screen it lands on. */}
        <div className="shell relative flex h-full flex-col justify-end pb-[20vh]">
          {/* The readout sits on the far end of the rule it belongs to — the number is where
              the line is heading, not a caption beside it. tabular-nums so the digits do not
              re-space on every tick, which at this size is the difference between a counter
              and a flicker, and tracking pulled right in because at this size the 0.24em that
              suits a mono LABEL turns three digits into three separate objects. */}
          {/* items-baseline, not center: a unit set beside a figure sits on the figure's
              baseline — centred against 56px of digits it floats in the middle of them and
              reads as a separate object rather than as their unit. */}
          <div className="flex items-baseline justify-end gap-2">
            {/* IBM Plex Mono 200, not the page's Space Mono — see --font-mono-thin in
                layout.tsx. Space Mono has no cut lighter than 400, and at 56px its regular is
                what read as bold. The tracking opens back up to 0.1em because a thin face needs
                air: the stroke no longer separates the digits, so the spacing has to. */}
            <span
              className="text-[clamp(1.5rem,4.5vw,3.5rem)] leading-none tabular-nums tracking-[0.1em] text-chrome"
              style={{ fontFamily: "var(--font-mono-thin), monospace", fontWeight: 200 }}
            >
              {String(count).padStart(3, "0")}
            </span>
            {/* WHY IT LOOKED THINNER THAN THE DIGITS, AND IT WAS NOT THE WEIGHT. Two causes,
                both mine: it was set in --silver against the figure's --chrome, which at this
                size reads as faded rather than as quiet; and stroke thickness scales with font
                size, so Space Mono 400 at 21px lays down about the same 1.9px stem as IBM Plex
                200 does at 56px — the heavier cut, three times smaller, comes out no thicker.
                So it goes up in value and up in size. Kept in Space Mono, the page's mono: the
                thin face is for the READOUT, and a unit is a label. */}
            <span className="font-mono text-[clamp(1rem,1.9vw,1.6rem)] leading-none tracking-[0.06em] text-silver-bright">
              %
            </span>
          </div>

          {/* A track and a fill, not a lone growing rule: the unfilled remainder is what makes
              it a measure of something rather than a line that happens to be short.
              2px, not the page's usual hairline — a 1px rule is the page's furniture weight
              (hairlines, notches, the barcode's thin bars), and this is the only thing on
              screen. It has to hold its own against a 3.5rem number. */}
          <div className="mt-4 h-[2px] w-full" style={{ background: "var(--steel)" }}>
            <div
              className="h-[2px] w-full origin-left"
              style={{
                background: "var(--chrome)",
                transform: `scaleX(${count / 100})`,
                transition: "transform 0.1s linear",
              }}
            />
          </div>

      </div>
    </div>
  );
}
