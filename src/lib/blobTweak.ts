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

/**
 * Whether the instrumentation has been ASKED for yet — the barcode hovered,
 * focused or clicked.
 *
 * The panel is an easter egg: a cipher on a barcode that most visitors never read,
 * let alone click. What hangs off this flag is the two ALTERNATIVE REPRESENTATIONS
 * of the form, which nothing but the panel's Form switch can ever select — and which
 * were being built on every page load for a switch nobody had touched:
 *
 *  - MeshDna, a 22 848-vertex line geometry;
 *  - DnaParticles, a MeshSurfaceSampler run over the whole skull.
 *
 * Both bail out on their first frame when their mode is not selected, so they drew
 * nothing; they simply cost their construction. They are mounted from this flag
 * instead — see ChromeCanvas. Nothing is lost: with the panel untouched, `mode` can
 * never leave "blob".
 *
 * Armed on HOVER rather than on click (see Hero's barcode), because hovering is what
 * reveals the word TWEAK — so the construction lands a beat before the panel can be
 * open, rather than in the middle of a form crossfade. One-way: nothing disarms it.
 *
 * Kept out of BlobTweak on purpose: it is not a dial, and `reset()` must not reach it.
 */
let armed = false;

export const blobTweak = {
  get: (): BlobTweak => snapshot,
  set: (patch: Partial<BlobTweak>) => {
    snapshot = { ...snapshot, ...patch };
    emit();
  },
  /** The panel has been reached for — mount it and what it drives. One-way. */
  arm: () => {
    if (armed) return;
    armed = true;
    emit();
  },
  armed: () => armed,
  toggle: () => {
    armed = true;
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

/**
 * Subscribe to just `armed` — see the flag above. Always false on the server, so
 * nothing the panel drives is in the prerendered HTML.
 */
export function useBlobArmed(): boolean {
  return useSyncExternalStore(blobTweak.subscribe, blobTweak.armed, () => false);
}

/**
 * How long the panel's reverse "piano" close takes — the one number three separate
 * things wait on, so it lives here rather than in any of them:
 *
 *  - ControlPanel hides the panel and resets its gauges once it elapses;
 *  - BarcodeEAN13 keeps TWEAK lit for PANEL_CLOSE_MS - 250 (its CLOSE_GRACE_MS), so
 *    the cipher does not go dark while the panel is still on screen;
 *  - SmoothScroll hands the page back to Lenis, so it cannot start moving under a
 *    panel that is still retracting.
 *
 * 380, down from 1200. It has to be at least as long as the retract itself, and the
 * retract used to be the opening cascade played backwards: (n-1)·100 + 460 ≈ 1160 ms
 * of watching rows you are done with leave one at a time, which made the ✕ feel
 * unresponsive. The close has its own, much brisker pace now — see CLOSE_STAGGER /
 * CLOSE_REVEAL in ControlPanel, 344 ms to the last row leaving — and this is that
 * plus a couple of frames of margin.
 *
 * Keep it ≥ the retract, and comfortably > 250: shorter than the retract and the
 * panel is cut off mid-cascade, and the barcode's grace above is derived by
 * subtracting 250 from this, so it must stay positive.
 */
export const PANEL_CLOSE_MS = 380;
