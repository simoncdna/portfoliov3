"use client";

import { useSyncExternalStore } from "react";

/**
 * DEV STORE — the toile's arrival, as live dials. Same contract as the plate panel
 * that found PLATE_LOOK's numbers (see plateLook.ts): this exists to END as numbers
 * in the source, then be deleted. Read imperatively once per frame by ChromeTableau
 * and the clock; written only by ToileDevPanel.
 */
export type ToileTweak = {
  /**
   * The canvas's seat, as a factor on its built size. 1 = the slab as built, with
   * the liner band (LINER_W) of bare chrome between the picture and the moulding;
   * ~1.041 walks the picture's edge to the moulding — collée au cadre.
   */
  fit: number;
  /** Time the fade takes to reach 90%, seconds. */
  secs: number;
  /**
   * Where in the arrival the picture reaches full density, 0..1 of dev. 1 = the
   * plain fade; lower = the picture is opaque early and the tail is settling only.
   */
  ramp: number;
  /** How far behind the frame the toile starts, as a uv zoom amplitude. 0 = off. */
  recul: number;
  /** How deep the frame's shadow dims the toile while it travels. 0 = off. */
  ombre: number;
  /** Manual turntable, DEGREES added to the work's spin — to inspect it at an angle. */
  turn: number;
  /**
   * The moulding's width, as a factor on FRAME_W. Above 1 the frame grows fatter and
   * the size cap rescales the whole work down to fit — the net read is a SMALLER toile
   * in a more massive frame. Rebuilds the frame geometry (debounced in ChromeTableau).
   */
  cadre: number;
  /** Bumped by replay(): the clock rewinds dev to 0 so the arrival plays again. */
  replayNonce: number;
};

const DEFAULTS: Omit<ToileTweak, "replayNonce"> = {
  fit: 1,
  secs: 1,
  ramp: 1,
  recul: 0,
  ombre: 0,
  turn: 0,
  cadre: 1,
};

let state: ToileTweak = { ...DEFAULTS, replayNonce: 0 };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export const toileTweak = {
  get: (): ToileTweak => state,
  set(patch: Partial<ToileTweak>) {
    state = { ...state, ...patch };
    emit();
  },
  replay() {
    state = { ...state, replayNonce: state.replayNonce + 1 };
    emit();
  },
  reset() {
    state = { ...DEFAULTS, replayNonce: state.replayNonce };
    emit();
  },
  subscribe(fn: () => void) {
    subs.add(fn);
    return () => {
      subs.delete(fn);
    };
  },
};

export function useToileTweak(): ToileTweak {
  return useSyncExternalStore(toileTweak.subscribe, toileTweak.get, toileTweak.get);
}
