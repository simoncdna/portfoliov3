"use client";

import { useSyncExternalStore } from "react";

/**
 * Tiny shared store for the live blob controls. The blob (rendered in the fixed
 * ChromeStage) and the ControlPanel / barcode (in the Hero) live in different
 * subtrees, so a module-level subscribable store is the cleanest bridge.
 *
 * The 3D reads values imperatively every frame via `blobTweak.get()` (no React
 * re-render); React components use `useBlobTweak()` (e.g. for `open` and for the
 * particle density, which changes geometry and must re-render).
 */
export type BlobMode = "blob" | "particles" | "wire";

/* ---------------------------------------------------------------------------
 * Shared material constants. The panel drives ONE material shown through three
 * representations, so the mapping from a dial to a physical quantity lives here
 * rather than in each renderer — otherwise the same dial drifts into meaning
 * something different per form (which it did).
 * ------------------------------------------------------------------------- */

/**
 * The Distort dial reads 0..1; every representation multiplies by this cap and
 * treats the result as a fraction of the form's radius. Capped because a
 * noise-displaced SDF stops being a valid distance field as amplitude grows, so
 * past ~0.5 the raymarched form speckles (see stepK in LiquidDna).
 */
export const DISTORT_MAX = 0.5;
/** uTime advance per unit of Speed. Speed 0 must freeze every form completely. */
export const TIME_RATE = 1.3;
/** Idle spin in rad/s per unit of Speed. */
export const SPIN_RATE = 0.7;
/**
 * Radius of the resting sphere, shared by every representation: the liquid's SDF
 * radius, the particle cluster's rest radius, the wireframe's sphere. Noise
 * domains are normalised by it so Freq means the same feature size everywhere.
 */
export const FORM_RADIUS = 2.1;

export type BlobTweak = {
  open: boolean;
  /** blob = solid (hover→particles), particles = always dots, wire = wireframe */
  mode: BlobMode;
  distort: number;
  freq: number;
  speed: number;
  roughness: number;
  particleDetail: number;
  color: string;
};

const DEFAULTS: BlobTweak = {
  open: false,
  mode: "blob",
  distort: 0.42,
  freq: 0.36,
  speed: 0.55,
  roughness: 0.1,
  particleDetail: 75,
  color: "#e6e6e6",
};

let snapshot: BlobTweak = { ...DEFAULTS };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const blobTweak = {
  get: (): BlobTweak => snapshot,
  set: (patch: Partial<BlobTweak>) => {
    snapshot = { ...snapshot, ...patch };
    emit();
  },
  toggle: () => {
    snapshot = { ...snapshot, open: !snapshot.open };
    emit();
  },
  reset: () => {
    snapshot = { ...DEFAULTS, open: snapshot.open };
    emit();
  },
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useBlobTweak(): BlobTweak {
  return useSyncExternalStore(blobTweak.subscribe, blobTweak.get, () => DEFAULTS);
}

/** Subscribe to just `open` (a primitive) → no re-render on other tweaks. */
export function useBlobOpen(): boolean {
  return useSyncExternalStore(
    blobTweak.subscribe,
    () => blobTweak.get().open,
    () => false
  );
}

/** Duration of the panel's reverse "piano" close — kept in sync with the
 *  ControlPanel and the barcode's turn-off timing. */
export const PANEL_CLOSE_MS = 1200;
