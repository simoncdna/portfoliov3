/**
 * The central form's scroll choreography.
 *
 * Every representation reads the same two scroll signals (About presence, then
 * the About exit) and has to dock, grow, spin and fade *identically* — the
 * blob→skull transition is a handover between two renderers, so any drift
 * between their copies of this arithmetic shows up as the form jumping at the
 * moment it changes hands. So it lives here once.
 */

/**
 * Where the form parks per section (world x). About keeps its text on the right
 * and the form on the left; Work brings it back to the middle — it is the piece on
 * display there, framed by four corner notches with its name underneath, so it is
 * dead centre and the DOM is arranged around it rather than beside it.
 *
 * DOCK_X_WORK is kept (rather than dropped) because the exit sums the two docks to
 * make one continuous crossing; 0 is a real value in that sum, not an absence.
 */
export const DOCK_X = -3.6;
export const DOCK_X_WORK = 0;

/**
 * …and where it goes once Work is over. Contact's text is left-aligned across the
 * full shell, so the centre is the one place the form cannot stay: it would sit
 * straight behind "Let's have a chat". It steps aside to the right — which is where
 * it used to live for the whole of Work, back when the projects were a list.
 */
export const DOCK_X_AFTER = 3.6;

/**
 * How far the form rides ABOVE the viewport's centre in Work (world y).
 *
 * The piece is not alone on that screen: its name sits under it and the four plate
 * numbers under that. What has to look centred is the whole group, which means the
 * piece itself must sit above the middle by half the height of the text below it.
 * The form is drawn by a fixed, viewport-centred canvas, so the lift has to happen
 * here — the DOM cannot move it.
 *
 * In world units rather than pixels, so it is one number for every representation.
 * The DOM side converts it back: --form-lift in globals.css is this value divided by
 * the world height the camera sees (2 · 10 · tan(21°) ≈ 7.677 for the stage's z = 10
 * and fov 42), which is what lets the notch frame land on the form at ANY window
 * height instead of only at the one it was tuned at. Change this, the camera's z or
 * its fov, and --form-lift has to move with it.
 */
export const DOCK_Y_WORK = 1.0;

/**
 * How much the form grows once it is back in the middle, as a fraction of its
 * resting size. It fills the space the About text just vacated — but barely: past
 * about a fifth it stops reading as a mass taking the stage and starts reading as
 * the camera pushing in, which is a different (and unintended) statement.
 */
const EXIT_SCALE = 0.2;

/**
 * The size it settles at in Work — an absolute scale, not a bonus on top of the
 * resting one. Slightly below the resting size, and below the swell it reaches
 * mid-crossing: the four notches have to read as a frame around the piece with real
 * air between them and it, and that air is what the exit's swell spends. So the form
 * comes back down a little to sit inside its own frame.
 */
const WORK_SCALE = 0.62;

/** Companion size beside Contact — small, off to the side, no longer the subject. */
const AFTER_SCALE = 0.72;

/**
 * The blob→skull handover window, in units of About presence.
 *
 * The liquid is a raymarched SDF and the skull is a real mesh, so they cannot be
 * morphed into one another — they are cross-faded instead. It is invisible only
 * because it happens at the very start of the morph, where the skull mesh is
 * still the same noise-displaced sphere the liquid is drawing. Widening this
 * window is what would make the swap visible.
 */
export const HANDOVER_IN = 0.02;
export const HANDOVER_OUT = 0.16;

export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export type FormChoreo = {
  /** 0 = resting sphere, 1 = assembled form */
  pres: number;
  /** world x offset */
  dockX: number;
  /** world y offset */
  dockY: number;
  /** global grow/shrink */
  scale: number;
  /** extra spin rate (rad/s) while exiting */
  spinBoost: number;
  /** 0 = the liquid owns the frame, 1 = the skull mesh does */
  handover: number;
  /**
   * The skull mesh's own presence. It goes opaque almost immediately rather than
   * fading in over the window, because it is drawn *under* the liquid (which draws
   * last, depth-test off): two half-transparent copies of the same sphere would
   * let the page bleed through the middle of the swap. So the layer underneath
   * turns solid first and the one on top dissolves off it.
   */
  skullOn: number;
};

/**
 * @param about eased 0..1 presence of the About section
 * @param exit  0..1 progress of the About exit, scrubbed by the pinned timeline
 *              (aboutReveal.exit) — NOT read off the Work section's position, so
 *              it cannot drift from the text fade it follows
 * @param work  eased 0..1 presence of the Work section, which is a genuine
 *              function of where that section is (unlike the exit): it settles the
 *              form in the middle at display size, inside its frame of notches
 * @param after eased 0..1 presence of everything past Work. It does not undo `work`
 *              (which stays claimed) — it overrides it, so the form steps out of the
 *              centre and off to the side for Contact
 */
export function formChoreo(
  about: number,
  exit: number,
  work: number,
  after: number
): FormChoreo {
  const a = clamp01(about);
  const x = clamp01(exit);
  const w = clamp01(work);
  const f = clamp01(after);

  // The exit, in three overlapping beats. They overlap on purpose: the form should
  // read as one continuous movement — walking back into the middle while swelling,
  // and already softening into the sphere before it has finished swelling — rather
  // than as three cues played in turn.
  const home = smoothstep(0, 0.5, x); // leaves the left dock, back to centre
  const grow = smoothstep(0.15, 0.8, x); // takes the space the text vacated

  // The skull unmakes itself into the resting sphere — and hands the frame back to
  // the liquid on the way, since the handover reverses as pres falls.
  //
  // That handover lives in a NARROW range of pres (0.16 → 0.02) for a reason: it
  // is the only stretch where the mesh is still close enough to a sphere for the
  // cross-fade to hide. Widening it would show the swap. What it needed instead was
  // more SCROLL inside the same range — so pres falls quickly to the top of the
  // window and then crawls through it, giving the cross-fade about a fifth of the
  // exit beat rather than the sliver it got when pres ran linearly to zero.
  const fall = smoothstep(0.35, 0.8, x); // 1 → the top of the handover window
  const cross = smoothstep(0.8, 1.0, x); // …then through it, slowly
  const pres = a * ((1 - fall) * (1 - HANDOVER_OUT) + HANDOVER_OUT * (1 - cross));
  return {
    pres,
    // Two docks, summed rather than switched: About's left one is released by the
    // exit (`home` → 1) exactly as Work's centre one is claimed, so the form makes
    // one continuous crossing of the stage instead of teleporting between sides.
    // …and once Work is over, the form slides off the centre to the right dock: the
    // last term wins over Work's 0 rather than being added to it, and the lift and
    // the display size are released on the same signal, so the piece is put away as
    // one gesture instead of three.
    dockX: DOCK_X * a * (1 - home) + DOCK_X_WORK * w * (1 - f) + DOCK_X_AFTER * f,
    dockY: DOCK_Y_WORK * w * (1 - f),
    // Swells for the crossing, then settles down to display size inside its frame.
    scale:
      ((1 + grow * EXIT_SCALE) * (1 - w) + WORK_SCALE * w) * (1 - f) + AFTER_SCALE * f,
    // A pulse, not a level: this is a rate that gets integrated, and `exit` stays
    // at 1 for the whole rest of the page — so anything monotonic in x would leave
    // the blob spinning four times too fast forever. Peaks mid-crossing, zero at
    // both ends, where the form is supposed to be settled.
    spinBoost: x * (1 - x) * 4.8,
    handover: smoothstep(HANDOVER_IN, HANDOVER_OUT, pres),
    skullOn: smoothstep(0, HANDOVER_IN * 1.5, pres),
  };
}
