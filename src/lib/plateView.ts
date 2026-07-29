"use client";

/**
 * The work's live measures — the size cap, the worn aspect and the worn hanging size —
 * published each frame by ChromeTableau (which owns the math) for the OTHER mesh that
 * has to wear the work's shape: the skull, whose vertices now carry a seat on the work
 * slab and fly straight into it (see aWork in ChromeSkull). One writer, so the two
 * meshes cannot disagree about the slab they exchange.
 *
 * Local units, before the choreography's scale.
 */
export const plateView = {
  /** the size ceiling (1 unless the viewport binds) × the worn plateScale */
  k: 1,
  /** the aspect the work currently wears (eased — glides at each page turn) */
  asp: 16 / 9,
};
