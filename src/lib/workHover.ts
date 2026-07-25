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
};

/** No row hovered: the blob is exactly what the panel says it is. */
export const MOOD_REST: Mood = { stretch: [1, 1, 1], distort: 1, freq: 1, spike: 0 };

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
  // 01 — a sea urchin: calm base so the thorns are the whole statement
  Pictarine: { stretch: [1, 1, 1], distort: 0.45, freq: 1.0, spike: 0.45 },
  // 02 — a standing column, smooth and tight: the most architectural of the four
  Forma: { stretch: [0.62, 1.55, 0.62], distort: 0.25, freq: 1.8, spike: 0 },
  // 03 — squashed flat and lumpy, wider than it is tall
  "Crazee.B": { stretch: [1.45, 0.55, 1.45], distort: 1.5, freq: 0.7, spike: 0 },
  // 04 — molten: a few enormous slow lobes, barely holding together
  Workshopbya: { stretch: [1.15, 0.95, 1.15], distort: 2.0, freq: 0.42, spike: 0 },
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
