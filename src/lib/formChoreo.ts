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
 * and the form on the left; Work is the MIRROR of About — the index of project
 * names reads on the left in display type, and the piece holds the right margin,
 * developing each row's photograph. Same reading layout, sides swapped.
 *
 * 2.6 and not About's 3.6: the plates are wider than the skull, and at 3.6 a
 * landscape photograph ran off the right edge of the screen before the size cap
 * (uPlateK, which knows about this dock) had anything sane left to give it.
 */
export const DOCK_X = -3.6;
export const DOCK_X_WORK = 2.6;

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
 * ZERO since the index: the piece no longer carries its name and the numbers under
 * it — the type lives in the left column now — so there is nothing to optically
 * re-centre against and the photograph sits plumb on the middle of the screen.
 * (It was 0.7, half the height of the text block that used to hang below.)
 */
export const DOCK_Y_WORK = 0;

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

/**
 * Atténue une valeur vers son identité par une présence 0..1.
 *
 * La règle de confinement de la caméra, en un seul endroit. Elle interpole depuis
 * l'IDENTITÉ de la prop et non depuis zéro, ce qui compte : l'identité de camZ est 10 et
 * celle de camFov 42, donc interpoler depuis zéro mettrait la caméra dans le sujet à
 * présence nulle au lieu de la laisser où elle a toujours été.
 *
 * À présence 0 le résultat est l'identité EXACTEMENT — `identity + (target - identity) * 0`
 * est `identity + 0`, pas une approximation. C'est ce qui fait du confinement une identité
 * arithmétique plutôt qu'une promesse : hors du corridor de Work, le frustum contre lequel
 * tout le CSS a été réglé est intact au bit près. Voir tests/formChoreo.test.ts.
 *
 * Ici plutôt que dans formClock parce que ce module n'a AUCUN import : il est donc
 * importable depuis Node, et l'invariant peut être testé sans navigateur ni framework.
 */
export const confine = (identity: number, target: number, presence: number): number =>
  identity + (target - identity) * presence;
