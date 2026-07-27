"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the chrome stage's render loop is running.
 *
 * WHY THIS EXISTS — it is a rendering fix, not an optimisation.
 *
 * Lifting the section menu's full-screen curtain off the page froze the browser: frames
 * stopped, the transition stalled a couple of hundred pixels in, and the panel blinked out
 * instead of rising. Bisected by lifting a bare full-screen opaque div and counting frames:
 *
 *   as shipped                    5 frames — stuck 215px into an 861px lift
 *   paper grain disabled          5 frames — stuck, so the grain is innocent
 *   chrome canvas taken out      87 frames — completes
 *
 * The cause is not that the canvas is *visible*, it is that it **repaints every frame**. A
 * full-screen WebGL surface producing a new texture on every frame, composited against a
 * full-screen layer that is itself moving every frame, starves the compositor. Covering it is
 * cheap, which is why only the menu's EXIT ever broke.
 *
 * So the loop stops rather than the layer hiding. A static canvas gives the compositor a
 * texture it can simply reuse, and the curtain slides over a cached bitmap. Nothing is
 * unmounted: the scene, the geometry and every uniform survive, and three.js picks up exactly
 * where it left off.
 *
 * TWO DEAD ENDS, KEPT HERE SO THEY ARE NOT RE-TRIED.
 *
 * `visibility: hidden` on the stage instead of pausing it. Fixed the lift and moved the
 * failure: handing the canvas back to the compositor at the END of the lift is when it died
 * instead — a frozen page with no blob on it.
 *
 * Dropping the canvas's dpr during the lift, so the blob could stay live from the first frame
 * rather than waiting. It worked, and it degraded the render slightly more on every single
 * open. The canvas's dimensions did come back each cycle, so resolution was not what
 * accumulated — something downstream of making three.js reallocate its buffers was. Pausing
 * changes no renderer state at all, which is exactly why it is the one that survives.
 *
 * A module singleton rather than context: the stage lives in a different subtree from the
 * menu, and there is exactly one page.
 */
export type StageLoad = "live" | "paused";

let load: StageLoad = "live";
const listeners = new Set<() => void>();

export const stageLoad = {
  get: () => load,
  set: (next: StageLoad) => {
    if (load === next) return;
    load = next;
    listeners.forEach((l) => l());
  },
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

/** Server snapshot is always "live" — the stage renders normally until told otherwise. */
export function useStageLoad(): StageLoad {
  return useSyncExternalStore(stageLoad.subscribe, stageLoad.get, () => "live");
}
