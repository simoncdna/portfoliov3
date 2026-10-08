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
 * SO "cheap" KEEPS THE LOOP ALIVE AND TAKES THE HEADROOM OUT OF THE CADENCE. Full resolution,
 * but at most one drawn frame per CHEAP_FRAME_MS (see ChromeCanvas) instead of one per screen
 * refresh: the canvas stops handing the compositor a new texture on every single frame, which
 * is the sentence above, while the form keeps moving so nothing ever visibly freezes.
 * "paused" remains for when the stage is fully covered — a canvas nobody can see has no
 * business rendering at all.
 *
 * ET CE N'EST PAS LA RÉSOLUTION QUI PAIE, DÉLIBÉRÉMENT. Baisser le dpr le temps de la levée
 * marche aussi, et c'est une mitigation de performance qui touche à l'image : la salle des
 * projets convertit des unités monde en pixels pour dimensionner ses grains, donc ses
 * particules grandissaient à l'écran quand le tampon rétrécissait — mesuré ×1,75 en diamètre,
 * ×3,06 en surface — et un nuage additif réglé sur la somme des recouvrements s'allumait le
 * temps du plan, puis retombait. La règle qu'il faut garder : ON ACHÈTE LA MARGE SUR CE QUE
 * L'ŒIL NE VOIT PAS. Une cadence bridée sous un plan noir qui monte ne se voit pas ; un
 * changement de résolution, si — soit par la netteté, soit, comme ici, par un réglage
 * artistique qui en dépendait sans le dire.
 *
 * UNE FAUSSE CONVICTION, RENVERSÉE, à connaître avant de retoucher ceci. La route dpr avait
 * été essayée puis abandonnée pour un rendu qui revenait dégradé à chaque ouverture, et la
 * réallocation du tampon avait été accusée. Ce n'était pas elle : l'image de reprise passait
 * toute la pause à formClock comme un seul delta, uTime bondissait de dizaines de milliers de
 * secondes, et le bruit fp32 à ces magnitudes se quantifiait en marches d'escalier. L'horloge
 * borne désormais son delta (voir advanceFormClock). Ce n'est donc pas ce défaut-là qui écarte
 * la résolution, c'est le paragraphe au-dessus.
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
