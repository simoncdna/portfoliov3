"use client";

/**
 * Which project the cursor is on, and what that does to the matter.
 *
 * The Work section docks the blob on the RIGHT and lists the projects on the
 * left; hovering a row reshapes the blob. Rather than swapping in a different
 * object per project — the mistake the skull forced us into — each project is a
 * set of *parameters* of the one blob field: how it is stretched, how lumpy, at
 * what scale, and whether it grows thorns. So every project is reachable from
 * every other by a true melt, and the control panel still governs the base look
 * (the multipliers multiply its values rather than replacing them).
 *
 * Where a project calls for a literal object rather than a mood — Forma's gavel —
 * it brings its own distance field, and that field is MIXED into the blob's rather
 * than replacing it. Same principle: mixing two distance fields is what melting
 * is, so the metal flows into the shape and back out of it.
 *
 * A plain mutable singleton (like aboutReveal / sectionStore): written by the
 * project rows on hover/focus, eased and read every frame by the form clock.
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
   * (lower it, or lower the amplitude here). At 0.45 there is comfortable margin
   * for both.
   */
  spike: number;
  /**
   * The literal object this project melts into, if any. Each has its own SDF in the
   * shader (parameters can deform a sphere; they cannot build a camera), and the
   * clock keeps one eased amount per shape — so moving from one project to the next
   * fades the first out while the second fades in, both mixed into the blob's own
   * field. The metal always travels THROUGH the blob rather than cutting.
   */
  shape: Shape | null;
};

/** The bespoke fields, in the order the shader mixes them. */
export const SHAPES = ["gavel", "camera", "burger", "vase"] as const;
export type Shape = (typeof SHAPES)[number];

/** No row hovered: the blob is exactly what the panel says it is. */
export const MOOD_REST: Mood = {
  stretch: [1, 1, 1],
  distort: 1,
  freq: 1,
  spike: 0,
  shape: null,
};

/**
 * Keyed by project title rather than index, so reordering `works` cannot silently
 * hand a project someone else's silhouette.
 *
 * These are deliberately FAR apart. A subtle set reads as the blob wobbling rather
 * than as four distinct states — the whole interaction only works if you can tell,
 * without looking back at the list, which row the cursor is on. So each one takes a
 * different lever to its limit: thorns, one axis, the opposite axis, amplitude.
 */
export const MOODS: Record<string, Mood> = {
  // Each project melts into its own subject. The parameters only govern the
  // crossing — once `shape` is fully mixed in, the field IS that object.
  //
  // 01 — a camera, for a company whose product is photographs
  Pictarine: { stretch: [1, 1, 1], distort: 0.4, freq: 1.0, spike: 0, shape: "camera" },
  // 02 — a judge's gavel, for a platform built for legal work
  Forma: { stretch: [1, 1, 1], distort: 0.5, freq: 1.0, spike: 0, shape: "gavel" },
  // 03 — a burger, for a restaurant ordering dashboard
  "Crazee.B": { stretch: [1.1, 0.8, 1.1], distort: 0.8, freq: 0.9, spike: 0, shape: "burger" },
  // 04 — a Roman amphora, for a pottery workshop
  Klay: { stretch: [1, 1, 1], distort: 0.45, freq: 1.0, spike: 0, shape: "vase" },
};

/** The mood the form should be heading toward right now. */
export const workHover = {
  mood: MOOD_REST,
  /** which title is lit, for the DOM's own styling needs ("" = none) */
  title: "",
  enter(title: string) {
    workHover.title = title;
    workHover.mood = MOODS[title] ?? MOOD_REST;
  },
  leave(title?: string) {
    // Ignore a stale leave: pointer-out of row A can arrive after pointer-in on
    // row B, which would otherwise drop the blob back to rest mid-slide.
    if (title && workHover.title !== title) return;
    workHover.title = "";
    workHover.mood = MOOD_REST;
  },
};
