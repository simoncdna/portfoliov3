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
  freq: 0.5,
  speed: 0.5,
  roughness: 0.12,
  particleDetail: 56,
  color: "#cbccca",
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
