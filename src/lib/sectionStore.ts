/**
 * Shared active-section signal + per-section blob "personalities". The blob
 * eases toward the active section's shape so it visibly morphs into a new form
 * as you move Hero → About → Work → Contact (the central scroll actor).
 */
export const sectionStore = { index: 0 };

export type BlobShapeState = {
  distort: number;
  freq: number;
  speed: number;
  scale: number;
  tilt: number; // z-rotation lean
};

// wide contrast between keyframes → the blob visibly transforms as you scroll
export const SECTION_SHAPES: BlobShapeState[] = [
  { distort: 0.2, freq: 0.36, speed: 0.45, scale: 2.15, tilt: 0.0 }, // Hero — calm, rounded, big
  { distort: 0.72, freq: 0.95, speed: 0.9, scale: 1.85, tilt: 0.75 }, // About — flowing, wild, leaning
  { distort: 1.05, freq: 1.7, speed: 1.25, scale: 1.6, tilt: -0.95 }, // Work — agitated, spiky, tight
  { distort: 0.12, freq: 0.28, speed: 0.38, scale: 2.45, tilt: 0.35 }, // Contact — huge, smooth, serene
];

/** blob opacity per section: prominent in the hero, subtle behind body copy */
export const SECTION_OPACITY = [1, 0.4, 0.4, 0.5];
