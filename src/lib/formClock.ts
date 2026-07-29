"use client";

import { blobTweak, TIME_RATE, SPIN_RATE } from "./blobTweak";
import { formChoreo, type FormChoreo } from "./formChoreo";
import { aboutReveal } from "./aboutReveal";
import { workReveal } from "./workReveal";
import { workPlate, MOOD_REST, SHAPES, type Shape } from "./workPlate";

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
  /*
   * THERE IS NO ROLL-OUT PEAK. A pulse (flat·(1−flat)·4, the burst spec's impulse)
   * overloading distort/spike at mid-roll was tried and removed: with the roll-out
   * riding the arrival — the metal flattening WHILE it crosses the stage — a fit of
   * rage in the middle of that trajectory added noise, not drama. The burst grammar
   * belongs to the click (the rafale spec), where it answers a deliberate gesture.
   */
  /**
   * The WORK MESH's turn on stage, 0..1 — the corridor from About's exit to Work's
   * departure, eased. The tableau is a mesh now (ChromeTableau), and the baton passes
   * MESH TO MESH: the skull reforms its sphere at About's end and crossfades with the
   * tableau wearing ITS sphere disguise — the raymarched blob is bypassed for the
   * whole corridor (it only serves the Hero, and comes back when this falls so the
   * Contact dock has its blob again). Both meshes sample the same field, so the
   * sphere they exchange is the same object twice.
   */
  tableauOn: number;
  /**
   * Whose sphere it is, 0..1 — the BATON inside the one metamorphosis. About→Work is
   * a single scrub (workReveal.form): its first half melts the skull (pres 1→0), its
   * second unrolls the sheet (flat 0→1), and this crossfades the two meshes in the
   * narrow window around the middle (0.45→0.55) where both are imitating the sphere —
   * IN MOTION, never held. 0 = the skull carries the form, 1 = the tableau does.
   */
  baton: number;
  /**
   * The plates' wave phase — a SECOND clock, because the wind has to be able to stop while
   * the metal keeps breathing.
   *
   * Pointing at a project's name holds the picture still, and a freeze must not be a jump:
   * this integrates at a rate that eases to zero (see `hover`), so the crest that was on
   * screen stays exactly where it is and starts again from there. Scaling a shared clock
   * inside the shader would rewind the wave to its origin instead, which is a lurch.
   */
  wave: number;
  /** turntable angle, radians — signed by the scroll direction */
  spin: number;
  /**
   * The shown plate's silhouette, eased. Mutated in place (never replaced), so a
   * form can hold a reference to it and read it every frame without allocating.
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
    /**
     * 0 = the resting sphere, 1 = the flat 16:9 plates. The Work section's whole
     * premise: the metal is rolled out into photographic plate.
     *
     * It rises ONCE, on arriving in the section, and falls once on leaving — changing
     * plate does not touch it, because a plate change is the strip sliding, not the metal
     * re-forming. Everything that has to agree about how flat the piece is reads this one
     * number: the shader's field, the turntable's freeze, and the walk to face the
     * camera. Two of them disagreeing is a plate presenting itself edge-on.
     */
    flat: number;
    /**
     * The developer, 0..1 — how far the photograph has COME UP on the settled plate.
     *
     * The picture used to surface while the metal was still rolling out (a window on
     * flatness, open from 20%), and that was two events on top of each other: neither the
     * metamorphosis nor the photograph could be read. This eases toward 1 only once the
     * plate is EXACTLY flat (the snap in this file makes "exactly" a real state), so the
     * sequence is: the metal settles, chrome and still — then the print rises out of it,
     * like a tirage in the developer bath. Global, not per slot: it is the section's
     * opening moment, and later plates arrive already developed.
     */
    dev: number;
    /**
     * DEAD, held at 0. It measured the strip's travel and drove the wave's breath —
     * and the strip does not travel any more: with the index as the selector, a plate
     * change is material (dissolve → melt → swap → reform → develop), not lateral.
     * The field survives so the wave/extinction plumbing that reads it stays wired
     * for the day a travelling variant comes back.
     */
    slide: number;
    /**
     * The slot the one plate is WEARING — which photograph the piece carries, as the
     * shader addresses it (texture, aspect, owner). An integer at all times now: it
     * only changes at the bottom of the melt, under cover of the liquid, where a swap
     * has no rectangle left to be seen on. (It was the strip's continuous position,
     * back when changing plate was a slide.)
     */
    car: number;
    /**
     * Eased presence of the reader's attention on the shown plate — the project's name
     * being pointed at (or keyboard-focused).
     *
     * ONE number for the whole gesture: the wind stops, the colour arrives, and the picture
     * steps forward. Three effects off one signal cannot fall out of step with each other,
     * and the reverse is free — letting go of the name plays all three backwards.
     */
    hover: number;
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
 * How fast the matter answers the cursor, as the fraction of the crossing still to
 * go after a second. Slower than a UI hover on purpose: this is a mass being
 * reshaped, and a snap would read as a sprite swap rather than as the same metal
 * finding a new form.
 *
 * 0.40 → 90% of the melt in ~2.5s. It was 0.56 (~4s), which was longer than DWELL:
 * a reader moving steadily down the band was handed the next plate before the
 * previous object had finished arriving, so no plate was ever seen fully formed —
 * the section read as permanently in transit. At 2.5s the metal settles inside the
 * 1.4s floor plus the time a name takes to be read, and the change still costs
 * enough to be felt.
 */
const MOOD_RATE = 0.4;

/*
 * THERE IS NO SWAY. A ±6° rock was tried here as the flat plate's substitute for the
 * turntable — the reasoning being that a plate held dead still is a poster rather than a
 * piece of metal in a room — and it was removed: on a perspective camera any tilt at all
 * projects the picture as a trapezoid, and the section is a gallery of PHOTOGRAPHS. A
 * photograph hanging square to the wall is not lifeless, it is hung properly. What carries
 * the dimension instead is an optic, not a rotation — the chromatic split in formPhoto.
 *
 * So at full flatness the whole turntable angle resolves to `faced`, an exact multiple of
 * 2π, and every plate projects as a true rectangle.
 */

/**
 * How fast the print comes up once the plate is flat, as the fraction still to go after
 * a second. 0.1 → 90% developed in one second: slow enough to be seen rising (it is the
 * entrance's payoff, not a switch), fast enough that the section is not kept waiting.
 */
const DEV_RATE = 0.1;

/**
 * The page turn's rate — how fast the framed work spins its revolution, as the
 * fraction still to go after a second. 0.02 → most of the turn in half a second, the
 * settle inside the dwell: an exponential revolution reads as a work being turned by
 * a hand — committed at once, gentle on the landing.
 */
const TURN_RATE = 0.02;

/**
 * How tightly the sheet's flatness chases the entrance's scrub (workReveal.form), as
 * the fraction still to go after a second. Tight — the scrub IS the animation and a
 * lag here is a laggy wheel — but not a hard copy: the smoothing is what keeps the
 * metamorphosis reading as matter with weight rather than as a slider. 0.0005 (from
 * 0.002): the old value left ~15% of the gesture arriving after the hand had stopped,
 * which read as the metal dragging its feet rather than as weight.
 */
const FORM_RATE = 0.0005;

/**
 * How fast the hover gesture answers, as the fraction still to go after a second.
 *
 * 0.05 → about a third of a second. Quicker than anything else in this file, because this
 * one is answering a cursor rather than a scroll: past roughly half a second the wind is
 * still drifting to a stop when the reader has already moved on. Slower than a UI hover all
 * the same — what is being stopped is a mass of moving metal, and it should be felt slowing
 * down rather than switched off.
 */
const HOVER_RATE = 0.05;

const state: FormState = {
  ...formChoreo(0, 0, 0, 0),
  time: 0,
  wave: 0,
  spin: 0,
  tableauOn: 0,
  baton: 0,
  mood: {
    sx: MOOD_REST.stretch[0],
    sy: MOOD_REST.stretch[1],
    sz: MOOD_REST.stretch[2],
    distort: MOOD_REST.distort,
    freq: MOOD_REST.freq,
    spike: MOOD_REST.spike,
    shapes: { gavel: 0, camera: 0, burger: 0, vase: 0 },
    flat: 0,
    dev: 0,
    slide: 0,
    car: 0,
    hover: 0,
  },
};

let eased = 0; // eased About presence — the input to the whole choreography
let easedWork = 0; // eased Work presence — the piece on display, centre stage
let easedAfter = 0; // eased presence of everything past Work — the right dock
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
// Eased freeze amount. `aboutReveal.hold` arrives as a binary from the About
// pin's onToggle; easing it here — beside dir and the about presence, where the
// clock does all its other smoothing — is what keeps the skull from HITCHING as
// the pin engages. A hard 0→1 cuts the ambient scroll-turn dead in one frame,
// while the controlled 360° that replaces it starts from zero velocity
// (sine.inOut, scrub-smoothed on top): the turntable's speed would drop to
// nothing for a moment before the spin picks it up. Ramping the freeze in lets
// the ambient turn bleed out exactly as the spin builds, with no gap between.
let holdEased = 0;
// The slot the piece is WEARING — which photograph the one plate carries. Held here
// rather than read off workPlate every frame because it must SURVIVE the section
// releasing the plate (index -1): the sheet un-forms still wearing the last print's
// slot, and hands it back on the way up. Only the swap (at the bottom of the melt)
// and reduced motion may write it.
let shownSlot = 0;
// The page turn: an extra, controlled revolution of the turntable per canvas change.
// `turn` eases toward `turnTarget` (multiples of 2π, so a settled work is face-on by
// construction); the swap fires as the turn crosses edge-on (see swapAtAngle).
let turn = 0;
let turnTarget = 0;
let swapAtAngle = 0;
let swapPending = false;
// The face-on angle the flattening plate is walked to (radians) — latched, see below.
let faced = 0;

export function advanceFormClock(
  delta: number,
  about: number,
  work: number,
  scroll: number,
  reduced: boolean
) {
  // The frame the stage RESUMES on (menu curtain, preloader — anything that flips the
  // canvas's frameloop never→always) arrives with the entire pause as its delta: R3F's
  // clock is not advanced while the loop is held. Integrated raw, one menu cycle threw
  // `time` forward by tens of thousands of seconds — and a huge uTime is where fp32
  // dies in the shader: the simplex noise quantises and the chrome comes back covered
  // in stair-step artifacts, a little worse on every open/close. (This, not buffer
  // reallocation, was the accumulating degradation the dpr experiment recorded — see
  // stageLoad.) A real frame is never longer than a tenth of a second; anything above
  // is a pause being handed back, and the clock treats it as one ordinary frame.
  delta = Math.min(delta, 0.1);
  const tw = blobTweak.get();
  const target = reduced ? 0 : Math.max(0, Math.min(1, about));
  eased += (target - eased) * (reduced ? 1 : 1 - Math.pow(0.05, delta));
  const workTarget = reduced ? 0 : Math.max(0, Math.min(1, work));
  easedWork += (workTarget - easedWork) * (reduced ? 1 : 1 - Math.pow(0.05, delta));
  // The putting-away is scrubbed by Work's own exit timeline (workReveal), not read
  // off that section's position — like About's exit, it is the last beat of a sequence
  // and has to stay behind the three DOM beats in front of it.
  const afterTarget = reduced ? 0 : Math.max(0, Math.min(1, workReveal.away));
  easedAfter += (afterTarget - easedAfter) * (reduced ? 1 : 1 - Math.pow(0.05, delta));

  // The About→Work transition is the pinned sequence's own last beat, scrubbed
  // through aboutReveal.exit — not a second trigger reading the Work section's
  // position, which could drift from the text fade it is supposed to follow. Work's
  // ARRIVAL, by contrast, is a fair function of where that section is; only its
  // departure has an order to respect, hence workReveal above.
  const c = formChoreo(eased, reduced ? 0 : aboutReveal.exit, easedWork, easedAfter);

  // shown plate → silhouette, eased so the matter flows into it
  const m = reduced ? MOOD_REST : workPlate.mood;
  const mr = reduced ? 1 : 1 - Math.pow(MOOD_RATE, delta);
  const md = state.mood;
  md.sx += (m.stretch[0] - md.sx) * mr;
  md.sy += (m.stretch[1] - md.sy) * mr;
  md.sz += (m.stretch[2] - md.sz) * mr;
  md.distort += (m.distort - md.distort) * mr;
  md.freq += (m.freq - md.freq) * mr;
  md.spike += (m.spike - md.spike) * mr;
  // Every shape eases, not just the shown one: that is what makes project → project
  // a melt (the old form drains away as the new one fills) rather than a cut.
  for (const s of SHAPES) {
    md.shapes[s] += ((m.shape === s ? 1 : 0) - md.shapes[s]) * mr;
  }

  // THE CHANGE IS A NEW PRINT ON THE SAME SHEET. With the index as the selector and
  // the neighbours off screen, a photograph flying out sideways said nothing — and a
  // return to the blob between prints said too much (it was tried: the melt made every
  // page turn a re-forming, when it is only a page turn). So the sheet stays flat and
  // docked, and changing plate is the print's own cycle: the picture dissolves back
  // into chrome, the slot is swapped on the bare metal (the plate's width glides to
  // the new photograph's aspect meanwhile — see uAspNow in LiquidDna), and the next
  // print develops. The blob is for arriving and leaving; the prints turn on their own.
  const want = workPlate.index >= 0 ? workPlate.index : shownSlot;
  const changing = want !== shownSlot;
  // Reduced motion: the slot just changes, and plate and print snap with it.
  if (reduced) shownSlot = want;

  // The plate. It flattens on the same signal that used to start the metal taking a
  // project's object — the entrance timeline's forming beat, which is what puts a
  // title on workPlate — so the sequence the reader gets is unchanged in structure:
  // the sphere crosses the stage and swells, THEN it is rolled out. `index` rather
  // than `title` because it is the same number the photographs are addressed by, and
  // two flags for one state can disagree.
  //
  // Reduced motion still gets the plate: it is the section's subject, not an effect.
  // (mr is 1 there, so it simply snaps.)
  const onPlate = workPlate.index >= 0 ? 1 : 0;
  // ONE METAMORPHOSIS, ONE AXIS. workReveal.form (the arrival's scrub) carries the
  // whole About→Work gesture: its FIRST half melts the skull (see the pres override
  // below), its SECOND unrolls the sheet — so the sphere is only ever an instant both
  // shapes pass through, never a state that travels. The clock chases the scrub
  // tightly (FORM_RATE): enough smoothing for the matter to keep its weight, not
  // enough to lag the gesture.
  const formScrub = reduced ? 1 : Math.max(0, Math.min(1, workReveal.form));
  const unroll = Math.max(0, Math.min(1, (formScrub - 0.5) / 0.5));
  const flatTarget = onPlate * (reduced ? 1 : unroll * unroll * (3 - 2 * unroll));
  md.flat += (flatTarget - md.flat) * (reduced ? 1 : 1 - Math.pow(FORM_RATE, delta));
  // …and the top and bottom of the range SNAP. An exponential ease never lands, and here the
  // last half percent is not cosmetic — it costs twice over:
  //
  //  - the field keeps 0.5% of the BLOB's distance mixed into the plates' (see plateField),
  //    which is nothing at the centre of the screen and more than the marcher's hit threshold
  //    several units out. That is why the gallery's neighbours were invisible: the rays reached
  //    them and never registered an impact.
  //  - the turntable keeps a few milliradians of the angle it was walking away from, and a
  //    photograph rotated by a few milliradians on a perspective camera is a trapezoid, not a
  //    picture.
  //
  // Half a percent of flatness is invisible; being EXACTLY flat is load-bearing.
  if (md.flat > 0.995) md.flat = 1;
  else if (md.flat < 0.005) md.flat = 0;

  // THE PAGE TURN IS A TURN. Changing canvas spins the framed work one full
  // revolution on the turntable — the site's own gesture for matter presenting
  // itself — and the swap happens at the first EDGE-ON crossing (a quarter in),
  // where the work is a line on screen and neither picture exists to be seen
  // cutting to the other. The canvas's proportions glide meanwhile (uAspNow), so
  // the frame resizes in flight. Chained changes queue another revolution.
  if (changing && !reduced && md.flat === 1 && !swapPending) {
    turnTarget += Math.PI * 2;
    swapAtAngle = turnTarget - Math.PI * 1.5;
    swapPending = true;
  }
  // …a change arriving while the metal is not a plate (the entrance, the exit) needs
  // no ceremony: the blob is not carrying a readable picture.
  if (changing && !reduced && md.flat < 1) shownSlot = want;
  turn += (turnTarget - turn) * (reduced ? 1 : 1 - Math.pow(TURN_RATE, delta));
  // The snap, for the same reason flat snaps: a work face-on save a few milliradians
  // is a trapezoid. And the swap, at the edge-on crossing.
  if (turnTarget - turn < 0.002) turn = turnTarget;
  if (swapPending && turn >= swapAtAngle) {
    shownSlot = want;
    swapPending = false;
  }

  // The developer: the print rises once the work is EXACTLY flat — the section's
  // OPENING moment only. A canvas change keeps its picture through the whole turn
  // (the swap happens edge-on, where there is nothing to see): a painting being
  // turned around does not fade, it turns. Snapped at both ends like flat itself —
  // the shader gates its grain branch on dev reaching 1, and an exponential ease
  // never lands on its own.
  const devTarget = md.flat === 1 && workPlate.index >= 0 ? 1 : 0;
  md.dev += (devTarget - md.dev) * (reduced ? 1 : 1 - Math.pow(DEV_RATE, delta));
  if (md.dev > 0.995) md.dev = 1;
  else if (md.dev < 0.005) md.dev = 0;

  // The reader pointing at the name. Only while a plate is actually shown: a hover left
  // hanging by the section releasing the plate would hold the wind stopped for good.
  const wantHover = !reduced && workPlate.hover && workPlate.index >= 0 ? 1 : 0;
  md.hover += (wantHover - md.hover) * (reduced ? 1 : 1 - Math.pow(HOVER_RATE, delta));

  // The strip does not travel any more — the shader shows the ONE slot the piece is
  // wearing (see plateStrip). `car` survives as that slot's number, which is how the
  // photograph is addressed; `slide` is dead and held at 0 so the wave's breath and
  // the extinction, both functions of a travel that no longer happens, stay silent.
  md.car = shownSlot;
  md.slide = 0;

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

  const holdTarget = reduced ? 0 : aboutReveal.hold;
  holdEased += (holdTarget - holdEased) * (reduced ? 1 : 1 - Math.pow(0.1, delta));

  // Two things freeze the turntable, and they freeze it the same way, so they are one
  // number here: the About pin (which owns its own controlled 360°) and the plate
  // being flat (which cannot be turned at all — a photograph edge-on is a plank).
  // max(), not a sum: both are "the ambient turn is not yours right now", and stacking
  // them would take the factor past 1 and spin the form backwards.
  const frz = Math.max(holdEased, md.flat);

  // While the turn is frozen, swallow this frame's scroll movement into the offset so
  // the scroll-scrub term stops advancing. Eased on both counts — see holdEased for
  // the About pin, and md.flat is itself an easing — which is what keeps the freeze
  // from HITCHING at either edge: the offset starts at 0 and stops growing on release,
  // so the turntable carries on from where it was left, permanently but invisibly
  // offset on a modular spin.
  holdOffset += moved * frz;

  Object.assign(state, c);
  // The work mesh's corridor — rises EARLY in Work's arrival (0.28→0.6 of the eased
  // presence: the switch happens while the sphere is still crossing and swelling, so
  // the roll-out can begin under the reader's hand without waiting for the piece to
  // park), falls with the putting-away so the liquid can carry the blob on to
  // Contact's dock. Smooth at both ends: this drives a crossfade of two
  // sphere-wearing forms, and any step in it would flash.
  // …and EARLY (0.12→0.45 of the presence): it must be fully up before the melt's
  // midpoint, because it is what HOLDS the skull on stage (and the liquid off it)
  // while the one metamorphosis plays — see the pres override and baton below.
  {
    const tIn = Math.max(0, Math.min(1, (easedWork - 0.12) / 0.33));
    state.tableauOn = tIn * tIn * (3 - 2 * tIn) * (1 - easedAfter);
  }
  // THE ONE GESTURE's two halves. The skull is HELD (pres pinned up by the corridor)
  // until the scrub's first half melts it — About's own exit no longer decides; it
  // only matters outside the corridor. And the baton crossfades the meshes in the
  // narrow window around the middle, where both are passing through the sphere.
  {
    const melt = Math.max(0, Math.min(1, formScrub / 0.5));
    const meltE = melt * melt * (3 - 2 * melt);
    state.pres = Math.max(state.pres, state.tableauOn * (1 - meltE));
    const b = Math.max(0, Math.min(1, (formScrub - 0.45) / 0.1));
    state.baton = b * b * (3 - 2 * b);
  }
  // NOTE the hover's step forward is NOT here. It used to multiply this scale, which is the
  // whole form's — so pointing at one project's name grew every picture in the gallery,
  // neighbours included. It belongs to the slot being read, and it is applied there (uGrow in
  // formPhoto), the same way the colour is.
  // NOTE the changeover adds nothing to the docks. The plates move because the STRIP
  // moves under a still camera (md.car, read by the field itself) — not because the form
  // is thrown around the stage. That is what lets two photographs be on screen at once,
  // which a single docked object could never do.
  // The living surface flow does NOT reverse: that is the metal breathing, not the
  // form turning, and running it backwards on the way up would read as a glitch.
  // Speed 0 must still freeze it, hence integrating Speed rather than reading a
  // wall clock.
  state.time += delta * tw.speed * TIME_RATE;
  // The wave's own clock, which the hover brings to a standstill. Integrated (rather than
  // scaled at read time) so stopping holds the phase instead of rewinding it. The slide
  // RUNS it: the wind picks up while the strip travels and settles as the plate arrives —
  // through the clock and never through uWind, which multiplies the accumulated phase and
  // would jump the whole wave sideways if it moved mid-flight.
  state.wave += delta * tw.speed * TIME_RATE * (1 - md.hover) * (1 + 1.5 * md.slide);
  // The freeze silences the AMBIENT idle turn, not the whole drift: the About exit's
  // spinBoost happens while that section is still pinned and is meant to be heard.
  // (Holding only the scroll-scrub term left the idle turn running through the
  // pinned 360°, which is the "~1.5 turns" the hold exists to prevent — just a
  // smaller share of it, and one that grows the slower you scroll.)
  drift += delta * dir * (tw.speed * SPIN_RATE * (1 - frz) + c.spinBoost);
  // The scrub is a function of scroll POSITION, so it rewinds exactly; the drift
  // carries the direction of the last gesture. `scroll - holdOffset` freezes the
  // ambient turn during the About pin and again while the plate is flat, and
  // aboutReveal.spin is the single controlled turn the pinned sequence scrubs in (the
  // skull's 360° once the text is drawn). Sum = the whole turntable angle, so no
  // representation keeps a rotation of its own.
  const free = drift + (scroll - holdOffset) * SCRUB + (reduced ? 0 : aboutReveal.spin);

  // Freezing the turntable is not the same as PRESENTING the plate, and the section
  // needs both: a sheet held at whatever angle the ambient turn happened to be at when
  // it flattened is a blade, edge-on, and the photograph is invisible. So the whole
  // angle is walked to a face-on one — a multiple of 2π, not π, since the back of the
  // plate carries the picture mirrored — and md.flat is the walk.
  //
  // FORWARD, never to the nearest. Rounding to the nearest multiple is the naive reading
  // and it is wrong half the time: whenever the piece has just passed a face-on angle the
  // shortest way back is BACKWARDS, and what you see is the metal reversing against the
  // gesture that is driving it. A mass finishes its turn. Hence ceil/floor by the eased
  // scroll direction — scrolling down completes the revolution, scrolling back up unwinds
  // it — which is the rule the ambient turntable already follows everywhere else.
  //
  // The target is latched before the flattening starts and not recomputed after: `free`
  // still creeps while the freeze is only partly in (it is eased), and a target
  // recomputed each frame could cross a boundary and send the piece all the way round for
  // a rounding difference.
  if (md.flat < 0.02) {
    const turns = free / (Math.PI * 2);
    faced = (dir >= 0 ? Math.ceil(turns) : Math.floor(turns)) * Math.PI * 2;
  }
  // …plus the page turn's own revolution, which only a flat work performs — `turn`
  // rests on multiples of 2π (and snaps there), so the settled work is exactly
  // face-on and the picture a true rectangle.
  state.spin = free + (faced - free) * md.flat + turn * md.flat;
}

export const formState = (): Readonly<FormState> => state;
