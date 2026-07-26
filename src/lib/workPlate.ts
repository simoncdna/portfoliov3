"use client";

/**
 * Which plate the Work section is showing, and what that does to the matter.
 *
 * The section is one screen: the piece centred inside four corner notches, its name
 * below, and 01–04 under that. Scrolling advances the plate; the form melts into
 * that project's object. Rather than swapping in a different object per project —
 * the mistake the skull forced us into — each project is a set of *parameters* of
 * the one blob field, plus (where the subject calls for a literal object) its own
 * distance field MIXED into the blob's. Mixing two distance fields is what melting
 * is, so the metal flows from one project to the next and never cuts.
 *
 * A plain mutable singleton (like aboutReveal): written by the section as the scroll
 * advances, eased and read every frame by the form clock. It used to be written on
 * hover — hence its old name, workHover — but hover does not exist on touch, and the
 * scroll was already the actor of every other section.
 */

export type Mood = {
  /** anisotropic scale of the field — the silhouette's proportions */
  stretch: readonly [number, number, number];
  /** multiplies the panel's Distort — how far the lumps travel */
  distort: number;
  /** multiplies the panel's Freq — how big the lumps are */
  freq: number;
  /**
   * Radial thorns from thresholded noise, as a fraction of the radius.
   *
   * The one parameter with a rendering cost: thorns are steep, so the raymarcher
   * shortens its stride to match (see stepK in LiquidDna), and it only has 96 of
   * them. Two failure modes if it is pushed, with opposite fixes — speckling on the
   * thorns means the stride is still too long (raise the uSpike term in stepK);
   * thorn TIPS fizzling out or going holey means rays are running out of steps
   * (lower it, or lower the amplitude here).
   */
  spike: number;
  /**
   * The literal object this project melts into, if any. Each has its own SDF in the
   * shader (parameters can deform a sphere; they cannot build a camera), and the
   * clock keeps one eased amount per shape — so moving from one plate to the next
   * fades the first out while the second fades in, both mixed into the blob's own
   * field. The metal always travels THROUGH the blob rather than cutting.
   */
  shape: Shape | null;
};

/** The bespoke fields, in the order the shader mixes them. */
export const SHAPES = ["gavel", "camera", "burger", "vase"] as const;
export type Shape = (typeof SHAPES)[number];

/** Outside the section: the blob is exactly what the panel says it is. */
export const MOOD_REST: Mood = {
  stretch: [1, 1, 1],
  distort: 1,
  freq: 1,
  spike: 0,
  shape: null,
};

/**
 * Keyed by project title rather than index, so reordering `works` cannot silently
 * hand a project someone else's silhouette. The parameters only govern the
 * crossing — once `shape` is fully mixed in, the field IS that object.
 */
export const MOODS: Record<string, Mood> = {
  // 01 — a camera, for a company whose product is photographs
  Pictarine: { stretch: [1, 1, 1], distort: 0.4, freq: 1.0, spike: 0, shape: "camera" },
  // 02 — a judge's gavel, for a platform built for legal work
  Forma: { stretch: [1, 1, 1], distort: 0.5, freq: 1.0, spike: 0, shape: "gavel" },
  // 03 — a burger, for a restaurant ordering dashboard
  "Crazee.B": { stretch: [1.1, 0.8, 1.1], distort: 0.8, freq: 0.9, spike: 0, shape: "burger" },
  // 04 — a Roman amphora, for a pottery workshop
  Klay: { stretch: [1, 1, 1], distort: 0.45, freq: 1.0, spike: 0, shape: "vase" },
};

/** The plate the form should be heading toward right now. */
export const workPlate = {
  mood: MOOD_REST,
  /** the shown plate's title, or "" outside the section */
  title: "",
  /**
   * Signed count of plate changes, i.e. how many full turns the piece owes.
   *
   * The changeover is not just a melt: the piece rolls over once, and the new object
   * comes out of that turn. A COUNT rather than a flag or an angle, so it survives
   * changes that arrive faster than the turn resolves (scrubbing through the band
   * queues them instead of dropping them), and signed so that scrolling back up
   * unwinds the turn rather than adding another one — the same rule as the ambient
   * turntable. The clock owns the easing; nothing here holds an angle.
   */
  turns: 0,
  /**
   * @param step signed distance to the plate being left (+1 going down the band)
   */
  show(title: string, step = 1) {
    if (workPlate.title === title) return;
    // …but only turn when moving BETWEEN plates. Arriving in the section (from ""),
    // the piece is already turning: it has just crossed the stage out of About.
    if (workPlate.title !== "") workPlate.turns += Math.sign(step) || 1;
    workPlate.title = title;
    workPlate.mood = MOODS[title] ?? MOOD_REST;
  },
  clear() {
    if (workPlate.title === "") return;
    workPlate.title = "";
    workPlate.mood = MOOD_REST;
  },
};
