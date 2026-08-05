"use client";

import { useEffect, useRef, useState } from "react";
import { sectionStore } from "@/lib/sectionStore";
import { lockPageScroll, scrollPageTo } from "@/lib/pageScroll";
import { stageLoad } from "@/lib/stageLoad";

/* ------------------------------------------------------------------
   Section menu
   ------------------------------------------------------------------
   The mark in the top-right margin, and the full-screen index it opens.

   WHY THE CORNER GETS THIS AND NOT AN ORNAMENT. The page is ~12 screens tall with a
   deliberately heavy scroll (wheelMultiplier 0.5 — see SmoothScroll), which is right for
   reading a scrubbed sequence and punishing for going back. Four anchors already existed
   and nothing pointed at them. Top-right is where a reader looks for that, so putting a
   decorative mark there was spending a load-bearing position on furniture.

   THE TRIGGER IS AN EYE. Not a hamburger (three equal rules promise a whole site's
   navigation) and not a magnifier (which promises a search there is nothing here to search).
   An eye promises looking, which is what a portfolio is for. It is drawn rather than
   photographed and it is still until pointed at — see Eye below for both reasons.

   TWO CONTROLS, NOT ONE. The trigger opens and then gets out of the way; the ✕ that
   closes sits at top centre, on the plane it belongs to. Morphing the corner mark into
   a ✕ is the tidier engineering and the worse reading: it keeps the reader's exit in the
   margin, where they have to go looking for it, when the plane they are now on is
   centred. The control should be where the eye already is.

   ROW ORDER AND THE STAGGER. Rows arrive top→bottom and leave bottom→top: the list
   builds in reading order and is put away from the far end back, the same reversal the
   ControlPanel uses for its "piano" (see its transitionDelay). The close is the open played
   backwards — not approximately, and not only in the order: the easing, the direction the
   letters travel, the ✕, the curtain's place in the queue and the corner eye's are each the
   reflection of an entrance window about the moment the entrance ends. See the way out below.

   The active row is marked from sectionStore.index, which the scroll already maintains
   for the blob's morph. It is read once, at open — the value cannot change while the
   menu is up, because the page is locked.
*/

/** Index 0 is the Hero, which the header's own wordmark already links to — a "TOP" row
 *  would be a second control for the same place. The indices match sectionStore. */
const SECTIONS = [
  { label: "About", href: "#about", section: 1 },
  { label: "Work", href: "#work", section: 2 },
  { label: "Contact", href: "#contact", section: 3 },
] as const;

/** The sequence, in order: the black screen FALLS, then the letters climb out from behind
 *  a hidden line, each on its own delay.
 *
 *  BASE_MS holds the letters back until the panel is almost down (it falls in 620ms), so
 *  the screen arrives, settles, and only then is written on. An earlier start had them
 *  climbing out of a surface still in motion, which read as one hurried event rather than
 *  two deliberate ones.
 *
 *  Both staggers reverse on the way out, so the last letter of the last word is the first
 *  thing to go. What holds the veil visible until the retreat is over is the curtain's own
 *  transitionend, not a clock — see CLOSE_FALLBACK_MS. */
const BASE_MS = 480;
const STAGGER_MS = 80;
const CHAR_MS = 38;

/* ---- and the way out ----
 * THE EXIT IS THE ENTRANCE RUN BACKWARDS. It has no constants of its own — every delay
 * below is the mirror of an entrance delay about the moment the entrance ends, so the two
 * are one gesture and its undoing rather than two animations that happen to resemble each
 * other. It used to keep a separate 75/32 pair, and separate numbers drift: they were tuned
 * against a curtain that left at 120ms and carried every still-moving letter off screen
 * with it, so nobody ever saw what they were tuning.
 *
 * THE MIRROR, once simplified. Reversing `BASE_MS + i·STAGGER + c·CHAR + 820` about
 * T = BASE_MS + 2·STAGGER + 6·CHAR + 820 cancels BASE_MS and the duration and leaves
 *
 *     (rows − 1 − i) · STAGGER_MS  +  (LONGEST − 1 − c) · CHAR_MS
 *
 * which is what EXIT_DELAY_MS computes. Two consequences worth naming, because both are the
 * mirror doing its job rather than an oversight:
 *   - rows leave bottom→top and letters right→left, last-in-first-out.
 *   - the char term counts from LONGEST, not from this row's own length. The entrance ends on
 *     CONTACT's seventh letter, so that glyph is the pivot and every shorter row is pushed
 *     later by the letters it does not have. It is why ABOUT's A is the last letter to go
 *     (starting at 388ms), which is also the right place to end: the top row, where a reader
 *     tidying bottom→top finishes.
 *
 * THE REST OF THE CHAIN IS MIRRORED IN CSS, and this is where a list of exceptions to the
 * mirror used to live. There are none left:
 *   - the letters go back DOWN below the line they came from, which is their resting
 *     transform — so the exit needs no state of its own, and a `closing` flag that existed
 *     only to send them out through the TOP is gone with it;
 *   - on --ease-in, which is --ease-out's literal reflection through (0.5, 0.5);
 *   - the ✕ leaves over [358, 638], the reflection of its [1050, 1330] arrival;
 *   - the curtain lifts last, at --nav-exit-hold's 1068 — the reflection of the fall it
 *     opened with;
 *   - the corner eye returns on the lift's final 200ms, the reflection of the 200ms in which
 *     it left.
 * Each is T − b of an entrance window, and each carries at its own site in globals.css the
 * reasoning for whatever departure it replaced. The one thing that stays asymmetric is
 * reduced motion, which collapses both directions to 1ms and has no shape to mirror.
 *
 * Total: 1688ms, exactly the entrance's. It was ~1360 while the curtain left early, and a
 * dismissal being the shorter gesture is a real thing to want — but a reversal costs what it
 * reverses. That is the price of the close BEING the open backwards instead of resembling it. */
const LONGEST_LABEL = Math.max(...SECTIONS.map((s) => s.label.length));
const EXIT_DELAY_MS = (i: number, c: number) =>
  (SECTIONS.length - 1 - i) * STAGGER_MS + (LONGEST_LABEL - 1 - c) * CHAR_MS;

/**
 * Safety net only — the veil is normally hidden on its own `transitionend`.
 *
 * It used to be the primary mechanism, at 760ms, and that was a bug: the curtain takes
 * 80 + 560ms and the transition does not begin the instant the class flips (~90ms of
 * render latency was measurable), which put the hide about ten milliseconds after the
 * lift was due to finish. On any machine slightly slower than the one it was tuned on,
 * `visibility: hidden` landed mid-lift — so the curtain vanished on the spot instead of
 * rising. Timing a hide to an animation's expected duration is a race by construction;
 * the animation itself is the only thing that knows when it is done.
 *
 * This is kept for the cases where the event never arrives at all: a tab backgrounded
 * mid-close, reduced motion collapsing the transition, a lift interrupted by a resize.
 * Without it the rows would stay in the tab order for ever.
 *
 * The exit is due at 1688ms — --nav-exit-hold's 1068 while the letters retreat, then the
 * curtain's own 620 — and this is deliberately well clear of it rather than just past it.
 * 1800 was tried against the older, shorter exit and is wrong for the reason above: the event
 * was measured landing at 1757ms under main-thread pressure, some 400ms behind a due time of
 * ~1360, because the blob is running by then and `transitionend` is dispatched on the main
 * thread. A fallback that can beat the real event is not a safety net, it is the mid-lift
 * `visibility: hidden` bug reintroduced through the back door. 2800 keeps the same margin over
 * 1688 + 400 that the old 2400 kept over 1360 + 400. Anything the event genuinely never
 * arrives for is not in a hurry, so the headroom is free.
 */
const CLOSE_FALLBACK_MS = 2800;

/*
 * THE BLOB IS ALIVE FROM THE FIRST FRAME OF THE CLOSE — at reduced resolution, not paused.
 *
 * A resume DELAY was tried at every setting. At the end of the lift, the form sits fully
 * uncovered and visibly frozen for the last third, then snaps into motion. At 300ms the
 * freeze was shorter and still read as a stutter. At 0ms, full resolution under the
 * curtain's heaviest overlap stalled the compositor outright — a window with ZERO frames
 * rendered, the curtain frozen at -111px, then a jump to -744.
 *
 * What buys the 0ms is resolution, not time: stageLoad's "cheap" drops the canvas to dpr 1
 * for the length of the lift, which was measured to keep the compositor fed at full overlap.
 * (This exact arrangement was tried once before and abandoned for degrading the render on
 * every open — that was the form clock's resume-delta bug, since fixed. See stageLoad.)
 *
 * Note what the target is: NOT the frame rate. It drops from ~120fps to ~50fps the moment the
 * blob resumes, and that is not a regression — ~45fps is this page's normal cost with the form
 * alive, and the 120fps stretches are simply the blob doing nothing. What reads as a bug is a
 * zero-frame window, which is a stall, not a slowdown. Tune against those.
 */

/** Mirrors the entrance duration in globals.css (.nav-veil[data-open]) — only used as the
 *  backstop for the moment the curtain is fully drawn. */
const OPEN_MS = 620;


/**
 * Deterministic fract-of-sine hash — the GLSL one-liner.
 *
 * It has to be deterministic, not random: this geometry is emitted during render, on the
 * server as well as the client, and Math.random() would hand the two different numbers and
 * fail hydration on every line.
 */
const frac = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * ONE light direction, and everything in the drawing obeys it: upper-left. In screen space
 * (x right, y down) that puts the shadow at +45°, which is where the hatching gathers, and
 * the catchlight diametrically opposite it on the pupil.
 *
 * This is what makes the thing read as a sphere rather than as a target. A flat drawing and a
 * volume differ by exactly one thing — whether the shading agrees about where the light is.
 */
const SHADOW_A = Math.PI / 4;

/**
 * Radial marks between two radii, shaded by how far they sit from the light.
 *
 * `vary` jitters angle and length, because evenly spaced marks of equal length read as an
 * INSTRUMENT — a watch bezel, a gauge — and that read is strong enough to beat everything
 * else in the drawing. Jitter turns ticks into hatching.
 *
 * `shade` then makes the hatching describe a form instead of a ring: marks near the shadow
 * are long and opaque, marks near the lit edge shrink to nothing and drop out entirely. That
 * gradient across the rim is the terminator, and it is the difference between a circle and a
 * ball.
 */
function hatch(
  n: number,
  r0: number,
  r1: number,
  { phase = 0, vary = 0, shade = 0 } = {}
) {
  const out: { x1: string; y1: string; x2: string; y2: string; o: string }[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((i + phase + (frac(i * 1.7) - 0.5) * 0.55) / n) * Math.PI * 2;
    // 1 at the shadow's centre, -1 on the lit side.
    const lit = Math.cos(a - SHADOW_A);
    if (shade > 0 && lit < -0.15) continue; // the lit rim is left bare
    const k = shade > 0 ? Math.max(0, lit) : 1;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const inner = r1 - (r1 - r0) * (shade > 0 ? 0.25 + 0.75 * k : 1);
    const outer = r1 - vary * frac(i * 3.1 + 0.5);
    out.push({
      x1: (20 + c * inner).toFixed(2),
      y1: (20 + s * inner).toFixed(2),
      x2: (20 + c * outer).toFixed(2),
      y2: (20 + s * outer).toFixed(2),
      o: (shade > 0 ? 0.14 + shade * k : 0.72).toFixed(2),
    });
  }
  return out;
}

/* Latitude arcs (the IconBlob technique) were tried here to suggest the sphere and removed:
   on a SOLID ball they read as a wireframe you can see through, which is the one thing this
   is not. On an opaque form the volume has to come from the value ramp and the terminator,
   not from a cage. */

/**
 * The eye that opens the menu. One eyeball — no lid, no lashes, no socket.
 *
 * DRAWN, NOT PHOTOGRAPHED. The references were a halftone and then an engraving of an
 * eyeball, and a photograph cannot survive here: at 40px a dithered image has ~1600 cells to
 * spend and grain needs gaps between its dots, so it lands as grey mush — the same
 * arithmetic that sent the dust to Contact. Line art is what reads at icon size, and it puts
 * the eye in the family the page already owns: ControlPanel draws its three form icons
 * exactly like this, hairlines in a 40-unit box (see IconDots / IconBlob / IconMesh).
 *
 * WHY A SPHERE IS THE EASIER DRAWING. An almond with a lid was the first attempt and it
 * fights the size: its silhouette is mostly the thin corners, which is where a 1px stroke
 * has least to say. A globe is concentric rings about one centre, which is the most legible
 * thing there is at 30px — and it is also what the reference actually shows.
 *
 * The engraving is carried by two rings of radial marks at different scales: coarse ones
 * hatching the sphere's rim, fine ones striating the iris. Every stroke is
 * `vector-effect: non-scaling-stroke`, so it stays one device pixel no matter what the
 * transforms below do to it — without that the hatching disappears the moment the pupil
 * dilates.
 *
 * STILL AT REST. No blink, no drift. An eye is the most attention-grabbing thing that can be
 * put in peripheral vision, so it earns its movement by being pointed at: then the pupil
 * dilates and follows the pointer. The tracking listener is bound on the element itself, so
 * nothing follows the mouse across the rest of the page.
 */
/**
 * How far from the eye the pointer is still noticed, as a multiple of the eye's own width.
 * At 2.6 × 32px that is a radius of ~83px — a good deal wider than the 44px control, so the
 * eye picks you up as you approach rather than only once you are on it.
 *
 * It has to be a distance test against a WINDOW listener, not a bigger element: growing the
 * button to 166px to catch the same area would put an invisible pad across the corner of
 * every page, swallowing clicks meant for whatever is under it. And it has to be bounded,
 * because an eye that follows the cursor everywhere is precisely the peripheral-motion
 * problem the mark it replaced was guilty of.
 */
const TRACK_REACH = 2.6;

function Eye() {
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    // No point tracking a pointer when the response has been turned off.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const host = el.parentElement;

    // The control is position: fixed, so its viewport rect only changes on resize — measured
    // once rather than per event, which keeps the listener free of layout reads.
    let rect = el.getBoundingClientRect();
    const measure = () => {
      rect = el.getBoundingClientRect();
    };

    let raf = 0;
    let pending: { x: number; y: number } | null = null;
    /** True while the pointer is inside the reach — the pointer then owns the gaze and the
     *  idle saccades below stand down. */
    let engaged = false;

    const apply = () => {
      raf = 0;
      if (!pending) return;
      const { x, y } = pending;
      pending = null;

      const dx = x - (rect.left + rect.width / 2);
      const dy = y - (rect.top + rect.height / 2);
      const reach = rect.width * TRACK_REACH;
      const dist = Math.hypot(dx, dy);

      if (dist > reach) {
        // Only the light goes out. The gaze is left where it is and handed back to the idle
        // saccades, so leaving reads as the eye losing interest rather than as a control
        // resetting to a neutral pose.
        engaged = false;
        el.style.setProperty("--eye-lit", "0");
        host?.removeAttribute("data-near");
        return;
      }
      if (!engaged) {
        // Entering the frame: hand the gaze over to the quick regime, so following the cursor
        // is immediate rather than inheriting the idle drift's 2.7s.
        el.style.setProperty("--gaze-dur", "260ms");
        el.style.setProperty("--turn-dur", "620ms");
        el.style.setProperty("--gaze-ease", "cubic-bezier(0.16, 1, 0.3, 1)");
      }
      engaged = true;
      host?.setAttribute("data-near", "");

      // How lit it is: 0 at the edge of its reach, 1 at the centre. Continuous rather than a
      // near/far switch, so the eye comes UP as you approach instead of snapping on at an
      // invisible boundary — the approach is the whole point of the wider window.
      el.style.setProperty("--eye-lit", (1 - dist / reach).toFixed(3));

      const clamp1 = (v: number) => (v < -1 ? -1 : v > 1 ? 1 : v);
      const nx = clamp1(dx / reach);
      const ny = clamp1(dy / reach);
      // Gaze, in SVG units. The iris is r=9.6 inside a sphere of r=18.4, so ±3.4 keeps it
      // comfortably off the rim.
      el.style.setProperty("--eye-x", (nx * 3.4).toFixed(2));
      el.style.setProperty("--eye-y", (ny * 3.4).toFixed(2));
      // And the whole ball turns a little, not just the iris inside it: a sphere that only
      // slides its iris about reads as a flat disc with a decal on it, and rotating the
      // engraving with it is what says the surface is curved and attached. Small — 7° —
      // because past that the hatching visibly carries the light source around with it, and
      // the shading is the one thing that has to appear to stay put.
      el.style.setProperty("--eye-rot", (nx * 7).toFixed(2));
    };

    // Coalesced to one update per frame: pointermove fires far more often than the screen
    // refreshes, and every extra call would be two style writes for a frame nobody sees.
    const onMove = (e: PointerEvent) => {
      pending = { x: e.clientX, y: e.clientY };
      if (!raf) raf = requestAnimationFrame(apply);
    };

    /**
     * Idle life, modelled on how a real eye actually behaves.
     *
     * Two earlier attempts each got half of it. Saccades every 1.5–4s read as a stutter: the
     * flick was right, the dead hold between flicks was not. A single 2.7s eased drift read as
     * fluid and as nothing alive — eyes do not pan.
     *
     * A human eye alternates FAST saccades with SHORT fixations, and never actually holds still
     * during them — it micro-drifts. So that is what this does, and both parts matter:
     *
     *   ~a third of the ticks are a real glance: a new point anywhere in range, 190ms of travel.
     *   The rest are micro-adjustments off the current position, 300ms, small.
     *
     * Fixations run 380–1100ms, short enough that something is nearly always in motion — which
     * is what removes the stutter without slowing anything down. --ease-out is right here where
     * it was wrong for the drift: front-loaded is exactly the shape of a saccade, fast away and
     * decelerating into the fixation.
     *
     * Still no frame loop: every tick sets a target and CSS travels. Range stays under the
     * pointer's (±2.2 against ±3.4), so being looked AT still reads as more than idling.
     */
    let gx = 0;
    let gy = 0;
    const clampTo = (v: number, lim: number) => (v < -lim ? -lim : v > lim ? lim : v);

    let idle = 0;
    const look = () => {
      // A glance, or a twitch within the current fixation.
      const glance = Math.random() < 0.34;
      if (!engaged) {
        if (glance) {
          const a = Math.random() * Math.PI * 2;
          const r = 0.55 + Math.random() * 0.45;
          gx = Math.cos(a) * r * 2.2;
          gy = Math.sin(a) * r * 1.7;
        } else {
          gx = clampTo(gx + (Math.random() - 0.5) * 1.2, 2.2);
          gy = clampTo(gy + (Math.random() - 0.5) * 1.0, 1.7);
        }
        el.style.setProperty("--gaze-dur", glance ? "190ms" : "300ms");
        el.style.setProperty("--turn-dur", glance ? "520ms" : "760ms");
        el.style.setProperty("--gaze-ease", "cubic-bezier(0.16, 1, 0.3, 1)");
        el.style.setProperty("--eye-x", gx.toFixed(2));
        el.style.setProperty("--eye-y", gy.toFixed(2));
        // The ball turns with the look, as it does under the pointer — just less.
        el.style.setProperty("--eye-rot", (gx * 1.3).toFixed(2));
      }
      // A glance earns a longer fixation than a twitch does. Both are short: measured, these
      // numbers put the eye in motion ~35% of the time, where 620/380 gave 26% and still read
      // as too composed for something meant to look alive at 38px. A real eye is mostly still,
      // but a real eye is also 24mm across and in a face.
      idle = window.setTimeout(
        look,
        glance ? 420 + Math.random() * 420 : 240 + Math.random() * 260
      );
    };
    idle = window.setTimeout(look, 400);

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", measure);
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(idle);
      host?.removeAttribute("data-near");
    };
  }, []);

  return (
    <span ref={wrapRef} aria-hidden className="nav-eye">
      <svg viewBox="0 0 40 40" width="100%" height="100%" fill="none">
        <defs>
          {/* The lit sphere. Four stops from cream through silver to steel, offset toward the
              light — a real value ramp across a SOLID ball, not a transparent wash. This is
              what carries the volume; everything else is detail on top of it. Stop colours
              come from CSS (see .nav-eye-s*), because `var()` does not resolve inside an SVG
              presentation attribute. */}
          <radialGradient id="nav-eye-sphere" cx="0.33" cy="0.26" r="0.78">
            <stop offset="0" className="nav-eye-s0" />
            <stop offset="0.34" className="nav-eye-s1" />
            <stop offset="0.62" className="nav-eye-s2" />
            <stop offset="0.86" className="nav-eye-s3" />
            <stop offset="1" className="nav-eye-s4" />
          </radialGradient>
        </defs>

        {/* Everything inside turns together — see --eye-rot. */}
        <g className="nav-eye-turn">
        {/* The ball, opaque. Its detail is all DARK, which is the way round an engraving on a
            pale sphere works — and the way round that survives 32px, because the drawing is
            then a mass of value rather than a cage of hairlines. */}
        <circle cx="20" cy="20" r="18.4" fill="url(#nav-eye-sphere)" />

        {/* Terminator hatching, in the page's own black: it gathers where the light is not and
            drops out entirely on the lit side. Dark ink on a pale ball — light hatching would
            be a highlight, which is the opposite of shading. */}
        {hatch(44, 13.2, 18.2, { vary: 1.4, shade: 0.5 }).map((s, i) => (
          <line
            key={i}
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            opacity={s.o}
            className="nav-eye-shade"
            strokeWidth="0.45"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <g className="nav-eye-gaze">
          {/* the iris: a dark disc on the pale sphere, striated in a lighter tone so the
              striations read AGAINST it rather than into it */}
          <circle cx="20" cy="20" r="9.2" className="nav-eye-iris" />
          {hatch(28, 4.9, 8.9, { phase: 0.5, vary: 1.3 }).map((s, i) => (
            <line
              key={i}
              x1={s.x1}
              y1={s.y1}
              x2={s.x2}
              y2={s.y2}
              opacity={s.o}
              className="nav-eye-stria"
              strokeWidth="0.5"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <circle
            cx="20"
            cy="20"
            r="9.2"
            className="nav-eye-shade"
            strokeWidth="0.6"
            vectorEffect="non-scaling-stroke"
            fill="none"
          />
          <g className="nav-eye-pupil">
            {/* Breathing, on its own group so the idle scale MULTIPLIES with the hover
                dilation instead of one overwriting the other. */}
            <g className="nav-eye-breath">
            <circle cx="20" cy="20" r="4.5" className="nav-eye-pupil-fill" />
            {/* THE CATCHLIGHT, and it is round for a reason. A tapered wedge was the first
                take — closer to the engraving's streak — and at every size it read as a
                CURSOR ARROW sitting on the pupil: a triangle with a point aimed inward is
                one of the few shapes the eye recognises faster than "eye". A tilted ellipse
                straddling the pupil's upper-left edge cannot be mistaken for anything but a
                specular, and it is the only fully bright mark in the drawing.
                Positioned diametrically opposite the shading — same light, one direction. */}
            <ellipse
              className="nav-eye-glint"
              cx="17.6"
              cy="17.6"
              rx="1.9"
              ry="1.2"
              transform="rotate(-42 17.6 17.6)"
            />
            </g>
          </g>
        </g>
        </g>
      </svg>
    </span>
  );
}

export function SectionNav() {
  const [open, setOpen] = useState(false);
  /** Kept true through the close transition: the veil may only become `visibility:
   *  hidden` — which is what takes the rows out of the tab order — once they have
   *  finished leaving.
   *
   *  It is the only extra state the close needs. There was a second one, `closing`, for as
   *  long as the letters left through the top of the mask: that destination was neither their
   *  resting position nor their open one, so it had to be described somewhere. Now that the
   *  exit is the entrance reversed they go back to exactly where they came from, `!open` says
   *  it in full, and the class of bug the flag brought with it — the snap back to rest having
   *  to be hidden behind `show`, and a re-open mid-close having to clear one flag before
   *  setting the other — is gone rather than handled. */
  const [show, setShow] = useState(false);
  const [here, setHere] = useState(-1);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const veilRef = useRef<HTMLDivElement>(null);

  /** Opening is an event, so everything it sets is set here rather than in an effect
   *  reacting to `open` — one render instead of a cascade. sectionStore is a plain
   *  mutable object with no subscription, and this is the only moment its value is
   *  needed: the page cannot scroll while the menu is up, so it cannot go stale. */
  const openMenu = () => {
    setHere(sectionStore.index);
    setShow(true);
    setOpen(true);
  };

  const closeMenu = () => {
    setOpen(false);

    // Focus would otherwise be sitting on a row that is about to become
    // `visibility: hidden`, which drops it to <body> and loses the reader's place.
    triggerRef.current?.focus();
  };

  /**
   * Both ends of the curtain's travel, off the curtain's own transitionend rather than off a
   * clock.
   *
   * Arriving: the screen is now fully covered, so the stage cannot be seen at all and its
   * loop is stopped outright.
   *
   * Leaving: full resolution comes back and the rows leave the tab order. ("cheap" was
   * already set when the close began, so the blob has been alive throughout the lift.)
   * Nothing has to be hidden behind this hide any more — the letters are parked at their
   * resting transform by the time it runs, which is where `!open` already had them going.
   */
  useEffect(() => {
    const veil = veilRef.current;
    if (!veil) return;

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      stageLoad.set("live");
      setShow(false);
    };

    const onEnd = (e: TransitionEvent) => {
      // The veil's OWN travel. The letters and the ✕ finish inside this element too and
      // their events bubble; acting on those would fire either end early — for the exit
      // that meant hiding the curtain while it was still moving, which is the bug this
      // whole arrangement replaced.
      if (e.target !== veil || e.propertyName !== "transform") return;
      if (open) stageLoad.set("paused");
      else finish();
    };
    veil.addEventListener("transitionend", onEnd);

    const timers: number[] = [];
    if (open) {
      // Backstop for a transitionend that never lands: a tab backgrounded mid-travel,
      // reduced motion collapsing the transition, a resize interrupting it.
      timers.push(window.setTimeout(() => stageLoad.set("paused"), OPEN_MS + 150));
    } else {
      // The blob is alive for the whole lift, at reduced resolution — see the compositor
      // note above OPEN_MS. Full resolution returns in finish(), once the veil is off.
      // Since the curtain holds for --nav-exit-hold, this resume lands a full 1068ms BEFORE
      // the lift, behind a screen that is still entirely black: the form is warm and
      // running by the time any of it can be seen, which is what that note was trying to
      // buy with a 0ms delay. Left at the top of the close rather than moved onto a timer
      // of its own — a resume nobody can see needs no timing.
      // Guarded on the veil actually being up: this effect also runs on MOUNT with
      // open=false, and a page that loads into low resolution for nobody is the bug the
      // guard prevents. The inline style is `show`'s reflection in the DOM, which keeps
      // the effect's deps at [open] — putting `show` in the deps would re-run this branch
      // when finish() drops it and turn the stage back down right after handing it back.
      if (veil.style.visibility === "visible") stageLoad.set("cheap");
      // And without this the rows would stay tabbable for ever if the event is lost.
      timers.push(window.setTimeout(finish, CLOSE_FALLBACK_MS));
    }

    return () => {
      veil.removeEventListener("transitionend", onEnd);
      timers.forEach(clearTimeout);
    };
  }, [open]);

  // Unmount must never leave the stage turned down.
  useEffect(() => () => stageLoad.set("live"), []);

  // The lock is an effect rather than part of each handler so that every route out of
  // the open state — Escape, the wheel, a row, the ✕ — releases the page through
  // exactly one line of code.
  useEffect(() => {
    lockPageScroll(open);
    return () => lockPageScroll(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    // Focus moves in on open and back to the trigger on close, so the menu is operable
    // and, more importantly, escapable from the keyboard.
    //
    // It lands on the ✕, NOT on the first row. A focused row draws its underline, which
    // is the same mark the current section uses — so opening the menu anywhere on the
    // page lit ABOUT up as though that were where you are. The close button is also just
    // the better modal default: the first thing offered is the way out.
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Stopped before SmoothScroll's own key handler, which reads Escape-adjacent keys
      // as page movement while a panel is up.
      e.stopPropagation();
      closeMenu();
    };
    // Wheel dismisses, as it does for the blob panel: a stopped Lenis eats the gesture,
    // so without this the first thing a reader tries does nothing at all. Touch is left
    // alone on purpose — a swipe on a full-screen list is how you read it, not how you
    // leave it, and closing on touchmove made picking a row a coin toss.
    const onWheel = () => closeMenu();

    window.addEventListener("keydown", onKey, true);
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("wheel", onWheel);
    };
  }, [open]);

  /**
   * Close, then move. The page is locked while the menu is up, and a stopped Lenis
   * ignores scrollTo — so the lock is released synchronously HERE rather than waiting for
   * the effect above, which would not have run until after the next paint. The effect
   * still runs and still sets false; it is idempotent.
   *
   * Not left to SmoothScroll's document-level anchor bridge for the same reason: it would
   * fire against a stopped Lenis and the page would simply not move.
   */
  const go = (href: string) => (e: React.MouseEvent) => {
    const el = document.querySelector(href);
    if (!el) return; // let the browser do whatever it does with a dead anchor
    e.preventDefault();
    closeMenu();
    lockPageScroll(false);
    scrollPageTo(el.getBoundingClientRect().top + window.scrollY);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="nav-toggle"
        data-open={open || undefined}
        aria-label="Sections"
        aria-expanded={open}
        aria-controls="section-nav"
        // Inert while the menu is up: it has faded out, and a control you cannot see is
        // not one you should be able to tab to.
        tabIndex={open ? -1 : undefined}
        onClick={() => (open ? closeMenu() : openMenu())}
      >
        <Eye />
      </button>

      <div
        ref={veilRef}
        id="section-nav"
        className="nav-veil"
        data-open={open || undefined}
        style={{ visibility: show ? "visible" : "hidden" }}
        aria-hidden={!open}
      >
        <button
          ref={closeRef}
          type="button"
          className="nav-close"
          aria-label="Close menu"
          tabIndex={open ? undefined : -1}
          onClick={closeMenu}
        >
          {/* Drawn, not typed. The ✕ glyph's stroke scales with its font-size, so at
              this size it came out heavy; two rules stay 1px however big the cross is,
              and they are the same hairline the trigger is made of. */}
          <span aria-hidden className="nav-cross">
            <span />
            <span />
          </span>
        </button>

        <nav className="nav-list" aria-label="Sections">
          {SECTIONS.map((s, i) => {
            const chars = [...s.label];
            return (
              <a
                key={s.href}
                href={s.href}
                className="nav-row"
                // The label is split into one element per letter, so the word itself is
                // no longer readable to assistive tech — the name goes on the link.
                aria-label={s.label}
                data-here={s.section === here || undefined}
                onClick={go(s.href)}
                tabIndex={open ? undefined : -1}
              >
                <span aria-hidden className="nav-label">
                  {/* The mask is the invisible line. It sits on the WORD rather than on
                      each letter: every letter shares one baseline, so a per-letter clip
                      box would draw the same straight boundary while adding an
                      inline-block per glyph — each one able to clip a cap or shift the
                      baseline. Same picture, more ways to go wrong.
                      It is also why the underline lives on .nav-label, outside this: a
                      rule below the boundary would be clipped by it. */}
                  <span className="nav-mask">
                    {/* Arriving, a letter's delay counts UP from its row; leaving, the whole
                        chain is the entrance mirrored — see EXIT_DELAY_MS. */}
                    {chars.map((ch, c) => (
                      <span
                        key={c}
                        className="nav-char"
                        style={{
                          transitionDelay: `${
                            open
                              ? BASE_MS + i * STAGGER_MS + c * CHAR_MS
                              : EXIT_DELAY_MS(i, c)
                          }ms`,
                        }}
                      >
                        {ch}
                      </span>
                    ))}
                  </span>
                </span>
              </a>
            );
          })}
        </nav>
      </div>
    </>
  );
}
