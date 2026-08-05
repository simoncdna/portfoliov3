"use client";

import { useFrame } from "@react-three/fiber";
import { advanceFormClock, formState } from "@/lib/formClock";

type Props = {
  /** 0..1 presence of the About section */
  about?: React.MutableRefObject<number>;
  /** 0..1 presence of the Work section (the piece on display, centre stage) */
  work?: React.MutableRefObject<number>;
  /** whole-page scroll fraction 0..1 */
  scroll?: React.MutableRefObject<number>;
  reduced?: boolean;
};

/**
 * Advances the shared form clock, once per frame.
 *
 * Mounted ahead of the forms so they read a value that is already current; the
 * point is less the ordering than that there is exactly one integration — see
 * formClock for what private clocks cost.
 *
 * Two things are deliberately NOT props, because they are written by the DOM at a
 * finer grain than a scroll position: the About exit (scrubbed into aboutReveal by
 * the pinned timeline), Work's putting-away (workReveal) and the shown plate's
 * silhouette (workPlate). The clock reads all three directly.
 */
export function FormDriver({ about, work, scroll, reduced }: Props) {
  useFrame(({ camera }, delta) => {
    advanceFormClock(
      delta,
      about?.current ?? 0,
      work?.current ?? 0,
      scroll?.current ?? 0,
      !!reduced
    );
    // LA CAMÉRA EST ÉCRITE ICI, et nulle part ailleurs.
    //
    // Après l'horloge et avant les formes : c'est le contrat de ce composant, et le
    // raymarcher en profite gratuitement — il copie uCamPos/uCamRot depuis la caméra
    // vivante à chaque frame, donc il suit sans une ligne de plus.
    const s = formState();
    camera.position.set(s.camX, s.camY, s.camZ);
    // La perspective ne change pas toute seule : le fov n'entre dans la matrice de
    // projection qu'une fois recalculée. Sans ceci, dialer le fov ne fait rien du tout —
    // et c'est le genre d'oubli qui se diagnostique en une heure.
    const cam = camera as typeof camera & { fov?: number };
    if (cam.fov !== undefined && cam.fov !== s.camFov) {
      cam.fov = s.camFov;
      camera.updateProjectionMatrix();
    }
  });
  return null;
}
