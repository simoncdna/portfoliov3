"use client";

/**
 * The plate's on-screen geometry, published each frame by LiquidDna for anything that
 * has to STAND ON the work without being drawn by its shader — today the mesh frame
 * (ChromeFrame), the way --plate-px-* already serves the DOM's hit link.
 *
 * A mutable singleton like formClock's state: written once per frame by the renderer
 * (which is the only thing that knows the size cap), read by followers. Local units,
 * before the choreography's scale.
 */
export const plateView = {
  /** the size ceiling (uPlateK) — 1 unless the viewport binds */
  k: 1,
  /** the aspect the sheet currently wears (uAspNow — eased, glides between works) */
  asp: 16 / 9,
};
