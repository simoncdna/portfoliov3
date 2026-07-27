"use client";

/**
 * The Work section's plates: the sheet's matter and the print's exposure, as one documented set
 * of numbers.
 *
 * It was a live store written by a dev panel of sliders, which is how these values were found —
 * that panel's whole purpose was to end with numbers in the source rather than a panel someone
 * has to re-dial, and this is that end. The store went with it: with nothing writing it,
 * subscribe/set/reset were an editing mechanism nobody could reach.
 *
 * Read imperatively once per frame by LiquidDna. Every field lands on a uniform, so changing one
 * here changes the look on the next frame and recompiles nothing.
 */

export type PlateLook = {
  /** how deep the cloth swings, local units (FLAG_AMP) — 0 = a dead flat sheet */
  flagAmp: number;
  /** multiplies the travelling wave's rate — the wind's strength, not its amplitude */
  wind: number;
  /** the liquid relief kept at rest, world units. Ceiling is the plate's half-thickness
   *  (0.16): past it the waves pinch holes through the sheet. */
  relief: number;
  /** how far the surface's tilt drags the picture (uv) */
  warp: number;
  /**
   * Scales the liquid → cloth crossing. 1 = the section's own choreography decides (cloth
   * at rest, liquid while a plate crosses the screen); 0 pins the sheet to liquid metal
   * for good. A tuning override, not a state: it multiplies, it does not replace.
   */
  cloth: number;
  /* --- the print ----------------------------------------------------------------- */
  /**
   * The emulsion's own level: what the photograph is worth before the room touches it.
   *
   * `sheen` is how much the metal's reflection modulates it on top, and `gloss` how much
   * of the raw reflection is left over the picture. Those last two ARE the shine: a cloth
   * banner should barely have any (it is fabric), whereas liquid metal wants plenty. They
   * default low because the flag read as a mirror with a photo printed on it — turn them
   * up to get chrome back.
   */
  exposure: number;
  sheen: number;
  gloss: number;
  /**
   * How much the wave's own geometry shades the print — matte, no reflection involved.
   *
   * This is what makes the wind VISIBLE once sheen and gloss are at zero, which is where
   * they belong for a photograph: they were the only other terms that depended on the
   * surface, so without either the sheet undulated and looked like a flat rectangle. Turn
   * this down instead and the picture goes evenly lit, wave or no wave.
   */
  shade: number;
  /** contrast curve about mid-grey — a flat scan reads as fog */
  contrast: number;
  /**
   * How much colour the hover gives back, 0..1 — the ceiling on the gesture, not the gesture
   * itself (that is `mood.hover` in the clock, and it is what actually moves). At 1 the
   * picture goes fully to the file's own colour; lower it for a print that only warms up.
   */
  colour: number;
  /**
   * Chromatic aberration: how far the three channels are pulled apart at the picture's
   * corners, in uv. This is the plate's "glass" now that the sheet is flat — a red edge on one
   * side of a contour, a cyan one on the other, growing from nothing at the centre.
   *
   * 0.006 is about 4px on a 700px-wide picture: visible on contours, invisible on flat areas.
   * Past ~0.02 it stops reading as an optic and starts reading as a broken video signal.
   */
  aber: number;
  /**
   * How much smaller the neighbouring projects are drawn, 0..1 — the gallery's only depth cue
   * now that nothing is tilted or deformed. 0 hangs all four at the same size, which reads as a
   * filmstrip; 0.45 leaves a neighbour at 55% of the shown plate — a sliver at the edge of the
   * screen (see the packing in LiquidDna), clearly subordinate, clearly a next page.
   */
  shrink: number;
};

/**
 * Tuned on the real thing (Simon, 27/07). No sheen and no gloss at all — the plate is a
 * photographic print, not a mirror — no liquid relief either, and the modelling left
 * entirely to `shade`, kept low: the picture is the subject, not the metal.
 *
 * THE PICTURE IS FLAT, AND NOTHING IS DONE TO IT. Every effect that touched it is at zero:
 * `flagAmp` (the wave), `relief` (the liquid), `warp` (the drag along the surface), `aber` (the
 * chromatic split), `sheen` and `gloss` (the reflection). The sway went too — see formClock —
 * so the plate faces the camera square and projects as a true rectangle. What is left is a
 * photograph, greyscaled, at an exposure and a contrast, which is the whole brief.
 *
 * All of it is still wired and tuned, and each is one number away from coming back: the wave
 * (with `cloth` and `wind` as the settings it had, ~0.45 local units of depth — it read as
 * cloth being shaken), and the glass (`aber` at 0.006, a lens-like split that survives in
 * monochrome as a red/cyan fringe). The shader skips each one whose amplitude is zero, so
 * carrying them costs nothing per frame.
 */
export const PLATE_LOOK: PlateLook = {
  flagAmp: 0,
  wind: 0.4,
  relief: 0,
  warp: 0,
  cloth: 0.16,
  exposure: 0.89,
  sheen: 0,
  gloss: 0,
  shade: 0,
  contrast: 1.03,
  colour: 1,
  aber: 0,
  shrink: 0.45,
};

