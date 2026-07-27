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
 * ONE DEAD END, KEPT HERE SO IT IS NOT RE-TRIED.
 *
 * `visibility: hidden` on the stage instead of pausing it. Fixed the lift and moved the
 * failure: handing the canvas back to the compositor at the END of the lift is when it died
 * instead — a frozen page with no blob on it.
 *
 * AND ONE FALSE CONVICTION, OVERTURNED. Dropping the canvas's dpr during the lift — the blob
 * live from the first frame — worked, and was abandoned because the render came back a little
 * worse on every single open. That degradation was blamed on the buffer reallocation and it
 * was never that: the resume frame was handing formClock the whole pause as one delta, uTime
 * leapt by tens of thousands of seconds, and fp32 noise at those magnitudes quantises into
 * stair-steps. The clock now clamps its delta (see advanceFormClock), the accumulation is
 * gone, and the dpr route is reinstated as "cheap" below: the loop keeps running through the
 * lift at reduced resolution, so the blob never visibly freezes, and the compositor keeps the
 * headroom the pause used to buy. "paused" remains for when the stage is fully covered —
 * a canvas nobody can see has no business rendering at all.
 *
 * A module singleton rather than context: the stage lives in a different subtree from the
 * menu, and there is exactly one page.
 */
export type StageLoad = "live" | "cheap" | "paused";

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
