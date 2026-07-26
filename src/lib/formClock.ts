"use client";

import { blobTweak, TIME_RATE, SPIN_RATE } from "./blobTweak";
import { formChoreo, type FormChoreo } from "./formChoreo";
import { aboutReveal } from "./aboutReveal";
import { workHover, MOOD_REST, SHAPES, type Shape } from "./workHover";

/**
 * The central form's live state: one clock, one turntable, one eased scroll
 * position, for every representation.
 *
 * It is shared rather than per-component because the representations hand the
 * frame over to one another mid-transition, and a handover is only invisible if
 * both sides are drawing the same instant of the same field in the same place.
 * Private clocks drift apart for reasons that have nothing to do with the
 * animation:
 *
 *  - the skull mesh suspends on a 8.9 MB glb, so it used to start its clock
 *    several hundred ms after the liquid started its own — the seam showed or not
 *    depending on whether the model happened to be in cache;
 *  - the exit spin boost was only accumulated by whichever form was on screen;
 *  - a form hidden by the Form switch froze, then came back out of phase.
 *
 * Advanced exactly once per frame by FormDriver, which is mounted ahead of the
 * forms; they only read.
 */
export type FormState = FormChoreo & {
  /** the noise field's phase (advanced by Speed) */
  time: number;
  /** turntable angle, radians — signed by the scroll direction */
  spin: number;
  /**
   * The hovered project's silhouette, eased. Mutated in place (never replaced), so
   * a form can hold a reference to it and read it every frame without allocating.
   */
  mood: {
    sx: number;
    sy: number;
    sz: number;
    distort: number;
    freq: number;
    spike: number;
    /** one eased amount per bespoke shape, keyed as in SHAPES */
    shapes: Record<Shape, number>;
  };
};

/** Total scrub over a full page of scroll (radians). */
const SCRUB = Math.PI * 3;

/**
 * Scroll fraction below which a frame counts as standing still. The page scroll
 * is quantised, so without a dead band a single pixel of jitter — or a rounding
 * wobble in a smooth-scroll library — would keep flipping the direction.
 */
const STILL = 1e-5;

/**
 * How fast the matter answers the cursor. Slower than a UI hover on purpose: this
 * is a mass being reshaped, and a snap would read as a sprite swap rather than as
 * the same metal finding a new form.
 */
const MOOD_RATE = 0.02;

const state: FormState = {
  ...formChoreo(0, 0, 0),
  time: 0,
  spin: 0,
  mood: {
    sx: MOOD_REST.stretch[0],
    sy: MOOD_REST.stretch[1],
    sz: MOOD_REST.stretch[2],
    distort: MOOD_REST.distort,
    freq: MOOD_REST.freq,
    spike: MOOD_REST.spike,
    shapes: { gavel: 0, camera: 0, burger: 0, vase: 0 },
  },
};

let eased = 0; // eased About presence — the input to the whole choreography
let easedWork = 0; // eased Work presence — the right dock
let drift = 0; // integrated idle turntable
let dir = 1; // eased scroll direction, -1..1
let dirTarget = 1;
let lastScroll = 0;
let primed = false;
// Accumulated scroll that happened while the ambient turntable was held (the
// About pin). Subtracting it from the scroll fed to the turntable freezes the
// ambient turn during the hold WITHOUT a jump at either edge: it starts at 0 and
// stops growing on release, so the turntable simply carries on from where it was
// left, permanently but invisibly offset on a modular spin.
let holdOffset = 0;

export function advanceFormClock(
  delta: number,
  about: number,
  work: number,
  scroll: number,
  reduced: boolean
) {
  const tw = blobTweak.get();
  const target = reduced ? 0 : Math.max(0, Math.min(1, about));
  eased += (target - eased) * (reduced ? 1 : 1 - Math.pow(0.05, delta));
  const workTarget = reduced ? 0 : Math.max(0, Math.min(1, work));
  easedWork += (workTarget - easedWork) * (reduced ? 1 : 1 - Math.pow(0.05, delta));

  // The About→Work transition is the pinned sequence's own last beat, scrubbed
  // through aboutReveal.exit — not a second trigger reading the Work section's
  // position, which could drift from the text fade it is supposed to follow. The
  // Work dock, by contrast, IS a function of that section's position.
  const c = formChoreo(eased, reduced ? 0 : aboutReveal.exit, easedWork);

  // hovered project → silhouette, eased so the matter flows into it
  const m = reduced ? MOOD_REST : workHover.mood;
  const mr = reduced ? 1 : 1 - Math.pow(MOOD_RATE, delta);
  const md = state.mood;
  md.sx += (m.stretch[0] - md.sx) * mr;
  md.sy += (m.stretch[1] - md.sy) * mr;
  md.sz += (m.stretch[2] - md.sz) * mr;
  md.distort += (m.distort - md.distort) * mr;
  md.freq += (m.freq - md.freq) * mr;
  md.spike += (m.spike - md.spike) * mr;
  // Every shape eases, not just the hovered one: that is what makes project → project
  // a melt (the old form drains away as the new one fills) rather than a cut.
  for (const s of SHAPES) {
    md.shapes[s] += ((m.shape === s ? 1 : 0) - md.shapes[s]) * mr;
  }

  // Scroll direction decides which way the form turns. Scrolling down winds it,
  // scrolling up unwinds it — the idle drift is the same gesture continued, so it
  // has to carry that gesture's sign instead of always turning the same way.
  // Eased rather than switched, so a reversal reads as the mass changing its mind
  // over a quarter second rather than as a jump cut.
  if (!primed) {
    lastScroll = scroll;
    primed = true;
  }
  const moved = scroll - lastScroll;
  lastScroll = scroll;
  if (Math.abs(moved) > STILL) dirTarget = Math.sign(moved);
  dir += (dirTarget - dir) * (reduced ? 1 : 1 - Math.pow(0.02, delta));

  // While the About pin holds, swallow this frame's scroll movement into the
  // offset so the ambient turntable freezes (the section owns the rotation).
  holdOffset += moved * (reduced ? 0 : aboutReveal.hold);

  Object.assign(state, c);
  // The living surface flow does NOT reverse: that is the metal breathing, not the
  // form turning, and running it backwards on the way up would read as a glitch.
  // Speed 0 must still freeze it, hence integrating Speed rather than reading a
  // wall clock.
  state.time += delta * tw.speed * TIME_RATE;
  // `hold` silences the AMBIENT idle turn, not the whole drift: the exit beat's
  // spinBoost happens while the section is still pinned and is meant to be heard.
  // (Holding only the scroll-scrub term left the idle turn running through the
  // pinned 360°, which is the "~1.5 turns" the hold exists to prevent — just a
  // smaller share of it, and one that grows the slower you scroll.)
  const hold = reduced ? 0 : aboutReveal.hold;
  drift += delta * dir * (tw.speed * SPIN_RATE * (1 - hold) + c.spinBoost);
  // The scrub is a function of scroll POSITION, so it rewinds exactly; the drift
  // carries the direction of the last gesture. `scroll - holdOffset` freezes the
  // ambient turn during the About pin, and aboutReveal.spin is the single
  // controlled turn the pinned sequence scrubs in (the skull's 360° once the text
  // is drawn). Sum = the whole turntable angle, so no representation keeps a
  // rotation of its own.
  state.spin = drift + (scroll - holdOffset) * SCRUB + (reduced ? 0 : aboutReveal.spin);
}

export const formState = (): Readonly<FormState> => state;
