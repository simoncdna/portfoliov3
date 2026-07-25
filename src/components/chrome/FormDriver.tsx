"use client";

import { useFrame } from "@react-three/fiber";
import { advanceFormClock } from "@/lib/formClock";

type Props = {
  /** 0..1 presence of the About section */
  about?: React.MutableRefObject<number>;
  /** 0..1 presence of the Work section (the right dock) */
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
 * the pinned timeline) and the hovered project's silhouette (workHover). The clock
 * reads both directly.
 */
export function FormDriver({ about, work, scroll, reduced }: Props) {
  useFrame((_, delta) => {
    advanceFormClock(
      delta,
      about?.current ?? 0,
      work?.current ?? 0,
      scroll?.current ?? 0,
      !!reduced
    );
  });
  return null;
}
